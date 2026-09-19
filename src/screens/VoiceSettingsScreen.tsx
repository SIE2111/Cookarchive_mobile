import React, { useEffect, useState } from 'react';
import { View, Text, Switch, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';
import BrutzelVoicePicker from '../components/BrutzelVoicePicker';

/**
 * Alles zum Vorlesen an einem Ort.
 *
 * Vorher stand der Schalter "Schritte automatisch vorlesen" in der langen
 * Schalterliste im Profil und die Stimmenauswahl als Block darunter. Beides
 * gehoert zusammen, und die Stimmenauswahl ist mit Anhoeren je Stimme zu
 * umfangreich fuer eine Seite, auf der sie nur eine von acht Zeilen ist.
 */
export default function VoiceSettingsScreen() {
  const { colors } = useTheme();
  const { t } = useUebersetzung();
  const [autoRead, setAutoRead] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    api
      .get<{ auto_read_steps: boolean }>('/preferences/')
      .then((prefs) => setAutoRead(prefs.auto_read_steps))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const toggleAutoRead = async (value: boolean) => {
    // Sofort umlegen, damit der Schalter nicht traege wirkt - und bei
    // einem Fehler wieder zurueck. Ein Schalter, der erst nach der
    // Serverantwort reagiert, fuehlt sich kaputt an.
    setAutoRead(value);
    try {
      await api.patch('/preferences/', { auto_read_steps: value });
    } catch (err) {
      setAutoRead(!value);
      Alert.alert(t('sonstiges.nichtGespeichert'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
      <Text style={[styles.label, { color: colors.muted }]}>BEIM KOCHEN</Text>
      <View style={[styles.row, { backgroundColor: colors.card }]}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.rowTitle, { color: colors.text }]}>{t('sonstiges.schritteVorlesen')}</Text>
          <Text style={[styles.rowSubtitle, { color: colors.muted }]}>
            Jeder Schritt wird beim Aufrufen vorgelesen – praktisch bei schmutzigen Händen
          </Text>
        </View>
        <Switch value={autoRead} onValueChange={toggleAutoRead} />
      </View>

      <BrutzelVoicePicker />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: 12, gap: 12 },
  rowTitle: { fontSize: 14, fontWeight: '600' },
  rowSubtitle: { fontSize: 11.5, lineHeight: 17, marginTop: 2 },
});
