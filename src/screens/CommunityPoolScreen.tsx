import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, Alert, RefreshControl, Image } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';
import ScanFab from '../components/ScanFab';
import { askWhatNext } from '../utils/afterRecipeSaved';
import type { MainStackParamList } from '../navigation/AppNavigator';
import { useLayout } from '../utils/layout';

interface PublicRecipeSummary {
  id: string;
  title: string;
  servings: number | null;
  prep_time_minutes: number | null;
  fork_count: number;
  download_count: number;
  avg_rating: number | null;
  cover_image_url: string | null;
  // Vom Aufrufer selbst veroeffentlicht bzw. schon uebernommen. Der
  // Uebernehmen-Knopf entfaellt dann - eine Kopie waere ein Duplikat.
  is_own?: boolean;
  already_forked?: boolean;
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
  const { istTablet, inhaltsBreiteZweispaltig } = useLayout();
  const { t } = useUebersetzung();
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
        setError(t('sonstiges.poolBrauchtSync'));
      } else {
        setError(err instanceof ApiError ? err.detail : t('sonstiges.poolNichtGeladen'));
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
      // Gleicher Abschluss wie bei KI, Foto und Web-Import: ansehen,
      // gleich kochen oder fertig - siehe utils/afterRecipeSaved.
      askWhatNext(navigation, { id: result.local_recipe_id, title: recipe.title });
    } catch (err) {
      Alert.alert(t('sonstiges.uebernehmenFehlgeschlagen'), err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'));
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
        contentContainerStyle={[{ padding: 18, paddingBottom: 100 }, inhaltsBreiteZweispaltig]}
        data={recipes}
        keyExtractor={(item) => item.id}
        // key MUSS sich mit der Spaltenzahl aendern, sonst wirft React
        // Native beim Drehen des Tablets einen Fehler.
        key={`spalten-${istTablet ? 2 : 1}`}
        numColumns={istTablet ? 2 : 1}
        columnWrapperStyle={istTablet ? { gap: 9 } : undefined}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        ListHeaderComponent={
          <>
            <Text style={[styles.header, { color: colors.text }]}>{t('sonstiges.gemeinschaftskochbuch')}</Text>
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
          // Antippen oeffnet die Vollansicht. Vorher konnte man ein fremdes
          // Rezept nur blind uebernehmen - was drin ist, sah man erst
          // danach in der eigenen Sammlung.
          <Pressable
            onPress={() => navigation.navigate('PoolRecipeDetail', { publicRecipeId: item.id, title: item.title })}
            style={[styles.card, istTablet && styles.karteInSpalte, { backgroundColor: colors.card, borderRadius: radius.md }]}
          >
            {item.cover_image_url ? (
              <Image source={{ uri: item.cover_image_url }} style={[styles.thumb, { borderRadius: radius.sm }]} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty, { borderRadius: radius.sm }]}>
                <MaterialCommunityIcons name="silverware-fork-knife" size={18} color={colors.muted} />
              </View>
            )}
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
            {item.is_own || item.already_forked ? (
              // Statt des Knopfes ein Hinweis: Eine leere Stelle wuerde wie
              // ein Fehler wirken, und der Nutzer soll sehen, WARUM hier
              // nichts zu tun ist.
              <View style={styles.forkButton}>
                <Text style={[styles.besitzText, { color: colors.muted }]}>
                  {item.is_own ? t('sonstiges.vonDir') : t('sonstiges.bereitsUebernommen')}
                </Text>
              </View>
            ) : (
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
            )}
          </Pressable>
        )}
      />
      <ScanFab />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 54, height: 54, marginRight: 12 },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(128,128,128,0.15)' },
  header: { fontSize: 19, fontWeight: '700', marginBottom: 4 },
  headerSub: { fontSize: 11.5, lineHeight: 17, marginBottom: 16 },
  card: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 9 },
  karteInSpalte: { flex: 1 },
  title: { fontSize: 14, fontWeight: '700' },
  meta: { fontSize: 10.5, marginTop: 3 },
  forkButton: { paddingHorizontal: 14, paddingVertical: 9 },
  forkButtonText: { color: '#fff', fontWeight: '700', fontSize: 11.5 },
  besitzText: { fontSize: 11, fontWeight: '600' },
});
