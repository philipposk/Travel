// Main Booking Aggregator
// Follows the architecture pattern: User Query → Aggregator → Multiple APIs → Normalize → Compare → Present

import { DataNormalizer, NormalizedFlight, NormalizedHotel, NormalizedTransport } from './dataNormalizer';
import { RealBookingAggregator } from './realBookingAggregator';

export interface BookingQuery {
  type: 'flight' | 'hotel' | 'bus' | 'train' | 'ferry' | 'experience' | 'all';
  from?: string;
  to: string;
  date?: string;
  returnDate?: string;
  passengers?: number;
  flexible?: boolean;
  budget?: { min?: number; max?: number; currency: string };
}

export interface AggregatedResults {
  flights: NormalizedFlight[];
  hotels: NormalizedHotel[];
  transport: NormalizedTransport[];
  experiences: any[];
  bestDeals: Array<{
    type: string;
    item: any;
    savings?: number;
    reason: string;
  }>;
  sources: string[];
  lastUpdated: string;
}

export class BookingAggregator {
  private normalizer: DataNormalizer;
  private realAggregator: RealBookingAggregator;
  private cache: Map<string, { data: AggregatedResults; timestamp: number }> = new Map();
  private cacheTTL = 60 * 60 * 1000; // 1 hour

  constructor() {
    this.normalizer = new DataNormalizer();
    this.realAggregator = new RealBookingAggregator();
  }

  // Main aggregation method
  async search(query: BookingQuery): Promise<AggregatedResults> {
    // Check cache
    const cacheKey = this.generateCacheKey(query);
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    // Search all sources in parallel
    const results = await this.searchAllSources(query);

    // Normalize all data
    const normalized = this.normalizeAll(results);

    // Merge duplicates
    const merged = this.mergeAll(normalized);

    // Find best deals
    const bestDeals = this.findBestDeals(merged);

    // Compile results
    const aggregated: AggregatedResults = {
      flights: merged.flights,
      hotels: merged.hotels,
      transport: merged.transport,
      experiences: merged.experiences,
      bestDeals,
      sources: this.extractSources(results),
      lastUpdated: new Date().toISOString()
    };

    // Cache results
    this.cache.set(cacheKey, { data: aggregated, timestamp: Date.now() });

    return aggregated;
  }

  // Search all sources in parallel.
  // Each category is resolved through its own named promise so the result
  // mapping can never drift when one search is skipped (e.g. flights with no
  // origin). Skipped categories resolve to an empty array.
  private async searchAllSources(query: BookingQuery): Promise<any> {
    const wantFlights = query.type === 'flight' || query.type === 'all';
    const wantHotels = query.type === 'hotel' || query.type === 'all';
    const wantTransport = query.type === 'bus' || query.type === 'train' || query.type === 'ferry' || query.type === 'all';
    const wantExperiences = query.type === 'experience' || query.type === 'all';

    const settle = (p: Promise<any>) => p.then((v) => v).catch(() => []);

    const flightsP = wantFlights && query.from
      ? settle(this.realAggregator.searchFlights(query.from, query.to, query.date || '', query.passengers || 1, 'economy'))
      : Promise.resolve([]);

    const hotelsP = wantHotels
      ? settle(this.realAggregator.searchHotels(query.to, query.date || '', query.returnDate || '', query.passengers || 2))
      : Promise.resolve([]);

    // Transport APIs are wired separately; placeholder keeps the shape stable.
    const transportP: Promise<any> = wantTransport ? Promise.resolve([]) : Promise.resolve([]);

    const experiencesP = wantExperiences
      ? settle(this.realAggregator.searchExperiences(query.to, query.date))
      : Promise.resolve([]);

    const [flights, hotels, transport, experiences] = await Promise.all([
      flightsP, hotelsP, transportP, experiencesP,
    ]);

    return { flights, hotels, transport, experiences };
  }

  // Normalize all data from different sources
  private normalizeAll(results: any): any {
    return {
      flights: results.flights.map((f: any) => this.normalizer.normalizeFlight(f, f.source || 'unknown')),
      hotels: results.hotels.map((h: any) => this.normalizer.normalizeHotel(h, h.source || 'unknown')),
      transport: results.transport.map((t: any) => this.normalizer.normalizeTransport(t, t.source || 'unknown')),
      experiences: results.experiences
    };
  }

  // Merge duplicates across sources
  private mergeAll(normalized: any): any {
    return {
      flights: this.normalizer.mergeDuplicates(normalized.flights),
      hotels: this.normalizer.mergeDuplicates(normalized.hotels),
      transport: this.normalizer.mergeDuplicates(normalized.transport),
      experiences: normalized.experiences
    };
  }

  // Find best deals
  private findBestDeals(merged: any): AggregatedResults['bestDeals'] {
    const deals: AggregatedResults['bestDeals'] = [];

    // Cheapest flight
    if (merged.flights.length > 0) {
      const cheapest = merged.flights.reduce((best: NormalizedFlight, current: NormalizedFlight) =>
        current.price.amount < best.price.amount ? current : best
      );
      deals.push({
        type: 'flight',
        item: cheapest,
        reason: 'Lowest price'
      });
    }

    // Best hotel deal
    if (merged.hotels.length > 0) {
      const bestHotel = merged.hotels.reduce((best: NormalizedHotel, current: NormalizedHotel) => {
        const bestScore = (best.rating.value * best.rating.reviews) / best.price.amount;
        const currentScore = (current.rating.value * current.rating.reviews) / current.price.amount;
        return currentScore > bestScore ? current : best;
      });
      deals.push({
        type: 'hotel',
        item: bestHotel,
        reason: 'Best value (rating/price)'
      });

      // First-time deal
      const firstTimeDeal = merged.hotels.find((h: NormalizedHotel) =>
        h.specialOffers.some(o => o.type === 'first-time')
      );
      if (firstTimeDeal) {
        deals.push({
          type: 'hotel',
          item: firstTimeDeal,
          reason: 'First-time customer special'
        });
      }
    }

    return deals;
  }

  // Extract unique sources
  private extractSources(results: any): string[] {
    const sources = new Set<string>();
    
    results.flights?.forEach((f: any) => sources.add(f.source));
    results.hotels?.forEach((h: any) => sources.add(h.source));
    results.transport?.forEach((t: any) => sources.add(t.source));
    
    return Array.from(sources);
  }

  // Generate cache key
  private generateCacheKey(query: BookingQuery): string {
    return JSON.stringify(query);
  }

  // Clear cache
  clearCache() {
    this.cache.clear();
  }

  // Get cache stats
  getCacheStats() {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys())
    };
  }
}

