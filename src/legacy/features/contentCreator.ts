import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { User } from "firebase/auth";

export interface ContentTemplate {
  id?: string;
  name: string;
  platform: 'instagram' | 'facebook' | 'twitter' | 'tiktok' | 'youtube';
  style: string;
  duration?: number; // For videos
  aspectRatio: string;
  maxLength?: number; // For text
}

export interface GeneratedContent {
  id?: string;
  userId: string;
  type: 'image' | 'video' | 'text' | 'carousel';
  platform: string;
  content: string; // URL or text
  caption?: string;
  hashtags?: string[];
  templateId?: string;
  createdAt: Date;
}

export class ContentCreator {
  private db;
  private functions;

  constructor(db: any, functions: any) {
    this.db = db;
    this.functions = functions;
  }

  // Generate content from user media
  async generateContent(
    user: User,
    mediaFiles: File[],
    platform: ContentTemplate['platform'],
    templateId?: string,
    style?: string
  ): Promise<GeneratedContent[]> {
    try {
      const generateContent = httpsCallable(this.functions, 'generateContent');
      
      // Convert files to base64
      const mediaData = await Promise.all(
        mediaFiles.map(async (file) => {
          const base64 = await this.fileToBase64(file);
          return {
            data: base64,
            mimeType: file.type,
            name: file.name
          };
        })
      );

      const response: any = await generateContent({
        media: mediaData,
        platform,
        templateId,
        style,
        userId: user.uid
      });

      // Save generated content
      const savedContent: GeneratedContent[] = [];
      for (const content of response.data.contents) {
        const docRef = await addDoc(collection(this.db, 'generatedContent'), {
          userId: user.uid,
          ...content,
          createdAt: new Date()
        });
        savedContent.push({
          id: docRef.id,
          ...content,
          createdAt: new Date()
        });
      }

      return savedContent;
    } catch (error) {
      console.error('Error generating content:', error);
      throw error;
    }
  }

  // Get content templates
  async getTemplates(platform?: ContentTemplate['platform']): Promise<ContentTemplate[]> {
    try {
      let q = query(collection(this.db, 'contentTemplates'));
      if (platform) {
        q = query(
          collection(this.db, 'contentTemplates'),
          where('platform', '==', platform)
        );
      }

      const snapshot = await getDocs(q);
      const templates: ContentTemplate[] = [];
      
      snapshot.forEach((doc) => {
        templates.push({
          id: doc.id,
          ...doc.data()
        } as ContentTemplate);
      });

      return templates;
    } catch (error) {
      console.error('Error getting templates:', error);
      return this.getDefaultTemplates(platform);
    }
  }

  // Get default templates
  private getDefaultTemplates(platform?: ContentTemplate['platform']): ContentTemplate[] {
    const defaults: ContentTemplate[] = [
      {
        name: 'Instagram Post',
        platform: 'instagram',
        style: 'modern, vibrant, travel-focused',
        aspectRatio: '1:1',
        maxLength: 2200
      },
      {
        name: 'Instagram Story',
        platform: 'instagram',
        style: 'casual, authentic',
        aspectRatio: '9:16',
        maxLength: 100
      },
      {
        name: 'Facebook Post',
        platform: 'facebook',
        style: 'informative, engaging',
        aspectRatio: '16:9',
        maxLength: 5000
      },
      {
        name: 'Twitter Post',
        platform: 'twitter',
        style: 'concise, witty',
        aspectRatio: '16:9',
        maxLength: 280
      },
      {
        name: 'TikTok Video',
        platform: 'tiktok',
        style: 'trendy, energetic',
        aspectRatio: '9:16',
        duration: 60
      }
    ];

    if (platform) {
      return defaults.filter(t => t.platform === platform);
    }
    return defaults;
  }

  // Get user's generated content
  async getUserContent(userId: string): Promise<GeneratedContent[]> {
    try {
      const q = query(
        collection(this.db, 'generatedContent'),
        where('userId', '==', userId)
      );
      
      const snapshot = await getDocs(q);
      const contents: GeneratedContent[] = [];
      
      snapshot.forEach((doc) => {
        const data = doc.data();
        contents.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date()
        } as GeneratedContent);
      });

      return contents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    } catch (error) {
      console.error('Error getting user content:', error);
      return [];
    }
  }

  // Download content
  downloadContent(content: GeneratedContent) {
    if (content.type === 'text') {
      const blob = new Blob([content.content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `content-${content.id}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      window.open(content.content, '_blank');
    }
  }

  // Copy to clipboard
  async copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
    }
  }

  // Helper: Convert file to base64
  private fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

