// AI Assistant Service - Unified assistant for webapp navigation and chat

import { GoogleGenerativeAI } from "@google/generative-ai";

export interface AssistantMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  context?: {
    page?: string;
    feature?: string;
    flightNumber?: string;
    airportCode?: string;
  };
}

export interface AssistantContext {
  currentPage?: string;
  userPreferences?: any;
  activeFlight?: {
    number: string;
    airport: string;
    date: string;
  };
  conversationHistory?: AssistantMessage[];
}

export class AIAssistant {
  private genAI: GoogleGenerativeAI;
  private conversationHistory: AssistantMessage[] = [];
  private context: AssistantContext = {};

  constructor(genAI: GoogleGenerativeAI) {
    this.genAI = genAI;
  }

  // Set context for the assistant
  setContext(context: AssistantContext) {
    this.context = { ...this.context, ...context };
  }

  // Get conversation history
  getHistory(): AssistantMessage[] {
    return this.conversationHistory;
  }

  // Clear conversation history
  clearHistory() {
    this.conversationHistory = [];
  }

  // Chat with assistant
  async chat(
    message: string,
    options?: {
      includeContext?: boolean;
      includeHistory?: boolean;
    }
  ): Promise<AssistantMessage> {
    const userMessage: AssistantMessage = {
      id: Math.random().toString(36),
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      context: {
        page: this.context.currentPage,
        feature: this.detectFeature(message),
        flightNumber: this.context.activeFlight?.number,
        airportCode: this.context.activeFlight?.airport
      }
    };

    this.conversationHistory.push(userMessage);

    // Build prompt with context
    let prompt = this.buildPrompt(message, options);

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      const assistantMessage: AssistantMessage = {
        id: Math.random().toString(36),
        role: 'assistant',
        content: responseText,
        timestamp: new Date().toISOString()
      };

      this.conversationHistory.push(assistantMessage);
      return assistantMessage;
    } catch (error) {
      console.error('AI Assistant error:', error);
      return {
        id: Math.random().toString(36),
        role: 'assistant',
        content: 'I apologize, but I encountered an error. Please try again.',
        timestamp: new Date().toISOString()
      };
    }
  }

  // Build prompt with context and history
  private buildPrompt(
    message: string,
    options?: { includeContext?: boolean; includeHistory?: boolean }
  ): string {
    let prompt = `You are a helpful travel assistant for a comprehensive travel app. Help users navigate the app, answer travel questions, and provide useful information.

Available features:
- Airport navigation and real-time updates
- Flight booking and price comparison
- Hotel booking
- Travel intelligence (scams, tips, cultural info)
- Translation
- Immigration and visa information
- Community features
- Social media content creation

`;

    // Add context
    if (options?.includeContext !== false && this.context.currentPage) {
      prompt += `Current page: ${this.context.currentPage}\n`;
    }

    if (this.context.activeFlight) {
      prompt += `Active flight: ${this.context.activeFlight.number} from ${this.context.activeFlight.airport} on ${this.context.activeFlight.date}\n`;
    }

    // Add conversation history
    if (options?.includeHistory !== false && this.conversationHistory.length > 0) {
      prompt += `\nRecent conversation:\n`;
      this.conversationHistory.slice(-5).forEach(msg => {
        prompt += `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}\n`;
      });
    }

    prompt += `\nUser question: ${message}\n\nProvide a helpful, accurate response. If you don't know something, say so.`;

    return prompt;
  }

  // Detect which feature the user is asking about
  private detectFeature(message: string): string | undefined {
    const lowerMessage = message.toLowerCase();

    if (lowerMessage.includes('airport') || lowerMessage.includes('gate') || lowerMessage.includes('terminal')) {
      return 'airport-navigation';
    }
    if (lowerMessage.includes('flight') || lowerMessage.includes('book') || lowerMessage.includes('price')) {
      return 'booking';
    }
    if (lowerMessage.includes('hotel') || lowerMessage.includes('accommodation')) {
      return 'hotel';
    }
    if (lowerMessage.includes('translate') || lowerMessage.includes('language')) {
      return 'translation';
    }
    if (lowerMessage.includes('visa') || lowerMessage.includes('immigration')) {
      return 'immigration';
    }
    if (lowerMessage.includes('scam') || lowerMessage.includes('tip') || lowerMessage.includes('culture')) {
      return 'travel-intelligence';
    }

    return undefined;
  }

  // Navigate user to a feature
  navigateToFeature(feature: string): string {
    const featureMap: Record<string, string> = {
      'airport-navigation': 'airport-tab',
      'booking': 'booking-tab',
      'hotel': 'booking-tab',
      'translation': 'translator-tab',
      'immigration': 'immigration-tab',
      'travel-intelligence': 'intelligence-tab'
    };

    const tabId = featureMap[feature];
    if (tabId) {
      // Trigger tab switch
      const tabButton = document.querySelector(`[data-tab="${tabId.replace('-tab', '')}"]`);
      if (tabButton) {
        (tabButton as HTMLElement).click();
        return `I've opened the ${feature} section for you.`;
      }
    }

    return `I can help you with ${feature}. Let me know what you need!`;
  }

  // Get help for navigating the app
  async getNavigationHelp(): Promise<string> {
    return `I can help you navigate the app! Here are the main features:

🏛️ **Airport Navigation**: Real-time gate info, walking times, wait times
✈️ **Bookings**: Search flights, hotels, buses, trains with price comparison
🌍 **Travel Intelligence**: Local tips, scams, cultural info, SIM cards, currency
🗣️ **Translator**: AI-powered translation with pronunciation
🛂 **Immigration & Visas**: Visa requirements and official links
💬 **Community**: Forums, reviews, AI chat
📱 **Content Creator**: Generate social media content

Just ask me what you need help with!`;
  }

  // Answer travel-related questions
  async answerTravelQuestion(question: string): Promise<string> {
    const prompt = `You are a travel expert. Answer this travel question accurately and helpfully:

${question}

Provide detailed, accurate information. If you're unsure about something, say so.`;

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Error answering travel question:', error);
      return 'I apologize, but I encountered an error. Please try again.';
    }
  }

  // Provide airport-specific help
  async getAirportHelp(airportCode: string, question: string): Promise<string> {
    const prompt = `You are helping a traveler at ${airportCode} airport. They asked: "${question}"

Provide helpful, specific information about this airport. Include:
- Gate locations and walking times
- Security and passport control wait times
- Facilities (lounges, restaurants, shops)
- Transportation options
- Accessibility services

Be concise and actionable.`;

    try {
      const model = this.genAI.getGenerativeModel({ model: 'gemini-pro' });
      const result = await model.generateContent(prompt);
      return result.response.text();
    } catch (error) {
      console.error('Error providing airport help:', error);
      return 'I apologize, but I encountered an error. Please try again.';
    }
  }
}

