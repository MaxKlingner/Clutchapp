import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Linking,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { useAuth } from '@clerk/clerk-expo';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { requireOptionalNativeModule } from 'expo-modules-core';

import { openTutorProfile } from '../components/TutorProfileDetail';
import TutorRefineBar from '../components/TutorRefineBar';
import TutorSearchSheet from '../components/TutorSearchSheet';
import { useParentSearch } from '../lib/ParentSearchContext';
import { colors } from '../constants/theme';
import { resolveLocationQuery } from '../lib/geo';
import { fetchTutorProfiles } from '../lib/supabase';

const TILE = 256;
const MIN_ZOOM = 6;
const MAX_ZOOM = 16;
const BELGIUM = { latitude: 50.5, longitude: 4.55 };
const USER_ZOOM = 13;
const PANEL_OFFSET = 60;

let Location = null;
if (requireOptionalNativeModule('ExpoLocation')) {
  try {
    Location = require('expo-location');
  } catch {
    Location = null;
  }
}

function project(latitude, longitude, zoom) {
  const size = TILE * 2 ** zoom;
  const x = ((longitude + 180) / 360) * size;
  const sine = Math.sin((latitude * Math.PI) / 180);
  const y =
    (0.5 - Math.log((1 + sine) / (1 - sine)) / (4 * Math.PI)) * size;
  return { x, y };
}

function unproject(x, y, zoom) {
  const size = TILE * 2 ** zoom;
  const longitude = (x / size) * 360 - 180;
  const mercator = Math.PI * (1 - (2 * y) / size);
  const latitude = (180 / Math.PI) * Math.atan(Math.sinh(mercator));
  return {
    latitude: Math.max(-85, Math.min(85, latitude)),
    longitude,
  };
}

const TILE_HEADERS = { 'User-Agent': 'ClutchApp/1.0 (support@clutch.education)' };
function tileUrl(zoom, x, y) {
  const n = 2 ** zoom;
  const wrapped = ((x % n) + n) % n;
  return `https://tile.openstreetmap.org/${zoom}/${wrapped}/${y}.png`;
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

function placedTutor(tutor) {
  const latitude = Number(tutor?.latitude);
  const longitude = Number(tutor?.longitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
    return { ...tutor, latitude, longitude };
  }
  const resolved = resolveLocationQuery(
    [tutor?.postalCode, tutor?.city].filter(Boolean).join(' ')
  );
  if (!resolved) return null;
  return {
    ...tutor,
    latitude: resolved.latitude,
    longitude: resolved.longitude,
  };
}

function groupTutors(tutors) {
  const groups = new Map();
  tutors.forEach((tutor) => {
    const key = `${tutor.latitude.toFixed(3)}:${tutor.longitude.toFixed(3)}`;
    const current = groups.get(key);
    if (current) current.push(tutor);
    else groups.set(key, [tutor]);
  });
  return [...groups.values()];
}

function viewFor(tutors, width, height) {
  if (!tutors.length || width < 1 || height < 1) {
    return { center: BELGIUM, zoom: 8 };
  }
  const latitudes = tutors.map((tutor) => tutor.latitude);
  const longitudes = tutors.map((tutor) => tutor.longitude);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);
  const center = {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
  };
  const latSpan = Math.max(maxLat - minLat, 0.12);
  const lngSpan = Math.max(maxLng - minLng, 0.12);
  const padded = {
    north: center.latitude + latSpan / 2 + 0.04,
    south: center.latitude - latSpan / 2 - 0.04,
    west: center.longitude - lngSpan / 2 - 0.04,
    east: center.longitude + lngSpan / 2 + 0.04,
  };
  let zoom = MAX_ZOOM;
  while (zoom > MIN_ZOOM) {
    const northWest = project(padded.north, padded.west, zoom);
    const southEast = project(padded.south, padded.east, zoom);
    if (southEast.x - northWest.x <= width - 48 && southEast.y - northWest.y <= height - 280) {
      break;
    }
    zoom -= 1;
  }
  const middle = project(center.latitude, center.longitude, zoom);
  return { center: unproject(middle.x, middle.y - PANEL_OFFSET, zoom), zoom };
}

export default function TutorMapScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { userId } = useAuth();
  const [allTutors, setAllTutors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [camera, setCamera] = useState({ center: BELGIUM, zoom: 8 });
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [group, setGroup] = useState(null);
  const cameraRef = useRef(camera);
  const sizeRef = useRef(size);
  const frameRef = useRef(null);
  const animRef = useRef(null);
  const fitted = useRef(false);
  const lastPlacedKey = useRef(null);
  const { filters } = useParentSearch();
  const [searchOpen, setSearchOpen] = useState(false);
  const gestureRef = useRef(null);
  const [userPos, setUserPos] = useState(null);
  const userPosRef = useRef(null);
  const watchRef = useRef(null);
  const mounted = useRef(false);
  const pulse = useRef(new Animated.Value(0)).current;
  const { center, zoom } = camera;

  sizeRef.current = size;

  function moveCamera(next) {
    cameraRef.current = next;
    if (frameRef.current != null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setCamera(cameraRef.current);
    });
  }

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current);
      if (animRef.current != null) cancelAnimationFrame(animRef.current);
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchTutorProfiles({ excludeClerkId: userId })
      .then((profiles) => {
        if (!cancelled) setAllTutors(profiles);
      })
      .catch((err) => {
        if (!cancelled) {
          setAllTutors([]);
          setError(err?.message || 'Impossible de charger les profils.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const placed = useMemo(() => {
    return allTutors.filter(filters.matchesTutor).map(placedTutor).filter(Boolean);
  }, [allTutors, filters.matchesTutor]);

  const groups = useMemo(() => groupTutors(placed), [placed]);
  const placedKey = placed.map((tutor) => tutor.id).join(',');

  useEffect(() => {
    if (fitted.current || loading || !size.width || !placed.length) return;
    fitted.current = true;
    const next = viewFor(placed, size.width, size.height);
    cameraRef.current = next;
    setCamera(next);
  }, [loading, placed, size]);

  useEffect(() => {
    if (!fitted.current || loading || !size.width) return;
    if (lastPlacedKey.current === null) {
      lastPlacedKey.current = placedKey;
      return;
    }
    if (lastPlacedKey.current === placedKey) return;
    lastPlacedKey.current = placedKey;
    if (!placed.length) return;
    const next = viewFor(placed, size.width, size.height);
    flyTo(next.center, next.zoom);
  }, [placedKey, loading, size]);

  const placeName = String(filters.searchOrigin?.label || filters.cityQuery || '')
    .replace(/\s+\d{4}\b/, '')
    .trim();
  const searchLabel =
    filters.activeFilter && placeName
      ? `${filters.activeFilter} à ${placeName}`
      : filters.activeFilter || placeName || '';

  function stopAnimation() {
    if (animRef.current != null) {
      cancelAnimationFrame(animRef.current);
      animRef.current = null;
    }
  }

  function onTouchMove(event) {
    const touches = event.nativeEvent.touches;
    if (!touches.length) return;
    const { width, height } = sizeRef.current;
    const state = gestureRef.current;

    if (touches.length >= 2) {
      const dist = Math.max(touchDistance(touches), 1);
      const midX = (touches[0].pageX + touches[1].pageX) / 2;
      const midY = (touches[0].pageY + touches[1].pageY) / 2;
      if (!state || state.mode !== 'pinch') {
        gestureRef.current = {
          mode: 'pinch',
          camera: cameraRef.current,
          dist,
          midX,
          midY,
        };
        return;
      }
      const start = state.camera;
      const nextZoom = clampZoom(start.zoom + Math.log2(dist / state.dist));
      const origin = project(start.center.latitude, start.center.longitude, start.zoom);
      const anchorX = origin.x + (state.midX - width / 2);
      const anchorY = origin.y + (state.midY - height / 2);
      const k = 2 ** (nextZoom - start.zoom);
      moveCamera({
        zoom: nextZoom,
        center: unproject(
          anchorX * k - (midX - width / 2),
          anchorY * k - (midY - height / 2),
          nextZoom
        ),
      });
      return;
    }

    const touch = touches[0];
    if (!state || state.mode !== 'pan') {
      gestureRef.current = {
        mode: 'pan',
        camera: cameraRef.current,
        x: touch.pageX,
        y: touch.pageY,
      };
      return;
    }
    const start = state.camera;
    const origin = project(start.center.latitude, start.center.longitude, start.zoom);
    moveCamera({
      zoom: start.zoom,
      center: unproject(
        origin.x - (touch.pageX - state.x),
        origin.y - (touch.pageY - state.y),
        start.zoom
      ),
    });
  }

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (event, gesture) =>
        event.nativeEvent.touches.length >= 2 ||
        Math.abs(gesture.dx) > 4 ||
        Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        stopAnimation();
        gestureRef.current = null;
      },
      onPanResponderMove: (event) => onTouchMove(event),
      onPanResponderRelease: () => {
        gestureRef.current = null;
      },
      onPanResponderTerminate: () => {
        gestureRef.current = null;
      },
    })
  ).current;

  function flyTo(target, targetZoom) {
    stopAnimation();
    const from = cameraRef.current;
    const started = Date.now();
    const duration = 650;
    const step = () => {
      const t = Math.min(1, (Date.now() - started) / duration);
      const eased = t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
      moveCamera({
        zoom: from.zoom + (targetZoom - from.zoom) * eased,
        center: {
          latitude: from.center.latitude + (target.latitude - from.center.latitude) * eased,
          longitude: from.center.longitude + (target.longitude - from.center.longitude) * eased,
        },
      });
      animRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    animRef.current = requestAnimationFrame(step);
  }

  function placeUser(coords, recenter) {
    const next = { latitude: coords.latitude, longitude: coords.longitude };
    userPosRef.current = next;
    setUserPos(next);
    if (recenter) {
      fitted.current = true;
      flyTo(next, USER_ZOOM);
    }
  }

  async function locate({ fromButton = false } = {}) {
    if (!Location) {
      if (fromButton) {
        Alert.alert(
          'Position indisponible',
          'Cette version de l’app ne peut pas encore accéder à ta position. Elle arrive avec la prochaine mise à jour.'
        );
      }
      return;
    }
    if (fromButton && userPosRef.current) {
      flyTo(userPosRef.current, Math.max(cameraRef.current.zoom, USER_ZOOM));
      return;
    }
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== 'granted') {
        if (fromButton) {
          Alert.alert(
            'Position désactivée',
            'Autorise la localisation pour voir où tu es sur la carte.',
            [
              { text: 'Plus tard', style: 'cancel' },
              { text: 'Ouvrir les réglages', onPress: () => Linking.openSettings() },
            ]
          );
        }
        return;
      }
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
      if (!mounted.current) return;
      if (last?.coords) placeUser(last.coords, true);
      const fresh = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }).catch(() => null);
      if (!mounted.current) return;
      if (fresh?.coords) placeUser(fresh.coords, !last?.coords);
      if (!watchRef.current) {
        watchRef.current = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.Balanced, distanceInterval: 25 },
          (position) => {
            if (!mounted.current) return;
            const next = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            };
            userPosRef.current = next;
            setUserPos(next);
          }
        );
        if (!mounted.current) {
          watchRef.current.remove();
          watchRef.current = null;
        }
      }
    } catch {
      if (fromButton) {
        Alert.alert('Position', 'Impossible de trouver ta position pour le moment.');
      }
    }
  }

  useEffect(() => {
    mounted.current = true;
    locate();
    return () => {
      mounted.current = false;
      watchRef.current?.remove();
      watchRef.current = null;
    };
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  function changeZoom(delta) {
    stopAnimation();
    const from = cameraRef.current.zoom;
    const to = clampZoom(Math.round(from) + delta);
    const started = Date.now();
    const duration = 260;
    const step = () => {
      const t = Math.min(1, (Date.now() - started) / duration);
      const eased = 1 - (1 - t) ** 3;
      moveCamera({ center: cameraRef.current.center, zoom: from + (to - from) * eased });
      animRef.current = t < 1 ? requestAnimationFrame(step) : null;
    };
    animRef.current = requestAnimationFrame(step);
  }

  function openTutor(tutor) {
    setGroup(null);
    openTutorProfile(navigation, { tutor });
  }

  function onPinPress(members) {
    if (members.length === 1) {
      openTutor(members[0]);
      return;
    }
    setGroup(members);
  }

  const tiles = useMemo(() => {
    if (!size.width || !size.height) return [];
    const level = Math.round(zoom);
    const levels = level > MIN_ZOOM ? [level - 1, level] : [level];
    return levels.flatMap((item) => tilesAt(item, center, zoom, size));
  }, [center, zoom, size]);

  const userPoint = useMemo(() => {
    if (!userPos || !size.width || !size.height) return null;
    const origin = project(center.latitude, center.longitude, zoom);
    const point = project(userPos.latitude, userPos.longitude, zoom);
    return {
      left: size.width / 2 + (point.x - origin.x),
      top: size.height / 2 + (point.y - origin.y),
    };
  }, [userPos, center, zoom, size]);

  const pins = useMemo(() => {
    if (!size.width || !size.height) return [];
    const origin = project(center.latitude, center.longitude, zoom);
    return groups.map((members) => {
      const point = project(members[0].latitude, members[0].longitude, zoom);
      return {
        id: members[0].id,
        members,
        left: size.width / 2 + (point.x - origin.x),
        top: size.height / 2 + (point.y - origin.y),
      };
    });
  }, [groups, center, zoom, size]);

  return (
    <View style={styles.root}>
      {isFocused ? <StatusBar style="dark" /> : null}
      <View
        style={styles.map}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          setSize({ width, height });
        }}
        {...panResponder.panHandlers}
      >
        {tiles.map((tile) => (
          <Image
            key={tile.key}
            source={{ uri: tile.url, headers: TILE_HEADERS }}
            style={[
              styles.tile,
              { left: tile.left, top: tile.top, width: tile.size, height: tile.size },
            ]}
            fadeDuration={0}
            pointerEvents="none"
          />
        ))}
        {userPoint ? (
          <View
            pointerEvents="none"
            style={[styles.userWrap, { left: userPoint.left, top: userPoint.top }]}
          >
            <Animated.View
              style={[
                styles.userHalo,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
                  transform: [
                    { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) },
                  ],
                },
              ]}
            />
            <View style={styles.userDot} />
          </View>
        ) : null}
        {pins.map((pin) => {
          const tutor = pin.members[0];
          const several = pin.members.length > 1;
          return (
            <Pressable
              key={pin.id}
              style={[styles.pin, { left: pin.left, top: pin.top }]}
              onPress={() => onPinPress(pin.members)}
              accessibilityLabel={several ? `${pin.members.length} profils` : tutor.name}
            >
              {tutor.avatarUrl ? (
                <Image source={{ uri: tutor.avatarUrl }} style={styles.pinPhoto} />
              ) : (
                <View style={styles.pinPhoto}>
                  <Text style={styles.pinInitials}>{initials(tutor.name)}</Text>
                </View>
              )}
              {several ? (
                <View style={styles.count}>
                  <Text style={styles.countLabel}>{pin.members.length}</Text>
                </View>
              ) : (
                <Text style={styles.pinName} numberOfLines={1}>
                  {String(tutor.name || '').split(' ')[0]}
                </Text>
              )}
            </Pressable>
          );
        })}
      </View>

      <SafeAreaView style={styles.overlay} edges={['top', 'bottom']} pointerEvents="box-none">
        <View style={styles.topBar} pointerEvents="box-none">
          <View>
            <View style={styles.searchRow}>
              <Pressable
                style={styles.round}
                onPress={() => navigation.goBack()}
                accessibilityLabel="Retour"
                hitSlop={8}
              >
                <Ionicons name="chevron-back" size={22} color="#111111" />
              </Pressable>
              <Pressable
                style={styles.searchField}
                onPress={() => setSearchOpen(true)}
                accessibilityLabel="Rechercher une matière ou un lieu"
              >
                <Ionicons name="search" size={18} color="#8E8E93" />
                <Text
                  style={searchLabel ? styles.searchValue : styles.searchPlaceholder}
                  numberOfLines={1}
                >
                  {searchLabel || 'Rechercher un tuteur...'}
                </Text>
              </Pressable>
            </View>
            <TutorRefineBar filters={filters} floating />
          </View>
          <View style={styles.zoomCol}>
            <Pressable
              style={styles.round}
              onPress={() => changeZoom(1)}
              accessibilityLabel="Zoomer"
            >
              <Ionicons name="add" size={22} color="#111111" />
            </Pressable>
            <Pressable
              style={styles.round}
              onPress={() => changeZoom(-1)}
              accessibilityLabel="Dézoomer"
            >
              <Ionicons name="remove" size={22} color="#111111" />
            </Pressable>
            <Pressable
              style={[styles.round, styles.gap]}
              onPress={() => locate({ fromButton: true })}
              accessibilityLabel="Me localiser"
            >
              <Ionicons name="navigate" size={19} color="#2F7CF6" />
            </Pressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.message} pointerEvents="none">
            <ActivityIndicator color="#111111" />
          </View>
        ) : null}
        {!loading && error ? (
          <View style={styles.message} pointerEvents="none">
            <Text style={styles.messageText}>{error}</Text>
          </View>
        ) : null}
        {!loading && !error && placed.length === 0 ? (
          <View style={styles.message} pointerEvents="none">
            <Text style={styles.messageText}>Aucun profil à placer sur la carte.</Text>
          </View>
        ) : null}

        {group ? (
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>{group[0].city || 'À cet endroit'}</Text>
              <Pressable onPress={() => setGroup(null)} accessibilityLabel="Fermer" hitSlop={8}>
                <Ionicons name="close" size={20} color="#8E8E93" />
              </Pressable>
            </View>
            {group.map((tutor) => (
              <Pressable
                key={tutor.id}
                style={styles.row}
                onPress={() => openTutor(tutor)}
              >
                {tutor.avatarUrl ? (
                  <Image source={{ uri: tutor.avatarUrl }} style={styles.rowPhoto} />
                ) : (
                  <View style={styles.rowPhoto}>
                    <Text style={styles.pinInitials}>{initials(tutor.name)}</Text>
                  </View>
                )}
                <View style={styles.rowText}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {tutor.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {tutor.subject || 'Matière à préciser'}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color="#8E8E93" />
              </Pressable>
            ))}
          </View>
        ) : (
          <Text style={styles.attribution}>© Contributeurs OpenStreetMap</Text>
        )}
      </SafeAreaView>

      <TutorSearchSheet
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        filters={filters}
        tutors={allTutors}
        light
      />
    </View>
  );
}

function clampZoom(value) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
}

function tilesAt(level, center, zoom, size) {
  const scale = 2 ** (zoom - level);
  const shown = TILE * scale;
  const origin = project(center.latitude, center.longitude, level);
  const left = origin.x - size.width / 2 / scale;
  const top = origin.y - size.height / 2 / scale;
  const x0 = Math.floor(left / TILE);
  const y0 = Math.floor(top / TILE);
  const x1 = Math.floor((left + size.width / scale) / TILE);
  const y1 = Math.floor((top + size.height / scale) / TILE);
  const n = 2 ** level;
  const out = [];
  for (let x = x0; x <= x1; x += 1) {
    for (let y = y0; y <= y1; y += 1) {
      if (y < 0 || y >= n) continue;
      out.push({
        key: `${level}:${x}:${y}`,
        url: tileUrl(level, x, y),
        left: (x * TILE - origin.x) * scale + size.width / 2,
        top: (y * TILE - origin.y) * scale + size.height / 2,
        size: shown + 1,
      });
    }
  }
  return out;
}

function touchDistance(touches) {
  const a = touches[0];
  const b = touches[1];
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#D5DDE3' },
  map: { flex: 1, overflow: 'hidden', backgroundColor: '#D5DDE3' },
  tile: {
    position: 'absolute',
  },
  pin: {
    position: 'absolute',
    width: 64,
    marginLeft: -32,
    marginTop: -22,
    alignItems: 'center',
  },
  pinPhoto: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1C1C1E',
    borderWidth: 2,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pinInitials: { color: colors.white, fontSize: 13, fontWeight: '800' },
  pinName: {
    marginTop: 2,
    maxWidth: 64,
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(17,17,17,0.82)',
    color: colors.white,
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  count: {
    position: 'absolute',
    top: -2,
    right: 6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#1B6B45',
    alignItems: 'center',
    justifyContent: 'center',
  },
  countLabel: { color: colors.white, fontSize: 11, fontWeight: '800' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'space-between',
  },
  topBar: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  searchField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    backgroundColor: colors.white,
    borderRadius: 22,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  searchValue: { flex: 1, fontSize: 15, color: '#111111' },
  searchPlaceholder: { flex: 1, fontSize: 15, color: '#8E8E93' },
  zoomCol: { gap: 8, alignSelf: 'flex-end', marginTop: 10 },
  gap: { marginTop: 8 },
  userWrap: {
    position: 'absolute',
    width: 72,
    height: 72,
    marginLeft: -36,
    marginTop: -36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userHalo: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#2F7CF6',
  },
  userDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2F7CF6',
    borderWidth: 4,
    borderColor: colors.white,
    shadowColor: '#000000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 5,
  },
  round: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  message: {
    alignSelf: 'center',
    marginHorizontal: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.94)',
  },
  messageText: { color: '#111111', fontSize: 15, fontWeight: '700', textAlign: 'center' },
  attribution: {
    alignSelf: 'flex-start',
    marginLeft: 12,
    marginBottom: 8,
    color: '#3A3A3C',
    fontSize: 10,
    backgroundColor: 'rgba(255,255,255,0.72)',
    overflow: 'hidden',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  sheet: {
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 14,
    borderRadius: 20,
    backgroundColor: '#111111',
    gap: 8,
  },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  sheetTitle: { color: colors.white, fontSize: 16, fontWeight: '800' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 6,
  },
  rowPhoto: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  rowText: { flex: 1 },
  rowName: { color: colors.white, fontSize: 16, fontWeight: '800' },
  rowMeta: { color: '#A1A1A6', fontSize: 13, marginTop: 2 },
});
