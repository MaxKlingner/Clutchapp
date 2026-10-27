import { useRef, useState } from 'react';
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/theme';
import {
  PRICE_STEPS,
  RADIUS_STEPS,
} from '../hooks/useTutorFilters';
import {
  FORMAT_IN_PERSON,
  FORMAT_REMOTE,
  STUDENT_LEVEL_GROUPS,
} from '../lib/tutorConstants';
import { StepSlider } from './StepSlider';

const FORMAT_CHOICES = [
  { value: FORMAT_IN_PERSON, label: 'Face à face' },
  { value: FORMAT_REMOTE, label: 'À distance' },
];

const SHEETS = {
  format: 'Format du cours',
  price: 'Tarif',
  level: 'Niveau',
  distance: 'Distance',
};

function stepIndex(steps, value) {
  const index = steps.findIndex((step) => Object.is(step, value));
  return index >= 0 ? index : steps.length - 1;
}

function levelChipLabel(groupIds) {
  const selected = STUDENT_LEVEL_GROUPS.filter((group) => (groupIds || []).includes(group.id));
  if (selected.length === 1) return selected[0].label;
  if (selected.length > 1) return `Niveau · ${selected.length}`;
  return 'Niveau';
}

function formatChipLabel(filters) {
  const selected = FORMAT_CHOICES.filter((choice) =>
    filters.formatFilters.includes(choice.value)
  );
  if (selected.length === 1) return selected[0].label;
  if (selected.length > 1) return `Format · ${selected.length}`;
  return 'Format';
}

export default function TutorRefineBar({ filters }) {
  const [sheet, setSheet] = useState(null);
  const [formatDraft, setFormatDraft] = useState([]);
  const [priceDraft, setPriceDraft] = useState(null);
  const [levelDraft, setLevelDraft] = useState([]);
  const [distanceDraft, setDistanceDraft] = useState(null);
  const dragY = useRef(new Animated.Value(0)).current;
  const closeRef = useRef(() => {});

  function open(key) {
    dragY.setValue(0);
    if (key === 'format') setFormatDraft([...filters.formatFilters]);
    if (key === 'price') setPriceDraft(filters.maxHourlyRate);
    if (key === 'level') setLevelDraft([...(filters.studentLevelGroups || [])]);
    if (key === 'distance') setDistanceDraft(filters.radiusKm);
    setSheet(key);
  }

  function close() {
    dragY.setValue(0);
    setSheet(null);
  }

  closeRef.current = close;

  const sheetPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        gesture.dy > 8 && gesture.dy > Math.abs(gesture.dx),
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        gesture.dy > 16 && gesture.dy > Math.abs(gesture.dx),
      onPanResponderMove: (_, gesture) => {
        dragY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dy > 72 || gesture.vy > 0.8) {
          Animated.timing(dragY, {
            toValue: 520,
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            dragY.setValue(0);
            closeRef.current();
          });
          return;
        }
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          speed: 20,
          bounciness: 0,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragY, {
          toValue: 0,
          useNativeDriver: true,
          speed: 20,
          bounciness: 0,
        }).start();
      },
    })
  ).current;

  function save() {
    if (sheet === 'format') filters.replaceFormatFilters(formatDraft);
    if (sheet === 'price') filters.onSelectMaxPrice(priceDraft);
    if (sheet === 'level') filters.setLevelFilters(levelDraft);
    if (sheet === 'distance') filters.onSelectRadius(distanceDraft);
    close();
  }

  function clearSheet() {
    if (sheet === 'format') filters.replaceFormatFilters([]);
    if (sheet === 'price') filters.onSelectMaxPrice(null);
    if (sheet === 'level') filters.setLevelFilters([]);
    if (sheet === 'distance') filters.onSelectRadius(null);
    close();
  }

  function toggleLevel(id) {
    setLevelDraft((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function toggleFormat(value) {
    setFormatDraft((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  const chips = [
    {
      key: 'format',
      label: formatChipLabel(filters),
      active: filters.formatFilters.length > 0,
    },
    {
      key: 'price',
      label: filters.maxHourlyRate != null ? `${filters.maxHourlyRate} €/h` : 'Tarif',
      active: filters.maxHourlyRate != null,
    },
    {
      key: 'level',
      label: levelChipLabel(filters.studentLevelGroups),
      active: (filters.studentLevelGroups || []).length > 0,
    },
    {
      key: 'distance',
      label: filters.radiusKm != null ? `${filters.radiusKm} km` : 'Distance',
      active: filters.radiusKm != null,
    },
  ];

  return (
    <>
      <View style={styles.chips}>
        {chips.map((chip) => (
          <Pressable
            key={chip.key}
            style={[styles.chip, chip.active && styles.chipOn]}
            onPress={() => open(chip.key)}
          >
            <Text
              style={[styles.chipLabel, chip.active && styles.chipLabelOn]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {chip.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Modal
        visible={sheet != null}
        transparent
        animationType="slide"
        onRequestClose={close}
      >
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={close} />
          <Animated.View
            style={[styles.sheet, { transform: [{ translateY: dragY }] }]}
            {...sheetPan.panHandlers}
          >
          <SafeAreaView edges={['bottom']}>
            <View style={styles.handle} />
            <Text style={styles.sheetTitle}>{SHEETS[sheet] || ''}</Text>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {sheet === 'format' ? (
                FORMAT_CHOICES.map((choice) => (
                  <ChoiceRow
                    key={choice.value}
                    label={choice.label}
                    active={formatDraft.includes(choice.value)}
                    onPress={() => toggleFormat(choice.value)}
                  />
                ))
              ) : null}

              {sheet === 'price' ? (
                <>
                  <Text style={styles.hint}>
                    Déplace le curseur pour choisir le tarif horaire maximum.
                  </Text>
                  <View style={styles.valuePill}>
                    <Text style={styles.valuePillText}>
                      {priceDraft == null ? 'Tout' : `${priceDraft} €/h`}
                    </Text>
                  </View>
                  <StepSlider
                    steps={PRICE_STEPS}
                    indexes={[stepIndex(PRICE_STEPS, priceDraft)]}
                    onChangeIndexes={([index]) => setPriceDraft(PRICE_STEPS[index])}
                    caption={null}
                    minLabel="15 €"
                    maxLabel="Tout"
                    accent="#FFFFFF"
                    trackColor="#3A3A3C"
                    thumbBorder="#111111"
                    labelColor="#A1A1A6"
                  />
                </>
              ) : null}

              {sheet === 'level' ? (
                <>
                  <Text style={styles.hint}>
                    Choisis le niveau de l’élève.
                  </Text>
                  {STUDENT_LEVEL_GROUPS.map((group) => (
                    <ChoiceRow
                      key={group.id}
                      label={group.label}
                      active={levelDraft.includes(group.id)}
                      onPress={() => toggleLevel(group.id)}
                    />
                  ))}
                </>
              ) : null}

              {sheet === 'distance' ? (
                <>
                  <Text style={styles.hint}>
                    Déplace le curseur pour limiter la distance.
                  </Text>
                  <View style={styles.valuePill}>
                    <Text style={styles.valuePillText}>
                      {distanceDraft == null ? 'Illimité' : `${distanceDraft} km`}
                    </Text>
                  </View>
                  <StepSlider
                    steps={RADIUS_STEPS}
                    indexes={[stepIndex(RADIUS_STEPS, distanceDraft)]}
                    onChangeIndexes={([index]) => setDistanceDraft(RADIUS_STEPS[index])}
                    caption={null}
                    minLabel="5 km"
                    maxLabel="Illimité"
                    accent="#FFFFFF"
                    trackColor="#3A3A3C"
                    thumbBorder="#111111"
                    labelColor="#A1A1A6"
                  />
                </>
              ) : null}

            </ScrollView>

            <Pressable style={styles.save} onPress={save}>
              <Text style={styles.saveLabel}>Enregistrer</Text>
            </Pressable>
            <Pressable style={styles.clear} onPress={clearSheet}>
              <Text style={styles.clearLabel}>Effacer</Text>
            </Pressable>
          </SafeAreaView>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

function ChoiceRow({ label, active, onPress }) {
  return (
    <Pressable style={styles.choice} onPress={onPress}>
      <Text style={styles.choiceLabel}>{label}</Text>
      <View style={[styles.box, active && styles.boxOn]}>
        {active ? <Ionicons name="checkmark" size={16} color="#111111" /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 36,
    marginBottom: 12,
  },
  chip: {
    flex: 1,
    minWidth: 0,
    height: 36,
    paddingHorizontal: 6,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  chipOn: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E8E8E8',
  },
  chipLabelOn: {
    color: '#111111',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: '#1C1C1E',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 8,
    maxHeight: '78%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#3A3A3C',
    marginBottom: 12,
  },
  sheetTitle: {
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    color: colors.white,
    marginBottom: 16,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingBottom: 8,
  },
  hint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#A1A1A6',
    marginBottom: 16,
  },
  valuePill: {
    alignSelf: 'center',
    minWidth: 108,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: '#3A3A3C',
    alignItems: 'center',
    marginBottom: 8,
  },
  valuePillText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  choiceLabel: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#E8E8E8',
    marginRight: 12,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#8E8E93',
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {
    backgroundColor: colors.white,
    borderColor: colors.white,
  },
  save: {
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveLabel: {
    fontSize: 16,
    fontWeight: '800',
    color: '#111111',
  },
  clear: {
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  clearLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.white,
  },
});
