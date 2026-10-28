import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../constants/theme';
import { clerkResetRequest, resetEmailFactor } from '../lib/clerkReset';

const CLERK_ERRORS = {
  form_password_incorrect: 'Le mot de passe actuel est incorrect.',
  form_password_pwned: 'Ce mot de passe a déjà fuité. Choisis-en un autre.',
  form_password_length_too_short: 'Le nouveau mot de passe doit faire au moins 8 caractères.',
  form_password_not_strong_enough: 'Ce mot de passe n’est pas assez sûr.',
  form_password_validation_failed: 'Ce mot de passe n’est pas assez sûr.',
  form_code_incorrect: 'Ce code est incorrect.',
  form_code_expired: 'Ce code a expiré. Demande-en un nouveau.',
  verification_expired: 'Ce code a expiré. Demande-en un nouveau.',
  verification_failed: 'Ce code est incorrect.',
  too_many_requests: 'Trop de tentatives. Réessaie dans un moment.',
};

const CODE_ERRORS = ['form_code_incorrect', 'form_code_expired', 'verification_expired', 'verification_failed'];

function clerkMessage(err, fallback) {
  const code = err?.errors?.[0]?.code;
  if (code && CLERK_ERRORS[code]) return CLERK_ERRORS[code];
  return (
    err?.errors?.[0]?.longMessage ||
    err?.errors?.[0]?.message ||
    err?.message ||
    fallback
  );
}

/** Maps a Clerk error onto the field it concerns, with a French message. */
function clerkFieldError(err, fallback) {
  const first = err?.errors?.[0];
  const code = first?.code || '';
  const param = first?.meta?.paramName || '';
  if (param === 'current_password' || code === 'form_password_incorrect') {
    return { current: 'Le mot de passe actuel est incorrect.' };
  }
  if (param === 'code' || CODE_ERRORS.includes(code)) {
    return { code: clerkMessage(err, 'Ce code est incorrect.') };
  }
  if (param === 'new_password' || param === 'password' || code.startsWith('form_password')) {
    return { next: clerkMessage(err, 'Ce mot de passe n’est pas valide.') };
  }
  return { general: clerkMessage(err, fallback) };
}

function FieldError({ message }) {
  return message ? <Text style={styles.error}>{message}</Text> : null;
}

export default function ChangePasswordScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { user } = useUser();
  const [phase, setPhase] = useState('edit');
  const [currentPassword, setCurrentPassword] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const scrollRef = useRef(null);
  const resetRef = useRef({ token: '', signInId: '', emailAddressId: '' });

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const canChange =
    currentPassword.length > 0 && nextPassword.length > 0 && confirmPassword.length > 0;
  const canReset = nextPassword.length > 0 && confirmPassword.length > 0;

  function edit(setter, ...keys) {
    return (value) => {
      setter(value);
      if (keys.some((key) => errors[key]) || errors.general) {
        setErrors((prev) => {
          const next = { ...prev, general: undefined };
          keys.forEach((key) => {
            next[key] = undefined;
          });
          return next;
        });
      }
    };
  }

  function validateNew({ withCurrent }) {
    const found = {};
    if (withCurrent && !currentPassword) found.current = 'Indique ton mot de passe actuel.';
    if (nextPassword.length < 8) {
      found.next = 'Le nouveau mot de passe doit faire au moins 8 caractères.';
    } else if (withCurrent && nextPassword === currentPassword) {
      found.next = 'Le nouveau mot de passe doit être différent de l’actuel.';
    }
    if (confirmPassword !== nextPassword) {
      found.confirm = 'Les deux mots de passe ne correspondent pas.';
    }
    setErrors(found);
    return Object.keys(found).length === 0;
  }

  function goBack() {
    setErrors({});
    if (phase === 'choose') {
      setPhase('code');
      return;
    }
    if (phase === 'code') {
      setPhase('edit');
      setCode('');
      setNextPassword('');
      setConfirmPassword('');
      return;
    }
    navigation.goBack();
  }

  async function onChange() {
    if (!user || !canChange || submitting) return;
    if (!validateNew({ withCurrent: true })) return;
    setSubmitting(true);
    try {
      await user.updatePassword({
        currentPassword,
        newPassword: nextPassword,
        signOutOfOtherSessions: true,
      });
      Alert.alert('Mot de passe modifié', 'Ton nouveau mot de passe est enregistré.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      setErrors(clerkFieldError(err, 'Impossible de modifier le mot de passe.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function sendCode() {
    if (submitting) return;
    if (!email) {
      setErrors({ general: 'Aucune adresse e-mail n’est associée à ce compte.' });
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const created = await clerkResetRequest('/v1/client/sign_ins', {
        body: {
          strategy: 'reset_password_email_code',
          identifier: email,
        },
      });
      const factor = resetEmailFactor(created.signIn);
      const emailAddressId = factor?.email_address_id || factor?.emailAddressId || '';
      if (!created.token || !created.signIn?.id) {
        throw new Error('Impossible d’envoyer le code.');
      }
      resetRef.current = {
        token: created.token,
        signInId: created.signIn.id,
        emailAddressId,
      };
      setCode('');
      setNextPassword('');
      setConfirmPassword('');
      setPhase('code');
    } catch (err) {
      setErrors({ general: clerkMessage(err, 'Impossible d’envoyer le code.') });
    } finally {
      setSubmitting(false);
    }
  }

  async function resendCode() {
    if (submitting || !email) return;
    const current = resetRef.current;
    if (!current.signInId || !current.emailAddressId) {
      await sendCode();
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const next = await clerkResetRequest(
        `/v1/client/sign_ins/${current.signInId}/prepare_first_factor`,
        {
          token: current.token,
          body: {
            strategy: 'reset_password_email_code',
            email_address_id: current.emailAddressId,
          },
        }
      );
      if (next.token) resetRef.current.token = next.token;
      Alert.alert('Code renvoyé', `Un nouveau code a été envoyé à ${email}.`);
    } catch (err) {
      setErrors({ general: clerkMessage(err, 'Impossible de renvoyer le code.') });
    } finally {
      setSubmitting(false);
    }
  }

  async function onReset() {
    if (!canReset || submitting) return;
    if (!validateNew({ withCurrent: false })) return;
    const current = resetRef.current;
    if (!current.signInId) {
      setErrors({ general: 'Demande d’abord le code envoyé par e-mail.' });
      return;
    }
    setSubmitting(true);
    try {
      let next = await clerkResetRequest(
        `/v1/client/sign_ins/${current.signInId}/attempt_first_factor`,
        {
          token: current.token,
          body: {
            strategy: 'reset_password_email_code',
            code: code.trim(),
            password: nextPassword,
          },
        }
      );
      if (next.token) resetRef.current.token = next.token;
      if (next.signIn?.status === 'needs_new_password') {
        next = await clerkResetRequest(
          `/v1/client/sign_ins/${current.signInId}/reset_password`,
          {
            token: resetRef.current.token,
            body: {
              password: nextPassword,
              sign_out_of_other_sessions: 'false',
            },
          }
        );
      }
      if (next.signIn?.status === 'needs_second_factor') {
        Alert.alert(
          'Vérification',
          'Une vérification supplémentaire est demandée. Écris à support@clutch.education.'
        );
        return;
      }
      if (next.signIn?.status !== 'complete') {
        setErrors({ general: 'La réinitialisation n’a pas abouti. Réessaie.' });
        return;
      }
      Alert.alert('Mot de passe réinitialisé', 'Tu peux continuer avec ce nouveau mot de passe.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      const found = clerkFieldError(err, 'Impossible de réinitialiser le mot de passe.');
      if (found.code) setPhase('code');
      setErrors(found);
    } finally {
      setSubmitting(false);
    }
  }

  const title = phase === 'edit' ? 'Mot de passe' : 'Réinitialiser';

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={styles.back}
            onPress={goBack}
            accessibilityLabel="Retour"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>{title}</Text>
        </View>

        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.list}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
            showsVerticalScrollIndicator={false}
          >
            {phase === 'edit' ? (
              <>
                <Text style={styles.lead}>
                  Indique ton mot de passe actuel, puis choisis-en un nouveau.
                </Text>
                <TextInput
                  style={[styles.input, errors.current && styles.inputError]}
                  value={currentPassword}
                  onChangeText={edit(setCurrentPassword, 'current')}
                  placeholder="Mot de passe actuel"
                  placeholderTextColor="#8E8E93"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="password"
                  keyboardAppearance="dark"
                />
                <FieldError message={errors.current} />
                <TextInput
                  style={[styles.input, errors.next && styles.inputError]}
                  value={nextPassword}
                  onChangeText={edit(setNextPassword, 'next', 'confirm')}
                  placeholder="Nouveau mot de passe"
                  placeholderTextColor="#8E8E93"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  keyboardAppearance="dark"
                />
                <FieldError message={errors.next} />
                <TextInput
                  style={[styles.input, errors.confirm && styles.inputError]}
                  value={confirmPassword}
                  onChangeText={edit(setConfirmPassword, 'confirm')}
                  placeholder="Confirmer le nouveau mot de passe"
                  placeholderTextColor="#8E8E93"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  keyboardAppearance="dark"
                  onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                />
                <FieldError message={errors.confirm} />
                <Text style={styles.hint}>Au moins 8 caractères.</Text>
                <Pressable
                  style={[styles.save, !canChange && styles.saveOff]}
                  onPress={onChange}
                  disabled={!canChange || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={[styles.saveLabel, !canChange && styles.saveLabelOff]}>
                      Enregistrer
                    </Text>
                  )}
                </Pressable>
                <Pressable style={styles.linkButton} onPress={sendCode} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#E8E8E8" />
                  ) : (
                    <Text style={styles.link}>Mot de passe oublié ?</Text>
                  )}
                </Pressable>
                <FieldError message={errors.general} />
              </>
            ) : null}

            {phase === 'code' ? (
              <>
                <Text style={styles.lead}>
                  Un code a été envoyé à {email}. Entre-le pour choisir un nouveau mot de passe.
                </Text>
                <TextInput
                  style={[styles.input, errors.code && styles.inputError]}
                  value={code}
                  onChangeText={edit(setCode, 'code')}
                  placeholder="Code reçu par e-mail"
                  placeholderTextColor="#8E8E93"
                  keyboardType="number-pad"
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardAppearance="dark"
                />
                <FieldError message={errors.code} />
                <Pressable
                  style={[styles.save, !code.trim() && styles.saveOff]}
                  onPress={() => {
                    if (!code.trim()) return;
                    setErrors({});
                    setPhase('choose');
                  }}
                  disabled={!code.trim() || submitting}
                >
                  <Text style={[styles.saveLabel, !code.trim() && styles.saveLabelOff]}>
                    Suivant
                  </Text>
                </Pressable>
                <Pressable style={styles.linkButton} onPress={resendCode} disabled={submitting}>
                  {submitting ? (
                    <ActivityIndicator color="#E8E8E8" />
                  ) : (
                    <Text style={styles.link}>Renvoyer le code</Text>
                  )}
                </Pressable>
                <FieldError message={errors.general} />
              </>
            ) : null}

            {phase === 'choose' ? (
              <>
                <Text style={styles.lead}>Choisis le mot de passe qui remplace l’ancien.</Text>
                <TextInput
                  style={[styles.input, errors.next && styles.inputError]}
                  value={nextPassword}
                  onChangeText={edit(setNextPassword, 'next', 'confirm')}
                  placeholder="Nouveau mot de passe"
                  placeholderTextColor="#8E8E93"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  keyboardAppearance="dark"
                />
                <FieldError message={errors.next} />
                <TextInput
                  style={[styles.input, errors.confirm && styles.inputError]}
                  value={confirmPassword}
                  onChangeText={edit(setConfirmPassword, 'confirm')}
                  placeholder="Confirmer le nouveau mot de passe"
                  placeholderTextColor="#8E8E93"
                  secureTextEntry
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType="newPassword"
                  keyboardAppearance="dark"
                  onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                />
                <FieldError message={errors.confirm} />
                <Text style={styles.hint}>Au moins 8 caractères, les deux saisies identiques.</Text>
                <Pressable
                  style={[styles.save, !canReset && styles.saveOff]}
                  onPress={onReset}
                  disabled={!canReset || submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <Text style={[styles.saveLabel, !canReset && styles.saveLabelOff]}>
                      Réinitialiser
                    </Text>
                  )}
                </Pressable>
                <FieldError message={errors.general} />
              </>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    minHeight: 56,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    backgroundColor: '#111111',
  },
  back: {
    position: 'absolute',
    left: 12,
    top: 8,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  list: { paddingHorizontal: 20, paddingTop: 18, paddingBottom: 40 },
  lead: {
    fontSize: 16,
    lineHeight: 22,
    color: '#C7C7CC',
    marginBottom: 18,
  },
  input: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  inputError: { borderColor: '#FF8A80' },
  error: {
    marginTop: -4,
    marginBottom: 10,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#FF8A80',
  },
  hint: {
    marginTop: 2,
    marginBottom: 8,
    fontSize: 13,
    color: '#8E8E93',
  },
  save: {
    marginTop: 8,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveOff: { backgroundColor: '#2C2C2E' },
  saveLabel: { fontSize: 16, fontWeight: '800', color: colors.white },
  saveLabelOff: { color: '#8E8E93' },
  linkButton: { marginTop: 18, alignItems: 'center', paddingVertical: 8 },
  link: { fontSize: 16, fontWeight: '700', color: colors.white },
});
