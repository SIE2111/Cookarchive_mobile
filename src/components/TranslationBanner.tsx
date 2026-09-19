import React from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';

type Props = {
  /** Sprache, in der das Rezept verfasst ist. */
  quellsprache: string;
  /** Liegt bereits eine Übersetzung vor und wird sie gerade gezeigt? */
  zeigtUebersetzung: boolean;
  /** Ist eine Übersetzung vorhanden (dann Umschalten statt Übersetzen)? */
  vorhanden: boolean;
  laeuft: boolean;
  fehler?: string | null;
  onUebersetzen: () => void;
  onUmschalten: () => void;
};

/**
 * Fragt, ob ein fremdsprachiges Rezept übersetzt werden soll.
 *
 * Bewusst eine Frage, keine automatische Übersetzung: Sie kostet einen
 * KI-Aufruf und ein paar Sekunden, und wer die Sprache des Originals
 * ohnehin versteht, braucht sie nicht.
 *
 * Das Original bleibt immer erreichbar. Deshalb steht hier auch nach dem
 * Übersetzen eine Zeile - eine Maschinenübersetzung ist ein Angebot,
 * kein Ersatz.
 */
export default function TranslationBanner({
  quellsprache, zeigtUebersetzung, vorhanden, laeuft, fehler,
  onUebersetzen, onUmschalten,
}: Props) {
  const { colors, radius, gradient } = useTheme();
  const { t } = useUebersetzung();

  const spracheName = quellsprache === 'en' ? t('uebersetzung.spracheEn') : t('uebersetzung.spracheDe');

  return (
    <View style={[styles.karte, { backgroundColor: colors.card, borderRadius: radius.md }]}>
      {vorhanden ? (
        <View style={styles.zeile}>
          <MaterialCommunityIcons
            name="translate"
            size={16}
            color={zeigtUebersetzung ? gradient[0] : colors.muted}
          />
          <Text style={[styles.status, { color: colors.muted }]}>
            {zeigtUebersetzung ? t('uebersetzung.zeigtUebersetzung') : spracheName}
          </Text>
          <Pressable onPress={onUmschalten} hitSlop={8} style={styles.umschalten}>
            <Text style={{ color: gradient[0], fontSize: 13, fontWeight: '600' }}>
              {zeigtUebersetzung ? t('uebersetzung.originalAnzeigen') : t('uebersetzung.uebersetzungAnzeigen')}
            </Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={[styles.titel, { color: colors.text }]}>
            {t('uebersetzung.angebotTitel', { sprache: spracheName })}
          </Text>
          <Text style={[styles.text, { color: colors.muted }]}>{t('uebersetzung.angebotText')}</Text>
          {laeuft ? (
            <View style={styles.laeuftZeile}>
              <ActivityIndicator size="small" color={gradient[0]} />
              <Text style={[styles.status, { color: colors.muted }]}>{t('uebersetzung.laeuft')}</Text>
            </View>
          ) : (
            <Pressable
              onPress={onUebersetzen}
              style={[styles.knopf, { backgroundColor: gradient[0], borderRadius: radius.sm }]}
            >
              <MaterialCommunityIcons name="translate" size={16} color="#fff" />
              <Text style={styles.knopfText}>{t('uebersetzung.uebersetzen')}</Text>
            </Pressable>
          )}
        </>
      )}
      {fehler ? <Text style={[styles.fehler, { color: '#DC2626' }]}>{fehler}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  karte: { padding: 14, marginTop: 10 },
  titel: { fontSize: 14.5, fontWeight: '700', marginBottom: 4 },
  text: { fontSize: 12.5, lineHeight: 18, marginBottom: 12 },
  knopf: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 44, paddingHorizontal: 16, alignSelf: 'flex-start',
  },
  knopfText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  laeuftZeile: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  zeile: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  status: { fontSize: 12.5, flexShrink: 1 },
  umschalten: { marginLeft: 'auto', minHeight: 44, justifyContent: 'center' },
  fehler: { fontSize: 12.5, marginTop: 8 },
});
