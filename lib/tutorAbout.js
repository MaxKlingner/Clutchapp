/** Textes « à propos » des tuteurs seed. Un vrai tuteur peut les remplacer en base. */

export const ABOUT_MAX = 500;
export const ABOUT_WORDS = 80;

export const SEED_TUTOR_ABOUT = {
  'Adam Rossi': {
    tutor:
      'Je suis en master à Bruxelles. L’anglais, je l’ai surtout travaillé à l’oral : c’est là que beaucoup d’élèves du début du secondaire se bloquent. Ils connaissent les règles, mais ils n’osent pas parler. Je corrige sans couper la phrase toutes les deux secondes.',
    course:
      'On part d’un texte court, on revoit la grammaire dedans, puis on passe à la conversation. Chez moi à Bruxelles ou en visio. Pas de liste de vocabulaire à avaler : on réutilise les mots jusqu’à ce qu’ils sortent tout seuls.',
  },
  'Camille Dupont': {
    tutor:
      'Je termine un master à Liège. Les maths et les sciences, je les explique comme j’aurais voulu les entendre : une étape après l’autre, avec le pourquoi derrière la formule. Je ne survolerai pas un chapitre pour « avancer ».',
    course:
      'On reprend le chapitre en cours, on fait les exercices types, puis on s’entraîne jusqu’à ce que la méthode tienne sans moi. À Liège chez moi ou en visio, surtout avant un contrôle ou un examen.',
  },
  'Chloé Renard': {
    tutor:
      'Je suis en bachelier à Louvain-la-Neuve, le nez dans les textes. Je relis beaucoup de copies : je vois vite où une phrase se casse, où l’argument ne tient pas, où le style fait du remplissage. Je suis directe, sans être cassante.',
    course:
      'On travaille sur tes écrits, pas sur des modèles abstraits. Plan, syntaxe, style : on corrige ensemble, tu réécris, on compare. Les séances sont chez moi à Louvain-la-Neuve, au calme.',
  },
  'Hugo Lambert': {
    tutor:
      'Étudiant en lettres à Namur. Le français m’intéresse quand il sert à dire quelque chose de clair : un plan qui tient, une citation bien placée, une intro qui n’est pas du vent. J’ai galéré sur les disserts, je sais où ça coince.',
    course:
      'Je me déplace à Namur. On pose le plan avant d’écrire, on rédige un paragraphe, on le relit à voix haute. Dissertations et commentaires en 5e et 6e, sans se noyer dans tout le cours d’un coup.',
  },
  'Inès Petit': {
    tutor:
      'Je suis en bachelier, un pied en éco, un pied en maths. J’aime bien reprendre les bases avec ceux qui ont l’impression d’avoir décroché dès le début du secondaire. Pas de jugement, on recommence au bon endroit.',
    course:
      'Je viens à Nivelles. Maths d’abord (calcul, équations simples), puis un peu d’économie avec des exemples concrets : un budget, un prix, une petite courbe. On avance lentement, et ça reste.',
  },
  'Léa Bernard': {
    tutor:
      'Étudiante en lettres. Je me souviens encore des dictées et des rédactions du premier cycle, quand on a l’impression de tout mélanger. Je suis patiente, et je ne fais pas semblant de ne pas voir les fautes : on les range, une par une.',
    course:
      'Je me déplace à Wavre. Orthographe ciblée, lecture, petites rédactions. Chaque séance reprend un tout petit bout de la précédente, pour que ça ne retombe pas en une semaine.',
  },
  'Lucas Martin': {
    tutor:
      'Je suis en doctorat en informatique. Je code tous les jours, et ce qui m’intéresse c’est comment tu t’y prends, pas de réciter un cours. Si tu es bloqué, on lit le code ensemble. Je ne ferai pas le projet à ta place.',
    course:
      'Tout se passe en visio. On part de ton code ou d’un petit exercice : Python, structures de données, débogage. Tu partages l’écran, on avance, tu repars avec quelque chose qui compile.',
  },
  'Nina Moreau': {
    tutor:
      'Je suis en master. Le primaire, j’aime parce que tout passe par le concret : une expérience, un mot, un dessin. Les enfants décrochent si on fait trop long, alors je garde des séances courtes et claires.',
    course:
      'Je me déplace à Charleroi. Une petite expérience pour les sciences, des jeux de mots pour l’anglais. On rit un peu, mais on retient. Les parents voient ce qu’on a fait en fin de séance.',
  },
  'Sofia Benali': {
    tutor:
      'Doctorante à Bruxelles. Je jongle entre l’algo, l’analyse et l’économie : trois manières de mettre de l’ordre dans un problème. Je préfère une question « bête » tout de suite plutôt qu’un silence jusqu’à l’examen.',
    course:
      'Les séances sont en visio. On travaille sur des exercices, on corrige ensemble, et je laisse un petit set pour la fois d’après. Rythme de 5e ou de supérieur, sans brûler les étapes.',
  },
  'Thomas Leroy': {
    tutor:
      'Je suis en bachelier. Les maths du primaire et du début du secondaire, je les revois souvent : fractions, calcul, petits problèmes. Ce n’est pas spectaculaire, mais c’est ce qui évite de décrocher plus tard.',
    course:
      'Les cours sont chez moi à Wavre. On pose les bases, on refait les devoirs, on s’arrête dès que ça bloque. Pas de course au programme : une notion claire vaut mieux que trois notions floues.',
  },
};

export function aboutTutorText(tutor) {
  const written = String(tutor?.aboutTutor || '').trim();
  if (written) return written;
  return SEED_TUTOR_ABOUT[tutor?.name]?.tutor || '';
}

export function aboutCourseText(tutor) {
  const written = String(tutor?.aboutCourse || '').trim();
  if (written) return written;
  return SEED_TUTOR_ABOUT[tutor?.name]?.course || '';
}
