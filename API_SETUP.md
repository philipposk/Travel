# API Setup Guide for Real Booking Data

## 🎯 Quick Start

To get **real live booking data**, you need to set up APIs from booking providers. Here's how:

## 1. Flight APIs

### Skyscanner API
**Best for**: General flight searches
- Sign up: https://developers.skyscanner.net/
- Get API key
- Add to `.env.local`: `VITE_SKYSCANNER_API_KEY=your-key`
- **Rate Limit**: 1000 requests/month (free tier)

### Kiwi.com API
**Best for**: Complex multi-city routes (like ATH→BKK→VTE)
- Sign up: https://docs.kiwi.com/
- Get API key
- Add to `.env.local`: `VITE_KIWI_API_KEY=your-key`
- **Why Kiwi**: Finds routes others miss (trains, buses, complex connections)

### Amadeus API
**Best for**: Professional-grade flight & hotel data
- Sign up: https://developers.amadeus.com/
- Get Client ID & Secret
- Add to `.env.local`:
  ```
  VITE_AMADEUS_CLIENT_ID=your-id
  VITE_AMADEUS_CLIENT_SECRET=your-secret
  ```
- **Rate Limit**: 2000 requests/month (free tier)

### Google Flights
**Best for**: Comprehensive search
- Use Google Custom Search API
- Search: "flights from X to Y"
- Parse results (or use official API if available)

## 2. Hotel APIs

### Booking.com Affiliate API
- Join: https://www.booking.com/affiliate-program/
- Get Affiliate ID
- Add to `.env.local`: `VITE_BOOKING_COM_AFFILIATE_ID=your-id`
- **Commission**: Earn on bookings

### Agoda Partner API
- Sign up: https://www.agoda.com/partners/
- Get API credentials
- Add to `.env.local`: `VITE_AGODA_API_KEY=your-key`

### Expedia Partner Solutions
- Sign up: https://www.expedia.com/affiliates/
- Get API key
- Add to `.env.local`: `VITE_EXPEDIA_API_KEY=your-key`

### Trip.com API
- Sign up: https://www.trip.com/affiliate/
- Get API key
- Add to `.env.local`: `VITE_TRIP_COM_API_KEY=your-key`

## 3. Experience APIs

### GetYourGuide API
- Contact: https://partner.getyourguide.com/
- Get API credentials
- Add to `.env.local`: `VITE_GETYOURGUIDE_API_KEY=your-key`

### Viator API
- Sign up: https://www.viator.com/affiliate/
- Get API key
- Add to `.env.local`: `VITE_VIATOR_API_KEY=your-key`

### Klook API
- Sign up: https://www.klook.com/affiliate/
- Get API key
- Add to `.env.local`: `VITE_KLOOK_API_KEY=your-key`

## 4. Travel Intelligence APIs

### Reddit API
- Create app: https://www.reddit.com/prefs/apps
- Get Client ID & Secret
- Add to `.env.local`:
  ```
  VITE_REDDIT_CLIENT_ID=your-id
  VITE_REDDIT_CLIENT_SECRET=your-secret
  ```

### YouTube Data API
- Enable: https://console.cloud.google.com/apis/library/youtube.googleapis.com
- Get API key
- Add to `.env.local`: `VITE_YOUTUBE_API_KEY=your-key`

### Instagram Graph API
- Create app: https://developers.facebook.com/
- Get Access Token
- Add to `.env.local`: `VITE_INSTAGRAM_ACCESS_TOKEN=your-token`

### Facebook Graph API
- Same as Instagram (Facebook owns Instagram)
- Add to `.env.local`: `VITE_FACEBOOK_ACCESS_TOKEN=your-token`

## 5. Translation & Voice

### Google Cloud Text-to-Speech
- Enable: https://console.cloud.google.com/apis/library/texttospeech.googleapis.com
- Get API key
- Add to `.env.local`: `VITE_GOOGLE_TTS_API_KEY=your-key`

## 🔧 Implementation Notes

### Server-Side Scraping
**Important**: Web scraping should be done server-side (Firebase Functions) to avoid CORS and rate limiting.

Example Firebase Function:
```typescript
export const scrapeBookingSite = onCall(async (request) => {
  const { url, site } = request.data;
  // Server-side scraping
  // Return structured data
});
```

### Rate Limiting
- Implement caching (store results for 1-24 hours)
- Use request queuing
- Respect API rate limits

### Data Structure
All booking APIs return data in this format:
```typescript
{
  provider: string;
  title: string;
  price: number;
  currency: string;
  url: string;
  rating?: number;
  reviews?: number;
  specialDeals?: string[];
}
```

## 📊 Priority Order

1. **Start with**: Skyscanner (easiest, good coverage)
2. **Add**: Kiwi (for complex routes)
3. **Then**: Amadeus (professional data)
4. **Hotels**: Booking.com (largest inventory)
5. **Intelligence**: Reddit + YouTube (most valuable)

## 💡 Pro Tips

1. **Cache Results**: Don't search same route multiple times
2. **User Location**: Use user's location for better deals
3. **Flexible Dates**: Search ±3 days for better prices
4. **Multi-City**: Always search multi-city for long distances
5. **Deal Alerts**: Track prices and alert on drops

## 🚨 Important

- **Never expose API keys** in client-side code
- Use Firebase Functions for sensitive operations
- Implement proper error handling
- Respect terms of service
- Cache aggressively to reduce API calls

