import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSignUp } from '@clerk/clerk-expo';

export default function SignUpScreen({ onGoToSignIn }) {
  const { signUp, setActive, isLoaded } = useSignUp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSignUp() {
    if (!isLoaded || submitting) return;

    setError('');
    setSubmitting(true);

    try {
      await signUp.create({
        emailAddress: email.trim(),
        password,
      });

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
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
    if (!isLoaded || submitting) return;

    setError('');
    setSubmitting(true);

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: code.trim(),
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        return;
      }

      setError('Vérification incomplète. Réessaie avec le code reçu.');
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

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <Text style={styles.brand}>CLUTCH</Text>
          <Text style={styles.title}>
            {pendingVerification ? 'Vérification' : 'Inscription'}
          </Text>
          <Text style={styles.subtitle}>
            {pendingVerification
              ? 'Entre le code reçu par email pour activer ton compte.'
              : 'Crée ton compte pour accéder aux tuteurs.'}
          </Text>

          {!pendingVerification ? (
            <>
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoComplete="email"
                keyboardType="email-address"
                placeholder="Email"
                placeholderTextColor="#7A9185"
                value={email}
                onChangeText={setEmail}
              />
              <TextInput
                style={styles.input}
                autoCapitalize="none"
                autoComplete="password"
                placeholder="Mot de passe"
                placeholderTextColor="#7A9185"
                secureTextEntry
                value={password}
                onChangeText={setPassword}
              />
            </>
          ) : (
            <TextInput
              style={styles.input}
              autoCapitalize="none"
              keyboardType="number-pad"
              placeholder="Code de vérification"
              placeholderTextColor="#7A9185"
              value={code}
              onChangeText={setCode}
            />
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            style={[styles.button, submitting && styles.buttonDisabled]}
            onPress={pendingVerification ? onVerify : onSignUp}
            disabled={
              submitting ||
              (!pendingVerification && (!email || !password)) ||
              (pendingVerification && !code)
            }
          >
            {submitting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.buttonLabel}>
                {pendingVerification ? 'Vérifier' : 'Créer mon compte'}
              </Text>
            )}
          </Pressable>

          {!pendingVerification ? (
            <Pressable onPress={onGoToSignIn}>
              <Text style={styles.link}>
                Déjà un compte ?{' '}
                <Text style={styles.linkBold}>Se connecter</Text>
              </Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#F3F6F4',
  },
  flex: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  brand: {
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: 2,
    color: '#0F2A1F',
  },
  title: {
    marginTop: 18,
    fontSize: 28,
    fontWeight: '700',
    color: '#10261C',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 16,
    lineHeight: 24,
    color: '#4A6357',
  },
  input: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D7E3DC',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#10261C',
    marginBottom: 12,
  },
  error: {
    color: '#C0392B',
    marginBottom: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#1B5E3B',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonDisabled: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  link: {
    marginTop: 22,
    textAlign: 'center',
    fontSize: 15,
    color: '#4A6357',
  },
  linkBold: {
    color: '#1B5E3B',
    fontWeight: '700',
  },
});
