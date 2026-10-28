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
import TutorMapScreen from './screens/TutorMapScreen';
import FavoritesScreen from './screens/FavoritesScreen';
import MessagesScreen from './screens/MessagesScreen';
import ChatScreen from './screens/ChatScreen';
import WalletScreen from './screens/WalletScreen';
import ProfileScreen from './screens/ProfileScreen';
import AccountScreen from './screens/AccountScreen';
import ChangePasswordScreen from './screens/ChangePasswordScreen';
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import WelcomeScreen from './screens/WelcomeScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import { ParentSearchProvider } from './lib/ParentSearchContext';
import TutorHomeScreen from './screens/TutorHomeScreen';
import TutorGuideScreen from './screens/TutorGuideScreen';
import TutorAnnouncementScreen from './screens/TutorAnnouncementScreen';
import TutorSectionScreen from './screens/TutorSectionScreen';
import TutorProfileDetail from './components/TutorProfileDetail';
import {
  clerkPublishableKey,
  isClerkConfigured,
  tokenCache,
} from './lib/clerk';
import { RoleProvider, useRole } from './lib/RoleContext';
import { FavoriteTutorsProvider } from './hooks/useFavoriteTutors';
import { ROLES } from './lib/roles';
import { setupPushNotificationsForUser } from './services/notifications';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const darkTabBar = {
  backgroundColor: '#111111',
  borderTopColor: '#2A2A2A',
  paddingTop: 4,
};

const tabScreenOptions = ({ route }) => ({
  headerShown: false,
  tabBarShowLabel: false,
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
      TutorGuide: 'home',
      TutorHome: 'school',
      Messages: 'chatbubbles',
      Wallet: 'wallet',
      Profile: 'person',
    };
    return <Ionicons name={icons[route.name]} size={size} color={color} />;
  },
});

function ParentMainTabs() {
  return (
    <Tab.Navigator
      key="parent-main"
      initialRouteName="Matchs"
      screenOptions={tabScreenOptions}
    >
      <Tab.Screen
        name="Matchs"
        component={SwipeScreen}
        options={{
          title: 'Découvrir',
          tabBarStyle: darkTabBar,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#8E8E93',
        }}
      />
      <Tab.Screen
        name="Favorites"
        component={FavoritesScreen}
        options={{
          title: 'Favoris',
          tabBarStyle: darkTabBar,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#8E8E93',
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: 'Messages',
          tabBarStyle: darkTabBar,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#8E8E93',
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          title: 'Portefeuille',
          tabBarStyle: darkTabBar,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#8E8E93',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profil',
          tabBarStyle: darkTabBar,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#8E8E93',
        }}
      />
    </Tab.Navigator>
  );
}

function TutorMainTabs() {
  return (
    <Tab.Navigator
      key="tutor-main"
      initialRouteName="TutorGuide"
      screenOptions={tabScreenOptions}
    >
      <Tab.Screen
        name="TutorGuide"
        component={TutorGuideScreen}
        options={{
          title: 'Accueil',
          tabBarStyle: darkTabBar,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#8E8E93',
        }}
      />
      <Tab.Screen
        name="TutorHome"
        component={TutorHomeScreen}
        options={{
          title: 'Mon espace',
          tabBarStyle: darkTabBar,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#8E8E93',
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          title: 'Demandes',
          tabBarStyle: darkTabBar,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#8E8E93',
        }}
      />
      <Tab.Screen
        name="Wallet"
        component={WalletScreen}
        options={{
          title: 'Portefeuille',
          tabBarStyle: darkTabBar,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#8E8E93',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profil',
          tabBarStyle: darkTabBar,
          tabBarActiveTintColor: '#FFFFFF',
          tabBarInactiveTintColor: '#8E8E93',
        }}
      />
    </Tab.Navigator>
  );
}

function TutorSessionStack() {
  return (
    <Stack.Navigator
      initialRouteName="TutorProfile"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#111111' },
      }}
    >
      <Stack.Screen name="TutorProfile" component={TutorProfileDetail} />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
          keyboardHandlingEnabled: false,
        }}
      />
    </Stack.Navigator>
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
        name="TutorMap"
        component={TutorMapScreen}
        options={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#D5DDE3' },
        }}
      />
      <Stack.Screen
        name="TutorSession"
        component={TutorSessionStack}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
          keyboardHandlingEnabled: false,
          contentStyle: { backgroundColor: '#111111' },
        }}
      />
      <Stack.Screen
        name="Chat"
        component={ChatScreen}
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
          contentStyle: { backgroundColor: '#111111' },
        }}
      />
      <Stack.Screen
        name="Settings"
        component={ProfileScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="Account"
        component={AccountScreen}
        options={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#111111' },
        }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#111111' },
        }}
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
        name="Chat"
        component={ChatScreen}
        options={{
          animation: 'slide_from_right',
          gestureEnabled: true,
          contentStyle: { backgroundColor: '#111111' },
        }}
      />
      <Stack.Screen
        name="Settings"
        component={ProfileScreen}
        options={{ presentation: 'modal' }}
      />
      <Stack.Screen
        name="EditTutorAnnouncement"
        component={TutorAnnouncementScreen}
        options={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#111111' },
        }}
      />
      <Stack.Screen
        name="EditTutorSection"
        component={TutorSectionScreen}
        options={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#111111' },
        }}
      />
      <Stack.Screen
        name="Account"
        component={AccountScreen}
        options={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#111111' },
        }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: '#111111' },
        }}
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

function navKeyFor(isSignedIn, role) {
  if (!isSignedIn) return 'auth';
  if (role === ROLES.TUTOR) return 'tutor';
  if (role === ROLES.PARENT) return 'parent';
  return 'onboarding';
}

function KeyedNavigation() {
  const { isLoaded, isSignedIn } = useAuth();
  const { role } = useRole();
  const navKey = navKeyFor(isLoaded && isSignedIn, role);

  return (
    <NavigationContainer key={navKey}>
      <StatusBar style="dark" />
      <RootNavigator />
    </NavigationContainer>
  );
}

function AppContent() {
  return (
    <SafeAreaProvider>
      <RoleProvider>
        <FavoriteTutorsProvider>
          <KeyedNavigation />
        </FavoriteTutorsProvider>
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
