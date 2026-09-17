import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, Pressable, Image, Alert, Modal, TextInput, Keyboard } from 'react-native';
import * as Sharing from 'expo-sharing';
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
  is_favorite: boolean;
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

  // Brutzel prueft das Rezept auf Verbesserungsvorschlaege (nutzt den schon
  // laenger bestehenden, aber bisher nie an die App angebundenen Endpunkt
  // POST /ai/review-recipe/{id}). Ausgewaehlte Vorschlaege werden beim
  // Uebernehmen an personal_note angehaengt - landen damit dauerhaft im
  // Kochbuch UND sind beim naechsten Kochen sichtbar (personal_note wird
  // im Rezept-Detail angezeigt), nicht nur einmalig hier zu sehen.
  const [isReviewing, setIsReviewing] = useState(false);
  const [reviewSuggestions, setReviewSuggestions] = useState<{ title: string; detail: string }[] | null>(null);
  const [reviewWebVerified, setReviewWebVerified] = useState(false);
  const [selectedSuggestionIndices, setSelectedSuggestionIndices] = useState<number[]>([]);
  const [isApplyingSuggestions, setIsApplyingSuggestions] = useState(false);

  const handleReviewRecipe = async () => {
    setIsReviewing(true);
    setReviewSuggestions(null);
    setSelectedSuggestionIndices([]);
    try {
      const result = await api.post<{ web_verified: boolean; suggestions: { title: string; detail: string }[] }>(
        `/ai/review-recipe/${recipeId}`,
      );
      setReviewSuggestions(result.suggestions);
      setReviewWebVerified(result.web_verified);
    } catch (err) {
      Alert.alert('Prüfung fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsReviewing(false);
    }
  };

  const toggleSuggestionSelect = (index: number) => {
    setSelectedSuggestionIndices((prev) =>
      prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
    );
  };

  const handleApplySuggestions = async () => {
    if (!recipe || !reviewSuggestions || selectedSuggestionIndices.length === 0) return;
    const chosenText = selectedSuggestionIndices
      .map((i) => `${reviewSuggestions[i].title}: ${reviewSuggestions[i].detail}`)
      .join('\n');
    const newNote = recipe.personal_note ? `${recipe.personal_note}\n${chosenText}` : chosenText;
    setIsApplyingSuggestions(true);
    try {
      const updated = await api.patch<RecipeDetail>(`/recipes/${recipeId}`, { personal_note: newNote });
      setRecipe(updated);
      setReviewSuggestions(null);
      setSelectedSuggestionIndices([]);
      setSessionOnlyNote(null); // dauerhaft uebernommen -> ersetzt eine evtl. vorher gewaehlte Nur-diesmal-Notiz
      Alert.alert('Übernommen', 'Die ausgewählten Vorschläge wurden als Notiz ins Rezept übernommen.');
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Konnte nicht übernommen werden.');
    } finally {
      setIsApplyingSuggestions(false);
    }
  };

  // "Nur fuer diesen Kochvorgang": KEIN Speichern im Rezept - die gewaehlten
  // Vorschlaege werden stattdessen beim Kochstart als sessionNote an den
  // Koch-Modus mitgegeben (siehe navigation.navigate('CookMode', ...) unten)
  // und dort nur einmalig angezeigt, das gespeicherte Rezept bleibt unberuehrt.
  const [sessionOnlyNote, setSessionOnlyNote] = useState<string | null>(null);
  const handleApplySuggestionsForThisCookOnly = () => {
    if (!reviewSuggestions || selectedSuggestionIndices.length === 0) return;
    const chosenText = selectedSuggestionIndices
      .map((i) => `${reviewSuggestions[i].title}: ${reviewSuggestions[i].detail}`)
      .join('\n');
    setSessionOnlyNote(chosenText);
    setReviewSuggestions(null);
    setSelectedSuggestionIndices([]);
    Alert.alert('Vorgemerkt', 'Wird beim Start der Zubereitung einmalig angezeigt, aber nicht dauerhaft im Rezept gespeichert.');
  };

  // Zutaten/Schritte VOR dem Kochstart bearbeiten - gleiche Abfrage wie im
  // Koch-Modus selbst (SingleRecipeCookView). "Nur diesmal" speichert
  // NICHTS im Rezept, sondern merkt die Aenderung lokal vor und gibt sie
  // beim Kochstart als sessionOverrides an CookMode mit (nur fuers
  // Hauptgericht, recipeIds[0] - siehe CookModeScreen.tsx).
  const [sessionIngredientsOverride, setSessionIngredientsOverride] = useState<Ingredient[] | null>(null);
  const [sessionStepsOverride, setSessionStepsOverride] = useState<Step[] | null>(null);
  const [isEditingStepIndex, setIsEditingStepIndex] = useState<number | null>(null);
  const [stepTextDraft, setStepTextDraft] = useState('');
  const [isSavingStepText, setIsSavingStepText] = useState(false);
  const [editingIngredientIndex, setEditingIngredientIndex] = useState<number | null>(null);
  const [ingredientDraft, setIngredientDraft] = useState({ name: '', amount: '', unit: '' });
  const [isSavingIngredient, setIsSavingIngredient] = useState(false);

  const currentIngredients = sessionIngredientsOverride ?? recipe?.ingredients ?? [];
  const currentSteps = sessionStepsOverride ?? recipe?.steps ?? [];

  const saveRecipeChangeWithScope = (
    updatedFields: { ingredients?: Ingredient[]; steps?: Step[] },
    applyLocally: () => void,
    applySessionOnly: () => void,
    setSaving: (v: boolean) => void,
    onDone: () => void,
  ) => {
    Keyboard.dismiss();
    Alert.alert(
      'Änderung speichern',
      'Soll das dauerhaft im Rezept gespeichert werden (auch bei künftigen Malen sichtbar) oder gilt es nur für diesen einen Kochvorgang?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Nur diesmal', onPress: () => { applySessionOnly(); onDone(); } },
        {
          text: 'Dauerhaft im Rezept',
          onPress: async () => {
            setSaving(true);
            try {
              const updated = await api.patch<RecipeDetail>(`/recipes/${recipeId}`, updatedFields);
              setRecipe(updated);
              applyLocally();
              onDone();
            } catch (err) {
              Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Konnte nicht gespeichert werden');
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };

  const handleOpenStepEdit = (index: number) => {
    setStepTextDraft(currentSteps[index].text);
    setIsEditingStepIndex(index);
  };

  const handleSaveStepEdit = () => {
    if (isEditingStepIndex === null || !stepTextDraft.trim()) return;
    const updated = currentSteps.map((s, i) => (i === isEditingStepIndex ? { ...s, text: stepTextDraft.trim() } : s));
    saveRecipeChangeWithScope(
      { steps: updated },
      () => {},
      () => setSessionStepsOverride(updated),
      setIsSavingStepText,
      () => setIsEditingStepIndex(null),
    );
  };

  const handleDeleteStep = () => {
    if (isEditingStepIndex === null) return;
    if (currentSteps.length <= 1) {
      Alert.alert('Nicht möglich', 'Ein Rezept braucht mindestens einen Schritt.');
      return;
    }
    const updated = currentSteps.filter((_, i) => i !== isEditingStepIndex);
    saveRecipeChangeWithScope(
      { steps: updated },
      () => {},
      () => setSessionStepsOverride(updated),
      setIsSavingStepText,
      () => setIsEditingStepIndex(null),
    );
  };

  const handleOpenIngredientEdit = (index: number) => {
    const ing = currentIngredients[index];
    setIngredientDraft({ name: ing.name, amount: ing.amount != null ? String(ing.amount) : '', unit: ing.unit ?? '' });
    setEditingIngredientIndex(index);
  };

  const handleSaveIngredientEdit = () => {
    if (editingIngredientIndex === null || !ingredientDraft.name.trim()) return;
    const updated = currentIngredients.map((ing, i) =>
      i === editingIngredientIndex
        ? {
            name: ingredientDraft.name.trim(),
            amount: ingredientDraft.amount.trim() ? Number(ingredientDraft.amount.trim()) : null,
            unit: ingredientDraft.unit.trim() || null,
          }
        : ing,
    );
    saveRecipeChangeWithScope(
      { ingredients: updated },
      () => {},
      () => setSessionIngredientsOverride(updated),
      setIsSavingIngredient,
      () => setEditingIngredientIndex(null),
    );
  };

  const handleDeleteIngredient = () => {
    if (editingIngredientIndex === null) return;
    const updated = currentIngredients.filter((_, i) => i !== editingIngredientIndex);
    saveRecipeChangeWithScope(
      { ingredients: updated },
      () => {},
      () => setSessionIngredientsOverride(updated),
      setIsSavingIngredient,
      () => setEditingIngredientIndex(null),
    );
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

  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const handlePrintRecipe = async () => {
    setIsExportingPdf(true);
    try {
      const localUri = await api.downloadFile(`/recipes/${recipeId}/pdf`, `rezept-${recipeId}.pdf`);
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Nicht verfügbar', 'Teilen/Drucken wird auf diesem Gerät nicht unterstützt.');
        return;
      }
      await Sharing.shareAsync(localUri, { mimeType: 'application/pdf', dialogTitle: recipe?.title ?? 'Rezept' });
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Das Rezept-PDF konnte nicht erstellt werden.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const [isSavingServings, setIsSavingServings] = useState(false);
  const servingsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleChangeServings = (delta: number) => {
    setRecipe((prev) => {
      if (!prev) return prev;
      const newValue = Math.max(1, (prev.servings ?? 1) + delta);
      if (newValue === prev.servings) return prev;

      // Entprellen: bei schnell mehrfachem Antippen von +/- nicht bei jedem
      // einzelnen Tap sofort speichern (das liess den Ladekreis dazwischen
      // aufblitzen und wirkte hakelig) - erst 500ms nach dem letzten Tap
      // tatsaechlich einen PATCH schicken, die Anzeige zaehlt zwischendurch
      // aber weiterhin sofort optimistisch mit.
      if (servingsDebounceRef.current) clearTimeout(servingsDebounceRef.current);
      servingsDebounceRef.current = setTimeout(async () => {
        setIsSavingServings(true);
        try {
          await api.patch(`/recipes/${recipeId}`, { servings: newValue });
        } catch (err) {
          Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Portionenzahl konnte nicht gespeichert werden.');
        } finally {
          setIsSavingServings(false);
        }
      }, 500);

      return { ...prev, servings: newValue };
    });
  };

  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const handleToggleFavorite = async () => {
    if (!recipe || isSavingFavorite) return;
    const previous = recipe;
    const newValue = !recipe.is_favorite;
    setRecipe({ ...recipe, is_favorite: newValue });
    setIsSavingFavorite(true);
    try {
      await api.patch(`/recipes/${recipeId}`, { is_favorite: newValue });
    } catch (err) {
      setRecipe(previous);
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Konnte nicht gespeichert werden.');
    } finally {
      setIsSavingFavorite(false);
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
      <View style={styles.titleRow}>
        <Text style={[styles.title, { color: colors.text, flex: 1 }]}>{recipe.title}</Text>
        <Pressable onPress={handleToggleFavorite} disabled={isSavingFavorite} hitSlop={10} style={{ paddingLeft: 8 }}>
          <MaterialCommunityIcons
            name={recipe.is_favorite ? 'heart' : 'heart-outline'}
            size={26}
            color={recipe.is_favorite ? gradient[0] : colors.muted}
          />
        </Pressable>
      </View>
      <View style={styles.metaRow}>
        <Text style={[styles.meta, { color: colors.muted }]}>
          {recipe.prep_time_minutes ? `${recipe.prep_time_minutes} min` : ''}
        </Text>
        <View style={{ flexDirection: 'row', gap: 18 }}>
          <Pressable onPress={() => navigation.navigate('ManualRecipe', { recipeId: recipe.id })} hitSlop={8}>
            <MaterialCommunityIcons name="pencil-outline" size={22} color="#16A34A" />
          </Pressable>
          <Pressable onPress={handleDelete} hitSlop={8}>
            <MaterialCommunityIcons name="trash-can-outline" size={22} color="#DC2626" />
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

      <Pressable
        onPress={() =>
          navigation.navigate('CookMode', {
            recipeIds: [recipeId, ...selectedSideIds],
            sessionNote: sessionOnlyNote ?? undefined,
            sessionOverrides:
              sessionIngredientsOverride || sessionStepsOverride
                ? { ingredients: sessionIngredientsOverride ?? undefined, steps: sessionStepsOverride ?? undefined }
                : undefined,
          })
        }
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

      <Pressable
        onPress={handlePrintRecipe}
        disabled={isExportingPdf}
        style={[styles.shoppingListButton, { backgroundColor: colors.card, borderRadius: radius.md, opacity: isExportingPdf ? 0.7 : 1 }]}
      >
        {isExportingPdf ? (
          <ActivityIndicator color={colors.text} size="small" />
        ) : (
          <>
            <MaterialCommunityIcons name="printer-outline" size={16} color={colors.text} />
            <Text style={[styles.shoppingListButtonText, { color: colors.text }]}>Rezept drucken / als PDF</Text>
          </>
        )}
      </Pressable>

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

      <View style={[styles.sidesCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
        <View style={styles.sidesHeader}>
          <BrutzelAvatar size={36} />
          <Text style={[styles.sidesTitle, { color: colors.text }]}>Rezept auf Verbesserungen prüfen?</Text>
        </View>

        {!reviewSuggestions && !isReviewing && (
          <Pressable onPress={handleReviewRecipe} style={[styles.reviewButton, { backgroundColor: gradient[0], borderRadius: radius.sm }]}>
            <Text style={styles.reviewButtonText}>Brutzel prüft das Rezept</Text>
          </Pressable>
        )}

        {isReviewing && (
          <View style={{ paddingVertical: 10, alignItems: 'center' }}>
            <ActivityIndicator color={colors.muted} size="small" />
            <Text style={{ color: colors.muted, fontSize: 11.5, marginTop: 6 }}>Brutzel prüft das Rezept…</Text>
          </View>
        )}

        {reviewSuggestions && reviewSuggestions.length === 0 && (
          <Text style={{ color: colors.muted, fontSize: 11.5 }}>
            Sieht schon gut aus – Brutzel hat nichts Wesentliches zu ergänzen.
          </Text>
        )}

        {reviewSuggestions && reviewSuggestions.length > 0 && (
          <>
            <Text style={{ color: colors.muted, fontSize: 10.5, marginBottom: 8 }}>
              {reviewWebVerified ? '🌐 Gegen aktuelle Quellen im Internet geprüft' : '⚠️ Ohne Websuche geprüft (nur KI-Wissen)'}
            </Text>
            {reviewSuggestions.map((s, i) => {
              const isSelected = selectedSuggestionIndices.includes(i);
              return (
                <Pressable
                  key={i}
                  onPress={() => toggleSuggestionSelect(i)}
                  style={[
                    styles.sideRow,
                    { backgroundColor: colors.bg, borderRadius: radius.sm, borderWidth: isSelected ? 1.5 : 0, borderColor: gradient[0] },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.sideTitle, { color: colors.text }]}>{s.title}</Text>
                    <Text style={[styles.sideReason, { color: colors.muted }]}>{s.detail}</Text>
                  </View>
                  <MaterialCommunityIcons
                    name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                    size={20}
                    color={isSelected ? gradient[0] : colors.muted}
                  />
                </Pressable>
              );
            })}
            <Pressable
              onPress={handleApplySuggestions}
              disabled={selectedSuggestionIndices.length === 0 || isApplyingSuggestions}
              style={[
                styles.reviewButton,
                { backgroundColor: gradient[0], borderRadius: radius.sm, opacity: selectedSuggestionIndices.length === 0 ? 0.5 : 1, marginTop: 4 },
              ]}
            >
              {isApplyingSuggestions ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.reviewButtonText}>
                  {selectedSuggestionIndices.length > 0 ? `${selectedSuggestionIndices.length} ins Kochbuch übernehmen` : 'Auswählen zum Übernehmen'}
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={handleApplySuggestionsForThisCookOnly}
              disabled={selectedSuggestionIndices.length === 0}
              style={[styles.secondaryReviewButton, { borderColor: gradient[0], borderRadius: radius.sm, opacity: selectedSuggestionIndices.length === 0 ? 0.5 : 1 }]}
            >
              <Text style={[styles.secondaryReviewButtonText, { color: gradient[0] }]}>Nur für diesen Kochvorgang</Text>
            </Pressable>
          </>
        )}
      </View>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Zutaten</Text>
      {currentIngredients.map((ing, i) => (
        <Pressable key={i} onPress={() => handleOpenIngredientEdit(i)} style={styles.ingredientRow}>
          <Text style={[styles.ingredient, { color: colors.text, fontSize: largeText ? 16.5 : 13.5, flex: 1 }]}>
            {ing.amount ? `${ing.amount} ${ing.unit ?? ''} ` : ''}
            {ing.name}
          </Text>
          <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.muted} />
        </Pressable>
      ))}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Zubereitung</Text>
      {currentSteps.map((step, i) => (
        <View key={step.order} style={[styles.stepCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[styles.stepNumber, { color: colors.muted }]}>Schritt {step.order}</Text>
            <Pressable onPress={() => handleOpenStepEdit(i)} hitSlop={8}>
              <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.muted} />
            </Pressable>
          </View>
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

    <Modal visible={isEditingStepIndex !== null} transparent animationType="fade" onRequestClose={() => setIsEditingStepIndex(null)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Kochschritt bearbeiten</Text>
          <TextInput
            style={[styles.modalInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
            value={stepTextDraft}
            onChangeText={setStepTextDraft}
            multiline
            autoFocus
          />
          <View style={[styles.modalButtonRow, { justifyContent: 'space-between' }]}>
            <Pressable onPress={handleDeleteStep} hitSlop={8}>
              <MaterialCommunityIcons name="trash-can-outline" size={22} color="#DC2626" />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <Pressable onPress={() => { Keyboard.dismiss(); setIsEditingStepIndex(null); }} style={styles.modalCancelButton}>
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveStepEdit}
                disabled={isSavingStepText}
                style={[styles.modalSaveButton, { backgroundColor: gradient[0], borderRadius: radius.sm, opacity: isSavingStepText ? 0.7 : 1 }]}
              >
                {isSavingStepText ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Speichern</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>

    <Modal visible={editingIngredientIndex !== null} transparent animationType="fade" onRequestClose={() => setEditingIngredientIndex(null)}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalCard, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
          <Text style={[styles.modalTitle, { color: colors.text }]}>Zutat bearbeiten</Text>
          <TextInput
            style={[styles.modalInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md, marginBottom: 8 }]}
            placeholder="Name"
            placeholderTextColor={colors.muted}
            value={ingredientDraft.name}
            onChangeText={(v) => setIngredientDraft((prev) => ({ ...prev, name: v }))}
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              style={[styles.modalInput, { flex: 1, backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
              placeholder="Menge"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={ingredientDraft.amount}
              onChangeText={(v) => setIngredientDraft((prev) => ({ ...prev, amount: v }))}
            />
            <TextInput
              style={[styles.modalInput, { flex: 1, backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
              placeholder="Einheit"
              placeholderTextColor={colors.muted}
              value={ingredientDraft.unit}
              onChangeText={(v) => setIngredientDraft((prev) => ({ ...prev, unit: v }))}
            />
          </View>
          <View style={[styles.modalButtonRow, { justifyContent: 'space-between' }]}>
            <Pressable onPress={handleDeleteIngredient} hitSlop={8}>
              <MaterialCommunityIcons name="trash-can-outline" size={22} color="#DC2626" />
            </Pressable>
            <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
              <Pressable onPress={() => { Keyboard.dismiss(); setEditingIngredientIndex(null); }} style={styles.modalCancelButton}>
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveIngredientEdit}
                disabled={isSavingIngredient}
                style={[styles.modalSaveButton, { backgroundColor: gradient[0], borderRadius: radius.sm, opacity: isSavingIngredient ? 0.7 : 1 }]}
              >
                {isSavingIngredient ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Speichern</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 24 },
  modalCard: { padding: 20 },
  modalTitle: { fontSize: 15, fontWeight: '700', marginBottom: 12 },
  modalInput: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, alignItems: 'center', marginTop: 14 },
  modalCancelButton: { paddingVertical: 8 },
  modalCancelText: { fontSize: 13, fontWeight: '600' },
  modalSaveButton: { paddingHorizontal: 20, paddingVertical: 10 },
  modalSaveText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  container: { padding: 18, paddingBottom: 60 },
  heroImage: { width: '100%', height: 180, marginBottom: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 20 },
  meta: { fontSize: 12 },
  sourceHint: { fontSize: 10.5, marginTop: -12, marginBottom: 18 },
  servingsCard: { alignItems: 'center', padding: 16, marginBottom: 14 },
  servingsLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' },
  servingsControlRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  servingsButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center' },
  servingsValue: { fontSize: 34, fontWeight: '800', minWidth: 50, textAlign: 'center' },
  cookButton: { height: 46, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  sidesCard: { padding: 14, marginBottom: 14 },
  reviewButton: { height: 42, alignItems: 'center', justifyContent: 'center' },
  reviewButtonText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  secondaryReviewButton: { height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 8, borderWidth: 1.5 },
  secondaryReviewButtonText: { fontWeight: '700', fontSize: 12 },
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
  ingredientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2 },
  stepCard: { padding: 14, marginBottom: 10 },
  stepNumber: { fontSize: 10, fontWeight: '600', marginBottom: 4 },
  stepText: { fontSize: 14, lineHeight: 21 },
  noteCard: { backgroundColor: '#FEF3C7', padding: 12, marginTop: 8 },
  noteLabel: { fontSize: 11, fontWeight: '600', color: '#92400E', marginBottom: 3 },
  noteText: { fontSize: 12.5, fontStyle: 'italic' },
});
