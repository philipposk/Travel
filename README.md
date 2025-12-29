# AI Travel Assistant - Complete Travel Platform

An AI-powered comprehensive travel platform that helps you discover destinations, compare booking prices, navigate airports, and connect with a travel community.

## 🌟 Features

### Core Features
- **Intelligent Location Identification**: Upload images to identify travel destinations using AI
- **Multi-Source Booking**: Compare prices from 44+ APIs (flights, hotels, buses, trains, experiences)
- **Real-Time Airport Navigation**: Gate info, wait times, walking directions, alerts
- **AI Assistant**: Unified assistant for navigation and travel questions
- **Travel Intelligence**: Local tips, scams, cultural info, SIM cards, currency
- **Translation Services**: AI-powered translation with pronunciation
- **Immigration & Visas**: Official visa information and requirements
- **Social Media Content Creation**: Generate travel content for social media
- **Community Features**: Forums, reviews, messaging

### Advanced Features
- **Real-Time Notifications**: WhatsApp, Telegram, SMS, Email updates
- **Airport Alerts**: Delays, weather, security, protests
- **Journey Timeline**: Step-by-step airport journey with auto-refresh
- **Community Editing**: User-contributed airport information
- **Accessibility Support**: Wheelchair booking, accessible routes
- **Lounge Information**: Access and upgrade options

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ and npm
- Firebase account (for backend features)
- API keys (see setup below)

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/philipposk/Travel.git
   cd Travel
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Set up environment variables**:
   Create `.env.local` file:
   ```env
   VITE_GEMINI_API_KEY=your-gemini-key
   VITE_MAPS_API_KEY=your-maps-key
   VITE_FIREBASE_API_KEY=your-firebase-key
   VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your-project-id
   VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
   VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
   VITE_FIREBASE_APP_ID=your-app-id
   ```

4. **Run development server**:
   ```bash
   npm run dev
   ```

5. **Build for production**:
   ```bash
   npm run build
   ```

## 📚 Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** - Deployment guide (Firebase, Vercel, Netlify)
- **[ALL_APIS.md](./ALL_APIS.md)** - Complete list of 44+ integrated APIs
- **[API_SETUP.md](./API_SETUP.md)** - How to get and configure API keys
- **[ARCHITECTURE.md](./ARCHITECTURE.md)** - System architecture explanation
- **[AIRPORT_NAVIGATION_FEATURE.md](./AIRPORT_NAVIGATION_FEATURE.md)** - Airport navigation feature details
- **[ADVANCED_FEATURES.md](./ADVANCED_FEATURES.md)** - Advanced features guide

## 🛠️ Tech Stack

- **Frontend**: TypeScript, Vite, HTML/CSS
- **Backend**: Firebase (Firestore, Functions, Auth)
- **AI**: Google Gemini API
- **Maps**: Google Maps Platform
- **APIs**: 44+ travel APIs integrated

## 📋 What's Left to Do

See [DEPLOYMENT.md](./DEPLOYMENT.md) for complete checklist. Key items:

1. **Add API Keys** - Get keys from providers (see ALL_APIS.md)
2. **Firebase Setup** - Create project and enable services
3. **Wire Up UI** - Connect event listeners for new features
4. **Deploy** - Choose deployment platform (Firebase recommended)

## 🔐 Security

- Never commit `.env.local` or `.env.production`
- All secrets stored in environment variables
- Firebase Security Rules configured
- API keys secured

## 📄 License

MIT License - see [LICENSE](./LICENSE) file

## 🤝 Contributing

Contributions welcome! Please read contributing guidelines before submitting PRs.

## 📞 Support

For issues and questions, please open an issue on GitHub.

---

Built with ❤️ for travelers worldwide
