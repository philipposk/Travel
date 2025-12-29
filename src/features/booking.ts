import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { User } from "firebase/auth";

export interface BookingSearch {
  type: 'flight' | 'hotel' | 'car' | 'tour' | 'event' | 'airbnb';
  destination: string;
  checkIn?: string;
  checkOut?: string;
  passengers?: number;
  rooms?: number;
  budget?: {
    min?: number;
    max?: number;
    currency: string;
  };
}

export interface BookingResult {
  provider: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  imageUrl?: string;
  rating?: number;
  reviews?: number;
  description?: string;
  isVerified: boolean;
  scamScore?: number; // 0-100, lower is better
}

export class BookingManager {
  private db;
  private functions;

  constructor(db: any, functions: any) {
    this.db = db;
    this.functions = functions;
  }

  // Search for bookings using AI
  async searchBookings(searchParams: BookingSearch): Promise<BookingResult[]> {
    try {
      const searchBookings = httpsCallable(this.functions, 'searchBookings');
      const response: any = await searchBookings(searchParams);
      return response.data.results || [];
    } catch (error) {
      console.error('Error searching bookings:', error);
      throw error;
    }
  }

  // Save booking search
  async saveSearch(user: User, searchParams: BookingSearch, results: BookingResult[]) {
    try {
      await addDoc(collection(this.db, 'bookingSearches'), {
        userId: user.uid,
        searchParams,
        results,
        createdAt: new Date()
      });
    } catch (error) {
      console.error('Error saving search:', error);
    }
  }

  // Get saved searches
  async getSavedSearches(userId: string) {
    try {
      const q = query(
        collection(this.db, 'bookingSearches'),
        where('userId', '==', userId)
      );
      const snapshot = await getDocs(q);
      
      const searches: any[] = [];
      snapshot.forEach((doc) => {
        searches.push({
          id: doc.id,
          ...doc.data()
        });
      });
      
      return searches.sort((a, b) => 
        b.createdAt?.toDate().getTime() - a.createdAt?.toDate().getTime()
      );
    } catch (error) {
      console.error('Error getting saved searches:', error);
      return [];
    }
  }

  // Format booking type for display
  formatBookingType(type: BookingSearch['type']): string {
    const types = {
      flight: 'Flights',
      hotel: 'Hotels',
      car: 'Car Rentals',
      tour: 'Tours',
      event: 'Events',
      airbnb: 'Airbnb'
    };
    return types[type] || type;
  }

  // Format price
  formatPrice(price: number, currency: string): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD'
    }).format(price);
  }
}

