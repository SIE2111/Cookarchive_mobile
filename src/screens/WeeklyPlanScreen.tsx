import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'WeeklyPlan'>;

type MealSlot = 'fruehstueck' | 'mittag' | 'abend';
const MEAL_SLOTS: { key: MealSlot; title: string }[] = [
  { key: 'fruehstueck', title: 'Frühstück' },
  { key: 'mittag', title: 'Mittag' },
  { key: 'abend', title: 'Abend' },
];
const WEEKDAY_NAMES = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

interface PlanEntry {
  id: string;
  plan_date: string; // YYYY-MM-DD
  meal_slot: MealSlot;
  recipe_id: string;
  recipe_title: string;
  recipe_cover_image_url: string | null;
  servings: number | null;
}

interface RecipeSummary {
  id: string;
  title: string;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatShort(d: Date): string {
  return d.toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit' });
}

// Montag der Woche zu einem gegebenen Referenzdatum + Wochen-Offset
function getMondayOfWeek(reference: Date, weekOffset: number): Date {
  const d = new Date(reference);
  d.setDate(d.getDate() + weekOffset * 7);
  const day = d.getDay(); // 0=Sonntag, 1=Montag, ...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diffToMonday);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function WeeklyPlanScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const [weekOffset, setWeekOffset] = useState(0);
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingToList, setIsAddingToList] = useState(false);

  const [pickerTarget, setPickerTarget] = useState<{ dateKey: string; slot: MealSlot } | null>(null);
  const [allRecipes, setAllRecipes] = useState<RecipeSummary[]>([]);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [defaultServings, setDefaultServings] = useState(4);
  const [servingsInput, setServingsInput] = useState('4');

  useEffect(() => {
    api
      .get<{ default_servings: number }>('/preferences/')
      .then((prefs) => setDefaultServings(prefs.default_servings))
      .catch(() => {
        // Vorgabe konnte nicht geladen werden - bleibt beim Fallback 4,
        // kein Grund den Wochenplan zu blockieren
      });
  }, []);

  const monday = getMondayOfWeek(new Date(), weekOffset);
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(d.getDate() + i);
    return d;
  });
  const startKey = toDateKey(weekDays[0]);
  const endKey = toDateKey(weekDays[6]);

  const loadWeek = useCallback(() => {
    setIsLoading(true);
    api
      .get<PlanEntry[]>(`/weekly-plan/?start_date=${startKey}&end_date=${endKey}`)
      .then(setEntries)
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Wochenplan konnte nicht geladen werden'))
      .finally(() => setIsLoading(false));
  }, [startKey, endKey]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  const openPicker = (dateKey: string, slot: MealSlot) => {
    setPickerTarget({ dateKey, slot });
    setRecipeSearch('');
    setServingsInput(String(defaultServings));
    if (allRecipes.length === 0) {
      api.get<RecipeSummary[]>('/recipes/').then(setAllRecipes).catch(() => {});
    }
  };

  const assignRecipe = async (recipeId: string) => {
    if (!pickerTarget) return;
    const servings = servingsInput.trim() ? Number(servingsInput.trim()) : null;
    try {
      await api.post('/weekly-plan/', {
        plan_date: pickerTarget.dateKey,
        meal_slot: pickerTarget.slot,
        recipe_id: recipeId,
        servings,
      });
      setPickerTarget(null);
      loadWeek();
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Konnte nicht zugewiesen werden');
    }
  };

  const removeEntry = (entryId: string) => {
    Alert.alert('Entfernen?', 'Diese Zuweisung wieder entfernen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Entfernen',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/weekly-plan/${entryId}`);
            loadWeek();
          } catch (err) {
            Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Konnte nicht entfernt werden');
          }
        },
      },
    ]);
  };

  const handleAddWeekToShoppingList = () => {
    if (entries.length === 0) {
      Alert.alert('Noch leer', 'Für diese Woche ist noch kein Rezept eingeplant.');
      return;
    }
    Alert.alert(
      'Zur Einkaufsliste hinzufügen?',
      'Sollen die Zutaten aller diese Woche eingeplanten Rezepte zur Einkaufsliste hinzugefügt werden?',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Hinzufügen',
          onPress: async () => {
            setIsAddingToList(true);
            try {
              const result = await api.post<{ recipes_count: number }>('/weekly-plan/add-to-shopping-list', {
                start_date: startKey,
                end_date: endKey,
              });
              Alert.alert('Erledigt', `Zutaten aus ${result.recipes_count} Rezept(en) zur Einkaufsliste hinzugefügt.`);
            } catch (err) {
              Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Konnte nicht hinzugefügt werden');
            } finally {
              setIsAddingToList(false);
            }
          },
        },
      ],
    );
  };

  const entryFor = (dateKey: string, slot: MealSlot) =>
    entries.find((e) => e.plan_date === dateKey && e.meal_slot === slot);

  const filteredRecipes = recipeSearch.trim()
    ? allRecipes.filter((r) => r.title.toLowerCase().includes(recipeSearch.trim().toLowerCase()))
    : allRecipes;

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={styles.weekNav}>
        <Pressable onPress={() => setWeekOffset((w) => w - 1)} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-left" size={24} color={colors.text} />
        </Pressable>
        <Text style={[styles.weekLabel, { color: colors.text }]}>
          {weekOffset === 0 ? 'Diese Woche' : formatShort(weekDays[0]) + ' – ' + formatShort(weekDays[6])}
        </Text>
        <Pressable onPress={() => setWeekOffset((w) => w + 1)} hitSlop={10}>
          <MaterialCommunityIcons name="chevron-right" size={24} color={colors.text} />
        </Pressable>
      </View>

      <Pressable
        onPress={handleAddWeekToShoppingList}
        disabled={isAddingToList}
        style={[styles.addAllButton, { backgroundColor: gradient[0], borderRadius: radius.md, opacity: isAddingToList ? 0.7 : 1 }]}
      >
        {isAddingToList ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <>
            <MaterialCommunityIcons name="cart-plus" size={16} color="#fff" />
            <Text style={styles.addAllButtonText}>Zutaten der Woche zur Einkaufsliste</Text>
          </>
        )}
      </Pressable>

      {error && <Text style={{ color: '#DC2626', fontSize: 12, marginTop: 10 }}>{error}</Text>}

      {isLoading ? (
        <ActivityIndicator color={colors.text} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView contentContainerStyle={{ paddingBottom: 40, paddingTop: 6 }}>
          {weekDays.map((day, i) => {
            const dateKey = toDateKey(day);
            const isToday = toDateKey(new Date()) === dateKey;
            return (
              <View key={dateKey} style={styles.daySection}>
                <Text style={[styles.dayLabel, { color: isToday ? gradient[0] : colors.text }]}>
                  {WEEKDAY_NAMES[i]}, {formatShort(day)}
                </Text>
                {MEAL_SLOTS.map((slot) => {
                  const entry = entryFor(dateKey, slot.key);
                  return (
                    <Pressable
                      key={slot.key}
                      onPress={() => (entry ? removeEntry(entry.id) : openPicker(dateKey, slot.key))}
                      onLongPress={() => openPicker(dateKey, slot.key)}
                      style={[styles.slotRow, { backgroundColor: colors.card, borderRadius: radius.sm }]}
                    >
                      <Text style={[styles.slotLabel, { color: colors.muted }]}>{slot.title}</Text>
                      {entry ? (
                        <View style={styles.slotFilled}>
                          <Text style={[styles.slotRecipeTitle, { color: colors.text }]} numberOfLines={1}>
                            {entry.recipe_title}
                            {entry.servings ? ` · ${entry.servings} Port.` : ''}
                          </Text>
                          <MaterialCommunityIcons name="close-circle-outline" size={16} color={colors.muted} />
                        </View>
                      ) : (
                        <Text style={[styles.slotEmpty, { color: gradient[0] }]}>+ Rezept wählen</Text>
                      )}
                    </Pressable>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      )}

      <Modal visible={pickerTarget !== null} animationType="slide" onRequestClose={() => setPickerTarget(null)}>
        <View style={[styles.pickerContainer, { backgroundColor: colors.bg }]}>
          <View style={styles.pickerHeader}>
            <Text style={[styles.pickerTitle, { color: colors.text }]}>Rezept wählen</Text>
            <Pressable onPress={() => setPickerTarget(null)} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.servingsRow}>
            <Text style={{ color: colors.muted, fontSize: 12.5 }}>Portionen:</Text>
            <TextInput
              value={servingsInput}
              onChangeText={setServingsInput}
              keyboardType="numeric"
              style={[styles.servingsInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.sm }]}
            />
          </View>
          <TextInput
            style={[styles.pickerSearch, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
            placeholder="Rezept suchen…"
            placeholderTextColor={colors.muted}
            value={recipeSearch}
            onChangeText={setRecipeSearch}
          />
          <ScrollView>
            {filteredRecipes.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => assignRecipe(r.id)}
                style={[styles.pickerRow, { backgroundColor: colors.card, borderRadius: radius.sm }]}
              >
                <Text style={{ color: colors.text, fontSize: 13.5 }}>{r.title}</Text>
              </Pressable>
            ))}
            {filteredRecipes.length === 0 && (
              <Text style={{ color: colors.muted, fontSize: 12.5, textAlign: 'center', marginTop: 30 }}>
                Keine Rezepte gefunden.
              </Text>
            )}
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 12 },
  weekNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  weekLabel: { fontSize: 15, fontWeight: '700' },
  addAllButton: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', height: 44 },
  addAllButtonText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  daySection: { marginBottom: 18 },
  dayLabel: { fontSize: 13.5, fontWeight: '700', marginBottom: 8 },
  slotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, marginBottom: 6 },
  slotLabel: { fontSize: 11, fontWeight: '600', width: 70 },
  slotFilled: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  slotRecipeTitle: { fontSize: 13, fontWeight: '600', flex: 1 },
  slotEmpty: { fontSize: 12, fontWeight: '600' },
  pickerContainer: { flex: 1, paddingHorizontal: 18, paddingTop: 60 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 17, fontWeight: '700' },
  pickerSearch: { height: 44, paddingHorizontal: 14, fontSize: 13.5, marginBottom: 14 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  servingsInput: { width: 60, height: 38, paddingHorizontal: 10, fontSize: 13.5, textAlign: 'center' },
  pickerRow: { padding: 13, marginBottom: 7 },
});
