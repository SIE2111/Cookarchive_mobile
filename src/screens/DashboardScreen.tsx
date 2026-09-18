import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import ScanFab from '../components/ScanFab';
import IncomingSharesCard from '../components/IncomingSharesCard';
import PublishToPoolButton from '../components/PublishToPoolButton';
import BrutzelGreetingOverlay from '../components/BrutzelGreetingOverlay';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../api/client';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { MainTabParamList, MainStackParamList } from '../navigation/AppNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Home'>,
  NativeStackScreenProps<MainStackParamList>
>;

interface RecipeSummary {
  id: string;
  title: string;
  folder_id: string | null;
  tags: string[] | null;
  prep_time_minutes: number | null;
  servings: number | null;
  cover_image_url: string | null;
  created_at: string;
  last_cooked_at: string | null;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Modul-weites Flag statt Component-State - die Begruessung soll nur EINMAL
// pro App-Start erscheinen, nicht bei jedem Zurueckwechseln zum Dashboard-
// Tab (das wuerde staendig neu ausgeloest werden, wenn es Teil des
// Komponenten-States waere, der bei jedem Mount/Unmount zurueckgesetzt wird).
let hasShownGreetingThisSession = false;

export default function DashboardScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { session } = useAuth();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [folderCount, setFolderCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profileDisplayName, setProfileDisplayName] = useState<string | null>(null);
  const [showGreeting, setShowGreeting] = useState(false);

  // Derselbe Name wie im Profil editierbar (tbl_users.display_name ueber
  // /preferences/) - vorher las die Begruessung stattdessen aus den
  // Supabase-Auth-user_metadata, einer komplett getrennten Ablage, die
  // eine Aenderung im Profil nie mitbekam.
  const loadDisplayName = useCallback(() => {
    api
      .get<{ display_name: string | null; show_greeting_animation: boolean; show_brutzel: boolean }>('/preferences/')
      .then((prefs) => {
        setProfileDisplayName(prefs.display_name);
        // Auch show_brutzel pruefen: Wer Brutzel ganz abgeschaltet hat,
        // soll ihn nicht ausgerechnet beim Oeffnen der App ueber den
        // Bildschirm laufen sehen.
        if (prefs.show_brutzel && prefs.show_greeting_animation && !hasShownGreetingThisSession) {
          hasShownGreetingThisSession = true;
          setShowGreeting(true);
        }
      })
      .catch(() => {
        // Faellt unten einfach auf E-Mail/"da" zurueck, wenn das Laden scheitert
      });
  }, []);

  const displayName = profileDisplayName || session?.user.email?.split('@')[0] || 'da';

  const load = useCallback(async () => {
    try {
      const [recipeData, folderData] = await Promise.all([
        api.get<RecipeSummary[]>('/recipes/'),
        // Ordnernamen, nicht nur die Anzahl: Sie entscheiden, welche
        // Rezepte als Hauptspeise fuer das Rezept des Tages in Frage
        // kommen (siehe mainCourseCandidates).
        api.get<{ id: string; name: string }[]>('/folders/'),
      ]);
      setRecipes(recipeData);
      setFolders(folderData);
      setFolderCount(folderData.length);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Konnte nicht geladen werden');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
    loadDisplayName();
  }, [load, loadDisplayName]);

  // Bei Rueckkehr von einem anderen Screen (z.B. nach einer Namensaenderung
  // im Profil oder dem Anlegen eines neuen Rezepts) neu laden, damit
  // Begruessung/Zahlen/Listen aktuell bleiben.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      load();
      loadDisplayName();
    });
    return unsubscribe;
  }, [navigation, load, loadDisplayName]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

  const newThisWeek = useMemo(
    () => recipes.filter((r) => Date.now() - new Date(r.created_at).getTime() < ONE_WEEK_MS).length,
    [recipes],
  );

  // "Rezept des Tages" - deterministisch nach Kalendertag, damit es sich
  // nicht bei jedem App-Start aendert, aber trotzdem taeglich wechselt.
  // Rezept des Tages: NUR Hauptspeisen. Vorher wurde aus allen Rezepten
  // gewaehlt, weshalb hier auch schon mal ein Kaiserschmarrn, eine Suppe
  // oder ein Cocktail als Vorschlag fuers Abendessen stand.
  //
  // Die Zuordnung laeuft ueber den ORDNER, nicht ueber die Kategorien:
  // Ein Kaiserschmarrn traegt oft nur "Klassiker", liegt aber in
  // "Backen & Desserts". Umbenannte oder eigene Ordner faengt der
  // zweistufige Rueckfall ab.
  const mainCourseCandidates = useMemo(() => {
    const folderName = (id: string | null) =>
      (folders.find((f) => f.id === id)?.name ?? '').toLowerCase();

    const primary = recipes.filter((r) => folderName(r.folder_id).includes('hauptgericht'));
    if (primary.length > 0) return primary;

    // Kein Ordner heisst "Hauptgerichte" (umbenannt oder eigene Struktur):
    // dann wenigstens alles ausschliessen, was sicher keine Hauptspeise ist.
    const notMain = ['dessert', 'backen', 'getränk', 'getraenk', 'vorspeise', 'suppe', 'beilage'];
    const fallback = recipes.filter((r) => {
      const name = folderName(r.folder_id);
      return name === '' ? false : !notMain.some((n) => name.includes(n));
    });
    return fallback.length > 0 ? fallback : recipes;
  }, [recipes, folders]);

  const recipeOfTheDay = useMemo(() => {
    if (mainCourseCandidates.length === 0) return null;
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (24 * 60 * 60 * 1000),
    );
    return mainCourseCandidates[dayOfYear % mainCourseCandidates.length];
  }, [mainCourseCandidates]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    recipes.forEach((r) => (r.tags ?? []).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([tag]) => tag);
  }, [recipes]);

  const recentlyCooked = useMemo(
    () =>
      recipes
        .filter((r) => r.last_cooked_at)
        .sort((a, b) => +new Date(b.last_cooked_at!) - +new Date(a.last_cooked_at!))
        .slice(0, 10),
    [recipes],
  );

  // Kategorien-Zeile: zeigt eingeklappt nur EINE Zeile, mit "Mehr anzeigen"
  // aufklappbar. Vorher waren es drei Zeilen - das schob bei vielen Tags
  // die eigentlichen Rezepte weit nach unten, obwohl das Dashboard als
  // Einstieg die Rezepte zeigen soll, nicht die Filterleiste.
  // Die tatsaechliche Hoehe wird per onLayout gemessen (der innere
  // Container ist NIE selbst hoehenbegrenzt, nur der aeussere clippt
  // visuell) - so weiss man, ob ueberhaupt etwas verborgen ist,
  // unabhaengig von Chip-Anzahl/-Breite.
  const CATEGORIES_COLLAPSED_HEIGHT = 36; // eine Zeile bei dieser Chip-Groesse
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  const [categoriesNaturalHeight, setCategoriesNaturalHeight] = useState(0);
  const categoriesOverflow = categoriesNaturalHeight > CATEGORIES_COLLAPSED_HEIGHT + 4;

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <>
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      {/* Begruessung ("Hallo …! 👋" / "Was kochen wir heute?") bewusst
          entfernt: Sie kostete zwei Zeilen fuer eine Information, die man
          nach dem ersten Oeffnen kennt, und schob die Rezepte nach unten.
          Die animierte Brutzel-Begruessung beim Start bleibt - dort ist
          sie ein Moment, hier war sie Dauermoebel. displayName wird
          weiterhin fuer diese Animation gebraucht. */}

      {error && <Text style={[styles.errorText, { color: '#DC2626' }]}>{error}</Text>}

      {/* Statistik-Kacheln - alle drei aus echten Daten, keine erfundenen Werte */}
      <View style={styles.statsRow}>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{recipes.length}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Rezepte</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{newThisWeek}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Neu (Woche)</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder }]}>
          <Text style={[styles.statValue, { color: colors.text }]}>{folderCount}</Text>
          <Text style={[styles.statLabel, { color: colors.muted }]}>Ordner</Text>
        </View>
      </View>

      {/* Rezept des Tages */}
      {recipeOfTheDay && (
        <Pressable
          onPress={() =>
            navigation.navigate('RecipeDetail', { recipeId: recipeOfTheDay.id, title: recipeOfTheDay.title })
          }
          style={[styles.dailyCard, { borderRadius: radius.lg }]}
        >
          <View style={[styles.dailyBadge, { backgroundColor: gradient[0] }]}>
            <Text style={styles.dailyBadgeText}>REZEPT DES TAGES</Text>
          </View>
          {recipeOfTheDay.cover_image_url ? (
            <Image source={{ uri: recipeOfTheDay.cover_image_url }} style={styles.dailyImage} />
          ) : (
            <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.dailyImage} />
          )}
          <View style={styles.dailyInfo}>
            <Text style={[styles.dailyTitle, { color: colors.text }]} numberOfLines={1}>
              {recipeOfTheDay.title}
            </Text>
            <Text style={[styles.dailyMeta, { color: colors.muted }]}>
              {recipeOfTheDay.prep_time_minutes ? `⏱ ${recipeOfTheDay.prep_time_minutes} Min.` : ''}
              {recipeOfTheDay.servings ? `  ·  🍽 ${recipeOfTheDay.servings} Port.` : ''}
            </Text>
          </View>
        </Pressable>
      )}

      {/* Schnellaktionen */}
      <View style={styles.actionsRow}>
        <Pressable
          onPress={() => navigation.navigate('Einkauf')}
          style={[styles.actionButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}
        >
          <MaterialCommunityIcons name="cart-outline" size={18} color="#fff" />
          <Text style={styles.actionText}>Einkaufszettel</Text>
        </Pressable>
        <Pressable
          onPress={() => navigation.navigate('WeeklyPlan')}
          style={[styles.actionButton, { backgroundColor: colors.card, borderRadius: radius.md }]}
        >
          <MaterialCommunityIcons name="calendar-week-outline" size={18} color={colors.text} />
          <Text style={[styles.actionText, { color: colors.text }]}>Wochenplaner</Text>
        </Pressable>
      </View>

      {/* Kategorien - aus den tatsaechlich vorkommenden Tags abgeleitet, plus
          eine feste Lieblingsgerichte-Kachel, immer sichtbar */}
      <Text style={[styles.sectionLabel, { color: colors.text }]}>Kategorien</Text>
      <View
        style={[
          styles.categoriesClip,
          !categoriesOverflow && { marginBottom: 14 },
          !categoriesExpanded && { maxHeight: CATEGORIES_COLLAPSED_HEIGHT, overflow: 'hidden' },
        ]}
      >
        <View style={styles.categoriesRow} onLayout={(e) => setCategoriesNaturalHeight(e.nativeEvent.layout.height)}>
          <Pressable
            onPress={() => navigation.navigate('Rezepte', { favoritesOnly: true })}
            style={[styles.categoryChip, { backgroundColor: colors.card, borderRadius: radius.sm }]}
          >
            <MaterialCommunityIcons name="heart" size={13} color={gradient[0]} style={{ marginRight: 5 }} />
            <Text style={[styles.categoryText, { color: colors.text }]}>Favoriten</Text>
          </Pressable>
          {categories.map((tag) => (
            <Pressable
              key={tag}
              onPress={() => navigation.navigate('Rezepte', { filterTag: tag })}
              style={[styles.categoryChip, { backgroundColor: colors.card, borderRadius: radius.sm }]}
            >
              <Text style={[styles.categoryText, { color: colors.text }]}>{tag}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      {categoriesOverflow && (
        <Pressable onPress={() => setCategoriesExpanded((prev) => !prev)} style={styles.categoriesToggle}>
          <Text style={[styles.categoriesToggleText, { color: gradient[0] }]}>
            {categoriesExpanded ? 'Weniger anzeigen ▲' : 'Mehr anzeigen ▼'}
          </Text>
        </Pressable>
      )}

      {/* Zuletzt zubereitet (nur Hauptgerichte, keine mitgekochten Beilagen -
          siehe CookModeScreen.tsx, ruft mark-cooked nur fuer recipeIds[0] auf) */}
      <Text style={[styles.sectionLabel, { color: colors.text }]}>Zuletzt zubereitet</Text>
      {recentlyCooked.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          Noch nichts zubereitet – starte die Zubereitung eines Rezepts, dann erscheint es hier.
        </Text>
      ) : (
        <View style={[styles.recentCard, { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder }]}>
          {recentlyCooked.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => navigation.navigate('RecipeDetail', { recipeId: r.id, title: r.title })}
              style={[styles.recentRow, i < recentlyCooked.length - 1 && styles.recentRowBorder, { borderColor: colors.bg }]}
            >
              {r.cover_image_url ? (
                <Image source={{ uri: r.cover_image_url }} style={styles.recentThumb} />
              ) : (
                <View style={[styles.recentThumb, styles.recentThumbPlaceholder, { backgroundColor: gradient[i % 2 === 0 ? 0 : 1] }]} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={[styles.recentTitle, { color: colors.text }]} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={[styles.recentMeta, { color: colors.muted }]}>
                  {(r.tags && r.tags[0]) || 'Rezept'}
                  {r.prep_time_minutes ? ` · ${r.prep_time_minutes} Min.` : ''}
                </Text>
              </View>
              <PublishToPoolButton recipeId={r.id} recipeTitle={r.title} size={17} />
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
    <ScanFab />
    {showGreeting && <BrutzelGreetingOverlay name={displayName} onDismiss={() => setShowGreeting(false)} />}
    </>
  );
}

// Die Abstaende sind bewusst knapp gehalten: Das Dashboard soll auf einem
// Handy-Bildschirm bis in die Liste "Zuletzt zubereitet" reichen. Vorher
// endete der sichtbare Bereich genau ueber der Ueberschrift, die Liste
// selbst sah man erst nach dem Scrollen - und damit wirkte das Dashboard
// leerer als es ist. Wer hier Abstaende wieder vergroessert, schiebt die
// Liste erneut aus dem Bild.
const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 12, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 12, marginTop: 4 },
  statCard: { flex: 1, paddingVertical: 11, paddingHorizontal: 10, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 10.5, marginTop: 2, textAlign: 'center' },
  dailyCard: { overflow: 'hidden', marginBottom: 12 },
  dailyBadge: { position: 'absolute', top: 12, left: 12, zIndex: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  dailyBadgeText: { color: '#fff', fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 },
  dailyImage: { width: '100%', height: 118 },
  dailyInfo: { paddingHorizontal: 14, paddingVertical: 11 },
  dailyTitle: { fontSize: 15.5, fontWeight: '700' },
  dailyMeta: { fontSize: 11.5, marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  actionButton: { flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', height: 46 },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 12.5 },
  sectionLabel: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  categoriesClip: { marginBottom: 6 },
  categoriesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  categoryText: { fontSize: 12, fontWeight: '600' },
  categoriesToggle: { alignSelf: 'flex-start', marginBottom: 14, paddingVertical: 4 },
  categoriesToggleText: { fontSize: 12, fontWeight: '700' },
  emptyText: { fontSize: 12.5, lineHeight: 19 },
  recentCard: { paddingHorizontal: 4 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 10, paddingHorizontal: 10 },
  recentRowBorder: { borderBottomWidth: 1 },
  recentThumb: { width: 40, height: 40, borderRadius: 8 },
  recentThumbPlaceholder: {},
  recentTitle: { fontSize: 13, fontWeight: '600' },
  recentMeta: { fontSize: 10.5, marginTop: 2 },
});
