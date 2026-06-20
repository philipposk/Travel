# API Stack — Indie-Realistic Edition

Previous list of 44 APIs was 75% enterprise-only stubs. New stack uses only
APIs an independent developer can realistically obtain.

## Active APIs (indie-accessible)

### Flights
| API | Auth | Free tier | Use |
|---|---|---|---|
| **Duffel** | Bearer token | Test mode unlimited, prod = revenue share | Real flight search + actual booking |
| **Amadeus Self-Service** | OAuth client_credentials | Free monthly quota on test endpoint | Backup search + hotel + car |
| **Travelpayouts (Aviasales)** | API token + marker | Free affiliate | Cached cheap-prices + booking links + commission |

### Hotels
| API | Auth | Free tier | Use |
|---|---|---|---|
| **Amadeus Hotels** | shared w/ flights | Test endpoint | Real availability |
| **Travelpayouts (Hotellook)** | marker | Free | Cached prices, affiliate URLs |
| **Makcorps** | api_key | Free tier | Price compare across OTAs |

### Transit / Trains / Buses
| API | Auth | Use |
|---|---|---|
| **Navitia.io** | API key (free) | Global public-transit routing |
| **Transitous** | No key | Community-run routing, no quota |
| **Deutsche Bahn open-data** | No key | EU rail timetables |

### POI / Places
| API | Auth | Free tier | Use |
|---|---|---|---|
| **Geoapify Places** | apiKey | 3000/day free | POI categorized, geocoding |
| **OpenTripMap** | apikey | Free | Attractions, sights w/ Wikipedia links |
| **Foursquare Places** | API key | Generous free tier | (Optional) restaurant detail |

### Weather / Air
| API | Auth | Use |
|---|---|---|
| **Open-Meteo** | None | Forecast + 10y climatology |
| **AQICN** | token (free) | Air quality index |

### Travel intel (per-country)
| API | Auth | Use |
|---|---|---|
| **REST Countries** | None | Currency, languages, plug type via car.side etc. |
| **Nager.Date** | None | Public holidays per country/year |
| **Frankfurter** | None | FX rates, ECB-backed |
| **VisaDB** | Bearer | Visa requirements per passport→destination |
| **Wikivoyage (MediaWiki)** | None | Destination guide extracts |
| Static seed JSON | — | Plugs, tipping, water-safety, emergency numbers |

### Carbon
| API | Auth | Use |
|---|---|---|
| **Climatiq** | Bearer | CO2 per flight |

### eSIM / Connectivity
| API | Auth | Use |
|---|---|---|
| **Airalo Partner** | OAuth | eSIM catalog + orders (apply for approval) |
| Airalo affiliate URL | ref code | Fallback if partner key pending |

### Photos
| API | Auth | Use |
|---|---|---|
| **Unsplash** | Access key | 50/hr free, destination hero images |
| **Pexels** | API key | 200/hr free, fallback |

### Events
| API | Auth | Use |
|---|---|---|
| **Ticketmaster Discovery** | API key | 5000/day free |

### Intelligence (existing)
| API | Auth | Use |
|---|---|---|
| **Reddit** | App credentials or public json | Travel tips |
| **YouTube Data v3** | API key | Travel videos |
| **Gemini** | API key | All AI: itinerary, email parse, synthesis |

## Removed (require enterprise contracts)

Sabre · Travelport · Hotelbeds · Hotelspro · Nuitee · PHPTRAVELS · FlightsLogic ·
Travelopro · Skyscanner Live Pricing · Kiwi Tequila (≥50k MAU now required) ·
Trainline · FlixBus · Omio · Rail Europe · DirectFerries · 12Go · GetYourGuide ·
Viator · Klook · Flightstats · Aviationstack · VariFlight · EAN

These were scaffolded but unusable for an indie account. Replaced with
free-tier alternatives above.

## Server-side function endpoints

| Function | Purpose |
|---|---|
| `searchFlights` | Duffel + Amadeus + Travelpayouts in parallel |
| `createFlightOrder` | Duffel booking |
| `searchHotels` | Amadeus + Travelpayouts + Makcorps |
| `searchExperiences` | Geoapify + OpenTripMap POIs |
| `searchTransit` | Navitia + Transitous multi-modal |
| `searchCars` | Amadeus transfer offers |
| `getDestinationIntel` | One-shot intel (weather, air, holidays, visa, carbon, wiki, country facts, static) |
| `convertCurrency` | Frankfurter FX |
| `generateAIItinerary` | Gemini + Geoapify day-by-day plan, persisted to Firestore |
| `generateAIPackingList` | Climate+activity-aware packing list |
| `importGmailBookings` | TripIt-style email parser |
| `createGroupTrip` / `inviteToGroupTrip` / `settleUpGroupTrip` | Group + expense split |
| `listEsimPackages` / `orderEsim` | Airalo |
| `createPriceWatch` / `deletePriceWatch` | Watchlist CRUD |
| `pollPriceWatches` | Scheduled hourly poll + FCM push on drop |
| `getPoiDetails` | OpenTripMap details |
| `getTravelAssistantResponse` | Legacy travel-assistant |
| `scrapeTravelIntelligence` | Reddit + YouTube + Gemini synthesis |
