// Data Normalization Service
// Standardizes data from different sources into a common format

export interface NormalizedFlight {
  id: string;
  segments: Array<{
    from: { code: string; name: string; city: string };
    to: { code: string; name: string; city: string };
    airline: string;
    flightNumber: string;
    departure: { datetime: string; timezone: string };
    arrival: { datetime: string; timezone: string };
    duration: number; // minutes
    aircraft?: string;
  }>;
  price: {
    amount: number;
    currency: string;
    originalCurrency?: string;
    exchangeRate?: number;
  };
  totalDuration: number; // minutes
  layovers: Array<{
    airport: string;
    duration: number; // minutes
  }>;
  source: string;
  bookingUrl: string;
  baggage?: {
    included: boolean;
    allowance?: string;
  };
  refundable: boolean;
  lastUpdated: string;
}

export interface NormalizedHotel {
  id: string;
  name: string;
  location: {
    address: string;
    city: string;
    country: string;
    coordinates?: { lat: number; lng: number };
  };
  price: {
    amount: number;
    currency: string;
    perNight: boolean;
    originalCurrency?: string;
    exchangeRate?: number;
  };
  rating: {
    value: number;
    max: number;
    reviews: number;
    source: string;
  };
  amenities: string[];
  roomTypes: Array<{
    name: string;
    price: number;
    available: boolean;
  }>;
  cancellationPolicy: string;
  specialOffers: Array<{
    type: 'first-time' | 'discount' | 'package' | 'loyalty';
    description: string;
    discount?: number;
  }>;
  source: string;
  bookingUrl: string;
  images: string[];
  lastUpdated: string;
}

export interface NormalizedTransport {
  id: string;
  type: 'flight' | 'bus' | 'train' | 'ferry' | 'car' | 'mixed';
  from: { code: string; name: string; city: string };
  to: { code: string; name: string; city: string };
  operator: string;
  departure: { datetime: string; timezone: string };
  arrival: { datetime: string; timezone: string };
  duration: number; // minutes
  price: {
    amount: number;
    currency: string;
  };
  source: string;
  bookingUrl: string;
  amenities?: string[];
  lastUpdated: string;
}

export class DataNormalizer {
  // Normalize flight data from different sources
  normalizeFlight(data: any, source: string): NormalizedFlight {
    const normalized: NormalizedFlight = {
      id: `${source}-${data.id || Math.random().toString(36)}`,
      segments: this.normalizeSegments(data.segments || data.flights || []),
      price: this.normalizePrice(data.price, data.currency),
      totalDuration: this.calculateTotalDuration(data),
      layovers: this.extractLayovers(data),
      source,
      bookingUrl: data.url || data.bookingUrl || '#',
      baggage: this.extractBaggage(data),
      refundable: data.refundable || false,
      lastUpdated: new Date().toISOString()
    };

    return normalized;
  }

  // Normalize hotel data
  normalizeHotel(data: any, source: string): NormalizedHotel {
    const normalized: NormalizedHotel = {
      id: `${source}-${data.id || Math.random().toString(36)}`,
      name: data.name || data.hotelName || '',
      location: {
        address: data.address || data.location?.address || '',
        city: data.city || data.location?.city || '',
        country: data.country || data.location?.country || '',
        coordinates: data.coordinates || data.location?.coordinates
      },
      price: this.normalizeHotelPrice(data.price, data.currency), // Hotels are per night
      rating: {
        value: data.rating || data.stars || 0,
        max: 5,
        reviews: data.reviews || data.reviewCount || 0,
        source: data.ratingSource || source
      },
      amenities: Array.isArray(data.amenities) ? data.amenities : [],
      roomTypes: this.normalizeRoomTypes(data.rooms || data.roomTypes || []),
      cancellationPolicy: data.cancellationPolicy || 'Check booking site',
      specialOffers: this.extractSpecialOffers(data),
      source,
      bookingUrl: data.url || data.bookingUrl || '#',
      images: Array.isArray(data.images) ? data.images : [],
      lastUpdated: new Date().toISOString()
    };

    return normalized;
  }

  // Normalize transport data (buses, trains, ferries)
  normalizeTransport(data: any, source: string): NormalizedTransport {
    return {
      id: `${source}-${data.id || Math.random().toString(36)}`,
      type: data.type || 'bus',
      from: {
        code: data.fromCode || '',
        name: data.fromName || data.from || '',
        city: data.fromCity || ''
      },
      to: {
        code: data.toCode || '',
        name: data.toName || data.to || '',
        city: data.toCity || ''
      },
      operator: data.operator || data.company || '',
      departure: {
        datetime: data.departure || data.departureTime || '',
        timezone: data.departureTimezone || 'UTC'
      },
      arrival: {
        datetime: data.arrival || data.arrivalTime || '',
        timezone: data.arrivalTimezone || 'UTC'
      },
      duration: this.parseDuration(data.duration),
      price: this.normalizePrice(data.price, data.currency),
      source,
      bookingUrl: data.url || data.bookingUrl || '#',
      amenities: data.amenities || [],
      lastUpdated: new Date().toISOString()
    };
  }

  // Merge duplicate results from different sources
  mergeDuplicates<T extends { id: string; price: { amount: number }; source: string }>(
    results: T[]
  ): T[] {
    const grouped = new Map<string, T[]>();

    // Group by similarity (same route, similar times)
    results.forEach(result => {
      const key = this.generateMergeKey(result);
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(result);
    });

    const merged: T[] = [];
    grouped.forEach((group) => {
      if (group.length === 1) {
        merged.push(group[0]);
      } else {
        // Take cheapest or best option
        const best = group.reduce((best, current) => 
          current.price.amount < best.price.amount ? current : best
        );
        merged.push(best);
      }
    });

    return merged;
  }

  // Convert currency
  convertCurrency(amount: number, fromCurrency: string, toCurrency: string, rate: number): number {
    if (fromCurrency === toCurrency) return amount;
    return amount * rate;
  }

  // Normalize timezone
  normalizeTimezone(datetime: string, _timezone: string): string {
    // Convert to UTC or user's timezone
    // Would use a library like date-fns-tz in production
    return datetime;
  }

  // Private helper methods
  private normalizeSegments(segments: any[]): NormalizedFlight['segments'] {
    return segments.map(seg => ({
      from: {
        code: seg.fromCode || seg.from?.code || '',
        name: seg.fromName || seg.from?.name || '',
        city: seg.fromCity || seg.from?.city || ''
      },
      to: {
        code: seg.toCode || seg.to?.code || '',
        name: seg.toName || seg.to?.name || '',
        city: seg.toCity || seg.to?.city || ''
      },
      airline: seg.airline || seg.carrier || '',
      flightNumber: seg.flightNumber || seg.number || '',
      departure: {
        datetime: seg.departure || seg.departureTime || '',
        timezone: seg.departureTimezone || 'UTC'
      },
      arrival: {
        datetime: seg.arrival || seg.arrivalTime || '',
        timezone: seg.arrivalTimezone || 'UTC'
      },
      duration: this.parseDuration(seg.duration),
      aircraft: seg.aircraft
    }));
  }

  private normalizePrice(price: any, currency?: string): NormalizedFlight['price'] {
    const amount = typeof price === 'number' ? price : (price?.amount || price || 0);
    const curr = currency || price?.currency || 'USD';
    
    return {
      amount,
      currency: curr,
      originalCurrency: price?.originalCurrency,
      exchangeRate: price?.exchangeRate
    };
  }

  private normalizeHotelPrice(price: any, currency?: string): NormalizedHotel['price'] {
    const amount = typeof price === 'number' ? price : (price?.amount || price || 0);
    const curr = currency || price?.currency || 'USD';
    
    return {
      amount,
      currency: curr,
      perNight: true,
      originalCurrency: price?.originalCurrency,
      exchangeRate: price?.exchangeRate
    };
  }

  private calculateTotalDuration(data: any): number {
    if (data.totalDuration) {
      return this.parseDuration(data.totalDuration);
    }
    // Calculate from segments
    return 0; // Placeholder
  }

  private extractLayovers(_data: any): NormalizedFlight['layovers'] {
    return []; // Placeholder - would extract from segments
  }

  private extractBaggage(data: any): NormalizedFlight['baggage'] {
    return {
      included: data.baggageIncluded || false,
      allowance: data.baggageAllowance
    };
  }

  private normalizeRoomTypes(rooms: any[]): NormalizedHotel['roomTypes'] {
    return rooms.map(room => ({
      name: room.name || room.type || '',
      price: room.price || 0,
      available: room.available !== false
    }));
  }

  private extractSpecialOffers(data: any): NormalizedHotel['specialOffers'] {
    const offers: NormalizedHotel['specialOffers'] = [];
    
    if (data.firstTimeDeal) {
      offers.push({ type: 'first-time', description: 'First-time customer deal' });
    }
    if (data.discount) {
      offers.push({ 
        type: 'discount', 
        description: `${data.discount}% off`,
        discount: data.discount 
      });
    }
    if (data.specialDeals) {
      data.specialDeals.forEach((deal: string) => {
        if (deal.toLowerCase().includes('first')) {
          offers.push({ type: 'first-time', description: deal });
        } else if (deal.toLowerCase().includes('discount') || deal.includes('%')) {
          offers.push({ type: 'discount', description: deal });
        }
      });
    }

    return offers;
  }

  private parseDuration(duration: string | number): number {
    if (typeof duration === 'number') return duration;
    // Parse "2h 30m" or "150 minutes" etc.
    const hours = (duration.match(/(\d+)h/) || [])[1];
    const minutes = (duration.match(/(\d+)m/) || [])[1];
    return (parseInt(hours || '0') * 60) + parseInt(minutes || '0');
  }

  private generateMergeKey(_result: any): string {
    // Generate key for merging duplicates
    // Would use route, time, price similarity
    return `${_result.from || ''}-${_result.to || ''}-${_result.departure || ''}`;
  }
}

