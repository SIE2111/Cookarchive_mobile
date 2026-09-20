import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Image } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as Speech from 'expo-speech';
import { SPEECH_LANGUAGE, BRUTZEL_PITCH, BRUTZEL_RATE, brutzelStimme } from '../utils/speech';
import { useTheme } from '../theme/ThemeContext';
import MarkenZeile from './MarkenZeile';
import { useUebersetzung } from '../i18n';

interface Props {
  name: string;
  onDismiss: () => void;
  // Steht der Profil-Schalter "Begruessungs-Animation" auf aus, bleibt der
  // Bildschirm samt Standbild, Gruss und Knopf trotzdem stehen - nur Video
  // und Sprachausgabe entfallen. Vorher verschwand die ganze Begruessung.
  mitVideo?: boolean;
}


/**
 * Animierte Begruessung beim Start (Profil-Schalter "Begruessungs-
 * Animation") - nutzt dasselbe echte Brutzel-Video wie die Guten-Appetit-
 * Feier am Ende (siehe CookingFinishedCelebration.tsx), nicht mehr eine
 * reine Bounce-Animation mit dem statischen Bild. Liest den
 * Begruessungstext zusaetzlich vor - mit derselben Stimme und Tonlage wie
 * ueberall sonst, siehe brutzelStimme() in utils/speech.ts.
 */
export default function BrutzelGreetingOverlay({ name, onDismiss, mitVideo = true }: Props) {
  const { colors, gradient, radius } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useUebersetzung();
  const textOpacity = React.useRef(new Animated.Value(0)).current;

  const greetingText = `Hallo ${name}! Was möchtest du heute kochen?`;

  // Der Haken laeuft unbedingt - Hooks duerfen nicht bedingt aufgerufen
  // werden. Abgespielt und angezeigt wird nur bei eingeschalteter Animation.
  const player = useVideoPlayer(require('../../assets/brutzel-celebration.mp4'), (p) => {
    p.loop = false;
    if (mitVideo) p.play();
  });

  useEffect(() => {
    // Frueher lief hier ein Zeitgeber von 3,5 Sekunden, damit der Text erst
    // nach dem Video kam. Die Markenzeile oben steht aber sofort - der
    // Versatz liess den Bildschirm dazwischen halb leer wirken. Beide
    // Textbloecke erscheinen jetzt gemeinsam.
    Animated.timing(textOpacity, { toValue: 1, duration: 500, useNativeDriver: true }).start();

    if (!mitVideo) {
      return () => {
        Speech.stop();
      };
    }

    // Gleiche Stimme und gleiche Tonlage wie ueberall sonst: Vorher suchte
    // dieser Bildschirm selbst nach Namen und setzte pitch fest auf 0.8 -
    // Brutzel klang beim Start deutlich brummiger als im Koch-Modus, obwohl
    // es dieselbe Figur ist.
    brutzelStimme()
      .then((voice) => {
        Speech.speak(greetingText, {
          language: SPEECH_LANGUAGE,
          voice,
          pitch: BRUTZEL_PITCH,
          rate: BRUTZEL_RATE,
        });
      })
      .catch(() => {
        Speech.speak(greetingText, { language: SPEECH_LANGUAGE, pitch: BRUTZEL_PITCH, rate: BRUTZEL_RATE });
      });

    return () => {
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
      <MarkenZeile style={[styles.markenZeile, { top: insets.top + 12 }]} />

      {/* Standbild LIEGT HINTER dem Player, nicht als Ersatz daneben: Bleibt
          der Player stumm - was bei genau diesem Video schon am Ende des
          Kochvorgangs vorkam -, steht hier Brutzel statt einer Luecke.
          Spielt das Video, verdeckt es das Bild vollstaendig. */}
      <View style={styles.videoBox}>
        <Image source={require('../../assets/brutzel-full.png')} style={styles.videoFallback} resizeMode="contain" />
        {mitVideo && <VideoView player={player} style={styles.video} contentFit="cover" nativeControls={false} />}
      </View>

      <Animated.View style={{ opacity: textOpacity, alignItems: 'center' }}>
        <Text style={[styles.title, { color: colors.text }]}>{t('sonstiges.hallo', { name })}</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>{t('sonstiges.wasKochen')}</Text>
        <Pressable onPress={handleDismiss} style={[styles.doneButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
          <Text style={styles.doneButtonText}>{t('sonstiges.losGehts')}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24, zIndex: 50 },
  // schrumpft statt ueberzulaufen, wenn der Platz eng wird
  // 'cover' statt 'contain' bei beiden: Das Standbild ist hochformatig, das
  // Video breit - eingepasst blieben Raender frei und das Bild schaute unter
  // dem Video hervor. Randlos fuellend verdeckt das Video es vollstaendig.
  // overflow verhindert, dass der beschnittene Teil ueber die Ecken laeuft.
  videoBox: { width: '100%', height: 300, marginBottom: 20, borderRadius: 16, overflow: 'hidden' },
  videoFallback: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' },
  // Position kommt von hier, Inhalt aus MarkenZeile.
  markenZeile: { position: 'absolute', left: 24, right: 24 },
  video: { width: '100%', height: '100%' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 13, marginBottom: 22, textAlign: 'center' },
  doneButton: { paddingHorizontal: 40, paddingVertical: 13 },
  doneButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
