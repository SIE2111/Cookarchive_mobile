import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'CommunityPool'>;

interface PublicRecipeSummary {
  id: string;
  title: string;
  servings: number | null;
  prep_time_minutes: number | null;
  fork_count: number;
  download_count: number;
  avg_rating: number | null;
}

export default function CommunityPoolScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const [recipes, setRecipes] = useState<PublicRecipeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forkingId, setForkingId] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<PublicRecipeSummary[]>('/pool/')
      .then(setRecipes)
      .catch((err) => {
        if (err instanceof ApiError && err.status === 403) {
          setError('Community-Pool erfordert aktivierten Server-Sync. Im Profil unter "Speicher" aktivierbar.');
        } else {
          setError(err instanceof ApiError ? err.detail : 'Pool konnte nicht geladen werden');
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  const handleFork = async (recipe: PublicRecipeSummary) => {
    setForkingId(recipe.id);
    try {
      const result = await api.post<{ status: string; local_recipe_id: string }>(`/pool/${recipe.id}/fork`);
      Alert.alert('Übernommen', `"${recipe.title}" ist jetzt in deiner Sammlung.`, [
        { text: 'Ansehen', onPress: () => navigation.navigate('RecipeDetail', { recipeId: result.local_recipe_id, title: recipe.title }) },
        { text: 'OK', style: 'cancel' },
      ]);
    } catch (err) {
      Alert.alert('Übernehmen fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setForkingId(null);
    }
  };

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg, padding: 24 }]}>
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>{error}</Text>
      </View>
    );
  }

  return (
    <FlatList
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 18 }}
      data={recipes}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', marginTop: 40 }}>
          Noch keine Rezepte im Community-Pool.
        </Text>
      }
      renderItem={({ item }) => (
        <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
            <Text style={[styles.meta, { color: colors.muted }]}>
              {item.download_count} Downloads
              {item.avg_rating ? ` · ★ ${item.avg_rating}` : ''}
            </Text>
          </View>
          <Pressable
            onPress={() => handleFork(item)}
            disabled={forkingId === item.id}
            style={[styles.forkButton, { backgroundColor: gradient[0], borderRadius: radius.sm }]}
          >
            {forkingId === item.id ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.forkButtonText}>Übernehmen</Text>
            )}
          </Pressable>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 9 },
  title: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 10.5, marginTop: 3 },
  forkButton: { paddingHorizontal: 14, paddingVertical: 9 },
  forkButtonText: { color: '#fff', fontWeight: '700', fontSize: 11.5 },
});
