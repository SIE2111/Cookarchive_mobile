import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Image, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
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
  source_type: string;
}

const SOURCE_LABELS: Record<string, string> = {
  manual: '✍️ Selbst erstellt',
  web_import: '🌐 Aus dem Web importiert',
  ai_generated: '🤖 KI-generiert',
  photo_scan: '📷 Per Foto erfasst',
  starter_pack: '⭐ Starter-Paket',
  pool_fork: '👥 Aus dem Community-Pool',
};

export default function RecipeDetailScreen({ route, navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { recipeId } = route.params;
  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [largeText, setLargeText] = useState(false);

  useEffect(() => {
    api.get<{ large_text: boolean }>('/preferences/').then((prefs) => setLargeText(prefs.large_text)).catch(() => {
      // Praeferenz konnte nicht geladen werden - Standard-Schriftgroesse bleibt
    });
  }, []);

  useEffect(() => {
    const load = () => {
      api
        .get<RecipeDetail>(`/recipes/${recipeId}`)
        .then(setRecipe)
        .catch((err) => setError(err instanceof ApiError ? err.detail : 'Rezept konnte nicht geladen werden'));
    };
    load();
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [recipeId, navigation]);

  const goToSideDish = () => navigation.navigate('SideDishSuggestion', { recipeId: recipeId });

  const [isAddingToList, setIsAddingToList] = useState(false);
  const handleAddToShoppingList = async () => {
    setIsAddingToList(true);
    try {
      await api.post('/shopping-list/add-recipe', { recipe_id: recipeId });
      Alert.alert('Erledigt', 'Zutaten wurden zur Einkaufsliste hinzugefügt.');
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Zutaten konnten nicht hinzugefügt werden.');
    } finally {
      setIsAddingToList(false);
    }
  };

  const handleDelete = () => {
    if (!recipe) return;
    Alert.alert(
      'Rezept löschen?',
      `"${recipe.title}" wird dauerhaft gelöscht. Das kann nicht rückgängig gemacht werden.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Löschen',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/recipes/${recipeId}`);
              navigation.goBack();
            } catch (err) {
              Alert.alert('Löschen fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
            }
          },
        },
      ],
    );
  };

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
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: colors.muted }]}>
          {recipe.servings ? `${recipe.servings} Portionen` : ''}
          {recipe.prep_time_minutes ? ` · ${recipe.prep_time_minutes} min` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <Pressable onPress={() => navigation.navigate('ManualRecipe', { recipeId: recipe.id })} hitSlop={8}>
            <Text style={[styles.editLink, { color: gradient[0] }]}>Bearbeiten</Text>
          </Pressable>
          <Pressable onPress={handleDelete} hitSlop={8}>
            <Text style={[styles.editLink, { color: '#DC2626' }]}>Löschen</Text>
          </Pressable>
        </View>
      </View>

      <Text style={[styles.sourceHint, { color: colors.muted }]}>
        {SOURCE_LABELS[recipe.source_type] ?? recipe.source_type}
      </Text>

      <Pressable
        onPress={goToSideDish}
        style={[styles.cookButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}
      >
        <Text style={styles.cookButtonText}>Zubereitung starten</Text>
      </Pressable>

      <Pressable
        onPress={handleAddToShoppingList}
        disabled={isAddingToList}
        style={[styles.shoppingListButton, { backgroundColor: colors.card, borderRadius: radius.md, opacity: isAddingToList ? 0.7 : 1 }]}
      >
        {isAddingToList ? (
          <ActivityIndicator color={colors.text} size="small" />
        ) : (
          <>
            <MaterialCommunityIcons name="cart-plus" size={16} color={colors.text} />
            <Text style={[styles.shoppingListButtonText, { color: colors.text }]}>Zutaten zur Einkaufsliste</Text>
          </>
        )}
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Zutaten</Text>
      {recipe.ingredients.map((ing, i) => (
        <Text key={i} style={[styles.ingredient, { color: colors.text, fontSize: largeText ? 16.5 : 13.5 }]}>
          {ing.amount ? `${ing.amount} ${ing.unit ?? ''} ` : ''}
          {ing.name}
        </Text>
      ))}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Zubereitung</Text>
      {recipe.steps.map((step) => (
        <View key={step.order} style={[styles.stepCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <Text style={[styles.stepNumber, { color: colors.muted }]}>Schritt {step.order}</Text>
          <Text style={[styles.stepText, { color: colors.text, fontSize: largeText ? 17 : 14, lineHeight: largeText ? 25 : 21 }]}>{step.text}</Text>
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
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 20 },
  meta: { fontSize: 12 },
  editLink: { fontSize: 12.5, fontWeight: '700' },
  sourceHint: { fontSize: 10.5, marginTop: -12, marginBottom: 18 },
  cookButton: { height: 46, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  shoppingListButton: { flexDirection: 'row', gap: 7, height: 42, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  shoppingListButtonText: { fontSize: 12.5, fontWeight: '700' },
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
