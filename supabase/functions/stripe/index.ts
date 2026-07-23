/**
 * Stripe Checkout backend for CLUTCH (Supabase Edge Function).
 * Public HTTPS replacement for the local Express server on TestFlight/production.
 *
 * Routes (relative to /functions/v1/stripe):
 *   GET  /health
 *   POST /create-checkout-session
 *   GET  /checkout-session/:id
 *   POST /create-payment-intent
 *
 * Secrets (Dashboard → Edge Functions → Secrets, or `supabase secrets set`):
 *   STRIPE_SECRET_KEY
 *   EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY (optional, echoed to clients)
 */
import Stripe from 'https://esm.sh/stripe@17.7.0?target=deno';

const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function getStripe() {
  const secretKey = Deno.env.get('STRIPE_SECRET_KEY')?.trim();
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY manquante (secret Edge Function).');
  }
  return new Stripe(secretKey, {
    apiVersion: '2024-11-20.acacia',
    httpClient: Stripe.createFetchHttpClient(),
  });
}

function routePath(req: Request): string {
  const url = new URL(req.url);
  // Supports .../functions/v1/stripe/... and local serve paths
  const marker = '/stripe';
  const idx = url.pathname.indexOf(marker);
  const rest =
    idx >= 0 ? url.pathname.slice(idx + marker.length) : url.pathname;
  return rest.replace(/\/+$/, '') || '/';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const path = routePath(req);
    const stripe = getStripe();
    const publishableKey =
      Deno.env.get('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY')?.trim() ?? null;

    if (req.method === 'GET' && path === '/health') {
      return json({ ok: true, mode: 'edge' });
    }

    if (req.method === 'POST' && path === '/create-checkout-session') {
      const body = await req.json().catch(() => ({}));
      const amountCents = Number(body?.amountCents ?? 5000);
      const currency = String(body?.currency ?? 'eur').toLowerCase();
      const parentId = String(body?.parentId ?? 'anonymous');
      const successUrl = String(
        body?.successUrl ||
          'clutch://wallet-topup-success?session_id={CHECKOUT_SESSION_ID}'
      );
      const cancelUrl = String(
        body?.cancelUrl || 'clutch://wallet-topup-cancel'
      );

      if (!Number.isFinite(amountCents) || amountCents < 100) {
        return json({ error: 'amountCents invalide (min 100).' }, 400);
      }

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency,
              unit_amount: Math.round(amountCents),
              product_data: {
                name: 'Recharge portefeuille CLUTCH',
                description: `Recharge parent ${parentId}`,
              },
            },
          },
        ],
        metadata: { parentId, purpose: 'wallet_topup' },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });

      return json({
        id: session.id,
        url: session.url,
        publishableKey,
      });
    }

    const sessionMatch = path.match(/^\/checkout-session\/([^/]+)$/);
    if (req.method === 'GET' && sessionMatch) {
      const session = await stripe.checkout.sessions.retrieve(sessionMatch[1]);
      return json({
        id: session.id,
        status: session.status,
        payment_status: session.payment_status,
        amount_total: session.amount_total,
        currency: session.currency,
      });
    }

    if (req.method === 'POST' && path === '/create-payment-intent') {
      const body = await req.json().catch(() => ({}));
      const amountCents = Number(body?.amountCents ?? 5000);
      const currency = String(body?.currency ?? 'eur').toLowerCase();
      const parentId = String(body?.parentId ?? 'anonymous');

      if (!Number.isFinite(amountCents) || amountCents < 100) {
        return json({ error: 'amountCents invalide (min 100).' }, 400);
      }

      const intent = await stripe.paymentIntents.create({
        amount: Math.round(amountCents),
        currency,
        automatic_payment_methods: { enabled: true },
        metadata: { parentId, purpose: 'wallet_topup' },
      });

      return json({
        clientSecret: intent.client_secret,
        id: intent.id,
        publishableKey,
      });
    }

    return json({ error: `Route inconnue: ${req.method} ${path}` }, 404);
  } catch (error) {
    console.error('[stripe-edge]', error);
    return json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Erreur serveur Stripe Edge Function.',
      },
      500
    );
  }
});
