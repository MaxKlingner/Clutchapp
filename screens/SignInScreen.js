import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';

import AuthStep, { authStyles } from '../components/AuthStep';

const CLERK_ERRORS = {
  form_identifier_not_found: 'Aucun compte avec cet email.',
  form_password_incorrect: 'Mot de passe incorrect.',
  form_password_pwned:
    'Ce mot de passe a été exposé dans une fuite. Choisissez-en un autre.',
  form_password_length_too_short: 'Choisissez au moins 8 caractères.',
  form_password_validation_failed: 'Ce mot de passe n’est pas assez sûr.',
  form_code_incorrect: 'Ce code est incorrect.',
  form_code_expired: 'Ce code a expiré. Demandez-en un nouveau.',
  verification_expired: 'Ce code a expiré. Demandez-en un nouveau.',
  verification_failed: 'Ce code est incorrect.',
  strategy_for_user_invalid:
    'Ce compte ne peut pas se connecter avec un mot de passe.',
  too_many_requests: 'Trop de tentatives. Réessayez dans un moment.',
};

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

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function resetFactor(signIn) {
  return signIn?.supportedFirstFactors?.find(
    (item) => item.strategy === 'reset_password_email_code'
  );
}

export default function SignInScreen({ onBack, onGoToSignUp }) {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [nextPassword, setNextPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailAddressId, setEmailAddressId] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const identifier = email.trim().toLowerCase();

  async function onSignIn() {
    if (!isLoaded || submitting || !password) return;

    setError('');
    setSubmitting(true);

    try {
      let result = await signIn.create({
        strategy: 'password',
        identifier,
        password,
      });

      if (result.status === 'needs_first_factor') {
        result = await signIn.attemptFirstFactor({
          strategy: 'password',
          password,
        });
      }

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        return;
      }

      setError('Connexion incomplète. Réessayez.');
    } catch (err) {
      setError(clerkMessage(err, 'Impossible de se connecter.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgot() {
    if (!isLoaded || submitting || !isEmail(email)) return;
    setError('');
    setSubmitting(true);
    try {
      const created = await signIn.create({
        strategy: 'reset_password_email_code',
        identifier,
      });
      setEmailAddressId(resetFactor(created)?.emailAddressId || '');
      setCode('');
      setNextPassword('');
      setConfirmPassword('');
      setStep('code');
    } catch (err) {
      setError(clerkMessage(err, 'Impossible d’envoyer le code.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onResend() {
    if (!isLoaded || submitting || !isEmail(email)) return;
    setError('');
    setSubmitting(true);
    try {
      let factorId = emailAddressId || resetFactor(signIn)?.emailAddressId;
      if (!factorId) {
        const created = await signIn.create({
          strategy: 'reset_password_email_code',
          identifier,
        });
        factorId = resetFactor(created)?.emailAddressId || '';
        setEmailAddressId(factorId);
      } else {
        await signIn.prepareFirstFactor({
          strategy: 'reset_password_email_code',
          emailAddressId: factorId,
        });
      }
      Alert.alert('Code renvoyé', `Un nouveau code a été envoyé à ${identifier}.`);
    } catch (err) {
      setError(clerkMessage(err, 'Impossible de renvoyer le code.'));
    } finally {
      setSubmitting(false);
    }
  }

  async function onReset() {
    if (!isLoaded || submitting) return;
    if (nextPassword.length < 8) {
      setError('Choisissez au moins 8 caractères.');
      return;
    }
    if (nextPassword !== confirmPassword) {
      setError('Les deux mots de passe ne correspondent pas.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      let result = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code: code.trim(),
        password: nextPassword,
      });
      if (result.status === 'needs_new_password') {
        result = await signIn.resetPassword({
          password: nextPassword,
          signOutOfOtherSessions: true,
        });
      }
      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        return;
      }
      if (result.status === 'needs_second_factor') {
        setError('Une vérification supplémentaire est requise. Écrivez à support@clutch.education.');
        return;
      }
      setError('Réinitialisation incomplète. Réessayez.');
    } catch (err) {
      setError(clerkMessage(err, 'Impossible de réinitialiser le mot de passe.'));
    } finally {
      setSubmitting(false);
    }
  }

  const onPassword = step === 'password';
  const onCode = step === 'code';
  const onResetPassword = step === 'reset';

  let title = 'Votre e-mail ?';
  let hint = 'Entrez l’adresse avec laquelle vous vous êtes inscrit.';
  let value = email;
  let onChangeText = setEmail;
  let actionLabel = 'Suivant';
  let ready = isEmail(email);
  let onAction = () => {
    setError('');
    setStep('password');
  };

  if (onPassword) {
    title = 'Votre mot de passe ?';
    hint = 'Celui que vous avez choisi pour ce compte.';
    value = password;
    onChangeText = setPassword;
    actionLabel = 'Se connecter';
    ready = password.length > 0;
    onAction = onSignIn;
  } else if (onCode) {
    title = 'Le code reçu ?';
    hint = `Il a été envoyé à ${identifier}.`;
    value = code;
    onChangeText = setCode;
    actionLabel = 'Suivant';
    ready = Boolean(code.trim());
    onAction = () => {
      setError('');
      setStep('reset');
    };
  } else if (onResetPassword) {
    title = 'Choisissez un nouveau mot de passe';
    hint = 'Au moins 8 caractères.';
    value = nextPassword;
    onChangeText = setNextPassword;
    actionLabel = 'Réinitialiser';
    ready = nextPassword.length >= 8 && nextPassword === confirmPassword;
    onAction = onReset;
  }

  return (
    <AuthStep
      onBack={() => {
        setError('');
        if (onResetPassword) {
          setStep('code');
          return;
        }
        if (onCode) {
          setStep('password');
          return;
        }
        if (onPassword) {
          setStep('email');
          return;
        }
        onBack?.();
      }}
      title={title}
      hint={hint}
      error={error}
      value={value}
      onChangeText={onChangeText}
      keyboardType={onCode ? 'number-pad' : onPassword || onResetPassword ? 'default' : 'email-address'}
      secureTextEntry={onPassword || onResetPassword}
      secondValue={onResetPassword ? confirmPassword : undefined}
      onSecondChangeText={onResetPassword ? setConfirmPassword : undefined}
      secondPlaceholder="Confirmez le mot de passe"
      secondSecureTextEntry
      actionLabel={actionLabel}
      onAction={onAction}
      ready={ready}
      submitting={submitting}
      footer={
        <View>
          {onPassword ? (
            <Pressable onPress={onForgot} disabled={submitting}>
              <Text style={authStyles.link}>Mot de passe oublié ?</Text>
            </Pressable>
          ) : null}
          {onCode ? (
            <Pressable onPress={onResend} disabled={submitting}>
              <Text style={authStyles.link}>Renvoyer le code</Text>
            </Pressable>
          ) : null}
          {onPassword || step === 'email' ? (
            <Pressable onPress={onGoToSignUp}>
              <Text style={authStyles.link}>
                Pas encore de compte ?{' '}
                <Text style={authStyles.linkBold}>S’inscrire</Text>
              </Text>
            </Pressable>
          ) : null}
        </View>
      }
    />
  );
}
