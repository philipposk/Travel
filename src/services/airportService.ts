// Airport Service - Real-time airport information and navigation

export interface AirportInfo {
  code: string;
  name: string;
  city: string;
  country: string;
  terminals: Terminal[];
  gates: Gate[];
  facilities: string[];
  walkingTimes: WalkingTime[];
  securityWaitTimes: SecurityWaitTime[];
  passportControlTimes: PassportControlTime[];
  luggageWaitTimes: LuggageWaitTime[];
  lounges: Lounge[];
  smokingAreas: SmokingArea[];
  accessibility: AccessibilityInfo;
  lastUpdated: string;
}

export interface Terminal {
  id: string;
  name: string;
  entrances: Entrance[];
  checkInAreas: CheckInArea[];
  gates: string[];
  facilities: string[];
}

export interface Entrance {
  id: string;
  name: string;
  type: 'main' | 'parking' | 'metro' | 'train' | 'bus' | 'taxi';
  coordinates: { lat: number; lng: number };
}

export interface CheckInArea {
  id: string;
  name: string;
  airlines: string[];
  coordinates: { lat: number; lng: number };
}

export interface Gate {
  id: string;
  terminal: string;
  number: string;
  coordinates: { lat: number; lng: number };
  status: 'open' | 'boarding' | 'closed' | 'delayed';
  flight?: {
    number: string;
    airline: string;
    destination: string;
    scheduledTime: string;
    actualTime?: string;
  };
  walkingTimeFromCheckIn?: number; // minutes
  walkingTimeFromEntrance?: number; // minutes
}

export interface WalkingTime {
  from: { type: 'entrance' | 'checkin' | 'gate'; id: string };
  to: { type: 'gate' | 'lounge' | 'facility'; id: string };
  distance: number; // meters
  walkingTime: number; // minutes
  route: {
    type: 'walk' | 'elevator' | 'escalator' | 'moving-walkway' | 'train';
    instructions: string[];
  };
  accessibility: {
    wheelchairAccessible: boolean;
    elevatorAvailable: boolean;
    assistanceAvailable: boolean;
  };
}

export interface SecurityWaitTime {
  checkpoint: string;
  terminal: string;
  currentWaitTime: number; // minutes
  averageWaitTime: number; // minutes
  peakTimes: string[];
  lastUpdated: string;
}

export interface PassportControlTime {
  checkpoint: string;
  terminal: string;
  type: 'immigration' | 'customs' | 'both';
  currentWaitTime: number; // minutes
  averageWaitTime: number; // minutes
  lastUpdated: string;
}

export interface LuggageWaitTime {
  carousel: string;
  terminal: string;
  currentWaitTime: number; // minutes
  averageWaitTime: number; // minutes
  lastUpdated: string;
}

export interface Lounge {
  id: string;
  name: string;
  terminal: string;
  location: string;
  coordinates: { lat: number; lng: number };
  access: {
    type: 'priority-pass' | 'airline-lounge' | 'credit-card' | 'paid';
    price?: number;
    currency?: string;
    upgradeAvailable: boolean;
    upgradePrice?: number;
  };
  amenities: string[];
  hours: string;
  capacity?: number;
  currentOccupancy?: number;
}

export interface SmokingArea {
  id: string;
  terminal: string;
  location: string;
  coordinates: { lat: number; lng: number };
  type: 'indoor' | 'outdoor' | 'designated-room';
}

export interface AccessibilityInfo {
  wheelchairRental: {
    available: boolean;
    locations: Array<{ terminal: string; location: string; coordinates: { lat: number; lng: number } }>;
    bookingRequired: boolean;
    bookingUrl?: string;
    phone?: string;
  };
  assistanceServices: {
    available: boolean;
    bookingRequired: boolean;
    bookingUrl?: string;
    phone?: string;
    providedBy: 'airport' | 'airline' | 'both';
  };
  accessibleFacilities: string[];
  accessibleRoutes: Array<{
    from: string;
    to: string;
    route: string[];
    estimatedTime: number;
  }>;
}

export interface AirportAlert {
  id: string;
  type: 'delay' | 'gate-change' | 'weather' | 'security' | 'protest' | 'terrorism' | 'other';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  affectedFlights?: string[];
  affectedAreas?: string[];
  startTime: string;
  endTime?: string;
  source: string;
  lastUpdated: string;
}

export class AirportService {
  private cache: Map<string, { data: AirportInfo; timestamp: number }> = new Map();
  private cacheTTL = 5 * 60 * 1000; // 5 minutes

  // Get real-time airport information
  async getAirportInfo(airportCode: string): Promise<AirportInfo> {
    // Check cache
    const cached = this.cache.get(airportCode);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.data;
    }

    // Fetch from multiple sources
    const [airportData, realTimeData] = await Promise.all([
      this.fetchAirportData(airportCode),
      this.fetchRealTimeData(airportCode)
    ]);

    const info: AirportInfo = {
      code: airportCode,
      name: airportData.name || '',
      city: airportData.city || '',
      country: airportData.country || '',
      terminals: airportData.terminals || [],
      gates: realTimeData.gates,
      facilities: airportData.facilities || [],
      walkingTimes: airportData.walkingTimes || [],
      securityWaitTimes: realTimeData.securityWaitTimes,
      passportControlTimes: realTimeData.passportControlTimes,
      luggageWaitTimes: realTimeData.luggageWaitTimes,
      lounges: airportData.lounges || [],
      smokingAreas: airportData.smokingAreas || [],
      accessibility: airportData.accessibility || {
        wheelchairRental: { available: false, locations: [], bookingRequired: false },
        assistanceServices: { available: false, bookingRequired: false, providedBy: 'airport' },
        accessibleFacilities: [],
        accessibleRoutes: []
      },
      lastUpdated: new Date().toISOString()
    };

    // Cache result
    this.cache.set(airportCode, { data: info, timestamp: Date.now() });

    return info;
  }

  // Fetch static airport data (terminals, facilities, etc.)
  private async fetchAirportData(airportCode: string): Promise<Partial<AirportInfo>> {
    // Sources:
    // 1. Airport official website
    // 2. OpenFlights database
    // 3. OurFirebase database (community-edited)
    // 4. Google Places API

    return {
      code: airportCode,
      name: '',
      city: '',
      country: '',
      terminals: [],
      facilities: [],
      walkingTimes: [],
      lounges: [],
      smokingAreas: [],
      accessibility: {
        wheelchairRental: { available: false, locations: [], bookingRequired: false },
        assistanceServices: { available: false, bookingRequired: false, providedBy: 'airport' },
        accessibleFacilities: [],
        accessibleRoutes: []
      }
    };
  }

  // Fetch real-time data (gates, wait times, etc.)
  private async fetchRealTimeData(airportCode: string): Promise<{
    gates: Gate[];
    securityWaitTimes: SecurityWaitTime[];
    passportControlTimes: PassportControlTime[];
    luggageWaitTimes: LuggageWaitTime[];
  }> {
    // Sources:
    // 1. FlightStats API
    // 2. Aviationstack API
    // 3. VariFlight API
    // 4. Airport official APIs
    // 5. Community updates

    return {
      gates: [],
      securityWaitTimes: [],
      passportControlTimes: [],
      luggageWaitTimes: []
    };
  }

  // Fetch alerts (delays, weather, security, etc.)
  async fetchAlerts(_airportCode: string): Promise<AirportAlert[]> {
    // Sources:
    // 1. FlightStats API (delays)
    // 2. Weather APIs (bad weather)
    // 3. News APIs (protests, terrorism)
    // 4. Airport official alerts
    // 5. Government travel advisories

    return [];
  }

  // Get walking time from entrance/check-in to gate
  async getWalkingTime(
    airportCode: string,
    from: { type: 'entrance' | 'checkin'; id: string },
    to: { type: 'gate'; id: string }
  ): Promise<WalkingTime> {
    const airportInfo = await this.getAirportInfo(airportCode);
    
    // Find existing walking time
    const existing = airportInfo.walkingTimes.find(
      wt => wt.from.type === from.type && wt.from.id === from.id && wt.to.id === to.id
    );

    if (existing) {
      return existing;
    }

    // Calculate using Google Maps API or airport data
    return this.calculateWalkingTime(from, to);
  }

  // Calculate walking time using Google Maps API
  private async calculateWalkingTime(
    from: { type: 'entrance' | 'checkin'; id: string },
    to: { type: 'gate'; id: string }
  ): Promise<WalkingTime> {
    // Use Google Maps Directions API
    // Would need: VITE_MAPS_API_KEY
    // API: https://developers.google.com/maps/documentation/directions

    return {
      from,
      to,
      distance: 0,
      walkingTime: 0,
      route: {
        type: 'walk',
        instructions: []
      },
      accessibility: {
        wheelchairAccessible: false,
        elevatorAvailable: false,
        assistanceAvailable: false
      }
    };
  }

  // Get timeline for passenger journey
  async getJourneyTimeline(
    airportCode: string,
    _flightNumber: string,
    passengerInfo: {
      checkInTime: string;
      hasLuggage: boolean;
      needsPassportControl: boolean;
      gateNumber: string;
      entranceType: 'main' | 'parking' | 'metro' | 'train' | 'bus' | 'taxi';
    }
  ): Promise<Array<{
    step: string;
    location: string;
    estimatedTime: string;
    actualTime?: string;
    status: 'upcoming' | 'in-progress' | 'completed' | 'delayed';
    waitTime?: number; // minutes
    walkingTime?: number; // minutes
  }>> {
    const airportInfo = await this.getAirportInfo(airportCode);
    const timeline: Array<{
      step: string;
      location: string;
      estimatedTime: string;
      actualTime?: string;
      status: 'upcoming' | 'in-progress' | 'completed' | 'delayed';
      waitTime?: number;
      walkingTime?: number;
    }> = [];

    // Entrance to Check-in
    const entranceToCheckIn = await this.getWalkingTime(
      airportCode,
      { type: 'entrance', id: passengerInfo.entranceType },
      { type: 'gate', id: 'checkin' }
    );

    timeline.push({
      step: 'Arrive at Airport',
      location: `${passengerInfo.entranceType} entrance`,
      estimatedTime: passengerInfo.checkInTime,
      status: 'upcoming',
      walkingTime: entranceToCheckIn.walkingTime
    });

    // Check-in
    timeline.push({
      step: 'Check-in',
      location: 'Check-in area',
      estimatedTime: passengerInfo.checkInTime,
      status: 'upcoming'
    });

    // Security
    const securityWait = airportInfo.securityWaitTimes[0];
    timeline.push({
      step: 'Security Check',
      location: 'Security checkpoint',
      estimatedTime: new Date(new Date(passengerInfo.checkInTime).getTime() + 15 * 60000).toISOString(),
      status: 'upcoming',
      waitTime: securityWait?.currentWaitTime || 10
    });

    // Passport Control (if needed)
    if (passengerInfo.needsPassportControl) {
      const passportWait = airportInfo.passportControlTimes[0];
      timeline.push({
        step: 'Passport Control',
        location: 'Immigration checkpoint',
        estimatedTime: new Date(new Date(passengerInfo.checkInTime).getTime() + 30 * 60000).toISOString(),
        status: 'upcoming',
        waitTime: passportWait?.currentWaitTime || 15
      });
    }

    // Walk to Gate
    const checkInToGate = await this.getWalkingTime(
      airportCode,
      { type: 'checkin', id: 'main' },
      { type: 'gate', id: passengerInfo.gateNumber }
    );

    timeline.push({
      step: 'Walk to Gate',
      location: `Gate ${passengerInfo.gateNumber}`,
      estimatedTime: new Date(new Date(passengerInfo.checkInTime).getTime() + 45 * 60000).toISOString(),
      status: 'upcoming',
      walkingTime: checkInToGate.walkingTime
    });

    // Boarding
    const gate = airportInfo.gates.find(g => g.number === passengerInfo.gateNumber);
    timeline.push({
      step: 'Boarding',
      location: `Gate ${passengerInfo.gateNumber}`,
      estimatedTime: gate?.flight?.scheduledTime || '',
      status: 'upcoming'
    });

    return timeline;
  }

  // Book wheelchair/assistance
  async bookAssistance(
    _airportCode: string,
    _flightNumber: string,
    _passengerInfo: {
      name: string;
      phone: string;
      email: string;
      needs: 'wheelchair' | 'assistance' | 'both';
      airline: string;
    }
  ): Promise<{
    success: boolean;
    bookingId?: string;
    message: string;
    contactInfo?: { phone: string; email: string };
  }> {
    // Assistance is typically handled by the airline, not the airport
    // This would:
    // 1. Contact airline API
    // 2. Or provide airline contact information
    // 3. Or submit request through airport assistance service

    return {
      success: false,
      message: 'Assistance booking typically handled by airline. Please contact your airline directly or use their website/app.'
    };
  }

  // Get lounge upgrade options
  async getLoungeUpgrades(airportCode: string, terminal: string): Promise<Lounge[]> {
    const airportInfo = await this.getAirportInfo(airportCode);
    return airportInfo.lounges.filter(l => 
      l.terminal === terminal && 
      l.access.upgradeAvailable
    );
  }

  // Download airport schematic/map
  async getAirportMap(airportCode: string, format: 'pdf' | 'image' | 'interactive' = 'interactive'): Promise<{
    url: string;
    format: string;
    legal: boolean;
    source: string;
  }> {
    // Sources:
    // 1. Airport official website
    // 2. OpenStreetMap
    // 3. Google Maps (embedded)
    // 4. Community-created maps

    // Would fetch map for airportCode
    return {
      url: `https://maps.google.com/?q=${airportCode}+airport`,
      format,
      legal: true,
      source: 'airport-official'
    };
  }
}

