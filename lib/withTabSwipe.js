import { useMemo, useRef } from 'react';
import { PanResponder, View } from 'react-native';
import { useNavigation, useNavigationState } from '@react-navigation/native';

const SWIPE_DX = 56;
const SWIPE_VX = 0.35;

/**
 * Enveloppe un écran d’onglet pour permettre de swiper
 * vers l’onglet précédent / suivant (sans react-native-pager-view).
 */
export function withTabSwipe(ScreenComponent) {
  function SwipeableTabScreen(props) {
    const navigation = useNavigation();
    const index = useNavigationState((state) => state?.index ?? 0);
    const routeNames = useNavigationState(
      (state) => state?.routeNames ?? state?.routes?.map((r) => r.name) ?? []
    );

    const indexRef = useRef(index);
    const namesRef = useRef(routeNames);
    indexRef.current = index;
    namesRef.current = routeNames;

    const panResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onMoveShouldSetPanResponder: (_evt, gesture) => {
            const { dx, dy } = gesture;
            return Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.6;
          },
          onPanResponderTerminationRequest: () => false,
          onPanResponderRelease: (_evt, gesture) => {
            const { dx, vx } = gesture;
            const names = namesRef.current;
            const current = indexRef.current;
            if (!names.length) return;

            const goNext = dx < -SWIPE_DX || vx < -SWIPE_VX;
            const goPrev = dx > SWIPE_DX || vx > SWIPE_VX;

            if (goNext && current < names.length - 1) {
              navigation.navigate(names[current + 1]);
            } else if (goPrev && current > 0) {
              navigation.navigate(names[current - 1]);
            }
          },
        }),
      [navigation]
    );

    return (
      <View style={{ flex: 1 }} {...panResponder.panHandlers}>
        <ScreenComponent {...props} />
      </View>
    );
  }

  SwipeableTabScreen.displayName = `WithTabSwipe(${
    ScreenComponent.displayName || ScreenComponent.name || 'Screen'
  })`;

  return SwipeableTabScreen;
}
