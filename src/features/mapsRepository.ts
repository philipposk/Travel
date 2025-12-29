import { collection, addDoc, getDocs, query, where, doc, deleteDoc, updateDoc } from "firebase/firestore";
import { User } from "firebase/auth";

export interface SavedMap {
  id?: string;
  userId: string;
  title: string;
  description?: string;
  center: google.maps.LatLngLiteral;
  zoom: number;
  markers: Array<{
    position: google.maps.LatLngLiteral;
    title: string;
    description?: string;
  }>;
  places: Array<{
    placeId: string;
    name: string;
    type: string;
  }>;
  createdAt: Date;
  updatedAt: Date;
  isPublic: boolean;
}

export class MapsRepository {
  private db;
  private map: google.maps.Map | null = null;

  constructor(db: any) {
    this.db = db;
  }

  setMap(map: google.maps.Map) {
    this.map = map;
  }

  // Save current map state
  async saveMap(user: User, title: string, description?: string, isPublic: boolean = false): Promise<string> {
    if (!this.map) {
      throw new Error('Map not initialized');
    }

    const center = this.map.getCenter();
    if (!center) {
      throw new Error('Map center not available');
    }

    const mapData: Omit<SavedMap, 'id'> = {
      userId: user.uid,
      title,
      description,
      center: { lat: center.lat(), lng: center.lng() },
      zoom: this.map.getZoom() || 12,
      markers: [], // Would extract from map markers
      places: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      isPublic
    };

    try {
      const docRef = await addDoc(collection(this.db, 'maps'), mapData);
      return docRef.id;
    } catch (error) {
      console.error('Error saving map:', error);
      throw error;
    }
  }

  // Load saved map
  async loadMap(mapId: string): Promise<SavedMap | null> {
    try {
      const mapDoc = await getDocs(query(
        collection(this.db, 'maps'),
        where('__name__', '==', mapId)
      ));
      
      if (mapDoc.empty) {
        return null;
      }

      const data = mapDoc.docs[0].data();
      return {
        id: mapDoc.docs[0].id,
        ...data,
        createdAt: data.createdAt?.toDate() || new Date(),
        updatedAt: data.updatedAt?.toDate() || new Date()
      } as SavedMap;
    } catch (error) {
      console.error('Error loading map:', error);
      return null;
    }
  }

  // Get user's saved maps
  async getUserMaps(userId: string): Promise<SavedMap[]> {
    try {
      const q = query(
        collection(this.db, 'maps'),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);
      
      const maps: SavedMap[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        maps.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as SavedMap);
      });
      
      return maps.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (error) {
      console.error('Error getting user maps:', error);
      return [];
    }
  }

  // Get public maps
  async getPublicMaps(): Promise<SavedMap[]> {
    try {
      const q = query(
        collection(this.db, 'maps'),
        where('isPublic', '==', true)
      );
      const snapshot = await getDocs(q);
      
      const maps: SavedMap[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        maps.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt?.toDate() || new Date(),
          updatedAt: data.updatedAt?.toDate() || new Date()
        } as SavedMap);
      });
      
      return maps.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    } catch (error) {
      console.error('Error getting public maps:', error);
      return [];
    }
  }

  // Open map in Google Maps
  openInGoogleMaps(map: SavedMap) {
    const url = `https://www.google.com/maps/search/?api=1&query=${map.center.lat},${map.center.lng}&zoom=${map.zoom}`;
    window.open(url, '_blank');
  }

  // Delete map
  async deleteMap(mapId: string) {
    try {
      await deleteDoc(doc(this.db, 'maps', mapId));
    } catch (error) {
      console.error('Error deleting map:', error);
      throw error;
    }
  }

  // Update map
  async updateMap(mapId: string, updates: Partial<SavedMap>) {
    try {
      await updateDoc(doc(this.db, 'maps', mapId), {
        ...updates,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error updating map:', error);
      throw error;
    }
  }
}

