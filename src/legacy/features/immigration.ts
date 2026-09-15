import { collection, addDoc, getDocs, query, where } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface VisaInfo {
  country: string;
  visaType: string;
  requirements: string[];
  officialWebsite: string;
  processingTime: string;
  cost: string;
  validity: string;
  isEVisaAvailable: boolean;
  evisaWebsite?: string;
}

export interface ImmigrationInfo {
  country: string;
  entryRequirements: string[];
  customsRegulations: string[];
  healthRequirements: string[];
  officialResources: Array<{
    name: string;
    url: string;
    type: 'visa' | 'customs' | 'health' | 'general';
  }>;
}

export class ImmigrationManager {
  private db;
  private genAI: GoogleGenerativeAI;

  constructor(db: any, geminiApiKey: string) {
    this.db = db;
    this.genAI = new GoogleGenerativeAI(geminiApiKey);
  }

  // Get visa information for a country
  async getVisaInfo(country: string, nationality: string = 'US'): Promise<VisaInfo | null> {
    try {
      // Check cache first
      const cached = await this.getCachedVisaInfo(country, nationality);
      if (cached) {
        return cached;
      }

      // Use AI to get visa information
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      const prompt = `Provide detailed visa information for ${nationality} citizens traveling to ${country}. Include:
1. Visa type required
2. Requirements
3. Official government website URL
4. Processing time
5. Cost
6. Validity period
7. Whether e-visa is available
8. E-visa website if available

Format as JSON with these exact keys: visaType, requirements (array), officialWebsite, processingTime, cost, validity, isEVisaAvailable, evisaWebsite.`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Try to parse JSON from response
      let visaData: any;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          visaData = JSON.parse(jsonMatch[0]);
        } else {
          // Fallback: parse manually
          visaData = this.parseVisaInfoFromText(responseText, country);
        }
      } catch (e) {
        visaData = this.parseVisaInfoFromText(responseText, country);
      }

      const visaInfo: VisaInfo = {
        country,
        visaType: visaData.visaType || 'Check official website',
        requirements: Array.isArray(visaData.requirements) ? visaData.requirements : [visaData.requirements || 'Check official website'],
        officialWebsite: visaData.officialWebsite || `https://www.google.com/search?q=${encodeURIComponent(country + ' visa official website')}`,
        processingTime: visaData.processingTime || 'Varies',
        cost: visaData.cost || 'Check official website',
        validity: visaData.validity || 'Varies',
        isEVisaAvailable: visaData.isEVisaAvailable || false,
        evisaWebsite: visaData.evisaWebsite
      };

      // Cache the result
      await this.cacheVisaInfo(country, nationality, visaInfo);

      return visaInfo;
    } catch (error) {
      console.error('Error getting visa info:', error);
      return null;
    }
  }

  // Get comprehensive immigration information
  async getImmigrationInfo(country: string): Promise<ImmigrationInfo | null> {
    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      const prompt = `Provide comprehensive immigration information for ${country}. Include:
1. Entry requirements
2. Customs regulations
3. Health requirements
4. Official government resources with URLs

Format as JSON with keys: entryRequirements (array), customsRegulations (array), healthRequirements (array), officialResources (array of objects with name, url, type).`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      let immigrationData: any;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          immigrationData = JSON.parse(jsonMatch[0]);
        }
      } catch (e) {
        // Fallback parsing
        immigrationData = {
          entryRequirements: ['Check official website'],
          customsRegulations: ['Check official website'],
          healthRequirements: ['Check official website'],
          officialResources: []
        };
      }

      return {
        country,
        entryRequirements: Array.isArray(immigrationData.entryRequirements) 
          ? immigrationData.entryRequirements 
          : ['Check official website'],
        customsRegulations: Array.isArray(immigrationData.customsRegulations)
          ? immigrationData.customsRegulations
          : ['Check official website'],
        healthRequirements: Array.isArray(immigrationData.healthRequirements)
          ? immigrationData.healthRequirements
          : ['Check official website'],
        officialResources: Array.isArray(immigrationData.officialResources)
          ? immigrationData.officialResources
          : []
      };
    } catch (error) {
      console.error('Error getting immigration info:', error);
      return null;
    }
  }

  // Get cached visa info
  private async getCachedVisaInfo(country: string, nationality: string) {
    try {
      const q = query(
        collection(this.db, 'visaInfo'),
        where('country', '==', country),
        where('nationality', '==', nationality)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        // Check if cache is still valid (24 hours)
        const cacheAge = Date.now() - data.cachedAt?.toDate().getTime();
        if (cacheAge < 24 * 60 * 60 * 1000) {
          return data.info as VisaInfo;
        }
      }
    } catch (error) {
      console.error('Error getting cached visa info:', error);
    }
    return null;
  }

  // Cache visa info
  private async cacheVisaInfo(country: string, nationality: string, info: VisaInfo) {
    try {
      await addDoc(collection(this.db, 'visaInfo'), {
        country,
        nationality,
        info,
        cachedAt: new Date()
      });
    } catch (error) {
      console.error('Error caching visa info:', error);
    }
  }

  // Parse visa info from text (fallback)
  private parseVisaInfoFromText(_text: string, country: string): any {
    return {
      visaType: 'Check official website',
      requirements: ['Check official website'],
      officialWebsite: `https://www.google.com/search?q=${encodeURIComponent(country + ' visa official website')}`,
      processingTime: 'Varies',
      cost: 'Check official website',
      validity: 'Varies',
      isEVisaAvailable: false
    };
  }
}

