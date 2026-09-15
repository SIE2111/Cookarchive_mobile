import React, { useState } from 'react';
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
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([{ name: '', amount: '', unit: '' }]);
  const [steps, setSteps] = useState<StepDraft[]>([{ text: '' }]);
  const [isSaving, setIsSaving] = useState(false);
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  const handlePickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Zugriff verweigert', 'Ohne Foto-Zugriff kann kein Bild ausgewählt werden.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
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
        ingredients: cleanIngredients,
        steps: cleanSteps,
        cover_image_url: coverImageUrl,
      });
      navigation.navigate('Start');
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
