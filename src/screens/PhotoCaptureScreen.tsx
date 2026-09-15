import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ScrollView,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'PhotoCapture'>;

interface ScannedIngredient {
  name: string;
  amount: number | null;
  unit: string | null;
}

interface ScannedStep {
  order: number;
  text: string;
}

interface ScanPhotoResponse {
  title: string;
  servings: number | null;
  prep_time_minutes: number | null;
  ingredients: ScannedIngredient[];
  steps: ScannedStep[];
  low_confidence_note: string | null;
}

export default function PhotoCaptureScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();

  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanPhotoResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [ingredientLines, setIngredientLines] = useState<string[]>([]);
  const [stepLines, setStepLines] = useState<string[]>([]);

  const runScan = async (uri: string, mimeType: string) => {
    setIsScanning(true);
    setScanError(null);
    try {
      const fileName = uri.split('/').pop() ?? 'foto.jpg';
      const scanResult = await api.uploadImage('/ai/scan-photo', uri, fileName, mimeType);
      const typedResult = scanResult as unknown as ScanPhotoResponse;
      setResult(typedResult);
      setTitle(typedResult.title);
      setIngredientLines(
        typedResult.ingredients.map((ing) => `${ing.amount ?? ''} ${ing.unit ?? ''} ${ing.name}`.trim()),
      );
      setStepLines(typedResult.steps.map((s) => s.text));
    } catch (err) {
      setScanError(err instanceof ApiError ? err.detail : 'Foto konnte nicht erfasst werden');
    } finally {
      setIsScanning(false);
    }
  };

  const handleTakePhoto = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Zugriff verweigert', 'Ohne Kamera-Zugriff kann kein Foto aufgenommen werden.');
      return;
    }
    const pickerResult = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (!pickerResult.canceled && pickerResult.assets[0]) {
      const asset = pickerResult.assets[0];
      setImageUri(asset.uri);
      await runScan(asset.uri, asset.mimeType ?? 'image/jpeg');
    }
  };

  const handlePickFromLibrary = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Zugriff verweigert', 'Ohne Foto-Zugriff kann kein Bild ausgewählt werden.');
      return;
    }
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
    });
    if (!pickerResult.canceled && pickerResult.assets[0]) {
      const asset = pickerResult.assets[0];
      setImageUri(asset.uri);
      await runScan(asset.uri, asset.mimeType ?? 'image/jpeg');
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Titel fehlt', 'Bitte einen Rezeptnamen eingeben.');
      return;
    }
    setIsSaving(true);
    try {
      const ingredients = ingredientLines
        .filter((line) => line.trim())
        .map((line) => ({ name: line.trim(), amount: null, unit: null }));
      const steps = stepLines
        .filter((line) => line.trim())
        .map((line, i) => ({ order: i + 1, text: line.trim() }));

      await api.post('/recipes/', { title: title.trim(), ingredients, steps });
      navigation.navigate('Start');
    } catch (err) {
      Alert.alert('Speichern fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsSaving(false);
    }
  };

  if (!imageUri) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg, padding: 24 }]}>
        <Text style={[styles.introText, { color: colors.text }]}>
          Fotografiere eine Kochbuchseite, einen handschriftlichen Zettel oder ein Zutaten-Etikett.
        </Text>
        <Pressable onPress={handleTakePhoto} style={[styles.primaryButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
          <Text style={styles.primaryButtonText}>📷 Foto aufnehmen</Text>
        </Pressable>
        <Pressable onPress={handlePickFromLibrary} style={[styles.secondaryButton, { borderColor: gradient[0], borderRadius: radius.md }]}>
          <Text style={[styles.secondaryButtonText, { color: gradient[0] }]}>Aus Galerie wählen</Text>
        </Pressable>
      </View>
    );
  }

  if (isScanning) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Image source={{ uri: imageUri }} style={styles.scanningPreview} />
        <ActivityIndicator color={colors.text} style={{ marginTop: 20 }} />
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 10 }}>Rezept wird erfasst…</Text>
      </View>
    );
  }

  if (scanError) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg, padding: 24 }]}>
        <Text style={{ color: '#DC2626', fontSize: 13, textAlign: 'center', marginBottom: 16 }}>{scanError}</Text>
        <Pressable
          onPress={() => {
            setImageUri(null);
            setScanError(null);
          }}
          style={[styles.primaryButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}
        >
          <Text style={styles.primaryButtonText}>Erneut versuchen</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
      <Image source={{ uri: imageUri }} style={[styles.reviewThumbnail, { borderRadius: radius.md }]} />

      {result?.low_confidence_note && (
        <View style={[styles.warningCard, { borderRadius: radius.md }]}>
          <Text style={styles.warningText}>⚠️ {result.low_confidence_note}</Text>
        </View>
      )}

      <Text style={[styles.label, { color: colors.muted }]}>Rezeptname</Text>
      <TextInput
        style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
        value={title}
        onChangeText={setTitle}
      />

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Zutaten (bitte prüfen)</Text>
      {ingredientLines.map((line, i) => (
        <TextInput
          key={i}
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md, marginBottom: 7 }]}
          value={line}
          onChangeText={(v) => setIngredientLines((prev) => prev.map((l, idx) => (idx === i ? v : l)))}
        />
      ))}

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Zubereitung (bitte prüfen)</Text>
      {stepLines.map((line, i) => (
        <TextInput
          key={i}
          style={[styles.input, styles.stepInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md, marginBottom: 7 }]}
          value={line}
          multiline
          onChangeText={(v) => setStepLines((prev) => prev.map((l, idx) => (idx === i ? v : l)))}
        />
      ))}

      <Pressable onPress={handleSave} disabled={isSaving} style={[styles.saveButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Rezept speichern</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  introText: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  primaryButton: { height: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, marginBottom: 12, width: '100%' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  secondaryButton: { height: 46, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', width: '100%' },
  secondaryButtonText: { fontWeight: '700', fontSize: 13.5 },
  scanningPreview: { width: 200, height: 150, borderRadius: 12, opacity: 0.6 },
  reviewThumbnail: { width: '100%', height: 160, marginBottom: 14 },
  warningCard: { backgroundColor: '#FEF3C7', padding: 12, marginBottom: 16 },
  warningText: { fontSize: 12, color: '#92400E', lineHeight: 17 },
  label: { fontSize: 11, fontWeight: '500', marginBottom: 6 },
  input: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13.5 },
  stepInput: { minHeight: 50 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  saveButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  saveButtonText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
});
