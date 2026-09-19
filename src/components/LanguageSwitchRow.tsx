import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { SPRACHEN, spracheSetzen, useUebersetzung } from '../i18n';

/**
 * Sprachumschaltung fuer die Screens vor der Anmeldung.
 *
 * Ohne sie kaeme man an die Einstellung erst NACH dem Anmelden - das
 * Profil liegt hinter dem Login. Wer ein deutsch eingestelltes Geraet
 * hat, aber Englisch braucht, muesste sich also erst auf Deutsch
 * durchregistrieren.
 *
 * Bewusst eine schlichte Zeile statt eines Auswahlfeldes: Es geht um
 * zwei bis fuenf Eintraege, und die Anmeldung soll nicht aussehen wie
 * ein Einstellungsbildschirm.
 */
export default function LanguageSwitchRow() {
  const { colors, gradient } = useTheme();
  const { sprache } = useUebersetzung();

  return (
    <View style={styles.row}>
      {SPRACHEN.map((s, i) => (
        <React.Fragment key={s.code}>
          {i > 0 && <Text style={[styles.trenner, { color: colors.muted }]}>·</Text>}
          <Pressable onPress={() => spracheSetzen(s.code)} hitSlop={8} style={styles.knopf}>
            <Text
              style={[
                styles.text,
                {
                  color: sprache === s.code ? gradient[0] : colors.muted,
                  fontWeight: sprache === s.code ? '700' : '500',
                },
              ]}
            >
              {s.eigenname}
            </Text>
          </Pressable>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  knopf: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  trenner: { fontSize: 13 },
  text: { fontSize: 13 },
});
