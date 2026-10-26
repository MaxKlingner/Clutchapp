import { useState } from 'react';
import { Pressable, Text } from 'react-native';
import { useSignIn } from '@clerk/clerk-expo';

import AuthStep, { authStyles } from '../components/AuthStep';

const CLERK_ERRORS = {
  form_identifier_not_found: 'Aucun compte avec cet email.',
  form_password_incorrect: 'Mot de passe incorrect.',
  form_password_pwned:
    'Ce mot de passe a été exposé dans une fuite. Choisissez-en un autre.',
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

export default function SignInScreen({ onBack, onGoToSignUp }) {
  const { signIn, setActive, isLoaded } = useSignIn();
  const [step, setStep] = useState('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function onSignIn() {
    if (!isLoaded || submitting || !password) return;

    setError('');
    setSubmitting(true);

    try {
      const identifier = email.trim().toLowerCase();
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

  const onPassword = step === 'password';

  return (
    <AuthStep
      onBack={() => {
        setError('');
        if (onPassword) {
          setStep('email');
          return;
        }
        onBack?.();
      }}
      title={onPassword ? 'Votre mot de passe ?' : 'Votre e-mail ?'}
      hint={
        onPassword
          ? 'Celui que vous avez choisi pour ce compte.'
          : 'Entrez l’adresse avec laquelle vous vous êtes inscrit.'
      }
      error={error}
      value={onPassword ? password : email}
      onChangeText={onPassword ? setPassword : setEmail}
      keyboardType={onPassword ? 'default' : 'email-address'}
      secureTextEntry={onPassword}
      actionLabel={onPassword ? 'Se connecter' : 'Suivant'}
      onAction={
        onPassword
          ? onSignIn
          : () => {
              setError('');
              setStep('password');
            }
      }
      ready={onPassword ? password.length > 0 : isEmail(email)}
      submitting={submitting}
      footer={
        <Pressable onPress={onGoToSignUp}>
          <Text style={authStyles.link}>
            Pas encore de compte ?{' '}
            <Text style={authStyles.linkBold}>S’inscrire</Text>
          </Text>
        </Pressable>
      }
    />
  );
}
