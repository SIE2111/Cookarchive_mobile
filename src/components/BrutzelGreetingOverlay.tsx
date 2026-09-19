import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Speech from 'expo-speech';
import { SPEECH_LANGUAGE } from '../utils/speech';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';

interface Props {
  name: string;
  onDismiss: () => void;
}

// Bekannte deutsche MAENNLICHE System-Stimmennamen (Apple/Android) - eine
// wirklich eigene, individuelle KI-Stimme fuer Brutzel ist mit den vom
// Betriebssystem mitgelieferten Text-zu-Sprache-Stimmen nicht moeglich,
// nur eine Auswahl UNTER diesen. expo-speech liefert kein Geschlechts-Feld
// mit, deshalb ueber bekannte Namen gefiltert statt eines Attributs -
// deckt aeltere UND neuere iOS-Stimmenpakete ab, da sich Apples Namen
// zwischen iOS-Versionen unterscheiden koennen.
const GERMAN_MALE_VOICE_HINTS = [
  'markus', 'martin', 'yannick', 'conrad', 'de-de-wavenet-b', 'de-de-wavenet-d',
  'male', 'mann', 'herr',
];

/**
 * Animierte Begruessung beim Start (Profil-Schalter "Begruessungs-
 * Animation") - nutzt dasselbe echte Brutzel-Video wie die Guten-Appetit-
 * Feier am Ende (siehe CookingFinishedCelebration.tsx), nicht mehr eine
 * reine Bounce-Animation mit dem statischen Bild. Liest den
 * Begruessungstext zusaetzlich vor, bevorzugt mit einer deutschen
 * maennlichen Systemstimme UND merklich abgesenkter Tonhoehe (pitch) -
 * letzteres sorgt auch dann fuer einen hoerbar maennlicheren Klang, wenn
 * keine passend benannte maennliche Stimme gefunden wird (die reine
 * Namenssuche ist nicht zuverlaessig, da sich Apples Stimmennamen
 * zwischen iOS-Versionen unterscheiden koennen).
 */
export default function BrutzelGreetingOverlay({ name, onDismiss }: Props) {
  const { colors, gradient, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useUebersetzung();
  const [showText, setShowText] = useState(false);
  const textOpacity = React.useRef(new Animated.Value(0)).current;

  const greetingText = `Hallo ${name}! Was möchtest du heute kochen?`;

  const player = useVideoPlayer(require('../../assets/brutzel-celebration.mp4'), (p) => {
    p.loop = false;
    p.play();
  });

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowText(true);
      Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();
    }, 3500);

    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        const germanVoices = voices.filter((v) => v.language?.toLowerCase().startsWith('de'));
        const germanMale = germanVoices.find((v) =>
          GERMAN_MALE_VOICE_HINTS.some((hint) => v.identifier.toLowerCase().includes(hint) || v.name.toLowerCase().includes(hint)),
        );
        Speech.speak(greetingText, {
          language: SPEECH_LANGUAGE,
          voice: (germanMale ?? germanVoices[0])?.identifier,
          pitch: 0.8,
          rate: 0.98,
        });
      })
      .catch(() => {
        Speech.speak(greetingText, { language: SPEECH_LANGUAGE, pitch: 0.8 });
      });

    return () => {
      clearTimeout(timer);
      Speech.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDismiss = () => {
    Speech.stop();
    onDismiss();
  };

  return (
    <View style={[styles.overlay, { backgroundColor: colors.bg }]}>
      {/* Markenzeile ganz oben: Die Begruessung ist der erste Bildschirm nach
          dem Start und damit die einzige Stelle, an der Herkunft und Name der
          App ohne Umweg sichtbar sind. Absolut positioniert, damit sie die
          mittige Ausrichtung von Video und Text nicht verschiebt. */}
      <View style={[styles.brandRow, { top: insets.top + 12 }]}>
        <Image source={require('../../assets/icon.png')} style={styles.brandLogo} resizeMode="contain" />
        <View style={styles.brandTextBlock}>
          <Text style={[styles.brandTitle, { color: colors.text }]} numberOfLines={1}>
            Mein Kochbuch
          </Text>
          <Text style={[styles.brandClaim, { color: colors.muted }]} numberOfLines={1}>
            powered by HomeArchive AI
          </Text>
        </View>
      </View>

      <VideoView player={player} style={styles.video} contentFit="contain" nativeControls={false} />

      {showText && (
        <Animated.View style={{ opacity: textOpacity, alignItems: 'center' }}>
          <Text style={[styles.title, { color: colors.text }]}>{t('sonstiges.hallo', { name })}</Text>
          <Text style={[styles.subtitle, { color: colors.muted }]}>{t('sonstiges.wasKochen')}</Text>
          <Pressable onPress={handleDismiss} style={[styles.doneButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
            <Text style={styles.doneButtonText}>{t('sonstiges.losGehts')}</Text>
          </Pressable>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 },
  brandRow: { position: 'absolute', left: 24, right: 24, flexDirection: 'row', alignItems: 'center' },
  brandLogo: { width: 34, height: 34, borderRadius: 8, marginRight: 10 },
  // schrumpft statt ueberzulaufen, wenn der Platz eng wird
  brandTextBlock: { flexShrink: 1 },
  brandTitle: { fontSize: 17, fontWeight: '700' },
  brandClaim: { fontSize: 11, marginTop: 1 },
  video: { width: '100%', height: 260, marginBottom: 20 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 13, marginBottom: 22, textAlign: 'center' },
  doneButton: { paddingHorizontal: 40, paddingVertical: 13 },
  doneButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
