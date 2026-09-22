import React, { useEffect, useState } from 'react';
import { View, Text, Switch, Pressable, StyleSheet, ActivityIndicator, Alert, ScrollView, TextInput, Modal, Linking } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme, type BackgroundStyle, type AccentColor } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { useAuth } from '../context/AuthContext';
import { useServerSync } from '../context/ServerSyncContext';
import { api, ApiError } from '../api/client';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { MainTabParamList, MainStackParamList } from '../navigation/AppNavigator';
import { useLayout } from '../utils/layout';

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
  show_greeting_animation: boolean;
  storage_mode: StorageMode;
  default_hauben_level: HaubenLevel;
  drittanbieter_provider: string | null;
  default_servings: number;
  display_name: string | null;
  household_role: string | null;
  notifications_enabled: boolean;
  ai_enabled: boolean;
  ai_calls_this_month: number;
  ai_monthly_limit: number;
}

type PreferenceKey = 'show_brutzel' | 'large_text' | 'auto_read_steps' | 'server_sync_enabled' | 'show_greeting_animation' | 'notifications_enabled' | 'ai_enabled';

// Kurzbezeichnungen der Speicherorte fuer die Profil-Zeile. Bewusst nur
// die Modi - welcher Drittanbieter verbunden ist, steht im Speicherort-
// Screen selbst; hier wuerde es die Zeile ueberfrachten.
const HILFE_URL = 'https://www.homearchive.at/meinkochbuch/hilfe';
const AGB_URL = 'https://www.homearchive.at/meinkochbuch/agb';
const DATENSCHUTZ_URL = 'https://www.homearchive.at/meinkochbuch/datenschutz';

// Schluessel statt fertiger Texte: Die Tabellen stehen auf Modulebene und
// werden einmal beim Laden ausgewertet - ein dort eingesetzter Text waere
// fuer immer in der Sprache des ersten Starts.
const STORAGE_MODE_LABELS: Record<string, string> = {
  lokal: 'profil.speicherLokal',
  nas: 'profil.speicherNas',
  eigene_cloud: 'profil.speicherEigeneCloud',
  drittanbieter_cloud: 'profil.speicherDrittanbieter',
};

const HAUBEN_OPTIONS: { key: HaubenLevel; title: string; hats: number }[] = [
  { key: 'anfaenger', title: 'profil.haubenAnfaenger', hats: 1 },
  { key: 'fortgeschritten', title: 'profil.haubenFortgeschritten', hats: 2 },
  { key: 'profi', title: 'profil.haubenProfi', hats: 3 },
];

const BACKGROUND_OPTIONS: { key: BackgroundStyle; title: string }[] = [
  { key: 'warm-hell', title: 'profil.hintergrundWarm' },
  { key: 'kuehl-hell', title: 'profil.hintergrundKuehl' },
  { key: 'dunkel', title: 'profil.hintergrundDunkel' },
];

const ACCENT_OPTIONS: { key: AccentColor; title: string; color: string }[] = [
  { key: 'orange', title: 'profil.farbeOrange', color: '#EA580C' },
  { key: 'gruen', title: 'profil.farbeGruen', color: '#16A34A' },
  { key: 'tuerkis', title: 'profil.farbeTuerkis', color: '#0D9488' },
  { key: 'pink', title: 'profil.farbePink', color: '#DB2777' },
  { key: 'gelb', title: 'profil.farbeGelb', color: '#EAB308' },
];

const ROWS: { key: PreferenceKey; title: string; subtitle: string; lockedWhen?: (p: Preferences) => boolean }[] = [
  { key: 'show_brutzel', title: 'profil.brutzelAnzeigen', subtitle: 'profil.brutzelAnzeigenSub' },
  { key: 'large_text', title: 'profil.grosseSchrift', subtitle: 'profil.grosseSchriftSub' },
  // 'auto_read_steps' steht bewusst NICHT mehr hier, sondern im
  // Unterschirm 'Vorlesen & Stimme' - zusammen mit der Stimmenauswahl,
  // zu der er gehoert. An zwei Stellen derselbe Schalter waere eine
  // Einladung, dass einer davon irgendwann nicht mehr mitgepflegt wird.
  // Umbenannt: Der Schalter steuert nicht nur die Begruessung, sondern
  // jeden bewegten Auftritt von Brutzel - auch die Feier am Ende des
  // Kochens. Der Feldname in der Datenbank bleibt show_greeting_animation,
  // eine Spaltenumbenennung waere reines Risiko ohne Gewinn.
  { key: 'show_greeting_animation', title: 'profil.brutzelAnimation', subtitle: 'profil.brutzelAnimationSub' },
  {
    key: 'server_sync_enabled',
    title: 'profil.serverSync',
    subtitle: 'profil.serverSyncSub',
  },
];

export default function ProfileScreen({ navigation }: Props) {
  const { colors, gradient, radius, theme, setTheme } = useTheme();
  const { inhaltsBreite } = useLayout();
  const { t } = useUebersetzung();
  const { signOut, session } = useAuth();
  const { refresh: refreshServerSync } = useServerSync();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<PreferenceKey | 'default_hauben_level' | 'default_servings' | 'display_name' | null>(null);

  const loadPrefs = () => {
    api
      .get<Preferences>('/preferences/')
      .then(setPrefs)
      .catch((err) => setError(err instanceof ApiError ? err.detail : t('profil.einstellungenNichtGeladen')));
  };

  // Bei jeder Rueckkehr auf diesen Screen neu laden - nach der Anbieter-
  // Anmeldung im System-Browser ebenso wie nach einer Aenderung im
  // Speicherort-Screen. useFocusEffect statt navigation.addListener('focus'):
  // Profil ist ein Tab-Screen UNTER einem Stack-Screen, und in dieser
  // Verschachtelung ist useFocusEffect die verlaessliche Variante.
  useFocusEffect(
    React.useCallback(() => {
      loadPrefs();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const handleToggle = async (key: PreferenceKey, value: boolean) => {
    if (!prefs) return;
    const previous = prefs;
    setPrefs({ ...prefs, [key]: value });
    setSavingKey(key);
    try {
      const updated = await api.patch<Preferences>('/preferences/', { [key]: value });
      if (key === 'server_sync_enabled') {
        // Die Pool-Knoepfe in den Listen haengen an diesem Wert - ohne
        // Auffrischen blieben sie bis zum naechsten App-Start ausgegraut.
        refreshServerSync();
      }
      setPrefs(updated);
    } catch (err) {
      setPrefs(previous);
      Alert.alert(t('profil.nichtGespeichert'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
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
      Alert.alert(t('profil.nichtGespeichert'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
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
      Alert.alert(t('profil.ungueltigerWert'), t('profil.zahlZwischen'));
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
      Alert.alert(t('profil.nichtGespeichert'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
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
      Alert.alert(t('profil.nameFehlt'), t('profil.bitteName'));
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

  const accountEmail = session?.user?.email ?? '';

  // Konto loeschen ist zweistufig: erst die Warnung, dann muss die eigene
  // E-Mail abgetippt werden. Ein einzelner "Wirklich?"-Dialog ist bei
  // einer unwiderruflichen Aktion zu wenig - der wird weggetippt, ohne
  // gelesen zu werden. Apple verlangt die Funktion in der App (Guideline
  // 5.1.1(v)), die DSGVO ohnehin.
  //
  // Bewusst ein eigenes Modal statt Alert.prompt: Alert.prompt gibt es
  // NUR auf iOS, unter Android passiert damit gar nichts.
  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toLowerCase() !== accountEmail.toLowerCase()) {
      Alert.alert(t('profil.nichtGeloescht'), 'Die eingegebene Adresse stimmt nicht überein.');
      return;
    }
    setIsDeleting(true);
    try {
      await api.delete('/account', { confirm_email: accountEmail });
      setShowDeleteDialog(false);
      // Kein Erfolgs-Dialog noetig: Die Abmeldung wirft den Nutzer direkt
      // auf den Login-Screen, das ist Rueckmeldung genug.
      await signOut();
    } catch (err) {
      const message = err instanceof ApiError ? err.detail : t('profil.loeschenFehlgeschlagen');
      Alert.alert(t('profil.loeschenFehlgeschlagen'), message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag" style={{ backgroundColor: colors.bg }} contentContainerStyle={[styles.container, inhaltsBreite]}>
      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 4 }]}>{t('profil.name')}</Text>
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
          placeholder={t('sonstiges.deinName')}
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
            {prefs.household_role === 'owner' ? t('profil.rolleAdmin') : t('profil.rolleMitglied')}
          </Text>
        </View>
      )}

      <Pressable
        onPress={() => navigation.getParent()?.navigate('Household')}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, marginTop: 16 }]}
      >
        <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>{t('profil.haushalt')}</Text>
        <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 20 }]}>{t('profil.standardStufe')}</Text>
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
                    {t(option.title)}
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

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 12 }]}>{t('profil.standardPortionen')}</Text>
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

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 12 }]}>{t('profil.akzentfarbe')}</Text>
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
              <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>{t(option.title)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 12 }]}>{t('profil.darstellungHellDunkel')}</Text>
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
                {t(option.title)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 20 }]}>{t('profil.darstellungBedienung')}</Text>

      {ROWS.map((row) => {
        const isServerSyncLocked = row.key === 'server_sync_enabled' && prefs.storage_mode === 'eigene_cloud';
        return (
          <View key={row.key} style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.rowTitle, { color: colors.text }]}>{t(row.title)}</Text>
              <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
                {isServerSyncLocked ? t('profil.eigeneCloudAktiv') : t(row.subtitle)}
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
        onPress={() => navigation.getParent()?.navigate('VoiceSettings')}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}
      >
        <MaterialCommunityIcons name="account-voice" size={20} color={colors.muted} style={styles.rowIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t('profil.vorlesenStimme')}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {t('profil.vorlesenStimmeSub')}
          </Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>
      </Pressable>

      <Pressable
        onPress={() => navigation.getParent()?.navigate('StarterPacks')}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, marginTop: 8 }]}
      >
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t('profil.starterRezepte')}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {t('profil.starterRezepteSub')}
          </Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>
      </Pressable>

      <Pressable onPress={() => signOut()} style={[styles.signOutButton, { borderColor: '#DC2626', borderRadius: radius.md }]}>
        <Text style={styles.signOutText}>{t('profil.abmelden')}</Text>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 26 }]}>{t('profil.benachrichtigungen')}</Text>
      <View style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}>
        <MaterialCommunityIcons name="bell-outline" size={20} color={colors.muted} style={styles.rowIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t('profil.benachrichtigungenZeile')}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {t('profil.benachrichtigungenSub')}
          </Text>
        </View>
        <Switch
          value={prefs.notifications_enabled}
          onValueChange={(v) => handleToggle('notifications_enabled', v)}
        />
      </View>

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 26 }]}>{t('profil.kiFunktionen')}</Text>
      <View style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}>
        <MaterialCommunityIcons name="auto-fix" size={20} color={colors.muted} style={styles.rowIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t('profil.kiAnalyse')}</Text>
          {/* Der Verbrauch steht dabei, nicht nur die Grenze: Wer erst beim
              Anschlagen der Grenze davon erfaehrt, haelt es fuer einen
              Fehler. */}
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {t('profil.kiAnalyseSub')}
            {t('profil.kiVerbrauch', { verbraucht: prefs.ai_calls_this_month, grenze: prefs.ai_monthly_limit })}
          </Text>
        </View>
        <Switch value={prefs.ai_enabled} onValueChange={(v) => handleToggle('ai_enabled', v)} />
      </View>

      <Pressable
        onPress={() => navigation.getParent()?.navigate('StorageSettings')}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, marginTop: 8 }]}
      >
        <MaterialCommunityIcons name="cloud-outline" size={20} color={colors.muted} style={styles.rowIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t('profil.speicherort')}</Text>
          {/* Zeigt den AKTUELL gewaehlten Ort statt einer Aufzaehlung aller
              moeglichen. Vorher stand hier immer derselbe Text - eine
              Aenderung im Speicherort-Screen blieb danach unsichtbar, man
              musste erneut hineinnavigieren, um sie zu sehen. */}
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {prefs.storage_mode && STORAGE_MODE_LABELS[prefs.storage_mode]
              ? t(STORAGE_MODE_LABELS[prefs.storage_mode])
              : t('profil.nochNichtGewaehlt')}
          </Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>
      </Pressable>

      <Pressable
        onPress={() => navigation.getParent()?.navigate('LanguageSettings')}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, marginTop: 8 }]}
      >
        <MaterialCommunityIcons name="translate" size={20} color={colors.muted} style={styles.rowIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t('profil.sprache')}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {t('profil.spracheSub')}
          </Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 26 }]}>{t('profil.hilfe')}</Text>
      <Pressable
        onPress={() => Linking.openURL(HILFE_URL).catch(() => {})}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}
      >
        <MaterialCommunityIcons name="help-circle-outline" size={20} color={colors.muted} style={styles.rowIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t('profil.hilfeAnleitung')}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {t('profil.hilfeAnleitungSub')}
          </Text>
        </View>
        <MaterialCommunityIcons name="open-in-new" size={15} color={colors.muted} />
      </Pressable>

      <Pressable
        onPress={() => navigation.getParent()?.navigate('Support')}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}
      >
        <MaterialCommunityIcons name="lifebuoy" size={20} color={colors.muted} style={styles.rowIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t('profil.support')}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {t('profil.supportSub')}
          </Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 26 }]}>{t('profil.rechtliches')}</Text>
      <Pressable
        onPress={() => Linking.openURL(AGB_URL).catch(() => {})}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}
      >
        <MaterialCommunityIcons name="file-document-outline" size={20} color={colors.muted} style={styles.rowIcon} />
        <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>{t('profil.agb')}</Text>
        <MaterialCommunityIcons name="open-in-new" size={15} color={colors.muted} />
      </Pressable>
      <Pressable
        onPress={() => Linking.openURL(DATENSCHUTZ_URL).catch(() => {})}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}
      >
        <MaterialCommunityIcons name="shield-lock-outline" size={20} color={colors.muted} style={styles.rowIcon} />
        <Text style={[styles.rowTitle, { color: colors.text, flex: 1 }]}>{t('profil.datenschutz')}</Text>
        <MaterialCommunityIcons name="open-in-new" size={15} color={colors.muted} />
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 30 }]}>{t('profil.konto')}</Text>
      <Pressable
        onPress={() => { setDeleteConfirmText(''); setShowDeleteDialog(true); }}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}
      >
        <MaterialCommunityIcons name="account-remove-outline" size={20} color="#DC2626" style={styles.rowIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: '#DC2626' }]}>{t('profil.kontoLoeschen')}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            {t('profil.kontoLoeschenSub')}
          </Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>
      </Pressable>

      <Modal visible={showDeleteDialog} transparent animationType="fade" onRequestClose={() => setShowDeleteDialog(false)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('profil.kontoEndgueltig')}</Text>
            <Text style={[styles.modalBody, { color: colors.muted }]}>
              Alle deine Rezepte, Ordner, Wochenpläne und Einkaufslisten werden dauerhaft gelöscht.
              Das lässt sich nicht rückgängig machen.
              {'\n\n'}Tippe zur Bestätigung deine E-Mail-Adresse ein:
              {'\n'}<Text style={{ color: colors.text, fontWeight: '600' }}>{accountEmail}</Text>
            </Text>
            <TextInput
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="deine@email.at"
              placeholderTextColor={colors.muted}
              style={[styles.modalInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
            />
            <Pressable
              onPress={handleDeleteAccount}
              disabled={isDeleting}
              style={[styles.modalDanger, { borderRadius: radius.md, opacity: isDeleting ? 0.6 : 1 }]}
            >
              {isDeleting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.modalDangerText}>{t('profil.endgueltigLoeschen')}</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setShowDeleteDialog(false)} disabled={isDeleting} style={{ marginTop: 14 }}>
              <Text style={[styles.modalCancel, { color: colors.muted }]}>{t('allgemein.abbrechen')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
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
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 380, padding: 22 },
  modalTitle: { fontSize: 17, fontWeight: '700' },
  modalBody: { fontSize: 12.5, lineHeight: 18, marginTop: 10 },
  modalInput: { height: 44, paddingHorizontal: 14, fontSize: 14, marginTop: 16 },
  modalDanger: { height: 46, backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  modalDangerText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  modalCancel: { fontSize: 12.5, textAlign: 'center' },
});
