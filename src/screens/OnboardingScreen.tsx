import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'Onboarding'>;

export default function OnboardingScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { clearJustRegistered } = useAuth();
  const [createFolders, setCreateFolders] = useState(true);
  // Keine 50/100-Paketgroessen mehr - fuehrte bei wachsendem Rezept-Pool
  // dazu, dass neu hinzugefuegte Rezepte (hoeherer popularity_rank) beim
  // Import schlicht nie mitkamen. Stattdessen nur noch "alle" oder "keine".
  const [importAll, setImportAll] = useState(true);
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
      clearJustRegistered();
      navigation.replace('MainTabs');
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Einrichtung fehlgeschlagen');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]} edges={['top']}>
      <Text style={[styles.title, { color: colors.text }]}>Willkommen bei Mein Kochbuch</Text>
      <Text style={[styles.subtitle, { color: colors.muted }]}>Ein paar Dinge zum Start</Text>

      <View style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Standard-Ordner anlegen</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>Vorspeisen, Hauptgerichte, Beilagen, Backen, Vegan, Getränke</Text>
        </View>
        <Switch value={createFolders} onValueChange={setCreateFolders} trackColor={{ false: '#E7E1D4', true: gradient[0] }} thumbColor="#fff" />
      </View>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  title: { fontSize: 19, fontWeight: '700' },
  subtitle: { fontSize: 12.5, marginTop: 4, marginBottom: 22 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8 },
  rowTitle: { fontSize: 13.5, fontWeight: '600' },
  rowSubtitle: { fontSize: 10.5, marginTop: 2 },
  sectionLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, marginTop: 16, marginBottom: 10 },
  errorText: { fontSize: 12, marginTop: 8 },
  continueButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 'auto' },
  continueButtonText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
});
