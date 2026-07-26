/**
 * Prépare Stripe pour TestFlight / store :
 * 1) secrets Edge Function + deploy
 * 2) variables EAS preview + production
 *
 * Usage: node scripts/setup-stripe-testflight.mjs
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
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim()?.replace(
  /\/$/,
  ''
);
const supabaseAnon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();
const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
const stripePk = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY?.trim();
const clerkPk = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();

if (!accessToken || !supabaseUrl) {
  console.error('SUPABASE_ACCESS_TOKEN et EXPO_PUBLIC_SUPABASE_URL requis.');
  process.exit(1);
}
if (!stripeSecret || !stripePk) {
  console.error('STRIPE_SECRET_KEY et EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY requis.');
  process.exit(1);
}

const refMatch = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
if (!refMatch) {
  console.error('Project-ref introuvable dans EXPO_PUBLIC_SUPABASE_URL.');
  process.exit(1);
}
const projectRef = refMatch[1];
const backendUrl = `${supabaseUrl}/functions/v1/stripe`;

process.env.SUPABASE_ACCESS_TOKEN = accessToken;

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: root,
    env: process.env,
    encoding: 'utf8',
    shell: true,
    ...opts,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status ?? 1;
}

console.log('1) Secrets Edge Function Supabase...');
{
  const status = run('npx', [
    'supabase',
    'secrets',
    'set',
    `STRIPE_SECRET_KEY=${stripeSecret}`,
    `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=${stripePk}`,
    '--project-ref',
    projectRef,
  ]);
  if (status !== 0) process.exit(status);
}

console.log('\n2) Deploy function stripe (--no-verify-jwt)...');
{
  const status = run('npx', [
    'supabase',
    'functions',
    'deploy',
    'stripe',
    '--project-ref',
    projectRef,
    '--no-verify-jwt',
  ]);
  if (status !== 0) process.exit(status);
}

console.log('\n3) Health check...');
{
  const res = await fetch(`${backendUrl}/health`, {
    headers: supabaseAnon
      ? {
          apikey: supabaseAnon,
          Authorization: `Bearer ${supabaseAnon}`,
        }
      : undefined,
  });
  const text = await res.text();
  console.log(`GET ${backendUrl}/health → ${res.status} ${text}`);
  if (!res.ok) {
    console.error('Health check échoué — vérifie le deploy.');
    process.exit(1);
  }
}

function upsertEasEnv(name, value, environment) {
  // Try create; if exists, force update via eas env:update if available
  const create = spawnSync(
    'npx',
    [
      'eas-cli',
      'env:create',
      '--name',
      name,
      '--value',
      value,
      '--environment',
      environment,
      '--visibility',
      'plaintext',
      '--type',
      'string',
      '--force',
      '--non-interactive',
    ],
    { cwd: root, env: process.env, encoding: 'utf8', shell: true }
  );
  if (create.stdout) process.stdout.write(create.stdout);
  if (create.stderr) process.stderr.write(create.stderr);

  if ((create.status ?? 1) === 0) return true;

  const update = spawnSync(
    'npx',
    [
      'eas-cli',
      'env:update',
      name,
      '--value',
      value,
      '--environment',
      environment,
      '--visibility',
      'plaintext',
      '--non-interactive',
    ],
    { cwd: root, env: process.env, encoding: 'utf8', shell: true }
  );
  if (update.stdout) process.stdout.write(update.stdout);
  if (update.stderr) process.stderr.write(update.stderr);
  return (update.status ?? 1) === 0;
}

console.log('\n4) Variables EAS (preview + production)...');
const easVars = {
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: stripePk,
  EXPO_PUBLIC_STRIPE_BACKEND_URL: backendUrl,
  EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
};
if (supabaseAnon) easVars.EXPO_PUBLIC_SUPABASE_ANON_KEY = supabaseAnon;
if (clerkPk) easVars.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = clerkPk;

let easOk = true;
for (const environment of ['preview', 'production']) {
  console.log(`\n— environment: ${environment}`);
  for (const [name, value] of Object.entries(easVars)) {
    console.log(`  set ${name}`);
    const ok = upsertEasEnv(name, value, environment);
    if (!ok) {
      console.warn(`  ⚠ échec pour ${name} (${environment})`);
      easOk = false;
    }
  }
}

console.log('\n========== RÉSUMÉ ==========');
console.log(`Backend HTTPS: ${backendUrl}`);
console.log(
  easOk
    ? 'Variables EAS mises à jour (preview + production).'
    : 'Certaines variables EAS n’ont pas pu être écrites — vérifie `npx eas-cli env:list`.'
);
console.log(
  '\nProchaine étape: rebuild TestFlight, ex.\n  eas build --profile preview --platform ios'
);
console.log(
  'Les EXPO_PUBLIC_* sont figés au moment du build — un nouveau build est obligatoire.'
);
