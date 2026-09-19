import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/theme/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { ServerSyncProvider } from './src/context/ServerSyncContext';
import AppNavigator from './src/navigation/AppNavigator';
import { spracheLaden } from './src/i18n';

export default function App() {
  // Die Sprache steht vor dem ersten Bild fest. Sonst erscheint die App
  // kurz auf Deutsch und springt dann um - das sieht nach Fehler aus.
  const [spracheBereit, setSpracheBereit] = useState(false);
  useEffect(() => {
    spracheLaden().finally(() => setSpracheBereit(true));
  }, []);

  if (!spracheBereit) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <AuthProvider>
          <ServerSyncProvider>
            <StatusBar style="auto" />
            <AppNavigator />
          </ServerSyncProvider>
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
