/**
 * Applique user_profiles.sql via Management API.
 * Usage: node scripts/apply-user-profiles.mjs
 */
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

if (!accessToken || !supabaseUrl) {
  console.error('SUPABASE_ACCESS_TOKEN ou EXPO_PUBLIC_SUPABASE_URL manquant.');
  process.exit(1);
}

const refMatch = supabaseUrl.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/i);
if (!refMatch) {
  console.error('URL Supabase invalide.');
  process.exit(1);
}

const query = fs.readFileSync(
  path.join(root, 'supabase', 'user_profiles.sql'),
  'utf8'
);

const response = await fetch(
  `https://api.supabase.com/v1/projects/${refMatch[1]}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  }
);

const body = await response.text();
if (!response.ok) {
  console.error(`FAIL ${response.status}: ${body.slice(0, 500)}`);
  process.exit(1);
}

console.log('USER_PROFILES_OK');
