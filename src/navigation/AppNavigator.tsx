import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ConfirmEmailScreen from '../screens/ConfirmEmailScreen';
import DashboardScreen from '../screens/DashboardScreen';
import RecipesScreen from '../screens/RecipesScreen';
import ShoppingListScreen from '../screens/ShoppingListScreen';
import RecipeDetailScreen from '../screens/RecipeDetailScreen';
import RecipeSourceMenuScreen from '../screens/RecipeSourceMenuScreen';
import ManualRecipeScreen from '../screens/ManualRecipeScreen';
import WebImportScreen from '../screens/WebImportScreen';
import CookModeScreen from '../screens/CookModeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CommunityPoolScreen from '../screens/CommunityPoolScreen';
import HouseholdScreen from '../screens/HouseholdScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import SideDishSuggestionScreen from '../screens/SideDishSuggestionScreen';
import PhotoCaptureScreen from '../screens/PhotoCaptureScreen';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  ConfirmEmail: { email: string };
};

// Die 5 dauerhaft sichtbaren Bereiche (Bottom-Tab-Leiste). "Scan" hat
// bewusst keinen eigenen Screen-Inhalt - der Tab-Button oeffnet
// stattdessen das RecipeSourceMenu als Modal (siehe tabBarButton unten),
// daher hier ebenfalls als Route vorhanden, aber nie tatsaechlich
// dargestellt.
export type MainTabParamList = {
  Home: undefined;
  Rezepte: { filterTag?: string } | undefined;
  Scan: undefined;
  Einkauf: undefined;
  Profil: undefined;
};

// Alles, was als volle Seite ÜBER der Tab-Leiste geoeffnet wird (Rezept-
// Details, Koch-Modus, Formulare, ...). MainTabs ist selbst nur einer der
// Screens hier drin.
export type MainStackParamList = {
  MainTabs: undefined;
  RecipeDetail: { recipeId: string; title: string };
  RecipeSourceMenu: undefined;
  ManualRecipe: undefined;
  WebImport: undefined;
  CookMode: { recipeIds: string[] };
  CommunityPool: undefined;
  Household: undefined;
  Onboarding: undefined;
  SideDishSuggestion: { recipeId: string };
  PhotoCapture: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ConfirmEmail" component={ConfirmEmailScreen} />
    </AuthStack.Navigator>
  );
}

// Reiner Platzhalter fuer den Scan-Tab - wird nie tatsaechlich angezeigt
// (siehe tabPress-Listener unten, der sofort das RecipeSourceMenu-Modal
// oeffnet), muss aber als Komponente existieren, damit Tab.Screen einen
// eigenen, passend typisierten Eintrag bekommt statt einen anderen Screen
// zweckzuentfremden.
function ScanTabPlaceholder() {
  return <View />;
}

const TAB_ICONS: Record<keyof MainTabParamList, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Home: 'home-variant-outline',
  Rezepte: 'book-open-variant',
  Scan: 'camera-plus-outline',
  Einkauf: 'cart-outline',
  Profil: 'account-circle-outline',
};

function MainTabs() {
  const { colors, gradient } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: gradient[0],
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.bg },
        tabBarIcon: ({ color, size }) => (
          <MaterialCommunityIcons name={TAB_ICONS[route.name as keyof MainTabParamList]} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Home" component={DashboardScreen} options={{ title: 'Home' }} />
      <Tab.Screen name="Rezepte" component={RecipesScreen} />
      <Tab.Screen
        name="Scan"
        component={ScanTabPlaceholder}
        options={({ navigation }) => ({
          // Der Scan-Tab zeigt nie eigenen Inhalt - "listeners" faengt den
          // Tab-Press ab (preventDefault stoppt den normalen Tab-Wechsel)
          // und oeffnet stattdessen das RecipeSourceMenu als Modal, aus dem
          // "Foto erfassen" erreichbar ist.
          tabBarButton: (props) => (
            <Pressable
              {...(props as any)}
              onPress={() => navigation.getParent()?.navigate('RecipeSourceMenu')}
            />
          ),
        })}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.getParent()?.navigate('RecipeSourceMenu');
          },
        })}
      />
      <Tab.Screen name="Einkauf" component={ShoppingListScreen} />
      <Tab.Screen name="Profil" component={ProfileScreen} options={{ title: 'Profil' }} />
    </Tab.Navigator>
  );
}

function MainNavigator() {
  const { colors } = useTheme();
  const { justRegistered } = useAuth();
  // Neu registrierte Nutzer starten im Onboarding (Ordner/Starter-Pack-Wahl),
  // alle anderen landen wie gewohnt direkt auf den Tabs.
  const initialRouteName = justRegistered ? 'Onboarding' : 'MainTabs';
  return (
    <MainStack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <MainStack.Screen name="MainTabs" component={MainTabs} options={{ headerShown: false }} />
      <MainStack.Screen
        name="RecipeDetail"
        component={RecipeDetailScreen}
        options={({ route }) => ({ title: route.params.title })}
      />
      <MainStack.Screen
        name="RecipeSourceMenu"
        component={RecipeSourceMenuScreen}
        options={{ presentation: 'transparentModal', headerShown: false, animation: 'fade' }}
      />
      <MainStack.Screen
        name="ManualRecipe"
        component={ManualRecipeScreen}
        options={{ title: 'Selbst erstellen' }}
      />
      <MainStack.Screen
        name="WebImport"
        component={WebImportScreen}
        options={{ title: 'Aus dem Internet' }}
      />
      <MainStack.Screen
        name="CookMode"
        component={CookModeScreen}
        options={{ title: 'Kochen', headerBackTitle: 'Abbrechen' }}
      />
      <MainStack.Screen name="CommunityPool" component={CommunityPoolScreen} options={{ title: 'Community-Pool' }} />
      <MainStack.Screen name="Household" component={HouseholdScreen} options={{ title: 'Haushalt' }} />
      <MainStack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <MainStack.Screen name="SideDishSuggestion" component={SideDishSuggestionScreen} options={{ title: 'Beilage?', headerBackVisible: false }} />
      <MainStack.Screen name="PhotoCapture" component={PhotoCaptureScreen} options={{ title: 'Foto erfassen' }} />
    </MainStack.Navigator>
  );
}

export default function AppNavigator() {
  const { session, isLoading } = useAuth();
  const { colors, isLoaded: themeLoaded } = useTheme();

  if (isLoading || !themeLoaded) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {session ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
