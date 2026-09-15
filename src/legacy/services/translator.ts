// AI-Powered Live Translator
// Similar to 3PO but better

export interface Translation {
  original: string;
  translated: string;
  language: string;
  pronunciation?: string;
  audioUrl?: string;
}

export interface CulturalContext {
  formal: boolean;
  context: string;
  alternatives: string[];
}

export class AITranslator {
  private genAI: any;

  constructor(genAI: any) {
    this.genAI = genAI;
  }

  // Translate text with cultural context
  async translate(
    text: string,
    targetLanguage: string,
    sourceLanguage: string = 'en',
    context?: CulturalContext
  ): Promise<Translation> {
    if (!this.genAI) {
      throw new Error('Gemini AI not configured');
    }

    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    let prompt = `Translate "${text}" from ${sourceLanguage} to ${targetLanguage}`;
    
    if (context) {
      prompt += `. Context: ${context.context}. ${context.formal ? 'Use formal language' : 'Use casual language'}.`;
    }
    
    prompt += ` Also provide pronunciation guide. Format as JSON: {"translated": "...", "pronunciation": "..."}`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        return {
          original: text,
          translated: data.translated || text,
          language: targetLanguage,
          pronunciation: data.pronunciation
        };
      }
    } catch (error) {
      console.error('Translation error:', error);
    }

    return {
      original: text,
      translated: text,
      language: targetLanguage
    };
  }

  // Translate with voice (text-to-speech)
  async translateWithVoice(
    text: string,
    targetLanguage: string,
    sourceLanguage: string = 'en'
  ): Promise<Translation & { audioUrl: string }> {
    const translation = await this.translate(text, targetLanguage, sourceLanguage);
    
    // Generate audio URL (would use Google TTS or similar)
    const audioUrl = await this.generateAudio(translation.translated, targetLanguage);
    
    return {
      ...translation,
      audioUrl
    };
  }

  // Learn useful phrases for a location
  async learnPhrases(location: string, category: 'greetings' | 'directions' | 'food' | 'emergency' | 'shopping'): Promise<Array<{
    english: string;
    local: string;
    pronunciation: string;
    audioUrl?: string;
  }>> {
    if (!this.genAI) {
      throw new Error('Gemini AI not configured');
    }

    const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
    
    // Determine language from location
    const language = this.getLanguageFromLocation(location);
    
    const prompt = `Provide 10 essential ${category} phrases in ${language} for travelers visiting ${location}. 
    Include English phrase, ${language} translation, and pronunciation guide. 
    Format as JSON array: [{"english": "...", "local": "...", "pronunciation": "..."}]`;

    try {
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();
      
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Error learning phrases:', error);
    }

    return [];
  }

  // Real-time conversation translator
  async translateConversation(
    messages: Array<{ text: string; language: string }>,
    targetLanguage: string
  ): Promise<Translation[]> {
    const translations: Translation[] = [];

    for (const message of messages) {
      if (message.language !== targetLanguage) {
        const translation = await this.translate(message.text, targetLanguage, message.language);
        translations.push(translation);
      } else {
        translations.push({
          original: message.text,
          translated: message.text,
          language: targetLanguage
        });
      }
    }

    return translations;
  }

  // Generate audio from text
  private async generateAudio(_text: string, _language: string): Promise<string> {
    // Would use Google Cloud Text-to-Speech API or similar
    // For now, return placeholder
    return `data:audio/wav;base64,...`; // Placeholder
  }

  // Get language from location
  private getLanguageFromLocation(location: string): string {
    // Simple mapping (would be more sophisticated)
    const mapping: Record<string, string> = {
      'thailand': 'Thai',
      'spain': 'Spanish',
      'france': 'French',
      'germany': 'German',
      'italy': 'Italian',
      'portugal': 'Portuguese',
      'russia': 'Russian',
      'china': 'Chinese',
      'japan': 'Japanese',
      'korea': 'Korean',
      'saudi arabia': 'Arabic',
      'india': 'Hindi',
      'laos': 'Lao',
      'vietnam': 'Vietnamese',
    };

    const lower = location.toLowerCase();
    for (const [key, lang] of Object.entries(mapping)) {
      if (lower.includes(key)) {
        return lang;
      }
    }

    return 'English'; // Default
  }
}

