import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import { useUebersetzung } from '../i18n';

type Anteil = {
  name: string;
  gramm: number;
  kcal: number;
  unsicher: boolean;
};

type Antwort = {
  portionen: number;
  calories_kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
  unsichere_zutaten: number;
  anteile: Anteil[];
};

type Props = {
  recipeId: string;
  /** Bereits gespeicherte Werte aus dem Rezept, falls schon geschätzt. */
  gespeichert?: {
    calories_kcal?: number | null;
    protein_g?: number | null;
    fat_g?: number | null;
    carbs_g?: number | null;
  };
};

/**
 * Naehrwerte je Portion.
 *
 * Bewusst auf Knopfdruck statt beim Oeffnen: Die Schaetzung kostet einen
 * KI-Aufruf, und die meisten Rezepte werden gekocht, nicht bilanziert.
 * Einmal berechnet, liegt sie am Rezept und wird ohne weiteren Aufruf
 * angezeigt.
 *
 * Gerundet und ohne Nachkommastellen - zu einer Schaetzung passen keine
 * zwei Nachkommastellen, die eine Genauigkeit vortaeuschen, die es nicht
 * gibt.
 */
export default function NutritionCard({ recipeId, gespeichert }: Props) {
  const { colors, radius, gradient } = useTheme();
  const { t } = useUebersetzung();

  const hatGespeicherte = gespeichert?.calories_kcal != null;
  const [werte, setWerte] = useState<Antwort | null>(
    hatGespeicherte
      ? {
          portionen: 1,
          calories_kcal: gespeichert!.calories_kcal!,
          protein_g: gespeichert!.protein_g ?? 0,
          fat_g: gespeichert!.fat_g ?? 0,
          carbs_g: gespeichert!.carbs_g ?? 0,
          unsichere_zutaten: 0,
          anteile: [],
        }
      : null,
  );
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);

  const schaetzen = async (neu = false) => {
    setLaeuft(true);
    setFehler(null);
    try {
      const res = await api.post<Antwort>(`/nutrition/${recipeId}${neu ? '?force=true' : ''}`, {});
      setWerte(res);
    } catch (err) {
      setFehler(err instanceof ApiError ? err.detail : t('naehrwerte.fehlgeschlagen'));
    } finally {
      setLaeuft(false);
    }
  };

  const kachel = (icon: string, beschriftung: string, wert: number, einheit: string) => (
    <View style={styles.kachel}>
      <View style={styles.kachelKopf}>
        <MaterialCommunityIcons name={icon as any} size={15} color={gradient[0]} />
        <Text style={[styles.kachelLabel, { color: colors.text }]}>{beschriftung}</Text>
      </View>
      <Text style={[styles.kachelWert, { color: colors.text }]}>
        {wert}
        <Text style={[styles.kachelEinheit, { color: colors.muted }]}> {einheit}</Text>
      </Text>
    </View>
  );

  return (
    <View style={[styles.karte, { backgroundColor: colors.card, borderRadius: radius.md }]}>
      <Text style={[styles.titel, { color: colors.text }]}>{t('naehrwerte.titel')}</Text>

      {!werte && !laeuft && (
        <Pressable
          onPress={() => schaetzen()}
          style={[styles.knopf, { backgroundColor: gradient[0], borderRadius: radius.sm }]}
        >
          <MaterialCommunityIcons name="calculator-variant-outline" size={16} color="#fff" />
          <Text style={styles.knopfText}>{t('naehrwerte.schaetzen')}</Text>
        </Pressable>
      )}

      {laeuft && (
        <View style={styles.laeuftZeile}>
          <ActivityIndicator size="small" color={gradient[0]} />
          <Text style={[styles.laeuftText, { color: colors.muted }]}>{t('naehrwerte.laeuft')}</Text>
        </View>
      )}

      {werte && (
        <>
          <View style={styles.raster}>
            {kachel('fire', t('naehrwerte.energie'), werte.calories_kcal, 'kcal')}
            {kachel('egg-outline', t('naehrwerte.eiweiss'), werte.protein_g, 'g')}
            {kachel('water-outline', t('naehrwerte.fett'), werte.fat_g, 'g')}
            {kachel('barley', t('naehrwerte.kohlenhydrate'), werte.carbs_g, 'g')}
          </View>

          {werte.anteile.length > 0 && (
            <View style={styles.anteile}>
              <Text style={[styles.anteileTitel, { color: colors.muted }]}>
                {t('naehrwerte.groessterAnteil')}
              </Text>
              {werte.anteile.slice(0, 3).map((a, i) => (
                <Text key={i} style={[styles.anteilZeile, { color: colors.muted }]}>
                  {a.name} · {Math.round(a.gramm)} g · {Math.round(a.kcal)} kcal
                  {a.unsicher ? ' ·' : ''}
                  {a.unsicher ? <Text style={{ color: '#B45309' }}> ?</Text> : null}
                </Text>
              ))}
            </View>
          )}

          {werte.unsichere_zutaten > 0 && (
            <Text style={[styles.unsicher, { color: '#B45309' }]}>
              {t('naehrwerte.unsicher', { anzahl: werte.unsichere_zutaten })}
            </Text>
          )}

          <Text style={[styles.hinweis, { color: colors.muted }]}>{t('naehrwerte.hinweis')}</Text>

          <Pressable onPress={() => schaetzen(true)} disabled={laeuft} style={styles.neuKnopf}>
            <Text style={{ color: gradient[0], fontSize: 12.5, fontWeight: '600' }}>
              {t('naehrwerte.neuBerechnen')}
            </Text>
          </Pressable>
        </>
      )}

      {fehler && <Text style={[styles.fehler, { color: '#DC2626' }]}>{fehler}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  karte: { padding: 16, marginTop: 10 },
  titel: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  knopf: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    minHeight: 44, paddingHorizontal: 16,
  },
  knopfText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  laeuftZeile: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  laeuftText: { fontSize: 13 },
  raster: { flexDirection: 'row', flexWrap: 'wrap' },
  kachel: { width: '50%', paddingVertical: 8, paddingRight: 8 },
  kachelKopf: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  kachelLabel: { fontSize: 13, fontWeight: '600' },
  kachelWert: { fontSize: 20, fontWeight: '700' },
  kachelEinheit: { fontSize: 13, fontWeight: '500' },
  anteile: { marginTop: 10 },
  anteileTitel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 4 },
  anteilZeile: { fontSize: 12, lineHeight: 18 },
  unsicher: { fontSize: 12, marginTop: 8, fontWeight: '600' },
  hinweis: { fontSize: 11.5, lineHeight: 16, marginTop: 10 },
  neuKnopf: { minHeight: 44, justifyContent: 'center' },
  fehler: { fontSize: 12.5, marginTop: 8 },
});
