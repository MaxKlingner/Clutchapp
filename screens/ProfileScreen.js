import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../constants/theme';
import { useRole } from '../lib/RoleContext';
import { ROLES } from '../lib/roles';

function displayName(user) {
  return (
    user?.fullName ||
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
    'Mon compte'
  );
}

function initials(name) {
  return String(name || '?')
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function Row({ icon, label, onPress, danger, busy, last }) {
  return (
    <Pressable
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      disabled={!onPress || busy}
    >
      <View style={[styles.rowIcon, danger && styles.rowIconDanger]}>
        <Ionicons name={icon} size={18} color={danger ? '#FF8A80' : '#E8E8E8'} />
      </View>
      <Text style={[styles.rowLabel, danger && styles.rowDanger]}>{label}</Text>
      {busy ? (
        <ActivityIndicator color="#C7C7CC" />
      ) : onPress ? (
        <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
      ) : null}
    </Pressable>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { signOut, userId } = useAuth();
  const { user } = useUser();
  const { role, switching, switchRole } = useRole();
  const [signingOut, setSigningOut] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isParent = role !== ROLES.TUTOR;
  const isModal = navigation.getState()?.type === 'stack';
  const name = displayName(user);
  const email = user?.primaryEmailAddress?.emailAddress || '';

  async function onSignOut() {
    if (signingOut || deleting) return;
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }

  async function onSwitchRole() {
    if (!userId || switching || signingOut || deleting) return;

    const nextRole = isParent ? ROLES.TUTOR : ROLES.PARENT;
    Alert.alert(
      isParent ? 'Donner des cours' : 'Chercher un cours',
      isParent
        ? 'Tu passes côté tuteur. Tu pourras revenir ici quand tu veux.'
        : 'Tu repasses côté parent, pour chercher un tuteur.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Continuer',
          onPress: async () => {
            try {
              await switchRole(userId, nextRole, name === 'Mon compte' ? null : name);
            } catch (err) {
              Alert.alert('Erreur', err?.message ?? 'Impossible de changer de côté.');
            }
          },
        },
      ]
    );
  }

  function onEditAnnouncement() {
    navigation.navigate('EditTutorProfile');
  }

  function onContact() {
    Linking.openURL('mailto:support@clutch.education').catch(() => {
      Alert.alert('Contact', 'Écris-nous à support@clutch.education');
    });
  }

  function onDeleteAccount() {
    if (!user || deleting || signingOut) return;
    Alert.alert(
      'Supprimer le compte',
      'Ton compte Clutch sera effacé. Cette action est définitive.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await user.delete();
            } catch (err) {
              Alert.alert(
                'Erreur',
                err?.message ?? 'Impossible de supprimer le compte.'
              );
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          {isModal ? (
            <Pressable
              style={styles.closeButton}
              onPress={() => navigation.goBack()}
              accessibilityLabel="Fermer le profil"
              hitSlop={8}
            >
              <Ionicons name="close" size={22} color={colors.white} />
            </Pressable>
          ) : null}
          <Text style={styles.title}>Profil</Text>
          <Text style={styles.subtitle}>
            {email || (isParent ? 'Tu cherches un cours' : 'Tu donnes des cours')}
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          <Pressable
            style={styles.identity}
            onPress={() => navigation.navigate('Account')}
            accessibilityLabel="Mon compte"
          >
            <View style={styles.avatar}>
              {user?.imageUrl ? (
                <Image source={{ uri: user.imageUrl }} style={styles.avatarImage} />
              ) : (
                <Text style={styles.avatarText}>{initials(name)}</Text>
              )}
            </View>
            <View style={styles.identityCopy}>
              <Text style={styles.identityName} numberOfLines={1}>
                {name}
              </Text>
              <Text style={styles.identityMeta} numberOfLines={1}>
                {isParent ? 'Tu cherches un cours' : 'Tu donnes des cours'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
          </Pressable>

          <Text style={styles.section}>Compte</Text>
          <View style={styles.card}>
            <Row
              icon={isParent ? 'school-outline' : 'search-outline'}
              label={isParent ? 'Je veux donner des cours' : 'Je cherche un cours'}
              onPress={onSwitchRole}
              busy={switching}
            />
            {isParent ? null : (
              <Row
                icon="create-outline"
                label="Modifier mon annonce"
                onPress={onEditAnnouncement}
              />
            )}
            <Row icon="mail-outline" label="Contacter Clutch" onPress={onContact} last />
          </View>

          <Text style={styles.section}>Session</Text>
          <View style={styles.card}>
            <Row
              icon="log-out-outline"
              label="Se déconnecter"
              onPress={onSignOut}
              busy={signingOut}
              last
            />
          </View>

          <View style={[styles.card, styles.dangerCard]}>
            <Row
              icon="trash-outline"
              label="Supprimer mon compte"
              onPress={onDeleteAccount}
              busy={deleting}
              danger
              last
            />
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
    paddingBottom: 14,
    alignItems: 'center',
  },
  closeButton: {
    position: 'absolute',
    left: 12,
    top: 4,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2C2C2E',
    zIndex: 2,
  },
  title: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    color: colors.white,
  },
  subtitle: {
    marginTop: 4,
    textAlign: 'center',
    fontSize: 15,
    color: '#A1A1A6',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 36,
  },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#1C1C1E',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    padding: 16,
    marginBottom: 8,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  identityCopy: {
    flex: 1,
  },
  identityName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  identityMeta: {
    marginTop: 4,
    fontSize: 14,
    color: '#A1A1A6',
  },
  section: {
    marginTop: 22,
    marginBottom: 8,
    marginLeft: 4,
    fontSize: 13,
    fontWeight: '700',
    color: '#8E8E93',
  },
  card: {
    backgroundColor: '#1C1C1E',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    overflow: 'hidden',
  },
  dangerCard: {
    marginTop: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A2A',
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowIconDanger: {
    backgroundColor: '#3A2424',
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  rowDanger: {
    color: '#FF8A80',
  },
});
