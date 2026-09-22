import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Switch, Alert, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';

/**
 * Verwaltung der Kategorien-Zeile im Dashboard: Reihenfolge mit Pfeil-
 * Knoepfen festlegen und einzelne Kategorien ein-/ausblenden.
 *
 * Pfeile statt Ziehen (22.09.2026): Die Zieh-Variante mit
 * react-native-gesture-handler (siehe Git-Historie, Commit 62678ae) hob
 * die Karte im installierten Build nur an, bewegte sie aber nicht. Pfeile
 * sind reines JavaScript, funktionieren per EAS Update ohne neuen Build
 * und sind fuer viele Nutzer einfacher als Ziehen. Das Ziehen kann beim
 * naechsten regulaeren Build wieder aus der Historie geholt werden.
 */

const ROW_HEIGHT = 60;

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
      // Dieselbe Standard-Regel wie im Dashboard (siehe dort): "Einfach"
      // und "Klassiker" zuerst, falls vorhanden, danach alphabetisch -
      // nur fuer Tags, die der Nutzer noch nicht selbst einsortiert hat.
      const restKandidaten = Array.from(counts.keys()).filter((tg) => !gespeicherteReihenfolge.includes(tg));
      const STANDARD_ZUERST = ['Einfach', 'Klassiker'];
      const vorrang = STANDARD_ZUERST.filter((tg) => restKandidaten.includes(tg));
      const alphabetisch = restKandidaten
        .filter((tg) => !STANDARD_ZUERST.includes(tg))
        .sort((a, b) => a.localeCompare(b, 'de'));

      setOrder([...gespeicherteReihenfolge, ...vorrang, ...alphabetisch]);
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

  const verschiebe = (von: number, nach: number) => {
    setOrder((vorher) => {
      if (nach < 0 || nach >= vorher.length) return vorher;
      const neu = [...vorher];
      const [element] = neu.splice(von, 1);
      neu.splice(nach, 0, element);
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
          api.patch('/preferences/', { category_order: [], hidden_categories: [] }).catch(() => {});
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={gradient[0]} />
      </View>
    );
  }

  return (
      <SafeAreaView style={[styles.page, { backgroundColor: colors.bg }]} edges={['top']}>
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

          <View>
            {order.map((tag, index) => {
              const istErste = index === 0;
              const istLetzte = index === order.length - 1;
              return (
                <View
                  key={tag}
                  style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.sm }]}
                >
                  <Pressable
                    onPress={() => verschiebe(index, index - 1)}
                    disabled={istErste}
                    style={styles.pfeil}
                    hitSlop={2}
                    accessibilityRole="button"
                    accessibilityLabel={`${tag} ${t('dashboard.nachOben')}`}
                  >
                    <MaterialCommunityIcons name="chevron-up" size={26} color={istErste ? colors.cardBorder : colors.text} />
                  </Pressable>
                  <Pressable
                    onPress={() => verschiebe(index, index + 1)}
                    disabled={istLetzte}
                    style={styles.pfeil}
                    hitSlop={2}
                    accessibilityRole="button"
                    accessibilityLabel={`${tag} ${t('dashboard.nachUnten')}`}
                  >
                    <MaterialCommunityIcons name="chevron-down" size={26} color={istLetzte ? colors.cardBorder : colors.text} />
                  </Pressable>
                  <Text
                    style={[styles.rowText, { color: hidden.has(tag) ? colors.muted : colors.text }]}
                    numberOfLines={1}
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
              );
            })}
          </View>

          {allTags.length === 0 && (
            <Text style={[styles.lead, { color: colors.muted }]}>{t('dashboard.kategorienKeine')}</Text>
          )}

          <Pressable onPress={handleReset} style={styles.resetLink}>
            <Text style={[styles.resetText, { color: gradient[0] }]}>{t('dashboard.zuruecksetzen')}</Text>
          </Pressable>
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: colors.bg }]}>
          <Pressable
            onPress={handleSave}
            disabled={isSaving}
            style={[styles.saveButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}
          >
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>{t('allgemein.speichern')}</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
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
    flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 10,
    height: ROW_HEIGHT - 8, marginBottom: 8,
  },
  // Pfeil-Knoepfe mit 44pt Hoehe, der ueblichen Mindestgroesse fuer Touch-Ziele.
  pfeil: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600', marginLeft: 6 },
  resetLink: { alignSelf: 'center', marginTop: 12, minHeight: 44, justifyContent: 'center' },
  resetText: { fontSize: 14, fontWeight: '700' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  saveButton: { height: 50, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
