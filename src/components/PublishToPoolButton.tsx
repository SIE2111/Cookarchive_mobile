import React, { useState } from 'react';
import { Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';

/**
 * Kleiner Knopf "ins Gemeinschaftskochbuch stellen" - sitzt direkt an der
 * Rezeptzeile bzw. auf der Rezeptseite, damit Veroeffentlichen dort
 * moeglich ist, wo man das Rezept gerade sieht, statt in einem Menue
 * dahinter.
 *
 * Bewusst mit Rueckfrage: Veroeffentlichen macht das Rezept fuer alle
 * sichtbar und laesst sich nicht stillschweigend rueckgaengig machen
 * (Kopien, die andere bereits uebernommen haben, bleiben bestehen). Ein
 * Knopf, der das auf einen Fingertipp ohne Nachfrage tut, waere in einer
 * Liste neben "oeffnen" zu gefaehrlich.
 *
 * Die Fehlerfaelle des Backends sind echte, erwartbare Zustaende und
 * werden deshalb im Klartext gezeigt statt als "Unbekannter Fehler":
 * fehlender Server-Sync (403), Tageslimit (429) und die inhaltliche
 * KI-Vorpruefung (400).
 */
export default function PublishToPoolButton({
  recipeId,
  recipeTitle,
  size = 18,
  style,
}: {
  recipeId: string;
  recipeTitle: string;
  size?: number;
  style?: object;
}) {
  const { colors, gradient } = useTheme();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);

  const publish = async () => {
    setIsPublishing(true);
    try {
      await api.post('/pool/publish', { recipe_id: recipeId });
      setIsPublished(true);
      Alert.alert('Veröffentlicht', `"${recipeTitle}" steht jetzt im Community-Pool.`);
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : 'Unbekannter Fehler';
      const title =
        err instanceof ApiError && err.status === 403
          ? 'Server-Sync nötig'
          : err instanceof ApiError && err.status === 429
            ? 'Tageslimit erreicht'
            : 'Veröffentlichen fehlgeschlagen';
      const message =
        err instanceof ApiError && err.status === 403
          ? 'Der Community-Pool braucht aktivierten Server-Sync. Du findest den Schalter im Profil unter „Darstellung & Bedienung".'
          : detail;
      Alert.alert(title, message);
    } finally {
      setIsPublishing(false);
    }
  };

  const confirm = () => {
    if (isPublished || isPublishing) return;
    Alert.alert(
      'Ins Gemeinschaftskochbuch stellen?',
      `"${recipeTitle}" wird für alle Nutzerinnen und Nutzer sichtbar. Andere können es übernehmen; ` +
        'bereits übernommene Kopien bleiben bestehen, auch wenn du es später zurückziehst.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Veröffentlichen', onPress: publish },
      ],
    );
  };

  return (
    <Pressable
      onPress={confirm}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={isPublished ? 'Bereits veröffentlicht' : 'Ins Gemeinschaftskochbuch stellen'}
      style={[styles.button, style]}
    >
      {isPublishing ? (
        <ActivityIndicator size="small" color={colors.muted} />
      ) : (
        <MaterialCommunityIcons
          name={isPublished ? 'account-group' : 'account-group-outline'}
          size={size}
          color={isPublished ? gradient[0] : colors.muted}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
});
