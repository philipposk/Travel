// Trip journal — photo + GPS timeline. Polarsteps clone.
// Each entry stored in Firestore at users/{uid}/journals/{tripId}/entries/{id}.
// Photos uploaded to Storage at journal/{uid}/{tripId}/{id}/{n}.

import {
  getStorage, ref, uploadBytes, getDownloadURL,
} from "firebase/storage";
import {
  getFirestore, collection, doc, setDoc, getDocs, query, orderBy,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

export interface JournalEntry {
  id: string;
  tripId: string;
  timestamp: string;
  lat?: number;
  lon?: number;
  locationName?: string;
  text: string;
  mood?: "happy" | "tired" | "amazed" | "neutral" | "sad" | "excited";
  weather?: string;
  photoUrls: string[];
  createdAt: string;
}

export class TripJournal {
  async addEntry(
    tripId: string,
    text: string,
    photos: File[],
    opts: { lat?: number; lon?: number; locationName?: string; mood?: JournalEntry["mood"]; weather?: string } = {}
  ): Promise<JournalEntry> {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("Not signed in");
    const uid = auth.currentUser.uid;
    const id = crypto.randomUUID();
    const storage = getStorage();

    // Upload all photos concurrently rather than one-at-a-time; for a multi-photo
    // entry on a slow connection this is the difference between N round-trips in
    // series and N in parallel. Order is preserved by index.
    const photoUrls: string[] = await Promise.all(
      photos.map(async (p, i) => {
        const objRef = ref(storage, `journal/${uid}/${tripId}/${id}/${i}-${p.name}`);
        await uploadBytes(objRef, p, { contentType: p.type });
        return getDownloadURL(objRef);
      })
    );

    const entry: JournalEntry = {
      id,
      tripId,
      timestamp: new Date().toISOString(),
      text,
      lat: opts.lat,
      lon: opts.lon,
      locationName: opts.locationName,
      mood: opts.mood,
      weather: opts.weather,
      photoUrls,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(getFirestore(), `users/${uid}/journals/${tripId}/entries/${id}`), entry);
    return entry;
  }

  async getEntries(tripId: string): Promise<JournalEntry[]> {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("Not signed in");
    const uid = auth.currentUser.uid;
    const q = query(
      collection(getFirestore(), `users/${uid}/journals/${tripId}/entries`),
      orderBy("timestamp", "asc")
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as JournalEntry);
  }

  // Capture current device location (best-effort).
  async captureLocation(): Promise<{ lat: number; lon: number } | null> {
    if (!("geolocation" in navigator)) return null;
    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 8000 }
      );
    });
  }
}
