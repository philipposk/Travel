// Reverse Image Search Service
// Supports multiple APIs as fallback options

export interface ReverseImageSearchResult {
  source: string;
  confidence: number;
  location?: string;
  description?: string;
  similarImages?: string[];
  metadata?: any;
}

export interface ReverseImageSearchAPI {
  name: string;
  search(imageData: string, mimeType: string): Promise<ReverseImageSearchResult | null>;
}

export class ReverseImageSearchService {
  private apis: ReverseImageSearchAPI[] = [];

  constructor(_geminiApiKey: string) {
    this.initializeAPIs();
  }

  private initializeAPIs() {
    // Google Cloud Vision API
    if (import.meta.env.VITE_GOOGLE_VISION_API_KEY) {
      this.apis.push(new GoogleVisionAPI(import.meta.env.VITE_GOOGLE_VISION_API_KEY));
    }

    // SerpAPI
    if (import.meta.env.VITE_SERPAPI_KEY) {
      this.apis.push(new SerpAPI(import.meta.env.VITE_SERPAPI_KEY));
    }

    // TinEye API
    if (import.meta.env.VITE_TINEYE_API_KEY) {
      this.apis.push(new TinEyeAPI(import.meta.env.VITE_TINEYE_API_KEY));
    }

    // Google Lens (via custom search)
    if (import.meta.env.VITE_GOOGLE_CSE_API_KEY && import.meta.env.VITE_GOOGLE_CSE_ID) {
      this.apis.push(new GoogleLensAPI(
        import.meta.env.VITE_GOOGLE_CSE_API_KEY,
        import.meta.env.VITE_GOOGLE_CSE_ID
      ));
    }

    // RapidAPI options
    if (import.meta.env.VITE_RAPIDAPI_KEY) {
      this.apis.push(new RapidAPIImageSearch(import.meta.env.VITE_RAPIDAPI_KEY));
    }
  }

  // Search using all available APIs and return best result
  async search(imageData: string, mimeType: string): Promise<ReverseImageSearchResult | null> {
    // Try all APIs in parallel
    const promises = this.apis.map(api => 
      api.search(imageData, mimeType).catch(err => {
        console.error(`Error with ${api.name}:`, err);
        return null;
      })
    );

    const apiResults = await Promise.all(promises);
    const validResults = apiResults.filter(r => r !== null) as ReverseImageSearchResult[];

    if (validResults.length === 0) {
      return null;
    }

    // Return result with highest confidence
    return validResults.reduce((best, current) => 
      current.confidence > best.confidence ? current : best
    );
  }

  // Pre-analyze image before sending to AI
  async preAnalyze(imageData: string, mimeType: string): Promise<string | null> {
    const result = await this.search(imageData, mimeType);
    if (result && result.location) {
      return `This image appears to be of: ${result.location}. ${result.description || ''}`;
    }
    return null;
  }
}

// Google Cloud Vision API Implementation
class GoogleVisionAPI implements ReverseImageSearchAPI {
  name = 'Google Cloud Vision';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(imageData: string, _mimeType: string): Promise<ReverseImageSearchResult | null> {
    try {
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${this.apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: imageData },
              features: [
                { type: 'LANDMARK_DETECTION', maxResults: 5 },
                { type: 'LABEL_DETECTION', maxResults: 10 },
                { type: 'WEB_DETECTION', maxResults: 5 }
              ]
            }]
          })
        }
      );

      const data = await response.json();
      if (data.responses && data.responses[0]) {
        const resp = data.responses[0];
        
        // Check for landmarks
        if (resp.landmarkAnnotations && resp.landmarkAnnotations.length > 0) {
          const landmark = resp.landmarkAnnotations[0];
          return {
            source: this.name,
            confidence: landmark.score || 0.8,
            location: landmark.description,
            description: `Landmark detected: ${landmark.description}`
          };
        }

        // Check web detection
        if (resp.webDetection && resp.webDetection.webEntities) {
          const entities = resp.webDetection.webEntities.filter((e: any) => e.score > 0.5);
          if (entities.length > 0) {
            return {
              source: this.name,
              confidence: entities[0].score,
              location: entities[0].description,
              description: `Web entity: ${entities[0].description}`
            };
          }
        }

        // Use labels
        if (resp.labelAnnotations && resp.labelAnnotations.length > 0) {
          const label = resp.labelAnnotations[0];
          return {
            source: this.name,
            confidence: label.score || 0.6,
            description: `Label: ${label.description}`
          };
        }
      }
    } catch (error) {
      console.error('Google Vision API error:', error);
    }
    return null;
  }
}

// SerpAPI Implementation
class SerpAPI implements ReverseImageSearchAPI {
  name = 'SerpAPI';

  constructor(_apiKey: string) {
    // API key stored but not used in this placeholder implementation
  }

  async search(_imageData: string, _mimeType: string): Promise<ReverseImageSearchResult | null> {
    try {
      // SerpAPI requires image URL, so we'd need to upload image first
      // For now, return null - would need image hosting service
      return null;
    } catch (error) {
      console.error('SerpAPI error:', error);
      return null;
    }
  }
}

// TinEye API Implementation
class TinEyeAPI implements ReverseImageSearchAPI {
  name = 'TinEye';
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async search(imageData: string, mimeType: string): Promise<ReverseImageSearchResult | null> {
    try {
      const response = await fetch('https://api.tineye.com/rest/search/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tineye-API-Key': this.apiKey
        },
        body: JSON.stringify({
          image_url: `data:${mimeType};base64,${imageData}` // Would need proper URL
        })
      });

      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const _results = data.results;
        return {
          source: this.name,
          confidence: _results[0].score || 0.7,
          similarImages: _results.map((r: any) => r.image_url)
        };
      }
    } catch (error) {
      console.error('TinEye API error:', error);
    }
    return null;
  }
}

// Google Lens / Custom Search API
class GoogleLensAPI implements ReverseImageSearchAPI {
  name = 'Google Lens';

  constructor(_apiKey: string, _cseId: string) {
    // API keys stored but not used in this placeholder implementation
  }

  async search(_imageData: string, _mimeType: string): Promise<ReverseImageSearchResult | null> {
    // Google Custom Search JSON API for reverse image search
    try {
      // Would need to use Google Lens API or image search
      // This is a placeholder - actual implementation would require proper API
      return null;
    } catch (error) {
      console.error('Google Lens API error:', error);
      return null;
    }
  }
}

// RapidAPI Image Search
class RapidAPIImageSearch implements ReverseImageSearchAPI {
  name = 'RapidAPI';

  constructor(_apiKey: string) {
    // API key stored but not used in this placeholder implementation
  }

  async search(_imageData: string, _mimeType: string): Promise<ReverseImageSearchResult | null> {
    try {
      // Would use specific RapidAPI endpoint
      // Placeholder for now
      return null;
    } catch (error) {
      console.error('RapidAPI error:', error);
      return null;
    }
  }
}

