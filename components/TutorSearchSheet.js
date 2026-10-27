import { useEffect, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import { colors } from '../constants/theme';
import { subjectNamesMatch } from '../hooks/useTutorFilters';
import { SWIPE_FILTERS } from '../lib/tutorConstants';

const recentSearches = [];

function rememberSearch(entry) {
  const subject = entry.subject || null;
  const place = entry.place || null;
  if (!subject && !place) return;
  const key = `${subject || ''}::${place?.label || ''}`;
  const next = [
    { key, subject, place },
    ...recentSearches.filter((item) => item.key !== key),
  ].slice(0, 6);
  recentSearches.splice(0, recentSearches.length, ...next);
}

function foldText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function resolveSubject(draft, names) {
  const query = String(draft || '').trim();
  if (!query) return null;
  const exact = names.find((name) => foldText(name) === foldText(query));
  if (exact) return exact;
  const matched = names.filter((name) => subjectNamesMatch(name, query));
  if (matched.length === 1) return matched[0];
  return query;
}

function placeName(label) {
  return String(label || '').replace(/\s+\d{4}\b/, '').trim();
}

function searchTitle(subject, placeLabel) {
  const place = placeName(placeLabel);
  if (subject && place) return `${subject} à ${place}`;
  return subject || place || '';
}

function popularSubjects(tutors) {
  const counts = new Map();
  for (const tutor of tutors || []) {
    for (const skill of tutor.specialties || []) {
      const name = String(skill || '').trim();
      if (!name) continue;
      counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  const ranked = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'fr'))
    .map(([name]) => name);
  return ranked.length ? ranked : SWIPE_FILTERS;
}

export default function TutorSearchSheet({ visible, onClose, filters, tutors }) {
  const [subjectDraft, setSubjectDraft] = useState('');
  const [placeFocused, setPlaceFocused] = useState(false);
  const [recent, setRecent] = useState(recentSearches);

  useEffect(() => {
    if (!visible) return;
    setSubjectDraft(filters.activeFilter || '');
    setPlaceFocused(false);
    setRecent([...recentSearches]);
  }, [visible, filters.activeFilter]);

  const subjects = useMemo(() => {
    const query = subjectDraft.trim();
    const list = popularSubjects(tutors);
    if (!query) return list;
    return list.filter((name) => subjectNamesMatch(name, query));
  }, [subjectDraft, tutors]);

  function commitSubject(draft = subjectDraft) {
    const subject = resolveSubject(draft, popularSubjects(tutors));
    setSubjectDraft(subject || '');
    if ((subject || null) !== (filters.activeFilter || null)) {
      filters.setSubjectFilter(subject);
    }
    return subject;
  }

  function close() {
    const subject = commitSubject();
    const place = filters.searchOrigin;
    if (subject || place) {
      rememberSearch({ subject, place });
    }
    onClose();
  }

  function pickSubject(name) {
    filters.setSubjectFilter(name);
    setSubjectDraft(name);
  }

  function applyRecent(item) {
    filters.setSubjectFilter(item.subject);
    setSubjectDraft(item.subject || '');
    if (item.place) filters.selectSuggestion(item.place);
    else filters.onCityChange('');
    onClose();
  }

  const showPlaces = placeFocused && filters.cityQuery.trim().length >= 2;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={close}
    >
      <View style={styles.root}>
        <StatusBar style="light" />
        <SafeAreaView style={styles.safe} edges={['top']}>
          <KeyboardAvoidingView
            style={styles.safe}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
          <View style={styles.header}>
            <Pressable
              style={styles.close}
              onPress={close}
              accessibilityLabel="Fermer la recherche"
              hitSlop={8}
            >
              <Ionicons name="close" size={26} color={colors.white} />
            </Pressable>
            <Text style={styles.title}>Recherche</Text>
            <View style={styles.close} />
          </View>

          <View style={styles.fields}>
            <View style={styles.fieldRow}>
              <Pressable
                onPress={close}
                accessibilityLabel="Lancer la recherche"
                hitSlop={8}
              >
                <Ionicons name="search" size={18} color="#8E8E93" />
              </Pressable>
              <TextInput
                style={styles.input}
                value={subjectDraft}
                onChangeText={(text) => {
                  setSubjectDraft(text);
                  setPlaceFocused(false);
                  if (!text.trim()) filters.setSubjectFilter(null);
                }}
                onFocus={() => setPlaceFocused(false)}
                placeholder="Matière"
                placeholderTextColor="#8E8E93"
                keyboardAppearance="dark"
                autoCapitalize="sentences"
                autoCorrect={false}
                autoFocus
                returnKeyType="search"
                blurOnSubmit={false}
                clearButtonMode="while-editing"
                onSubmitEditing={close}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.fieldRow}>
              <Ionicons name="location-outline" size={18} color="#8E8E93" />
              <TextInput
                style={styles.input}
                value={filters.cityQuery}
                onChangeText={filters.onCityChange}
                onFocus={() => setPlaceFocused(true)}
                placeholder="Lieu du cours"
                placeholderTextColor="#8E8E93"
                keyboardAppearance="dark"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="search"
                blurOnSubmit={false}
                clearButtonMode="while-editing"
                onSubmitEditing={close}
              />
            </View>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            {showPlaces ? (
              filters.locationSuggestions.length ? (
                filters.locationSuggestions.map((item) => (
                  <Pressable
                    key={item.key}
                    style={styles.row}
                    onPress={() => {
                      filters.selectSuggestion(item);
                      setPlaceFocused(false);
                    }}
                  >
                    <Ionicons name="location-outline" size={18} color="#8E8E93" />
                    <Text style={styles.rowLabel}>{item.label}</Text>
                  </Pressable>
                ))
              ) : (
                <Text style={styles.emptyHint}>Aucune commune ne correspond.</Text>
              )
            ) : (
              <>
                {recent.length ? (
                  <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Recherche récente</Text>
                    {recent.map((item) => (
                      <Pressable
                        key={item.key}
                        style={styles.row}
                        onPress={() => applyRecent(item)}
                      >
                        <Ionicons name="time-outline" size={18} color="#8E8E93" />
                        <Text style={styles.rowLabel}>
                          {searchTitle(item.subject, item.place?.label)}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}

                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Matières les plus enseignées</Text>
                  {subjects.length ? (
                    subjects.map((name) => (
                      <Pressable
                        key={name}
                        style={styles.row}
                        onPress={() => pickSubject(name)}
                      >
                        <Ionicons name="search" size={18} color="#8E8E93" />
                        <Text
                          style={[
                            styles.rowLabel,
                            filters.activeFilter === name && styles.rowLabelOn,
                          ]}
                        >
                          {name}
                        </Text>
                      </Pressable>
                    ))
                  ) : (
                    <Text style={styles.emptyHint}>Aucune matière ne correspond.</Text>
                  )}
                </View>
              </>
            )}
          </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 8,
  },
  close: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: colors.white,
  },
  fields: {
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2A2A',
    overflow: 'hidden',
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    minHeight: 52,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: colors.white,
    paddingVertical: 12,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#2A2A2A',
    marginLeft: 42,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 22,
    paddingBottom: 32,
    gap: 4,
  },
  section: {
    gap: 2,
    marginBottom: 18,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 16,
    color: '#E8E8E8',
  },
  rowLabelOn: {
    color: colors.white,
    fontWeight: '700',
  },
  emptyHint: {
    fontSize: 15,
    color: '#A1A1A6',
    paddingVertical: 8,
  },
});
