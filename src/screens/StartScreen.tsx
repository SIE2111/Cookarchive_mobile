import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Image } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'Start'>;

interface RecipeSummary {
  id: string;
  title: string;
  tags: string[] | null;
  updated_at: string;
  cover_image_url: string | null;
}

export default function StartScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadRecipes = useCallback(async () => {
    try {
      const data = await api.get<RecipeSummary[]>('/recipes/');
      setRecipes(data);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Rezepte konnten nicht geladen werden');
    }
  }, []);

  useEffect(() => {
    loadRecipes().finally(() => setIsLoading(false));
  }, [loadRecipes]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadRecipes();
    setIsRefreshing(false);
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {error && <Text style={[styles.errorText, { color: '#DC2626' }]}>{error}</Text>}

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          !error ? (
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Noch keine Rezepte – leg dein erstes über den Button unten an.
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('RecipeDetail', { recipeId: item.id, title: item.title })}
            style={[styles.recipeRow, { backgroundColor: colors.card, borderRadius: radius.md }]}
          >
            {item.cover_image_url ? (
              <Image source={{ uri: item.cover_image_url }} style={[styles.thumbnail, { borderRadius: radius.sm }]} />
            ) : (
              <View style={[styles.thumbnailPlaceholder, { borderRadius: radius.sm, backgroundColor: colors.bg }]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={[styles.recipeTitle, { color: colors.text }]}>{item.title}</Text>
              {item.tags && item.tags.length > 0 && (
                <Text style={[styles.recipeTags, { color: colors.muted }]}>{item.tags.join(' · ')}</Text>
              )}
            </View>
          </Pressable>
        )}
      />

      <Pressable style={[styles.fab, { backgroundColor: gradient[0] }]} onPress={() => navigation.navigate('RecipeSourceMenu')}>
        <Text style={styles.fabIcon}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { fontSize: 19, fontWeight: '700', marginBottom: 16 },
  errorText: { fontSize: 12, marginBottom: 12 },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 40, lineHeight: 20 },
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginBottom: 9 },
  thumbnail: { width: 46, height: 46 },
  thumbnailPlaceholder: { width: 46, height: 46 },
  recipeTitle: { fontSize: 14, fontWeight: '700' },
  recipeTags: { fontSize: 11, marginTop: 3 },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabIcon: { color: '#fff', fontSize: 26, fontWeight: '300', marginTop: -2 },
});
