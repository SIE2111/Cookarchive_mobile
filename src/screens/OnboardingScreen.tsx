import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Switch, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';
import type { HaubenLevel } from '../utils/stepLevels';

// Gleiche Reihenfolge und Benennung wie im Profil - die Auswahl hier ist
// nur die Erstbelegung, geaendert wird sie spaeter dort.
const HAUBEN_OPTIONS: { key: HaubenLevel; title: string; subtitle: string; hats: number }[] = [
  { key: 'anfaenger', title: 'Anfänger', subtitle: 'Viele kleine Schritte, Fachbegriffe werden erklärt', hats: 1 },
  { key: 'fortgeschritten', title: 'Fortgeschritten', subtitle: 'Das Rezept so, wie es geschrieben wurde', hats: 2 },
  { key: 'profi', title: 'Profi', subtitle: 'Wenige, zusammengefasste Schritte ohne Erklärungen', hats: 3 },
];

type Props = NativeStackScreenProps<MainStackParamList, 'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { clearJustRegistered } = useAuth();
  const [createFolders, setCreateFolders] = useState(true);
  // Keine 50/100-Paketgroessen mehr - fuehrte bei wachsendem Rezept-Pool
  // dazu, dass neu hinzugefuegte Rezepte (hoeherer popularity_rank) beim
  // Import schlicht nie mitkamen. Stattdessen nur noch "alle" oder "keine".
  const [importAll, setImportAll] = useState(true);
  // Vorbelegung wie in der Datenbank (default_hauben_level='fortgeschritten')
  const [haubenLevel, setHaubenLevel] = useState<HaubenLevel>('fortgeschritten');
  const [totalAvailable, setTotalAvailable] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<{ total_curated_recipes_available: number }>('/onboarding/starter-pack-options')
      .then((res) => setTotalAvailable(res.total_curated_recipes_available))
      .catch(() => {
        // Nur fuer die Anzeige der Rezeptanzahl - schlaegt das Laden fehl,
        // bleibt der Text generisch, der Import selbst funktioniert trotzdem
      });
  }, []);

  const handleContinue = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post('/onboarding/setup', {
        create_standard_folders: createFolders,
        starter_pack_size: importAll ? totalAvailable ?? 1000 : null,
      });
      // Bewusst NACH dem Setup und in einem eigenen try: Scheitert nur das
      // Speichern der Stufe, waere es unsinnig, das komplette Onboarding
      // (inkl. importierter Rezepte) als fehlgeschlagen zu melden - die
      // Stufe laesst sich im Profil jederzeit nachstellen.
      try {
        await api.patch('/preferences/', { default_hauben_level: haubenLevel });
      } catch {
        // still ignorieren, siehe oben
      }
      clearJustRegistered();
      navigation.replace('MainTabs');
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Einrichtung fehlgeschlagen');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Scrollbar, seit die Stufen-Auswahl dazugekommen ist: Auf kleinen
  // Geraeten passte der Inhalt sonst nicht mehr auf eine Bildschirmhoehe
  // und der "Los geht's"-Button lag unerreichbar unterhalb der Kante.
  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={[styles.title, { color: colors.text }]}>Willkommen bei Mein Kochbuch</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Ein paar Dinge zum Start</Text>

      <View style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Standard-Ordner anlegen</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>Vorspeisen, Hauptgerichte, Beilagen, Backen, Vegan, Getränke</Text>
        </View>
        <Switch value={createFolders} onValueChange={setCreateFolders} trackColor={{ false: '#E7E1D4', true: gradient[0] }} thumbColor="#fff" />
      </View>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>WIE AUSFÜHRLICH SOLLEN REZEPTE SEIN?</Text>

      {HAUBEN_OPTIONS.map((option) => {
        const isSelected = haubenLevel === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => setHaubenLevel(option.key)}
            style={[
              styles.row,
              { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: isSelected ? 1.5 : 0, borderColor: gradient[0] },
            ]}
          >
            <Text style={{ fontSize: 13, marginRight: 10 }}>
              {Array.from({ length: option.hats }).map(() => '👨‍🍳').join('')}
            </Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{option.title}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{option.subtitle}</Text>
            </View>
            {isSelected && <Text style={{ color: gradient[0], fontSize: 18 }}>✓</Text>}
          </Pressable>
        );
      })}

      <Text style={[styles.rowSubtitle, { color: colors.muted, marginBottom: 4 }]}>
        Lässt sich beim Kochen jederzeit umschalten und später im Profil ändern.
      </Text>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>STARTER-REZEPTE IMPORTIEREN</Text>

      <Pressable
        onPress={() => setImportAll(true)}
        style={[
          styles.row,
          { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: importAll ? 1.5 : 0, borderColor: gradient[0] },
        ]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>
            Alle importieren{totalAvailable !== null ? ` (${totalAvailable})` : ''}
          </Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>Bereits importierte werden übersprungen, keine Duplikate</Text>
        </View>
        {importAll && <Text style={{ color: gradient[0], fontSize: 18 }}>✓</Text>}
      </Pressable>

      <Pressable
        onPress={() => setImportAll(false)}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: !importAll ? 1.5 : 0, borderColor: gradient[0] }]}
      >
        <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>Keine Starter-Rezepte importieren</Text>
        {!importAll && <Text style={{ color: gradient[0], fontSize: 18 }}>✓</Text>}
      </Pressable>

      {error && <Text style={[styles.errorText, { color: '#DC2626' }]}>{error}</Text>}

      <Pressable onPress={handleContinue} disabled={isSubmitting} style={[styles.continueButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.continueButtonText}>Los geht's</Text>}
      </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { padding: 20, paddingBottom: 32 },
  title: { fontSize: 19, fontWeight: '700' },
  subtitle: { fontSize: 12.5, marginTop: 4, marginBottom: 22 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8 },
  rowTitle: { fontSize: 13.5, fontWeight: '600' },
  rowSubtitle: { fontSize: 10.5, marginTop: 2 },
  sectionLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, marginTop: 16, marginBottom: 10 },
  errorText: { fontSize: 12, marginTop: 8 },
  continueButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  continueButtonText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
});
