-- Remet les tuteurs seed sur des matières scolaires (plus de logiciels archi)
update public.profiles
set
  specialties = array['Mathématiques'],
  subject = 'Mathématiques',
  bio = coalesce(nullif(trim(bio), ''), 'Aide au collège et lycée en maths.'),
  study_year = coalesce(study_year, 'Master 1')
where role = 'tutor' and full_name = 'Camille Dupont';

update public.profiles
set
  specialties = array['Physique-Chimie'],
  subject = 'Physique-Chimie',
  bio = coalesce(nullif(trim(bio), ''), 'Cours de physique-chimie clairs et structurés.'),
  study_year = coalesce(study_year, 'Master 2')
where role = 'tutor' and full_name = 'Lucas Martin';

update public.profiles
set
  specialties = array['Anglais'],
  subject = 'Anglais',
  bio = coalesce(nullif(trim(bio), ''), 'Conversation et préparation aux examens.'),
  study_year = coalesce(study_year, 'Licence 3')
where role = 'tutor' and full_name = 'Sofia Benali';

update public.profiles
set
  specialties = array['Histoire-Géo'],
  subject = 'Histoire-Géo',
  bio = coalesce(nullif(trim(bio), ''), 'Méthodologie et révisions bac.'),
  study_year = coalesce(study_year, 'Master 1')
where role = 'tutor' and full_name = 'Nina Moreau';

update public.profiles
set
  specialties = array['Informatique'],
  subject = 'Informatique',
  bio = coalesce(nullif(trim(bio), ''), 'Algo, Python et bases de la programmation.'),
  study_year = coalesce(study_year, 'Master 2')
where role = 'tutor' and full_name = 'Adam Rossi';

notify pgrst, 'reload schema';
