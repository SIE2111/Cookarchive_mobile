import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../theme/ThemeContext';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import StartScreen from '../screens/StartScreen';
import RecipeDetailScreen from '../screens/RecipeDetailScreen';
import RecipeSourceMenuScreen from '../screens/RecipeSourceMenuScreen';
import ManualRecipeScreen from '../screens/ManualRecipeScreen';
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
};

export type MainStackParamList = {
  Start: undefined;
  RecipeDetail: { recipeId: string; title: string };
  RecipeSourceMenu: undefined;
  ManualRecipe: undefined;
  CookMode: { recipeIds: string[] };
  Profile: undefined;
  CommunityPool: undefined;
  Household: undefined;
  Onboarding: undefined;
  SideDishSuggestion: { recipeId: string };
  PhotoCapture: undefined;
};

const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  const { colors } = useTheme();
  const { justRegistered } = useAuth();
  // Neu registrierte Nutzer starten im Onboarding (Ordner/Starter-Pack-Wahl),
  // alle anderen landen wie gewohnt direkt auf der Startseite.
  const initialRouteName = justRegistered ? 'Onboarding' : 'Start';
  return (
    <MainStack.Navigator
      initialRouteName={initialRouteName}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerShadowVisible: false,
      }}
    >
      <MainStack.Screen
        name="Start"
        component={StartScreen}
        options={({ navigation }) => ({
          title: 'Mein Kochbuch',
          headerRight: () => (
            <Pressable onPress={() => navigation.navigate('Profile')} hitSlop={12}>
              <Text style={{ color: colors.text, fontSize: 20 }}>⚙︎</Text>
            </Pressable>
          ),
        })}
      />
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
        name="CookMode"
        component={CookModeScreen}
        options={{ title: 'Kochen', headerBackTitle: 'Abbrechen' }}
      />
      <MainStack.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profil' }} />
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
