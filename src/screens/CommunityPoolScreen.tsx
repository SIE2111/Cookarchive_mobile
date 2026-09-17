import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, RefreshControl } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import ScanFab from '../components/ScanFab';
import type { MainStackParamList } from '../navigation/AppNavigator';

interface PublicRecipeSummary {
  id: string;
  title: string;
  servings: number | null;
  prep_time_minutes: number | null;
  fork_count: number;
  download_count: number;
  avg_rating: number | null;
}

/**
 * Der Community-Pool ist seit dem Tabwechsel ein eigener Bereich in der
 * unteren Leiste (vorher nur ueber das Erfassen-Menue erreichbar). Er wird
 * sowohl als Tab als auch als Stack-Screen verwendet - deshalb holt er
 * sich die Navigation ueber useNavigation statt ueber Props: So
 * funktioniert 'RecipeDetail' in beiden Faellen, weil der Aufruf an den
 * uebergeordneten Stack weitergereicht wird.
 */
export default function CommunityPoolScreen() {
  const { colors, gradient, radius } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [recipes, setRecipes] = useState<PublicRecipeSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [forkingId, setForkingId] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      setRecipes(await api.get<PublicRecipeSummary[]>('/pool/'));
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError('Der Community-Pool braucht aktivierten Server-Sync. Du findest den Schalter im Profil unter „Darstellung & Bedienung".');
      } else {
        setError(err instanceof ApiError ? err.detail : 'Pool konnte nicht geladen werden');
      }
    }
  }, []);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  // Neu laden, wenn man zurueckkommt - z.B. nachdem gerade ein eigenes
  // Rezept veroeffentlicht wurde; es soll dann hier auftauchen.
  useFocusEffect(
    React.useCallback(() => {
      load();
    }, [load]),
  );

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await load();
    setIsRefreshing(false);
  };

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
        <MaterialCommunityIcons name="account-group-outline" size={40} color={colors.muted} />
        <Text style={{ color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 20, marginTop: 12 }}>{error}</Text>
        <ScanFab />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <FlatList
        contentContainerStyle={{ padding: 18, paddingBottom: 100 }}
        data={recipes}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          <>
            <Text style={[styles.header, { color: colors.text }]}>Gemeinschaftskochbuch</Text>
            <Text style={[styles.headerSub, { color: colors.muted }]}>
              Rezepte, die andere geteilt haben. Übernommene Rezepte landen als eigene Kopie in deiner
              Sammlung – Änderungen daran bleiben bei dir.
            </Text>
          </>
        }
        ListEmptyComponent={
          <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 20, marginTop: 24 }}>
            Hier ist noch nichts. Du kannst den Anfang machen: Bei jedem eigenen Rezept sitzt ein kleines
            Gruppen-Symbol, mit dem du es für alle sichtbar machst.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.card, { backgroundColor: colors.card, borderRadius: radius.md }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.text }]}>{item.title}</Text>
              <Text style={[styles.meta, { color: colors.muted }]}>
                {[
                  item.prep_time_minutes ? `${item.prep_time_minutes} Min.` : null,
                  item.servings ? `${item.servings} Port.` : null,
                  `${item.download_count}× übernommen`,
                  item.avg_rating ? `★ ${item.avg_rating}` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
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
      <ScanFab />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { fontSize: 19, fontWeight: '700', marginBottom: 4 },
  headerSub: { fontSize: 11.5, lineHeight: 17, marginBottom: 16 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 9 },
  title: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 10.5, marginTop: 3 },
  forkButton: { paddingHorizontal: 14, paddingVertical: 9 },
  forkButtonText: { color: '#fff', fontWeight: '700', fontSize: 11.5 },
});
