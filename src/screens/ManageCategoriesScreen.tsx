import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, Switch, ScrollView, Alert,
  Animated, PanResponder,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';

/**
 * Verwaltung der Kategorien-Zeile im Dashboard: Reihenfolge per Ziehen
 * festlegen und einzelne Kategorien ein-/ausblenden.
 *
 * Erste Fassung hatte hier kleine Rauf/Runter-Pfeile statt Ziehen (kein
 * Drag&Drop-Paket im Projekt, das haette einen neuen nativen Build
 * gebraucht). Zu klein, zu fummelig - Rueckmeldung war eindeutig. Diese
 * Fassung zieht wirklich, gebaut mit PanResponder + Animated aus dem
 * React-Native-Kern selbst (keine neue Abhaengigkeit noetig, beides ist
 * Teil von React Native und funktioniert in Expo Go ohne neuen Build).
 *
 * Funktionsweise: jede Zeile hat einen eigenen Ziehgriff (Symbol links).
 * Waehrend des Ziehens bewegt sich NUR die gezogene Zeile 1:1 mit dem
 * Finger (dragY), die anderen Zeilen ruecken animiert zur Seite, um
 * Platz zu machen (rowOffsets, ueber ein Map<tag, Animated.Value>, das
 * die gesamte Zieh-Geste ueberlebt - anders als der PanResponder selbst,
 * der bei jedem Render neu erzeugt wird, was hier unproblematisch ist,
 * weil er dadurch immer die aktuellen order/hoverIndex-Werte sieht statt
 * veralteter aus einem fruehen Render (kein useMemo/useCallback noetig).
 * Die eigentliche order-Liste aendert sich erst beim Loslassen - waehrend
 * des Ziehens ist alles rein visuell (translateY), kein Neuordnen des
 * Arrays mitten in der Geste.
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

  const [draggingTag, setDraggingTag] = useState<string | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const dragStartIndexRef = useRef(0);
  const dragY = useRef(new Animated.Value(0)).current;
  // Ueberlebt die ganze Geste, anders als lokale Variablen im Render -
  // ein Wert pro Tag, wird beim ersten Bedarf angelegt und danach nur
  // noch wiederverwendet (Map bleibt ueber Rerenders hinweg bestehen).
  const rowOffsets = useRef<Map<string, Animated.Value>>(new Map()).current;
  const offsetFuer = (tag: string) => {
    if (!rowOffsets.has(tag)) rowOffsets.set(tag, new Animated.Value(0));
    return rowOffsets.get(tag)!;
  };

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

  // Waehrend des Ziehens: alle NICHT gezogenen Zeilen animiert zur Seite
  // ruecken, wenn sie zwischen Start- und aktueller Zielposition liegen -
  // macht sichtbar Platz fuer die gezogene Zeile, statt dass sie beim
  // Loslassen ploetzlich woanders auftaucht.
  useEffect(() => {
    order.forEach((tag, index) => {
      if (tag === draggingTag) return;
      let ziel = 0;
      if (draggingTag != null && hoverIndex != null) {
        const start = dragStartIndexRef.current;
        if (start < hoverIndex && index > start && index <= hoverIndex) ziel = -ROW_HEIGHT;
        else if (start > hoverIndex && index >= hoverIndex && index < start) ziel = ROW_HEIGHT;
      }
      Animated.timing(offsetFuer(tag), { toValue: ziel, duration: 150, useNativeDriver: true }).start();
    });
    // rowOffsets/offsetFuer sind stabile Refs, absichtlich nicht in den
    // Dependencies - sie wuerden bei jedem Render neu "unterschiedlich"
    // aussehen, obwohl sich am Verhalten nichts aendert.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order, draggingTag, hoverIndex]);

  const makeResponder = (tag: string, index: number) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, gesture) => Math.abs(gesture.dy) > 2,
      onPanResponderGrant: () => {
        dragStartIndexRef.current = index;
        dragY.setValue(0);
        setDraggingTag(tag);
        setHoverIndex(index);
      },
      onPanResponderMove: (_evt, gesture) => {
        dragY.setValue(gesture.dy);
        const rohesZiel = index + Math.round(gesture.dy / ROW_HEIGHT);
        setHoverIndex(Math.max(0, Math.min(order.length - 1, rohesZiel)));
      },
      onPanResponderRelease: () => {
        const von = dragStartIndexRef.current;
        const nach = hoverIndex ?? von;
        if (von !== nach) {
          setOrder((vorher) => {
            const neu = [...vorher];
            const [element] = neu.splice(von, 1);
            neu.splice(nach, 0, element);
            return neu;
          });
        }
        dragY.setValue(0);
        setDraggingTag(null);
        setHoverIndex(null);
      },
      onPanResponderTerminate: () => {
        dragY.setValue(0);
        setDraggingTag(null);
        setHoverIndex(null);
      },
    });

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

      <ScrollView contentContainerStyle={styles.content} scrollEnabled={draggingTag == null}>
        <Text style={[styles.title, { color: colors.text }]}>{t('dashboard.kategorienVerwalten')}</Text>
        <Text style={[styles.lead, { color: colors.muted }]}>{t('dashboard.kategorienVerwaltenText')}</Text>

        {error && <Text style={[styles.errorText, { color: '#C0392B' }]}>{error}</Text>}

        <View style={{ height: order.length * ROW_HEIGHT }}>
          {order.map((tag, index) => {
            const responder = makeResponder(tag, index);
            const istGezogen = tag === draggingTag;
            const translateY = istGezogen
              ? Animated.add(new Animated.Value(index * ROW_HEIGHT), dragY)
              : Animated.add(new Animated.Value(index * ROW_HEIGHT), offsetFuer(tag));
            return (
              <Animated.View
                key={tag}
                style={[
                  styles.row,
                  { backgroundColor: colors.card, borderRadius: radius.sm },
                  { position: 'absolute', left: 0, right: 0, height: ROW_HEIGHT - 8 },
                  { transform: [{ translateY }] },
                  istGezogen && { zIndex: 10, elevation: 6, shadowOpacity: 0.18, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
                ]}
              >
                <View {...responder.panHandlers} style={styles.dragHandle} hitSlop={4}>
                  <MaterialCommunityIcons name="drag-horizontal-variant" size={22} color={colors.muted} />
                </View>
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
              </Animated.View>
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
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10,
  },
  // Grosszuegiger Ziehgriff - mindestens 44pt Kantenlaenge, die uebliche
  // Mindestgroesse fuer Touch-Ziele, statt der winzigen Pfeile davor.
  dragHandle: { width: 44, height: '100%', alignItems: 'center', justifyContent: 'center' },
  rowText: { flex: 1, fontSize: 15, fontWeight: '600', marginLeft: 2 },
  resetLink: { alignSelf: 'center', marginTop: 12, minHeight: 44, justifyContent: 'center' },
  resetText: { fontSize: 14, fontWeight: '700' },
  footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 16 },
  saveButton: { height: 50, alignItems: 'center', justifyContent: 'center' },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
