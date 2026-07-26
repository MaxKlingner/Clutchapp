import { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { ClerkProvider, useAuth } from '@clerk/clerk-expo';

import SwipeScreen from './screens/SwipeScreen';
import MessagesScreen from './screens/MessagesScreen';
import WalletScreen from './screens/WalletScreen';
import ProfileScreen from './screens/ProfileScreen';
import SignInScreen from './screens/SignInScreen';
import SignUpScreen from './screens/SignUpScreen';
import OnboardingScreen from './screens/OnboardingScreen';
import TutorHomeScreen from './screens/TutorHomeScreen';
import TutorProfileEditScreen from './screens/TutorProfileEditScreen';
import { withTabSwipe } from './lib/withTabSwipe';
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

const ParentDiscover = withTabSwipe(SwipeScreen);
const ParentMessages = withTabSwipe(MessagesScreen);
const ParentWallet = withTabSwipe(WalletScreen);
const TutorHome = withTabSwipe(TutorHomeScreen);
const TutorMessages = withTabSwipe(MessagesScreen);
const TutorWallet = withTabSwipe(WalletScreen);

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
        component={ParentDiscover}
        options={{ title: 'Découvrir' }}
      />
      <Tab.Screen
        name="Messages"
        component={ParentMessages}
        options={{ title: 'Messages' }}
      />
      <Tab.Screen
        name="Wallet"
        component={ParentWallet}
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
        component={TutorHome}
        options={{ title: 'Accueil' }}
      />
      <Tab.Screen
        name="Messages"
        component={TutorMessages}
        options={{ title: 'Demandes' }}
      />
      <Tab.Screen
        name="Wallet"
        component={TutorWallet}
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

function AuthNavigator() {
  const [mode, setMode] = useState('signIn');

  if (mode === 'signUp') {
    return <SignUpScreen onGoToSignIn={() => setMode('signIn')} />;
  }

  return <SignInScreen onGoToSignUp={() => setMode('signUp')} />;
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

  return <ParentTabs key="parent-tabs" />;
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
});
