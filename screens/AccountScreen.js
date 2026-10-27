import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';

import { colors } from '../constants/theme';
import { fetchUserPlace, saveAccountIdentity } from '../lib/roles';

const GENDERS = ['Homme', 'Femme', 'Autre'];

function metaOf(user) {
  const raw = user?.unsafeMetadata;
  return raw && typeof raw === 'object' ? raw : {};
}

export default function AccountScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { userId } = useAuth();
  const { user } = useUser();
  const [gender, setGender] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
  const [photoUri, setPhotoUri] = useState(null);
  const [baseline, setBaseline] = useState('');
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const email = user?.primaryEmailAddress?.emailAddress || '';
  const phoneVerified = user?.primaryPhoneNumber?.verification?.status === 'verified';

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const meta = metaOf(user);
      const place = userId ? await fetchUserPlace(userId).catch(() => null) : null;
      const storedAddress =
        typeof meta.address === 'string' && meta.address.trim()
          ? meta.address.trim()
          : [place?.postalCode, place?.city].filter(Boolean).join(' ');
      const next = {
        gender: typeof meta.gender === 'string' ? meta.gender : '',
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        birthDate: typeof meta.birthDate === 'string' ? meta.birthDate : '',
        phone:
          (typeof meta.phone === 'string' && meta.phone) ||
          user?.primaryPhoneNumber?.phoneNumber ||
          '',
        address: storedAddress,
      };
      if (cancelled) return;
      setGender(next.gender);
      setFirstName(next.firstName);
      setLastName(next.lastName);
      setBirthDate(next.birthDate);
      setPhone(next.phone);
      setAddress(next.address);
      setPhotoUri(user?.imageUrl || null);
      setBaseline(JSON.stringify(next));
      setReady(true);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [user, userId]);

  const current = JSON.stringify({
    gender,
    firstName,
    lastName,
    birthDate,
    phone,
    address,
  });
  const dirty = ready && (current !== baseline || password.length > 0);

  function chooseGender() {
    Alert.alert('Genre', 'Choisis une option.', [
      ...GENDERS.map((item) => ({ text: item, onPress: () => setGender(item) })),
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  function onPickPhoto() {
    if (!user) return;
    Alert.alert('Photo de profil', 'D’où vient la photo ?', [
      { text: 'Prendre une photo', onPress: () => capturePhoto('camera') },
      { text: 'Choisir dans la galerie', onPress: () => capturePhoto('library') },
      { text: 'Annuler', style: 'cancel' },
    ]);
  }

  async function capturePhoto(source) {
    if (!user) return;
    try {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Accès refusé',
          source === 'camera'
            ? 'Autorise l’appareil photo pour prendre ta photo de profil.'
            : 'Autorise la galerie pour choisir ta photo de profil.',
          [
            { text: 'Plus tard', style: 'cancel' },
            { text: 'Ouvrir les réglages', onPress: () => Linking.openSettings() },
          ]
        );
        return;
      }
      const options = {
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
        base64: true,
      };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      setPhotoUri(asset.uri);
      const file = asset.base64 ? `data:image/jpeg;base64,${asset.base64}` : asset.uri;
      await user.setProfileImage({ file });
      await user.reload();
    } catch (err) {
      Alert.alert(
        'Photo',
        err?.errors?.[0]?.message || err?.message || 'Impossible d’enregistrer la photo.'
      );
    }
  }

  async function onSave() {
    if (!user || !dirty || saving) return;
    setSaving(true);
    try {
      const meta = metaOf(user);
      await user.update({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        unsafeMetadata: {
          ...meta,
          gender,
          birthDate: birthDate.trim(),
          phone: phone.trim(),
          address: address.trim(),
        },
      });
      if (password) {
        await user.updatePassword({ newPassword: password });
        setPassword('');
      }
      if (userId) {
        await saveAccountIdentity({
          clerkId: userId,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
        });
      }
      await user.reload();
      setBaseline(current);
      Alert.alert('Enregistré', 'Tes informations sont à jour.');
    } catch (err) {
      Alert.alert(
        'Erreur',
        err?.errors?.[0]?.longMessage ||
          err?.errors?.[0]?.message ||
          err?.message ||
          'Impossible d’enregistrer ces informations.'
      );
    } finally {
      setSaving(false);
    }
  }

  function onDelete() {
    if (!user || deleting) return;
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
                err?.errors?.[0]?.message || err?.message || 'Impossible de supprimer le compte.'
              );
              setDeleting(false);
            }
          },
        },
      ]
    );
  }

  const shownName = firstName.trim() || 'Mon compte';

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar style="light" /> : null}
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.header}>
          <Pressable
            style={styles.back}
            onPress={() => navigation.goBack()}
            accessibilityLabel="Retour"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.title}>Paramètres</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View>
              {photoUri ? (
                <Image source={{ uri: photoUri }} style={styles.photo} />
              ) : (
                <View style={styles.photo}>
                  <Ionicons name="person" size={42} color="#8E8E93" />
                </View>
              )}
              <Pressable
                style={styles.editPhoto}
                onPress={onPickPhoto}
                accessibilityLabel="Modifier la photo"
              >
                <Ionicons name="pencil" size={16} color={colors.white} />
              </Pressable>
            </View>
            <Text style={styles.heroName}>{shownName}</Text>
          </View>

          <Text style={styles.section}>Informations générales</Text>
          <Pressable style={styles.field} onPress={chooseGender}>
            <Text style={styles.fieldLabel}>Genre</Text>
            <View style={styles.fieldRow}>
              <Text style={gender ? styles.fieldValue : styles.fieldPlaceholder}>
                {gender || 'Choisir'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#8E8E93" />
            </View>
          </Pressable>
          <TextInput
            style={styles.input}
            value={firstName}
            onChangeText={setFirstName}
            placeholder="Prénom"
            placeholderTextColor="#8E8E93"
            autoCapitalize="words"
            keyboardAppearance="dark"
          />
          <TextInput
            style={styles.input}
            value={lastName}
            onChangeText={setLastName}
            placeholder="Nom"
            placeholderTextColor="#8E8E93"
            autoCapitalize="words"
            keyboardAppearance="dark"
          />
          <TextInput
            style={styles.input}
            value={birthDate}
            onChangeText={setBirthDate}
            placeholder="Date de naissance"
            placeholderTextColor="#8E8E93"
            keyboardAppearance="dark"
          />
          <View style={styles.phoneField}>
            <Text style={styles.flag}>🇧🇪</Text>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="Téléphone"
              placeholderTextColor="#8E8E93"
              keyboardType="phone-pad"
              keyboardAppearance="dark"
            />
            {phoneVerified ? (
              <Ionicons name="checkmark-circle" size={22} color="#3DDC97" />
            ) : null}
          </View>
          <TextInput
            style={[styles.input, styles.address]}
            value={address}
            onChangeText={setAddress}
            placeholder="Adresse"
            placeholderTextColor="#8E8E93"
            keyboardAppearance="dark"
            multiline
          />

          <Text style={styles.section}>Paramètres du compte</Text>
          <View style={styles.field}>
            <Text style={styles.lockedValue}>{email || 'E-mail'}</Text>
          </View>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Mot de passe"
            placeholderTextColor="#8E8E93"
            secureTextEntry
            autoCapitalize="none"
            keyboardAppearance="dark"
          />

          <Pressable
            style={[styles.save, !dirty && styles.saveOff]}
            onPress={onSave}
            disabled={!dirty || saving}
          >
            {saving ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Text style={[styles.saveLabel, !dirty && styles.saveLabelOff]}>Enregistrer</Text>
            )}
          </Pressable>

          <Pressable style={styles.delete} onPress={onDelete} disabled={deleting}>
            {deleting ? (
              <ActivityIndicator color="#FF8A80" />
            ) : (
              <Text style={styles.deleteLabel}>Supprimer le compte</Text>
            )}
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#111111' },
  safe: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  back: {
    position: 'absolute',
    left: 12,
    top: 4,
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
  list: { paddingHorizontal: 20, paddingBottom: 40 },
  hero: { alignItems: 'center', marginTop: 12, marginBottom: 8 },
  photo: {
    width: 112,
    height: 112,
    borderRadius: 56,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editPhoto: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#FF5A6A',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: '#111111',
  },
  heroName: {
    marginTop: 14,
    fontSize: 22,
    fontWeight: '800',
    color: colors.white,
  },
  section: {
    marginTop: 22,
    marginBottom: 10,
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
  },
  field: {
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 10,
  },
  fieldLabel: { fontSize: 13, color: '#8E8E93', marginBottom: 2 },
  fieldRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  fieldValue: { fontSize: 16, fontWeight: '700', color: colors.white },
  fieldPlaceholder: { fontSize: 16, color: '#8E8E93' },
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
  address: { minHeight: 64, textAlignVertical: 'top' },
  phoneField: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    paddingHorizontal: 16,
    marginBottom: 10,
  },
  flag: { fontSize: 22 },
  phoneInput: {
    flex: 1,
    paddingVertical: 16,
    fontSize: 16,
    fontWeight: '600',
    color: colors.white,
  },
  lockedValue: { fontSize: 16, color: '#A1A1A6' },
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
  delete: { marginTop: 22, alignItems: 'center', paddingVertical: 8 },
  deleteLabel: { fontSize: 16, fontWeight: '800', color: colors.white },
});
