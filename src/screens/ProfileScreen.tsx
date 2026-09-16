import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView, Linking } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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

const STORAGE_OPTIONS: { key: StorageMode; title: string; subtitle: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: 'lokal', title: 'Nur lokal', subtitle: 'Verbleibt ausschließlich auf diesem Gerät.', icon: 'folder-outline' },
  { key: 'nas', title: 'NAS', subtitle: 'Deine Rezepte, deine Daten – nur für die Anmeldung wird unser Server kontaktiert.', icon: 'nas' },
  { key: 'eigene_cloud', title: 'Eigene Cloud', subtitle: 'Unsere Server-Infrastruktur (EU).', icon: 'cloud-outline' },
];

const CLOUD_PROVIDER_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  google_drive: 'google-drive',
  onedrive: 'microsoft-onedrive',
  dropbox: 'dropbox',
};

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

const CLOUD_PROVIDERS: { key: string; apiPrefix: string; title: string; subtitle: string }[] = [
  { key: 'google_drive', apiPrefix: '/google-auth', title: 'Google Drive', subtitle: 'Im eigenen Google Drive unter "MeinKochbuch".' },
  { key: 'onedrive', apiPrefix: '/onedrive-auth', title: 'OneDrive', subtitle: 'Im eigenen OneDrive unter "MeinKochbuch".' },
  { key: 'dropbox', apiPrefix: '/dropbox-auth', title: 'Dropbox', subtitle: 'In der eigenen Dropbox unter "MeinKochbuch".' },
];

interface ProviderStatus {
  configured: boolean;
  connected: boolean;
  provider: string | null;
}

export default function ProfileScreen({ navigation }: Props) {
  const { colors, gradient, radius, theme, setTheme } = useTheme();
  const { signOut } = useAuth();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<PreferenceKey | 'storage_mode' | 'default_hauben_level' | null>(null);
  // Nur EIN Anbieter kann gleichzeitig aktiv sein (Backend garantiert das
  // beim Verbinden, siehe google_auth.py) - ein einzelner Status genuegt,
  // 'provider' darin sagt, welcher der drei es gerade ist.
  const [activeProviderStatus, setActiveProviderStatus] = useState<ProviderStatus | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const loadPrefs = () => {
    api
      .get<Preferences>('/preferences/')
      .then(setPrefs)
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Einstellungen konnten nicht geladen werden'));
  };

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadDriveStatus = () => {
    // Irgendeinen der drei Status-Endpunkte abfragen reicht - alle drei
    // liefern dasselbe 'provider'-Feld (welcher Anbieter gerade aktiv ist).
    api
      .get<ProviderStatus>('/google-auth/status')
      .then(setActiveProviderStatus)
      .catch(() => {
        // Status konnte nicht geladen werden - Verbinden-Buttons bleiben
        // dann einfach ausgeblendet, kein Grund den restlichen Screen zu blockieren
      });
  };

  useEffect(() => {
    loadDriveStatus();
    // Bei Rueckkehr aus dem System-Browser (nach der Anbieter-Anmeldung) ist
    // die App noch dieselbe Instanz, nur der Fokus wechselt zurueck - hier
    // den Status neu abfragen, damit "Verbunden" ohne manuelles Neuladen erscheint.
    const unsubscribe = navigation.addListener('focus', () => {
      loadDriveStatus();
      loadPrefs();
    });
    return unsubscribe;
  }, [navigation]);

  const handleConnectProvider = async (providerKey: string, apiPrefix: string) => {
    setConnectingProvider(providerKey);
    try {
      const { authorize_url } = await api.get<{ authorize_url: string }>(`${apiPrefix}/connect`);
      // BEWUSST der System-Browser (Linking.openURL), nicht unser eigener
      // WebBrowseScreen: alle drei Anbieter verbieten OAuth-Logins in
      // eingebetteten WebViews aus Sicherheitsgruenden.
      await Linking.openURL(authorize_url);
    } catch (err) {
      Alert.alert('Verbinden fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleDisconnectProvider = async (apiPrefix: string) => {
    try {
      await api.post(`${apiPrefix}/disconnect`);
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
            style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}
          >
            <MaterialCommunityIcons name={option.icon} size={20} color={colors.muted} style={styles.rowIcon} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{option.title}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{option.subtitle}</Text>
            </View>
            {savingKey === 'storage_mode' && isSelected ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              <MaterialCommunityIcons
                name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                size={22}
                color={isSelected ? gradient[0] : colors.muted}
              />
            )}
          </Pressable>
        );
      })}

      {CLOUD_PROVIDERS.map((p) => {
        const isConnectedHere = prefs.storage_mode === 'drittanbieter_cloud' && activeProviderStatus?.provider === p.key;
        return (
          <Pressable
            key={p.key}
            onPress={() => {
              if (isConnectedHere) return; // Verbunden -> nichts tun, Trennen ist der eigene Link unten
              handleConnectProvider(p.key, p.apiPrefix);
            }}
            disabled={connectingProvider !== null}
            style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, opacity: connectingProvider && connectingProvider !== p.key ? 0.5 : 1 }]}
          >
            <MaterialCommunityIcons
              name={CLOUD_PROVIDER_ICONS[p.key]}
              size={20}
              color={isConnectedHere ? '#16A34A' : colors.muted}
              style={styles.rowIcon}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: isConnectedHere ? '#16A34A' : colors.text }]}>
                {isConnectedHere ? `${p.title} ✓ verbunden` : p.title}
              </Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{p.subtitle}</Text>
              {isConnectedHere && (
                <Pressable onPress={() => handleDisconnectProvider(p.apiPrefix)} hitSlop={8} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                  <Text style={{ color: '#DC2626', fontSize: 11.5, fontWeight: '700' }}>Trennen</Text>
                </Pressable>
              )}
            </View>
            {connectingProvider === p.key ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              <MaterialCommunityIcons
                name={isConnectedHere ? 'radiobox-marked' : 'radiobox-blank'}
                size={22}
                color={isConnectedHere ? '#16A34A' : colors.muted}
              />
            )}
          </Pressable>
        );
      })}

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
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8 },
  rowIcon: { marginRight: 12 },
  rowTitle: { fontSize: 13.5, fontWeight: '600' },
  rowSubtitle: { fontSize: 10.5, marginTop: 2 },
  hint: { fontSize: 10.5, lineHeight: 15, marginTop: 6, marginBottom: 20 },
  signOutButton: { height: 46, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  signOutText: { color: '#DC2626', fontWeight: '600', fontSize: 14 },
});
