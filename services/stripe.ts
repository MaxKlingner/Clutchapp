/**
 * Service Stripe côté app (Expo).
 * La clé secrète Stripe ne doit JAMAIS être utilisée ici.
 */

import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

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

export const stripeConfig = {
  publishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  backendUrl: (process.env.EXPO_PUBLIC_STRIPE_BACKEND_URL ?? '').replace(/\/$/, ''),
  get ready() {
    return Boolean(this.publishableKey && this.backendUrl);
  },
};

function requireBackendUrl(): string {
  if (!stripeConfig.backendUrl) {
    throw new Error(
      'EXPO_PUBLIC_STRIPE_BACKEND_URL manquant. Démarre le serveur Stripe (npm run stripe:server).'
    );
  }
  return stripeConfig.backendUrl;
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
  const baseUrl = requireBackendUrl();
  const response = await fetch(`${baseUrl}/create-checkout-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amountCents: params.amountCents,
      currency: params.currency ?? 'eur',
      parentId: params.parentId ?? 'anonymous',
      successUrl: params.successUrl,
      cancelUrl: params.cancelUrl,
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Création Checkout impossible.');
  }
  if (!payload?.url) {
    throw new Error('URL Checkout manquante.');
  }

  return {
    id: String(payload.id),
    url: String(payload.url),
    publishableKey: payload.publishableKey ?? stripeConfig.publishableKey,
  };
}

export async function getCheckoutSessionStatus(sessionId: string): Promise<{
  paymentStatus: string;
  status: string;
  amountTotal: number | null;
}> {
  const baseUrl = requireBackendUrl();
  const response = await fetch(`${baseUrl}/checkout-session/${sessionId}`);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Vérification session impossible.');
  }

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
  const baseUrl = requireBackendUrl();
  const response = await fetch(`${baseUrl}/create-payment-intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      amountCents: params.amountCents,
      currency: params.currency ?? 'eur',
      parentId: params.parentId ?? 'anonymous',
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error ?? 'Création PaymentIntent impossible.');
  }
  if (!payload?.clientSecret) {
    throw new Error('clientSecret manquant.');
  }

  return {
    id: String(payload.id),
    clientSecret: String(payload.clientSecret),
    publishableKey: payload.publishableKey ?? stripeConfig.publishableKey,
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

  const session = await createTopUpCheckoutSession({
    ...params,
    successUrl: `${successRedirect}?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: cancelRedirect,
  });

  await WebBrowser.openAuthSessionAsync(session.url, successRedirect);

  // Après retour (success redirect ou fermeture), on interroge Stripe.
  const status = await getCheckoutSessionStatus(session.id);
  const paid =
    status.paymentStatus === 'paid' || status.status === 'complete';

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
