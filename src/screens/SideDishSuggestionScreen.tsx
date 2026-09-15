import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import BrutzelAvatar from '../components/BrutzelAvatar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'SideDishSuggestion'>;

interface SideSuggestion {
  category: string;
  idea: string;
  pantry_based_on: string[];
}

interface SuggestSidesResponse {
  side_suggestions: SideSuggestion[];
  follow_up_question: string;
}

export default function SideDishSuggestionScreen({ route, navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { recipeId } = route.params;

  const [data, setData] = useState<SuggestSidesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [generatingIdea, setGeneratingIdea] = useState<string | null>(null);

  useEffect(() => {
    api
      .post<SuggestSidesResponse>('/ai/suggest-sides', { recipe_id: recipeId })
      .then(setData)
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Vorschläge konnten nicht geladen werden'))
      .finally(() => setIsLoading(false));
  }, [recipeId]);

  const goToCookModeSingle = () => navigation.replace('CookMode', { recipeIds: [recipeId] });

  const handleSelectSuggestion = async (idea: string) => {
    setGeneratingIdea(idea);
    try {
      // Aus der reinen Text-Idee ein vollstaendiges Rezept generieren
      // lassen (Baustein 3, /ai/generate-recipe) - noch nie live mit
      // echtem OpenAI-Key getestet, siehe Konzept-Einschraenkung.
      const generated = await api.post<{
        title: string;
        ingredients: unknown[];
        steps: unknown[];
      }>('/ai/generate-recipe', { free_text: `Beilage: ${idea}` });

      // Generiertes Rezept speichern, um eine echte recipe_id fuer den
      // parallelen Koch-Modus zu bekommen
      const saved = await api.post<{ id: string }>('/recipes/', {
        title: generated.title,
        ingredients: generated.ingredients,
        steps: generated.steps,
      });

      navigation.replace('CookMode', { recipeIds: [recipeId, saved.id] });
    } catch (err) {
      Alert.alert(
        'Beilage konnte nicht generiert werden',
        err instanceof ApiError ? err.detail : 'Unbekannter Fehler - du kannst trotzdem ohne Beilage weiterkochen.',
      );
    } finally {
      setGeneratingIdea(null);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 12 }}>Brutzel überlegt sich Beilagen…</Text>
      </View>
    );
  }

  // KI-Fehler (z.B. kein Key konfiguriert, siehe Backend) soll das Kochen
  // nicht blockieren - einfach direkt weiter zum Koch-Modus.
  if (error) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginBottom: 20 }}>
          Keine Beilagen-Vorschläge verfügbar ({error}).
        </Text>
        <Pressable onPress={goToCookModeSingle} style={[styles.primaryButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
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

      {data?.side_suggestions.map((s, i) => (
        <Pressable
          key={i}
          onPress={() => handleSelectSuggestion(s.idea)}
          disabled={generatingIdea !== null}
          style={[styles.suggestionCard, { backgroundColor: colors.card, borderRadius: radius.md, opacity: generatingIdea && generatingIdea !== s.idea ? 0.5 : 1 }]}
        >
          <Text style={[styles.category, { color: gradient[0] }]}>{s.category}</Text>
          <Text style={[styles.idea, { color: colors.text }]}>{s.idea}</Text>
          {s.pantry_based_on.length > 0 && (
            <Text style={[styles.pantry, { color: colors.muted }]}>Basiert auf: {s.pantry_based_on.join(', ')}</Text>
          )}
          {generatingIdea === s.idea && (
            <View style={styles.generatingRow}>
              <ActivityIndicator size="small" color={gradient[0]} />
              <Text style={[styles.generatingText, { color: colors.muted }]}>Rezept wird erstellt…</Text>
            </View>
          )}
        </Pressable>
      ))}

      {data?.follow_up_question && (
        <Text style={[styles.followUp, { color: colors.muted }]}>{data.follow_up_question}</Text>
      )}

      <Pressable onPress={goToCookModeSingle} style={[styles.primaryButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
        <Text style={styles.primaryButtonText}>Ohne Beilage kochen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 },
  title: { fontSize: 17, fontWeight: '700', flex: 1 },
  suggestionCard: { padding: 14, marginBottom: 10 },
  category: { fontSize: 11, fontWeight: '700', marginBottom: 4 },
  idea: { fontSize: 13.5, lineHeight: 19 },
  pantry: { fontSize: 10.5, marginTop: 6 },
  generatingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  generatingText: { fontSize: 11 },
  followUp: { fontSize: 12.5, marginTop: 4, marginBottom: 20, fontStyle: 'italic' },
  primaryButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 'auto' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  skipLink: { fontSize: 12.5, textAlign: 'center' },
});
