import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import BrutzelAvatar from '../components/BrutzelAvatar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'SideDishSuggestion'>;

interface RecipeSummary {
  id: string;
  title: string;
  tags: string[] | null;
  prep_time_minutes: number | null;
  cover_image_url: string | null;
}

const MAX_SELECTABLE = 2;
const MAX_SUGGESTIONS = 5;

export default function SideDishSuggestionScreen({ route, navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { recipeId } = route.params;

  const [candidates, setCandidates] = useState<RecipeSummary[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Vorschlaege kommen bewusst aus den eigenen GESPEICHERTEN Rezepten,
    // nicht von der KI erfunden - sortiert nach Zubereitungszeit (kuerzere
    // Rezepte sind als schnelle Beilage plausibler). Es gibt in den Daten
    // keine eigene "Beilage"-Kategorie, das ist die naechstbeste,
    // nachvollziehbare Heuristik ohne etwas vorzutaeuschen.
    api
      .get<RecipeSummary[]>('/recipes/')
      .then((all) => {
        const others = all
          .filter((r) => r.id !== recipeId)
          .sort((a, b) => (a.prep_time_minutes ?? 999) - (b.prep_time_minutes ?? 999))
          .slice(0, MAX_SUGGESTIONS);
        setCandidates(others);
      })
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Vorschläge konnten nicht geladen werden'))
      .finally(() => setIsLoading(false));
  }, [recipeId]);

  const goToCookMode = () => navigation.replace('CookMode', { recipeIds: [recipeId, ...selectedIds] });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECTABLE) return prev; // max. 2 gleichzeitig, wie gewuenscht
      return [...prev, id];
    });
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  // Fehler oder keine anderen gespeicherten Rezepte vorhanden - Kochen soll
  // dadurch nie blockiert werden, einfach direkt weiter.
  if (error || candidates.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
          {error ? `Keine Beilagen-Vorschläge verfügbar (${error}).` : 'Noch keine weiteren gespeicherten Rezepte für eine Beilage vorhanden.'}
        </Text>
        <Pressable onPress={() => navigation.replace('CookMode', { recipeIds: [recipeId] })} style={[styles.primaryButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
          <Text style={styles.primaryButtonText}>Trotzdem kochen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <BrutzelAvatar size={32} />
        <Text style={[styles.title, { color: colors.text }]}>Passt eine Beilage dazu?</Text>
      </View>
      <Text style={[styles.subtitle, { color: colors.muted }]}>
        Bis zu {MAX_SELECTABLE} auswählen, aus deinen eigenen gespeicherten Rezepten.
      </Text>

      {candidates.map((r) => {
        const isSelected = selectedIds.includes(r.id);
        return (
          <Pressable
            key={r.id}
            onPress={() => toggleSelect(r.id)}
            style={[
              styles.suggestionCard,
              { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: isSelected ? 1.5 : 0, borderColor: gradient[0] },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.recipeTitle, { color: colors.text }]}>{r.title}</Text>
              {r.prep_time_minutes && (
                <Text style={[styles.recipeMeta, { color: colors.muted }]}>⏱ {r.prep_time_minutes} Min.</Text>
              )}
            </View>
            <MaterialCommunityIcons
              name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
              size={22}
              color={isSelected ? gradient[0] : colors.muted}
            />
          </Pressable>
        );
      })}

      <Pressable onPress={goToCookMode} style={[styles.primaryButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
        <Text style={styles.primaryButtonText}>
          {selectedIds.length > 0 ? `Mit ${selectedIds.length} Beilage${selectedIds.length > 1 ? 'n' : ''} kochen` : 'Ohne Beilage kochen'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  title: { fontSize: 17, fontWeight: '700', flex: 1 },
  subtitle: { fontSize: 12, marginBottom: 18 },
  suggestionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 10 },
  recipeTitle: { fontSize: 14, fontWeight: '600' },
  recipeMeta: { fontSize: 11, marginTop: 3 },
  primaryButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 'auto' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
});
