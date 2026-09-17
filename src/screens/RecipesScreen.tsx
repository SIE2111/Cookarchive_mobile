import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  ScrollView,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';
import ScanFab from '../components/ScanFab';
import PublishToPoolButton from '../components/PublishToPoolButton';
import { api, ApiError } from '../api/client';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { MainTabParamList, MainStackParamList } from '../navigation/AppNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Rezepte'>,
  NativeStackScreenProps<MainStackParamList>
>;

interface RecipeSummary {
  id: string;
  title: string;
  tags: string[] | null;
  updated_at: string;
  created_at: string;
  cover_image_url: string | null;
  folder_id: string | null;
  source_type: string;
  is_favorite: boolean;
}

const SOURCE_ICONS: Record<string, keyof typeof MaterialCommunityIcons.glyphMap> = {
  manual: 'pencil-outline',
  web_import: 'web',
  ai_generated: 'robot-outline',
  photo_scan: 'camera-outline',
  starter_pack: 'star-outline',
  pool_fork: 'account-group-outline',
};

interface FolderSummary {
  id: string;
  name: string;
  parent_folder_id: string | null;
  icon: string | null;
  recipe_count: number;
}

export default function RecipesScreen({ navigation, route }: Props) {
  const { colors, gradient, radius } = useTheme();
  const [recipes, setRecipes] = useState<RecipeSummary[]>([]);
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [sortOption, setSortOption] = useState<'newest' | 'oldest' | 'az'>('newest');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [isSavingFolder, setIsSavingFolder] = useState(false);
  const [searchText, setSearchText] = useState('');

  // Optionaler Tag-Filter, den das Dashboard beim Antippen einer Kategorie
  // mitgibt (siehe DashboardScreen) - rein clientseitig gefiltert, da das
  // Backend aktuell keinen eigenen Tag-Filter-Parameter anbietet.
  const filterTag = route.params?.filterTag;

  // Kommt vom Dashboard mit favoritesOnly=true an (Lieblingsgerichte-Kachel) -
  // uebernimmt das als Startzustand, bleibt danach aber normal ueber den
  // Chip lokal umschaltbar.
  useEffect(() => {
    if (route.params?.favoritesOnly) {
      setFavoritesOnly(true);
    }
  }, [route.params?.favoritesOnly]);

  const loadAll = useCallback(async () => {
    try {
      const recipesUrl = searchText.trim()
        ? `/recipes/?q=${encodeURIComponent(searchText.trim())}`
        : '/recipes/';
      const [recipeData, folderData] = await Promise.all([
        api.get<RecipeSummary[]>(recipesUrl),
        api.get<FolderSummary[]>('/folders/'),
      ]);
      setRecipes(recipeData);
      setFolders(folderData);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Rezepte konnten nicht geladen werden');
    }
  }, [searchText]);

  const isFirstLoad = useRef(true);

  useEffect(() => {
    if (isFirstLoad.current) {
      isFirstLoad.current = false;
      loadAll().finally(() => setIsLoading(false));
      return;
    }
    // Nur Suchänderungen entprellen - der Erstaufruf oben laeuft sofort
    const timer = setTimeout(() => {
      loadAll();
    }, 350);
    return () => clearTimeout(timer);
  }, [loadAll]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => loadAll());
    return unsubscribe;
  }, [navigation, loadAll]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAll();
    setIsRefreshing(false);
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    setIsSavingFolder(true);
    try {
      await api.post('/folders/', { name });
      setNewFolderName('');
      setIsCreatingFolder(false);
      await loadAll();
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Ordner konnte nicht angelegt werden');
    } finally {
      setIsSavingFolder(false);
    }
  };

  let visibleRecipes = selectedFolderId ? recipes.filter((r) => r.folder_id === selectedFolderId) : recipes;
  if (filterTag) {
    visibleRecipes = visibleRecipes.filter((r) => r.tags?.includes(filterTag));
  }
  if (favoritesOnly) {
    visibleRecipes = visibleRecipes.filter((r) => r.is_favorite);
  }

  // Fuer die Kategorie-Auswahl direkt hier auf dem Screen - vorher konnte
  // man einen Kategorie-Filter nur ueber den Umweg der Dashboard-Kacheln
  // setzen, hier selbst aber keinen auswaehlen.
  const availableCategories = Array.from(new Set(recipes.flatMap((r) => r.tags ?? []))).sort((a, b) =>
    a.localeCompare(b, 'de'),
  );
  visibleRecipes = [...visibleRecipes].sort((a, b) => {
    if (sortOption === 'az') return a.title.localeCompare(b.title, 'de');
    const diff = +new Date(b.created_at) - +new Date(a.created_at);
    return sortOption === 'newest' ? diff : -diff;
  });

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.searchBar, { backgroundColor: colors.card, borderRadius: radius.md }]}>
        <MaterialCommunityIcons name="magnify" size={17} color={colors.muted} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Rezept oder Zutat suchen…"
          placeholderTextColor={colors.muted}
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
        />
        {searchText.length > 0 && (
          <Pressable onPress={() => setSearchText('')} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={16} color={colors.muted} />
          </Pressable>
        )}
      </View>

      {error && <Text style={[styles.errorText, { color: '#DC2626' }]}>{error}</Text>}

      {filterTag && (
        <Pressable
          onPress={() => navigation.setParams({ filterTag: undefined })}
          style={[styles.filterPill, { backgroundColor: gradient[0], borderRadius: radius.sm }]}
        >
          <Text style={styles.filterPillText}>{filterTag} ✕</Text>
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12, flexGrow: 0, flexShrink: 0 }}>
        <Pressable
          onPress={() => setFavoritesOnly((prev) => !prev)}
          style={[
            styles.favoritesChip,
            { backgroundColor: favoritesOnly ? gradient[0] : colors.card, borderRadius: radius.sm, marginBottom: 0 },
          ]}
        >
          <MaterialCommunityIcons name={favoritesOnly ? 'heart' : 'heart-outline'} size={14} color={favoritesOnly ? '#fff' : colors.text} />
          <Text style={{ color: favoritesOnly ? '#fff' : colors.text, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>
            Nur Favoriten
          </Text>
        </Pressable>

        <Pressable
          onPress={() =>
            setSortOption((prev) => (prev === 'newest' ? 'oldest' : prev === 'oldest' ? 'az' : 'newest'))
          }
          style={[styles.favoritesChip, { backgroundColor: colors.card, borderRadius: radius.sm, marginBottom: 0 }]}
        >
          <MaterialCommunityIcons
            name={sortOption === 'az' ? 'sort-alphabetical-variant' : sortOption === 'newest' ? 'sort-clock-descending-outline' : 'sort-clock-ascending-outline'}
            size={14}
            color={colors.text}
          />
          <Text style={{ color: colors.text, fontSize: 12, fontWeight: '600', marginLeft: 5 }}>
            {sortOption === 'az' ? 'A–Z' : sortOption === 'newest' ? 'Neueste zuerst' : 'Älteste zuerst'}
          </Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.folderBar} contentContainerStyle={{ gap: 8, alignItems: 'center' }}>
        <Pressable
          onPress={() => setSelectedFolderId(null)}
          style={[
            styles.folderChip,
            { backgroundColor: selectedFolderId === null ? gradient[0] : colors.card, borderRadius: radius.sm },
          ]}
        >
          <Text allowFontScaling={false} style={[styles.folderChipText, { color: selectedFolderId === null ? '#fff' : colors.text }]}>
            Alle ({recipes.length})
          </Text>
        </Pressable>
        {folders.map((folder) => {
          const isSelected = selectedFolderId === folder.id;
          return (
            <Pressable
              key={folder.id}
              onPress={() => setSelectedFolderId(isSelected ? null : folder.id)}
              onLongPress={() => {
                Alert.alert(
                  'Ordner löschen?',
                  `"${folder.name}" wird entfernt. Die ${folder.recipe_count} Rezepte darin bleiben erhalten, landen aber ohne Ordner.`,
                  [
                    { text: 'Abbrechen', style: 'cancel' },
                    {
                      text: 'Löschen',
                      style: 'destructive',
                      onPress: async () => {
                        try {
                          await api.delete(`/folders/${folder.id}`);
                          if (selectedFolderId === folder.id) setSelectedFolderId(null);
                          loadAll();
                        } catch (err) {
                          Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Ordner konnte nicht gelöscht werden');
                        }
                      },
                    },
                  ],
                );
              }}
              style={[styles.folderChip, { backgroundColor: isSelected ? gradient[0] : colors.card, borderRadius: radius.sm }]}
            >
              <Text allowFontScaling={false} style={[styles.folderChipText, { color: isSelected ? '#fff' : colors.text }]}>
                {folder.name} ({folder.recipe_count})
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          onPress={() => setIsCreatingFolder(true)}
          style={[styles.folderChip, styles.newFolderChip, { borderColor: colors.muted, borderRadius: radius.sm }]}
        >
          <MaterialCommunityIcons name="plus" size={15} color={colors.muted} />
        </Pressable>
      </ScrollView>

      {availableCategories.length > 0 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.categoryBar}
          contentContainerStyle={{ gap: 8, alignItems: 'center' }}
        >
          {availableCategories.map((cat) => {
            const isSelected = filterTag === cat;
            return (
              <Pressable
                key={cat}
                onPress={() => navigation.setParams({ filterTag: isSelected ? undefined : cat })}
                style={[styles.folderChip, { backgroundColor: isSelected ? gradient[0] : colors.card, borderRadius: radius.sm }]}
              >
                <Text allowFontScaling={false} style={[styles.folderChipText, { color: isSelected ? '#fff' : colors.text }]}>
                  {cat}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      <FlatList
        data={visibleRecipes}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={handleRefresh} />}
        // Nimmt den restlichen Platz auf, damit er nicht an die
        // Filterleisten darueber verteilt wird (siehe styles.folderBar).
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 100 }}
        ListEmptyComponent={
          !error ? (
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              {searchText.trim()
                ? `Keine Treffer für "${searchText.trim()}".`
                : favoritesOnly
                  ? 'Noch keine Favoriten markiert.'
                  : filterTag
                    ? `Keine Rezepte mit "${filterTag}" gefunden.`
                    : selectedFolderId
                      ? 'Dieser Ordner ist noch leer.'
                      : 'Noch keine Rezepte – leg dein erstes über den Button unten an.'}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('RecipeDetail', { recipeId: item.id, title: item.title })}
            style={[styles.recipeRow, { backgroundColor: colors.card, borderRadius: radius.md, borderWidth: 1, borderColor: colors.cardBorder }]}
          >
            {item.cover_image_url ? (
              <Image source={{ uri: item.cover_image_url }} style={[styles.thumbnail, { borderRadius: radius.sm }]} />
            ) : (
              <View style={[styles.thumbnailPlaceholder, { borderRadius: radius.sm, backgroundColor: colors.bg }]} />
            )}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                <Text style={[styles.recipeTitle, { color: colors.text }]} numberOfLines={1}>{item.title}</Text>
                <MaterialCommunityIcons
                  name={SOURCE_ICONS[item.source_type] ?? 'file-outline'}
                  size={12}
                  color={colors.muted}
                />
                {item.is_favorite && <MaterialCommunityIcons name="heart" size={12} color={gradient[0]} />}
              </View>
              {item.tags && item.tags.length > 0 && (
                <Text style={[styles.recipeTags, { color: colors.muted }]}>{item.tags.join(' · ')}</Text>
              )}
            </View>
            <PublishToPoolButton recipeId={item.id} recipeTitle={item.title} />
          </Pressable>
        )}
      />

      <ScanFab />

      <Modal visible={isCreatingFolder} transparent animationType="fade" onRequestClose={() => setIsCreatingFolder(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Neuer Ordner</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
              placeholder="z.B. Grillrezepte"
              placeholderTextColor={colors.muted}
              value={newFolderName}
              onChangeText={setNewFolderName}
              autoFocus
              onSubmitEditing={handleCreateFolder}
            />
            <View style={styles.modalButtonRow}>
              <Pressable onPress={() => { setIsCreatingFolder(false); setNewFolderName(''); }} style={styles.modalCancelButton}>
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={handleCreateFolder}
                disabled={isSavingFolder || !newFolderName.trim()}
                style={[styles.modalSaveButton, { backgroundColor: gradient[0], borderRadius: radius.sm, opacity: isSavingFolder ? 0.7 : 1 }]}
              >
                {isSavingFolder ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Anlegen</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 26 },
  searchBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, height: 42, marginBottom: 12, flexGrow: 0, flexShrink: 0 },
  searchInput: { flex: 1, fontSize: 13.5 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 12, marginBottom: 12 },
  filterPill: { alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, marginBottom: 12 },
  filterPillText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  // flexGrow/flexShrink 0 ist hier das Entscheidende, nicht die Hoehe:
  // Der Bildschirm ist eine Flex-Spalte (container: flex 1). Bleibt unten
  // Platz frei - also genau dann, wenn WENIGE Rezepte gefunden wurden -,
  // verteilt Flexbox diesen Rest auf alle Kinder, die wachsen duerfen.
  // Eine horizontale ScrollView darf das standardmaessig, und 'height'
  // wirkt dabei nur als Ausgangsgroesse, nicht als Obergrenze. Ergebnis
  // war die auseinandergezogene Filterleiste bei wenig Ergebnissen.
  // Jetzt bleiben die Leisten fest und die FlatList nimmt den Rest.
  folderBar: { height: 60, marginBottom: 14, flexGrow: 0, flexShrink: 0 },
  categoryBar: { height: 60, marginBottom: 14, flexGrow: 0, flexShrink: 0 },
  favoritesChip: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 7, marginBottom: 12 },
  folderChip: { height: 38, paddingHorizontal: 13, justifyContent: 'center', alignItems: 'center' },
  folderChipText: { fontSize: 12, fontWeight: '600', lineHeight: 16 },
  newFolderChip: { borderWidth: 1.3, paddingHorizontal: 10 },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 40, lineHeight: 20 },
  recipeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, marginBottom: 9 },
  thumbnail: { width: 46, height: 46 },
  thumbnailPlaceholder: { width: 46, height: 46 },
  recipeTitle: { fontSize: 14, fontWeight: '700', flexShrink: 1 },
  recipeTags: { fontSize: 11, marginTop: 3 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 30 },
  modalCard: { padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14 },
  modalInput: { height: 44, paddingHorizontal: 14, fontSize: 13.5, marginBottom: 16 },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, alignItems: 'center' },
  modalCancelButton: { paddingVertical: 8, paddingHorizontal: 4 },
  modalCancelText: { fontSize: 13, fontWeight: '600' },
  modalSaveButton: { paddingHorizontal: 18, paddingVertical: 10, minWidth: 80, alignItems: 'center' },
  modalSaveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
});
