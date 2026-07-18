import { tokenCache } from '@clerk/clerk-expo/token-cache';

import { env, isClerkConfigured } from './env';

export { tokenCache, isClerkConfigured };

export const clerkPublishableKey = env.clerkPublishableKey;
