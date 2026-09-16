import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { MainTabParamList, MainStackParamList } from '../navigation/AppNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Profil'>,
  NativeStackScreenProps<MainStackParamList>
>;

type StorageMode = 'lokal' | 'nas' | 'eigene_cloud' | 'drittanbieter_cloud';

interface Preferences {
  show_brutzel: boolean;
  large_text: boolean;
  auto_read_steps: boolean;
  server_sync_enabled: boolean;
  storage_mode: StorageMode;
}

type PreferenceKey = 'show_brutzel' | 'large_text' | 'auto_read_steps' | 'server_sync_enabled';

const STORAGE_OPTIONS: { key: StorageMode; title: string; subtitle: string }[] = [
  { key: 'lokal', title: 'Lokal', subtitle: 'Nur auf diesem Gerät, kein Server' },
  { key: 'nas', title: 'NAS', subtitle: 'Deine Rezepte, deine Daten – keine Cloud-Anbindung, nur für die Anmeldung wird unser Server kontaktiert' },
  { key: 'eigene_cloud', title: 'Eigene Cloud', subtitle: 'Unsere Server-Infrastruktur (EU)' },
  { key: 'drittanbieter_cloud', title: 'Drittanbieter-Cloud', subtitle: 'Google Drive, OneDrive, Dropbox' },
];

const ROWS: { key: PreferenceKey; title: string; subtitle: string; lockedWhen?: (p: Preferences) => boolean }[] = [
  { key: 'show_brutzel', title: 'Brutzel anzeigen', subtitle: 'Tipps & Begrüßungen im Kochbuch' },
  { key: 'large_text', title: 'Große Schrift', subtitle: 'Größerer Text in der ganzen App' },
  { key: 'auto_read_steps', title: 'Schritte automatisch vorlesen', subtitle: 'Praktisch bei schmutzigen Händen' },
  {
    key: 'server_sync_enabled',
    title: 'Server-Sync',
    subtitle: 'Nötig für den Community-Pool',
  },
];

export default function ProfileScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { signOut } = useAuth();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<PreferenceKey | 'storage_mode' | null>(null);

  useEffect(() => {
    api
      .get<Preferences>('/preferences/')
      .then(setPrefs)
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Einstellungen konnten nicht geladen werden'));
  }, []);

  const handleToggle = async (key: PreferenceKey, value: boolean) => {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setSavingKey(key);
    try {
      const updated = await api.patch<Preferences>('/preferences/', { [key]: value });
      setPrefs(updated);
    } catch (err) {
      setPrefs(previous);
      Alert.alert('Konnte nicht gespeichert werden', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setSavingKey(null);
    }
  };

  const handleStorageSelect = async (mode: StorageMode) => {
    if (!prefs || prefs.storage_mode === mode) return;
    const previous = prefs;
    setPrefs({ ...prefs, storage_mode: mode, server_sync_enabled: mode === 'eigene_cloud' ? true : prefs.server_sync_enabled });
    setSavingKey('storage_mode');
    try {
      const updated = await api.patch<Preferences>('/preferences/', { storage_mode: mode });
      setPrefs(updated);
    } catch (err) {
      setPrefs(previous);
      Alert.alert('Konnte nicht gespeichert werden', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setSavingKey(null);
    }
  };

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Text style={{ color: '#DC2626', fontSize: 13 }}>{error}</Text>
      </View>
    );
  }

  if (!prefs) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
      <Text style={[styles.sectionLabel, { color: colors.muted }]}>SPEICHER</Text>

      {STORAGE_OPTIONS.map((option) => {
        const isSelected = prefs.storage_mode === option.key;
        return (
          <Pressable
            key={option.key}
            onPress={() => handleStorageSelect(option.key)}
            style={[
              styles.row,
              {
                backgroundColor: colors.card,
                borderRadius: radius.md,
                borderWidth: isSelected ? 1.5 : 0,
                borderColor: gradient[0],
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{option.title}</Text>
              <Text style={[styles.rowSubtitle, { color: isSelected && option.key === 'nas' ? gradient[0] : colors.muted }]}>
                {option.subtitle}
              </Text>
            </View>
            {savingKey === 'storage_mode' && isSelected ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              isSelected && <Text style={{ color: gradient[0], fontSize: 18 }}>✓</Text>
            )}
          </Pressable>
        );
      })}

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 20 }]}>DARSTELLUNG &amp; BEDIENUNG</Text>

      {ROWS.map((row) => {
        const isServerSyncLocked = row.key === 'server_sync_enabled' && prefs.storage_mode === 'eigene_cloud';
        return (
          <View key={row.key} style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{row.title}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
                {isServerSyncLocked ? 'Bei "Eigene Cloud" automatisch aktiv' : row.subtitle}
              </Text>
            </View>
            {savingKey === row.key ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              <Switch
                value={prefs[row.key]}
                onValueChange={(value) => handleToggle(row.key, value)}
                disabled={isServerSyncLocked}
                trackColor={{ false: '#E7E1D4', true: gradient[0] }}
                thumbColor="#fff"
              />
            )}
          </View>
        );
      })}

      {!prefs.server_sync_enabled && (
        <Text style={[styles.hint, { color: colors.muted }]}>
          Ohne Server-Sync bleibt "Lokal" komplett privat – dafür ist der Community-Pool nicht nutzbar.
        </Text>
      )}

      <Pressable
        onPress={() => navigation.getParent()?.navigate('Household')}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, marginTop: 20 }]}
      >
        <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>Haushalt</Text>
        <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>
      </Pressable>

      <Pressable
        onPress={() => navigation.getParent()?.navigate('Onboarding')}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, marginTop: 8 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Starter-Rezepte importieren</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            Bereits importierte werden übersprungen, keine Duplikate
          </Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>
      </Pressable>

      <Pressable onPress={() => signOut()} style={[styles.signOutButton, { borderColor: '#DC2626', borderRadius: radius.md }]}>
        <Text style={styles.signOutText}>Abmelden</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8 },
  rowTitle: { fontSize: 13.5, fontWeight: '600' },
  rowSubtitle: { fontSize: 10.5, marginTop: 2 },
  hint: { fontSize: 10.5, lineHeight: 15, marginTop: 6, marginBottom: 20 },
  signOutButton: { height: 46, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  signOutText: { color: '#DC2626', fontWeight: '600', fontSize: 14 },
});
