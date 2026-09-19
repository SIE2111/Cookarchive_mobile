import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, Alert, Modal, TextInput } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'WeeklyPlan'>;

type MealSlot = 'fruehstueck' | 'mittag' | 'abend';
// Schluessel statt Texte: Die Tabellen werden einmal beim Laden der
// Datei ausgewertet, ein Text darin bliebe fuer immer in der Sprache des
// ersten Starts.
const MEAL_SLOTS: { key: MealSlot; title: string }[] = [
  { key: 'fruehstueck', title: 'wochenplan.fruehstueck' },
  { key: 'mittag', title: 'wochenplan.mittag' },
  { key: 'abend', title: 'wochenplan.abend' },
];
const WEEKDAY_KEYS = [
  'wochenplan.montag', 'wochenplan.dienstag', 'wochenplan.mittwoch', 'wochenplan.donnerstag',
  'wochenplan.freitag', 'wochenplan.samstag', 'wochenplan.sonntag',
];

interface PlanEntry {
  id: string;
  plan_date: string; // YYYY-MM-DD
  meal_slot: MealSlot;
  recipe_id: string;
  recipe_title: string;
  recipe_cover_image_url: string | null;
  servings: number | null;
  position: number; // 0 = Hauptgericht, 1-2 = Beilage
}

interface RecipeSummary {
  id: string;
  title: string;
}

function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatShort(d: Date): string {
  // Von Hand statt toLocaleDateString('de-AT'): Die Datumsformatierung
  // ueber Intl haengt auf Android davon ab, ob die JS-Engine mit vollem
  // ICU gebaut wurde. Fehlt es, faellt sie stillschweigend auf ein
  // amerikanisches Format zurueck - aus 24.12. wird 12/24. Zwei
  // Zeilen selbst gerechnet sind hier verlaesslicher als eine Bibliothek,
  // deren Verhalten je nach Geraet anders ist.
  const tag = String(d.getDate()).padStart(2, '0');
  const monat = String(d.getMonth() + 1).padStart(2, '0');
  return `${tag}.${monat}.`;
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
  const { t } = useUebersetzung();
  const [weekOffset, setWeekOffset] = useState(0);
  const [entries, setEntries] = useState<PlanEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAddingToList, setIsAddingToList] = useState(false);

  const [pickerTarget, setPickerTarget] = useState<{ dateKey: string; slot: MealSlot; position?: number } | null>(null);
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
      .catch((err) => setError(err instanceof ApiError ? err.detail : t('wochenplan.nichtGeladen')))
      .finally(() => setIsLoading(false));
  }, [startKey, endKey]);

  useEffect(() => {
    loadWeek();
  }, [loadWeek]);

  // Welche Mahlzeiten ihre Beilagen-Zeilen zeigen. Eingeklappt sieht man
  // nur das Hauptgericht - bei sieben Tagen mal drei Mahlzeiten mal drei
  // Zeilen waeren es sonst 63 Zeilen auf einem Handy-Bildschirm, und die
  // allermeisten davon leer.
  const [expandedSlots, setExpandedSlots] = useState<Record<string, boolean>>({});
  const slotKey = (dateKey: string, slot: MealSlot) => `${dateKey}|${slot}`;

  const openPicker = (dateKey: string, slot: MealSlot, position?: number) => {
    setPickerTarget({ dateKey, slot, position });
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
        // Ohne Position sucht das Backend den naechsten freien Platz.
        position: pickerTarget.position ?? null,
      });
      setPickerTarget(null);
      loadWeek();
    } catch (err) {
      Alert.alert(t('allgemein.fehler'), err instanceof ApiError ? err.detail : t('wochenplan.nichtZugewiesen'));
    }
  };

  const removeEntry = (entryId: string) => {
    Alert.alert(t('wochenplan.entfernenFrage'), t('wochenplan.entfernenText'), [
      { text: t('allgemein.abbrechen'), style: 'cancel' },
      {
        text: t('allgemein.entfernen'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/weekly-plan/${entryId}`);
            loadWeek();
          } catch (err) {
            Alert.alert(t('allgemein.fehler'), err instanceof ApiError ? err.detail : t('wochenplan.nichtEntfernt'));
          }
        },
      },
    ]);
  };

  const handleAddWeekToShoppingList = () => {
    if (entries.length === 0) {
      Alert.alert(t('wochenplan.nochLeer'), t('wochenplan.keinRezeptGeplant'));
      return;
    }
    Alert.alert(
      t('wochenplan.zurListeFrage'),
      t('wochenplan.zurListeText'),
      [
        { text: t('allgemein.abbrechen'), style: 'cancel' },
        {
          text: t('wochenplan.hinzufuegen'),
          onPress: async () => {
            setIsAddingToList(true);
            try {
              const result = await api.post<{ recipes_count: number }>('/weekly-plan/add-to-shopping-list', {
                start_date: startKey,
                end_date: endKey,
              });
              Alert.alert(t('wochenplan.erledigt'), t('wochenplan.erledigtText', { anzahl: result.recipes_count }));
            } catch (err) {
              Alert.alert(t('allgemein.fehler'), err instanceof ApiError ? err.detail : t('wochenplan.nichtHinzugefuegt'));
            } finally {
              setIsAddingToList(false);
            }
          },
        },
      ],
    );
  };

  // Alle Eintraege eines Slots, nach Position sortiert: Hauptgericht
  // zuerst, Beilagen darunter.
  const entriesFor = (dateKey: string, slot: MealSlot) =>
    entries
      .filter((e) => e.plan_date === dateKey && e.meal_slot === slot)
      .sort((a, b) => a.position - b.position);

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
          {weekOffset === 0 ? t('wochenplan.dieseWoche') : formatShort(weekDays[0]) + ' – ' + formatShort(weekDays[6])}
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
            <Text style={styles.addAllButtonText}>{t('wochenplan.zutatenDerWoche')}</Text>
          </>
        )}
      </Pressable>

      {error && <Text style={{ color: '#DC2626', fontSize: 12, marginTop: 10 }}>{error}</Text>}

      {isLoading ? (
        <ActivityIndicator color={colors.text} style={{ marginTop: 30 }} />
      ) : (
        <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag" contentContainerStyle={{ paddingBottom: 40, paddingTop: 4 }}>
          {weekDays.map((day, i) => {
            const dateKey = toDateKey(day);
            const isToday = toDateKey(new Date()) === dateKey;
            return (
              <View key={dateKey} style={styles.daySection}>
                <Text style={[styles.dayLabel, { color: isToday ? gradient[0] : colors.text }]}>
                  {t(WEEKDAY_KEYS[i])}, {formatShort(day)}
                </Text>
                {MEAL_SLOTS.map((slot) => {
                  const slotEntries = entriesFor(dateKey, slot.key);
                  const haupt = slotEntries.find((e) => e.position === 0);
                  const beilagen = slotEntries.filter((e) => e.position > 0);
                  const key = slotKey(dateKey, slot.key);
                  // Automatisch offen, sobald Beilagen da sind - sonst
                  // waeren sie unsichtbar und man wuerde sie erneut
                  // hinzufuegen.
                  const offen = expandedSlots[key] ?? beilagen.length > 0;

                  return (
                    <View key={slot.key} style={{ marginBottom: 6 }}>
                      <Pressable
                        onPress={() => (haupt ? removeEntry(haupt.id) : openPicker(dateKey, slot.key, 0))}
                        onLongPress={() => openPicker(dateKey, slot.key, 0)}
                        style={[styles.slotRow, { backgroundColor: colors.card, borderRadius: radius.sm, marginBottom: 0 }]}
                      >
                        <Text style={[styles.slotLabel, { color: colors.muted }]}>{t(slot.title)}</Text>
                        {haupt ? (
                          <View style={styles.slotFilled}>
                            <Text style={[styles.slotRecipeTitle, { color: colors.text }]} numberOfLines={1}>
                              {haupt.recipe_title}
                              {haupt.servings ? ` · ${haupt.servings} Port.` : ''}
                            </Text>
                            <MaterialCommunityIcons name="close-circle-outline" size={16} color={colors.muted} />
                          </View>
                        ) : (
                          <Text style={[styles.slotEmpty, { color: gradient[0] }]}>+ Rezept wählen</Text>
                        )}
                      </Pressable>

                      {/* Beilagen nur, wenn es ein Hauptgericht gibt -
                          eine Beilage ohne Gericht ergibt keinen Sinn und
                          wuerde die Ansicht mit leeren Zeilen fluten. */}
                      {haupt && (
                        <>
                          {offen &&
                            beilagen.map((b) => (
                              <Pressable
                                key={b.id}
                                onPress={() => removeEntry(b.id)}
                                style={[styles.sideRow, { backgroundColor: colors.card, borderRadius: radius.sm }]}
                              >
                                <Text style={[styles.sideBullet, { color: colors.muted }]}>↳</Text>
                                <Text style={[styles.slotRecipeTitle, { color: colors.text, flex: 1 }]} numberOfLines={1}>
                                  {b.recipe_title}
                                </Text>
                                <MaterialCommunityIcons name="close-circle-outline" size={15} color={colors.muted} />
                              </Pressable>
                            ))}

                          <Pressable
                            onPress={() => {
                              if (!offen) {
                                setExpandedSlots((prev) => ({ ...prev, [key]: true }));
                                return;
                              }
                              if (beilagen.length >= 2) {
                                Alert.alert(t('wochenplan.voll'), t('wochenplan.maxZweiBeilagen'));
                                return;
                              }
                              openPicker(dateKey, slot.key);
                            }}
                            style={styles.sideToggle}
                          >
                            <Text style={{ color: gradient[0], fontSize: 11.5, fontWeight: '600' }}>
                              {!offen
                                ? '+ Beilage'
                                : beilagen.length >= 2
                                  ? t('wochenplan.beilagenVoll')
                                  : `+ Beilage (${beilagen.length} von 2)`}
                            </Text>
                          </Pressable>
                        </>
                      )}
                    </View>
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
            <Text style={[styles.pickerTitle, { color: colors.text }]}>{t('wochenplan.rezeptWaehlen')}</Text>
            <Pressable onPress={() => setPickerTarget(null)} hitSlop={10}>
              <MaterialCommunityIcons name="close" size={24} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.servingsRow}>
            <Text style={{ color: colors.muted, fontSize: 12.5 }}>{t('wochenplan.portionen')}</Text>
            <TextInput
              value={servingsInput}
              onChangeText={setServingsInput}
              keyboardType="numeric"
              style={[styles.servingsInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.sm }]}
            />
          </View>
          <TextInput
            style={[styles.pickerSearch, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
            placeholder={t('wochenplan.suchen')}
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
  // marginBottom, damit die erste Zeile des Montags nicht direkt unter
  // dem Knopf klebt und angeschnitten wirkt.
  addAllButton: { flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', height: 44, marginBottom: 12 },
  addAllButtonText: { color: '#fff', fontWeight: '700', fontSize: 12.5 },
  daySection: { marginBottom: 18 },
  dayLabel: { fontSize: 13.5, fontWeight: '700', marginBottom: 8 },
  slotRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 11, marginBottom: 6 },
  // flexShrink 0 ist hier der entscheidende Teil, nicht die Breite: In
  // einer Flex-Zeile darf ein Element standardmaessig unter seine
  // angegebene Breite schrumpfen, wenn rechts daneben Platz gebraucht
  // wird. React Native bricht dann INNERHALB des Wortes um - aus
  // "Fruehstueck" wurde "Fruehstuec / k". Feste Breite statt flex, damit
  // die drei Labels buendig untereinander stehen; "Mittag" und "Abend"
  // sind kuerzer und ruecken sonst unterschiedlich weit ein.
  slotLabel: { fontSize: 11, fontWeight: '600', width: 82, flexShrink: 0 },
  slotFilled: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  slotRecipeTitle: { fontSize: 13, fontWeight: '600', flex: 1 },
  slotEmpty: { fontSize: 12, fontWeight: '600' },
  // Beilagen ruecken ein und sind etwas flacher als das Hauptgericht -
  // so ist die Zugehoerigkeit auf einen Blick erkennbar, ohne dass es
  // eine Ueberschrift dafuer braucht.
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginLeft: 22, marginTop: 4, paddingHorizontal: 12, paddingVertical: 8 },
  sideBullet: { fontSize: 12 },
  sideToggle: { marginLeft: 22, marginTop: 5, paddingVertical: 4 },
  pickerContainer: { flex: 1, paddingHorizontal: 18, paddingTop: 60 },
  pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  pickerTitle: { fontSize: 17, fontWeight: '700' },
  pickerSearch: { height: 44, paddingHorizontal: 14, fontSize: 13.5, marginBottom: 14 },
  servingsRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
  servingsInput: { width: 60, height: 38, paddingHorizontal: 10, fontSize: 13.5, textAlign: 'center' },
  pickerRow: { padding: 13, marginBottom: 7 },
});
