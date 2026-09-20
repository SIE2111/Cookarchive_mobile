import React from 'react';
import { View, Text, Image, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

interface Props {
  /**
   * Zusaetzliche Positionierung von aussen. Die Begruessung setzt die
   * Zeile absolut an den oberen Rand, der Abschlussbildschirm laesst sie
   * im Fluss stehen - der Inhalt ist derselbe.
   */
  style?: StyleProp<ViewStyle>;
}

/**
 * Logo, Name der App und Herkunft.
 *
 * Als eigene Komponente, weil dieselbe Zeile an zwei Stellen steht:
 * Begruessung beim Start und Abschluss nach dem Kochen. Verdoppelt man
 * sie, laufen die beiden beim naechsten Aendern auseinander - dann traegt
 * der eine Bildschirm das alte Logo und der andere das neue.
 */
export default function MarkenZeile({ style }: Props) {
  const { colors, gradient } = useTheme();

  return (
    <View style={[styles.reihe, style]}>
      <Image source={require('../../assets/icon.png')} style={styles.logo} resizeMode="contain" />
      <View style={styles.textBlock}>
        <Text style={[styles.titel, { color: colors.text }]} numberOfLines={1}>
          Mein Kochbuch
        </Text>
        {/* "AI" sitzt in einem eigenen Kaestchen statt als verschachtelter
            Text mit Hintergrundfarbe: Innenabstand wirkt bei verschachteltem
            Text auf iOS nicht zuverlaessig, das Kaestchen waere dort eng am
            Buchstaben geklebt. */}
        <View style={styles.anspruchReihe}>
          <Text style={[styles.anspruch, { color: colors.muted }]} numberOfLines={1}>
            powered by HomeArchive
          </Text>
          <View style={[styles.abzeichen, { backgroundColor: gradient[0] }]}>
            <Text style={styles.abzeichenText}>AI</Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  reihe: { flexDirection: 'row', alignItems: 'center' },
  logo: { width: 34, height: 34, borderRadius: 8, marginRight: 10 },
  // schrumpft statt ueberzulaufen, wenn der Platz eng wird
  textBlock: { flexShrink: 1 },
  titel: { fontSize: 17, fontWeight: '700' },
  anspruchReihe: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  anspruch: { fontSize: 11 },
  abzeichen: { marginLeft: 4, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3 },
  abzeichenText: { color: '#fff', fontSize: 10, fontWeight: '700' },
});
