import { clerkPublishableKey } from './clerk';

const API_VERSION = '2025-11-10';

function frontendHost() {
  const encoded = String(clerkPublishableKey || '').replace(/^pk_(test|live)_/, '');
  if (!encoded || encoded === clerkPublishableKey) {
    throw new Error('Configuration Clerk introuvable.');
  }
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
  const decoded = global.atob(padded).replace(/\$$/, '');
  if (!decoded.includes('.')) {
    throw new Error('Configuration Clerk introuvable.');
  }
  return decoded;
}

function asError(payload, fallback) {
  const raw = payload?.errors?.[0];
  const error = new Error(raw?.long_message || raw?.message || fallback);
  error.errors = payload?.errors?.map((item) => ({
    code: item.code,
    message: item.message,
    longMessage: item.long_message || item.longMessage,
    meta: { paramName: item.meta?.param_name || item.meta?.paramName },
  }));
  return error;
}

export function resetEmailFactor(signIn) {
  const factors = signIn?.supported_first_factors || signIn?.supportedFirstFactors || [];
  return factors.find((item) => item.strategy === 'reset_password_email_code') || null;
}

/**
 * Starts a password-reset sign-in on a fresh Clerk client.
 * The signed-in app session stays in place, so this works from Paramètres.
 */
export async function clerkResetRequest(path, { token = '', body } = {}) {
  const url = new URL(`https://${frontendHost()}${path}`);
  url.searchParams.set('__clerk_api_version', API_VERSION);
  url.searchParams.set('_is_native', '1');
  const headers = {
    'content-type': 'application/x-www-form-urlencoded',
    'x-mobile': '1',
  };
  if (token) headers.authorization = token;
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: body ? new URLSearchParams(body).toString() : undefined,
    credentials: 'omit',
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw asError(payload, 'Impossible de réinitialiser le mot de passe.');
  }
  return {
    token: response.headers.get('authorization') || token,
    signIn: payload?.response || payload,
  };
}
