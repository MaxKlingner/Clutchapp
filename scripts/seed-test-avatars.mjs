import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env' });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = 'sigmknikvehehydkizvd';

if (!token) {
  console.error('No SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

const sql = `
update public.profiles set avatar_url = 'https://i.pravatar.cc/400?img=5'
  where role = 'tutor' and full_name = 'Camille Dupont';
update public.profiles set avatar_url = 'https://i.pravatar.cc/400?img=12'
  where role = 'tutor' and full_name = 'Lucas Martin';
update public.profiles set avatar_url = 'https://i.pravatar.cc/400?img=32'
  where role = 'tutor' and full_name = 'Sofia Benali';
update public.profiles set avatar_url = 'https://i.pravatar.cc/400?img=47'
  where role = 'tutor' and full_name = 'Nina Moreau';
update public.profiles set avatar_url = 'https://i.pravatar.cc/400?img=15'
  where role = 'tutor' and full_name = 'Adam Rossi';

update public.profiles
set avatar_url = 'https://i.pravatar.cc/400?u=' || id::text
where role = 'tutor'
  and (clerk_id is null or clerk_id = '')
  and (avatar_url is null or avatar_url = '')
  and full_name not in (
    'Camille Dupont','Lucas Martin','Sofia Benali','Nina Moreau','Adam Rossi'
  );

select full_name, left(coalesce(avatar_url, ''), 70) as avatar,
       (clerk_id is null or clerk_id = '') as is_manual
from public.profiles
where role = 'tutor'
order by created_at;
`;

const res = await fetch(
  `https://api.supabase.com/v1/projects/${ref}/database/query`,
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  }
);

const text = await res.text();
console.log('status', res.status);
console.log(text);
if (!res.ok) process.exit(1);
