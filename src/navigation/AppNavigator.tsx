import React from 'react';
import { NavigationContainer, type NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import LoginScreen from '../screens/LoginScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ConfirmEmailScreen from '../screens/ConfirmEmailScreen';
import DashboardScreen from '../screens/DashboardScreen';
import RecipesScreen from '../screens/RecipesScreen';
import ShoppingListScreen from '../screens/ShoppingListScreen';
import RecipeDetailScreen from '../screens/RecipeDetailScreen';
import RecipeSourceMenuScreen from '../screens/RecipeSourceMenuScreen';
import ManualRecipeScreen from '../screens/ManualRecipeScreen';
import WebImportScreen from '../screens/WebImportScreen';
import WebBrowseScreen from '../screens/WebBrowseScreen';
import AIGenerateScreen from '../screens/AIGenerateScreen';
import WeeklyPlanScreen from '../screens/WeeklyPlanScreen';
import CookModeScreen from '../screens/CookModeScreen';
import ProfileScreen from '../screens/ProfileScreen';
import CommunityPoolScreen from '../screens/CommunityPoolScreen';
import PoolRecipeDetailScreen from '../screens/PoolRecipeDetailScreen';
import VoiceSettingsScreen from '../screens/VoiceSettingsScreen';
import SupportScreen from '../screens/SupportScreen';
import HouseholdScreen from '../screens/HouseholdScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import StarterPacksScreen from '../screens/StarterPacksScreen';
import LanguageSettingsScreen from '../screens/LanguageSettingsScreen';
import StorageSettingsScreen from '../screens/StorageSettingsScreen';
import PhotoCaptureScreen from '../screens/PhotoCaptureScreen';

export type AuthStackParamList = {
  ForgotPassword: undefined;
  Login: undefined;
  Register: undefined;
  ConfirmEmail: { email: string };
};

// Die 5 dauerhaft sichtbaren Bereiche (Bottom-Tab-Leiste).
//
// Frueher stand hier "Scan" - ein Tab ohne eigenen Inhalt, der nur das
// RecipeSourceMenu oeffnete, also eine Aktion im Gewand eines Ortes. Der
// Platz gehoert einem echten Bereich: dem Community-Pool. Das Erfassen
// uebernimmt jetzt der schwebende Knopf (components/ScanFab.tsx), der auf
// allen Hauptscreens sitzt.
export type MainTabParamList = {
  Home: undefined;
  Rezepte: { filterTag?: string; favoritesOnly?: boolean } | undefined;
  Pool: undefined;
  Einkauf: undefined;
  Profil: undefined;
};

// Alles, was als volle Seite ÜBER der Tab-Leiste geoeffnet wird (Rezept-
// Details, Koch-Modus, Formulare, ...). MainTabs ist selbst nur einer der
// Screens hier drin.
export type MainStackParamList = {
  // Parametrisiert, damit von einem Stack-Screen aus gezielt ein Tab
  // angesprungen werden kann (z.B. nach dem Kochen zurueck aufs Dashboard).
  MainTabs: NavigatorScreenParams<MainTabParamList> | undefined;
  RecipeDetail: { recipeId: string; title: string };
  RecipeSourceMenu: undefined;
  ManualRecipe: { recipeId?: string } | undefined;
  WebImport: { pickedUrl?: string } | undefined;
  WebBrowse: { initialQuery?: string } | undefined;
  AIGenerate: undefined;
  WeeklyPlan: undefined;
  // discardAfterId: Rezept, das nach dem Kochvorgang wieder geloescht wird.
  // Fuer "nur kochen, nicht behalten" - der Koch-Modus braucht ein
  // gespeichertes Rezept (Timer, Tipps, Stufen, Notizen haengen an der ID),
  // also wird es angelegt und danach wieder entfernt.
  CookMode: { recipeIds: string[]; discardAfterId?: string; sessionNote?: string; sessionOverrides?: { ingredients?: { name: string; amount: number | null; unit: string | null }[]; steps?: { order: number; text: string; timer_seconds?: number | null; user_note?: string | null; technique_tag?: string | null }[] } };
  // Derselbe Screen ist auch ein Tab. Der Stack-Eintrag bleibt, weil das
  // RecipeSourceMenu ihn als Quelle anbietet und dann als Seite ueber den
  // Tabs oeffnen soll - der Tab ist der Bereich, dieser hier der gezielte
  // Aufruf aus dem Erfassen-Menue.
  CommunityPool: undefined;
  PoolRecipeDetail: { publicRecipeId: string; title?: string };
  VoiceSettings: undefined;
  Support: undefined;
  Household: undefined;
  Onboarding: undefined;
  StarterPacks: undefined;
  LanguageSettings: undefined;
  StorageSettings: undefined;
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
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

const TAB_ICONS: Record<keyof MainTabParamList, keyof typeof MaterialCommunityIcons.glyphMap> = {
  Home: 'home-variant-outline',
  Rezepte: 'book-open-variant',
  Pool: 'account-group-outline',
  Einkauf: 'cart-outline',
  Profil: 'account-circle-outline',
};

function MainTabs() {
  const { colors, gradient } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
      // Alle Tab-Screens haben bewusst headerShown:false (eigenes Design
      // statt nativer Navigationsleiste) - dadurch uebernimmt aber auch
      // niemand automatisch den Sicherheitsabstand zur Notch/Statusleiste.
      // Zentral hier am Navigator geloest statt in jedem einzelnen Screen,
      // damit kuenftige neue Tabs das automatisch mitbekommen. In v7 heisst
      // die Option 'sceneStyle' (Teil von screenOptions), nicht mehr das
      // veraltete 'sceneContainerStyle' vom Navigator selbst.
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { paddingTop: insets.top },
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
      <Tab.Screen name="Pool" component={CommunityPoolScreen} options={{ title: 'Pool' }} />
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
        // Ohne das zeigt iOS den ROUTENNAMEN des vorherigen Screens neben
        // dem Pfeil - beim Sprung von den Tabs also woertlich "MainTabs".
        // Ein interner Bezeichner hat in der Oberflaeche nichts verloren.
        headerBackTitle: 'Zurück',
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
        options={({ route }) => ({ title: route.params?.recipeId ? 'Rezept bearbeiten' : 'Selbst erstellen' })}
      />
      <MainStack.Screen
        name="WebImport"
        component={WebImportScreen}
        options={{ title: 'Aus dem Internet' }}
      />
      <MainStack.Screen
        name="WebBrowse"
        component={WebBrowseScreen}
        options={{ title: 'Rezept suchen' }}
      />
      <MainStack.Screen
        name="AIGenerate"
        component={AIGenerateScreen}
        options={{ title: 'KI-Rezept' }}
      />
      <MainStack.Screen
        name="WeeklyPlan"
        component={WeeklyPlanScreen}
        options={{ title: 'Wochenplan' }}
      />
      <MainStack.Screen
        name="CookMode"
        component={CookModeScreen}
        options={{ title: 'Kochen', headerBackTitle: 'Abbrechen' }}
      />
      <MainStack.Screen name="CommunityPool" component={CommunityPoolScreen} options={{ title: 'Community-Pool' }} />
      <MainStack.Screen
        name="PoolRecipeDetail"
        component={PoolRecipeDetailScreen}
        options={({ route }) => ({ title: route.params?.title ?? 'Rezept' })}
      />
      <MainStack.Screen name="VoiceSettings" component={VoiceSettingsScreen} options={{ title: 'Vorlesen & Stimme' }} />
      <MainStack.Screen name="Support" component={SupportScreen} options={{ title: 'Support kontaktieren' }} />
      <MainStack.Screen name="Household" component={HouseholdScreen} options={{ title: 'Haushalt' }} />
      <MainStack.Screen name="Onboarding" component={OnboardingScreen} options={{ headerShown: false, gestureEnabled: false }} />
      <MainStack.Screen name="StarterPacks" component={StarterPacksScreen} options={{ headerShown: false }} />
      <MainStack.Screen name="LanguageSettings" component={LanguageSettingsScreen} options={{ headerShown: false }} />
      <MainStack.Screen name="StorageSettings" component={StorageSettingsScreen} options={{ title: 'Speicherort' }} />
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
