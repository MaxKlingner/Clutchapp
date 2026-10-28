-- CLUTCH: textes « à propos du tuteur » et « à propos du cours »

alter table public.profiles
  add column if not exists about_tutor text;

alter table public.profiles
  add column if not exists about_course text;

update public.profiles set
  about_tutor = $about$Je suis en master à Bruxelles. L’anglais, je l’ai surtout travaillé à l’oral : c’est là que beaucoup d’élèves du début du secondaire se bloquent. Ils connaissent les règles, mais ils n’osent pas parler. Je corrige sans couper la phrase toutes les deux secondes.$about$,
  about_course = $about$On part d’un texte court, on revoit la grammaire dedans, puis on passe à la conversation. Chez moi à Bruxelles ou en visio. Pas de liste de vocabulaire à avaler : on réutilise les mots jusqu’à ce qu’ils sortent tout seuls.$about$
where role = 'tutor' and full_name = 'Adam Rossi';

update public.profiles set
  about_tutor = $about$Je termine un master à Liège. Les maths et les sciences, je les explique comme j’aurais voulu les entendre : une étape après l’autre, avec le pourquoi derrière la formule. Je ne survolerai pas un chapitre pour « avancer ».$about$,
  about_course = $about$On reprend le chapitre en cours, on fait les exercices types, puis on s’entraîne jusqu’à ce que la méthode tienne sans moi. À Liège chez moi ou en visio, surtout avant un contrôle ou un examen.$about$
where role = 'tutor' and full_name = 'Camille Dupont';

update public.profiles set
  about_tutor = $about$Je suis en bachelier à Louvain-la-Neuve, le nez dans les textes. Je relis beaucoup de copies : je vois vite où une phrase se casse, où l’argument ne tient pas, où le style fait du remplissage. Je suis directe, sans être cassante.$about$,
  about_course = $about$On travaille sur tes écrits, pas sur des modèles abstraits. Plan, syntaxe, style : on corrige ensemble, tu réécris, on compare. Les séances sont chez moi à Louvain-la-Neuve, au calme.$about$
where role = 'tutor' and full_name = 'Chloé Renard';

update public.profiles set
  about_tutor = $about$Étudiant en lettres à Namur. Le français m’intéresse quand il sert à dire quelque chose de clair : un plan qui tient, une citation bien placée, une intro qui n’est pas du vent. J’ai galéré sur les disserts, je sais où ça coince.$about$,
  about_course = $about$Je me déplace à Namur. On pose le plan avant d’écrire, on rédige un paragraphe, on le relit à voix haute. Dissertations et commentaires en 5e et 6e, sans se noyer dans tout le cours d’un coup.$about$
where role = 'tutor' and full_name = 'Hugo Lambert';

update public.profiles set
  about_tutor = $about$Je suis en bachelier, un pied en éco, un pied en maths. J’aime bien reprendre les bases avec ceux qui ont l’impression d’avoir décroché dès le début du secondaire. Pas de jugement, on recommence au bon endroit.$about$,
  about_course = $about$Je viens à Nivelles. Maths d’abord (calcul, équations simples), puis un peu d’économie avec des exemples concrets : un budget, un prix, une petite courbe. On avance lentement, et ça reste.$about$
where role = 'tutor' and full_name = 'Inès Petit';

update public.profiles set
  about_tutor = $about$Étudiante en lettres. Je me souviens encore des dictées et des rédactions du premier cycle, quand on a l’impression de tout mélanger. Je suis patiente, et je ne fais pas semblant de ne pas voir les fautes : on les range, une par une.$about$,
  about_course = $about$Je me déplace à Wavre. Orthographe ciblée, lecture, petites rédactions. Chaque séance reprend un tout petit bout de la précédente, pour que ça ne retombe pas en une semaine.$about$
where role = 'tutor' and full_name = 'Léa Bernard';

update public.profiles set
  about_tutor = $about$Je suis en doctorat en informatique. Je code tous les jours, et ce qui m’intéresse c’est comment tu t’y prends, pas de réciter un cours. Si tu es bloqué, on lit le code ensemble. Je ne ferai pas le projet à ta place.$about$,
  about_course = $about$Tout se passe en visio. On part de ton code ou d’un petit exercice : Python, structures de données, débogage. Tu partages l’écran, on avance, tu repars avec quelque chose qui compile.$about$
where role = 'tutor' and full_name = 'Lucas Martin';

update public.profiles set
  about_tutor = $about$Je suis en master. Le primaire, j’aime parce que tout passe par le concret : une expérience, un mot, un dessin. Les enfants décrochent si on fait trop long, alors je garde des séances courtes et claires.$about$,
  about_course = $about$Je me déplace à Charleroi. Une petite expérience pour les sciences, des jeux de mots pour l’anglais. On rit un peu, mais on retient. Les parents voient ce qu’on a fait en fin de séance.$about$
where role = 'tutor' and full_name = 'Nina Moreau';

update public.profiles set
  about_tutor = $about$Doctorante à Bruxelles. Je jongle entre l’algo, l’analyse et l’économie : trois manières de mettre de l’ordre dans un problème. Je préfère une question « bête » tout de suite plutôt qu’un silence jusqu’à l’examen.$about$,
  about_course = $about$Les séances sont en visio. On travaille sur des exercices, on corrige ensemble, et je laisse un petit set pour la fois d’après. Rythme de 5e ou de supérieur, sans brûler les étapes.$about$
where role = 'tutor' and full_name = 'Sofia Benali';

update public.profiles set
  about_tutor = $about$Je suis en bachelier. Les maths du primaire et du début du secondaire, je les revois souvent : fractions, calcul, petits problèmes. Ce n’est pas spectaculaire, mais c’est ce qui évite de décrocher plus tard.$about$,
  about_course = $about$Les cours sont chez moi à Wavre. On pose les bases, on refait les devoirs, on s’arrête dès que ça bloque. Pas de course au programme : une notion claire vaut mieux que trois notions floues.$about$
where role = 'tutor' and full_name = 'Thomas Leroy';

notify pgrst, 'reload schema';
