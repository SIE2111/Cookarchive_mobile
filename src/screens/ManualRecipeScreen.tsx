import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, Alert, ActivityIndicator, Image } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'ManualRecipe'>;

interface IngredientDraft {
  name: string;
  amount: string;
  unit: string;
}

interface StepDraft {
  text: string;
}

export default function ManualRecipeScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const [title, setTitle] = useState('');
  const [servings, setServings] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([{ name: '', amount: '', unit: '' }]);
  const [steps, setSteps] = useState<StepDraft[]>([{ text: '' }]);
  const [isSaving, setIsSaving] = useState(false);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  // Zutaten-Autovervollstaendigung: greift auf die bereits vorhandene
  // Werteliste im Backend zu (/ingredients/, existierte schon lange, war
  // aber nirgends angebunden) - beim Tippen erscheinen passende Vorschlaege
  // inkl. Standard-Einheit, ein Tippen auf die Zutat legt bei Bedarf einen
  // neuen Eintrag in der Werteliste an (fuer kuenftige Vorschlaege).
  const [focusedIngredientIndex, setFocusedIngredientIndex] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<{ id: string; name: string; default_unit: string | null }[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>('/folders/').then(setFolders).catch(() => {
      // Ordner sind hier nur "nice to have" - schlaegt das Laden fehl,
      // bleibt die Auswahl einfach leer, das Speichern selbst funktioniert
      // trotzdem (folder_id ist optional)
    });
  }, []);

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

  const updateIngredient = (index: number, field: keyof IngredientDraft, value: string) => {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, [field]: value } : ing)));
  };

  const handleIngredientNameChange = (index: number, value: string) => {
    updateIngredient(index, 'name', value);
    setFocusedIngredientIndex(index);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = value.trim();
    if (trimmed.length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(() => {
      api
        .get<{ id: string; name: string; default_unit: string | null }[]>(`/ingredients/?q=${encodeURIComponent(trimmed)}`)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 300);
  };

  const handleSelectSuggestion = (index: number, suggestion: { name: string; default_unit: string | null }) => {
    setIngredients((prev) =>
      prev.map((ing, i) =>
        i === index ? { ...ing, name: suggestion.name, unit: ing.unit || suggestion.default_unit || '' } : ing,
      ),
    );
    setSuggestions([]);
    setFocusedIngredientIndex(null);
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
        setIsUploadingImage(true);
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
          // Bild-Upload-Fehler soll das Speichern des Rezepts selbst nicht
          // verhindern - Rezept wird dann eben ohne Bild angelegt
          Alert.alert(
            'Bild-Upload fehlgeschlagen',
            `Das Rezept wird ohne Bild gespeichert. Fehler: ${uploadErr instanceof ApiError ? uploadErr.detail : 'Unbekannt'}`,
          );
        } finally {
          setIsUploadingImage(false);
        }
      }

      await api.post('/recipes/', {
        title: title.trim(),
        servings: servings ? Number(servings) : null,
        ingredients: cleanIngredients,
        steps: cleanSteps,
        cover_image_url: coverImageUrl,
        folder_id: selectedFolderId,
      });

      // Best-effort: alle verwendeten Zutatennamen in die Werteliste
      // eintragen, damit sie kuenftig als Vorschlag erscheinen (Backend
      // erkennt bereits vorhandene Namen selbst und legt keine Duplikate an -
      // siehe routers/ingredients.py). Fehler hier werden bewusst
      // verschluckt, das Rezept ist ja schon erfolgreich gespeichert.
      cleanIngredients.forEach((ing) => {
        api.post('/ingredients/', { name: ing.name, default_unit: ing.unit || null }).catch(() => {});
      });

      navigation.navigate('MainTabs');
    } catch (err) {
      Alert.alert('Speichern fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
      <Pressable onPress={handlePickImage} style={[styles.imagePicker, { backgroundColor: colors.card, borderRadius: radius.md }]}>
        {localImageUri ? (
          <Image source={{ uri: localImageUri }} style={[styles.imagePreview, { borderRadius: radius.md }]} />
        ) : (
          <Text style={[styles.imagePickerText, { color: colors.muted }]}>📷 Foto hinzufügen</Text>
        )}
      </Pressable>

      <Text style={[styles.label, { color: colors.muted }]}>Rezeptname</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
        placeholder="z.B. Zwiebelrostbraten"
        placeholderTextColor={colors.muted}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={[styles.label, { color: colors.muted, marginTop: 16 }]}>Portionen</Text>
      <TextInput
        style={[styles.input, styles.servingsInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
        placeholder="z.B. 4"
        placeholderTextColor={colors.muted}
        keyboardType="numeric"
        value={servings}
        onChangeText={setServings}
      />

      {folders.length > 0 && (
        <>
          <Text style={[styles.label, { color: colors.muted, marginTop: 16 }]}>Ordner (optional)</Text>
          <View style={styles.folderChipsRow}>
            {folders.map((folder) => {
              const isSelected = selectedFolderId === folder.id;
              return (
                <Pressable
                  key={folder.id}
                  onPress={() => setSelectedFolderId(isSelected ? null : folder.id)}
                  style={[
                    styles.folderChip,
                    { backgroundColor: isSelected ? gradient[0] : colors.card, borderRadius: radius.sm },
                  ]}
                >
                  <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>
                    {folder.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Zutaten</Text>
      {ingredients.map((ing, i) => (
        <View key={i}>
          <View style={styles.ingredientRow}>
            <TextInput
              style={[styles.input, styles.ingredientName, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
              placeholder="Zutat"
              placeholderTextColor={colors.muted}
              value={ing.name}
              onChangeText={(v) => handleIngredientNameChange(i, v)}
              onFocus={() => setFocusedIngredientIndex(i)}
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
          {focusedIngredientIndex === i && suggestions.length > 0 && (
            <View style={[styles.suggestionsBox, { backgroundColor: colors.card, borderRadius: radius.sm }]}>
              {suggestions.map((s) => (
                <Pressable key={s.id} onPress={() => handleSelectSuggestion(i, s)} style={styles.suggestionRow}>
                  <Text style={{ color: colors.text, fontSize: 12.5 }}>{s.name}</Text>
                  {s.default_unit && <Text style={{ color: colors.muted, fontSize: 11 }}>{s.default_unit}</Text>}
                </Pressable>
              ))}
            </View>
          )}
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
            placeholder="Was ist zu tun?"
            placeholderTextColor={colors.muted}
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
        {isSaving ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color="#fff" />
            {isUploadingImage && <Text style={styles.saveButtonText}>Bild wird hochgeladen…</Text>}
          </View>
        ) : (
          <Text style={styles.saveButtonText}>Rezept speichern</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 60 },
  imagePicker: { height: 140, alignItems: 'center', justifyContent: 'center', marginBottom: 18, overflow: 'hidden' },
  imagePickerText: { fontSize: 13, fontWeight: '500' },
  imagePreview: { width: '100%', height: '100%' },
  label: { fontSize: 11, fontWeight: '500', marginBottom: 6 },
  servingsInput: { width: 90 },
  suggestionsBox: { marginTop: -3, marginBottom: 9, paddingVertical: 4 },
  suggestionRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 9 },
  folderChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  folderChip: { paddingHorizontal: 12, paddingVertical: 8 },
  input: { minHeight: 44, paddingHorizontal: 12, fontSize: 13.5 },
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
