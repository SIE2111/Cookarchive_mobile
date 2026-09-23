import React, { useEffect, useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as Updates from 'expo-updates';
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

  // Ein neues EAS Update wurde bisher nur im Hintergrund heruntergeladen,
  // aktiv wurde es erst beim UEBERNAECHSTEN Start - einmal Schliessen und
  // Neuoeffnen reichte also nicht, was wie ein nicht behobener Fehler
  // aussah (22.09.2026). Jetzt: direkt beim Start pruefen, herunterladen
  // und sofort neu starten, solange noch niemand mit der App interagiert
  // hat. Ganz eigenstaendig neben der Sprachladung oben - blockiert diese
  // nicht und hat ein eigenes, grosszuegigeres Zeitfenster (Netzwerk
  // braucht laenger als das lokale Sprachladen). Faengt jemand in der
  // Zwischenzeit schon an zu kochen (naechFruehesFenster ist um), wird
  // NICHT mehr neu gestartet - das Update kommt dann ganz normal beim
  // naechsten Kaltstart, statt mitten in einer laufenden Nutzung den
  // Boden unter den Fuessen wegzuziehen.
  useEffect(() => {
    if (__DEV__ || !Updates.isEnabled) return;
    let nochFrueh = true;
    const fensterSchliessen = setTimeout(() => {
      nochFrueh = false;
    }, 4000);

    (async () => {
      try {
        const ergebnis = await Updates.checkForUpdateAsync();
        if (!ergebnis.isAvailable || !nochFrueh) return;
        await Updates.fetchUpdateAsync();
        if (!nochFrueh) return;
        await Updates.reloadAsync();
      } catch {
        // Kein Netz, Server nicht erreichbar o.ae. - normal weiterstarten,
        // naechster Versuch beim naechsten App-Start.
      }
    })();

    return () => clearTimeout(fensterSchliessen);
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
