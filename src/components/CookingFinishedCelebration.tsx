import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  recipeTitle?: string;
  onDone: () => void;
}

/**
 * "Grosser Moment" (siehe Regel "Vollfigur nur bei grossen Momenten"):
 * Brutzel laeuft als echtes Video ins Bild, sobald alle parallel gekochten
 * Rezepte fertig sind. Guten-Appetit-Text erscheint erst NACH dem Video
 * (nicht gleichzeitig), damit der Moment nicht ueberladen wirkt.
 */
export default function CookingFinishedCelebration({ recipeTitle, onDone }: Props) {
  const { colors, gradient, radius } = useTheme();
  const [showText, setShowText] = useState(false);
  const textOpacity = React.useRef(new Animated.Value(0)).current;

  const player = useVideoPlayer(require('../../assets/brutzel-celebration.mp4'), (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    // Text erscheint kurz vor Video-Ende eingeblendet (Video ist 10s lang),
    // statt erst nach komplettem Abspielen zu warten - fuehlt sich
    // zuegiger an, ohne den Lauf-Moment selbst zu stoeren.
    const timer = setTimeout(() => {
      setShowText(true);
      Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }, 3500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.overlay, { backgroundColor: colors.bg }]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
        nativeControls={false}
      />

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
