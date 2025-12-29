
import { initializeApp } from "firebase/app";
import { getFunctions, httpsCallable } from "firebase/functions";
import { getAuth, GoogleAuthProvider, FacebookAuthProvider, TwitterAuthProvider, GithubAuthProvider, OAuthProvider, signInWithPopup, signOut, onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { setupMultiProviderAuth } from "./authSetup";
import { getFirestore, collection, addDoc, getDocs, query, where, doc, deleteDoc } from "firebase/firestore";
import { GoogleGenerativeAI } from "@google/generative-ai";
import "./style.css";

// Import feature modules
import { SocialManager } from "./features/social";
import { MapsRepository } from "./features/mapsRepository";
import { BookingManager } from "./features/booking";
import { CommunityManager } from "./features/community";
import { ContentCreator } from "./features/contentCreator";
import { ImmigrationManager } from "./features/immigration";
import { ReverseImageSearchService } from "./services/reverseImageSearch";
import { RealBookingSearchService } from "./services/bookingSearch";
import { TravelIntelligenceService } from "./services/travelIntelligence";
import { AITranslator } from "./services/translator";
import { BookingAggregator } from "./services/bookingAggregator";
import { TransportAPIs } from "./services/transportAPIs";
import { AirportService } from "./services/airportService";
import { NotificationService } from "./services/notificationService";
import { AirportAlertsService } from "./services/airportAlertsService";
import { CommunityEditor } from "./services/communityEditor";
import { AIAssistant } from "./services/aiAssistant";

// --- FIREBASE AND API INITIALIZATION ---

// Initialize Firebase with error handling
let app: any = null;
let functions: any = null;
let auth: any = null;
let db: any = null;

try {
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

  // Check if Firebase config is valid
  if (firebaseConfig.apiKey && firebaseConfig.projectId) {
    app = initializeApp(firebaseConfig);
    functions = getFunctions(app);
    auth = getAuth(app);
    db = getFirestore(app);
    console.log('Firebase initialized successfully');
  } else {
    console.warn('Firebase config incomplete. Some features will be disabled.');
  }
} catch (error) {
  console.error('Firebase initialization failed:', error);
  console.warn('App will continue without Firebase features');
}

// Initialize Gemini AI
let genAI: GoogleGenerativeAI | null = null;
try {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (geminiKey) {
    genAI = new GoogleGenerativeAI(geminiKey);
    console.log('Gemini AI initialized successfully');
  } else {
    console.warn('Gemini API key not found. AI features will be disabled.');
  }
} catch (error) {
  console.error('Gemini AI initialization failed:', error);
}

// Initialize feature managers (with null checks)
const socialManager = db ? new SocialManager(db) : null;
const mapsRepository = db ? new MapsRepository(db) : null;
const bookingManager = (db && functions) ? new BookingManager(db, functions) : null;
const communityManager = (db && genAI) ? new CommunityManager(db, import.meta.env.VITE_GEMINI_API_KEY || '') : null;
const contentCreator = (db && functions) ? new ContentCreator(db, functions) : null;
const immigrationManager = (db && genAI) ? new ImmigrationManager(db, import.meta.env.VITE_GEMINI_API_KEY || '') : null;
const reverseImageSearch = genAI ? new ReverseImageSearchService(import.meta.env.VITE_GEMINI_API_KEY || '') : null;
const realBookingSearch = new RealBookingSearchService();
const travelIntelligence = genAI ? new TravelIntelligenceService(genAI) : null;
const translator = genAI ? new AITranslator(genAI) : null;
const bookingAggregator = new BookingAggregator();
const transportAPIs = new TransportAPIs();
const airportService = new AirportService();
const notificationService = new NotificationService();
const airportAlertsService = new AirportAlertsService();
const communityEditor = db ? new CommunityEditor(db) : null;
const aiAssistant = genAI ? new AIAssistant(genAI) : null;

// --- UI ELEMENTS ---
const signInButton = document.getElementById("sign-in-button");
const signOutButton = document.getElementById("sign-out-button");
const userInfoDiv = document.getElementById("user-info");
const mediaSelection = document.getElementById("media-selection");
const promptButton = document.getElementById("prompt-button");
const responseContainer = document.getElementById("response");
const refineReviewButton = document.getElementById("refine-review-button");
const todoInput = document.getElementById("todo-input") as HTMLInputElement;
const addTodoButton = document.getElementById("add-todo");
const todoList = document.getElementById("todo-list");
const essentialLinksContainer = document.getElementById("essential-links");
const areaInsightsContainer = document.getElementById("area-insights");
const reviewText = document.getElementById("prompt-text") as HTMLTextAreaElement;
const mapContainer = document.getElementById("map");
const loadingSpinner = document.getElementById("loading-spinner");

let selectedMedia: HTMLImageElement | null = null;
let map: google.maps.Map;
let marker: google.maps.Marker;

// --- AUTHENTICATION ---

// Create all providers
const googleProvider = new GoogleAuthProvider();
const facebookProvider = new FacebookAuthProvider();
const twitterProvider = new TwitterAuthProvider();
const githubProvider = new GithubAuthProvider();
const appleProvider = new OAuthProvider('apple.com');

// Multi-provider sign in
async function signInWithProvider(provider: any, providerName: string) {
  if (!auth) {
    alert('Firebase authentication is not configured. Please check your .env.local file.');
    return;
  }
  try {
    await signInWithPopup(auth, provider);
    console.log(`Signed in with ${providerName}`);
  } catch (error: any) {
    console.error(`Error signing in with ${providerName}:`, error);
    alert(`Sign in with ${providerName} failed: ${error.message}`);
  }
}

// Email/Password sign in
async function signInWithEmail() {
  if (!auth) {
    alert('Firebase authentication is not configured.');
    return;
  }
  const email = (document.getElementById('email-input') as HTMLInputElement)?.value;
  const password = (document.getElementById('password-input') as HTMLInputElement)?.value;
  
  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }
  
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (error: any) {
    console.error('Email sign-in failed:', error);
    alert(`Sign in failed: ${error.message}`);
  }
}

// Email/Password sign up
async function signUpWithEmail() {
  if (!auth) {
    alert('Firebase authentication is not configured.');
    return;
  }
  const email = (document.getElementById('email-input') as HTMLInputElement)?.value;
  const password = (document.getElementById('password-input') as HTMLInputElement)?.value;
  
  if (!email || !password) {
    alert('Please enter email and password');
    return;
  }
  
  try {
    await createUserWithEmailAndPassword(auth, email, password);
  } catch (error: any) {
    console.error('Email sign-up failed:', error);
    alert(`Sign up failed: ${error.message}`);
  }
}

// Legacy function for backward compatibility
async function signIn() {
  await signInWithProvider(googleProvider, 'Google');
}

async function doSignOut() {
  if (!auth) return;
  try {
    await signOut(auth);
    if(todoList) todoList.innerHTML = ""; // Clear the list on sign out
  } catch (error) {
    console.error("Error signing out: ", error);
  }
}

// Setup auth state listener only if auth is available
if (auth) {
onAuthStateChanged(auth, (user) => {
  if (user) {
    // User is signed in
    if(userInfoDiv) userInfoDiv.innerHTML = `Welcome, ${user.displayName || user.email}!`;
    // Hide all auth buttons
    document.getElementById('auth-buttons')?.setAttribute('style', 'display: none;');
    document.getElementById('email-auth')?.setAttribute('style', 'display: none;');
    if(signInButton) signInButton.style.display = 'none';
    if(signOutButton) signOutButton.style.display = 'block';
    if (db) loadTodos(user);
  } else {
    // User is signed out
    if(userInfoDiv) userInfoDiv.innerHTML = '';
    // Show all auth buttons
    document.getElementById('auth-buttons')?.setAttribute('style', 'display: block;');
    document.getElementById('email-auth')?.setAttribute('style', 'display: block; margin-top: 1em;');
    if(signInButton) signInButton.style.display = 'block';
    if(signOutButton) signOutButton.style.display = 'none';
  }
});
} else {
  // Show message if Firebase not configured
  if(userInfoDiv) userInfoDiv.innerHTML = 'Firebase not configured. Sign in disabled.';
  if(signInButton) signInButton.style.display = 'none';
}

// Event listeners will be attached in DOMContentLoaded

// --- MAP FUNCTIONS ---

function loadGoogleMapsScript() {
  const mapsApiKey = import.meta.env.VITE_MAPS_API_KEY;
  if (!mapsApiKey) {
    console.error("VITE_MAPS_API_KEY is not set. The map cannot be loaded.");
    return;
  }

  const script = document.createElement('script');
  script.src = `https://maps.googleapis.com/maps/api/js?key=${mapsApiKey}&callback=initMap&libraries=maps,marker&v=beta`;
  script.async = true;
  script.defer = true;
  window.initMap = initMap; // Make initMap globally available
  document.head.appendChild(script);
}

async function initMap(center?: google.maps.LatLngLiteral) {
  const { Map } = await google.maps.importLibrary("maps") as google.maps.MapsLibrary;
  const { Marker } = await google.maps.importLibrary("marker") as google.maps.MarkerLibrary;

  if (mapContainer) {
    map = new Map(mapContainer, {
      center: center || { lat: 0, lng: 0 },
      zoom: center ? 12 : 2,
      mapId: "DEMO_MAP_ID",
    });
    marker = new Marker({
        map: map,
        position: center
    });
  }
}

// --- FILE UPLOAD HANDLING ---
function setupFileUpload() {
  const imageUpload = document.getElementById("image-upload") as HTMLInputElement;
  const uploadedImageContainer = document.getElementById("uploaded-image-container");
  const uploadedImagePreview = document.getElementById("uploaded-image-preview") as HTMLImageElement;
  const removeUploadedImage = document.getElementById("remove-uploaded-image");
  const uploadCard = document.getElementById("upload-card");

  // Handle file selection
  if (imageUpload) {
    imageUpload.addEventListener("change", (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file && file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageUrl = event.target?.result as string;
          if (uploadedImagePreview) {
            uploadedImagePreview.src = imageUrl;
            uploadedImagePreview.dataset.uploaded = "true";
          }
          if (uploadedImageContainer) {
            uploadedImageContainer.style.display = "block";
          }
          
          // Auto-select uploaded image
if (mediaSelection) {
            mediaSelection.querySelectorAll("img, .upload-card").forEach((el) => 
              el.classList.remove("selected")
            );
            uploadedImagePreview.classList.add("selected");
            selectedMedia = uploadedImagePreview;
          }
        };
        reader.readAsDataURL(file);
    }
  });
}

  // Remove uploaded image
  if (removeUploadedImage) {
    removeUploadedImage.addEventListener("click", () => {
      if (uploadedImagePreview) {
        uploadedImagePreview.src = "";
        uploadedImagePreview.dataset.uploaded = "";
      }
      if (uploadedImageContainer) {
        uploadedImageContainer.style.display = "none";
      }
      if (uploadCard) {
        uploadCard.classList.remove("selected");
      }
      selectedMedia = null;
      if (imageUpload) {
        imageUpload.value = "";
      }
    });
  }

  // Drag and drop support
  if (uploadCard) {
    uploadCard.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadCard.classList.add("drag-over");
    });

    uploadCard.addEventListener("dragleave", () => {
      uploadCard.classList.remove("drag-over");
    });

    uploadCard.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadCard.classList.remove("drag-over");
      const file = e.dataTransfer?.files[0];
      if (file && file.type.startsWith("image/")) {
        if (imageUpload) {
          const dataTransfer = new DataTransfer();
          dataTransfer.items.add(file);
          imageUpload.files = dataTransfer.files;
          imageUpload.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
    });
  }
}

// --- CORE APPLICATION LOGIC ---
// Event listeners are initialized in DOMContentLoaded

function updateUIAfterLocationIdentified(locationName: string) {
    if (responseContainer) responseContainer.innerHTML = locationName;
    if (essentialLinksContainer) essentialLinksContainer.innerHTML = "";
    if (areaInsightsContainer) areaInsightsContainer.innerHTML = "";
    // Also update for social sharing
    currentLocationName = locationName;
    currentLocationUrl = window.location.href;
}

function updateUIAfterBackendResponse(data: any) {
    if (essentialLinksContainer) essentialLinksContainer.innerHTML = data.essentialLinks;
    if (areaInsightsContainer) {
        areaInsightsContainer.innerHTML = `<h3>Area Insights</h3><h4>Air Quality</h4><p>AQI: ${data.aqi}</p>`;
    }
    
    // Update map
    const location = data.location as google.maps.LatLngLiteral;
    map.setCenter(location);
    map.setZoom(12);
    marker.setPosition(location);
}


// --- TO-DO LIST (FIRESTORE) ---

async function loadTodos(user: User) {
    if (!user || !todoList) return;
    todoList.innerHTML = ""; // Clear list before loading
    const q = query(collection(db, "todos"), where("userId", "==", user.uid));
    const querySnapshot = await getDocs(q);
    querySnapshot.forEach((doc) => {
        addTodoToList(doc.data().text, doc.id);
    });
}

async function saveTodo(user: User, taskText: string) {
    try {
        const docRef = await addDoc(collection(db, "todos"), {
            userId: user.uid,
            text: taskText,
            createdAt: new Date()
        });
        addTodoToList(taskText, docRef.id);
    } catch (e) {
        console.error("Error adding document: ", e);
    }
}

function addTodoToList(taskText: string, docId: string) {
    const li = document.createElement("li");
    li.textContent = taskText;
    li.dataset.id = docId;

    const deleteButton = document.createElement("button");
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async () => {
        await deleteDoc(doc(db, "todos", docId));
        li.remove();
    });

    li.appendChild(deleteButton);
    if (todoList) {
        todoList.appendChild(li);
    }
}

// Event listeners for todos and reviews will be attached in DOMContentLoaded


// --- HELPER FUNCTIONS ---

declare global {
    interface Window {
        initMap: () => void;
    }
}

function setLoading(isLoading: boolean) {
    if (loadingSpinner) {
        loadingSpinner.style.display = isLoading ? "block" : "none";
    }
}

async function imageToGenerativePart(url: string) {
  const response = await fetch(url);
  const blob = await response.blob();
  const arrayBuffer = await new Promise<ArrayBuffer>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(blob);
  });
  const uint8Array = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8Array.byteLength; i++) {
    binary += String.fromCharCode(uint8Array[i]);
  }
  return btoa(binary);
}


// --- TAB NAVIGATION ---
function setupTabs() {
  const tabs = document.querySelectorAll('.tab[data-tab]');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      
      // Remove active from all tabs and contents
      document.querySelectorAll('.tab[data-tab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      // Add active to clicked tab and corresponding content
      tab.classList.add('active');
      const content = document.getElementById(`${targetTab}-tab`);
      if (content) content.classList.add('active');
    });
  });

  // Sub-tabs for community
  const subTabs = document.querySelectorAll('.tab[data-subtab]');
  subTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetSubTab = tab.getAttribute('data-subtab');
      
      document.querySelectorAll('.tab[data-subtab]').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('#community-tab .tab-content').forEach(c => c.classList.remove('active'));
      
      tab.classList.add('active');
      const content = document.getElementById(`${targetSubTab}-section`);
      if (content) content.classList.add('active');
    });
  });
}

// --- SOCIAL SHARING ---
let currentLocationName = '';
let currentLocationUrl = '';

// Store original function
const originalUpdateUIAfterLocationIdentified = updateUIAfterLocationIdentified;

// Override to capture location
function updateUIAfterLocationIdentifiedWithCapture(locationName: string) {
  originalUpdateUIAfterLocationIdentified(locationName);
  currentLocationName = locationName;
  currentLocationUrl = window.location.href;
}

function setupSocialSharing() {
  if (!socialManager) {
    console.warn('Social manager not available - Firebase not configured');
    return;
  }
  
  // Replace the function
  (window as any).updateUIAfterLocationIdentified = updateUIAfterLocationIdentifiedWithCapture;

  document.getElementById('share-facebook')?.addEventListener('click', () => {
    if (!currentLocationName) {
      alert('Please identify a location first');
      return;
    }
    socialManager.shareToSocialMedia('facebook', currentLocationName, currentLocationUrl);
  });

  document.getElementById('share-twitter')?.addEventListener('click', () => {
    if (!currentLocationName) {
      alert('Please identify a location first');
      return;
    }
    socialManager.shareToSocialMedia('twitter', currentLocationName, currentLocationUrl);
  });

  document.getElementById('share-instagram')?.addEventListener('click', () => {
    if (!currentLocationName) {
      alert('Please identify a location first');
      return;
    }
    socialManager.shareToSocialMedia('instagram', currentLocationName, currentLocationUrl);
  });

  document.getElementById('share-whatsapp')?.addEventListener('click', () => {
    if (!currentLocationName) {
      alert('Please identify a location first');
      return;
    }
    socialManager.shareToSocialMedia('whatsapp', currentLocationName, currentLocationUrl);
  });

  // Load connections
  if (auth && socialManager) {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        const connections = await socialManager.getUserConnections(user.uid);
        const connectionsList = document.getElementById('connections-list');
        if (connectionsList) {
          connectionsList.innerHTML = connections.length > 0
            ? connections.map(c => `<div>${c.displayName} - ${c.status}</div>`).join('')
            : '<p>No connections yet</p>';
        }
      }
    });
  }
}

// --- MAPS REPOSITORY ---
function setupMapsRepository() {
  if (!mapsRepository) {
    console.warn('Maps repository not available - Firebase not configured');
    return;
  }
  
  document.getElementById('save-current-map')?.addEventListener('click', () => {
    const form = document.getElementById('save-map-form');
    if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
  });

  document.getElementById('confirm-save-map')?.addEventListener('click', async () => {
    if (!auth || !mapsRepository) {
      alert('Firebase not configured. Cannot save maps.');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      alert('Please sign in to save maps');
      return;
    }

    const title = (document.getElementById('map-title') as HTMLInputElement)?.value;
    if (!title) {
      alert('Please enter a title');
      return;
    }

    const description = (document.getElementById('map-description') as HTMLTextAreaElement)?.value;
    const isPublic = (document.getElementById('map-public') as HTMLInputElement)?.checked;

    try {
      mapsRepository.setMap(map);
      await mapsRepository.saveMap(user, title, description, isPublic);
      alert('Map saved!');
      (document.getElementById('save-map-form') as HTMLElement).style.display = 'none';
      loadUserMaps(user.uid);
    } catch (error) {
      console.error('Error saving map:', error);
      alert('Failed to save map');
    }
  });

  document.getElementById('load-public-maps')?.addEventListener('click', async () => {
    const maps = await mapsRepository.getPublicMaps();
    displayMaps(maps);
  });

  if (auth) {
    onAuthStateChanged(auth, (user) => {
      if (user && mapsRepository) {
        loadUserMaps(user.uid);
      }
    });
  }
}

async function loadUserMaps(userId: string) {
  if (!mapsRepository) return;
  const maps = await mapsRepository.getUserMaps(userId);
  displayMaps(maps);
}

function displayMaps(maps: any[]) {
  const container = document.getElementById('saved-maps-list');
  if (!container) return;

  if (maps.length === 0) {
    container.innerHTML = '<p>No saved maps yet</p>';
    return;
  }

  container.innerHTML = maps.map(m => `
    <div class="map-card">
      <h4>${m.title}</h4>
      <p>${m.description || ''}</p>
      <button onclick="loadMap('${m.id}')">Open in Google Maps</button>
      <button onclick="deleteMap('${m.id}')">Delete</button>
    </div>
  `).join('');
}

// --- BOOKING SEARCH ---
function setupBookingSearch() {
  document.getElementById('search-bookings')?.addEventListener('click', async () => {
    if (auth && !auth.currentUser) {
      alert('Please sign in to search bookings');
      return;
    }
    
    if (!bookingManager) {
      alert('Booking search requires Firebase configuration. Showing manual search links instead.');
      // Still show manual URLs
    }

    const type = (document.getElementById('booking-type') as HTMLSelectElement)?.value as any;
    const destination = (document.getElementById('booking-destination') as HTMLInputElement)?.value;
    if (!destination) {
      alert('Please enter a destination');
      return;
    }

    const checkIn = (document.getElementById('booking-checkin') as HTMLInputElement)?.value;
    const checkOut = (document.getElementById('booking-checkout') as HTMLInputElement)?.value;
    const passengers = parseInt((document.getElementById('booking-passengers') as HTMLInputElement)?.value || '1');
    const budgetMin = parseFloat((document.getElementById('booking-budget-min') as HTMLInputElement)?.value || '0');
    const budgetMax = parseFloat((document.getElementById('booking-budget-max') as HTMLInputElement)?.value || '0');
    const currency = (document.getElementById('booking-currency') as HTMLSelectElement)?.value;

    setLoading(true);
    try {
      const searchParams = {
        type,
        destination,
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined,
        passengers,
        budget: budgetMin || budgetMax ? { min: budgetMin || undefined, max: budgetMax || undefined, currency } : undefined
      };

      // Use new BookingAggregator (follows proper architecture)
      let results: any[] = [];
      const flexible = (document.getElementById('flexible-routes') as HTMLInputElement)?.checked || false;
      
      try {
        // Try real-time API data first (via Firebase Functions)
        if (functions) {
          try {
            const realTimeData = httpsCallable(functions, 'getRealTimeBookings');
            const from = type === 'flight' ? (prompt('Departure city/airport:') || destination) : undefined;
            const realTimeResponse: any = await realTimeData({
              type,
              from,
              to: destination,
              date: checkIn || new Date().toISOString().split('T')[0],
              passengers
            });
            
            if (realTimeResponse.data?.results?.length > 0) {
              results = realTimeResponse.data.results;
            }
          } catch (error) {
            console.log('Real-time API failed, using aggregator:', error);
          }
        }

        // Use BookingAggregator (normalizes and merges data)
        if (results.length === 0) {
          const query = {
            type: type as any,
            from: type === 'flight' ? (prompt('Departure city/airport:') || undefined) : undefined,
            to: destination,
            date: checkIn || new Date().toISOString().split('T')[0],
            returnDate: checkOut,
            passengers,
            flexible
          };

          const aggregated = await bookingAggregator.search(query);
          
          // Convert normalized data to display format
          if (type === 'flight' || type === 'all') {
            results.push(...aggregated.flights.map(f => ({
              title: `${f.segments[0]?.from.city} → ${f.segments[f.segments.length - 1]?.to.city}`,
              provider: f.source,
              price: f.price.amount,
              currency: f.price.currency,
              description: `${f.segments.length} segment(s), ${Math.floor(f.totalDuration / 60)}h ${f.totalDuration % 60}m`,
              url: f.bookingUrl,
              segments: f.segments,
              layovers: f.layovers.length
            })));
          }

          if (type === 'hotel' || type === 'all') {
            results.push(...aggregated.hotels.map(h => ({
              title: h.name,
              provider: h.source,
              price: h.price.amount,
              currency: h.price.currency,
              rating: h.rating.value,
              reviews: h.rating.reviews,
              description: `${h.amenities.join(', ')}${h.specialOffers.length > 0 ? ` | ${h.specialOffers.map(o => o.description).join(', ')}` : ''}`,
              url: h.bookingUrl,
              specialDeals: h.specialOffers
            })));
          }

          if (type === 'bus' || type === 'train' || type === 'ferry') {
            const transportResults = type === 'bus' 
              ? await transportAPIs.searchBuses(query.from || '', destination, query.date || '')
              : type === 'train'
              ? await transportAPIs.searchTrains(query.from || '', destination, query.date || '')
              : await transportAPIs.searchFerries(query.from || '', destination, query.date || '');
            
            results.push(...transportResults.map(t => ({
              title: `${t.from.name} → ${t.to.name}`,
              provider: t.operator,
              price: t.price.amount,
              currency: t.price.currency,
              description: `${t.type} | ${Math.floor(t.duration / 60)}h ${t.duration % 60}m`,
              url: t.bookingUrl
            })));
          }

          if (type === 'experience' || type === 'all') {
            results.push(...aggregated.experiences.map((e: any) => ({
              title: e.name,
              provider: e.source,
              price: e.price,
              currency: e.currency,
              rating: e.rating,
              reviews: e.reviews,
              description: `${e.category} | ${e.duration}`,
              url: e.url
            })));
          }

          // Show best deals
          if (aggregated.bestDeals.length > 0) {
            results.unshift(...aggregated.bestDeals.map(d => ({
              ...d.item,
              isBestDeal: true,
              dealReason: d.reason
            })));
          }
        }

        // Fallback to AI if still no results
        if (results.length === 0 && bookingManager) {
          try {
            const aiResults = await bookingManager.searchBookings(searchParams);
            results = aiResults;
          } catch (error) {
            console.log('AI booking search failed:', error);
          }
        }
      } catch (error) {
        console.log('Booking aggregator failed, using fallback:', error);
        // Final fallback
        if (bookingManager) {
          try {
            const aiResults = await bookingManager.searchBookings(searchParams);
            results = aiResults;
          } catch (error) {
            console.log('Booking search failed:', error);
          }
        }
      }

      // Also generate search URLs for manual comparison
      const searchUrls = realBookingSearch.generateSearchUrls(searchParams);
      
      displayBookingResults(results, searchUrls);
      if (bookingManager && auth?.currentUser) {
        try {
          await bookingManager.saveSearch(auth.currentUser, searchParams, results);
        } catch (error) {
          console.log('Failed to save search:', error);
        }
      }
    } catch (error) {
      console.error('Error searching bookings:', error);
      alert('Failed to search bookings. Showing manual search links instead.');
      
      // Show manual search URLs as fallback
      const searchParams = {
        type,
        destination,
        checkIn: checkIn || undefined,
        checkOut: checkOut || undefined,
        passengers: parseInt((document.getElementById('booking-passengers') as HTMLInputElement)?.value || '1')
      };
      const searchUrls = realBookingSearch.generateSearchUrls(searchParams);
      displayBookingResults([], searchUrls);
    } finally {
      setLoading(false);
    }
  });
}

function displayBookingResults(results: any[], searchUrls: any[] = []) {
  const container = document.getElementById('booking-results');
  if (!container) return;

  let html = '';

  if (results.length > 0) {
    // Show best deals first
    const bestDeals = results.filter(r => r.isBestDeal);
    const regularResults = results.filter(r => !r.isBestDeal);

    if (bestDeals.length > 0) {
      html += '<h3>🏆 Best Deals</h3>';
      html += bestDeals.map(r => `
        <div class="booking-item best-deal">
          <div class="best-deal-badge">${r.dealReason || 'Best Deal'}</div>
          <h4>${r.title}</h4>
          <p><strong>Provider:</strong> ${r.provider}</p>
          <p class="price">${bookingManager ? bookingManager.formatPrice(r.price, r.currency) : `${r.currency} ${r.price}`}</p>
          ${r.rating ? `<p>⭐ ${r.rating}/5 (${r.reviews} reviews)</p>` : ''}
          ${r.description ? `<p>${r.description}</p>` : ''}
          ${r.segments ? `<p><strong>Route:</strong> ${r.segments.map((s: any) => `${s.from.city} → ${s.to.city}`).join(' → ')}</p>` : ''}
          ${r.layovers ? `<p><strong>Layovers:</strong> ${r.layovers}</p>` : ''}
          <a href="${r.url}" target="_blank" class="btn-primary">Book Now</a>
        </div>
      `).join('');
    }

    if (regularResults.length > 0) {
      html += bestDeals.length > 0 ? '<h3>Other Options</h3>' : '';
      html += regularResults.map(r => `
        <div class="booking-item">
          <h4>${r.title}</h4>
          <p><strong>Provider:</strong> ${r.provider}</p>
          <p class="price">${bookingManager ? bookingManager.formatPrice(r.price, r.currency) : `${r.currency} ${r.price}`}</p>
          ${r.rating ? `<p>⭐ ${r.rating}/5 (${r.reviews} reviews)</p>` : ''}
          ${r.description ? `<p>${r.description}</p>` : ''}
          ${r.segments ? `<p><strong>Route:</strong> ${r.segments.map((s: any) => `${s.from.city} → ${s.to.city}`).join(' → ')}</p>` : ''}
          ${r.layovers ? `<p><strong>Layovers:</strong> ${r.layovers}</p>` : ''}
          ${r.specialDeals ? `<p><strong>Special Offers:</strong> ${r.specialDeals.join(', ')}</p>` : ''}
          <a href="${r.url}" target="_blank" class="btn-primary">Book Now</a>
        </div>
      `).join('');
    }
  }

  // Add manual search URLs
  if (searchUrls.length > 0) {
    html += '<div style="margin-top: 2em;"><h4>Or search directly on these sites:</h4>';
    html += searchUrls.map(url => `
      <a href="${url.url}" target="_blank" class="btn-secondary" style="margin: 0.5em; display: inline-block;">
        ${url.provider}
      </a>
    `).join('');
    html += '</div>';
  }

  if (html === '') {
    html = '<p>No results found. Try searching directly on booking sites.</p>';
  }

  container.innerHTML = html;
}

// --- COMMUNITY ---
function setupCommunity() {
  if (!communityManager) {
    console.warn('Community manager not available');
    return;
  }
  
  // Forum
  document.getElementById('create-post-btn')?.addEventListener('click', () => {
    if (!auth) {
      alert('Firebase not configured. Community features require Firebase.');
      return;
    }
    const title = prompt('Post title:');
    const content = prompt('Post content:');
    if (title && content) {
      const user = auth.currentUser;
      if (user && communityManager) {
        communityManager.createPost(user, title, content).then(() => {
          loadForumPosts();
        });
      } else {
        alert('Please sign in to create posts');
      }
    }
  });

  // Reviews
  document.getElementById('submit-review')?.addEventListener('click', async () => {
    if (!auth || !communityManager) {
      alert('Firebase not configured. Reviews require Firebase.');
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      alert('Please sign in to submit a review');
      return;
    }

    const location = (document.getElementById('review-location') as HTMLInputElement)?.value;
    const rating = parseInt((document.getElementById('review-rating') as HTMLInputElement)?.value || '5');
    const title = (document.getElementById('review-title') as HTMLInputElement)?.value;
    const content = (document.getElementById('review-content') as HTMLTextAreaElement)?.value;

    if (!location || !title || !content) {
      alert('Please fill in all fields');
      return;
    }

    try {
      await communityManager.createReview(user, location, rating, title, content);
      alert('Review submitted!');
      loadReviews(location);
    } catch (error) {
      console.error('Error submitting review:', error);
    }
  });

  // AI Chat
  document.getElementById('send-ai-message')?.addEventListener('click', async () => {
    if (!communityManager) {
      alert('AI chat requires Firebase and Gemini API configuration.');
      return;
    }
    const input = document.getElementById('ai-chat-input') as HTMLInputElement;
    const message = input?.value;
    if (!message) return;

    const messagesContainer = document.getElementById('ai-chat-messages');
    if (messagesContainer) {
      messagesContainer.innerHTML += `<div><strong>You:</strong> ${message}</div>`;
    }

    input.value = '';
    setLoading(true);

    try {
      const response = await communityManager.chatWithAI(message);
      if (messagesContainer) {
        messagesContainer.innerHTML += `<div><strong>AI:</strong> ${response}</div>`;
      }
    } catch (error) {
      console.error('Error chatting with AI:', error);
      if (messagesContainer) {
        messagesContainer.innerHTML += `<div><strong>AI:</strong> Error: ${error instanceof Error ? error.message : 'Failed to get response'}</div>`;
      }
    } finally {
      setLoading(false);
    }
  });

  loadForumPosts();
}

async function loadForumPosts() {
  if (!communityManager) return;
  const posts = await communityManager.getPosts();
  const container = document.getElementById('forum-posts');
  if (container) {
    container.innerHTML = posts.map(p => `
      <div class="forum-post">
        <h4>${p.title}</h4>
        <p>${p.content}</p>
        <small>By ${p.userName} • ${p.likes} likes • ${p.replies} replies</small>
      </div>
    `).join('');
  }
}

async function loadReviews(location: string) {
  if (!communityManager) return;
  const reviews = await communityManager.getReviews(location);
  const container = document.getElementById('reviews-list');
  if (container) {
    container.innerHTML = reviews.map(r => `
      <div class="review-item">
        <h4>${r.title} - ⭐ ${r.rating}/5</h4>
        <p>${r.content}</p>
        <small>By ${r.userName}</small>
      </div>
    `).join('');
  }
}

// --- CONTENT CREATOR ---
function setupContentCreator() {
  document.getElementById('generate-content-btn')?.addEventListener('click', async () => {
    if (!contentCreator) {
      alert('Content creator requires Firebase configuration.');
      return;
    }
    if (auth && !auth.currentUser) {
      alert('Please sign in to generate content');
      return;
    }

    const platform = (document.getElementById('content-platform') as HTMLSelectElement)?.value as any;
    const mediaInput = document.getElementById('content-media') as HTMLInputElement;
    const style = (document.getElementById('content-style') as HTMLInputElement)?.value;

    if (!mediaInput?.files || mediaInput.files.length === 0) {
      alert('Please select media files');
      return;
    }

    setLoading(true);
    try {
      const files = Array.from(mediaInput.files);
      const currentUser = auth?.currentUser;
      if (!currentUser) {
        alert('Please sign in to generate content');
        setLoading(false);
        return;
      }
      const contents = await contentCreator.generateContent(currentUser, files, platform, undefined, style);
      displayGeneratedContent(contents);
    } catch (error) {
      console.error('Error generating content:', error);
      alert('Failed to generate content');
    } finally {
      setLoading(false);
    }
  });
}

function displayGeneratedContent(contents: any[]) {
  const container = document.getElementById('generated-content-list');
  if (!container) return;

  container.innerHTML = contents.map(c => `
    <div class="content-preview">
      ${c.type === 'image' ? `<img src="${c.content}" alt="Generated content" />` : ''}
      ${c.type === 'video' ? `<video src="${c.content}" controls></video>` : ''}
      <p><strong>Caption:</strong> ${c.caption}</p>
      <p><strong>Hashtags:</strong> ${c.hashtags?.join(' ') || ''}</p>
      <button onclick="copyToClipboard('${c.caption}')">Copy Caption</button>
    </div>
  `).join('');
}

// --- IMMIGRATION ---
function setupImmigration() {
  document.getElementById('get-visa-info')?.addEventListener('click', async () => {
    if (!immigrationManager) {
      alert('Immigration info requires Firebase and Gemini API configuration.');
      return;
    }
    const country = (document.getElementById('visa-country') as HTMLInputElement)?.value;
    if (!country) {
      alert('Please enter a country');
      return;
    }

    const nationality = (document.getElementById('visa-nationality') as HTMLInputElement)?.value || 'US';
    setLoading(true);

    try {
      const visaInfo = await immigrationManager.getVisaInfo(country, nationality);
      const immigrationInfo = await immigrationManager.getImmigrationInfo(country);

      displayVisaInfo(visaInfo);
      displayImmigrationInfo(immigrationInfo);
    } catch (error) {
      console.error('Error getting visa info:', error);
      alert('Failed to get visa information');
    } finally {
      setLoading(false);
    }
  });
}

function displayVisaInfo(info: any) {
  const container = document.getElementById('visa-info-display');
  if (!container || !info) return;

  container.innerHTML = `
    <div class="visa-info">
      <h4>Visa Information for ${info.country}</h4>
      <p><strong>Visa Type:</strong> ${info.visaType}</p>
      <p><strong>Requirements:</strong></p>
      <ul>${info.requirements.map((r: string) => `<li>${r}</li>`).join('')}</ul>
      <p><strong>Processing Time:</strong> ${info.processingTime}</p>
      <p><strong>Cost:</strong> ${info.cost}</p>
      <p><strong>Validity:</strong> ${info.validity}</p>
      ${info.isEVisaAvailable ? `<p><strong>E-Visa Available:</strong> Yes</p>` : ''}
      ${info.evisaWebsite ? `<a href="${info.evisaWebsite}" target="_blank">Apply for E-Visa</a>` : ''}
      <a href="${info.officialWebsite}" target="_blank">Official Website</a>
    </div>
  `;
}

function displayImmigrationInfo(info: any) {
  const container = document.getElementById('immigration-info-display');
  if (!container || !info) return;

  container.innerHTML = `
    <div>
      <h4>Immigration Information for ${info.country}</h4>
      <p><strong>Entry Requirements:</strong></p>
      <ul>${info.entryRequirements.map((r: string) => `<li>${r}</li>`).join('')}</ul>
      <p><strong>Customs Regulations:</strong></p>
      <ul>${info.customsRegulations.map((r: string) => `<li>${r}</li>`).join('')}</ul>
      <p><strong>Health Requirements:</strong></p>
      <ul>${info.healthRequirements.map((r: string) => `<li>${r}</li>`).join('')}</ul>
      ${info.officialResources.length > 0 ? `
        <p><strong>Official Resources:</strong></p>
        <ul>${info.officialResources.map((r: any) => `<li><a href="${r.url}" target="_blank">${r.name}</a></li>`).join('')}</ul>
      ` : ''}
    </div>
  `;
}

// --- INITIALIZATION ---

document.addEventListener('DOMContentLoaded', () => {
    // Attach authentication listeners
    if(signInButton) signInButton.addEventListener('click', signIn);
    
    // Multi-provider auth buttons
    document.getElementById('sign-in-google')?.addEventListener('click', () => signInWithProvider(googleProvider, 'Google'));
    document.getElementById('sign-in-apple')?.addEventListener('click', () => signInWithProvider(appleProvider, 'Apple'));
    document.getElementById('sign-in-facebook')?.addEventListener('click', () => signInWithProvider(facebookProvider, 'Facebook'));
    document.getElementById('sign-in-twitter')?.addEventListener('click', () => signInWithProvider(twitterProvider, 'Twitter'));
    document.getElementById('sign-in-github')?.addEventListener('click', () => signInWithProvider(githubProvider, 'GitHub'));
    document.getElementById('sign-in-email')?.addEventListener('click', signInWithEmail);
    document.getElementById('sign-up-email')?.addEventListener('click', signUpWithEmail);
    
    if(signOutButton) signOutButton.addEventListener('click', doSignOut);
    
    // Setup media selection
    if (mediaSelection) {
      mediaSelection.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        
        // Handle image clicks
        if (target.tagName === "IMG") {
          mediaSelection.querySelectorAll("img, .upload-card").forEach((el) => 
            el.classList.remove("selected")
          );
          target.classList.add("selected");
          selectedMedia = target as HTMLImageElement;
        }
        
        // Handle upload card click
        if (target.closest("#upload-card") || target.id === "upload-card") {
          const imageUpload = document.getElementById("image-upload") as HTMLInputElement;
          imageUpload?.click();
        }
      });
    }
    
    // Setup prompt button
    if (promptButton) {
      promptButton.addEventListener("click", async () => {
        if (auth && !auth.currentUser) {
            alert("Please sign in to use this feature.");
            return;
        }
        if (!selectedMedia) {
          alert("Please select an image first.");
          return;
        }

        setLoading(true);

        try {
          // Get image data
          const imageData = await imageToGenerativePart(selectedMedia.src);
          const mimeType = selectedMedia.src.startsWith("data:") 
            ? selectedMedia.src.split(";")[0].split(":")[1] 
            : "image/jpeg";

          // Try reverse image search first for pre-analysis
          let preAnalysis: string | null = null;
          if (reverseImageSearch) {
            try {
              preAnalysis = await reverseImageSearch.preAnalyze(imageData, mimeType);
              if (preAnalysis) {
                console.log("Pre-analysis:", preAnalysis);
              }
            } catch (error) {
              console.log("Reverse image search not available or failed:", error);
            }
          }

          // Use Gemini Vision API
          if (!genAI) {
            throw new Error('Gemini API key not configured. Please add VITE_GEMINI_API_KEY to .env.local');
          }
          const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
          let prompt = "What is the name of the place where I can see this image? Only tell me the place name and nothing else.";
          
          // Enhance prompt with pre-analysis if available
          if (preAnalysis) {
            prompt = `${preAnalysis}\n\n${prompt}`;
          }

          const image = {
            inlineData: {
              data: imageData,
              mimeType: mimeType,
            },
          };

          const result = await model.generateContent([prompt, image]);
          let locationName = result.response.text().trim();
          
          // Clean up location name (remove quotes, extra text)
          locationName = locationName.replace(/^["']|["']$/g, "").split("\n")[0].trim();

          updateUIAfterLocationIdentified(locationName);
          
          if (functions) {
            const getTravelAssistantResponse = httpsCallable(functions, 'getTravelAssistantResponse');
            const response: any = await getTravelAssistantResponse({ locationQuery: locationName });
            updateUIAfterBackendResponse(response.data);
          } else {
            // Show location name even without backend
            if (responseContainer) {
              responseContainer.innerHTML = `<h2>${locationName}</h2><p>Backend services not configured. Map and additional info unavailable.</p>`;
            }
          }

        } catch (error: any) {
            console.error("Error identifying location:", error);
            if (responseContainer) {
              responseContainer.innerHTML = `Error: ${error.message || "Failed to identify location. Please try again."}`;
            }
            
        // Try reverse image search as fallback
        if (reverseImageSearch && functions) {
          try {
            const imageData = await imageToGenerativePart(selectedMedia.src);
            const mimeType = selectedMedia.src.startsWith("data:") 
              ? selectedMedia.src.split(";")[0].split(":")[1] 
              : "image/jpeg";
            const fallbackResult = await reverseImageSearch.search(imageData, mimeType);
            if (fallbackResult && fallbackResult.location) {
              updateUIAfterLocationIdentified(fallbackResult.location);
              const getTravelAssistantResponse = httpsCallable(functions, 'getTravelAssistantResponse');
              const response: any = await getTravelAssistantResponse({ locationQuery: fallbackResult.location });
              updateUIAfterBackendResponse(response.data);
            }
          } catch (fallbackError) {
            console.error("Fallback also failed:", fallbackError);
          }
        }
        } finally {
            setLoading(false);
        }
      });
    }
    
    // Setup todo list
if (addTodoButton) {
  addTodoButton.addEventListener("click", () => {
        if (!auth || !db) {
          alert("Firebase not configured. To-do list requires Firebase setup.");
          return;
        }
    const user = auth.currentUser;
    if (!user) {
        alert("Please sign in to add a to-do item.");
        return;
    }
    const taskText = todoInput.value.trim();
    if (taskText !== "") {
      saveTodo(user, taskText);
      todoInput.value = "";
    }
  });
}

    // Setup review refinement
if (refineReviewButton) {
  refineReviewButton.addEventListener("click", async () => {
    if (!reviewText.value) return;
        if (!genAI) {
          alert("Gemini API key not configured. Please add VITE_GEMINI_API_KEY to .env.local");
          return;
        }
    const originalReview = reviewText.value;
    reviewText.value = "Refining review...";

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Refine this review to make it more engaging and descriptive: ${originalReview}`;

    try {
      const result = await model.generateContent(prompt);
      reviewText.value = result.response.text();
    } catch (error) {
          reviewText.value = `Error: Could not refine the review. ${error instanceof Error ? error.message : ''}`;
    }
  });
}

    // Initialize all features
    loadGoogleMapsScript();
    setupFileUpload();
    setupTabs();
    setupSocialSharing();
    setupMapsRepository();
    setupBookingSearch();
    setupCommunity();
    setupContentCreator();
    setupImmigration();
    setupTravelIntelligence();
    setupTranslator();
});

// Make functions available globally for onclick handlers
(window as any).loadMap = async (mapId: string) => {
  if (!mapsRepository) {
    alert('Maps repository not available');
    return;
  }
  const savedMap = await mapsRepository.loadMap(mapId);
  if (savedMap) {
    mapsRepository.openInGoogleMaps(savedMap);
  }
};

(window as any).deleteMap = async (mapId: string) => {
  if (!mapsRepository) {
    alert('Maps repository not available');
    return;
  }
  if (confirm('Are you sure you want to delete this map?')) {
    await mapsRepository.deleteMap(mapId);
    if (auth?.currentUser) {
      loadUserMaps(auth.currentUser.uid);
    }
  }
};

(window as any).copyToClipboard = async (text: string) => {
  if (!contentCreator) {
    alert('Content creator not available');
    return;
  }
  await contentCreator.copyToClipboard(text);
  alert('Copied to clipboard!');
};

// --- TRAVEL INTELLIGENCE ---
function setupTravelIntelligence() {
  document.getElementById('get-intelligence')?.addEventListener('click', async () => {
    if (!travelIntelligence) {
      alert('Travel intelligence requires Gemini API configuration.');
      return;
    }

    const location = (document.getElementById('intelligence-location') as HTMLInputElement)?.value;
    if (!location) {
      alert('Please enter a location');
      return;
    }

    setLoading(true);
    try {
      // Try server-side scraping first (via Firebase Functions)
      let intelligence: any = null;
      
      if (functions) {
        try {
          const scrapeIntelligence = httpsCallable(functions, 'scrapeTravelIntelligence');
          const response: any = await scrapeIntelligence({ location, sources: ['reddit', 'youtube'] });
          intelligence = response.data;
        } catch (error) {
          console.log('Server-side scraping failed, using client-side:', error);
        }
      }

      // Fallback to client-side
      if (!intelligence && travelIntelligence) {
        intelligence = await travelIntelligence.getIntelligence(location);
      }

      if (intelligence) {
        displayTravelIntelligence(intelligence);
      } else {
        alert('Failed to get travel intelligence. Please check your API configuration.');
      }
    } catch (error) {
      console.error('Error getting travel intelligence:', error);
      alert('Failed to get travel intelligence');
    } finally {
      setLoading(false);
    }
  });
}

function displayTravelIntelligence(intel: any) {
  const container = document.getElementById('intelligence-display');
  if (!container) return;

  let html = '';

  // Scams & Warnings
  if (intel.localTips) {
    html += `<div id="scams-warnings"><h4>⚠️ Scams & Warnings</h4>`;
    if (intel.localTips.scams?.length > 0) {
      html += `<p><strong>Common Scams:</strong></p><ul>${intel.localTips.scams.map((s: string) => `<li>${s}</li>`).join('')}</ul>`;
    }
    if (intel.localTips.bribes?.length > 0) {
      html += `<p><strong>About Bribes:</strong></p><ul>${intel.localTips.bribes.map((b: string) => `<li>${b}</li>`).join('')}</ul>`;
    }
    html += `</div>`;
  }

  // Transportation
  if (intel.transportation) {
    html += `<div id="transportation-info"><h4>🚕 Transportation</h4>`;
    if (intel.transportation.taxis) {
      html += `<p><strong>Taxis:</strong> ${intel.transportation.taxis.info}</p>`;
      if (intel.transportation.taxis.warnings?.length > 0) {
        html += `<p><strong>Warnings:</strong> ${intel.transportation.taxis.warnings.join(', ')}</p>`;
      }
    }
    if (intel.transportation.tuktuks) {
      html += `<p><strong>Tuktuks:</strong> ${intel.transportation.tuktuks.info}</p>`;
    }
    html += `</div>`;
  }

  // SIM Cards
  if (intel.simCards) {
    html += `<div id="sim-card-info"><h4>📱 SIM Cards</h4>`;
    if (intel.simCards.providers?.length > 0) {
      intel.simCards.providers.forEach((provider: any) => {
        html += `<div><strong>${provider.name}</strong> - ${provider.prices}`;
        if (provider.locations?.length > 0) {
          html += `<ul>${provider.locations.map((loc: any) => `<li>${loc.name}: ${loc.address}</li>`).join('')}</ul>`;
        }
        html += `</div>`;
      });
    }
    html += `</div>`;
  }

  // Currency
  if (intel.currency) {
    html += `<div id="currency-info"><h4>💰 Currency</h4>`;
    html += `<p><strong>Local Currency:</strong> ${intel.currency.localCurrency}</p>`;
    html += `<p><strong>Exchange Rate:</strong> 1 USD = ${intel.currency.exchangeRate} ${intel.currency.localCurrency}</p>`;
    if (intel.currency.cashRequired) {
      html += `<p><strong>⚠️ Cash Required:</strong> Yes</p>`;
    }
    if (intel.currency.whereToExchange?.length > 0) {
      html += `<p><strong>Where to Exchange:</strong> ${intel.currency.whereToExchange.join(', ')}</p>`;
    }
    html += `</div>`;
  }

  // Cultural
  if (intel.cultural) {
    html += `<div id="cultural-info"><h4>🌍 Cultural Tips</h4>`;
    if (intel.cultural.greetings?.length > 0) {
      html += `<p><strong>Greetings:</strong></p><ul>`;
      intel.cultural.greetings.forEach((g: any) => {
        html += `<li>${g.phrase} (${g.pronunciation}) - ${g.when}</li>`;
      });
      html += `</ul>`;
    }
    if (intel.cultural.importantWords?.length > 0) {
      html += `<p><strong>Important Words:</strong></p><ul>`;
      intel.cultural.importantWords.forEach((w: any) => {
        html += `<li>${w.word} (${w.translation}) - ${w.pronunciation}</li>`;
      });
      html += `</ul>`;
    }
    html += `</div>`;
  }

  container.innerHTML = html;
}

// --- TRANSLATOR ---
function setupTranslator() {
  document.getElementById('translate-btn')?.addEventListener('click', async () => {
    if (!translator) {
      alert('Translator requires Gemini API configuration.');
      return;
    }

    const text = (document.getElementById('translate-text') as HTMLInputElement)?.value;
    if (!text) {
      alert('Please enter text to translate');
      return;
    }

    const targetLang = (document.getElementById('target-language') as HTMLSelectElement)?.value;

    setLoading(true);
    try {
      const translation = await translator.translate(text, targetLang);
      const container = document.getElementById('translation-result');
      if (container) {
        container.innerHTML = `
          <div class="translation-item">
            <p><strong>Original:</strong> ${translation.original}</p>
            <p><strong>Translated:</strong> ${translation.translated}</p>
            ${translation.pronunciation ? `<p><strong>Pronunciation:</strong> ${translation.pronunciation}</p>` : ''}
          </div>
        `;
      }
    } catch (error) {
      console.error('Translation error:', error);
      alert('Translation failed');
    } finally {
      setLoading(false);
    }
  });

  document.getElementById('translate-voice-btn')?.addEventListener('click', async () => {
    if (!translator) {
      alert('Translator requires Gemini API configuration.');
      return;
    }

    const text = (document.getElementById('translate-text') as HTMLInputElement)?.value;
    if (!text) {
      alert('Please enter text to translate');
      return;
    }

    const targetLang = (document.getElementById('target-language') as HTMLSelectElement)?.value;

    setLoading(true);
    try {
      const translation = await translator.translateWithVoice(text, targetLang);
      const container = document.getElementById('translation-result');
      if (container) {
        container.innerHTML = `
          <div class="translation-item">
            <p><strong>Original:</strong> ${translation.original}</p>
            <p><strong>Translated:</strong> ${translation.translated}</p>
            ${translation.pronunciation ? `<p><strong>Pronunciation:</strong> ${translation.pronunciation}</p>` : ''}
            ${translation.audioUrl ? `<audio controls src="${translation.audioUrl}"></audio>` : ''}
          </div>
        `;
      }
    } catch (error) {
      console.error('Translation error:', error);
      alert('Translation failed');
    } finally {
      setLoading(false);
    }
  });

  document.getElementById('learn-phrases-btn')?.addEventListener('click', async () => {
    if (!translator) {
      alert('Translator requires Gemini API configuration.');
      return;
    }

    const location = (document.getElementById('phrase-location') as HTMLInputElement)?.value;
    if (!location) {
      alert('Please enter a location');
      return;
    }

    const category = (document.getElementById('phrase-category') as HTMLSelectElement)?.value as any;

    setLoading(true);
    try {
      const phrases = await translator.learnPhrases(location, category);
      const container = document.getElementById('phrases-list');
      if (container) {
        container.innerHTML = phrases.map(p => `
          <div class="phrase-item">
            <p><strong>${p.english}</strong></p>
            <p>${p.local} (${p.pronunciation})</p>
            ${p.audioUrl ? `<audio controls src="${p.audioUrl}"></audio>` : ''}
          </div>
        `).join('');
      }
    } catch (error) {
      console.error('Error learning phrases:', error);
      alert('Failed to load phrases');
    } finally {
      setLoading(false);
    }
  });
}
