/**
 * Centralised public env vars for Expo.
 * Fill values in `.env` (see `.env.example`).
 * Only keys prefixed with EXPO_PUBLIC_ are available in the app bundle.
 */
export const env = {
  clerkPublishableKey:
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() ?? '',
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL?.trim() ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? '',
};

export const isClerkConfigured = Boolean(env.clerkPublishableKey);
export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey
);
