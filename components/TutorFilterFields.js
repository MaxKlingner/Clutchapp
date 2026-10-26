import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { colors } from '../constants/theme';
import {
  PRICE_STEPS,
  RADIUS_STEPS,
  STUDENT_STEPS,
} from '../hooks/useTutorFilters';
import {
  STUDY_YEARS,
  SWIPE_FILTERS,
  TEACHING_FORMATS,
} from '../lib/tutorConstants';
import { StepSlider } from './StepSlider';

function FilterSection({
  title,
  summary,
  summaryActive,
  open,
  onToggle,
  locked,
  children,
}) {
  const head = (
    <View style={styles.filterSectionHead}>
      <View style={styles.filterSectionCopy}>
        <Text style={styles.filterSectionTitle}>{title}</Text>
        {open ? null : (
          <Text
            style={[
              styles.filterSectionSummary,
              summaryActive && styles.filterSectionSummaryActive,
            ]}
            numberOfLines={1}
          >
            {summary}
          </Text>
        )}
      </View>
      {locked ? null : (
        <Ionicons
          name={open ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.muted}
        />
      )}
    </View>
  );

  return (
    <View style={styles.filterSection}>
      {locked ? (
        head
      ) : (
        <Pressable
          style={styles.filterSectionHead}
          onPress={onToggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
        >
          <View style={styles.filterSectionCopy}>
            <Text style={styles.filterSectionTitle}>{title}</Text>
            {open ? null : (
              <Text
                style={[
                  styles.filterSectionSummary,
                  summaryActive && styles.filterSectionSummaryActive,
                ]}
                numberOfLines={1}
              >
                {summary}
              </Text>
            )}
          </View>
          <Ionicons
            name={open ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={colors.muted}
          />
        </Pressable>
      )}
      {open ? <View style={styles.filterSectionBody}>{children}</View> : null}
    </View>
  );
}

function FilterChoice({ label, active, onPress }) {
  return (
    <Pressable style={styles.filterChoice} onPress={onPress}>
      <Text
        style={[
          styles.filterChoiceLabel,
          active && styles.filterChoiceLabelActive,
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <Ionicons
        name={active ? 'checkmark-circle' : 'ellipse-outline'}
        size={22}
        color={active ? colors.mintDeep : '#C5D1CB'}
      />
    </Pressable>
  );
}

export default function TutorFilterFields({ filters, forceOpen = false }) {
  const sectionOpen = (key) => forceOpen || filters.expandedFilter === key;
  const toggle = (key) => {
    if (forceOpen) return;
    filters.toggleFilterSection(key);
  };

  return (
    <View>
      <FilterSection
        title="Lieu"
        summary={filters.lieuSummary}
        summaryActive={Boolean(filters.cityQuery.trim()) || filters.radiusKm != null}
        open={sectionOpen('lieu')}
        locked={forceOpen}
        onToggle={() => toggle('lieu')}
      >
        <Text style={styles.filterHint}>Adresse</Text>
        <TextInput
          style={styles.drawerInput}
          value={filters.cityQuery}
          onChangeText={filters.onCityChange}
          placeholder="Ville, rue ou code postal"
          placeholderTextColor={colors.mutedSoft}
          autoCapitalize="words"
          autoCorrect={false}
        />
        {filters.locationSuggestions.length > 0 ? (
          <View style={styles.suggestList}>
            {filters.locationSuggestions.map((item) => (
              <Pressable
                key={item.key}
                style={styles.suggestRow}
                onPress={() => filters.selectSuggestion(item)}
              >
                <Ionicons name="location-outline" size={16} color={colors.muted} />
                <Text style={styles.suggestLabel}>{item.label}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {filters.searchOrigin ? (
          <Text style={styles.originHint}>
            Autour de {filters.searchOrigin.label}
            {filters.radiusKm != null ? ` · ${filters.radiusKm} km` : ' · Illimité'}
          </Text>
        ) : null}
        <Text style={styles.filterHint}>Rayon</Text>
        <StepSlider
          steps={RADIUS_STEPS}
          indexes={[filters.radiusIndex]}
          onChangeIndexes={([index]) => filters.onSelectRadius(RADIUS_STEPS[index])}
          caption={
            RADIUS_STEPS[filters.radiusIndex] == null
              ? 'Illimité'
              : `${RADIUS_STEPS[filters.radiusIndex]} km`
          }
          minLabel="5 km"
          maxLabel="Illimité"
        />
      </FilterSection>

      <FilterSection
        title="Matière"
        summary={filters.subjectSummary}
        summaryActive={Boolean(filters.activeFilter)}
        open={sectionOpen('matiere')}
        locked={forceOpen}
        onToggle={() => toggle('matiere')}
      >
        <FilterChoice
          label="Toutes"
          active={!filters.activeFilter}
          onPress={() => filters.onSelectFilter(null)}
        />
        {SWIPE_FILTERS.map((label) => (
          <FilterChoice
            key={label}
            label={label}
            active={filters.activeFilter === label}
            onPress={() => filters.onSelectFilter(label)}
          />
        ))}
      </FilterSection>

      <FilterSection
        title="Type de cours"
        summary={filters.formatSummary}
        summaryActive={filters.formatFilters.length > 0}
        open={sectionOpen('type')}
        locked={forceOpen}
        onToggle={() => toggle('type')}
      >
        <FilterChoice
          label="Tous"
          active={filters.formatFilters.length === 0}
          onPress={filters.clearFormats}
        />
        {TEACHING_FORMATS.map((format) => (
          <FilterChoice
            key={format}
            label={format}
            active={filters.formatFilters.includes(format)}
            onPress={() => filters.onToggleFormatFilter(format)}
          />
        ))}
      </FilterSection>

      <FilterSection
        title="Prix maximum"
        summary={filters.priceSummary}
        summaryActive={filters.priceSummary !== 'Tout'}
        open={sectionOpen('prix')}
        locked={forceOpen}
        onToggle={() => toggle('prix')}
      >
        <StepSlider
          steps={PRICE_STEPS}
          indexes={[filters.priceIndex]}
          onChangeIndexes={([index]) => filters.onSelectMaxPrice(PRICE_STEPS[index])}
          caption={
            PRICE_STEPS[filters.priceIndex] == null
              ? 'Tout'
              : `${PRICE_STEPS[filters.priceIndex]} € max`
          }
          minLabel="15 €"
          maxLabel="Tout"
        />
      </FilterSection>

      <FilterSection
        title="Niveau de l’élève"
        summary={filters.studentSummary}
        summaryActive={Boolean(filters.studentSummary) && filters.studentSummary !== 'Tous'}
        open={sectionOpen('eleve')}
        locked={forceOpen}
        onToggle={() => toggle('eleve')}
      >
        <StepSlider
          steps={STUDENT_STEPS}
          indexes={[filters.studentIndex]}
          onChangeIndexes={([index]) =>
            filters.onSelectStudentLevel(STUDENT_STEPS[index])
          }
          caption={STUDENT_STEPS[filters.studentIndex] || 'Tous'}
          minLabel="Tous"
          maxLabel="Supérieur"
        />
      </FilterSection>

      <FilterSection
        title="Niveau du prof"
        summary={filters.tutorYearSummary}
        summaryActive={filters.tutorYearSummary !== 'Tous'}
        open={sectionOpen('prof')}
        locked={forceOpen}
        onToggle={() => toggle('prof')}
      >
        <StepSlider
          steps={STUDY_YEARS}
          indexes={[filters.tutorLow, filters.tutorHigh]}
          onChangeIndexes={([low, high]) => filters.onSelectTutorSpan(low, high)}
          caption={filters.tutorYearSummary}
          minLabel={STUDY_YEARS[0]}
          maxLabel={STUDY_YEARS[STUDY_YEARS.length - 1]}
        />
      </FilterSection>
    </View>
  );
}

const styles = StyleSheet.create({
  filterSection: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  filterSectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  filterSectionCopy: {
    flex: 1,
    gap: 3,
  },
  filterSectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.ink,
  },
  filterSectionSummary: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.mutedSoft,
  },
  filterSectionSummaryActive: {
    color: colors.mintDeep,
  },
  filterSectionBody: {
    paddingHorizontal: 10,
    paddingBottom: 8,
  },
  filterHint: {
    marginTop: 2,
    marginBottom: 6,
    marginHorizontal: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.muted,
  },
  filterChoice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 11,
    borderRadius: 12,
  },
  filterChoiceLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  filterChoiceLabelActive: {
    fontWeight: '700',
    color: colors.mintDeep,
  },
  drawerInput: {
    marginHorizontal: 8,
    marginBottom: 8,
    backgroundColor: colors.page,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  suggestList: {
    marginHorizontal: 8,
    marginTop: -2,
    marginBottom: 8,
    borderRadius: 12,
    backgroundColor: colors.page,
    overflow: 'hidden',
  },
  suggestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  suggestLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: colors.ink,
  },
  originHint: {
    marginHorizontal: 8,
    marginBottom: 8,
    fontSize: 13,
    fontWeight: '700',
    color: colors.mintDeep,
  },
});
