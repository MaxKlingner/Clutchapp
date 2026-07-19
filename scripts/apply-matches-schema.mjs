/**
 * Applique le schéma matches/messages via l'API Management Supabase.
 * Prérequis dans .env :
 *   SUPABASE_ACCESS_TOKEN=sbp_...  (Account → Access Tokens)
 *   EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
 *
 * Usage: node scripts/apply-matches-schema.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile(path.join(root, '.env'));

const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY?.trim();

if (!accessToken) {
  console.error(
    'SUPABASE_ACCESS_TOKEN manquant. Ajoute-le dans .env (Supabase → Account → Access Tokens).'
  );
  process.exit(1);
}

if (!supabaseUrl) {
  console.error('EXPO_PUBLIC_SUPABASE_URL manquant.');
  process.exit(1);
}

const refMatch = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
if (!refMatch) {
  console.error('URL Supabase invalide.');
  process.exit(1);
}

const projectRef = refMatch[1];
const sqlPath = path.join(root, 'supabase', 'seed_matches_messages.sql');
const query = fs.readFileSync(sqlPath, 'utf8');

const apiUrl = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;

const response = await fetch(apiUrl, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query }),
});

if (!response.ok) {
  const body = await response.text();
  console.error(`Échec API Management (${response.status}): ${body.slice(0, 500)}`);
  process.exit(1);
}

console.log('SQL appliqué via API Management.');

if (anonKey) {
  // Petite pause puis vérification du cache PostgREST
  await new Promise((r) => setTimeout(r, 1500));
  const check = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/matches?select=id&limit=1`, {
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${anonKey}`,
    },
  });
  console.log(
    check.ok
      ? 'Table matches visible dans le schéma REST.'
      : `Vérification REST: status ${check.status}`
  );
}
