import { collection, addDoc, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { User } from "firebase/auth";

export interface SocialConnection {
  userId: string;
  displayName: string;
  photoURL?: string;
  email: string;
  status: 'pending' | 'accepted' | 'blocked';
}

export class SocialManager {
  private db;

  constructor(db: any) {
    this.db = db;
  }

  // Share location to social media
  async shareToSocialMedia(
    platform: 'facebook' | 'twitter' | 'instagram' | 'whatsapp',
    locationName: string,
    locationUrl: string,
    _imageUrl?: string
  ) {
    const text = `Check out this amazing place: ${locationName}! ${locationUrl}`;
    let shareUrl = '';

    switch (platform) {
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(locationUrl)}`;
        break;
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(locationUrl)}`;
        break;
      case 'instagram':
        // Instagram doesn't support direct URL sharing, so we copy to clipboard
        await navigator.clipboard.writeText(`${text}\n${locationUrl}`);
        alert('Content copied to clipboard! Paste it in your Instagram post.');
        return;
      case 'whatsapp':
        shareUrl = `https://wa.me/?text=${encodeURIComponent(text + ' ' + locationUrl)}`;
        break;
    }

    window.open(shareUrl, '_blank', 'width=600,height=400');
  }

  // Send connection request
  async sendConnectionRequest(user: User, targetUserId: string) {
    try {
      await addDoc(collection(this.db, 'connections'), {
        fromUserId: user.uid,
        toUserId: targetUserId,
        status: 'pending',
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Error sending connection request:', error);
      throw error;
    }
  }

  // Accept connection request
  async acceptConnection(connectionId: string) {
    try {
      await updateDoc(doc(this.db, 'connections', connectionId), {
        status: 'accepted'
      });
    } catch (error) {
      console.error('Error accepting connection:', error);
      throw error;
    }
  }

  // Get user connections
  async getUserConnections(userId: string): Promise<SocialConnection[]> {
    try {
      const q = query(
        collection(this.db, 'connections'),
        where('fromUserId', '==', userId)
      );
      const snapshot = await getDocs(q);
      
      const connections: SocialConnection[] = [];
      // In a real app, you'd fetch user details from users collection
      snapshot.forEach((doc) => {
        connections.push({
          userId: doc.data().toUserId,
          displayName: 'User', // Would fetch from users collection
          status: doc.data().status
        } as SocialConnection);
      });
      
      return connections;
    } catch (error) {
      console.error('Error getting connections:', error);
      return [];
    }
  }

  // Share trip with connection
  async shareTrip(user: User, connectionId: string, tripData: any) {
    try {
      await addDoc(collection(this.db, 'sharedTrips'), {
        fromUserId: user.uid,
        toUserId: connectionId,
        tripData,
        sharedAt: new Date()
      });
    } catch (error) {
      console.error('Error sharing trip:', error);
      throw error;
    }
  }
}

