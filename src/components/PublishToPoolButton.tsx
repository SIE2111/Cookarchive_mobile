import React, { useState } from 'react';
import { Pressable, StyleSheet, ActivityIndicator, Alert, View, Text, Modal, ScrollView } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';
import { useServerSync } from '../context/ServerSyncContext';

interface MeinPool {
  id: string;
  name: string;
  is_community: boolean;
  active: boolean;
}

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
  // Ob das Rezept schon veroeffentlicht ist, wenn der Bildschirm
  // OEFFNET - vom Rezeptdetail aus recipe.visibility === 'public_pool'
  // gereicht. Ohne das wuesste der Knopf beim Wiederoeffnen eines
  // frueher veroeffentlichten Rezepts nichts von diesem Zustand und
  // wuerde faelschlich "Veroeffentlichen" statt "Aus dem Pool nehmen"
  // anbieten.
  initialPublished = false,
}: {
  recipeId: string;
  recipeTitle: string;
  size?: number;
  style?: object;
  initialPublished?: boolean;
}) {
  const { colors, gradient, radius } = useTheme();
  const { t } = useUebersetzung();
  const { serverSyncEnabled, isLoading: syncLoading } = useServerSync();
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(initialPublished);
  // Auswahl-Dialog nur bei MEHREREN aktiven Pools (23.09.2026) - bei
  // genau einem aktiven (im Regelfall der Community-Pool) wird direkt
  // dorthin veroeffentlicht, ohne extra zu fragen.
  const [poolAuswahl, setPoolAuswahl] = useState<MeinPool[] | null>(null);

  // Solange der Wert noch laedt, NICHT sperren: Ein kurz verzoegerter
  // Ladevorgang darf nicht wie eine Sperre aussehen.
  const isLocked = !syncLoading && !serverSyncEnabled;

  const publish = async (poolId: string) => {
    setIsPublishing(true);
    try {
      await api.post('/pool/publish', { recipe_id: recipeId, pool_id: poolId });
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

  // Keyed ueber die PRIVATE recipe_id, nicht die id des PublicRecipe-
  // Datensatzes - die kennt dieser Knopf gar nicht (siehe
  // routers/pool.py unpublish_recipe fuer den Grund).
  const unpublish = async () => {
    setIsPublishing(true);
    try {
      await api.post('/pool/unpublish', { recipe_id: recipeId });
      setIsPublished(false);
      Alert.alert(t('sonstiges.ausPoolEntfernt'), t('sonstiges.ausPoolEntferntText', { titel: recipeTitle }));
    } catch (err) {
      Alert.alert(
        t('sonstiges.ausPoolEntfernenFehlgeschlagen'),
        err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'),
      );
    } finally {
      setIsPublishing(false);
    }
  };

  const confirm = async () => {
    if (isPublishing) return;
    if (isPublished) {
      // Bewusst mit derselben Rueckfrage-Staerke wie das Veroeffentlichen
      // selbst: Kopien, die andere schon uebernommen haben, bleiben
      // bestehen - das steht auch schon im Text beim Veroeffentlichen,
      // hier wird es noch einmal explizit gesagt, weil es der Moment ist,
      // in dem es tatsaechlich relevant wird.
      Alert.alert(
        t('sonstiges.ausPoolFrage'),
        t('sonstiges.ausPoolText', { titel: recipeTitle }),
        [
          { text: t('allgemein.abbrechen'), style: 'cancel' },
          { text: t('sonstiges.ausPoolNehmen'), style: 'destructive', onPress: unpublish },
        ],
      );
      return;
    }
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

    // Aktive Pools erst hier laden (nicht vorab beim Rendern) - der
    // Knopf sitzt in Listenzeilen, ein Netzwerkaufruf pro Zeile beim
    // blossen Anzeigen waere unnoetig teuer.
    setIsPublishing(true);
    let meinePools: MeinPool[] = [];
    try {
      meinePools = await api.get<MeinPool[]>('/pools/');
    } catch {
      // Fehlschlag hier soll das gewohnte Veroeffentlichen nicht
      // blockieren - einfach so weitermachen, als gaebe es nur den
      // Community-Pool (bisheriges Verhalten).
    } finally {
      setIsPublishing(false);
    }
    const aktive = meinePools.filter((p) => p.active);

    if (aktive.length > 1) {
      setPoolAuswahl(aktive);
      return;
    }
    const zielPool = aktive[0]?.id ?? 'community';
    Alert.alert(
      t('sonstiges.insPoolFrage'),
      t('sonstiges.insPoolText', { titel: recipeTitle }),
      [
        { text: t('allgemein.abbrechen'), style: 'cancel' },
        { text: t('sonstiges.veroeffentlichen'), onPress: () => publish(zielPool) },
      ],
    );
  };

  return (
    <>
    <Pressable
      onPress={confirm}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={
        isPublished
          ? t('sonstiges.ausPoolNehmen')
          : isLocked
            ? t('sonstiges.insPoolOhneSync')
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

    <Modal visible={!!poolAuswahl} transparent animationType="fade" onRequestClose={() => setPoolAuswahl(null)}>
      <View style={styles.modalUeberlagerung}>
        <View style={[styles.modalKarte, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <Text style={[styles.modalTitel, { color: colors.text }]}>{t('sonstiges.poolWaehlen')}</Text>
          <ScrollView style={{ maxHeight: 300 }}>
            {(poolAuswahl ?? []).map((p) => (
              <Pressable
                key={p.id}
                onPress={() => {
                  setPoolAuswahl(null);
                  publish(p.id);
                }}
                style={[styles.poolZeile, { borderColor: colors.cardBorder }]}
              >
                <MaterialCommunityIcons
                  name={p.is_community ? 'earth' : 'account-group'}
                  size={18}
                  color={colors.muted}
                />
                <Text style={{ color: colors.text, fontSize: 14, marginLeft: 10 }}>{p.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable onPress={() => setPoolAuswahl(null)} style={styles.modalAbbrechen}>
            <Text style={{ color: colors.muted, fontWeight: '600' }}>{t('allgemein.abbrechen')}</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  button: { padding: 4 },
  // Ausgegraut statt versteckt: Der Knopf soll erkennbar bleiben, damit
  // klar ist, dass es die Funktion gibt - sie ist nur gerade nicht
  // freigeschaltet.
  locked: { opacity: 0.35 },
  modalUeberlagerung: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 24 },
  modalKarte: { padding: 20 },
  modalTitel: { fontSize: 15.5, fontWeight: '700', marginBottom: 12 },
  poolZeile: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1 },
  modalAbbrechen: { alignItems: 'center', paddingTop: 16 },
});
