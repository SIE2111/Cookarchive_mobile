import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Easing } from 'react-native';
import * as Speech from 'expo-speech';
import BrutzelAvatar from './BrutzelAvatar';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  name: string;
  onDismiss: () => void;
}

// Bekannte deutsche MAENNLICHE System-Stimmennamen (Apple/Android) - eine
// wirklich eigene, individuelle KI-Stimme fuer Brutzel ist mit den vom
// Betriebssystem mitgelieferten Text-zu-Sprache-Stimmen nicht moeglich,
// nur eine Auswahl UNTER diesen. expo-speech liefert kein Geschlechts-Feld
// mit, deshalb ueber bekannte Namen gefiltert statt eines Attributs.
const GERMAN_MALE_VOICE_HINTS = ['markus', 'martin', 'yannick', 'conrad', 'de-de-wavenet-b', 'de-de-wavenet-d'];

/**
 * Animierte Begruessung beim Start (Profil-Schalter "Begruessungs-
 * Animation") - Brutzel kommt von unten hereingehuepft, eine Sprechblase
 * fragt, was heute gekocht werden soll, UND liest den Text vor (zweiter
 * Profil-Schalter "Begruessungs-Animation" deckt beides ab). Kein echtes
 * Video (dafuer gibt es in diesem Rahmen keine Moeglichkeit, Videomaterial
 * zu erzeugen), sondern eine reine RN-Animated-Sequenz - Bounce-Einflug +
 * sanftes Aus-/Einblenden der Sprechblase, ohne zusaetzliche Abhaengigkeit.
 * Verschwindet automatisch nach ein paar Sekunden oder bei Antippen.
 */
export default function BrutzelGreetingOverlay({ name, onDismiss }: Props) {
  const { colors, gradient, radius } = useTheme();
  const translateY = useRef(new Animated.Value(120)).current;
  const avatarOpacity = useRef(new Animated.Value(0)).current;
  const bubbleOpacity = useRef(new Animated.Value(0)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;

  const greetingText = `Hallo ${name}! Was möchtest du heute kochen?`;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(overlayOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, friction: 5, tension: 60, useNativeDriver: true }),
        Animated.timing(avatarOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      ]),
      Animated.timing(bubbleOpacity, { toValue: 1, duration: 250, delay: 150, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();

    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const germanVoices = voices.filter((v) => v.language?.toLowerCase().startsWith('de'));
        const germanMale = germanVoices.find((v) =>
          GERMAN_MALE_VOICE_HINTS.some((hint) => v.identifier.toLowerCase().includes(hint) || v.name.toLowerCase().includes(hint)),
        );
        Speech.speak(greetingText, {
          language: 'de-DE',
          voice: (germanMale ?? germanVoices[0])?.identifier,
          pitch: 1.05,
          rate: 0.98,
        });
      })
      .catch(() => {
        Speech.speak(greetingText, { language: 'de-DE', pitch: 1.05 });
      });

    const timer = setTimeout(() => handleDismiss(), 4200);
    return () => {
      clearTimeout(timer);
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = () => {
    Speech.stop();
    Animated.timing(overlayOpacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => onDismiss());
  };

  return (
    <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
      <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss} />
      <View style={styles.content} pointerEvents="box-none">
        <Animated.View
          style={[
            styles.bubble,
            { backgroundColor: colors.card, borderRadius: radius.lg, opacity: bubbleOpacity, borderColor: gradient[0] },
          ]}
        >
          <Text style={[styles.bubbleText, { color: colors.text }]}>
            Hallo {name}! 👋{'\n'}Was möchtest du heute kochen?
          </Text>
        </Animated.View>
        <Animated.View style={{ opacity: avatarOpacity, transform: [{ translateY }] }}>
          <BrutzelAvatar size={130} variant="full" />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'flex-end',
    zIndex: 50,
  },
  content: { alignItems: 'center', marginBottom: 60 },
  bubble: { paddingHorizontal: 20, paddingVertical: 14, marginBottom: 14, borderWidth: 1.5, maxWidth: 280 },
  bubbleText: { fontSize: 14.5, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
});
