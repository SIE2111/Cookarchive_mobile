import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { api } from '../api/client';
import SingleRecipeCookView from '../components/SingleRecipeCookView';
import CookingFinishedCelebration from '../components/CookingFinishedCelebration';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<MainStackParamList, 'CookMode'>;

const MAX_PARALLEL_RECIPES = 3;

export default function CookModeScreen({ route, navigation }: Props) {
  const { colors, gradient } = useTheme();
  const recipeIds = route.params.recipeIds.slice(0, MAX_PARALLEL_RECIPES);

  const [activeIndex, setActiveIndex] = useState(0);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [showCelebration, setShowCelebration] = useState(false);

  // "Nur fuer diesen Kochvorgang" uebernommene Verbesserungsvorschlaege
  // (siehe RecipeDetailScreen) - werden NICHT im Rezept gespeichert, nur
  // hier einmalig beim Betreten des Koch-Modus angezeigt.
  useEffect(() => {
    if (route.params.sessionNote) {
      Alert.alert('Für diesen Kochvorgang', route.params.sessionNote);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFinished = (completed: boolean) => {
    if (!completed) {
      // Am ersten Schritt "Zurueck" gedrueckt = Kochvorgang abgebrochen/
      // verlassen, nicht tatsaechlich fertig gekocht - einfach verlassen,
      // OHNE als zubereitet zu markieren und OHNE die Guten-Appetit-Feier
      // (war zuvor ein Bug: beides loeste dieselbe Feier aus).
      navigation.goBack();
      return;
    }
    if (recipeIds.length === 1) {
      // Nur das HAUPTGERICHT (recipeIds[0]) zaehlt als "zubereitet" fuers
      // Dashboard - mitgekochte Beilagen bleiben davon bewusst ausgenommen.
      api.post(`/recipes/${recipeIds[0]}/mark-cooked`).catch(() => {
        // Nicht kritisch fuers eigentliche Kochen - Fehler hier soll die
        // Feier/den Abschluss nicht blockieren
      });
      setShowCelebration(true);
      return;
    }
    if (activeIndex < recipeIds.length - 1) {
      setActiveIndex((i) => i + 1);
    } else {
      api.post(`/recipes/${recipeIds[0]}/mark-cooked`).catch(() => {});
      setShowCelebration(true);
    }
  };

  if (showCelebration) {
    // Bei mehreren parallel gekochten Rezepten alle Titel zusammenfassen,
    // statt willkuerlich nur eines zu nennen.
    const finishedTitles = recipeIds.map((id) => titles[id]).filter(Boolean).join(', ');
    return <CookingFinishedCelebration recipeTitle={finishedTitles || undefined} onDone={() => navigation.goBack()} />;
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {recipeIds.length > 1 && (
        <View style={styles.tabRow}>
          {recipeIds.map((id, index) => (
            <Pressable
              key={id}
              onPress={() => setActiveIndex(index)}
              style={[
                styles.tab,
                { borderBottomColor: index === activeIndex ? gradient[0] : 'transparent' },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.tabText,
                  { color: index === activeIndex ? gradient[0] : colors.muted, fontWeight: index === activeIndex ? '700' : '500' },
                ]}
              >
                {titles[id] ?? '…'}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {recipeIds.map((id, index) => (
        <SingleRecipeCookView
          key={id}
          recipeId={id}
          isActive={index === activeIndex}
          onTitleLoaded={(title) => setTitles((prev) => ({ ...prev, [id]: title }))}
          onFinished={handleFinished}
          sessionOverrides={index === 0 ? route.params.sessionOverrides : undefined}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderBottomWidth: 2 },
  tabText: { fontSize: 12.5 },
});
