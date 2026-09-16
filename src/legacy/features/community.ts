import { collection, addDoc, getDocs, query, where, orderBy, limit, doc, updateDoc, increment } from "firebase/firestore";
import { User } from "firebase/auth";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ForumPost {
  id?: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  title: string;
  content: string;
  location?: string;
  tags: string[];
  likes: number;
  replies: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Review {
  id?: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  location: string;
  rating: number; // 1-5
  title: string;
  content: string;
  images?: string[];
  helpful: number;
  createdAt: Date;
}

export interface Message {
  id?: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  isRead: boolean;
  createdAt: Date;
}

export class CommunityManager {
  private db;
  private genAI: GoogleGenerativeAI;

  constructor(db: any, geminiApiKey: string) {
    this.db = db;
    this.genAI = new GoogleGenerativeAI(geminiApiKey);
  }

  // Create forum post
  async createPost(user: User, title: string, content: string, location?: string, tags: string[] = []): Promise<string> {
    try {
      const postData: Omit<ForumPost, 'id'> = {
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        userPhoto: user.photoURL || undefined,
        title,
        content,
        location,
        tags,
        likes: 0,
        replies: 0,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const docRef = await addDoc(collection(this.db, 'forum'), postData);
      return docRef.id;
    } catch (error) {
      console.error('Error creating post:', error);
      throw error;
    }
  }

  // Get forum posts
  async getPosts(location?: string, limitCount: number = 20): Promise<ForumPost[]> {
    try {
      let q = query(
        collection(this.db, 'forum'),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      if (location) {
        q = query(
          collection(this.db, 'forum'),
          where('location', '==', location),
          orderBy('createdAt', 'desc'),
          limit(limitCount)
        );
      }

      const snapshot = await getDocs(q);
      const posts: ForumPost[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        posts.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as ForumPost);
      });

      return posts;
    } catch (error) {
      console.error('Error getting posts:', error);
      return [];
    }
  }

  // Like a post
  async likePost(postId: string, userId: string) {
    try {
      const postRef = doc(this.db, 'forum', postId);
      await updateDoc(postRef, {
        likes: increment(1)
      });
      
      // Track who liked it
      await addDoc(collection(this.db, 'postLikes'), {
        postId,
        userId,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Error liking post:', error);
    }
  }

  // Create review
  async createReview(user: User, location: string, rating: number, title: string, content: string, images?: string[]): Promise<string> {
    try {
      const reviewData: Omit<Review, 'id'> = {
        userId: user.uid,
        userName: user.displayName || 'Anonymous',
        userPhoto: user.photoURL || undefined,
        location,
        rating,
        title,
        content,
        images,
        helpful: 0,
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(this.db, 'reviews'), reviewData);
      return docRef.id;
    } catch (error) {
      console.error('Error creating review:', error);
      throw error;
    }
  }

  // Get reviews for a location
  async getReviews(location: string): Promise<Review[]> {
    try {
      const q = query(
        collection(this.db, 'reviews'),
        where('location', '==', location),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const reviews: Review[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        reviews.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date()
        } as Review);
      });

      return reviews;
    } catch (error) {
      console.error('Error getting reviews:', error);
      return [];
    }
  }

  // Send message
  async sendMessage(fromUser: User, toUserId: string, content: string): Promise<string> {
    try {
      const messageData: Omit<Message, 'id'> = {
        fromUserId: fromUser.uid,
        toUserId,
        content,
        isRead: false,
        createdAt: new Date()
      };

      const docRef = await addDoc(collection(this.db, 'messages'), messageData);
      return docRef.id;
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  // Get messages for user
  async getMessages(userId: string): Promise<Message[]> {
    try {
      const q = query(
        collection(this.db, 'messages'),
        where('toUserId', '==', userId),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const messages: Message[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        messages.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date()
        } as Message);
      });

      return messages;
    } catch (error) {
      console.error('Error getting messages:', error);
      return [];
    }
  }

  // Chat with AI
  async chatWithAI(userMessage: string, context?: string): Promise<string> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      const prompt = context 
        ? `You are a helpful travel assistant. Context: ${context}\n\nUser: ${userMessage}\n\nAssistant:`
        : `You are a helpful travel assistant. Answer the user's question: ${userMessage}`;
      
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Error chatting with AI:', error);
      return 'Sorry, I encountered an error. Please try again.';
    }
  }
}

