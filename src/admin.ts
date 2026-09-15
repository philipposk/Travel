// Minimal admin/ops dashboard. Separate Vite entry (admin.html) so this code
// never ships in the bundle every regular visitor downloads.
//
// Access is gated purely by the `admin: true` Firebase custom claim on the
// signed-in user's ID token — there is no in-app way to grant that claim.
// Granting the first admin is a one-time manual step (see PR description
// for the Admin SDK snippet); this page only ever *checks* the claim.

import { initializeApp } from "firebase/app";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, type User,
} from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";

interface AdminStats {
  users: { total: number; signedIn: number; anonymous: number };
  groupTrips: number;
  priceWatches: number;
  vaultDocs: number;
}

const root = document.getElementById("app")!;
function render(html: string): void { root.innerHTML = html; }
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

if (!firebaseConfig.apiKey) {
  render(`<h1>Atlas admin</h1><p class="err">Firebase is not configured (missing VITE_FIREBASE_* keys in .env.local).</p>`);
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const fn = getFunctions(app);

  function renderSignedOut(): void {
    render(`
      <h1>Atlas admin</h1>
      <p class="muted">Sign in with the account that has admin access.</p>
      <button id="signIn" class="btn">Sign in with Google</button>
    `);
    document.getElementById("signIn")!.addEventListener("click", () => {
      signInWithPopup(auth, new GoogleAuthProvider()).catch((e: unknown) => {
        render(`<h1>Atlas admin</h1><p class="err">${esc(e instanceof Error ? e.message : String(e))}</p>`);
      });
    });
  }

  function renderDenied(user: User): void {
    render(`
      <h1>Access denied</h1>
      <p class="muted">${esc(user.email || user.uid)} does not have admin access on this account.</p>
      <button id="signOut" class="btn ghost">Sign out</button>
    `);
    document.getElementById("signOut")!.addEventListener("click", () => signOut(auth));
  }

  async function renderStats(user: User): Promise<void> {
    render(`<h1>Atlas admin</h1><p class="muted">Loading stats…</p>`);
    try {
      const getAdminStats = httpsCallable<Record<string, never>, AdminStats>(fn, "getAdminStats");
      const { data } = await getAdminStats({});
      render(`
        <div class="head">
          <h1>Atlas admin</h1>
          <button id="signOut" class="btn ghost">Sign out</button>
        </div>
        <p class="muted">Signed in as ${esc(user.email || user.uid)}</p>
        <div class="grid">
          <div class="stat"><span class="n">${data.users.total}</span><span class="l">Users total</span></div>
          <div class="stat"><span class="n">${data.users.signedIn}</span><span class="l">Signed-in users</span></div>
          <div class="stat"><span class="n">${data.users.anonymous}</span><span class="l">Anonymous sessions</span></div>
          <div class="stat"><span class="n">${data.groupTrips}</span><span class="l">Group trips</span></div>
          <div class="stat"><span class="n">${data.priceWatches}</span><span class="l">Price watches</span></div>
          <div class="stat"><span class="n">${data.vaultDocs}</span><span class="l">Vault documents</span></div>
        </div>
      `);
      document.getElementById("signOut")!.addEventListener("click", () => signOut(auth));
    } catch (e) {
      render(`
        <h1>Atlas admin</h1>
        <p class="err">${esc(e instanceof Error ? e.message : String(e))}</p>
        <button id="retry" class="btn">Retry</button>
      `);
      document.getElementById("retry")!.addEventListener("click", () => { void renderStats(user); });
    }
  }

  onAuthStateChanged(auth, (user) => {
    if (!user) { renderSignedOut(); return; }
    user.getIdTokenResult().then((tokenResult) => {
      if (tokenResult.claims.admin !== true) renderDenied(user);
      else void renderStats(user);
    });
  });
}
