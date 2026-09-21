import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Switch, ScrollView, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';

/**
 * Verwaltung der Kategorien-Zeile im Dashboard: Reihenfolge festlegen und
 * einzelne Kategorien ein-/ausblenden.
 *
 * DRITTER Anlauf beim Umsortieren, diesmal bewusst OHNE Ziehen. Die ersten
 * zwei Versuche (kleine Pfeile, dann PanResponder, dann react-native-
 * gesture-handler) sind alle an echten Problemen gescheitert, die letzte
 * Fassung sogar an einem haengenden Zustand, dessen genaue Ursache sich
 * ohne die App vor Augen nicht zuverlaessig fassen liess. Statt eines
 * vierten Versuchs mit einer noch invasiveren Abhaengigkeit (reanimated 4,
 * nur mit New Architecture lauffaehig, eigene Babel-Konfiguration - eine
 * App-weite Aenderung mit echtem Risiko) jetzt eine Loesung, die gar
 * nicht erst scheitern kann: vier eindeutige Knoepfe statt einer Geste.
 *
 * Bewusst NICHT "antippen zum Auswaehlen, dann Zielposition antippen" -
 * das braucht einen unsichtbaren Zwischenzustand und ist fehleranfaellig
 * (ein Tipp auf den Schalter waehrend "Ziel waehlen" aktiv ist, koennte
 * als Zielauswahl statt als Sichtbarkeits-Umschalten missverstanden
 * werden). Jeder der vier Knoepfe hat dagegen genau eine, sofortige
 * Wirkung - nichts, das sich falsch interpretieren laesst.
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
      // Standard-Regel wie im Dashboard: "Einfach" und "Klassiker" zuerst,
      // falls vorhanden, danach alphabetisch - nur fuer Tags, die der
      // Nutzer noch nicht selbst einsortiert hat.
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

  const moveOne = (index: number, richtung: -1 | 1) => {
    setOrder((vorher) => {
      const ziel = index + richtung;
      if (ziel < 0 || ziel >= vorher.length) return vorher;
      const neu = [...vorher];
      [neu[index], neu[ziel]] = [neu[ziel], neu[index]];
      return neu;
    });
  };

  const moveToEdge = (index: number, kante: 'anfang' | 'ende') => {
    setOrder((vorher) => {
      const neu = [...vorher];
      const [element] = neu.splice(index, 1);
      if (kante === 'anfang') neu.unshift(element);
      else neu.push(element);
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
    <View style={[styles.page, { backgroundColor: colors.bg }]}>
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

        {order.map((tag, index) => {
          const istErste = index === 0;
          const istLetzte = index === order.length - 1;
          return (
            <View key={tag} style={[styles.row, { backgroundColor: colors.card, borderRadius: radius.sm }]}>
              <View style={styles.rowTop}>
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
              <View style={styles.moveRow}>
                <Pressable
                  onPress={() => moveToEdge(index, 'anfang')}
                  disabled={istErste}
                  style={styles.moveButton}
                  hitSlop={4}
                  accessibilityLabel={t('dashboard.anDenAnfang')}
                >
                  <MaterialCommunityIcons name="arrow-collapse-up" size={20} color={istErste ? colors.cardBorder : colors.muted} />
                </Pressable>
                <Pressable
                  onPress={() => moveOne(index, -1)}
                  disabled={istErste}
                  style={styles.moveButton}
                  hitSlop={4}
                  accessibilityLabel={t('dashboard.nachOben')}
                >
                  <MaterialCommunityIcons name="chevron-up" size={24} color={istErste ? colors.cardBorder : colors.text} />
                </Pressable>
                <Pressable
                  onPress={() => moveOne(index, 1)}
                  disabled={istLetzte}
                  style={styles.moveButton}
                  hitSlop={4}
                  accessibilityLabel={t('dashboard.nachUnten')}
                >
                  <MaterialCommunityIcons name="chevron-down" size={24} color={istLetzte ? colors.cardBorder : colors.text} />
                </Pressable>
                <Pressable
                  onPress={() => moveToEdge(index, 'ende')}
                  disabled={istLetzte}
                  style={styles.moveButton}
                  hitSlop={4}
                  accessibilityLabel={t('dashboard.ansEnde')}
                >
                  <MaterialCommunityIcons name="arrow-collapse-down" size={20} color={istLetzte ? colors.cardBorder : colors.muted} />
                </Pressable>
              </View>
            </View>
          );
        })}

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
  row: { paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600', marginRight: 8 },
  // Vier eindeutige Knoepfe statt einer Geste - jeder mindestens 44pt
  // hoch, deutlich groesser als die urspruenglichen kleinen Pfeile.
  moveRow: { flexDirection: 'row', gap: 4 },
  moveButton: {
    flex: 1, height: 44, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.03)', borderRadius: 8,
  },
  resetLink: { alignSelf: 'center', marginTop: 12, minHeight: 44, justifyContent: 'center' },
  resetText: { fontSize: 14, fontWeight: '700' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  saveButton: { height: 50, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
