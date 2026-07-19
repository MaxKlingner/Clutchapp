/**
 * Mini serveur Stripe (test) pour CLUTCH.
 * La clé secrète ne quitte jamais ce process.
 *
 * Usage: npm run stripe:server
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import Stripe from 'stripe';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
const port = Number(process.env.STRIPE_SERVER_PORT || 4242);

if (!secretKey) {
  console.error('STRIPE_SECRET_KEY manquante dans .env');
  process.exit(1);
}

const stripe = new Stripe(secretKey);
const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json({ ok: true, mode: 'test' });
});

/**
 * Crée une Checkout Session pour recharger le wallet parent.
 * Body: {
 *   amountCents: number,
 *   currency?: string,
 *   parentId?: string,
 *   successUrl?: string,
 *   cancelUrl?: string
 * }
 */
app.post('/create-checkout-session', async (req, res) => {
  try {
    const amountCents = Number(req.body?.amountCents ?? 5000);
    const currency = String(req.body?.currency ?? 'eur').toLowerCase();
    const parentId = String(req.body?.parentId ?? 'anonymous');
    const successUrl = String(
      req.body?.successUrl ||
        'clutch://wallet-topup-success?session_id={CHECKOUT_SESSION_ID}'
    );
    const cancelUrl = String(
      req.body?.cancelUrl || 'clutch://wallet-topup-cancel'
    );

    if (!Number.isFinite(amountCents) || amountCents < 100) {
      return res.status(400).json({ error: 'amountCents invalide (min 100).' });
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
      metadata: {
        parentId,
        purpose: 'wallet_topup',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    return res.json({
      id: session.id,
      url: session.url,
      publishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error?.message ?? 'Impossible de créer la session Checkout.',
    });
  }
});

/**
 * Vérifie le statut d'une Checkout Session (pour créditer le wallet).
 */
app.get('/checkout-session/:id', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.id);
    return res.json({
      id: session.id,
      status: session.status,
      payment_status: session.payment_status,
      amount_total: session.amount_total,
      currency: session.currency,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error?.message ?? 'Impossible de récupérer la session.',
    });
  }
});

/**
 * Crée un PaymentIntent (base pour Payment Sheet / Connect plus tard).
 */
app.post('/create-payment-intent', async (req, res) => {
  try {
    const amountCents = Number(req.body?.amountCents ?? 5000);
    const currency = String(req.body?.currency ?? 'eur').toLowerCase();
    const parentId = String(req.body?.parentId ?? 'anonymous');

    if (!Number.isFinite(amountCents) || amountCents < 100) {
      return res.status(400).json({ error: 'amountCents invalide (min 100).' });
    }

    const intent = await stripe.paymentIntents.create({
      amount: Math.round(amountCents),
      currency,
      automatic_payment_methods: { enabled: true },
      metadata: {
        parentId,
        purpose: 'wallet_topup',
      },
    });

    return res.json({
      clientSecret: intent.client_secret,
      id: intent.id,
      publishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      error: error?.message ?? 'Impossible de créer le PaymentIntent.',
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Stripe test server listening on http://0.0.0.0:${port}`);
});
