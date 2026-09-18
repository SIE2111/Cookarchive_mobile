import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTheme } from '../theme/ThemeContext';
import BrutzelAvatar from './BrutzelAvatar';
import { api } from '../api/client';

interface Props {
  recipeTitle?: string;
  onDone: () => void;
}

/**
 * "Grosser Moment" (siehe Regel "Vollfigur nur bei grossen Momenten"):
 * Brutzel laeuft als echtes Video ins Bild, sobald alle parallel gekochten
 * Rezepte fertig sind. Guten-Appetit-Text erscheint erst NACH dem Video
 * (nicht gleichzeitig), damit der Moment nicht ueberladen wirkt.
 *
 * Drei Abstufungen, gesteuert ueber die Profil-Schalter:
 *   Brutzel aus            -> nur der Text, ohne Figur
 *   Brutzel an, Animation aus -> stehendes Brutzel-Bild, Text sofort
 *   beides an              -> das Video
 *
 * Die mittlere Stufe ist der eigentliche Zweck des Animations-Schalters:
 * Wer bewegte Bilder nicht mag (oder auf schwaecheren Geraeten kocht),
 * soll Brutzel trotzdem behalten duerfen.
 */
export default function CookingFinishedCelebration({ recipeTitle, onDone }: Props) {
  const { colors, gradient, radius } = useTheme();
  const [showText, setShowText] = useState(false);
  const [showBrutzel, setShowBrutzel] = useState(true);
  const [animated, setAnimated] = useState(true);
  // Erst entscheiden, dann zeigen: Ohne dieses Warten liefe das Video
  // kurz an, bevor die Einstellung da ist - genau das, was jemand mit
  // abgeschalteter Animation nicht sehen will.
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const textOpacity = React.useRef(new Animated.Value(0)).current;

  useEffect(() => {
    api
      .get<{ show_brutzel: boolean; show_greeting_animation: boolean }>('/preferences/')
      .then((prefs) => {
        setShowBrutzel(prefs.show_brutzel);
        setAnimated(prefs.show_greeting_animation);
      })
      .catch(() => {
        // Nicht erreichbar: bei den Standardwerten bleiben, der Abschluss
        // soll nicht an einer Einstellung scheitern.
      })
      .finally(() => setPrefsLoaded(true));
  }, []);

  const player = useVideoPlayer(require('../../assets/brutzel-celebration.mp4'), (p) => {
    p.loop = false;
  });

  useEffect(() => {
    if (!prefsLoaded) return;

    const playVideo = showBrutzel && animated;
    if (!playVideo) {
      // Ohne Video gibt es nichts abzuwarten - der Text kommt sofort.
      setShowText(true);
      textOpacity.setValue(1);
      return;
    }

    player.play();
    // Text erscheint kurz vor Video-Ende eingeblendet (Video ist 10s lang),
    // statt erst nach komplettem Abspielen zu warten - fuehlt sich
    // zuegiger an, ohne den Lauf-Moment selbst zu stoeren.
    const timer = setTimeout(() => {
      setShowText(true);
      Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }, 3500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsLoaded, showBrutzel, animated]);

  return (
    <View style={[styles.overlay, { backgroundColor: colors.bg }]}>
      {showBrutzel && animated && (
        <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />
      )}
      {showBrutzel && !animated && (
        <View style={{ marginBottom: 20 }}>
          <BrutzelAvatar size={150} variant="full" />
        </View>
      )}

      {showText && (
        <Animated.View style={{ opacity: textOpacity, alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.text }]}>Guten Appetit! 🍽️</Text>
          {recipeTitle && (
            <Text style={[styles.subtitle, { color: colors.muted }]}>{recipeTitle} ist fertig.</Text>
          )}
          <Pressable onPress={onDone} style={[styles.doneButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
            <Text style={styles.doneButtonText}>Fertig</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  video: { width: '100%', height: 260, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 13, marginBottom: 22, textAlign: 'center' },
  doneButton: { paddingHorizontal: 40, paddingVertical: 13 },
  doneButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
