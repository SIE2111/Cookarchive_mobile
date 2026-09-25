import React, { useEffect, useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, ActivityIndicator, Alert, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';
import { useServerSync } from '../context/ServerSyncContext';
import { useLayout } from '../utils/layout';

/**
 * Alle Ein/Aus-Schalter an einem Ort (23.09.2026).
 *
 * Vorher standen sieben Schalter verstreut im Profil-Bildschirm, zwischen
 * Farbwahl, Links zu anderen Unterschirmen und Konto-Aktionen - das war
 * schon sehr unuebersichtlich. Genau wie bei VoiceSettingsScreen zuvor:
 * Was zusammengehoert (hier: JEDER Schalter), gehoert auf eine eigene
 * Seite. Die Farbwahl (Akzentfarbe/Hell-Dunkel) bleibt bewusst im Profil -
 * das sind Chip-Auswahlen, keine Schalter, und sie sind zu visuell/schoen,
 * um sie zu verstecken.
 */

type PreferenceKey =
  | 'show_brutzel'
  | 'large_text'
  | 'show_greeting_animation'
  | 'play_animation_music'
  | 'server_sync_enabled';

interface Preferences {
  show_brutzel: boolean;
  large_text: boolean;
  show_greeting_animation: boolean;
  play_animation_music: boolean;
  server_sync_enabled: boolean;
  storage_mode: string;
}

const DARSTELLUNG_ROWS: { key: PreferenceKey; title: string; subtitle: string }[] = [
  { key: 'show_brutzel', title: 'profil.brutzelAnzeigen', subtitle: 'profil.brutzelAnzeigenSub' },
  { key: 'large_text', title: 'profil.grosseSchrift', subtitle: 'profil.grosseSchriftSub' },
  { key: 'show_greeting_animation', title: 'profil.brutzelAnimation', subtitle: 'profil.brutzelAnimationSub' },
  { key: 'play_animation_music', title: 'profil.animationMusik', subtitle: 'profil.animationMusikSub' },
];

export default function AppSettingsScreen() {
  const { colors, gradient, radius } = useTheme();
  const { inhaltsBreite } = useLayout();
  const { t } = useUebersetzung();
  const { refresh: refreshServerSync } = useServerSync();
  // useNavigation() statt eines navigation-Props (23.09.2026): dieser
  // Bildschirm laeuft sowohl als eigener Stack-Screen als auch OHNE Props
  // eingebettet im Profil quer (siehe ProfileScreen.tsx) - der Hook
  // funktioniert in beiden Faellen gleich, ein durchgereichtes Prop nur
  // im ersten.
  const navigation = useNavigation<any>();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [savingKey, setSavingKey] = useState<PreferenceKey | null>(null);

  useEffect(() => {
    api
      .get<Preferences>('/preferences/')
      .then(setPrefs)
      .catch(() => {});
  }, []);

  const handleToggle = async (key: PreferenceKey, value: boolean) => {
    if (!prefs) return;
    const vorher = prefs;
    setPrefs({ ...prefs, [key]: value });
    setSavingKey(key);
    try {
      const updated = await api.patch<Preferences>('/preferences/', { [key]: value });
      if (key === 'server_sync_enabled') {
        // Die Pool-Knoepfe in den Listen haengen an diesem Wert - ohne
        // Auffrischen blieben sie bis zum naechsten App-Start ausgegraut.
        // (Uebernommen aus dem frueheren handleToggle im Profil-Bildschirm.)
        refreshServerSync();
      }
      setPrefs(updated);
    } catch (err) {
      setPrefs(vorher);
      Alert.alert(t('profil.nichtGespeichert'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
    } finally {
      setSavingKey(null);
    }
  };

  if (!prefs) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  const isServerSyncLocked = prefs.storage_mode === 'eigene_cloud';

  const Zeile = ({ zeile, gesperrt, untertitel }: { zeile: { key: PreferenceKey; title: string; subtitle: string }; gesperrt?: boolean; untertitel?: string }) => (
    <View style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md }]}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{t(zeile.title)}</Text>
        <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{untertitel ?? t(zeile.subtitle)}</Text>
      </View>
      {savingKey === zeile.key ? (
        <ActivityIndicator color={colors.muted} />
      ) : (
        <Switch
          value={prefs[zeile.key] as boolean}
          onValueChange={(v) => handleToggle(zeile.key, v)}
          disabled={gesperrt}
          trackColor={{ false: '#E7E1D4', true: gradient[0] }}
          thumbColor="#fff"
        />
      )}
    </View>
  );

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={[styles.container, inhaltsBreite]}>
      <Text style={[styles.label, { color: colors.muted }]}>{t('profil.darstellungBedienung')}</Text>
      {DARSTELLUNG_ROWS.map((zeile) => (
        <Zeile key={zeile.key} zeile={zeile} />
      ))}

      <Zeile
        zeile={{ key: 'server_sync_enabled', title: 'profil.serverSync', subtitle: 'profil.serverSyncSub' }}
        gesperrt={isServerSyncLocked}
        untertitel={isServerSyncLocked ? t('profil.eigeneCloudAktiv') : undefined}
      />
      {!prefs.server_sync_enabled && (
        <Text style={[styles.hint, { color: colors.muted }]}>{t('profil.serverSyncHinweis')}</Text>
      )}

      {/* Gehoert inhaltlich zur Brutzel-Animation direkt darueber - er
          spricht ja waehrend sie laeuft (23.09.2026, vorher ein eigener
          Link im Profil-Hauptbildschirm). */}
      <Pressable
        onPress={() => navigation.navigate('VoiceSettings')}
        style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.md, marginTop: 8 }]}
      >
        <MaterialCommunityIcons name="account-voice" size={20} color={colors.muted} style={styles.rowIcon} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t('profil.vorlesenStimme')}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>{t('profil.vorlesenStimmeSub')}</Text>
        </View>
        <Text style={{ color: colors.muted, fontSize: 16 }}>›</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 18, paddingBottom: 40 },
  label: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8 },
  rowIcon: { marginRight: 10 },
  rowTitle: { fontSize: 14.5, fontWeight: '600' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  hint: { fontSize: 11.5, marginTop: -2, marginBottom: 10, paddingHorizontal: 4 },
});
