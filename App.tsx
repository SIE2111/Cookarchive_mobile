import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider } from './src/theme/ThemeContext';
import { AuthProvider } from './src/context/AuthContext';
import { ServerSyncProvider } from './src/context/ServerSyncContext';
import AppNavigator from './src/navigation/AppNavigator';
import { spracheLaden } from './src/i18n';

export default function App() {
  // Die Sprache soll vor dem ersten Bild feststehen - sonst erscheint die
  // App kurz auf Deutsch und springt dann um, was nach Fehler aussieht.
  //
  // ABER: Warten darf nie endlos sein. Bleibt das Laden haengen (Speicher
  // nicht erreichbar, Geraetesprache nicht ermittelbar), sah man nur den
  // Startbildschirm und kam nie zur Anmeldung. Ein weisser Bildschirm
  // ohne Ausweg ist schlimmer als ein kurzes Umspringen der Sprache.
  const [spracheBereit, setSpracheBereit] = useState(false);
  useEffect(() => {
    let erledigt = false;
    const fertig = () => {
      if (!erledigt) {
        erledigt = true;
        setSpracheBereit(true);
      }
    };
    spracheLaden().finally(fertig);
    const notbremse = setTimeout(fertig, 2000);
    return () => clearTimeout(notbremse);
  }, []);

  if (!spracheBereit) return null;

  // GestureHandlerRootView so nah wie moeglich an der Wurzel - Pflicht
  // fuer react-native-gesture-handler (siehe ManageCategoriesScreen, wo
  // es fuer echtes Ziehen zum Umsortieren genutzt wird), sonst schlagen
  // Gesten mit einer Fehlermeldung fehl statt einfach nichts zu tun.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
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
    </GestureHandlerRootView>
  );
}
