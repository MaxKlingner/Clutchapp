import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';

import SwipeScreen from './screens/SwipeScreen';
import FavoritesScreen from './screens/FavoritesScreen';
import MessagesScreen from './screens/MessagesScreen';
import WalletScreen from './screens/WalletScreen';
import ProfileScreen from './screens/ProfileScreen';
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import { ParentSearchProvider } from './lib/ParentSearchContext';
import TutorHomeScreen from './screens/TutorHomeScreen';
import TutorProfileEditScreen from './screens/TutorProfileEditScreen';
import {
  clerkPublishableKey,
  isClerkConfigured,
  tokenCache,
} from './lib/clerk';
import { RoleProvider, useRole } from './lib/RoleContext';
import { ROLES } from './lib/roles';
import { setupPushNotificationsForUser } from './services/notifications';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const tabScreenOptions = ({ route }) => ({
  headerShown: false,
  tabBarActiveTintColor: '#1B5E3B',
  tabBarInactiveTintColor: '#7A9185',
  tabBarStyle: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E2EAE5',
    paddingTop: 4,
  },
  tabBarLabelStyle: {
    fontSize: 12,
    fontWeight: '600',
  },
  tabBarIcon: ({ color, size }) => {
    const icons = {
      Matchs: 'book',
      Favorites: 'heart',
      TutorHome: 'school',
      Messages: 'chatbubbles',
      Wallet: 'wallet',
    };
    return <Ionicons name={icons[route.name]} size={size} color={color} />;
  },
});

function ParentMainTabs() {
  return (
    <Tab.Navigator initialRouteName="Matchs" screenOptions={tabScreenOptions}>
      <Tab.Screen
        name="Matchs"
        component={SwipeScreen}
        options={{ title: 'Découvrir' }}
      />
      <Tab.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{ title: 'Favoris' }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ title: 'Messages' }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ title: 'Portefeuille' }}
      />
    </Tab.Navigator>
  );
}

function TutorMainTabs() {
  return (
    <Tab.Navigator
      initialRouteName="TutorHome"
      screenOptions={tabScreenOptions}
    >
      <Tab.Screen
        name="TutorHome"
        component={TutorHomeScreen}
        options={{ title: 'Accueil' }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{ title: 'Demandes' }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{ title: 'Portefeuille' }}
      />
    </Tab.Navigator>
  );
}

function ParentTabs() {
  return (
    <Stack.Navigator
      initialRouteName="MainTabs"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="MainTabs" component={ParentMainTabs} />
      <Stack.Screen
        name="Settings"
        component={ProfileScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

function TutorTabs() {
  return (
    <Stack.Navigator
      initialRouteName="MainTabs"
      screenOptions={{ headerShown: false }}
    >
      <Stack.Screen name="MainTabs" component={TutorMainTabs} />
      <Stack.Screen
        name="Settings"
        component={ProfileScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="EditTutorProfile"
        component={TutorProfileEditScreen}
        options={{ presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}

function ParentExperience() {
  return (
    <ParentSearchProvider>
      <ParentTabs key="parent-tabs" />
    </ParentSearchProvider>
  );
}

function AuthNavigator() {
  const { width } = useWindowDimensions();
  const [panel, setPanel] = useState(null);
  const translateX = useRef(new Animated.Value(width)).current;

  function open(next) {
    if (panel == null) translateX.setValue(width);
    setPanel(next);
  }

  function close() {
    translateX.stopAnimation();
    Keyboard.dismiss();
    Animated.timing(translateX, {
      toValue: width,
      duration: 250,
      easing: Easing.bezier(0.38, 0.7, 0.125, 1),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setPanel(null);
    });
  }

  useLayoutEffect(() => {
    if (!panel) return undefined;
    const anim = Animated.timing(translateX, {
      toValue: 0,
      duration: 240,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [panel, translateX]);

  return (
    <View style={styles.authHost}>
      <View style={styles.authHost} pointerEvents={panel ? 'none' : 'auto'}>
        <WelcomeScreen
          onSignIn={() => open('signIn')}
          onSignUp={() => open('signUp')}
        />
      </View>
      {panel ? (
        <Animated.View
          style={[styles.authSheet, { transform: [{ translateX }] }]}
        >
          {panel === 'signUp' ? (
            <SignUpScreen
              onBack={close}
              onGoToSignIn={() => open('signIn')}
            />
          ) : (
            <SignInScreen
              onBack={close}
              onGoToSignUp={() => open('signUp')}
            />
          )}
        </Animated.View>
      ) : null}
    </View>
  );
}

function RoleGate() {
  const { userId } = useAuth();
  const { role, loading, error, loadRole, setRoleSelected } = useRole();

  useEffect(() => {
    loadRole(userId);
  }, [userId, loadRole]);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;

    (async () => {
      const token = await setupPushNotificationsForUser(userId);
      if (!cancelled && token) {
        console.log('[push] Token enregistré');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1B5E3B" />
      </View>
    );
  }

  if (!role) {
    return (
      <OnboardingScreen
        onRoleSelected={setRoleSelected}
        loadError={error}
      />
    );
  }

  if (role === ROLES.TUTOR) {
    return <TutorTabs key="tutor-tabs" />;
  }

  return <ParentExperience key="parent-experience" />;
}

function RootNavigator() {
  const { isLoaded, isSignedIn } = useAuth();

  if (!isLoaded) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1B5E3B" />
      </View>
    );
  }

  return isSignedIn ? <RoleGate /> : <AuthNavigator />;
}

function AppContent() {
  return (
    <SafeAreaProvider>
      <RoleProvider>
        <NavigationContainer>
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </RoleProvider>
    </SafeAreaProvider>
  );
}

export default function App() {
  if (!isClerkConfigured) {
    return (
      <SafeAreaProvider>
        <View style={styles.loading}>
          <ActivityIndicator size="large" color="#1B5E3B" />
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <ClerkProvider
      publishableKey={clerkPublishableKey}
      tokenCache={tokenCache}
    >
      <AppContent />
    </ClerkProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F6F4',
  },
  authHost: {
    flex: 1,
  },
  authSheet: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111111',
    shadowColor: '#000000',
    shadowOffset: { width: -8, height: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 16,
    elevation: 12,
  },
});
