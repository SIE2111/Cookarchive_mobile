import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'Onboarding'>;

const PACK_SIZES = [
  { size: 50, label: '50 Rezepte', sublabel: 'Vollständig verfügbar' },
  { size: 100, label: '100 Rezepte', sublabel: 'Noch nicht vollständig befüllt' },
] as const;

export default function OnboardingScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { clearJustRegistered } = useAuth();
  const [createFolders, setCreateFolders] = useState(true);
  const [selectedPackSize, setSelectedPackSize] = useState<number | null>(50);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await api.post('/onboarding/setup', {
        create_standard_folders: createFolders,
        starter_pack_size: selectedPackSize,
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
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>Vorspeisen, Hauptgerichte, Backen, Vegan, Getränke</Text>
        </View>
        <Switch value={createFolders} onValueChange={setCreateFolders} trackColor={{ false: '#E7E1D4', true: gradient[0] }} thumbColor="#fff" />
      </View>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>STARTER-REZEPTE IMPORTIEREN</Text>

      {PACK_SIZES.map((pack) => {
        const isSelected = selectedPackSize === pack.size;
        return (
          <Pressable
            key={pack.size}
            onPress={() => setSelectedPackSize(pack.size)}
            style={[
              styles.row,
              { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: isSelected ? 1.5 : 0, borderColor: gradient[0] },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{pack.label}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{pack.sublabel}</Text>
            </View>
            {isSelected && <Text style={{ color: gradient[0], fontSize: 18 }}>✓</Text>}
          </Pressable>
        );
      })}

      <Pressable
        onPress={() => setSelectedPackSize(null)}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: selectedPackSize === null ? 1.5 : 0, borderColor: gradient[0] }]}
      >
        <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>Keine Starter-Rezepte importieren</Text>
        {selectedPackSize === null && <Text style={{ color: gradient[0], fontSize: 18 }}>✓</Text>}
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
