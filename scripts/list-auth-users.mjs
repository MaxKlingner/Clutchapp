/**
 * Diagnostic auth: Clerk vs Supabase Auth users.
 * Usage: node scripts/list-auth-users.mjs
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

const clerkSecret = process.env.CLERK_SECRET_KEY?.trim();
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
const accessToken = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const serviceRole =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SERVICE_KEY?.trim();

console.log('AUTH_PROVIDER_APP=Clerk');
console.log('HAS_CLERK_SECRET=' + Boolean(clerkSecret));
console.log('HAS_SUPABASE_SERVICE_ROLE=' + Boolean(serviceRole));
console.log('HAS_SUPABASE_ACCESS_TOKEN=' + Boolean(accessToken));

if (clerkSecret) {
  const res = await fetch('https://api.clerk.com/v1/users?limit=20', {
    headers: { Authorization: `Bearer ${clerkSecret}` },
  });
  const body = await res.text();
  if (!res.ok) {
    console.log('CLERK_LIST_FAIL=' + res.status + ' ' + body.slice(0, 200));
  } else {
    const users = JSON.parse(body);
    console.log('CLERK_USERS=' + users.length);
    for (const u of users) {
      const emails = (u.email_addresses || [])
        .map((e) => e.email_address)
        .join(', ');
      console.log(`- ${u.id} | ${emails} | created=${u.created_at}`);
    }
  }
} else {
  console.log('CLERK_SECRET_MISSING=true');
}

if (supabaseUrl && serviceRole) {
  const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/admin/users`, {
    headers: {
      Authorization: `Bearer ${serviceRole}`,
      apikey: serviceRole,
    },
  });
  const body = await res.text();
  console.log('SUPABASE_AUTH_STATUS=' + res.status);
  console.log('SUPABASE_AUTH_BODY=' + body.slice(0, 300));
}
