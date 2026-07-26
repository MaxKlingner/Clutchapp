import { createRequire } from 'module';

const require = createRequire(import.meta.url);
require('dotenv').config({ path: '.env' });

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref = 'sigmknikvehehydkizvd';

if (!token) {
  console.error('No SUPABASE_ACCESS_TOKEN');
  process.exit(1);
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const bios = {
  'Camille Dupont':
    'Étudiante en maths à l’université, j’aide collégiens et lycéens à reprendre confiance en algèbre, analyse et préparation aux examens. Cours clairs, patient·e et orientés méthode.',
  'Lucas Martin':
    'Passionné de physique-chimie, je rends les notions concrètes avec des exemples du quotidien et des exercices progressifs. Idéal pour le lycée et les prépas légères.',
  'Sofia Benali':
    'Tuteure d’anglais bilingue : conversation, grammaire et préparation aux oraux. Ambiance détendue, focus sur la fluidité et le vocabulaire utile au quotidien comme à l’école.',
  'Nina Moreau':
    'Diplômée en histoire-géographie, j’accompagne sur les programmes du collège au lycée : fiches, dissertations et cartes mentales pour mémoriser sans stress.',
  'Adam Rossi':
    'Étudiant en informatique, je propose du soutien en algorithmique, Python et bases du web. Pédagogie pas à pas, du débutant au premier projet concret.',
};

const updates = Object.entries(bios)
  .map(
    ([name, bio]) =>
      `update public.profiles set bio = ${sqlString(bio)} where role = 'tutor' and full_name = ${sqlString(name)};`
  )
  .join('\n');

const sql = `
${updates}

select full_name, left(coalesce(bio, ''), 90) as bio_preview
from public.profiles
where role = 'tutor'
  and full_name in (
    'Camille Dupont','Lucas Martin','Sofia Benali','Nina Moreau','Adam Rossi'
  )
order by full_name;
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
