"use client";

import { createBrowserClient } from "@supabase/ssr";
import { sharedCookieOptions } from "./cookies";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: sharedCookieOptions,
      db: { schema: "travel" },
    },
  );
}

export type AppSupabaseClient = ReturnType<typeof createClient>;
