import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth, useUser } from '@clerk/clerk-expo';

import {
  HOURLY_RATES,
  SPECIALTIES,
  STUDY_YEARS,
} from '../lib/tutorConstants';
import {
  ensureTutorProfile,
  updateTutorProfile,
} from '../lib/supabase';

export default function TutorProfileEditor() {
  const { userId } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [fullName, setFullName] = useState('');
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState([]);
  const [hourlyRate, setHourlyRate] = useState(25);
  const [studyYear, setStudyYear] = useState('Master 1');

  async function loadProfile() {
    if (!userId) return;

    setLoading(true);
    setError('');
    try {
      const defaultName =
        user?.fullName ||
        [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
        'Nouveau tuteur';

      const profile = await ensureTutorProfile({
        clerkId: userId,
        fullName: defaultName,
      });

      setFullName(profile.name || defaultName);
      setBio(profile.bio || '');
      setSpecialties(profile.specialties?.length ? profile.specialties : []);
      setHourlyRate(profile.hourlyRate || 25);
      setStudyYear(profile.studyYear || 'Master 1');
    } catch (err) {
      setError(err?.message ?? 'Impossible de charger le profil.');
    } finally {
      setLoading(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      loadProfile();
    }, [userId])
  );

  function toggleSpecialty(label) {
    setSpecialties((prev) =>
      prev.includes(label)
        ? prev.filter((item) => item !== label)
        : [...prev, label]
    );
  }

  async function onSave() {
    if (!userId || saving) return;

    if (!fullName.trim()) {
      Alert.alert('Nom requis', 'Indique ton nom affiché aux parents.');
      return;
    }
    if (!specialties.length) {
      Alert.alert(
        'Spécialités',
        'Choisis au moins une matière pour apparaître dans le swipe.'
      );
      return;
    }

    setSaving(true);
    setError('');
    try {
      await updateTutorProfile(userId, {
        fullName,
        bio,
        specialties,
        hourlyRate,
        studyYear,
      });
      Alert.alert(
        'Profil sauvegardé',
        'Tes infos sont visibles dans le swipe des parents.'
      );
    } catch (err) {
      setError(err?.message ?? 'Sauvegarde impossible.');
      Alert.alert('Erreur', err?.message ?? 'Sauvegarde impossible.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingBox}>
        <ActivityIndicator size="large" color="#4338CA" />
        <Text style={styles.loadingText}>Chargement du profil…</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>Profil tuteur</Text>
      <Text style={styles.hint}>
        Ces infos apparaissent dans le flux Swipe des parents.
      </Text>

      <Text style={styles.label}>Nom affiché</Text>
      <TextInput
        style={styles.input}
        value={fullName}
        onChangeText={setFullName}
        placeholder="Ton prénom et nom"
        placeholderTextColor="#7A9185"
        editable={!saving}
      />

      <Text style={styles.label}>Spécialités</Text>
      <View style={styles.chipWrap}>
        {SPECIALTIES.map((item) => {
          const active = specialties.includes(item);
          return (
            <Pressable
              key={item}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => toggleSpecialty(item)}
              disabled={saving}
            >
              <Text
                style={[styles.chipLabel, active && styles.chipLabelActive]}
              >
                {item}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Biographie</Text>
      <TextInput
        style={[styles.input, styles.bioInput]}
        value={bio}
        onChangeText={setBio}
        placeholder="Présente-toi en quelques phrases…"
        placeholderTextColor="#7A9185"
        multiline
        textAlignVertical="top"
        editable={!saving}
      />

      <Text style={styles.label}>Tarif horaire (€/h)</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rateRow}
      >
        {HOURLY_RATES.map((rate) => {
          const active = hourlyRate === rate;
          return (
            <Pressable
              key={rate}
              style={[styles.rateChip, active && styles.rateChipActive]}
              onPress={() => setHourlyRate(rate)}
              disabled={saving}
            >
              <Text
                style={[
                  styles.rateChipLabel,
                  active && styles.rateChipLabelActive,
                ]}
              >
                {rate} €
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.label}>Année d’étude</Text>
      <View style={styles.chipWrap}>
        {STUDY_YEARS.map((year) => {
          const active = studyYear === year;
          return (
            <Pressable
              key={year}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => setStudyYear(year)}
              disabled={saving}
            >
              <Text
                style={[styles.chipLabel, active && styles.chipLabelActive]}
              >
                {year}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.saveButton, saving && styles.disabled]}
        onPress={onSave}
        disabled={saving}
      >
        {saving ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <Text style={styles.saveLabel}>Sauvegarder le profil</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  loadingBox: {
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    padding: 24,
    borderWidth: 2,
    borderColor: '#4338CA',
    marginBottom: 24,
    alignItems: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#3730A3',
    fontSize: 14,
  },
  card: {
    backgroundColor: '#EEF2FF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#4338CA',
    marginBottom: 24,
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    color: '#4338CA',
    textTransform: 'uppercase',
  },
  hint: {
    marginTop: 8,
    marginBottom: 14,
    fontSize: 14,
    lineHeight: 20,
    color: '#3730A3',
  },
  label: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '700',
    color: '#1E1B4B',
  },
  input: {
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#10261C',
  },
  bioInput: {
    minHeight: 100,
    paddingTop: 12,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: '#4338CA',
    borderColor: '#4338CA',
  },
  chipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4338CA',
  },
  chipLabelActive: {
    color: '#FFFFFF',
  },
  rateRow: {
    gap: 8,
    paddingBottom: 4,
  },
  rateChip: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  rateChipActive: {
    backgroundColor: '#4338CA',
    borderColor: '#4338CA',
  },
  rateChipLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#4338CA',
  },
  rateChipLabelActive: {
    color: '#FFFFFF',
  },
  error: {
    marginTop: 12,
    color: '#C0392B',
    fontSize: 14,
  },
  saveButton: {
    marginTop: 18,
    backgroundColor: '#4338CA',
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabled: {
    opacity: 0.7,
  },
  saveLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
});
