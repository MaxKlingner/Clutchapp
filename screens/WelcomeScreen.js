import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors } from '../constants/theme';

export default function WelcomeScreen({ onSignUp, onSignIn }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <View style={styles.brandBlock}>
        <Text style={styles.brand}>CLUTCH</Text>
        <Text style={styles.tagline}>Le bon professeur, simplement.</Text>
      </View>

      <View style={styles.actions}>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={onSignUp}
        >
          <Text style={styles.buttonLabel}>Créer un compte</Text>
        </Pressable>
        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
          onPress={onSignIn}
        >
          <Text style={styles.buttonLabel}>Connexion</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.mint,
  },
  brandBlock: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  brand: {
    color: colors.white,
    fontSize: 56,
    fontWeight: '800',
    letterSpacing: 3,
  },
  tagline: {
    marginTop: 14,
    color: 'rgba(255,255,255,0.78)',
    fontSize: 17,
    lineHeight: 24,
    textAlign: 'center',
  },
  actions: {
    paddingHorizontal: 24,
    paddingBottom: 12,
    gap: 12,
  },
  button: {
    height: 56,
    borderRadius: 999,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPressed: {
    opacity: 0.88,
  },
  buttonLabel: {
    color: colors.mint,
    fontSize: 17,
    fontWeight: '700',
  },
});
