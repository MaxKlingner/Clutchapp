import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

import { colors, shadows } from '../constants/theme';

const SLIDER_THUMB = 26;

export function StepSlider({ steps, indexes, onChangeIndexes, caption, minLabel, maxLabel }) {
  const [trackW, setTrackW] = useState(0);
  const live = useRef({ steps, indexes, onChangeIndexes, trackW });
  live.current = { steps, indexes, onChangeIndexes, trackW };
  const activeThumb = useRef(0);
  const dragOrigin = useRef(0);

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onShouldBlockNativeResponder: () => true,
      onPanResponderGrant: (event) => {
        const { indexes: current } = live.current;
        const localX = event.nativeEvent.locationX;
        dragOrigin.current = localX;
        const index = indexFromLocal(localX);
        if (current.length > 1) {
          const low = current[0];
          const high = current[1];
          if (low === high) activeThumb.current = index >= high ? 1 : 0;
          else {
            activeThumb.current =
              Math.abs(index - low) <= Math.abs(index - high) ? 0 : 1;
          }
        } else {
          activeThumb.current = 0;
        }
        applyIndex(index);
      },
      onPanResponderMove: (_event, gesture) => {
        applyIndex(indexFromLocal(dragOrigin.current + gesture.dx));
      },
    })
  ).current;

  function indexFromLocal(localX) {
    const { steps: currentSteps, trackW: width } = live.current;
    if (width <= 0 || currentSteps.length <= 1) return live.current.indexes[0] ?? 0;
    const travel = Math.max(width - SLIDER_THUMB, 1);
    const ratio = Math.max(0, Math.min(1, (localX - SLIDER_THUMB / 2) / travel));
    return Math.round(ratio * (currentSteps.length - 1));
  }

  function applyIndex(index) {
    const { indexes: current, onChangeIndexes: emit, steps: currentSteps } = live.current;
    const next = Math.max(0, Math.min(currentSteps.length - 1, index));
    if (current.length > 1) {
      let low = current[0];
      let high = current[1];
      if (activeThumb.current === 0) low = Math.min(next, high);
      else high = Math.max(next, low);
      if (low === current[0] && high === current[1]) return;
      emit([low, high]);
      return;
    }
    if (current[0] !== next) emit([next]);
  }

  const maxIndex = Math.max(steps.length - 1, 1);
  const thumbLeft = (index) =>
    (index / maxIndex) * Math.max(trackW - SLIDER_THUMB, 0);
  const lowLeft = thumbLeft(indexes[0] ?? 0);
  const highLeft = thumbLeft(indexes[Math.min(1, indexes.length - 1)] ?? 0);
  const fillLeft = indexes.length > 1 ? lowLeft + SLIDER_THUMB / 2 : 0;
  const fillWidth =
    indexes.length > 1
      ? Math.max(highLeft - lowLeft, 0)
      : lowLeft + SLIDER_THUMB / 2;

  return (
    <View style={styles.filterSlider}>
      <Text style={styles.filterSliderCaption}>{caption}</Text>
      <View
        style={styles.filterSliderHit}
        onLayout={(event) => {
          const width = event.nativeEvent.layout.width;
          setTrackW(width);
          live.current.trackW = width;
        }}
        {...pan.panHandlers}
      >
        <View pointerEvents="none" style={styles.filterSliderTrack} />
        <View
          pointerEvents="none"
          style={[
            styles.filterSliderFill,
            { left: fillLeft, width: Math.max(fillWidth, 0) },
          ]}
        />
        <View
          pointerEvents="none"
          style={[styles.filterSliderThumb, { left: lowLeft }]}
        />
        {indexes.length > 1 ? (
          <View
            pointerEvents="none"
            style={[styles.filterSliderThumb, { left: highLeft }]}
          />
        ) : null}
      </View>
      <View style={styles.filterSliderEnds}>
        <Text style={styles.filterSliderEnd}>{minLabel}</Text>
        <Text style={[styles.filterSliderEnd, styles.filterSliderEndRight]}>
          {maxLabel}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  filterSlider: {
    marginHorizontal: 8,
    marginTop: 4,
    marginBottom: 10,
  },
  filterSliderCaption: {
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: colors.mintDeep,
    marginBottom: 8,
  },
  filterSliderHit: {
    height: 36,
    justifyContent: 'center',
  },
  filterSliderTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2EAE5',
  },
  filterSliderFill: {
    position: 'absolute',
    top: 15,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.mintDeep,
  },
  filterSliderThumb: {
    position: 'absolute',
    top: 5,
    width: SLIDER_THUMB,
    height: SLIDER_THUMB,
    borderRadius: SLIDER_THUMB / 2,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.mintDeep,
    ...shadows.soft,
  },
  filterSliderEnds: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 6,
  },
  filterSliderEnd: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: colors.mutedSoft,
  },
  filterSliderEndRight: {
    textAlign: 'right',
  },
});
