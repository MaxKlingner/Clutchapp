/**
 * Service Stripe côté app (Expo).
 * La clé secrète Stripe ne doit JAMAIS être utilisée ici.
 *
 * En local : EXPO_PUBLIC_STRIPE_BACKEND_URL=http://127.0.0.1:4242 (+ npm run stripe:server)
 * TestFlight / store : URL HTTPS publique (Edge Function Supabase recommandée)
 *   https://<project>.supabase.co/functions/v1/stripe
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const REQUEST_TIMEOUT_MS = 20_000;

export type TopUpParams = {
  amountCents: number;
  currency?: string;
  parentId?: string;
  successUrl?: string;
  cancelUrl?: string;
};

export type CheckoutSessionResult = {
  id: string;
  url: string;
  publishableKey?: string | null;
};

export type PaymentIntentResult = {
  id: string;
  clientSecret: string;
  publishableKey?: string | null;
};

function readEnv(name: string): string {
  return (process.env[name] ?? '').trim();
}

function isPrivateOrLocalUrl(raw: string): boolean {
  try {
    const { hostname, protocol } = new URL(raw);
    if (protocol !== 'http:' && protocol !== 'https:') return true;
    const host = hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local')
    ) {
      return true;
    }
    // RFC1918 + link-local
    if (/^10\.\d+\.\d+\.\d+$/.test(host)) return true;
    if (/^192\.168\.\d+\.\d+$/.test(host)) return true;
    if (/^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/.test(host)) return true;
    if (/^169\.254\.\d+\.\d+$/.test(host)) return true;
    return false;
  } catch {
    return true;
  }
}

export const stripeConfig = {
  publishableKey: readEnv('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
  backendUrl: readEnv('EXPO_PUBLIC_STRIPE_BACKEND_URL').replace(/\/$/, ''),
  supabaseUrl: readEnv('EXPO_PUBLIC_SUPABASE_URL').replace(/\/$/, ''),
  supabaseAnonKey: readEnv('EXPO_PUBLIC_SUPABASE_ANON_KEY'),
  get ready() {
    return Boolean(this.publishableKey && this.backendUrl);
  },
  get usesPrivateBackend() {
    return Boolean(this.backendUrl) && isPrivateOrLocalUrl(this.backendUrl);
  },
};

function requireBackendUrl(): string {
  if (!stripeConfig.backendUrl) {
    throw new Error(
      'EXPO_PUBLIC_STRIPE_BACKEND_URL manquant. En local: npm run stripe:server. Sur TestFlight: pointe vers l’Edge Function HTTPS Supabase.'
    );
  }

  // Standalone / store builds cannot reach LAN or localhost.
  if (!__DEV__ && stripeConfig.usesPrivateBackend) {
    throw new Error(
      `Backend Stripe inaccessible en build store (${stripeConfig.backendUrl}). ` +
        'Définis EXPO_PUBLIC_STRIPE_BACKEND_URL sur une URL HTTPS publique ' +
        '(ex. https://<project>.supabase.co/functions/v1/stripe) dans les secrets EAS preview/production.'
    );
  }

  return stripeConfig.backendUrl;
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  // Supabase Edge Functions expect apikey + Authorization (anon or user JWT).
  if (
    stripeConfig.supabaseAnonKey &&
    stripeConfig.backendUrl.includes('.supabase.co/functions/')
  ) {
    headers.apikey = stripeConfig.supabaseAnonKey;
    headers.Authorization = `Bearer ${stripeConfig.supabaseAnonKey}`;
  }

  return headers;
}

async function stripeFetch(
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const baseUrl = requireBackendUrl();
  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  console.log('[stripe] request', {
    method: init.method ?? 'GET',
    url,
    timeoutMs: REQUEST_TIMEOUT_MS,
    privateBackend: stripeConfig.usesPrivateBackend,
    dev: __DEV__,
  });

  try {
    const response = await fetch(url, {
      ...init,
      headers: {
        ...buildHeaders(),
        ...(init.headers as Record<string, string> | undefined),
      },
      signal: controller.signal,
    });
    return response;
  } catch (error) {
    const name = error instanceof Error ? error.name : 'Error';
    const message = error instanceof Error ? error.message : String(error);
    console.error('[stripe] network failure', { url, name, message, error });

    if (name === 'AbortError') {
      throw new Error(
        `Request timed out (${REQUEST_TIMEOUT_MS / 1000}s) vers ${url}. ` +
          (stripeConfig.usesPrivateBackend
            ? 'URL locale/LAN — inaccessible depuis TestFlight. Utilise l’Edge Function Supabase HTTPS.'
            : 'Vérifie que le backend Stripe répond et que EXPO_PUBLIC_STRIPE_BACKEND_URL est correcte dans EAS.')
      );
    }

    throw new Error(
      `Réseau Stripe échoué (${url}): ${message}. ` +
        (stripeConfig.usesPrivateBackend
          ? 'Backend local/LAN détecté — ne fonctionne pas sur TestFlight.'
          : 'Vérifie EXPO_PUBLIC_STRIPE_BACKEND_URL (EAS preview/production).')
    );
  } finally {
    clearTimeout(timer);
  }
}

async function parseJsonResponse(response: Response, context: string) {
  const text = await response.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch (parseError) {
    console.error(`[stripe] ${context} JSON parse failed`, {
      status: response.status,
      text: text.slice(0, 300),
      parseError,
    });
    throw new Error(
      `${context}: réponse non-JSON (HTTP ${response.status}).`
    );
  }

  if (!response.ok) {
    console.error(`[stripe] ${context} HTTP error`, {
      status: response.status,
      payload,
    });
    throw new Error(
      (typeof payload.error === 'string' && payload.error) ||
        `${context} échoué (HTTP ${response.status}).`
    );
  }

  return payload;
}

export async function initStripe(publishableKey?: string) {
  const key = publishableKey ?? stripeConfig.publishableKey;
  if (!key) {
    throw new Error('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY manquante.');
  }
  return { publishableKey: key };
}

export async function createTopUpCheckoutSession(
  params: TopUpParams
): Promise<CheckoutSessionResult> {
  const response = await stripeFetch('/create-checkout-session', {
    method: 'POST',
    body: JSON.stringify({
      amountCents: params.amountCents,
      currency: params.currency ?? 'eur',
      parentId: params.parentId ?? 'anonymous',
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    }),
  });

  const payload = await parseJsonResponse(
    response,
    'create-checkout-session'
  );
  if (!payload?.url) {
    throw new Error('URL Checkout manquante.');
  }

  return {
    id: String(payload.id),
    url: String(payload.url),
    publishableKey:
      (payload.publishableKey as string | null | undefined) ??
      stripeConfig.publishableKey,
  };
}

export async function getCheckoutSessionStatus(sessionId: string): Promise<{
  paymentStatus: string;
  status: string;
  amountTotal: number | null;
}> {
  const response = await stripeFetch(
    `/checkout-session/${encodeURIComponent(sessionId)}`
  );
  const payload = await parseJsonResponse(response, 'checkout-session');

  return {
    paymentStatus: String(payload.payment_status ?? ''),
    status: String(payload.status ?? ''),
    amountTotal:
      typeof payload.amount_total === 'number' ? payload.amount_total : null,
  };
}

export async function createPaymentIntent(
  params: TopUpParams
): Promise<PaymentIntentResult> {
  const response = await stripeFetch('/create-payment-intent', {
    method: 'POST',
    body: JSON.stringify({
      amountCents: params.amountCents,
      currency: params.currency ?? 'eur',
      parentId: params.parentId ?? 'anonymous',
    }),
  });

  const payload = await parseJsonResponse(response, 'create-payment-intent');
  if (!payload?.clientSecret) {
    throw new Error('clientSecret manquant.');
  }

  return {
    id: String(payload.id),
    clientSecret: String(payload.clientSecret),
    publishableKey:
      (payload.publishableKey as string | null | undefined) ??
      stripeConfig.publishableKey,
  };
}

/**
 * Ouvre une vraie session Stripe Checkout (test) dans le navigateur in-app,
 * puis vérifie côté serveur si le paiement est bien "paid".
 */
export async function openStripeCheckoutTest(params: TopUpParams): Promise<{
  paid: boolean;
  sessionId: string;
  amountEuros: number;
}> {
  await initStripe();

  const successRedirect = Linking.createURL('wallet-topup-success');
  const cancelRedirect = Linking.createURL('wallet-topup-cancel');

  console.log('[stripe] opening checkout', {
    amountCents: params.amountCents,
    backendUrl: stripeConfig.backendUrl,
  });

  const session = await createTopUpCheckoutSession({
    ...params,
    successUrl: `${successRedirect}?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: cancelRedirect,
  });

  console.log('[stripe] checkout session created', { sessionId: session.id });

  await WebBrowser.openAuthSessionAsync(session.url, successRedirect);

  const status = await getCheckoutSessionStatus(session.id);
  const paid =
    status.paymentStatus === 'paid' || status.status === 'complete';

  console.log('[stripe] checkout result', {
    sessionId: session.id,
    paymentStatus: status.paymentStatus,
    status: status.status,
    paid,
  });

  return {
    paid,
    sessionId: session.id,
    amountEuros: (params.amountCents ?? 0) / 100,
  };
}

/** @deprecated préférer openStripeCheckoutTest */
export async function startWalletTopUp(params: TopUpParams) {
  const result = await openStripeCheckoutTest(params);
  return {
    completed: result.paid,
    sessionId: result.sessionId,
  };
}

export async function transferLessonPaymentToTutor(_params: {
  amountCents: number;
  tutorConnectAccountId: string;
  matchId: string;
}): Promise<never> {
  throw new Error('Stripe Connect transfer non implémenté.');
}

export async function createTutorConnectAccount(_params: {
  tutorId: string;
  email: string;
}): Promise<never> {
  throw new Error('Stripe Connect onboarding non implémenté.');
}
