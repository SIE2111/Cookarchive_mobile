/**
 * Eigener Einstiegspunkt statt expo/AppEntry.js.
 *
 * Grund: Bricht beim Laden der App etwas ab - eine fehlende
 * Umgebungsvariable, ein natives Modul, ein Fehler in einem Provider -,
 * zeigt iOS eine weisse Flaeche und sonst nichts. Ohne Mac und Xcode
 * gibt es dann keinen Weg an die Meldung heran, und jede Vermutung
 * kostet einen neuen Build.
 *
 * Hier wird die App deshalb in zwei Stufen abgesichert:
 *   1. require() in try/catch - faengt Fehler beim LADEN der Module
 *      (z. B. den bewussten throw in supabaseClient.ts).
 *   2. Eine Fehlergrenze - faengt Fehler beim ZEICHNEN der Oberflaeche.
 *
 * In beiden Faellen steht die Meldung lesbar auf dem Bildschirm.
 */
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { registerRootComponent } from 'expo';

function Fehleranzeige({ meldung }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#1B1B1F', paddingTop: 70, paddingHorizontal: 18 }}>
      <Text style={{ color: '#FF8A80', fontSize: 17, fontWeight: '700', marginBottom: 10 }}>
        Start fehlgeschlagen
      </Text>
      <ScrollView>
        <Text style={{ color: '#EDEDED', fontSize: 12, lineHeight: 18 }} selectable>
          {meldung}
        </Text>
      </ScrollView>
    </View>
  );
}

function alsText(fehler) {
  if (!fehler) return 'Unbekannter Fehler ohne Meldung.';
  return String(fehler.stack || fehler.message || fehler);
}

class Fehlergrenze extends React.Component {
  constructor(props) {
    super(props);
    this.state = { fehler: null };
  }

  static getDerivedStateFromError(fehler) {
    return { fehler };
  }

  render() {
    if (this.state.fehler) {
      return <Fehleranzeige meldung={alsText(this.state.fehler)} />;
    }
    return this.props.children;
  }
}

let Wurzel;
try {
  const App = require('./App').default;
  Wurzel = function AbgesicherteApp() {
    return (
      <Fehlergrenze>
        <App />
      </Fehlergrenze>
    );
  };
} catch (fehler) {
  const meldung = alsText(fehler);
  Wurzel = function LadefehlerApp() {
    return <Fehleranzeige meldung={meldung} />;
  };
}

registerRootComponent(Wurzel);
