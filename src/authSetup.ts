// Enhanced Auth Setup with Multiple Providers
// This shows how to add Google, Apple, Facebook, Twitter, GitHub, Email

import { 
  getAuth,
  GoogleAuthProvider,
  FacebookAuthProvider,
  TwitterAuthProvider,
  GithubAuthProvider,
  OAuthProvider, // For Apple
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "firebase/auth";

export function setupMultiProviderAuth(auth: any) {
  // Create providers
  const providers = {
    google: new GoogleAuthProvider(),
    facebook: new FacebookAuthProvider(),
    twitter: new TwitterAuthProvider(),
    github: new GithubAuthProvider(),
    apple: new OAuthProvider('apple.com')
  };

  // Sign in with any provider
  async function signInWithProvider(providerName: keyof typeof providers) {
    try {
      const provider = providers[providerName];
      const result = await signInWithPopup(auth, provider);
      return result.user;
    } catch (error: any) {
      console.error(`Sign-in with ${providerName} failed:`, error);
      throw error;
    }
  }

  // Email/Password sign in
  async function signInWithEmail(email: string, password: string) {
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (error: any) {
      console.error('Email sign-in failed:', error);
      throw error;
    }
  }

  // Email/Password sign up
  async function signUpWithEmail(email: string, password: string) {
    try {
      const result = await createUserWithEmailAndPassword(auth, email, password);
      return result.user;
    } catch (error: any) {
      console.error('Email sign-up failed:', error);
      throw error;
    }
  }

  return {
    signInWithProvider,
    signInWithEmail,
    signUpWithEmail,
    providers
  };
}

