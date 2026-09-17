import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView, TextInput } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme, type BackgroundStyle, type AccentColor } from '../theme/ThemeContext';
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
  drittanbieter_provider: string | null;
  default_servings: number;
  display_name: string | null;
  household_role: string | null;
}

type PreferenceKey = 'show_brutzel' | 'large_text' | 'auto_read_steps' | 'server_sync_enabled';

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

const ACCENT_OPTIONS: { key: AccentColor; title: string; color: string }[] = [
  { key: 'orange', title: 'Orange', color: '#EA580C' },
  { key: 'gruen', title: 'Grün', color: '#16A34A' },
  { key: 'tuerkis', title: 'Türkis', color: '#0D9488' },
  { key: 'pink', title: 'Pink', color: '#DB2777' },
  { key: 'gelb', title: 'Gelb', color: '#EAB308' },
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
  const [savingKey, setSavingKey] = useState<PreferenceKey | 'default_hauben_level' | 'default_servings' | 'display_name' | null>(null);

  const loadPrefs = () => {
    api
      .get<Preferences>('/preferences/')
      .then(setPrefs)
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Einstellungen konnten nicht geladen werden'));
  };

  useEffect(() => {
    loadPrefs();
    // Bei Rueckkehr aus dem System-Browser (nach der Anbieter-Anmeldung) ist
    // die App noch dieselbe Instanz, nur der Fokus wechselt zurueck - hier
    // neu laden, damit "Verbunden" ohne manuelles Neuladen erscheint.
    const unsubscribe = navigation.addListener('focus', loadPrefs);
    return unsubscribe;
  }, [navigation]);

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

  const [servingsInput, setServingsInput] = useState('');
  useEffect(() => {
    if (prefs) setServingsInput(String(prefs.default_servings));
  }, [prefs?.default_servings]);

  const handleSaveDefaultServings = async () => {
    if (!prefs) return;
    const value = Number(servingsInput);
    if (!value || value < 1 || value > 20) {
      Alert.alert('Ungültiger Wert', 'Bitte eine Zahl zwischen 1 und 20 eingeben.');
      setServingsInput(String(prefs.default_servings));
      return;
    }
    if (value === prefs.default_servings) return;
    const previous = prefs;
    setPrefs({ ...prefs, default_servings: value });
    setSavingKey('default_servings');
    try {
      const updated = await api.patch<Preferences>('/preferences/', { default_servings: value });
      setPrefs(updated);
    } catch (err) {
      setPrefs(previous);
      setServingsInput(String(previous.default_servings));
      Alert.alert('Konnte nicht gespeichert werden', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setSavingKey(null);
    }
  };

  const [nameInput, setNameInput] = useState('');
  useEffect(() => {
    if (prefs) setNameInput(prefs.display_name ?? '');
  }, [prefs?.display_name]);

  const handleSaveDisplayName = async () => {
    if (!prefs) return;
    const trimmed = nameInput.trim();
    if (!trimmed) {
      Alert.alert('Name fehlt', 'Bitte einen Namen eingeben.');
      setNameInput(prefs.display_name ?? '');
      return;
    }
    if (trimmed === prefs.display_name) return;
    const previous = prefs;
    setPrefs({ ...prefs, display_name: trimmed });
    setSavingKey('display_name');
    try {
      const updated = await api.patch<Preferences>('/preferences/', { display_name: trimmed });
      setPrefs(updated);
    } catch (err) {
      setPrefs(previous);
      setNameInput(previous.display_name ?? '');
      Alert.alert('Konnte nicht gespeichert werden', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setSavingKey(null);
    }
  };

  const [isGeneratingStarterImages, setIsGeneratingStarterImages] = useState(false);
  const handleGenerateStarterImages = async () => {
    setIsGeneratingStarterImages(true);
    try {
      const result = await api.post<{ generated: string[]; failed: string[]; remaining_without_image: number }>(
        '/onboarding/generate-starter-images',
        { limit: 10 },
      );
      Alert.alert(
        'Erledigt',
        `${result.generated.length} Titelbilder generiert${result.failed.length > 0 ? `, ${result.failed.length} fehlgeschlagen` : ''}.\n` +
          `Noch ohne Bild: ${result.remaining_without_image}.`,
      );
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Bildgenerierung fehlgeschlagen');
    } finally {
      setIsGeneratingStarterImages(false);
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
      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 4 }]}>NAME</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <TextInput
          style={[
            { flex: 1, height: 44, paddingHorizontal: 14, fontSize: 15, backgroundColor: colors.card, color: colors.text },
            { borderRadius: radius.md },
          ]}
          value={nameInput}
          onChangeText={setNameInput}
          onBlur={handleSaveDisplayName}
          onSubmitEditing={handleSaveDisplayName}
          placeholder="Dein Name"
          placeholderTextColor={colors.muted}
        />
        {savingKey === 'display_name' && <ActivityIndicator color={colors.muted} size="small" />}
      </View>
      {prefs.household_role && (
        <View style={[styles.adminBadge, { backgroundColor: prefs.household_role === 'owner' ? gradient[0] : colors.card, borderRadius: radius.sm }]}>
          <MaterialCommunityIcons
            name={prefs.household_role === 'owner' ? 'shield-crown-outline' : 'account-outline'}
            size={13}
            color={prefs.household_role === 'owner' ? '#fff' : colors.muted}
          />
          <Text style={{ color: prefs.household_role === 'owner' ? '#fff' : colors.muted, fontSize: 11.5, fontWeight: '700', marginLeft: 5 }}>
            {prefs.household_role === 'owner' ? 'Admin (Haushalt-Ersteller)' : 'Mitglied'}
          </Text>
        </View>
      )}

      <Pressable
        onPress={() => navigation.getParent()?.navigate('Household')}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, marginTop: 16 }]}
      >
        <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>Haushalt</Text>
        <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>
      </Pressable>

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

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 12 }]}>STANDARD-PORTIONENZAHL</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <TextInput
          style={[
            { width: 70, height: 40, paddingHorizontal: 12, fontSize: 14, backgroundColor: colors.card, color: colors.text },
            { borderRadius: radius.sm },
          ]}
          keyboardType="numeric"
          value={servingsInput}
          onChangeText={setServingsInput}
          onBlur={handleSaveDefaultServings}
          onSubmitEditing={handleSaveDefaultServings}
        />
        {savingKey === 'default_servings' && <ActivityIndicator color={colors.muted} size="small" />}
      </View>
      <Text style={[styles.hint, { color: colors.muted, marginBottom: 8 }]}>
        Wird bei neuen Rezepten und im Wochenplan vorgeschlagen, kann jederzeit angepasst werden.
      </Text>

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 12 }]}>AKZENTFARBE</Text>
      <View style={styles.chipsRow}>
        {ACCENT_OPTIONS.map((option) => {
          const isSelected = theme.accent === option.key;
          return (
            <Pressable
              key={option.key}
              onPress={() => setTheme({ accent: option.key })}
              style={[
                styles.chip,
                { backgroundColor: isSelected ? option.color : colors.card, borderRadius: radius.sm },
              ]}
            >
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: isSelected ? '#fff' : option.color, marginRight: 7 }} />
              <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>{option.title}</Text>
            </Pressable>
          );
        })}
      </View>

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
        onPress={() => navigation.navigate('StorageSettings')}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, marginTop: 20 }]}
      >
        <MaterialCommunityIcons name="cloud-outline" size={20} color={colors.muted} style={styles.rowIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Speicherort</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            Lokal, NAS, eigene Cloud oder Google Drive/OneDrive/Dropbox
          </Text>
        </View>
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

      <Pressable
        onPress={handleGenerateStarterImages}
        disabled={isGeneratingStarterImages}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, marginTop: 8, opacity: isGeneratingStarterImages ? 0.7 : 1 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>Starter-Bilder generieren (nächste 10)</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            Dauert etwas, läuft in kleinen Portionen - mehrfach antippen für weitere 10
          </Text>
        </View>
        {isGeneratingStarterImages ? <ActivityIndicator color={colors.muted} size="small" /> : <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>}
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
  adminBadge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6 },
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
