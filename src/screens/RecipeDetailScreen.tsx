import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Image, Alert, Modal, TextInput } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import BrutzelAvatar from '../components/BrutzelAvatar';
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

interface SideSuggestion {
  id: string;
  title: string;
  reason: string;
}

interface RecipeSummary {
  id: string;
  title: string;
}

const MAX_SELECTABLE_SIDES = 2;

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



  const [sideSuggestions, setSideSuggestions] = useState<SideSuggestion[]>([]);
  const [manualSides, setManualSides] = useState<SideSuggestion[]>([]);
  const [selectedSideIds, setSelectedSideIds] = useState<string[]>([]);
  const [isSidesLoading, setIsSidesLoading] = useState(true);
  const [sidesError, setSidesError] = useState<string | null>(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [allRecipes, setAllRecipes] = useState<RecipeSummary[]>([]);
  const [recipeSearch, setRecipeSearch] = useState('');

  useEffect(() => {
    // Beilagen-Vorschlaege direkt hier auf dem Rezept-Detail laden (nicht
    // erst auf einem eigenen Screen nach "Zubereitung starten") - echte
    // KI-Zuordnung aus den eigenen gespeicherten Rezepten, mit Begruendung.
    setIsSidesLoading(true);
    api
      .post<{ suggestions: SideSuggestion[] }>(`/ai/suggest-sides-for-recipe/${recipeId}`)
      .then((res) => setSideSuggestions(res.suggestions))
      .catch((err) => setSidesError(err instanceof ApiError ? err.detail : 'Vorschläge konnten nicht geladen werden'))
      .finally(() => setIsSidesLoading(false));
  }, [recipeId]);

  const allSideCandidates = [...manualSides, ...sideSuggestions.filter((s) => !manualSides.some((m) => m.id === s.id))];

  const toggleSideSelect = (id: string) => {
    setSelectedSideIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECTABLE_SIDES) return prev;
      return [...prev, id];
    });
  };

  const openSidePicker = () => {
    setIsPickerOpen(true);
    setRecipeSearch('');
    if (allRecipes.length === 0) {
      api.get<RecipeSummary[]>('/recipes/').then(setAllRecipes).catch(() => {});
    }
  };

  const addManualSide = (r: RecipeSummary) => {
    if (r.id === recipeId) return;
    if (!manualSides.some((m) => m.id === r.id) && !sideSuggestions.some((s) => s.id === r.id)) {
      setManualSides((prev) => [...prev, { id: r.id, title: r.title, reason: 'Selbst ausgewählt' }]);
    }
    toggleSideSelect(r.id);
    setIsPickerOpen(false);
  };

  const filteredPickerRecipes = (recipeSearch.trim()
    ? allRecipes.filter((r) => r.title.toLowerCase().includes(recipeSearch.trim().toLowerCase()))
    : allRecipes
  ).filter((r) => r.id !== recipeId);

  const [isAddingToList, setIsAddingToList] = useState(false);
  const handleAddToShoppingList = async () => {
    setIsAddingToList(true);
    try {
      await api.post('/shopping-list/add-recipes', { recipe_ids: [recipeId, ...selectedSideIds] });
      Alert.alert('Erledigt', 'Zutaten wurden zur Einkaufsliste hinzugefügt.');
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Zutaten konnten nicht hinzugefügt werden.');
    } finally {
      setIsAddingToList(false);
    }
  };

  const [isSavingServings, setIsSavingServings] = useState(false);
  const handleChangeServings = async (delta: number) => {
    if (!recipe) return;
    const newValue = Math.max(1, (recipe.servings ?? 1) + delta);
    if (newValue === recipe.servings) return;
    const previous = recipe;
    // Direkt speichern, kein Zwischenschritt ueber "Bearbeiten" noetig -
    // sofort bei jedem Antippen von +/-, wie gewuenscht.
    setRecipe({ ...recipe, servings: newValue });
    setIsSavingServings(true);
    try {
      await api.patch(`/recipes/${recipeId}`, { servings: newValue });
    } catch (err) {
      setRecipe(previous);
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Portionenzahl konnte nicht gespeichert werden.');
    } finally {
      setIsSavingServings(false);
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
    <>
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
      {recipe.cover_image_url && (
        <Image source={{ uri: recipe.cover_image_url }} style={[styles.heroImage, { borderRadius: radius.md }]} />
      )}
      <Text style={[styles.title, { color: colors.text }]}>{recipe.title}</Text>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: colors.muted }]}>
          {recipe.prep_time_minutes ? `${recipe.prep_time_minutes} min` : ''}
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

      <View style={[styles.servingsCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
        <Text style={[styles.servingsLabel, { color: colors.muted }]}>Portionen</Text>
        <View style={styles.servingsControlRow}>
          <Pressable
            onPress={() => handleChangeServings(-1)}
            disabled={isSavingServings || (recipe.servings ?? 1) <= 1}
            style={[styles.servingsButton, { backgroundColor: colors.bg, borderRadius: radius.sm, opacity: (recipe.servings ?? 1) <= 1 ? 0.4 : 1 }]}
          >
            <MaterialCommunityIcons name="minus" size={22} color={colors.text} />
          </Pressable>
          <Text style={[styles.servingsValue, { color: colors.text }]}>{recipe.servings ?? '–'}</Text>
          <Pressable
            onPress={() => handleChangeServings(1)}
            disabled={isSavingServings}
            style={[styles.servingsButton, { backgroundColor: colors.bg, borderRadius: radius.sm }]}
          >
            <MaterialCommunityIcons name="plus" size={22} color={colors.text} />
          </Pressable>
          {isSavingServings && <ActivityIndicator color={colors.muted} size="small" style={{ marginLeft: 8 }} />}
        </View>
      </View>

      <View style={[styles.sidesCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
        <View style={styles.sidesHeader}>
          <BrutzelAvatar size={36} />
          <Text style={[styles.sidesTitle, { color: colors.text }]}>Passt eine Beilage dazu?</Text>
        </View>

        {isSidesLoading ? (
          <View style={{ paddingVertical: 10, alignItems: 'center' }}>
            <ActivityIndicator color={colors.muted} size="small" />
            <Text style={{ color: colors.muted, fontSize: 11.5, marginTop: 6 }}>Brutzel überlegt, was dazu passt…</Text>
          </View>
        ) : (
          <>
            {sidesError && (
              <Text style={{ color: colors.muted, fontSize: 11.5, marginBottom: 8 }}>
                Keine KI-Vorschläge verfügbar ({sidesError}) - du kannst trotzdem selbst eines dazuwählen.
              </Text>
            )}
            {!sidesError && allSideCandidates.length === 0 && (
              <Text style={{ color: colors.muted, fontSize: 11.5, marginBottom: 8 }}>
                Gerade keine passende Beilage im Kochbuch gefunden.
              </Text>
            )}
            {allSideCandidates.map((s) => {
              const isSelected = selectedSideIds.includes(s.id);
              return (
                <Pressable
                  key={s.id}
                  onPress={() => toggleSideSelect(s.id)}
                  style={[
                    styles.sideRow,
                    { backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: isSelected ? 1.5 : 0, borderColor: gradient[0] },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sideTitle, { color: colors.text }]}>{s.title}</Text>
                    <Text style={[styles.sideReason, { color: colors.muted }]}>{s.reason}</Text>
                  </View>
                  <MaterialCommunityIcons
                    name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                    size={20}
                    color={isSelected ? gradient[0] : colors.muted}
                  />
                </Pressable>
              );
            })}
            <Pressable onPress={openSidePicker} style={styles.searchLink}>
              <MaterialCommunityIcons name="magnify" size={14} color={gradient[0]} />
              <Text style={[styles.searchLinkText, { color: gradient[0] }]}>Anderes Rezept suchen</Text>
            </Pressable>
          </>
        )}
      </View>

      <Pressable
        onPress={() => navigation.navigate('CookMode', { recipeIds: [recipeId, ...selectedSideIds] })}
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

    <Modal visible={isPickerOpen} animationType="slide" onRequestClose={() => setIsPickerOpen(false)}>
      <View style={[styles.pickerContainer, { backgroundColor: colors.bg }]}>
        <View style={styles.pickerHeader}>
          <Text style={[styles.pickerTitle, { color: colors.text }]}>Rezept als Beilage wählen</Text>
          <Pressable onPress={() => setIsPickerOpen(false)} hitSlop={10}>
            <MaterialCommunityIcons name="close" size={24} color={colors.text} />
          </Pressable>
        </View>
        <TextInput
          style={[styles.pickerSearch, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
          placeholder="Rezept suchen…"
          placeholderTextColor={colors.muted}
          value={recipeSearch}
          onChangeText={setRecipeSearch}
        />
        <ScrollView>
          {filteredPickerRecipes.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => addManualSide(r)}
              style={[styles.pickerRow, { backgroundColor: colors.card, borderRadius: radius.sm }]}
            >
              <Text style={{ color: colors.text, fontSize: 13.5 }}>{r.title}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </Modal>
    </>
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
  servingsCard: { alignItems: 'center', padding: 16, marginBottom: 14 },
  servingsLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  servingsControlRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  servingsButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  servingsValue: { fontSize: 34, fontWeight: '800', minWidth: 50, textAlign: 'center' },
  cookButton: { height: 46, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  sidesCard: { padding: 14, marginBottom: 14 },
  sidesHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  sidesTitle: { fontSize: 14, fontWeight: '700', flex: 1 },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, marginBottom: 8 },
  sideTitle: { fontSize: 12.5, fontWeight: '600' },
  sideReason: { fontSize: 10.5, marginTop: 2 },
  searchLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  searchLinkText: { fontSize: 12, fontWeight: '700' },
  pickerContainer: { flex: 1, paddingHorizontal: 18, paddingTop: 60 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 17, fontWeight: '700' },
  pickerSearch: { height: 44, paddingHorizontal: 14, fontSize: 13.5, marginBottom: 14 },
  pickerRow: { padding: 13, marginBottom: 7 },
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
