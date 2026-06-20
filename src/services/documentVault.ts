// Document vault. Client-side AES-GCM 256, then upload encrypted blob to
// Firebase Storage. Server never sees plaintext. Key derived from user
// passphrase via PBKDF2 — passphrase NEVER sent to server.
//
// Storage layout: vault/{uid}/{docId} → encrypted bytes
// Firestore meta:  users/{uid}/vault/{docId} → { name, kind, mime, salt, iv, size, createdAt }

import {
  getStorage, ref, uploadBytes, getBytes, deleteObject,
} from "firebase/storage";
import {
  getFirestore, collection, doc, setDoc, getDocs, deleteDoc, getDoc,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";

export type DocKind = "passport" | "visa" | "ticket" | "insurance" | "vaccination" | "id" | "other";

export interface VaultDocMeta {
  id: string;
  name: string;
  kind: DocKind;
  mime: string;
  size: number;
  salt: string;       // base64
  iv: string;         // base64
  createdAt: string;
}

const PBKDF2_ITERS = 250_000;

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey(
    "raw", enc.encode(passphrase), { name: "PBKDF2" }, false, ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function b64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const raw = atob(s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export class DocumentVault {
  async upload(file: File, passphrase: string, kind: DocKind, displayName?: string): Promise<VaultDocMeta> {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("Not signed in");
    const uid = auth.currentUser.uid;

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(passphrase, salt);
    const plaintext = await file.arrayBuffer();
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);

    const id = crypto.randomUUID();
    const storage = getStorage();
    await uploadBytes(ref(storage, `vault/${uid}/${id}`), new Uint8Array(ct), {
      contentType: "application/octet-stream",
    });

    const meta: VaultDocMeta = {
      id,
      name: displayName || file.name,
      kind,
      mime: file.type || "application/octet-stream",
      size: file.size,
      salt: b64(salt),
      iv: b64(iv),
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(getFirestore(), `users/${uid}/vault/${id}`), meta);
    return meta;
  }

  async download(id: string, passphrase: string): Promise<{ blob: Blob; meta: VaultDocMeta }> {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("Not signed in");
    const uid = auth.currentUser.uid;

    const metaSnap = await getDoc(doc(getFirestore(), `users/${uid}/vault/${id}`));
    if (!metaSnap.exists()) throw new Error("Doc not found");
    const meta = metaSnap.data() as VaultDocMeta;

    const storage = getStorage();
    const ct = await getBytes(ref(storage, `vault/${uid}/${id}`));
    const key = await deriveKey(passphrase, unb64(meta.salt));
    let pt: ArrayBuffer;
    try {
      pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(meta.iv) }, key, ct);
    } catch {
      throw new Error("Wrong passphrase or corrupted file");
    }
    return { blob: new Blob([pt], { type: meta.mime }), meta };
  }

  async list(): Promise<VaultDocMeta[]> {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("Not signed in");
    const uid = auth.currentUser.uid;
    const snap = await getDocs(collection(getFirestore(), `users/${uid}/vault`));
    return snap.docs.map((d) => d.data() as VaultDocMeta);
  }

  async delete(id: string): Promise<void> {
    const auth = getAuth();
    if (!auth.currentUser) throw new Error("Not signed in");
    const uid = auth.currentUser.uid;
    // Delete the Firestore metadata FIRST. If the second step fails, we are left
    // with an orphaned encrypted blob (invisible to the user, GC-able later)
    // rather than a metadata row pointing at a missing file (user-visible 404).
    await deleteDoc(doc(getFirestore(), `users/${uid}/vault/${id}`));
    try {
      await deleteObject(ref(getStorage(), `vault/${uid}/${id}`));
    } catch {
      // Blob already gone or transient error — metadata is what the UI reads,
      // and that is already removed, so the document is effectively deleted.
    }
  }
}
