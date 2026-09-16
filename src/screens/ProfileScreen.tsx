import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView, Linking } from 'react-native';
import { useTheme, type BackgroundStyle } from '../theme/ThemeContext';
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
type HaubenLevel = 'anfaenger' | 'fortgeschritten' | 'profi';

interface Preferences {
  show_brutzel: boolean;
  large_text: boolean;
  auto_read_steps: boolean;
  server_sync_enabled: boolean;
  storage_mode: StorageMode;
  default_hauben_level: HaubenLevel;
}

type PreferenceKey = 'show_brutzel' | 'large_text' | 'auto_read_steps' | 'server_sync_enabled';

const STORAGE_OPTIONS: { key: StorageMode; title: string; subtitle: string }[] = [
  { key: 'lokal', title: 'Lokal', subtitle: 'Nur auf diesem Gerät, kein Server' },
  { key: 'nas', title: 'NAS', subtitle: 'Deine Rezepte, deine Daten – keine Cloud-Anbindung, nur für die Anmeldung wird unser Server kontaktiert' },
  { key: 'eigene_cloud', title: 'Eigene Cloud', subtitle: 'Unsere Server-Infrastruktur (EU)' },
  { key: 'drittanbieter_cloud', title: 'Drittanbieter-Cloud', subtitle: 'Google Drive, OneDrive, Dropbox' },
];

const HAUBEN_OPTIONS: { key: HaubenLevel; title: string; hats: number }[] = [
  { key: 'anfaenger', title: 'Anfänger', hats: 1 },
  { key: 'fortgeschritten', title: 'Fortgeschritten', hats: 2 },
  { key: 'profi', title: 'Profi', hats: 3 },
];

const BACKGROUND_OPTIONS: { key: BackgroundStyle; title: string }[] = [
  { key: 'warm-hell', title: 'Hell (warm)' },
  { key: 'kuehl-hell', title: 'Hell (kühl)' },
  { key: 'dunkel', title: 'Dunkel' },
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
  const { colors, gradient, radius, theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<PreferenceKey | 'storage_mode' | 'default_hauben_level' | null>(null);
  const [driveStatus, setDriveStatus] = useState<{ configured: boolean; connected: boolean; provider: string | null } | null>(null);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);

  useEffect(() => {
    api
      .get<Preferences>('/preferences/')
      .then(setPrefs)
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Einstellungen konnten nicht geladen werden'));
  }, []);

  const loadDriveStatus = () => {
    api
      .get<{ configured: boolean; connected: boolean; provider: string | null }>('/google-auth/status')
      .then(setDriveStatus)
      .catch(() => {
        // Status konnte nicht geladen werden - Verbinden-Button bleibt dann
        // einfach ausgeblendet, kein Grund den restlichen Screen zu blockieren
      });
  };

  useEffect(() => {
    loadDriveStatus();
    // Bei Rueckkehr aus dem System-Browser (nach Google-Anmeldung) ist die
    // App noch dieselbe Instanz, nur der Fokus wechselt zurueck - hier den
    // Status neu abfragen, damit "Verbunden" ohne manuelles Neuladen erscheint.
    const unsubscribe = navigation.addListener('focus', loadDriveStatus);
    return unsubscribe;
  }, [navigation]);

  const handleConnectGoogleDrive = async () => {
    setIsConnectingDrive(true);
    try {
      const { authorize_url } = await api.get<{ authorize_url: string }>('/google-auth/connect');
      // BEWUSST der System-Browser (Linking.openURL), nicht unser eigener
      // WebBrowseScreen: Google verbietet OAuth-Logins in eingebetteten
      // WebViews aus Sicherheitsgruenden (Antwort waere "disallowed_useragent").
      await Linking.openURL(authorize_url);
    } catch (err) {
      Alert.alert('Verbinden fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleDisconnectGoogleDrive = async () => {
    try {
      await api.post('/google-auth/disconnect');
      loadDriveStatus();
    } catch (err) {
      Alert.alert('Trennen fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    }
  };

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

  const handleHaubenLevelSelect = async (level: HaubenLevel) => {
    if (!prefs || prefs.default_hauben_level === level) return;
    const previous = prefs;
    setPrefs({ ...prefs, default_hauben_level: level });
    setSavingKey('default_hauben_level');
    try {
      const updated = await api.patch<Preferences>('/preferences/', { default_hauben_level: level });
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

      {prefs.storage_mode === 'drittanbieter_cloud' && (
        <View style={[styles.driveBox, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          {!driveStatus ? (
            <ActivityIndicator color={colors.muted} />
          ) : !driveStatus.configured ? (
            <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
              Drittanbieter-Anbindung ist serverseitig noch nicht konfiguriert.
            </Text>
          ) : driveStatus.connected ? (
            <>
              <Text style={[styles.rowTitle, { color: colors.text }]}>
                ✅ Google Drive verbunden
              </Text>
              <Pressable onPress={handleDisconnectGoogleDrive} style={{ marginTop: 10 }}>
                <Text style={{ color: '#DC2626', fontSize: 12.5, fontWeight: '600' }}>Verbindung trennen</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.rowTitle, { color: colors.text }]}>Noch kein Anbieter verbunden</Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted, marginBottom: 10 }]}>
                Öffnet den Browser zur Anmeldung, danach zurück zur App wechseln.
              </Text>
              <Pressable
                onPress={handleConnectGoogleDrive}
                disabled={isConnectingDrive}
                style={[styles.connectButton, { backgroundColor: gradient[0], borderRadius: radius.sm, opacity: isConnectingDrive ? 0.7 : 1 }]}
              >
                {isConnectingDrive ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.connectButtonText}>Mit Google Drive verbinden</Text>
                )}
              </Pressable>
            </>
          )}
        </View>
      )}

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 20 }]}>STANDARD-STUFE IM KOCH-MODUS</Text>
      <View style={styles.chipsRow}>
        {HAUBEN_OPTIONS.map((option) => {
          const isSelected = prefs.default_hauben_level === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => handleHaubenLevelSelect(option.key)}
              style={[
                styles.chip,
                { backgroundColor: isSelected ? gradient[0] : colors.card, borderRadius: radius.sm },
              ]}
            >
              {savingKey === 'default_hauben_level' && isSelected ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  {Array.from({ length: option.hats }).map((_, i) => (
                    <Text key={i} style={{ fontSize: 12 }}>👨‍🍳</Text>
                  ))}
                  <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 12, fontWeight: '600', marginLeft: 4 }}>
                    {option.title}
                  </Text>
                </>
              )}
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: colors.muted, marginBottom: 8 }]}>
        Wird beim Start des Koch-Modus vorausgewählt, kannst du dort jederzeit ändern.
      </Text>

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 12 }]}>DARSTELLUNG (HELL/DUNKEL)</Text>
      <View style={styles.chipsRow}>
        {BACKGROUND_OPTIONS.map((option) => {
          const isSelected = theme.background === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => setTheme({ background: option.key })}
              style={[
                styles.chip,
                { backgroundColor: isSelected ? gradient[0] : colors.card, borderRadius: radius.sm },
              ]}
            >
              <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>
                {option.title}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 },
  chip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 9 },
  driveBox: { padding: 14, marginTop: 10 },
  connectButton: { paddingVertical: 11, alignItems: 'center' },
  connectButtonText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8 },
  rowTitle: { fontSize: 13.5, fontWeight: '600' },
  rowSubtitle: { fontSize: 10.5, marginTop: 2 },
  hint: { fontSize: 10.5, lineHeight: 15, marginTop: 6, marginBottom: 20 },
  signOutButton: { height: 46, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  signOutText: { color: '#DC2626', fontWeight: '600', fontSize: 14 },
});
