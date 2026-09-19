import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView, Linking } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'StorageSettings'>;

type StorageMode = 'lokal' | 'nas' | 'eigene_cloud' | 'drittanbieter_cloud';

interface Preferences {
  storage_mode: StorageMode;
  drittanbieter_provider: string | null;
}

const STORAGE_OPTIONS: { key: StorageMode; title: string; subtitle: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
  { key: 'lokal', title: 'sonstiges.speicherNurLokal', subtitle: 'sonstiges.speicherNurLokalText', icon: 'folder-outline' },
  { key: 'nas', title: 'NAS', subtitle: 'Deine Rezepte, deine Daten – nur für die Anmeldung wird unser Server kontaktiert.', icon: 'nas' },
  { key: 'eigene_cloud', title: 'Eigene Cloud', subtitle: 'sonstiges.speicherEigeneCloudText', icon: 'cloud-outline' },
];

const CLOUD_PROVIDER_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  google_drive: 'google-drive',
  onedrive: 'microsoft-onedrive',
  dropbox: 'dropbox',
};

const CLOUD_PROVIDERS: { key: string; apiPrefix: string; title: string; subtitle: string }[] = [
  { key: 'google_drive', apiPrefix: '/google-auth', title: 'Google Drive', subtitle: 'sonstiges.speicherDriveText' },
  { key: 'onedrive', apiPrefix: '/onedrive-auth', title: 'OneDrive', subtitle: 'sonstiges.speicherOneDriveText' },
  { key: 'dropbox', apiPrefix: '/dropbox-auth', title: 'Dropbox', subtitle: 'sonstiges.speicherDropboxText' },
];

/**
 * Eigener Screen fuer die Speicherort-Auswahl - war urspruenglich Teil des
 * Profil-Screens ganz oben, jetzt ausgelagert und im Profil nur noch ueber
 * einen Link (weiter unten, nach den uebrigen Einstellungen) erreichbar.
 */
export default function StorageSettingsScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { t } = useUebersetzung();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<'storage_mode' | 'drittanbieter_provider' | null>(null);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);

  const loadPrefs = () => {
    api
      .get<Preferences>('/preferences/')
      .then(setPrefs)
      .catch((err) => setError(err instanceof ApiError ? err.detail : t('profil.einstellungenNichtGeladen')));
  };

  useEffect(() => {
    loadPrefs();
    const unsubscribe = navigation.addListener('focus', loadPrefs);
    return unsubscribe;
  }, [navigation]);

  const handleConnectProvider = async (providerKey: string, apiPrefix: string) => {
    setConnectingProvider(providerKey);
    try {
      const { authorize_url } = await api.get<{ authorize_url: string }>(`${apiPrefix}/connect`);
      await Linking.openURL(authorize_url);
    } catch (err) {
      Alert.alert(t('sonstiges.verbindenFehlgeschlagen'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
    } finally {
      setConnectingProvider(null);
    }
  };

  const handleReactivateProvider = async (providerKey: string) => {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, storage_mode: 'drittanbieter_cloud', drittanbieter_provider: providerKey });
    setSavingKey('drittanbieter_provider');
    try {
      const updated = await api.patch<Preferences>('/preferences/', { drittanbieter_provider: providerKey });
      setPrefs(updated);
    } catch (err) {
      setPrefs(previous);
      Alert.alert(t('sonstiges.reaktivierenFehlgeschlagen'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
    } finally {
      setSavingKey(null);
    }
  };

  const handleDisconnectProvider = async (apiPrefix: string) => {
    try {
      await api.post(`${apiPrefix}/disconnect`);
      loadPrefs();
    } catch (err) {
      Alert.alert(t('sonstiges.trennenFehlgeschlagen'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
    }
  };

  const handleStorageSelect = async (mode: StorageMode) => {
    if (!prefs || prefs.storage_mode === mode) return;
    const previous = prefs;
    setPrefs({ ...prefs, storage_mode: mode });
    setSavingKey('storage_mode');
    try {
      const updated = await api.patch<Preferences>('/preferences/', { storage_mode: mode });
      setPrefs(updated);
    } catch (err) {
      setPrefs(previous);
      Alert.alert(t('profil.nichtGespeichert'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
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
        const hasTokens = prefs.drittanbieter_provider === p.key;
        const isActive = prefs.storage_mode === 'drittanbieter_cloud' && hasTokens;
        return (
          <Pressable
            key={p.key}
            onPress={() => {
              if (isActive) return;
              if (hasTokens) {
                handleReactivateProvider(p.key);
              } else {
                handleConnectProvider(p.key, p.apiPrefix);
              }
            }}
            disabled={connectingProvider !== null || savingKey === 'drittanbieter_provider'}
            style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, opacity: connectingProvider && connectingProvider !== p.key ? 0.5 : 1 }]}
          >
            <MaterialCommunityIcons
              name={CLOUD_PROVIDER_ICONS[p.key]}
              size={20}
              color={isActive ? '#16A34A' : colors.muted}
              style={styles.rowIcon}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: isActive ? '#16A34A' : colors.text }]}>
                {isActive ? `${p.title} ✓ verbunden` : hasTokens ? `${p.title} (verbunden, nicht aktiv)` : p.title}
              </Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{p.subtitle}</Text>
              {hasTokens && (
                <Pressable onPress={() => handleDisconnectProvider(p.apiPrefix)} hitSlop={8} style={{ marginTop: 6, alignSelf: 'flex-start' }}>
                  <Text style={{ color: '#DC2626', fontSize: 11.5, fontWeight: '700' }}>{t('sonstiges.trennen')}</Text>
                </Pressable>
              )}
            </View>
            {connectingProvider === p.key || (savingKey === 'drittanbieter_provider' && hasTokens && !isActive) ? (
              <ActivityIndicator color={colors.muted} />
            ) : (
              <MaterialCommunityIcons
                name={isActive ? 'radiobox-marked' : 'radiobox-blank'}
                size={22}
                color={isActive ? '#16A34A' : colors.muted}
              />
            )}
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8 },
  rowIcon: { marginRight: 12 },
  rowTitle: { fontSize: 13.5, fontWeight: '600' },
  rowSubtitle: { fontSize: 10.5, marginTop: 2 },
});
