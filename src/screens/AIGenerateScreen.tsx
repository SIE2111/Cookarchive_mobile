import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'AIGenerate'>;

interface IngredientDraft {
  name: string;
  amount: string;
  unit: string;
}

interface StepDraft {
  text: string;
}

interface GeneratedIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
}

interface SideSuggestion {
  category: string;
  idea: string;
  pantry_based_on: string[];
}

interface GeneratedRecipe {
  title: string;
  servings: number | null;
  prep_time_minutes: number | null;
  ingredients_main: GeneratedIngredient[];
  ingredients_pantry: GeneratedIngredient[];
  steps: { order: number; text: string }[];
  tags: string[] | null;
  side_suggestions: SideSuggestion[] | null;
  follow_up_question: string | null;
  allergen_warning: string | null;
}

export default function AIGenerateScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();

  // Vorgaben-Formular
  const [ingredientsText, setIngredientsText] = useState('');
  const [diet, setDiet] = useState('');
  const [maxMinutes, setMaxMinutes] = useState('');
  const [servings, setServings] = useState('');
  const [freeText, setFreeText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Ergebnis, editierbar vor dem Speichern (gleiches Muster wie beim
  // Web-Import - die KI legt noch KEIN Rezept an, erst "Speichern" tut das)
  const [result, setResult] = useState<GeneratedRecipe | null>(null);
  const [title, setTitle] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [steps, setSteps] = useState<StepDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Zugriff verweigert', 'Ohne Foto-Zugriff kann kein Bild ausgewählt werden.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      setLocalImageUri(result.assets[0].uri);
    }
  };

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const available_ingredients = ingredientsText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const generated = await api.post<GeneratedRecipe>('/ai/generate-recipe', {
        available_ingredients: available_ingredients.length > 0 ? available_ingredients : undefined,
        diet: diet.trim() || undefined,
        max_minutes: maxMinutes ? Number(maxMinutes) : undefined,
        servings: servings ? Number(servings) : undefined,
        free_text: freeText.trim() || undefined,
      });

      setResult(generated);
      setTitle(generated.title);
      // Vorrats- und Hauptzutaten zusammen in eine editierbare Liste -
      // das Rezept-Schema selbst kennt diese Unterscheidung nicht, die
      // ist nur ein Hilfsmittel der KI-Antwort.
      const combined = [...(generated.ingredients_main ?? []), ...(generated.ingredients_pantry ?? [])];
      setIngredients(
        combined.map((ing) => ({
          name: ing.name,
          amount: ing.amount != null ? String(ing.amount) : '',
          unit: ing.unit ?? '',
        })),
      );
      setSteps((generated.steps ?? []).sort((a, b) => a.order - b.order).map((s) => ({ text: s.text })));
    } catch (err) {
      Alert.alert('Generieren fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsGenerating(false);
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
      let coverImageUrl: string | null = null;
      if (localImageUri) {
        const fileName = localImageUri.split('/').pop() ?? 'foto.jpg';
        const extension = fileName.split('.').pop()?.toLowerCase();
        const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
        try {
          const uploadResult = await api.uploadImage('/images/upload', localImageUri, fileName, mimeType);
          coverImageUrl = uploadResult.url;
          if (uploadResult.storage_warning) {
            // Fallback-Logik im Backend (storage-architektur-standard.md):
            // Drittanbieter-Upload ist fehlgeschlagen, Bild liegt stattdessen
            // in der Cloud - Nutzer soll das sichtbar erfahren, nicht unbemerkt
            // woanders landen als gewaehlt.
            Alert.alert('Hinweis', uploadResult.storage_warning);
          }
        } catch (uploadErr) {
          Alert.alert(
            'Bild-Upload fehlgeschlagen',
            `Das Rezept wird ohne Titelbild gespeichert. Fehler: ${uploadErr instanceof ApiError ? uploadErr.detail : 'Unbekannt'}`,
          );
        }
      }

      await api.post('/recipes/', {
        title: title.trim(),
        ingredients: cleanIngredients,
        steps: cleanSteps,
        tags: result?.tags ?? undefined,
        cover_image_url: coverImageUrl,
      });
      navigation.navigate('MainTabs');
    } catch (err) {
      Alert.alert('Speichern fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsSaving(false);
    }
  };

  // Schritt 1: Vorgaben-Formular, solange noch nichts generiert wurde
  if (!result) {
    return (
      <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.introContainer}>
        <Text style={[styles.introTitle, { color: colors.text }]}>KI-Rezept nach Vorgaben</Text>
        <Text style={[styles.introText, { color: colors.muted }]}>
          Alle Felder sind optional – je mehr du ausfüllst, desto passender wird der Vorschlag.
        </Text>

        <Text style={[styles.label, { color: colors.muted }]}>Verfügbare Hauptzutaten (mit Komma getrennt)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
          placeholder="z.B. Zucchini, Faschiertes, Reis"
          placeholderTextColor={colors.muted}
          value={ingredientsText}
          onChangeText={setIngredientsText}
        />

        <Text style={[styles.label, { color: colors.muted }]}>Diät (optional)</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
          placeholder="z.B. vegan, glutenfrei, vegetarisch"
          placeholderTextColor={colors.muted}
          value={diet}
          onChangeText={setDiet}
        />

        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Max. Minuten</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
              placeholder="z.B. 30"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={maxMinutes}
              onChangeText={setMaxMinutes}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.label, { color: colors.muted }]}>Portionen</Text>
            <TextInput
              style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
              placeholder="z.B. 4"
              placeholderTextColor={colors.muted}
              keyboardType="numeric"
              value={servings}
              onChangeText={setServings}
            />
          </View>
        </View>

        <Text style={[styles.label, { color: colors.muted }]}>Sonstige Wünsche</Text>
        <TextInput
          style={[styles.input, styles.multilineInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
          placeholder="z.B. etwas Schnelles für Kinder"
          placeholderTextColor={colors.muted}
          multiline
          value={freeText}
          onChangeText={setFreeText}
        />

        <Pressable
          onPress={handleGenerate}
          disabled={isGenerating}
          style={[styles.generateButton, { backgroundColor: gradient[0], borderRadius: radius.md, opacity: isGenerating ? 0.7 : 1 }]}
        >
          {isGenerating ? <ActivityIndicator color="#fff" /> : <Text style={styles.generateButtonText}>Rezept generieren</Text>}
        </Pressable>
      </ScrollView>
    );
  }

  // Schritt 2: generiertes Ergebnis bearbeiten und speichern
  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
      <Pressable onPress={handlePickImage} style={[styles.imagePicker, { backgroundColor: colors.card, borderRadius: radius.md }]}>
        {localImageUri ? (
          <Image source={{ uri: localImageUri }} style={[styles.imagePreview, { borderRadius: radius.md }]} />
        ) : (
          <Text style={[styles.imagePickerText, { color: colors.muted }]}>📷 Titelbild hinzufügen (optional)</Text>
        )}
      </Pressable>

      {result.allergen_warning && (
        <View style={[styles.warningBanner, { borderRadius: radius.sm }]}>
          <Text style={styles.warningText}>⚠️ {result.allergen_warning}</Text>
        </View>
      )}

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

      {result.side_suggestions && result.side_suggestions.length > 0 && (
        <View style={[styles.sideSuggestionsBox, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <Text style={[styles.sideSuggestionsTitle, { color: colors.text }]}>💡 Beilagen-Ideen (nicht Teil des Rezepts)</Text>
          {result.side_suggestions.map((s, i) => (
            <Text key={i} style={[styles.sideSuggestionItem, { color: colors.muted }]}>
              • {s.category}: {s.idea}
            </Text>
          ))}
          {result.follow_up_question && (
            <Text style={[styles.followUpQuestion, { color: colors.muted }]}>{result.follow_up_question}</Text>
          )}
        </View>
      )}

      <Pressable onPress={handleSave} disabled={isSaving} style={[styles.saveButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Rezept speichern</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  introContainer: { padding: 22, paddingBottom: 60 },
  introTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8 },
  introText: { fontSize: 12.5, lineHeight: 18, marginBottom: 20 },
  row: { flexDirection: 'row', gap: 10 },
  generateButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  generateButtonText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  container: { padding: 18, paddingBottom: 60 },
  warningBanner: { backgroundColor: '#FEF3C7', padding: 12, marginBottom: 16 },
  imagePicker: { height: 130, alignItems: 'center', justifyContent: 'center', marginBottom: 16, overflow: 'hidden' },
  imagePickerText: { fontSize: 12.5, fontWeight: '500' },
  imagePreview: { width: '100%', height: '100%' },
  warningText: { color: '#92400E', fontSize: 12, lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { minHeight: 44, paddingHorizontal: 12, fontSize: 13.5 },
  multilineInput: { height: 70, paddingTop: 12, textAlignVertical: 'top' },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  ingredientRow: { flexDirection: 'row', gap: 6, marginBottom: 7 },
  ingredientName: { flex: 2 },
  ingredientAmount: { flex: 1 },
  ingredientUnit: { flex: 1 },
  addLink: { fontSize: 12, fontWeight: '600', marginTop: 2, marginBottom: 4 },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'flex-start' },
  stepNumber: { fontSize: 13, fontWeight: '600', marginTop: 12 },
  stepInput: { flex: 1, minHeight: 44, paddingVertical: 12 },
  sideSuggestionsBox: { padding: 14, marginTop: 20 },
  sideSuggestionsTitle: { fontSize: 12.5, fontWeight: '700', marginBottom: 8 },
  sideSuggestionItem: { fontSize: 11.5, lineHeight: 17, marginBottom: 3 },
  followUpQuestion: { fontSize: 11.5, lineHeight: 17, marginTop: 6, fontStyle: 'italic' },
  saveButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  saveButtonText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
});
