import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'WebImport'>;

interface IngredientDraft {
  name: string;
  amount: string;
  unit: string;
}

interface StepDraft {
  text: string;
}

interface ImportedRecipe {
  title: string;
  servings: number | null;
  prep_time_minutes: number | null;
  ingredients: { name: string; amount: number | null; unit: string | null }[];
  steps: { order: number; text: string }[];
  tags: string[] | null;
  origin_url: string;
}

export default function WebImportScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const [url, setUrl] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [originUrl, setOriginUrl] = useState<string | null>(null);

  // Nach dem Import editierbar, genau wie bei "Selbst erstellen" - das
  // Backend legt bewusst noch KEIN Rezept an, das passiert erst hier beim
  // "Speichern" (siehe routers/web_import.py).
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const handleImport = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      Alert.alert('Link fehlt', 'Bitte einen Link zu einem Rezept einfügen.');
      return;
    }
    setIsImporting(true);
    try {
      const result = await api.post<ImportedRecipe>('/web-import/import-recipe', { url: trimmedUrl });
      setTitle(result.title);
      setIngredients(
        result.ingredients.map((ing) => ({
          name: ing.name,
          amount: ing.amount != null ? String(ing.amount) : '',
          unit: ing.unit ?? '',
        })),
      );
      setSteps(result.steps.sort((a, b) => a.order - b.order).map((s) => ({ text: s.text })));
      setOriginUrl(result.origin_url);
    } catch (err) {
      // Backend liefert bereits gut lesbare Fehlertexte (z.B. "Auf dieser
      // Seite wurde kein Rezept erkannt.", Timeout, fehlender API-Key) -
      // die werden hier 1:1 durchgereicht, kein eigener generischer Text.
      Alert.alert('Import fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsImporting(false);
    }
  };

  const updateIngredient = (index: number, field: keyof IngredientDraft, value: string) => {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing)));
  };

  const updateStep = (index: number, value: string) => {
    setSteps((prev) => prev.map((step, i) => (i === index ? { text: value } : step)));
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Titel fehlt', 'Bitte einen Rezeptnamen eingeben.');
      return;
    }
    const cleanIngredients = ingredients
      .filter((ing) => ing.name.trim())
      .map((ing) => ({
        name: ing.name.trim(),
        amount: ing.amount ? Number(ing.amount) : null,
        unit: ing.unit.trim() || null,
      }));
    const cleanSteps = steps
      .filter((s) => s.text.trim())
      .map((s, i) => ({ order: i + 1, text: s.text.trim() }));

    if (cleanSteps.length === 0) {
      Alert.alert('Zubereitung fehlt', 'Bitte mindestens einen Schritt eintragen.');
      return;
    }

    setIsSaving(true);
    try {
      await api.post('/recipes/', {
        title: title.trim(),
        ingredients: cleanIngredients,
        steps: cleanSteps,
      });
      navigation.navigate('MainTabs');
    } catch (err) {
      Alert.alert('Speichern fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsSaving(false);
    }
  };

  // Schritt 1: nur der Link, solange noch nichts importiert wurde
  if (!originUrl) {
    return (
      <View style={[styles.introContainer, { backgroundColor: colors.bg }]}>
        <Text style={[styles.introTitle, { color: colors.text }]}>Rezept aus dem Web</Text>
        <Text style={[styles.introText, { color: colors.muted }]}>
          Link zu einem Rezept auf einer beliebigen Webseite einfügen. Die Zubereitung wird dabei{' '}
          <Text style={{ fontWeight: '700' }}>komplett neu in eigenen Worten formuliert</Text> (Urheberrecht) - nicht
          einfach kopiert.
        </Text>
        <TextInput
          style={[styles.urlInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
          placeholder="https://…"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          value={url}
          onChangeText={setUrl}
        />
        <Pressable
          onPress={handleImport}
          disabled={isImporting}
          style={[styles.importButton, { backgroundColor: gradient[0], borderRadius: radius.md, opacity: isImporting ? 0.7 : 1 }]}
        >
          {isImporting ? <ActivityIndicator color="#fff" /> : <Text style={styles.importButtonText}>Rezept importieren</Text>}
        </Pressable>
      </View>
    );
  }

  // Schritt 2: importiertes Ergebnis bearbeiten und speichern
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
      <Text style={[styles.sourceHint, { color: colors.muted }]} numberOfLines={1}>
        Quelle: {originUrl}
      </Text>

      <Text style={[styles.label, { color: colors.muted }]}>Rezeptname</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Zutaten</Text>
      {ingredients.map((ing, i) => (
        <View key={i} style={styles.ingredientRow}>
          <TextInput
            style={[styles.input, styles.ingredientName, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
            placeholder="Zutat"
            placeholderTextColor={colors.muted}
            value={ing.name}
            onChangeText={(v) => updateIngredient(i, 'name', v)}
          />
          <TextInput
            style={[styles.input, styles.ingredientAmount, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
            placeholder="Menge"
            placeholderTextColor={colors.muted}
            keyboardType="numeric"
            value={ing.amount}
            onChangeText={(v) => updateIngredient(i, 'amount', v)}
          />
          <TextInput
            style={[styles.input, styles.ingredientUnit, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
            placeholder="Einh."
            placeholderTextColor={colors.muted}
            value={ing.unit}
            onChangeText={(v) => updateIngredient(i, 'unit', v)}
          />
        </View>
      ))}
      <Pressable onPress={() => setIngredients((prev) => [...prev, { name: '', amount: '', unit: '' }])}>
        <Text style={[styles.addLink, { color: gradient[0] }]}>+ Zutat hinzufügen</Text>
      </Pressable>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Zubereitung</Text>
      {steps.map((step, i) => (
        <View key={i} style={styles.stepRow}>
          <Text style={[styles.stepNumber, { color: colors.muted }]}>{i + 1}.</Text>
          <TextInput
            style={[styles.input, styles.stepInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
            multiline
            value={step.text}
            onChangeText={(v) => updateStep(i, v)}
          />
        </View>
      ))}
      <Pressable onPress={() => setSteps((prev) => [...prev, { text: '' }])}>
        <Text style={[styles.addLink, { color: gradient[0] }]}>+ Schritt hinzufügen</Text>
      </Pressable>

      <Pressable onPress={handleSave} disabled={isSaving} style={[styles.saveButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Rezept speichern</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  introContainer: { flex: 1, padding: 22, justifyContent: 'center' },
  introTitle: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  introText: { fontSize: 13, lineHeight: 19, marginBottom: 22 },
  urlInput: { height: 46, paddingHorizontal: 14, fontSize: 13.5, marginBottom: 14 },
  importButton: { height: 48, alignItems: 'center', justifyContent: 'center' },
  importButtonText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  container: { padding: 18, paddingBottom: 60 },
  sourceHint: { fontSize: 10.5, marginBottom: 14 },
  label: { fontSize: 11, fontWeight: '500', marginBottom: 6 },
  input: { height: 44, paddingHorizontal: 12, fontSize: 13.5 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  ingredientRow: { flexDirection: 'row', gap: 6, marginBottom: 7 },
  ingredientName: { flex: 2 },
  ingredientAmount: { flex: 1 },
  ingredientUnit: { flex: 1 },
  addLink: { fontSize: 12, fontWeight: '600', marginTop: 2, marginBottom: 4 },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  stepNumber: { fontSize: 13, fontWeight: '600', marginTop: 12 },
  stepInput: { flex: 1, minHeight: 44, paddingVertical: 12 },
  saveButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  saveButtonText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
});
