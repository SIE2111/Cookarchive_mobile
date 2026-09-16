import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Image, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
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
  tags: string[] | null;
  prep_time_minutes: number | null;
  servings: number | null;
  cover_image_url: string | null;
  created_at: string;
}

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export default function DashboardScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { session } = useAuth();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [folderCount, setFolderCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayName =
    (session?.user.user_metadata?.display_name as string | undefined) ||
    session?.user.email?.split('@')[0] ||
    'da';

  const load = useCallback(async () => {
    try {
      const [recipeData, folderData] = await Promise.all([
        api.get<RecipeSummary[]>('/recipes/'),
        api.get<{ id: string }[]>('/folders/'),
      ]);
      setRecipes(recipeData);
      setFolderCount(folderData.length);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Konnte nicht geladen werden');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  // Bei Rueckkehr von einem anderen Screen (z.B. nach dem Anlegen eines
  // neuen Rezepts) neu laden, damit die Zahlen/Listen aktuell bleiben.
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', load);
    return unsubscribe;
  }, [navigation, load]);

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
  const recipeOfTheDay = useMemo(() => {
    if (recipes.length === 0) return null;
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / (24 * 60 * 60 * 1000),
    );
    return recipes[dayOfYear % recipes.length];
  }, [recipes]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    recipes.forEach((r) => (r.tags ?? []).forEach((t) => counts.set(t, (counts.get(t) ?? 0) + 1)));
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([tag]) => tag);
  }, [recipes]);

  const recentlyAdded = useMemo(
    () => [...recipes].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)).slice(0, 4),
    [recipes],
  );

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
    >
      <Text style={[styles.greeting, { color: colors.text }]}>Hallo {displayName}! 👋</Text>
      <Text style={[styles.subGreeting, { color: colors.muted }]}>Was kochen wir heute?</Text>

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
          onPress={() =>
            Alert.alert('Bald verfügbar', 'Der Wochenplaner ist noch in Arbeit und kommt in einem späteren Update.')
          }
          style={[styles.actionButton, { backgroundColor: colors.card, borderRadius: radius.md }]}
        >
          <MaterialCommunityIcons name="calendar-week-outline" size={18} color={colors.text} />
          <Text style={[styles.actionText, { color: colors.text }]}>Wochenplaner</Text>
        </Pressable>
      </View>

      {/* Kategorien - aus den tatsaechlich vorkommenden Tags abgeleitet */}
      {categories.length > 0 && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>Kategorien</Text>
          <View style={styles.categoriesRow}>
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
        </>
      )}

      {/* Zuletzt hinzugefuegt */}
      <Text style={[styles.sectionLabel, { color: colors.text }]}>Zuletzt hinzugefügt</Text>
      {recentlyAdded.length === 0 ? (
        <Text style={[styles.emptyText, { color: colors.muted }]}>
          Noch keine Rezepte – leg dein erstes über "Scan" oder "Rezepte" an.
        </Text>
      ) : (
        <View style={[styles.recentCard, { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder }]}>
          {recentlyAdded.map((r, i) => (
            <Pressable
              key={r.id}
              onPress={() => navigation.navigate('RecipeDetail', { recipeId: r.id, title: r.title })}
              style={[styles.recentRow, i < recentlyAdded.length - 1 && styles.recentRowBorder, { borderColor: colors.bg }]}
            >
              <View style={[styles.recentDot, { backgroundColor: gradient[i % 2 === 0 ? 0 : 1] }]} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.recentTitle, { color: colors.text }]} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={[styles.recentMeta, { color: colors.muted }]}>
                  {(r.tags && r.tags[0]) || 'Rezept'}
                  {r.prep_time_minutes ? ` · ${r.prep_time_minutes} Min.` : ''}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 18, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  greeting: { fontSize: 21, fontWeight: '700' },
  subGreeting: { fontSize: 13, marginTop: 2, marginBottom: 18 },
  errorText: { fontSize: 12, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
  statCard: { flex: 1, padding: 14, alignItems: 'center' },
  statValue: { fontSize: 20, fontWeight: '700' },
  statLabel: { fontSize: 10.5, marginTop: 2, textAlign: 'center' },
  dailyCard: { overflow: 'hidden', marginBottom: 18 },
  dailyBadge: { position: 'absolute', top: 12, left: 12, zIndex: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  dailyBadgeText: { color: '#fff', fontSize: 9.5, fontWeight: '700', letterSpacing: 0.4 },
  dailyImage: { width: '100%', height: 150 },
  dailyInfo: { padding: 14 },
  dailyTitle: { fontSize: 15.5, fontWeight: '700' },
  dailyMeta: { fontSize: 11.5, marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  actionButton: { flex: 1, flexDirection: 'row', gap: 7, alignItems: 'center', justifyContent: 'center', height: 46 },
  actionText: { color: '#fff', fontWeight: '600', fontSize: 12.5 },
  sectionLabel: { fontSize: 15, fontWeight: '700', marginBottom: 10 },
  categoriesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 8 },
  categoryText: { fontSize: 12, fontWeight: '600' },
  emptyText: { fontSize: 12.5, lineHeight: 19 },
  recentCard: { paddingHorizontal: 4 },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingHorizontal: 10 },
  recentRowBorder: { borderBottomWidth: 1 },
  recentDot: { width: 10, height: 10, borderRadius: 5 },
  recentTitle: { fontSize: 13, fontWeight: '600' },
  recentMeta: { fontSize: 10.5, marginTop: 2 },
});
