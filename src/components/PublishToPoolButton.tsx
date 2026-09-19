import React, { useState } from 'react';
import { Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';
import { useServerSync } from '../context/ServerSyncContext';

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
  const { t } = useUebersetzung();
  const { serverSyncEnabled, isLoading: syncLoading } = useServerSync();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(false);

  // Solange der Wert noch laedt, NICHT sperren: Ein kurz verzoegerter
  // Ladevorgang darf nicht wie eine Sperre aussehen.
  const isLocked = !syncLoading && !serverSyncEnabled;

  const publish = async () => {
    setIsPublishing(true);
    try {
      await api.post('/pool/publish', { recipe_id: recipeId });
      setIsPublished(true);
      Alert.alert(t('sonstiges.veroeffentlicht'), t('sonstiges.veroeffentlichtText', { titel: recipeTitle }));
    } catch (err) {
      const detail = err instanceof ApiError ? err.detail : t('profil.unbekannterFehler');
      const title =
        err instanceof ApiError && err.status === 403
          ? t('sonstiges.syncNoetig')
          : err instanceof ApiError && err.status === 429
            ? t('sonstiges.tageslimit')
            : t('sonstiges.veroeffentlichenFehlgeschlagen');
      const message =
        err instanceof ApiError && err.status === 403
          ? t('sonstiges.poolBrauchtSync')
          : detail;
      Alert.alert(title, message);
    } finally {
      setIsPublishing(false);
    }
  };

  const confirm = () => {
    if (isPublished || isPublishing) return;
    if (isLocked) {
      // Der Knopf ist sichtbar ausgegraut - wer ihn trotzdem antippt,
      // bekommt den Grund gesagt statt gar nichts. Ein Knopf, der auf
      // Beruehrung schweigt, wirkt kaputt.
      Alert.alert(
        t('sonstiges.syncNoetig'),
        t('sonstiges.teilenBrauchtSync'),
      );
      return;
    }
    Alert.alert(
      t('sonstiges.insPoolFrage'),
      t('sonstiges.insPoolText', { titel: recipeTitle }),
      [
        { text: t('allgemein.abbrechen'), style: 'cancel' },
        { text: t('sonstiges.veroeffentlichen'), onPress: publish },
      ],
    );
  };

  return (
    <Pressable
      onPress={confirm}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        isLocked
          ? t('sonstiges.insPoolOhneSync')
          : isPublished
            ? t('sonstiges.bereitsVeroeffentlicht')
            : t('sonstiges.insPool')
      }
      accessibilityState={{ disabled: isLocked }}
      style={[styles.button, isLocked && styles.locked, style]}
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
  // Ausgegraut statt versteckt: Der Knopf soll erkennbar bleiben, damit
  // klar ist, dass es die Funktion gibt - sie ist nur gerade nicht
  // freigeschaltet.
  locked: { opacity: 0.35 },
});
