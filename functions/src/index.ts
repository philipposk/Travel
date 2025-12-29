
import {onCall} from "firebase-functions/v2/https";
import * as logger from "firebase-functions/logger";
import {GoogleGenerativeAI} from "@google/generative-ai";
import * as admin from "firebase-admin";
import {defineString} from "firebase-functions/params";

admin.initializeApp();

// Define API keys as parameters
const geminiApiKey = defineString("GEMINI_API_KEY");
const mapsApiKey = defineString("MAPS_API_KEY");

const genAI = new GoogleGenerativeAI(geminiApiKey.value());

export const getTravelAssistantResponse = onCall(async (request) => {
  const {locationQuery} = request.data;
  logger.info(`Received query for: ${locationQuery}`);

  try {
    // 1. Generate Content with Gemini
    const model = genAI.getGenerativeModel({model: "gemini-pro"});
    const linksPrompt = `Provide official government website links for visas, and tourist information for ${locationQuery}. Please format the output as a list of HTML anchor tags.`;

    const [linksResult] = await Promise.all([
      model.generateContent(linksPrompt),
    ]);

    const essentialLinks = linksResult.response.text();

    // 2. Get Geocoding and Place Details from Google Maps Platform
    const geocodingApi = `https://maps.googleapis.com/maps/api/geocode/json?address=${locationQuery}&key=${mapsApiKey.value()}`;
    const geocodingResponse = await fetch(geocodingApi);
    const geocodingData = await geocodingResponse.json();

    if (geocodingData.status !== "OK" || geocodingData.results.length === 0) {
      throw new Error("Could not find location.");
    }

    const location = geocodingData.results[0].geometry.location; // {lat, lng}

    // 3. Get Air Quality Data
    const airQualityApi = `https://airquality.googleapis.com/v1/currentConditions:lookup?key=${mapsApiKey.value()}`;
    const airQualityResponse = await fetch(airQualityApi, {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({location}),
    });
    const airQualityData = await airQualityResponse.json();
    const aqi = `${airQualityData.indexes[0].aqiDisplay} (${airQualityData.indexes[0].category})`;

    // 4. Return all data
    return {
      essentialLinks,
      location,
      aqi,
    };
  } catch (error) {
    logger.error("Error processing travel assistant request:", error);
    if (error instanceof Error) {
      throw new Error(`Error: ${error.message}`);
    }
    throw new Error("An unknown error occurred.");
  }
});

// Booking search function
export const searchBookings = onCall(async (request) => {
  const {type, destination, checkIn, checkOut, passengers, rooms, budget} = request.data;
  logger.info(`Searching ${type} bookings for ${destination}`);

  try {
    const model = genAI.getGenerativeModel({model: "gemini-pro"});
    
    // Use AI to search and compare prices across multiple sites
    const bookingSites = [
      'Skyscanner', 'Agoda', 'Booking.com', 'Expedia', 'Kayak', 
      'Airbnb', 'Rentalcars.com', 'GetYourGuide', 'Viator'
    ].join(', ');

    const prompt = `Search for ${type} bookings in ${destination} with the following criteria:
${checkIn ? `Check-in: ${checkIn}` : ''}
${checkOut ? `Check-out: ${checkOut}` : ''}
${passengers ? `Passengers: ${passengers}` : ''}
${rooms ? `Rooms: ${rooms}` : ''}
${budget ? `Budget: ${budget.currency} ${budget.min || 0} - ${budget.max || 'unlimited'}` : ''}

Search across these sites: ${bookingSites}

Return a JSON array of results with this structure:
[
  {
    "provider": "site name",
    "title": "booking title",
    "price": number,
    "currency": "USD",
    "url": "booking URL",
    "rating": number (1-5),
    "reviews": number,
    "description": "brief description",
    "isVerified": true/false,
    "scamScore": number (0-100, lower is better)
  }
]

Only return valid JSON, no other text.`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Parse JSON from response
    let results: any[] = [];
    try {
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        results = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      logger.error("Error parsing booking results:", e);
      // Return mock results as fallback
      results = [{
        provider: "Multiple Sites",
        title: `Search ${type} in ${destination}`,
        price: 0,
        currency: budget?.currency || "USD",
        url: `https://www.google.com/search?q=${encodeURIComponent(`${type} ${destination}`)}`,
        rating: 0,
        reviews: 0,
        description: "Please visit booking sites directly for current prices",
        isVerified: true,
        scamScore: 10
      }];
    }

    return {results};
  } catch (error) {
    logger.error("Error searching bookings:", error);
    throw new Error("Failed to search bookings. Please try again.");
  }
});

// Content generation function
export const generateContent = onCall(async (request) => {
  const {media, platform, templateId, style, userId} = request.data;
  logger.info(`Generating ${platform} content for user ${userId}`);

  try {
    const model = genAI.getGenerativeModel({model: "gemini-1.5-pro"});
    
    // Process media and generate content
    const mediaParts = media.map((m: any) => ({
      inlineData: {
        data: m.data,
        mimeType: m.mimeType
      }
    }));

    const prompt = `Generate social media content for ${platform} platform.
${style ? `Style: ${style}` : 'Use a modern, engaging travel style'}
${templateId ? `Template ID: ${templateId}` : ''}

Create:
1. An engaging caption (appropriate length for ${platform})
2. Relevant hashtags
3. Content description

Return JSON:
{
  "caption": "caption text",
  "hashtags": ["hashtag1", "hashtag2"],
  "description": "content description"
}`;

    const result = await model.generateContent([prompt, ...mediaParts]);
    const responseText = result.response.text();

    let contentData: any;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        contentData = JSON.parse(jsonMatch[0]);
      } else {
        contentData = {
          caption: responseText,
          hashtags: ['travel', 'wanderlust'],
          description: 'Generated content'
        };
      }
    } catch (e) {
      contentData = {
        caption: responseText,
        hashtags: ['travel', 'wanderlust'],
        description: 'Generated content'
      };
    }

    // Return content (in real app, would process images/videos)
    const contents = media.map((m: any, index: number) => ({
      type: m.mimeType.startsWith('image/') ? 'image' : 'video',
      platform,
      content: `data:${m.mimeType};base64,${m.data}`, // Base64 data URL
      caption: contentData.caption,
      hashtags: contentData.hashtags,
      templateId
    }));

    return {contents};
  } catch (error) {
    logger.error("Error generating content:", error);
    throw new Error("Failed to generate content. Please try again.");
  }
});

// Server-side booking scraping (for sites without APIs)
export const scrapeBookingSite = onCall(async (request) => {
  const {site, url, query} = request.data;
  logger.info(`Scraping ${site} for: ${query}`);

  try {
    // Server-side scraping using Puppeteer or similar
    // This would be implemented with a headless browser
    // For now, return structure
    
    // Note: In production, use:
    // - Puppeteer for dynamic sites
    // - Cheerio for static HTML
    // - Respect robots.txt
    // - Implement rate limiting
    // - Cache results
    
    return {
      results: [],
      source: site,
      scrapedAt: new Date().toISOString(),
      note: 'Scraping implementation needed'
    };
  } catch (error) {
    logger.error("Error scraping booking site:", error);
    throw new Error("Failed to scrape booking site.");
  }
});

// Real-time booking data from APIs
export const getRealTimeBookings = onCall(async (request) => {
  const {type, from, to, date, passengers} = request.data;
  logger.info(`Getting real-time ${type} data: ${from} → ${to}`);

  try {
    const results: any[] = [];

    // Amadeus API (if configured)
    const amadeusKey = defineString("AMADEUS_CLIENT_ID");
    const amadeusSecret = defineString("AMADEUS_CLIENT_SECRET");
    
    if (amadeusKey.value() && type === 'flight') {
      try {
        // Get access token
        const tokenResponse = await fetch('https://test.api.amadeus.com/v1/security/oauth2/token', {
          method: 'POST',
          headers: {'Content-Type': 'application/x-www-form-urlencoded'},
          body: `grant_type=client_credentials&client_id=${amadeusKey.value()}&client_secret=${amadeusSecret.value()}`
        });
        const tokenData = await tokenResponse.json();
        
        if (tokenData.access_token) {
          // Search flights
          const flightSearch = await fetch(
            `https://test.api.amadeus.com/v2/shopping/flight-offers?originLocationCode=${from}&destinationLocationCode=${to}&departureDate=${date}&adults=${passengers}`,
            {
              headers: {'Authorization': `Bearer ${tokenData.access_token}`}
            }
          );
          const flightData = await flightSearch.json();
          
          if (flightData.data) {
            results.push(...flightData.data.map((f: any) => ({
              provider: 'Amadeus',
              segments: f.itineraries[0]?.segments || [],
              price: f.price?.total || 0,
              currency: f.price?.currency || 'USD',
              source: 'amadeus'
            })));
          }
        }
      } catch (error) {
        logger.error("Amadeus API error:", error);
      }
    }

    // Skyscanner API (if configured)
    const skyscannerKey = defineString("SKYSCANNER_API_KEY");
    if (skyscannerKey.value() && type === 'flight') {
      try {
        // Skyscanner Live Pricing API
        // Would implement here
      } catch (error) {
        logger.error("Skyscanner API error:", error);
      }
    }

    return {results, sources: ['amadeus', 'skyscanner'].filter(s => 
      (s === 'amadeus' && amadeusKey.value()) || 
      (s === 'skyscanner' && skyscannerKey.value())
    )};
  } catch (error) {
    logger.error("Error getting real-time bookings:", error);
    throw new Error("Failed to get real-time booking data.");
  }
});

// Scrape travel intelligence (Reddit, YouTube, etc.)
export const scrapeTravelIntelligence = onCall(async (request) => {
  const {location, sources} = request.data;
  logger.info(`Scraping travel intelligence for: ${location}`);

  try {
    const intelligence: any = {
      location,
      reddit: [],
      youtube: [],
      instagram: [],
      facebook: [],
      scrapedAt: new Date().toISOString()
    };

    // Reddit scraping
    if (sources?.includes('reddit') || !sources) {
      try {
        // Reddit API
        const redditResponse = await fetch(
          `https://www.reddit.com/r/travel/search.json?q=${encodeURIComponent(location)}&limit=10&sort=relevance`,
          {
            headers: {'User-Agent': 'TravelApp/1.0'}
          }
        );
        const redditData = await redditResponse.json();
        
        if (redditData.data?.children) {
          intelligence.reddit = redditData.data.children.map((post: any) => ({
            title: post.data.title,
            content: post.data.selftext,
            url: `https://reddit.com${post.data.permalink}`,
            score: post.data.score,
            subreddit: post.data.subreddit
          }));
        }
      } catch (error) {
        logger.error("Reddit scraping error:", error);
      }
    }

    // YouTube scraping
    if (sources?.includes('youtube') || !sources) {
      try {
        const youtubeKey = defineString("YOUTUBE_API_KEY");
        if (youtubeKey.value()) {
          const youtubeResponse = await fetch(
            `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(`travel ${location} tips`)}&type=video&maxResults=10&key=${youtubeKey.value()}`
          );
          const youtubeData = await youtubeResponse.json();
          
          if (youtubeData.items) {
            intelligence.youtube = youtubeData.items.map((item: any) => ({
              title: item.snippet.title,
              description: item.snippet.description,
              url: `https://youtube.com/watch?v=${item.id.videoId}`,
              thumbnail: item.snippet.thumbnails.default.url,
              channel: item.snippet.channelTitle
            }));
          }
        }
      } catch (error) {
        logger.error("YouTube scraping error:", error);
      }
    }

    // Use AI to synthesize
    const model = genAI.getGenerativeModel({model: "gemini-pro"});
    const synthesisPrompt = `Based on Reddit posts and YouTube videos about ${location}, extract:
1. Common scams and how to avoid them
2. Transportation tips (taxis, tuktuks, public transport)
3. SIM card information (where to buy, prices)
4. Currency exchange tips
5. Cultural tips (greetings, customs)

Reddit posts: ${JSON.stringify(intelligence.reddit.slice(0, 5))}
YouTube videos: ${JSON.stringify(intelligence.youtube.slice(0, 5))}

Format as JSON.`;

    const synthesis = await model.generateContent(synthesisPrompt);
    const synthesisText = synthesis.response.text();
    
    try {
      const jsonMatch = synthesisText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        intelligence.synthesized = JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      logger.error("Error parsing synthesis:", e);
    }

    return intelligence;
  } catch (error) {
    logger.error("Error scraping travel intelligence:", error);
    throw new Error("Failed to scrape travel intelligence.");
  }
});

// Real-time price monitoring
export const monitorPrices = onCall(async (request) => {
  const {query, alertThreshold} = request.data;
  logger.info(`Monitoring prices for: ${JSON.stringify(query)}`);

  try {
    // This would:
    // 1. Store query in Firestore
    // 2. Set up scheduled function to check prices
    // 3. Alert user when price drops below threshold
    
    // For now, return current prices
    const currentPrices = await getRealTimeBookings({data: query});
    
    return {
      currentPrices: currentPrices.data,
      monitoring: true,
      alertThreshold
    };
  } catch (error) {
    logger.error("Error monitoring prices:", error);
    throw new Error("Failed to set up price monitoring.");
  }
});
