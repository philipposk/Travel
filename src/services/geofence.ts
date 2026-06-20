// Geofenced notifications. Browser-only: watchPosition + Haversine to itinerary
// activities. Fires "approaching X" callback when within radius. Background
// firing on mobile PWAs requires service worker registration of periodic sync
// (handled separately in sw.ts when frontend lands).

export interface Geofence {
  id: string;
  lat: number;
  lon: number;
  radiusM: number;
  title: string;
  message: string;
}

const EARTH_M = 6_371_000;

export function haversineMeters(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const φ1 = (aLat * Math.PI) / 180;
  const φ2 = (bLat * Math.PI) / 180;
  const Δφ = ((bLat - aLat) * Math.PI) / 180;
  const Δλ = ((bLon - aLon) * Math.PI) / 180;
  const a = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_M * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export class GeofenceWatcher {
  private fences: Geofence[] = [];
  private fired = new Set<string>();
  private watchId: number | null = null;
  private cb: ((f: Geofence, distanceM: number) => void) | null = null;

  start(fences: Geofence[], onEnter: (f: Geofence, distanceM: number) => void): void {
    // Cancel any watch already running so repeated start() calls don't stack
    // multiple watchPosition subscriptions.
    this.stop();
    this.fences = fences;
    this.cb = onEnter;
    this.fired.clear();
    if (!("geolocation" in navigator)) throw new Error("Geolocation unsupported");
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.check(pos.coords.latitude, pos.coords.longitude),
      (err) => console.error("geofence error", err),
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 60_000 }
    );
  }

  stop(): void {
    if (this.watchId != null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
  }

  private check(lat: number, lon: number): void {
    for (const f of this.fences) {
      if (this.fired.has(f.id)) continue;
      const d = haversineMeters(lat, lon, f.lat, f.lon);
      if (d <= f.radiusM) {
        this.fired.add(f.id);
        this.cb?.(f, d);
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification(f.title, { body: f.message });
        }
      }
    }
  }

  async requestNotificationPermission(): Promise<boolean> {
    if (!("Notification" in window)) return false;
    if (Notification.permission === "granted") return true;
    return (await Notification.requestPermission()) === "granted";
  }
}
