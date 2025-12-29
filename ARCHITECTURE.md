# Booking Aggregator Architecture

## 🏗️ Architecture Pattern (As You Described)

```
User Query → Aggregator Platform
                ↓
    ┌───────────┼───────────┐
    ↓           ↓           ↓
  API 1      API 2      API 3
(Airlines) (Buses)   (Trains)
    ↓           ↓           ↓
  Results → Normalize → Compare
                ↓
         Present to User
```

## 📁 Implementation

### 1. **BookingAggregator** (`src/services/bookingAggregator.ts`)
**Main aggregator** - follows the architecture pattern:
- Receives user query
- Searches all sources in parallel
- Normalizes data
- Merges duplicates
- Finds best deals
- Returns aggregated results

### 2. **DataNormalizer** (`src/services/dataNormalizer.ts`)
**Data standardization**:
- Normalizes flights, hotels, transport from different sources
- Handles currency conversion
- Timezone normalization
- Merges duplicate results
- Standardizes formats

### 3. **RealBookingAggregator** (`src/services/realBookingAggregator.ts`)
**API integrations**:
- Skyscanner, Amadeus, Kiwi, Google Flights
- Agoda, Booking.com, Trip.com, Expedia
- GetYourGuide, Viator, Klook
- Multi-city route finding

### 4. **TransportAPIs** (`src/services/transportAPIs.ts`)
**Buses, Trains, Ferries**:
- 12Go (Asia)
- FlixBus (Europe, Americas)
- Omio (multi-modal)
- Rail Europe, Trainline
- DirectFerries

### 5. **Server-Side Functions** (`functions/src/index.ts`)
**Firebase Functions**:
- `getRealTimeBookings` - Real-time API data
- `scrapeBookingSite` - Server-side scraping
- `scrapeTravelIntelligence` - Reddit, YouTube, etc.
- `monitorPrices` - Price tracking

## 🔄 Data Flow

### Booking Search Flow:
1. **User Query** → BookingAggregator.search()
2. **Parallel Search** → All APIs simultaneously
   - Real-time APIs (Amadeus, Skyscanner)
   - Aggregator APIs (Kiwi, Omio)
   - Server-side scraping (fallback)
3. **Normalization** → DataNormalizer
   - Standardize formats
   - Currency conversion
   - Timezone handling
4. **Merge Duplicates** → Remove duplicates, keep best
5. **Find Best Deals** → Identify special offers
6. **Present** → Display to user

### Update Mechanism:
- **Real-time**: APIs with WebSocket/streaming
- **Cached**: 1-hour TTL for API results
- **Scheduled**: Firebase Functions for periodic updates
- **Event-driven**: Price alerts when thresholds met

## 🎯 What We Implemented That Works

### ✅ API Partnerships (Primary Method)
- **Amadeus Self-Service API**: Free tier, real flight data
- **Skyscanner Partner API**: Flight aggregation
- **Booking.com Affiliate**: Hotel data + commission
- **Expedia Partner Solutions**: Hotels + packages
- **12Go API**: Asia buses/trains/ferries
- **Omio API**: Multi-modal transport

### ✅ GDS Integration
- **Amadeus**: Full GDS access (flights, hotels, cars)
- Structure ready for Sabre, Travelport

### ✅ Affiliate Programs
- Booking.com Affiliate API
- Expedia Partner Solutions
- Commission-based (earn on bookings)

### ✅ Server-Side Scraping
- Firebase Functions for scraping
- Reddit API integration
- YouTube Data API
- Respects rate limits, caching

### ✅ Data Normalization
- Standardizes all sources
- Currency conversion
- Timezone handling
- Duplicate merging

### ✅ Real-Time Updates
- API polling with caching
- Price monitoring
- Alert system structure

## 🔧 How to Enable Real Data

### Step 1: Get API Keys

**Flights:**
```env
VITE_AMADEUS_CLIENT_ID=your-id
VITE_AMADEUS_CLIENT_SECRET=your-secret
VITE_SKYSCANNER_API_KEY=your-key
VITE_KIWI_API_KEY=your-key
```

**Hotels:**
```env
VITE_BOOKING_COM_AFFILIATE_ID=your-id
VITE_EXPEDIA_API_KEY=your-key
VITE_TRIP_COM_API_KEY=your-key
```

**Transport:**
```env
VITE_12GO_API_KEY=your-key
VITE_OMIO_API_KEY=your-key
VITE_FLIXBUS_API_KEY=your-key
```

**Intelligence:**
```env
VITE_REDDIT_CLIENT_ID=your-id
VITE_REDDIT_CLIENT_SECRET=your-secret
VITE_YOUTUBE_API_KEY=your-key
```

### Step 2: Deploy Firebase Functions

```bash
cd functions
npm install
firebase deploy --only functions
```

### Step 3: Set Function Parameters

```bash
firebase functions:config:set \
  amadeus.client_id="your-id" \
  amadeus.client_secret="your-secret" \
  skyscanner.api_key="your-key"
```

## 📊 How It Compares to Successful Aggregators

### Similar to Rome2Rio:
- ✅ Multi-modal search (flights, buses, trains, ferries)
- ✅ Route optimization
- ✅ Price comparison
- ✅ Real-time data

### Similar to Skyscanner:
- ✅ Multiple airline sources
- ✅ Multi-city routes
- ✅ Price alerts
- ✅ Deal detection

### Similar to Booking.com:
- ✅ Multiple hotel sources
- ✅ Price comparison
- ✅ Special offers
- ✅ Affiliate integration

## 🚀 What Makes This Better

1. **AI-Powered Intelligence**: Not just prices, but scams, tips, culture
2. **Multi-Source Aggregation**: More sources = better deals
3. **Offline-Capable**: SIM card locations work offline
4. **Cultural Context**: Translation with cultural awareness
5. **Real-Time + Cached**: Fast responses with fresh data
6. **Server-Side Scraping**: Legal, reliable, scalable

## 🔄 Update Strategy

### Real-Time (Preferred):
- Amadeus API: Real-time flight data
- Skyscanner Live Pricing: Real-time prices
- WebSocket connections (when available)

### Scheduled Refreshes:
- Firebase Functions: Hourly/daily updates
- Cache invalidation: 1-hour TTL
- Price monitoring: Check every 6 hours

### Event-Driven:
- Price drops: Alert users
- New deals: Notify immediately
- Schedule changes: Update routes

## 📈 Scalability

### Current:
- Client-side aggregation
- Firebase Functions for server-side
- 1-hour caching

### Production:
- Redis caching
- Message queue for updates
- CDN for static data
- Database for historical prices

## 🎯 Next Steps

1. **Get API Keys**: Start with Amadeus (free tier)
2. **Test APIs**: Verify data flow
3. **Deploy Functions**: Server-side scraping
4. **Monitor**: Track API usage, errors
5. **Optimize**: Cache, rate limiting, error handling

## 💡 Key Differences from Other Apps

- **Not just booking**: Includes intelligence, translation, culture
- **AI-powered**: Understands context, not just keywords
- **Multi-source**: Aggregates from everywhere
- **Offline-first**: Critical data works offline
- **Server-side**: Legal scraping, better performance

