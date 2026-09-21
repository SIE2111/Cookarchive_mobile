import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Switch, ScrollView, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';

/**
 * Verwaltung der Kategorien-Zeile im Dashboard: Reihenfolge festlegen
 * (rauf/runter statt Ziehen - kein Drag&Drop-Paket im Projekt, das
 * wuerde einen neuen nativen Build brauchen, bevor es in Expo Go
 * sichtbar waere) und einzelne Kategorien ein-/ausblenden.
 *
 * Selbststaendig geladen (eigener /recipes/- und /preferences/-Aufruf),
 * nicht ueber Route-Parameter vom Dashboard gereicht - so ist der Stand
 * beim Oeffnen immer aktuell, auch wenn zwischendurch ein Rezept
 * gaendert wurde.
 */

interface RecipeSummary {
  tags: string[] | null;
}

export default function ManageCategoriesScreen({ navigation }: any) {
  const { colors, gradient, radius } = useTheme();
  const { t } = useUebersetzung();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<string[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const [recipes, prefs] = await Promise.all([
        api.get<RecipeSummary[]>('/recipes/'),
        api.get<{ category_order: string[] | null; hidden_categories: string[] | null }>('/preferences/'),
      ]);
      const counts = new Map<string, number>();
      recipes.forEach((r) => (r.tags ?? []).forEach((tg) => counts.set(tg, (counts.get(tg) ?? 0) + 1)));

      const gespeicherteReihenfolge = (prefs.category_order ?? []).filter((tg) => counts.has(tg));
      const rest = Array.from(counts.keys())
        .filter((tg) => !gespeicherteReihenfolge.includes(tg))
        .sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0));

      setOrder([...gespeicherteReihenfolge, ...rest]);
      setHidden(new Set(prefs.hidden_categories ?? []));
      setAllTags(Array.from(counts.keys()));
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : t('dashboard.nichtGeladen'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const move = (index: number, richtung: -1 | 1) => {
    setOrder((vorher) => {
      const neu = [...vorher];
      const ziel = index + richtung;
      if (ziel < 0 || ziel >= neu.length) return vorher;
      [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
      return neu;
    });
  };

  const toggleHidden = (tag: string) => {
    setHidden((vorher) => {
      const neu = new Set(vorher);
      if (neu.has(tag)) neu.delete(tag);
      else neu.add(tag);
      return neu;
    });
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await api.patch('/preferences/', {
        category_order: order,
        hidden_categories: Array.from(hidden),
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert(t('allgemein.fehler'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    Alert.alert(t('dashboard.kategorienZuruecksetzenFrage'), t('dashboard.kategorienZuruecksetzenText'), [
      { text: t('allgemein.abbrechen'), style: 'cancel' },
      {
        text: t('dashboard.zuruecksetzen'),
        style: 'destructive',
        onPress: () => {
          setHidden(new Set());
          setOrder((vorher) => [...vorher].sort());
          // Sortierung selbst spielt hier keine Rolle - beim Speichern
          // zaehlt ohnehin nur, dass category_order/hidden_categories auf
          // [] gesetzt werden, danach greift wieder die automatische
          // Haeufigkeitssortierung im Dashboard.
          api.patch('/preferences/', { category_order: [], hidden_categories: [] }).catch(() => {});
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={gradient[0]} />
      </View>
    );
  }

  return (
    <View style={[styles.page, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton} hitSlop={8}>
          <MaterialCommunityIcons name="chevron-left" size={22} color={colors.text} />
          <Text style={[styles.backText, { color: colors.text }]}>{t('allgemein.zurueck')}</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>{t('dashboard.kategorienVerwalten')}</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>{t('dashboard.kategorienVerwaltenText')}</Text>

        {error && <Text style={[styles.errorText, { color: '#C0392B' }]}>{error}</Text>}

        {order.map((tag, index) => (
          <View key={tag} style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.sm }]}>
            <View style={styles.moveColumn}>
              <Pressable onPress={() => move(index, -1)} disabled={index === 0} hitSlop={6}>
                <MaterialCommunityIcons
                  name="chevron-up"
                  size={20}
                  color={index === 0 ? colors.muted : colors.text}
                />
              </Pressable>
              <Pressable onPress={() => move(index, 1)} disabled={index === order.length - 1} hitSlop={6}>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={20}
                  color={index === order.length - 1 ? colors.muted : colors.text}
                />
              </Pressable>
            </View>
            <Text
              style={[
                styles.rowText,
                { color: hidden.has(tag) ? colors.muted : colors.text },
              ]}
            >
              {tag}
            </Text>
            <Switch
              value={!hidden.has(tag)}
              onValueChange={() => toggleHidden(tag)}
              trackColor={{ false: '#E7E1D4', true: gradient[0] }}
              thumbColor="#fff"
            />
          </View>
        ))}

        {allTags.length === 0 && (
          <Text style={[styles.lead, { color: colors.muted }]}>{t('dashboard.kategorienKeine')}</Text>
        )}

        <Pressable onPress={handleReset} style={styles.resetLink}>
          <Text style={[styles.resetText, { color: gradient[0] }]}>{t('dashboard.zuruecksetzen')}</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.background }]}>
        <Pressable
          onPress={handleSave}
          disabled={isSaving}
          style={[styles.saveButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}
        >
          {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('allgemein.speichern')}</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
  backButton: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingRight: 8 },
  backText: { fontSize: 16, fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingBottom: 100 },
  title: { fontSize: 22, fontWeight: '800', marginTop: 8, marginBottom: 6 },
  lead: { fontSize: 14, lineHeight: 20, marginBottom: 18 },
  errorText: { fontSize: 14, marginBottom: 12 },
  row: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
  },
  moveColumn: { marginRight: 10 },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600' },
  resetLink: { alignSelf: 'center', marginTop: 12, minHeight: 44, justifyContent: 'center' },
  resetText: { fontSize: 14, fontWeight: '700' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  saveButton: { height: 50, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
