import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../constants/theme';

export default function TutorGuideScreen() {
  const isFocused = useIsFocused();
  const { user } = useUser();
  const firstName =
    user?.firstName?.trim() || String(user?.fullName || '').trim().split(/\s+/)[0] || '';

  function onContact() {
    Linking.openURL('mailto:support@clutch.education').catch(() => {});
  }

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Text style={styles.brandMark}>Clutch</Text>
        </View>

        <ScrollView contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
          <Text style={styles.headline}>
            {firstName ? `Bienvenue ${firstName},` : 'Bienvenue,'}
          </Text>

          <Text style={styles.paragraph}>
            Clutch a été créée par des étudiants, pour rendre le contact entre
            celles et ceux qui cherchent un cours et les profs particuliers le plus
            fluide possible.
          </Text>

          <Text style={styles.paragraph}>
            Une fois ton cours terminé, rien ne t’oblige à faire passer le paiement
            par Clutch. Mais si tu le fais, ce cours s’ajoute à ton compteur, et
            chaque cours compté rend ton profil plus visible auprès des parents.{' '}
            <Text style={styles.emphasis}>
              C’est aussi grâce à ces paiements que l’app peut continuer d’exister.
            </Text>
          </Text>

          <Text style={styles.paragraph}>
            Chaque cours que tu donnes aide un élève à avancer, et aide Clutch à
            grandir. Merci de nous faire confiance, et bons cours !
          </Text>

          <Text style={styles.signature}>L’équipe Clutch</Text>

          <View style={styles.footer}>
            <Pressable style={styles.contact} onPress={onContact}>
              <Ionicons name="mail-outline" size={16} color="#8E8E93" />
              <Text style={styles.contactLabel}>support@clutch.education</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#111111',
  },
  safe: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  brandMark: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    color: '#3DDC97',
    marginBottom: 14,
  },
  page: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 28,
  },
  headline: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 22,
  },
  paragraph: {
    fontSize: 17,
    lineHeight: 27,
    color: '#C7C7CC',
    textAlign: 'justify',
    marginBottom: 20,
  },
  emphasis: {
    color: colors.white,
    fontWeight: '700',
  },
  signature: {
    marginTop: 4,
    fontSize: 16,
    fontWeight: '700',
    color: '#3DDC97',
  },
  footer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingTop: 32,
  },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  contactLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#8E8E93',
  },
});
