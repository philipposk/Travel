// Transport routing. Uses free indie-accessible APIs:
//   - Navitia.io      (global public transit routing, free key)
//   - Transitous      (public-transport routing, no key)
//   - Deutsche Bahn open-data (EU rail timetables, no key)
// Enterprise stubs (Trainline/FlixBus/Omio/12Go/Rail Europe/DirectFerries)
// removed — those APIs require B2B contracts unavailable to indies.
import { httpsCallable, getFunctions } from 'firebase/functions';

export type TransportMode = 'bus' | 'train' | 'ferry' | 'tram' | 'subway' | 'walk';

export interface TransportRoute {
  id: string;
  mode: TransportMode;
  from: { lat: number; lon: number; name: string };
  to: { lat: number; lon: number; name: string };
  operator: string;
  departure: string;
  arrival: string;
  duration: number;
  price?: { amount: number; currency: string };
  bookingUrl?: string;
  source: 'navitia' | 'transitous' | 'db-opendata';
}

export interface MultiModalRoute {
  segments: TransportRoute[];
  totalDuration: number;
  totalPrice?: { amount: number; currency: string };
  co2Kg?: number;
}

export class TransportAPIs {
  private fn = getFunctions();

  async searchTransit(
    fromLat: number,
    fromLon: number,
    toLat: number,
    toLon: number,
    departAt?: string
  ): Promise<MultiModalRoute[]> {
    const call = httpsCallable<unknown, { results: MultiModalRoute[] }>(
      this.fn,
      'searchTransit'
    );
    const res = await call({ fromLat, fromLon, toLat, toLon, departAt });
    return res.data.results.sort((a, b) => a.totalDuration - b.totalDuration);
  }

  async searchTrainsEU(from: string, to: string, date: string): Promise<TransportRoute[]> {
    const call = httpsCallable<unknown, { results: TransportRoute[] }>(
      this.fn,
      'searchTrainsEU'
    );
    const res = await call({ from, to, date });
    return res.data.results;
  }

  // ── Back-compat shims for legacy main.ts (frontend rebuild pending) ──────
  // They flatten multi-modal results into a single mode-specific list.
  async searchBuses(_from: string, _to: string, _date: string): Promise<LegacyTransportRoute[]> {
    return []; // No indie bus API. Use searchTransit() for multi-modal once UI wired.
  }
  async searchTrains(_from: string, _to: string, _date: string): Promise<LegacyTransportRoute[]> {
    return [];
  }
  async searchFerries(_from: string, _to: string, _date: string): Promise<LegacyTransportRoute[]> {
    return [];
  }
}

// Legacy shape preserved so main.ts compiles until frontend is rebuilt.
export interface LegacyTransportRoute {
  type: 'bus' | 'train' | 'ferry';
  from: { name: string };
  to: { name: string };
  operator: string;
  duration: number;
  price: { amount: number; currency: string };
  bookingUrl: string;
}
