import React, { useCallback, useState } from 'react';
import { View, Text, Image, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';

interface IncomingShare {
  id: string;
  recipe_title: string;
  from_name: string | null;
  status: string;
  cover_image_url: string | null;
}

/**
 * Rezepte, die jemand geschickt hat - im Dashboard ganz oben.
 *
 * Bewusst eine Karte im Dashboard und kein eigener Bereich in der unteren
 * Leiste: Ein Posteingang, der meistens leer ist, waere ein toter Reiter.
 * Hier blendet sich die Karte einfach aus, wenn nichts offen ist, und
 * faellt auf, wenn etwas da ist.
 *
 * Neu geladen bei jeder Rueckkehr aufs Dashboard - eine Sendung kann
 * jederzeit eintreffen, waehrend die App laeuft.
 */
export default function IncomingSharesCard() {
  const { colors, gradient, radius } = useTheme();
  const [shares, setShares] = useState<IncomingShare[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setShares(await api.get<IncomingShare[]>('/shares/incoming'));
    } catch {
      // Still bleiben: Der Posteingang ist Beiwerk, sein Ausfall darf das
      // Dashboard nicht mit einer Fehlermeldung zupflastern.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const respond = async (share: IncomingShare, action: 'accept' | 'decline') => {
    setBusyId(share.id);
    try {
      await api.post(`/shares/${share.id}/${action}`);
      setShares((prev) => prev.filter((s) => s.id !== share.id));
      if (action === 'accept') {
        Alert.alert('Übernommen', `„${share.recipe_title}" liegt jetzt in deinem Kochbuch.`);
      }
    } catch (err) {
      Alert.alert('Fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setBusyId(null);
    }
  };

  if (shares.length === 0) return null;

  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={[styles.label, { color: colors.muted }]}>
        {shares.length === 1 ? 'FÜR DICH GESCHICKT' : `FÜR DICH GESCHICKT (${shares.length})`}
      </Text>

      {shares.map((share) => (
        <View key={share.id} style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          {share.cover_image_url ? (
            <Image source={{ uri: share.cover_image_url }} style={[styles.thumb, { borderRadius: radius.sm }]} />
          ) : (
            <View style={[styles.thumb, styles.thumbEmpty, { borderRadius: radius.sm }]}>
              <MaterialCommunityIcons name="email-fast-outline" size={18} color={colors.muted} />
            </View>
          )}

          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
              {share.recipe_title}
            </Text>
            <Text style={[styles.from, { color: colors.muted }]}>von {share.from_name ?? 'jemandem'}</Text>

            <View style={styles.actions}>
              <Pressable
                onPress={() => respond(share, 'accept')}
                disabled={busyId === share.id}
                style={[styles.accept, { backgroundColor: gradient[0], borderRadius: radius.sm }]}
              >
                {busyId === share.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.acceptText}>Übernehmen</Text>
                )}
              </Pressable>
              <Pressable
                onPress={() => respond(share, 'decline')}
                disabled={busyId === share.id}
                hitSlop={6}
                style={styles.decline}
              >
                <Text style={{ color: colors.muted, fontSize: 12 }}>Ablehnen</Text>
              </Pressable>
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8 },
  card: { flexDirection: 'row', padding: 11, marginBottom: 8, gap: 11 },
  thumb: { width: 54, height: 54 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.15)' },
  title: { fontSize: 14, fontWeight: '700' },
  from: { fontSize: 11.5, marginTop: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  accept: { paddingHorizontal: 14, paddingVertical: 7 },
  acceptText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  decline: { paddingVertical: 7 },
});
