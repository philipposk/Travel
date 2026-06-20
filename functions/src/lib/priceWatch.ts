// Price watchlist logic. Firestore collection: priceWatches.
// Scheduled function polls each watch, records history, fires push on drop.

export type WatchKind = "flight" | "hotel";

export interface PriceWatch {
  id: string;
  uid: string;
  kind: WatchKind;
  // flight
  from?: string;
  to?: string;
  date?: string;
  cabinClass?: "economy" | "premium_economy" | "business" | "first";
  passengers?: number;
  // hotel
  location?: string;
  checkIn?: string;
  checkOut?: string;
  guests?: number;
  // common
  threshold?: number;       // alert when price <= threshold
  currency: string;
  lastPrice?: number;
  lowestPrice?: number;
  fcmToken?: string;        // push delivery
  active: boolean;
  history: Array<{ at: string; price: number; source: string }>;
  createdAt: string;
  updatedAt: string;
}

export interface PriceCheckResult {
  watchId: string;
  newPrice: number;
  source: string;
  triggered: boolean;       // threshold hit
  isNewLow: boolean;
  delta?: number;           // vs lastPrice
}

export function evaluatePriceCheck(watch: PriceWatch, newPrice: number, source: string): PriceCheckResult {
  // Use typeof checks, not truthiness: a legitimate previous price of 0
  // (free/award fare) must still count as a baseline.
  const delta = typeof watch.lastPrice === "number" ? newPrice - watch.lastPrice : 0;
  const triggered =
    typeof watch.threshold === "number" && newPrice <= watch.threshold;
  const isNewLow =
    typeof watch.lowestPrice !== "number" || newPrice < watch.lowestPrice;
  return { watchId: watch.id, newPrice, source, triggered, isNewLow, delta };
}

export function buildAlertPayload(watch: PriceWatch, res: PriceCheckResult): {
  title: string;
  body: string;
  data: Record<string, string>;
} {
  const what = watch.kind === "flight"
    ? `${watch.from}→${watch.to} on ${watch.date}`
    : `${watch.location} ${watch.checkIn}–${watch.checkOut}`;
  const title = res.triggered
    ? `Price drop: ${watch.currency} ${res.newPrice}`
    : `New low: ${watch.currency} ${res.newPrice}`;
  const body = `${what} — was ${watch.currency} ${watch.lastPrice ?? "—"}, now ${watch.currency} ${res.newPrice}`;
  return {
    title,
    body,
    data: { watchId: watch.id, kind: watch.kind, price: String(res.newPrice) },
  };
}
