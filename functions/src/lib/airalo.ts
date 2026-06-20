// Airalo Partner API — eSIM packages.
// Docs: https://airalopartners.airalo.com/docs
// Requires partner approval; client_credentials OAuth flow.

const AIRALO_BASE = "https://partners-api.airalo.com/v2";

let tokenCache: { token: string; exp: number } | null = null;

async function getAiraloToken(clientId: string, clientSecret: string): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp - 60_000) return tokenCache.token;
  const res = await fetch(`${AIRALO_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
  });
  if (!res.ok) throw new Error(`Airalo auth ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { data: { access_token: string; expires_in: number } };
  tokenCache = { token: j.data.access_token, exp: Date.now() + j.data.expires_in * 1000 };
  return tokenCache.token;
}

export interface AiraloPackage {
  id: string;
  type: string;
  price: number;
  amount: number; // data GB
  day: number;
  net_price: number;
  short_info: string;
  data: string;
  voice?: number;
  text?: number;
  countryCode?: string;
}

export async function getAiraloPackages(
  clientId: string,
  clientSecret: string,
  countryCode: string
): Promise<AiraloPackage[]> {
  const token = await getAiraloToken(clientId, clientSecret);
  const url = new URL(`${AIRALO_BASE}/packages`);
  url.searchParams.set("filter[country]", countryCode);
  url.searchParams.set("limit", "30");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) return [];
  const j = (await res.json()) as { data: Array<{ operators?: Array<{ packages: AiraloPackage[] }> }> };
  const pkgs: AiraloPackage[] = [];
  for (const c of j.data || []) {
    for (const op of c.operators || []) {
      pkgs.push(...(op.packages || []).map((p) => ({ ...p, countryCode })));
    }
  }
  return pkgs.sort((a, b) => a.price - b.price);
}

export async function createAiraloOrder(
  clientId: string,
  clientSecret: string,
  packageId: string,
  quantity = 1,
  description = ""
) {
  const token = await getAiraloToken(clientId, clientSecret);
  const res = await fetch(`${AIRALO_BASE}/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ package_id: packageId, quantity, description }),
  });
  if (!res.ok) throw new Error(`Airalo order ${res.status}: ${await res.text()}`);
  return await res.json();
}

// Affiliate URL fallback (no API needed) — uses Airalo public storefront w/ ref code.
export function buildAiraloAffiliateUrl(countryCode: string, refCode: string): string {
  const slug = countryCode.toLowerCase();
  return `https://airalo.com/${slug}-esim?ref=${refCode}`;
}
