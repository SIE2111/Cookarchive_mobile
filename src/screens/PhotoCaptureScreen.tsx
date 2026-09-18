import React, { useEffect, useState } from 'react';
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
import { ensureMediaLibraryAccess } from '../utils/mediaPermissions';
import { useTheme } from '../theme/ThemeContext';
import { askWhatNext } from '../utils/afterRecipeSaved';
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

  // Mehrere Fotos statt einem: Ein gedrucktes Rezept geht oft ueber zwei
  // Buchseiten, und in einer Zeitschrift steht die Zutatenliste in einer
  // anderen Spalte als die Zubereitung. Mit nur einem Bild fehlte dann die
  // Haelfte.
  const [imageUris, setImageUris] = useState<string[]>([]);
  const imageUri = imageUris[0] ?? null;
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [result, setResult] = useState<ScanPhotoResponse | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [title, setTitle] = useState('');
  const [servings, setServings] = useState('');
  const [ingredientLines, setIngredientLines] = useState<string[]>([]);
  const [stepLines, setStepLines] = useState<string[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ id: string; name: string }[]>('/folders/').then(setFolders).catch(() => {
      // Ordner sind hier nur "nice to have" - schlaegt das Laden fehl,
      // bleibt die Auswahl einfach leer, das Speichern selbst funktioniert trotzdem
    });
    api.get<{ default_servings: number }>('/preferences/').then((prefs) => {
      setServings(String(prefs.default_servings));
    }).catch(() => {
      // Vorlage konnte nicht geladen werden - Feld bleibt einfach leer
    });
  }, []);

  const runScan = async (uris: string[]) => {
    if (uris.length === 0) return;
    setIsScanning(true);
    setScanError(null);
    try {
      // Alle Fotos GEMEINSAM in einem Aufruf - nur so erkennt die KI, dass
      // Zutaten vom einen und Schritte vom anderen Bild zusammengehoeren.
      // Nacheinander ausgewertet kaemen mehrere halbe Rezepte heraus.
      const scanResult = await api.uploadImagesAsJson<ScanPhotoResponse>(
        '/ai/scan-photos',
        uris.map((u) => ({ uri: u, type: 'image/jpeg' })),
      );
      const typedResult = scanResult as unknown as ScanPhotoResponse;
      setResult(typedResult);
      setTitle(typedResult.title);
      setIngredientLines(
        typedResult.ingredients.map((ing) => `${ing.amount ?? ''} ${ing.unit ?? ''} ${ing.name}`.trim()),
      );
      setStepLines(typedResult.steps.map((s) => s.text));
    } catch (err) {
      // Statt eines generischen Platzhaltertexts die tatsaechliche Ursache
      // zeigen - auch bei Netzwerk-/Timeout-Fehlern (kein ApiError), die
      // bisher stillschweigend verschluckt wurden und das Debuggen
      // unmoeglich gemacht haben.
      const message =
        err instanceof ApiError
          ? err.detail
          : err instanceof Error
            ? `${err.name}: ${err.message}`
            : 'Unbekannter Fehler beim Erfassen des Fotos.';
      setScanError(message);
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
    // allowsEditing blendet nach der Aufnahme einen Zuschnitt-Rahmen ein.
    // Wichtig bei Zeitschriften: Ohne ihn landet die halbe Nachbarspalte
    // oder der Tisch mit in der Auswertung.
    const pickerResult = await ImagePicker.launchCameraAsync({ quality: 0.8, allowsEditing: true });
    if (!pickerResult.canceled && pickerResult.assets[0]) {
      setImageUris((prev) => [...prev, pickerResult.assets[0].uri]);
    }
  };

  const handlePickFromLibrary = async () => {
    if (!(await ensureMediaLibraryAccess())) return;
    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
    });
    if (!pickerResult.canceled && pickerResult.assets[0]) {
      setImageUris((prev) => [...prev, pickerResult.assets[0].uri]);
    }
  };

  const handleSave = async (cookOnly = false) => {
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

      // Das aufgenommene/ausgewaehlte Foto (imageUri, siehe oben) als
      // Titelbild mit hochladen - bisher wurde es nur zur Kontrolle
      // angezeigt, aber beim Speichern nie tatsaechlich verwendet.
      let coverImageUrl: string | null = null;
      if (imageUri) {
        const fileName = imageUri.split('/').pop() ?? 'foto.jpg';
        const extension = fileName.split('.').pop()?.toLowerCase();
        const mimeType = extension === 'png' ? 'image/png' : 'image/jpeg';
        try {
          const uploadResult = await api.uploadImage('/images/upload', imageUri, fileName, mimeType, {
            folder_name: folders.find((f) => f.id === selectedFolderId)?.name ?? '',
            recipe_title: title.trim(),
          });
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
          // verhindern - Rezept wird dann eben ohne Titelbild angelegt
          Alert.alert(
            'Bild-Upload fehlgeschlagen',
            `Das Rezept wird ohne Titelbild gespeichert. Fehler: ${uploadErr instanceof ApiError ? uploadErr.detail : 'Unbekannt'}`,
          );
        }
      }

      const saved = await api.post<{ id: string; title: string }>('/recipes/', { title: title.trim(), servings: servings ? Number(servings) : null, ingredients, steps, cover_image_url: coverImageUrl, folder_id: selectedFolderId, source_type: 'photo_scan' });
      askWhatNext(navigation, { id: saved.id, title: saved.title }, cookOnly);
    } catch (err) {
      Alert.alert('Speichern fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsSaving(false);
    }
  };

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
          onPress={() => setScanError(null)}
          style={[styles.primaryButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}
        >
          {/* Die Fotos bleiben erhalten - nach einem Netzwerkfehler noch
            einmal alles abfotografieren waere aergerlich. */}
        <Text style={styles.primaryButtonText}>Zurück zu den Fotos</Text>
        </Pressable>
      </View>
    );
  }


  // Solange nicht ausgewertet wurde: Fotos sammeln. Erst der Knopf startet
  // die Erfassung - frueher lief sie sofort nach dem ersten Foto los, ein
  // zweites Bild war damit gar nicht vorgesehen.
  if (!result) {
    return (
      <ScrollView
        style={{ backgroundColor: colors.bg }}
        contentContainerStyle={{ padding: 24, alignItems: 'center' }}
      >
        <Text style={[styles.introText, { color: colors.text }]}>
          Fotografiere eine Kochbuchseite, einen handschriftlichen Zettel oder ein Zutaten-Etikett.
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18, textAlign: 'center', marginBottom: 18 }}>
          Geht das Rezept über zwei Seiten oder stehen Zutaten und Zubereitung getrennt?
          Nimm mehrere Fotos auf – sie werden zu einem Rezept zusammengefügt.
        </Text>

        {imageUris.length > 0 && (
          <View style={styles.thumbRow}>
            {imageUris.map((uri, i) => (
              <View key={uri + i} style={styles.thumbWrap}>
                <Image source={{ uri }} style={[styles.thumb, { borderRadius: radius.sm }]} />
                <Pressable
                  onPress={() => setImageUris((prev) => prev.filter((_, idx) => idx !== i))}
                  hitSlop={8}
                  style={styles.thumbRemove}
                >
                  <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>×</Text>
                </Pressable>
                <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 3 }}>
                  {i + 1}
                </Text>
              </View>
            ))}
          </View>
        )}

        <Pressable onPress={handleTakePhoto} style={[styles.primaryButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
          <Text style={styles.primaryButtonText}>
            {imageUris.length === 0 ? '📷 Foto aufnehmen' : '📷 Weiteres Foto'}
          </Text>
        </Pressable>
        <Pressable onPress={handlePickFromLibrary} style={[styles.secondaryButton, { borderColor: gradient[0], borderRadius: radius.md }]}>
          <Text style={[styles.secondaryButtonText, { color: gradient[0] }]}>Aus Galerie wählen</Text>
        </Pressable>

        {imageUris.length > 0 && (
          <Pressable
            onPress={() => runScan(imageUris)}
            style={[styles.primaryButton, { backgroundColor: gradient[0], borderRadius: radius.md, marginTop: 18 }]}
          >
            <Text style={styles.primaryButtonText}>
              {imageUris.length === 1 ? 'Rezept erfassen' : `Aus ${imageUris.length} Fotos erfassen`}
            </Text>
          </Pressable>
        )}
      </ScrollView>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag" style={{ backgroundColor: colors.bg }} contentContainerStyle={styles.container}>
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

      <Text style={[styles.label, { color: colors.muted, marginTop: 16 }]}>Portionen</Text>
      <TextInput
        style={[styles.input, { width: 90, backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
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
                  style={[styles.folderChip, { backgroundColor: isSelected ? gradient[0] : colors.card, borderRadius: radius.sm }]}
                >
                  <Text style={{ color: isSelected ? '#fff' : colors.text, fontSize: 12, fontWeight: '600' }}>{folder.name}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

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

      <Pressable onPress={() => handleSave(false)} disabled={isSaving} style={[styles.saveButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
        {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Rezept speichern</Text>}
      </Pressable>

      {/* Zweiter Weg: Manches kocht man einmal und will es nicht im
          Kochbuch stehen haben. Das Rezept wird trotzdem kurz angelegt -
          Timer, Schritt-Tipps und Hauben-Stufen haengen alle an einer
          Rezept-ID - und nach dem Kochen wieder entfernt. */}
      <Pressable onPress={() => handleSave(true)} disabled={isSaving} style={{ marginTop: 12, paddingVertical: 8 }}>
        <Text style={{ color: colors.muted, fontSize: 12.5, textAlign: 'center' }}>
          Nur <Text style={{ color: gradient[0], fontWeight: '600' }}>jetzt kochen</Text>, nicht im Kochbuch behalten
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 60 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center', marginBottom: 18 },
  thumbWrap: { width: 78 },
  thumb: { width: 78, height: 78 },
  thumbRemove: {
    position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#DC2626', alignItems: 'center', justifyContent: 'center',
  },
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
  folderChipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  folderChip: { paddingHorizontal: 12, paddingVertical: 8 },
  input: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, fontSize: 13.5 },
  stepInput: { minHeight: 50 },
  sectionTitle: { fontSize: 13, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  saveButton: { height: 48, alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  saveButtonText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
});
