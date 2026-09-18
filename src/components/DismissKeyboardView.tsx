import React from 'react';
import { Keyboard, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

/**
 * Schliesst die Tastatur, wenn irgendwo daneben getippt wird.
 *
 * Fuer Bildschirme OHNE ScrollView (Anmelden, Registrieren, Code
 * eingeben): Dort gibt es keinen Scroll-Container, der das von selbst
 * erledigt, und die Tastatur blieb stehen, bis man sie ueber die
 * Zurueck-Taste oder das Absenden losgeworden ist - auf einem kleinen
 * Bildschirm verdeckt sie dabei genau die Knoepfe, die man als Naechstes
 * braucht.
 *
 * In ScrollView-Bildschirmen wird stattdessen
 * keyboardShouldPersistTaps="handled" gesetzt; das erledigt dasselbe,
 * ohne eine zusaetzliche Ebene einzuziehen.
 *
 * accessible={false} ist wichtig: Sonst fasst VoiceOver den ganzen
 * Bildschirminhalt zu EINEM Element zusammen, und die einzelnen Felder
 * sind nicht mehr einzeln erreichbar.
 */
export default function DismissKeyboardView({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
}) {
  return (
    <Pressable accessible={false} onPress={Keyboard.dismiss} style={styles.fill}>
      <View style={style}>{children}</View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
