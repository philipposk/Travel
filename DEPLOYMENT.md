# Deployment Guide

## 🚀 Deployment Options

### Option 1: Firebase Hosting (Recommended)
**Best for**: Full-stack apps with Firebase backend

#### Steps:
1. **Install Firebase CLI**:
   ```bash
   npm install -g firebase-tools
   ```

2. **Login to Firebase**:
   ```bash
   firebase login
   ```

3. **Initialize Firebase Hosting**:
   ```bash
   firebase init hosting
   ```
   - Select existing project or create new
   - Public directory: `dist`
   - Single-page app: Yes
   - Set up automatic builds: Yes (if using GitHub)

4. **Build the app**:
   ```bash
   npm run build
   ```

5. **Deploy**:
   ```bash
   firebase deploy --only hosting
   ```

6. **Deploy Functions** (if using):
   ```bash
   firebase deploy --only functions
   ```

**URL**: `https://your-project-id.web.app`

---

### Option 2: Vercel
**Best for**: Fast deployment, automatic CI/CD

#### Steps:
1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Deploy**:
   ```bash
   vercel
   ```
   - Follow prompts
   - Or connect GitHub repo for automatic deployments

3. **Environment Variables**:
   - Add all `VITE_*` variables in Vercel dashboard
   - Settings → Environment Variables

**URL**: `https://your-project.vercel.app`

---

### Option 3: Netlify
**Best for**: Easy deployment, form handling

#### Steps:
1. **Install Netlify CLI**:
   ```bash
   npm install -g netlify-cli
   ```

2. **Deploy**:
   ```bash
   npm run build
   netlify deploy --prod --dir=dist
   ```

3. **Or connect GitHub**:
   - Go to Netlify dashboard
   - Connect repository
   - Build command: `npm run build`
   - Publish directory: `dist`

**URL**: `https://your-project.netlify.app`

---

### Option 4: GitHub Pages
**Best for**: Free static hosting

#### Steps:
1. **Install gh-pages**:
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Add to package.json**:
   ```json
   "scripts": {
     "deploy": "npm run build && gh-pages -d dist"
   }
   ```

3. **Deploy**:
   ```bash
   npm run deploy
   ```

**URL**: `https://philipposk.github.io/Travel`

---

## 🔧 Pre-Deployment Checklist

### 1. Environment Variables
Create `.env.production` with all API keys:
```env
VITE_GEMINI_API_KEY=your-key
VITE_MAPS_API_KEY=your-key
VITE_FIREBASE_API_KEY=your-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
VITE_FIREBASE_APP_ID=your-app-id

# Add all other API keys from ALL_APIS.md
```

### 2. Firebase Configuration
- ✅ Create Firebase project
- ✅ Enable Authentication (Google)
- ✅ Enable Firestore
- ✅ Enable Functions
- ✅ Enable Storage (if needed)
- ✅ Add Firebase config to `.env.production`

### 3. Build Configuration
- ✅ Check `vite.config.ts` for build settings
- ✅ Verify `index.html` paths
- ✅ Test build locally: `npm run build`

### 4. API Keys Setup
- ✅ Get all API keys (see `ALL_APIS.md`)
- ✅ Add to environment variables
- ✅ Test each service

### 5. Firebase Functions
- ✅ Deploy functions: `firebase deploy --only functions`
- ✅ Set function environment variables
- ✅ Test function endpoints

---

## 📋 What's Left to Do

### Critical (Must Do):
1. **Add API Keys**:
   - [ ] Gemini API key
   - [ ] Google Maps API key
   - [ ] Firebase config
   - [ ] At least one booking API (Amadeus free tier recommended)
   - [ ] Notification APIs (Twilio, Telegram, etc.)

2. **Firebase Setup**:
   - [ ] Create Firebase project
   - [ ] Enable Authentication
   - [ ] Enable Firestore
   - [ ] Enable Functions
   - [ ] Deploy functions

3. **Wire Up UI**:
   - [ ] Airport navigation tab event listeners
   - [ ] AI assistant chat interface
   - [ ] Notification preferences saving
   - [ ] Real-time updates display

4. **Test Features**:
   - [ ] Image location identification
   - [ ] Booking search
   - [ ] Airport navigation
   - [ ] Notifications
   - [ ] AI assistant

### Important (Should Do):
5. **Content**:
   - [ ] Add more sample images
   - [ ] Create help documentation
   - [ ] Add FAQ section

6. **UI/UX**:
   - [ ] Mobile responsiveness testing
   - [ ] Loading states
   - [ ] Error handling
   - [ ] Empty states

7. **Performance**:
   - [ ] Code splitting
   - [ ] Image optimization
   - [ ] Lazy loading
   - [ ] Caching strategy

### Nice to Have:
8. **Advanced Features**:
   - [ ] PWA support
   - [ ] Offline mode
   - [ ] Push notifications
   - [ ] Analytics

9. **Testing**:
   - [ ] Unit tests
   - [ ] Integration tests
   - [ ] E2E tests

10. **Documentation**:
    - [ ] User guide
    - [ ] API documentation
    - [ ] Developer guide

---

## 🔐 Security Checklist

- [ ] Never commit `.env.local` or `.env.production`
- [ ] Use environment variables for all secrets
- [ ] Enable Firebase Security Rules
- [ ] Set up CORS properly
- [ ] Validate user inputs
- [ ] Rate limiting on APIs
- [ ] HTTPS only

---

## 📱 Post-Deployment

1. **Test Live Site**:
   - Test all features
   - Check mobile responsiveness
   - Verify API integrations

2. **Monitor**:
   - Firebase Console
   - Error logs
   - API usage
   - User analytics

3. **Update**:
   - Keep dependencies updated
   - Monitor security advisories
   - Update API keys if needed

---

## 🆘 Troubleshooting

### Build Fails:
- Check TypeScript errors: `npm run build`
- Verify all imports are correct
- Check environment variables

### Functions Don't Deploy:
- Check `functions/package.json`
- Verify Firebase project ID
- Check function code for errors

### APIs Not Working:
- Verify API keys in environment variables
- Check API quotas/limits
- Test API endpoints directly

### Authentication Issues:
- Verify Firebase config
- Check OAuth redirect URLs
- Enable Google sign-in in Firebase Console

---

## 📚 Resources

- [Firebase Hosting Docs](https://firebase.google.com/docs/hosting)
- [Vercel Docs](https://vercel.com/docs)
- [Netlify Docs](https://docs.netlify.com/)
- [Vite Deployment Guide](https://vitejs.dev/guide/static-deploy.html)

