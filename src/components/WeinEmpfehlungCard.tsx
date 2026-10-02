import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert, Linking } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import {
  buildWeinkellerLink, absprungMerken, weinFuerRezeptLaden, weinFuerRezeptEntfernen, GewaehlterWein,
} from '../utils/weinPairing';

/**
 * "Passender Wein aus meinem Keller" im Rezept-Detail. Öffnet Mein
 * Weinkeller direkt mit diesem Gericht; dort wird ein Wein gewählt (und
 * abgebucht), danach springt Weinkeller zurück und hier steht "Dazu: …".
 * Funktioniert unabhängig davon, wo die Weindaten liegen (NAS, Cloud,
 * lokal), weil Weinkeller selbst die Vorschläge berechnet.
 */
export default function WeinEmpfehlungCard({ recipe, refreshKey }: {
  recipe: { id: string; title: string; ingredients: { name: string }[] };
  refreshKey?: number;
}) {
  const { colors, gradient, radius } = useTheme();
  const { t } = useUebersetzung(); // Hook statt t(): zeichnet bei Sprachwechsel neu
  const [wein, setWein] = useState<GewaehlterWein | null>(null);

  useEffect(() => {
    weinFuerRezeptLaden(recipe.id).then(setWein);
  }, [recipe.id, refreshKey]);

  async function oeffnen() {
    await absprungMerken(recipe.id, recipe.title);
    try {
      await Linking.openURL(buildWeinkellerLink(recipe));
    } catch {
      // Kein Gerät-Handler für meinweinkeller:// -> App nicht installiert
      Alert.alert(t('detail.weinNichtInstalliert'), t('detail.weinNichtInstalliertText'));
    }
  }

  async function entfernen() {
    await weinFuerRezeptEntfernen(recipe.id);
    setWein(null);
  }

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.md }]}>
      <Text style={[styles.title, { color: colors.text }]}>🍷 {t('detail.weinTitel')}</Text>
      {wein && (
        <View style={styles.chosen}>
          <Text style={[styles.chosenText, { color: colors.text }]}>
            {t('detail.weinDazu')} <Text style={styles.bold}>{wein.label}</Text>
          </Text>
          <Pressable onPress={entfernen} hitSlop={8}>
            <Text style={[styles.remove, { color: colors.muted }]}>{t('detail.weinEntfernen')}</Text>
          </Pressable>
        </View>
      )}
      <Pressable onPress={oeffnen} style={[styles.button, { borderColor: gradient[0], borderRadius: radius.md }]}>
        <Text style={[styles.buttonText, { color: gradient[0] }]}>
          {wein ? t('detail.weinAndererButton') : t('detail.weinButton')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, marginBottom: 16 },
  title: { fontSize: 14, fontWeight: '700' },
  chosen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, gap: 8 },
  chosenText: { flex: 1, fontSize: 14 },
  bold: { fontWeight: '700' },
  remove: { fontSize: 12 },
  button: { marginTop: 10, borderWidth: 1.5, paddingVertical: 9, alignItems: 'center' },
  buttonText: { fontSize: 14, fontWeight: '600' },
});
