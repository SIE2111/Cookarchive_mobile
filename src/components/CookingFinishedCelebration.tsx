import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, Share, Linking, Platform, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useTheme } from '../theme/ThemeContext';
import BrutzelAvatar from './BrutzelAvatar';
import { api } from '../api/client';
import { IOS_REVIEW_URL, ANDROID_REVIEW_URL, SHARE_MESSAGE } from '../config/appLinks';

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
// Wie oft gekocht sein muss, bevor die Bitte ueberhaupt erscheint, und in
// welchem Abstand danach. Nach dem ersten Kochen zu fragen waere
// aufdringlich und bringt schlechte Bewertungen - wer noch nichts erlebt
// hat, hat auch nichts zu loben. Danach hoechstens jedes 5. Mal.
const PROMO_FIRST_AFTER = 3;
const PROMO_EVERY = 5;
const COOK_COUNT_KEY = 'cook_finished_count';

export default function CookingFinishedCelebration({ recipeTitle, onDone }: Props) {
  const { colors, gradient, radius } = useTheme();
  const [showText, setShowText] = useState(false);
  const [showBrutzel, setShowBrutzel] = useState(true);
  const [animated, setAnimated] = useState(true);
  // Erst entscheiden, dann zeigen: Ohne dieses Warten liefe das Video
  // kurz an, bevor die Einstellung da ist - genau das, was jemand mit
  // abgeschalteter Animation nicht sehen will.
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [showPromo, setShowPromo] = useState(false);
  const textOpacity = React.useRef(new Animated.Value(0)).current;

  const reviewUrl = Platform.OS === 'ios' ? IOS_REVIEW_URL : ANDROID_REVIEW_URL;

  // Zaehlt die abgeschlossenen Kochvorgaenge lokal mit und entscheidet
  // daraus, ob diesmal gefragt wird. Bewusst lokal und nicht am Server:
  // Es ist eine Anzeige-Entscheidung, kein Nutzerdatum, das irgendwo
  // gespeichert gehoert.
  useEffect(() => {
    AsyncStorage.getItem(COOK_COUNT_KEY)
      .then((raw) => {
        const count = (parseInt(raw ?? '0', 10) || 0) + 1;
        AsyncStorage.setItem(COOK_COUNT_KEY, String(count)).catch(() => {});
        setShowPromo(count >= PROMO_FIRST_AFTER && (count - PROMO_FIRST_AFTER) % PROMO_EVERY === 0);
      })
      .catch(() => {});
  }, []);

  const handleShare = () => {
    Share.share({ message: SHARE_MESSAGE }).catch(() => {});
  };

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
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.overlay}
    >
      {/* Steht als erstes im Bildschirm - der Blick landet nach dem
          Kochen zuerst oben. Nur gelegentlich (siehe PROMO_EVERY) und
          erst, wenn jemand die App wirklich benutzt hat. */}
      {showPromo && (
        <View style={[styles.promoCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <Text style={[styles.promoTitle, { color: colors.text }]}>Schmeckt's mit Mein Kochbuch?</Text>
          <Text style={[styles.promoText, { color: colors.muted }]}>
            Dann erzähl es weiter – das hilft der App mehr als alles andere.
          </Text>
          <View style={styles.promoRow}>
            <Pressable onPress={handleShare} style={[styles.promoButton, { borderColor: gradient[0], borderRadius: radius.sm }]}>
              <MaterialCommunityIcons name="share-variant-outline" size={15} color={gradient[0]} />
              <Text style={[styles.promoButtonText, { color: gradient[0] }]}>Weiterempfehlen</Text>
            </Pressable>
            {/* Nur wenn ein Store-Link hinterlegt ist - siehe config/appLinks.ts.
                Ein Knopf, der auf eine Fehlerseite fuehrt, ist schlimmer
                als gar keiner. */}
            {reviewUrl && (
              <Pressable
                onPress={() => Linking.openURL(reviewUrl).catch(() => {})}
                style={[styles.promoButton, { borderColor: gradient[0], borderRadius: radius.sm }]}
              >
                <MaterialCommunityIcons name="star-outline" size={15} color={gradient[0]} />
                <Text style={[styles.promoButtonText, { color: gradient[0] }]}>Bewerten</Text>
              </Pressable>
            )}
          </View>
        </View>
      )}

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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Scrollbar und OBEN ausgerichtet, nicht vertikal zentriert.
  //
  // Vorher war es ein zentrierter Stapel fester Hoehe. Kam die
  // Empfehlungs-Karte zum Video (260 Punkte), Titel, Untertitel und Knopf
  // dazu, wurde der Inhalt hoeher als der Bildschirm - und was oben
  // hinausragte, war schlicht weg. Genau deshalb fehlte die Karte,
  // sobald die Animation lief.
  //
  // Oben ausgerichtet steht sie ausserdem bei jedem Rezept an derselben
  // Stelle, statt je nach Inhaltshoehe in der Mitte herumzuschwimmen.
  overlay: { flexGrow: 1, alignItems: 'center', justifyContent: 'flex-start', padding: 24, paddingTop: 32 },
  video: { width: '100%', height: 260, marginBottom: 20 },
  promoCard: { width: '100%', padding: 14, marginBottom: 24 },
  promoTitle: { fontSize: 14, fontWeight: '700' },
  promoText: { fontSize: 12, lineHeight: 17, marginTop: 3 },
  promoRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  promoButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.2, paddingHorizontal: 12, paddingVertical: 7 },
  promoButtonText: { fontSize: 12.5, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subtitle: { fontSize: 13, marginBottom: 22, textAlign: 'center' },
  doneButton: { paddingHorizontal: 40, paddingVertical: 13 },
  doneButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
