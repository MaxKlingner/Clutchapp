/**
 * Deploy the Stripe Edge Function and print the HTTPS backend URL to set in EAS.
 * Usage: node scripts/deploy-stripe-function.mjs
 *
 * Requires in .env:
 *   SUPABASE_ACCESS_TOKEN
 *   EXPO_PUBLIC_SUPABASE_URL
 *   STRIPE_SECRET_KEY
 *   EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

loadEnvFile(path.join(root, '.env'));

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
const stripePk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();

if (!accessToken || !supabaseUrl) {
  console.error('SUPABASE_ACCESS_TOKEN et EXPO_PUBLIC_SUPABASE_URL requis.');
  process.exit(1);
}

const refMatch = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
if (!refMatch) {
  console.error('Impossible d’extraire le project-ref depuis EXPO_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}
const projectRef = refMatch[1];
const backendUrl = `https://${projectRef}.supabase.co/functions/v1/stripe`;

process.env.SUPABASE_ACCESS_TOKEN = accessToken;

function run(args, opts = {}) {
  const result = spawnSync('npx', ['supabase', ...args], {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    shell: true,
    ...opts,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (stripeSecret) {
  console.log('Setting Edge Function secrets (names only)...');
  const secretArgs = [`STRIPE_SECRET_KEY=${stripeSecret}`];
  if (stripePk) secretArgs.push(`EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=${stripePk}`);
  run(['secrets', 'set', ...secretArgs, '--project-ref', projectRef]);
} else {
  console.warn('STRIPE_SECRET_KEY absente — secrets non mis à jour.');
}

console.log('Deploying function stripe...');
run([
  'functions',
  'deploy',
  'stripe',
  '--project-ref',
  projectRef,
  '--no-verify-jwt',
]);

console.log('\nOK. Backend HTTPS:');
console.log(backendUrl);
console.log('\nMets à jour EAS (preview + production):');
console.log(`  EXPO_PUBLIC_STRIPE_BACKEND_URL=${backendUrl}`);
console.log('Puis rebuild TestFlight (les EXPO_PUBLIC_* sont baked au build).');
