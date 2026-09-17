import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Modal, TextInput, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import BrutzelAvatar from '../components/BrutzelAvatar';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'SideDishSuggestion'>;

interface SideSuggestion {
  id: string;
  title: string;
  reason: string;
  prep_time_minutes: number | null;
}

interface RecipeSummary {
  id: string;
  title: string;
}

const MAX_SELECTABLE = 2;

export default function SideDishSuggestionScreen({ route, navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { recipeId } = route.params;

  const [suggestions, setSuggestions] = useState<SideSuggestion[]>([]);
  // Manuell dazugesuchte Rezepte (ueber "Anderes Rezept suchen") werden
  // getrennt gefuehrt und der Vorschlagsliste vorangestellt, damit klar
  // bleibt, was von Brutzel kommt und was selbst gewaehlt wurde.
  const [manuallyAdded, setManuallyAdded] = useState<SideSuggestion[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddingToList, setIsAddingToList] = useState(false);

  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [allRecipes, setAllRecipes] = useState<RecipeSummary[]>([]);
  const [recipeSearch, setRecipeSearch] = useState('');

  useEffect(() => {
    // Echte KI-Zuordnung (Brutzel denkt mit): waehlt ausschliesslich aus
    // den eigenen gespeicherten Rezepten, mit Begruendung - schliesst
    // Suessspeisen/weitere Hauptspeisen als "Beilage" bewusst aus (siehe
    // Backend-Prompt). Ersetzt die fruehere, rein heuristische Sortierung
    // nach Zubereitungszeit.
    api
      .post<{ suggestions: SideSuggestion[] }>(`/ai/suggest-sides-for-recipe/${recipeId}`)
      .then((res) => setSuggestions(res.suggestions))
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Vorschläge konnten nicht geladen werden'))
      .finally(() => setIsLoading(false));
  }, [recipeId]);

  const allCandidates = [...manuallyAdded, ...suggestions.filter((s) => !manuallyAdded.some((m) => m.id === s.id))];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECTABLE) return prev; // max. 2 gleichzeitig -> max. 3 Kochvorgaenge parallel (inkl. Hauptgericht)
      return [...prev, id];
    });
  };

  const openPicker = () => {
    setIsPickerOpen(true);
    setRecipeSearch('');
    if (allRecipes.length === 0) {
      api.get<RecipeSummary[]>('/recipes/').then(setAllRecipes).catch(() => {});
    }
  };

  const addManualRecipe = (r: RecipeSummary) => {
    if (r.id === recipeId) return; // Hauptgericht kann nicht seine eigene Beilage sein
    if (!manuallyAdded.some((m) => m.id === r.id) && !suggestions.some((s) => s.id === r.id)) {
      setManuallyAdded((prev) => [...prev, { id: r.id, title: r.title, reason: 'Selbst ausgewählt', prep_time_minutes: null }]);
    }
    toggleSelect(r.id);
    setIsPickerOpen(false);
  };

  const goToCookMode = () => navigation.replace('CookMode', { recipeIds: [recipeId, ...selectedIds] });

  const handleAddToShoppingList = async () => {
    setIsAddingToList(true);
    try {
      await api.post('/shopping-list/add-recipes', { recipe_ids: [recipeId, ...selectedIds] });
      Alert.alert('Erledigt', 'Zutaten wurden zur Einkaufsliste hinzugefügt.');
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Zutaten konnten nicht hinzugefügt werden.');
    } finally {
      setIsAddingToList(false);
    }
  };

  const filteredPickerRecipes = (recipeSearch.trim()
    ? allRecipes.filter((r) => r.title.toLowerCase().includes(recipeSearch.trim().toLowerCase()))
    : allRecipes
  ).filter((r) => r.id !== recipeId);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.header}>
        <BrutzelAvatar size={40} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: colors.text }]}>Passt eine Beilage dazu?</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            Bis zu {MAX_SELECTABLE} auswählen - macht max. 3 parallele Kochvorgänge.
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.text} />
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 10 }}>Brutzel überlegt, was dazu passt…</Text>
        </View>
      ) : (
        <>
          {error && (
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 14 }}>
              Keine KI-Vorschläge verfügbar ({error}) - du kannst trotzdem selbst ein Rezept dazuwählen.
            </Text>
          )}
          {!error && allCandidates.length === 0 && (
            <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 14 }}>
              Brutzel hat gerade keine passende Beilage in deinem Kochbuch gefunden - du kannst selbst eines suchen.
            </Text>
          )}

          {allCandidates.map((s) => {
            const isSelected = selectedIds.includes(s.id);
            return (
              <Pressable
                key={s.id}
                onPress={() => toggleSelect(s.id)}
                style={[
                  styles.suggestionCard,
                  { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: isSelected ? 1.5 : 0, borderColor: gradient[0] },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.recipeTitle, { color: colors.text }]}>{s.title}</Text>
                  <Text style={[styles.recipeReason, { color: colors.muted }]}>{s.reason}</Text>
                </View>
                <MaterialCommunityIcons
                  name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                  size={22}
                  color={isSelected ? gradient[0] : colors.muted}
                />
              </Pressable>
            );
          })}

          <Pressable onPress={openPicker} style={styles.searchLink}>
            <MaterialCommunityIcons name="magnify" size={15} color={gradient[0]} />
            <Text style={[styles.searchLinkText, { color: gradient[0] }]}>Anderes Rezept suchen</Text>
          </Pressable>

          <View style={{ marginTop: 'auto' }}>
            <Pressable
              onPress={handleAddToShoppingList}
              disabled={isAddingToList}
              style={[styles.secondaryButton, { backgroundColor: colors.card, borderRadius: radius.md, opacity: isAddingToList ? 0.7 : 1 }]}
            >
              {isAddingToList ? (
                <ActivityIndicator color={colors.text} size="small" />
              ) : (
                <>
                  <MaterialCommunityIcons name="cart-plus" size={16} color={colors.text} />
                  <Text style={[styles.secondaryButtonText, { color: colors.text }]}>Nur zur Einkaufsliste, noch nicht kochen</Text>
                </>
              )}
            </Pressable>

            <Pressable onPress={goToCookMode} style={[styles.primaryButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
              <Text style={styles.primaryButtonText}>
                {selectedIds.length > 0 ? `Mit ${selectedIds.length} Beilage${selectedIds.length > 1 ? 'n' : ''} kochen` : 'Ohne Beilage kochen'}
              </Text>
            </Pressable>
          </View>
        </>
      )}

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
          {filteredPickerRecipes.map((r) => (
            <Pressable
              key={r.id}
              onPress={() => addManualRecipe(r)}
              style={[styles.pickerRow, { backgroundColor: colors.card, borderRadius: radius.sm }]}
            >
              <Text style={{ color: colors.text, fontSize: 13.5 }}>{r.title}</Text>
            </Pressable>
          ))}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 18 },
  title: { fontSize: 17, fontWeight: '700' },
  subtitle: { fontSize: 11.5, marginTop: 3 },
  suggestionCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, marginBottom: 10 },
  recipeTitle: { fontSize: 14, fontWeight: '600' },
  recipeReason: { fontSize: 11, marginTop: 3 },
  searchLink: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, marginBottom: 10 },
  searchLinkText: { fontSize: 12.5, fontWeight: '700' },
  secondaryButton: { flexDirection: 'row', gap: 7, height: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  secondaryButtonText: { fontSize: 12.5, fontWeight: '700' },
  primaryButton: { height: 48, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  pickerContainer: { flex: 1, paddingHorizontal: 18, paddingTop: 60 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 17, fontWeight: '700' },
  pickerSearch: { height: 44, paddingHorizontal: 14, fontSize: 13.5, marginBottom: 14 },
  pickerRow: { padding: 13, marginBottom: 7 },
});
