import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, Image, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';
import { askWhatNext } from '../utils/afterRecipeSaved';
import type { HaubenLevel } from '../utils/stepLevels';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'PoolRecipeDetail'>;

interface PublicRecipeDetail {
  id: string;
  title: string;
  servings: number | null;
  prep_time_minutes: number | null;
  tags: string[] | null;
  cover_image_url: string | null;
  download_count: number;
  avg_rating: number | null;
  ingredients: { name: string; amount?: number | null; unit?: string | null }[];
  steps: { order: number; text: string; timer_seconds?: number | null }[];
  level: string;
}

const LEVELS: { key: HaubenLevel; label: string; hats: number }[] = [
  { key: 'anfaenger', label: 'Anfänger', hats: 1 },
  { key: 'fortgeschritten', label: 'Fortgeschritten', hats: 2 },
  { key: 'profi', label: 'Profi', hats: 3 },
];

/**
 * Vollansicht eines Rezepts aus dem Community-Pool - VOR dem Uebernehmen.
 *
 * Vorher konnte man ein fremdes Rezept nur blind uebernehmen: In der Liste
 * standen Titel, Zeit und Portionen, sonst nichts. Wer wissen wollte, was
 * drin ist, musste es erst in die eigene Sammlung holen.
 *
 * Die Schritte erscheinen in der Stufe, die der BETRACHTER eingestellt
 * hat, nicht in der des Autors - wer als Anfaenger unterwegs ist, soll
 * auch fremde Rezepte kleinschrittig erklaert bekommen. Umschalten geht
 * hier trotzdem, ohne die eigene Grundeinstellung zu aendern.
 */
export default function PoolRecipeDetailScreen({ route, navigation }: Props) {
  const { publicRecipeId } = route.params;
  const { colors, gradient, radius } = useTheme();
  const { t } = useUebersetzung();
  const [recipe, setRecipe] = useState<PublicRecipeDetail | null>(null);
  const [level, setLevel] = useState<HaubenLevel>('fortgeschritten');
  const [isLoading, setIsLoading] = useState(true);
  const [isSwitchingLevel, setIsSwitchingLevel] = useState(false);
  const [isForking, setIsForking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (wantedLevel: HaubenLevel) => {
    try {
      const data = await api.get<PublicRecipeDetail>(
        `/pool/${publicRecipeId}?level=${wantedLevel}`,
      );
      setRecipe(data);
      // Das Backend kann auf die Grundfassung zurueckfallen, wenn die
      // Umrechnung scheitert - dann soll die Anzeige nicht behaupten,
      // man lese gerade die Anfaengerfassung.
      setLevel(data.level as HaubenLevel);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t('detail.nichtGeladen'));
    }
  };

  useEffect(() => {
    // Startstufe ist die eigene Einstellung aus dem Profil.
    api
      .get<{ default_hauben_level: HaubenLevel }>('/preferences/')
      .then((prefs) => load(prefs.default_hauben_level))
      .catch(() => load('fortgeschritten'))
      .finally(() => setIsLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicRecipeId]);

  const handleLevelChange = async (next: HaubenLevel) => {
    if (next === level || isSwitchingLevel) return;
    setIsSwitchingLevel(true);
    await load(next);
    setIsSwitchingLevel(false);
  };

  const handleFork = async () => {
    if (!recipe) return;
    setIsForking(true);
    try {
      const result = await api.post<{ local_recipe_id: string }>(`/pool/${recipe.id}/fork`);
      askWhatNext(navigation, { id: result.local_recipe_id, title: recipe.title });
    } catch (err) {
      Alert.alert(t('sonstiges.uebernehmenFehlgeschlagen'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
    } finally {
      setIsForking(false);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  if (error || !recipe) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg, padding: 24 }]}>
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center' }}>
          {error ?? t('sonstiges.rezeptNichtGefunden')}
        </Text>
      </View>
    );
  }

  const meta = [
    recipe.prep_time_minutes ? `${recipe.prep_time_minutes} Min.` : null,
    recipe.servings ? `${recipe.servings} Portionen` : null,
    `${recipe.download_count}× übernommen`,
    recipe.avg_rating ? `★ ${recipe.avg_rating}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.container}
    >
      {recipe.cover_image_url && (
        <Image
          source={{ uri: recipe.cover_image_url }}
          style={[styles.cover, { borderRadius: radius.md }]}
          resizeMode="cover"
        />
      )}

      <Text style={[styles.title, { color: colors.text }]}>{recipe.title}</Text>
      <Text style={[styles.meta, { color: colors.muted }]}>{meta}</Text>
      {recipe.tags && recipe.tags.length > 0 && (
        <Text style={[styles.meta, { color: colors.muted }]}>{recipe.tags.join(' · ')}</Text>
      )}

      <Pressable
        onPress={handleFork}
        disabled={isForking}
        style={[styles.forkButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}
      >
        {isForking ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.forkButtonText}>{t('sonstiges.inKochbuchUebernehmen')}</Text>
        )}
      </Pressable>

      <Text style={[styles.sectionLabel, { color: colors.muted }]}>ZUTATEN</Text>
      {recipe.ingredients.map((ing, i) => (
        <View key={i} style={styles.ingredientRow}>
          <Text style={[styles.ingredientAmount, { color: colors.muted }]}>
            {[ing.amount ?? '', ing.unit ?? ''].filter(Boolean).join(' ')}
          </Text>
          <Text style={[styles.ingredientName, { color: colors.text }]}>{ing.name}</Text>
        </View>
      ))}

      <View style={styles.stepsHeader}>
        <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 0 }]}>ZUBEREITUNG</Text>
        {isSwitchingLevel && <ActivityIndicator size="small" color={colors.muted} />}
      </View>

      {/* Stufe hier umschaltbar, ohne die Grundeinstellung im Profil zu
          aendern: Man will vielleicht nur bei diesem einen fremden Rezept
          genauer nachlesen. */}
      <View style={styles.levelRow}>
        {LEVELS.map((l) => {
          const active = l.key === level;
          return (
            <Pressable
              key={l.key}
              onPress={() => handleLevelChange(l.key)}
              disabled={isSwitchingLevel}
              style={[
                styles.levelChip,
                {
                  backgroundColor: active ? gradient[0] : colors.card,
                  borderRadius: radius.sm,
                  opacity: isSwitchingLevel && !active ? 0.5 : 1,
                },
              ]}
            >
              <Text style={{ fontSize: 11, marginRight: 4 }}>
                {Array.from({ length: l.hats }).map(() => '👨‍🍳').join('')}
              </Text>
              <Text style={{ color: active ? '#fff' : colors.muted, fontSize: 11.5, fontWeight: '600' }}>
                {l.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {recipe.steps.map((step) => (
        <View key={step.order} style={[styles.stepCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <Text style={[styles.stepNumber, { color: colors.muted }]}>{t('detail.schritt', { nummer: step.order })}</Text>
          <Text style={[styles.stepText, { color: colors.text }]}>{step.text}</Text>
          {step.timer_seconds ? (
            <View style={styles.timerRow}>
              <MaterialCommunityIcons name="timer-outline" size={13} color={colors.muted} />
              <Text style={{ color: colors.muted, fontSize: 11.5 }}>
                {Math.round(step.timer_seconds / 60)} Min.
              </Text>
            </View>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  cover: { width: '100%', height: 190, marginBottom: 14 },
  title: { fontSize: 21, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 4 },
  forkButton: { height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  forkButtonText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  sectionLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 26, marginBottom: 8 },
  ingredientRow: { flexDirection: 'row', paddingVertical: 5 },
  ingredientAmount: { width: 82, fontSize: 13 },
  ingredientName: { flex: 1, fontSize: 13.5 },
  stepsHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 26 },
  levelRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  levelChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7 },
  stepCard: { padding: 13, marginBottom: 9 },
  stepNumber: { fontSize: 10.5, fontWeight: '700', marginBottom: 4 },
  stepText: { fontSize: 14, lineHeight: 21 },
  timerRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 7 },
});
