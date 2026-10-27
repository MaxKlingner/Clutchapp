import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSignUp } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';

import AuthStep, { authStyles } from '../components/AuthStep';
import { saveEmailConsent } from '../lib/emailConsent';
import { resolveLocationQuery, suggestLocations } from '../lib/geo';
import { ROLES, saveSignupProfile } from '../lib/roles';
import {
  FORMAT_IN_PERSON,
  FORMAT_REMOTE,
  SPECIALTIES,
  STUDENT_LEVEL_GROUPS,
} from '../lib/tutorConstants';

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function placeFromQuery(query, picked) {
  if (picked) return picked;
  const raw = query.trim();
  const postal = /^\d{4}$/.test(raw) ? raw : null;
  const resolved = resolveLocationQuery(raw);
  if (resolved) {
    return {
      city: resolved.name,
      postalCode: postal,
      latitude: resolved.latitude,
      longitude: resolved.longitude,
    };
  }
  return {
    city: raw,
    postalCode: postal,
    latitude: null,
    longitude: null,
  };
}

function suggestionPlace(loc, query) {
  const typed = String(query || '').trim();
  const postal =
    /^\d{4}$/.test(typed) && loc.postalCodes.includes(typed)
      ? typed
      : loc.postalCodes.length === 1
        ? loc.postalCodes[0]
        : null;
  return {
    city: loc.name,
    postalCode: postal,
    latitude: loc.latitude,
    longitude: loc.longitude,
    label: postal ? `${loc.name} ${postal}` : loc.name,
  };
}

export default function SignUpScreen({ onBack, onGoToSignIn }) {
  const { signUp, setActive, isLoaded } = useSignUp();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [intent, setIntent] = useState(null);
  const [audience, setAudience] = useState(null);
  const [subject, setSubject] = useState(null);
  const [level, setLevel] = useState(null);
  const [coursePlace, setCoursePlace] = useState(null);
  const [locality, setLocality] = useState('');
  const [pickedPlace, setPickedPlace] = useState(null);
  const [promoEmails, setPromoEmails] = useState(false);
  const [accountId, setAccountId] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function goBack() {
    setError('');
    if (step === 'password') {
      setStep('email');
      return;
    }
    if (step === 'code') {
      setStep('password');
      return;
    }
    if (step === 'name') {
      setStep('code');
      return;
    }
    if (step === 'intent') {
      setStep('name');
      return;
    }
    if (step === 'audience') {
      setStep('intent');
      return;
    }
    if (step === 'place') {
      setStep(intent === 'seek' ? 'audience' : 'intent');
      return;
    }
    if (step === 'subject') {
      setStep('place');
      return;
    }
    if (step === 'level') {
      setStep('subject');
      return;
    }
    if (step === 'format') {
      setStep('level');
      return;
    }
    onBack?.();
  }

  async function onSignUp() {
    if (!isLoaded || submitting || password.length < 8) return;

    setError('');
    setSubmitting(true);

    try {
      await signUp.create({
        emailAddress: email.trim().toLowerCase(),
        password,
      });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setStep('code');
    } catch (err) {
      const message =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Impossible de créer le compte.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onVerify() {
    if (!isLoaded || submitting || !code.trim()) return;
    if (accountId) {
      setStep('name');
      return;
    }

    setError('');
    setSubmitting(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });

      if (result.status === 'complete') {
        const clerkId = result.createdUserId || signUp.createdUserId;
        if (clerkId) {
          try {
            await saveEmailConsent({
              clerkId,
              email,
              promoEmails,
            });
          } catch (saveErr) {
            console.warn('[email-consent]', saveErr?.message ?? saveErr);
          }
        }
        setAccountId(clerkId);
        setSessionId(result.createdSessionId);
        setStep('name');
        return;
      }

      setError('Vérification incomplète. Réessayez avec le code reçu.');
    } catch (err) {
      const message =
        err?.errors?.[0]?.longMessage ||
        err?.errors?.[0]?.message ||
        err?.message ||
        'Code invalide.';
      setError(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onFinish(overrides) {
    if (submitting || !accountId || !sessionId) return;
    const place = placeFromQuery(locality, pickedPlace);
    if (!place.city) return;
    const chosenSubject = overrides?.subject !== undefined ? overrides.subject : subject;
    const chosenLevel = overrides?.studentLevel !== undefined ? overrides.studentLevel : level;
    const chosenFormat = overrides?.format !== undefined ? overrides.format : coursePlace;

    setError('');
    setSubmitting(true);

    try {
      const role = intent === 'teach' ? ROLES.TUTOR : ROLES.PARENT;
      const given = firstName.trim();
      const family = lastName.trim();
      await saveSignupProfile({
        clerkId: accountId,
        role,
        firstName: given,
        lastName: family,
        seekingFor: role === ROLES.PARENT ? audience : null,
        searchFilters:
          role === ROLES.PARENT
            ? { subject: chosenSubject, studentLevel: chosenLevel, format: chosenFormat }
            : null,
        city: place.city,
        postalCode: place.postalCode,
        latitude: place.latitude,
        longitude: place.longitude,
      });
      await setActive({ session: sessionId });
    } catch (err) {
      setError(err?.message || 'Impossible d’enregistrer ces informations.');
      setSubmitting(false);
    }
  }

  const sequence = [
    'name',
    'intent',
    ...(intent === 'teach' ? [] : ['audience']),
    'place',
    ...(intent === 'teach' ? [] : ['subject', 'level', 'format']),
  ];
  const stepIndex = sequence.indexOf(step);
  const progress = stepIndex >= 0 ? (stepIndex + 1) / sequence.length : null;

  const suggestions = suggestLocations(locality).map((loc) =>
    suggestionPlace(loc, locality)
  );

  const field = {
    email: {
      title: 'Votre e-mail ?',
      hint: '',
      value: email,
      onChangeText: setEmail,
      keyboardType: 'email-address',
      secureTextEntry: false,
      actionLabel: 'Suivant',
      ready: isEmail(email),
      onAction: () => {
        setError('');
        setStep('password');
      },
    },
    password: {
      title: 'Votre mot de passe ?',
      hint: 'Choisissez au moins 8 caractères.',
      value: password,
      onChangeText: setPassword,
      keyboardType: 'default',
      secureTextEntry: true,
      actionLabel: 'Suivant',
      ready: password.length >= 8,
      onAction: onSignUp,
    },
    code: {
      title: 'Le code reçu ?',
      hint: `Il a été envoyé à ${email.trim().toLowerCase()}.`,
      value: code,
      onChangeText: setCode,
      keyboardType: 'number-pad',
      secureTextEntry: false,
      actionLabel: 'Vérifier',
      ready: Boolean(code.trim()),
      onAction: onVerify,
    },
    name: {
      title: 'Votre nom ?',
      hint: '',
      value: firstName,
      onChangeText: setFirstName,
      secondValue: lastName,
      onSecondChangeText: setLastName,
      placeholder: 'Prénom',
      secondPlaceholder: 'Nom',
      autoCapitalize: 'words',
      keyboardType: 'default',
      secureTextEntry: false,
      actionLabel: 'Suivant',
      ready: Boolean(firstName.trim()) && Boolean(lastName.trim()),
      onAction: () => {
        setError('');
        setStep('intent');
      },
    },
    intent: {
      title: 'Vous cherchez des cours, ou vous en donnez ?',
      options: [
        { value: 'seek', label: 'Je cherche des cours' },
        { value: 'teach', label: 'Je donne des cours' },
      ],
      selected: intent,
      onSelect: setIntent,
      actionLabel: 'Suivant',
      ready: intent === 'seek' || intent === 'teach',
      onAction: () => {
        setError('');
        setStep(intent === 'seek' ? 'audience' : 'place');
      },
    },
    audience: {
      title: 'Pour vous, ou pour quelqu’un d’autre ?',
      options: [
        { value: 'self', label: 'Pour moi' },
        { value: 'other', label: 'Pour quelqu’un d’autre' },
      ],
      selected: audience,
      onSelect: setAudience,
      actionLabel: 'Suivant',
      ready: audience === 'self' || audience === 'other',
      onAction: () => {
        setError('');
        setStep('place');
      },
    },
    place: {
      title: 'Votre localité ?',
      hint: 'Une commune ou un code postal, pour centrer la recherche.',
      value: locality,
      onChangeText: (text) => {
        setPickedPlace(null);
        setLocality(text);
      },
      placeholder: 'Commune ou code postal',
      autoCapitalize: 'words',
      keyboardType: 'default',
      secureTextEntry: false,
      actionLabel: 'Suivant',
      ready: locality.trim().length >= 2,
      onAction: () => {
        setError('');
        if (intent === 'seek') {
          setStep('subject');
          return;
        }
        onFinish();
      },
    },
    subject: {
      title: 'Quelle matière ?',
      options: [
        ...SPECIALTIES.map((item) => ({ value: item, label: item })),
        { value: 'Autre', label: 'Autre' },
      ],
      selected: subject,
      onSelect: setSubject,
      onSkip: () => {
        setSubject(null);
        setError('');
        setStep('level');
      },
      actionLabel: 'Suivant',
      ready: Boolean(subject),
      onAction: () => {
        setError('');
        setStep('level');
      },
    },
    level: {
      title: 'Quel niveau ?',
      options: STUDENT_LEVEL_GROUPS.map((group) => ({
        value: group.label,
        label: group.label,
      })),
      selected: level,
      onSelect: setLevel,
      onSkip: () => {
        setLevel(null);
        setError('');
        setStep('format');
      },
      actionLabel: 'Suivant',
      ready: Boolean(level),
      onAction: () => {
        setError('');
        setStep('format');
      },
    },
    format: {
      title: 'Où se passe le cours ?',
      options: [
        { value: FORMAT_IN_PERSON, label: 'Face à face' },
        { value: FORMAT_REMOTE, label: 'À distance' },
      ],
      selected: coursePlace,
      onSelect: setCoursePlace,
      onSkip: () => {
        setCoursePlace(null);
        onFinish({ format: null });
      },
      actionLabel: 'Continuer',
      ready: Boolean(coursePlace),
      onAction: onFinish,
    },
  }[step];

  return (
    <AuthStep
      onBack={goBack}
      progress={progress}
      title={field.title}
      hint={field.hint}
      error={error}
      value={field.value}
      onChangeText={field.onChangeText}
      secondValue={field.secondValue}
      onSecondChangeText={field.onSecondChangeText}
      placeholder={field.placeholder}
      secondPlaceholder={field.secondPlaceholder}
      autoCapitalize={field.autoCapitalize}
      keyboardType={field.keyboardType}
      secureTextEntry={field.secureTextEntry}
      options={field.options}
      selected={field.selected}
      onSelect={field.onSelect}
      onSkip={field.onSkip}
      actionLabel={field.actionLabel}
      onAction={field.onAction}
      ready={field.ready}
      submitting={submitting}
      notice={
        step === 'email'
          ? (holdKeyboard) => (
              <View>
                <Text style={styles.notice}>
                  Un e-mail est envoyé pour vérifier cette adresse. Cochez la
                  case si Clutch peut aussi vous envoyer des e-mails
                  promotionnels. Vous pouvez vous désinscrire à tout moment.
                </Text>
                <Pressable
                  onPressIn={holdKeyboard}
                  onPress={() => setPromoEmails((value) => !value)}
                  style={styles.promoRow}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: promoEmails }}
                >
                  <View
                    style={[
                      styles.promoBox,
                      promoEmails && styles.promoBoxOn,
                    ]}
                  >
                    {promoEmails ? (
                      <Ionicons name="checkmark" size={16} color="#111111" />
                    ) : null}
                  </View>
                  <Text style={styles.promoLabel}>
                    Recevoir les e-mails promotionnels
                  </Text>
                </Pressable>
              </View>
            )
          : step === 'place' && suggestions.length
            ? (holdKeyboard) => (
                <View style={styles.suggestions}>
                  {suggestions.map((item) => (
                    <Pressable
                      key={item.label}
                      onPressIn={holdKeyboard}
                      onPress={() => {
                        setPickedPlace(item);
                        setLocality(item.label);
                      }}
                      style={styles.suggestion}
                    >
                      <Text style={styles.suggestionLabel}>{item.label}</Text>
                    </Pressable>
                  ))}
                </View>
              )
            : null
      }
      footer={
        step === 'email' || step === 'password' ? (
          <Pressable onPress={onGoToSignIn}>
            <Text style={authStyles.link}>
              Déjà un compte ?{' '}
              <Text style={authStyles.linkBold}>Se connecter</Text>
            </Text>
          </Pressable>
        ) : null
      }
    />
  );
}

const styles = StyleSheet.create({
  notice: {
    marginTop: 18,
    color: '#A1A1A6',
    fontSize: 15,
    lineHeight: 21,
  },
  promoRow: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  promoBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoBoxOn: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  promoLabel: {
    flex: 1,
    marginLeft: 12,
    color: '#FFFFFF',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '600',
  },
  suggestions: {
    marginTop: 8,
  },
  suggestion: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.16)',
  },
  suggestionLabel: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
  },
});
