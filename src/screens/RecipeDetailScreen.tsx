import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Image } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'RecipeDetail'>;

interface Ingredient {
  name: string;
  amount: number | null;
  unit: string | null;
}

interface Step {
  order: number;
  text: string;
  timer_seconds?: number | null;
}

interface RecipeDetail {
  id: string;
  title: string;
  servings: number | null;
  prep_time_minutes: number | null;
  ingredients: Ingredient[];
  steps: Step[];
  personal_note: string | null;
  cover_image_url: string | null;
}

export default function RecipeDetailScreen({ route, navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { recipeId } = route.params;
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<RecipeDetail>(`/recipes/${recipeId}`)
      .then(setRecipe)
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Rezept konnte nicht geladen werden'));
  }, [recipeId]);

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Text style={{ color: '#DC2626', fontSize: 13 }}>{error}</Text>
      </View>
    );
  }

  if (!recipe) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
      {recipe.cover_image_url && (
        <Image source={{ uri: recipe.cover_image_url }} style={[styles.heroImage, { borderRadius: radius.md }]} />
      )}
      <Text style={[styles.title, { color: colors.text }]}>{recipe.title}</Text>
      <Text style={[styles.meta, { color: colors.muted }]}>
        {recipe.servings ? `${recipe.servings} Portionen` : ''}
        {recipe.prep_time_minutes ? ` · ${recipe.prep_time_minutes} min` : ''}
      </Text>

      <Pressable
        onPress={() => navigation.navigate('SideDishSuggestion', { recipeId: recipe.id })}
        style={[styles.cookButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}
      >
        <Text style={styles.cookButtonText}>Zubereitung starten</Text>
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Zutaten</Text>
      {recipe.ingredients.map((ing, i) => (
        <Text key={i} style={[styles.ingredient, { color: colors.text }]}>
          {ing.amount ? `${ing.amount} ${ing.unit ?? ''} ` : ''}
          {ing.name}
        </Text>
      ))}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Zubereitung</Text>
      {recipe.steps.map((step) => (
        <View key={step.order} style={[styles.stepCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <Text style={[styles.stepNumber, { color: colors.muted }]}>Schritt {step.order}</Text>
          <Text style={[styles.stepText, { color: colors.text }]}>{step.text}</Text>
        </View>
      ))}

      {recipe.personal_note && (
        <View style={[styles.noteCard, { borderRadius: radius.md }]}>
          <Text style={styles.noteLabel}>📌 Deine Notiz</Text>
          <Text style={[styles.noteText, { color: colors.text }]}>{recipe.personal_note}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 60 },
  heroImage: { width: '100%', height: 180, marginBottom: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 4, marginBottom: 20 },
  cookButton: { height: 46, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  cookButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 8, marginBottom: 10 },
  ingredient: { fontSize: 13.5, lineHeight: 22 },
  stepCard: { padding: 14, marginBottom: 10 },
  stepNumber: { fontSize: 10, fontWeight: '600', marginBottom: 4 },
  stepText: { fontSize: 14, lineHeight: 21 },
  noteCard: { backgroundColor: '#FEF3C7', padding: 12, marginTop: 8 },
  noteLabel: { fontSize: 11, fontWeight: '600', color: '#92400E', marginBottom: 3 },
  noteText: { fontSize: 12.5, fontStyle: 'italic' },
});
