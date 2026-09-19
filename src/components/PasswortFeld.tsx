import React, { useState } from 'react';
import { View, TextInput, Pressable, StyleSheet, TextInputProps } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../theme/ThemeContext';

type Props = TextInputProps & {
  /** Zusätzliche Stile für das Eingabefeld selbst. */
  feldStil?: any;
};

/**
 * Passwortfeld mit Auge zum Sichtbarmachen.
 *
 * Ein verdecktes Passwort einzutippen ist auf einem Handy fehleranfällig
 * - besonders dort, wo es genau stimmen muss, weil es gerade erst
 * vergeben wird. Wer sich vertippt, merkt es sonst erst beim nächsten
 * Anmelden, weit weg von dieser Eingabe.
 *
 * Das Auge ist absichtlich kein Schalter, der den Zustand behält: Beim
 * Verlassen des Bildschirms ist wieder verdeckt, was verdeckt gehört.
 */
export default function PasswortFeld({ feldStil, style, ...rest }: Props) {
  const { colors, radius } = useTheme();
  const [sichtbar, setSichtbar] = useState(false);

  return (
    <View style={[styles.rahmen, { backgroundColor: colors.card, borderRadius: radius.md }, style]}>
      <TextInput
        {...rest}
        style={[styles.feld, { color: colors.text }, feldStil]}
        secureTextEntry={!sichtbar}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={colors.muted}
      />
      <Pressable
        onPress={() => setSichtbar((v) => !v)}
        hitSlop={10}
        style={styles.knopf}
        accessibilityLabel={sichtbar ? 'Passwort verbergen' : 'Passwort anzeigen'}
      >
        <MaterialCommunityIcons
          name={sichtbar ? 'eye-off-outline' : 'eye-outline'}
          size={21}
          color={colors.muted}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rahmen: { flexDirection: 'row', alignItems: 'center', minHeight: 48, paddingRight: 6 },
  feld: { flex: 1, minHeight: 48, paddingHorizontal: 14, fontSize: 15 },
  knopf: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
});
