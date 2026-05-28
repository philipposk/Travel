# AI Travel Assistant

A travel helper website that brings everything you need for a trip into one place. It can identify a destination from a photo, compare prices across many booking sites, guide you around airports in real time, and answer travel questions with the help of AI. It's for travellers who want planning, booking, and on-the-go help without juggling a dozen different apps.

## What it does
- Upload a photo and it tells you where the place is
- Compares flight, hotel, train, bus and experience prices from many sources at once
- Helps you find your gate, see wait times, and walk through the airport step by step
- Answers travel questions and gives local tips, scam warnings, and culture notes
- Translates phrases and shows how to pronounce them
- Looks up visa and entry requirements for different countries
- Sends real-time alerts about delays, weather, and other disruptions

## Status
Work in progress — a website you open in a browser. The core features are built, but it still needs API keys and some final wiring before everything works. See `WHAT_TO_DO_NEXT.md` and `DEPLOYMENT.md` for the remaining steps.

---
### For developers
Built with TypeScript and Vite (single-page web app), with Firebase (Firestore, Functions, Auth) on the backend. AI features use Google Gemini; maps use the Google Maps Platform. Integrates 40+ travel APIs (see `ALL_APIS.md`).

Key folders: `src/` (app source), `functions/` (Firebase Cloud Functions), `public/`, `dist/` (build output). Setup: `npm install`, create `.env.local` with the `VITE_*` keys listed in `.env.example`, then `npm run dev`. Build with `npm run build`; deploy with `firebase deploy`. More docs: `ARCHITECTURE.md`, `API_SETUP.md`, `FEATURES.md`, `OAUTH_PROVIDERS.md`.
