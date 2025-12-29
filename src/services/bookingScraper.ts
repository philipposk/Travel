// Booking scraper service - handles scraping logic
// Note: Actual web scraping should be done server-side due to CORS and rate limiting

export interface ScrapingSite {
  id: string;
  name: string;
  url: string;
  type: 'flight' | 'hotel' | 'car' | 'tour' | 'event' | 'airbnb' | 'general';
  isActive: boolean;
  lastChecked: Date;
  verificationStatus: 'verified' | 'pending' | 'suspicious';
  apiEndpoint?: string; // If they have an API
  selectors?: {
    price?: string;
    title?: string;
    image?: string;
    rating?: string;
  };
}

export class BookingScraperService {
  private defaultSites: ScrapingSite[] = [
    {
      id: 'skyscanner',
      name: 'Skyscanner',
      url: 'https://www.skyscanner.com',
      type: 'flight',
      isActive: true,
      lastChecked: new Date(),
      verificationStatus: 'verified'
    },
    {
      id: 'agoda',
      name: 'Agoda',
      url: 'https://www.agoda.com',
      type: 'hotel',
      isActive: true,
      lastChecked: new Date(),
      verificationStatus: 'verified'
    },
    {
      id: 'booking',
      name: 'Booking.com',
      url: 'https://www.booking.com',
      type: 'hotel',
      isActive: true,
      lastChecked: new Date(),
      verificationStatus: 'verified'
    },
    {
      id: 'airbnb',
      name: 'Airbnb',
      url: 'https://www.airbnb.com',
      type: 'airbnb',
      isActive: true,
      lastChecked: new Date(),
      verificationStatus: 'verified'
    },
    {
      id: 'expedia',
      name: 'Expedia',
      url: 'https://www.expedia.com',
      type: 'general',
      isActive: true,
      lastChecked: new Date(),
      verificationStatus: 'verified'
    },
    {
      id: 'kayak',
      name: 'Kayak',
      url: 'https://www.kayak.com',
      type: 'general',
      isActive: true,
      lastChecked: new Date(),
      verificationStatus: 'verified'
    },
    {
      id: 'rentalcars',
      name: 'Rentalcars.com',
      url: 'https://www.rentalcars.com',
      type: 'car',
      isActive: true,
      lastChecked: new Date(),
      verificationStatus: 'verified'
    },
    {
      id: 'getyourguide',
      name: 'GetYourGuide',
      url: 'https://www.getyourguide.com',
      type: 'tour',
      isActive: true,
      lastChecked: new Date(),
      verificationStatus: 'verified'
    },
    {
      id: 'viator',
      name: 'Viator',
      url: 'https://www.viator.com',
      type: 'tour',
      isActive: true,
      lastChecked: new Date(),
      verificationStatus: 'verified'
    }
  ];

  // Get all active scraping sites
  getActiveSites(type?: ScrapingSite['type']): ScrapingSite[] {
    let sites = this.defaultSites.filter(site => site.isActive);
    if (type) {
      sites = sites.filter(site => site.type === type || site.type === 'general');
    }
    return sites;
  }

  // Check if site is legitimate (scam detection)
  async checkSiteLegitimacy(site: ScrapingSite): Promise<{
    isLegitimate: boolean;
    scamScore: number; // 0-100, lower is better
    reasons: string[];
  }> {
    // This would use AI to analyze the site
    // For now, return based on verification status
    const reasons: string[] = [];
    let scamScore = 0;

    if (site.verificationStatus === 'verified') {
      scamScore = 10; // Very low, very safe
      reasons.push('Verified by admin');
    } else if (site.verificationStatus === 'pending') {
      scamScore = 50;
      reasons.push('Pending verification');
    } else {
      scamScore = 80;
      reasons.push('Marked as suspicious');
    }

    // Check if site has HTTPS
    if (!site.url.startsWith('https://')) {
      scamScore += 20;
      reasons.push('No HTTPS encryption');
    }

    return {
      isLegitimate: scamScore < 50,
      scamScore: Math.min(100, scamScore),
      reasons
    };
  }

  // Generate search URL for a site
  generateSearchUrl(site: ScrapingSite, searchParams: {
    destination: string;
    checkIn?: string;
    checkOut?: string;
    passengers?: number;
  }): string {
    const params = new URLSearchParams();
    params.set('q', searchParams.destination);
    
    if (searchParams.checkIn) params.set('checkin', searchParams.checkIn);
    if (searchParams.checkOut) params.set('checkout', searchParams.checkOut);
    if (searchParams.passengers) params.set('adults', searchParams.passengers.toString());

    // Different sites have different URL structures
    // This is a simplified version
    return `${site.url}/search?${params.toString()}`;
  }
}

