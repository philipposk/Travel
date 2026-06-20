// Booking aggregator. Calls server-side Firebase Functions which talk to
// indie-accessible APIs only (Duffel, Amadeus Self-Service, Travelpayouts,
// Makcorps). Enterprise stubs (Sabre/Travelport/Hotelbeds/Trainline/FlixBus
// /12Go/Omio) were removed — they require B2B contracts.
import { httpsCallable, getFunctions } from 'firebase/functions';

export interface FlightSegment {
  from: string;
  to: string;
  airline: string;
  flightNumber: string;
  departure: string;
  arrival: string;
  duration: string;
}

export interface FlightRoute {
  id: string;
  segments: FlightSegment[];
  totalPrice: number;
  currency: string;
  totalDuration: string;
  layovers: number;
  source: 'duffel' | 'amadeus' | 'travelpayouts' | 'multi-city';
  bookingUrl?: string;
  offerId?: string;
}

export interface HotelDeal {
  id: string;
  name: string;
  location: string;
  price: number;
  currency: string;
  rating: number;
  reviews: number;
  amenities: string[];
  cancellationPolicy: string;
  source: 'amadeus' | 'travelpayouts' | 'makcorps';
  url: string;
  thumbnail?: string;
  discount?: number;
}

export interface Experience {
  id: string;
  name: string;
  location: string;
  price: number;
  currency: string;
  duration: string;
  rating: number;
  category: string;
  source: string;
  url: string;
}

export class RealBookingAggregator {
  private fn = getFunctions();

  async searchFlights(
    from: string,
    to: string,
    date: string,
    passengers = 1,
    cabinClass: 'economy' | 'premium_economy' | 'business' | 'first' = 'economy'
  ): Promise<FlightRoute[]> {
    const call = httpsCallable<unknown, { results: FlightRoute[] }>(
      this.fn,
      'searchFlights'
    );
    const res = await call({ from, to, date, passengers, cabinClass });
    return res.data.results.sort((a, b) => a.totalPrice - b.totalPrice);
  }

  async searchHotels(
    location: string,
    checkIn: string,
    checkOut: string,
    guests = 2,
    rooms = 1
  ): Promise<HotelDeal[]> {
    const call = httpsCallable<unknown, { results: HotelDeal[] }>(
      this.fn,
      'searchHotels'
    );
    const res = await call({ location, checkIn, checkOut, guests, rooms });
    return this.identifyBestDeals(res.data.results);
  }

  async searchExperiences(location: string, date?: string): Promise<Experience[]> {
    const call = httpsCallable<unknown, { results: Experience[] }>(
      this.fn,
      'searchExperiences'
    );
    const res = await call({ location, date });
    return res.data.results.sort((a, b) => a.price - b.price);
  }

  // Book a previously searched offer via Duffel.
  async bookFlight(offerId: string, passengers: PassengerInfo[]): Promise<BookingConfirmation> {
    const call = httpsCallable<unknown, BookingConfirmation>(this.fn, 'createFlightOrder');
    const res = await call({ offerId, passengers });
    return res.data;
  }

  private identifyBestDeals(deals: HotelDeal[]): HotelDeal[] {
    const grouped = new Map<string, HotelDeal[]>();
    deals.forEach(d => {
      const key = d.name.toLowerCase().trim();
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(d);
    });

    const best: HotelDeal[] = [];
    grouped.forEach(group => {
      const cheapest = group.reduce((a, b) => (b.price < a.price ? b : a));
      if (group.length > 1) {
        const maxPrice = Math.max(...group.map(g => g.price));
        cheapest.discount = Math.round(((maxPrice - cheapest.price) / maxPrice) * 100);
      }
      best.push(cheapest);
    });
    return best.sort((a, b) => a.price - b.price);
  }
}

export interface PassengerInfo {
  type: 'adult' | 'child' | 'infant';
  givenName: string;
  familyName: string;
  born: string;
  gender: 'm' | 'f';
  email: string;
  phone: string;
}

export interface BookingConfirmation {
  bookingRef: string;
  status: 'confirmed' | 'pending' | 'failed';
  totalPrice: number;
  currency: string;
  receiptUrl?: string;
  ticketNumbers?: string[];
}
