import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Speech from 'expo-speech';
import { useTheme } from '../theme/ThemeContext';
import {
  getGermanVoices,
  loadBrutzelVoice,
  saveBrutzelVoice,
  SPEECH_LANGUAGE,
  BRUTZEL_PITCH,
  BRUTZEL_RATE,
  VOICE_SAMPLE,
  BRUTZEL_STANDARD_NAMEN,
  type GermanVoice,
} from '../utils/speech';

// Nur noch zwei Alternativen zu Brutzels eigener Stimme (22.09.2026),
// statt jeder deutschen Stimme des Geraets - eine lange Liste war vor
// allem verwirrend. Welche zwei das sind, entscheidet weiterhin das
// Geraet (beste Qualitaet zuerst, siehe getGermanVoices), nur die
// ANZAHL ist jetzt begrenzt. Ausgeschlossen werden Stimmen, die schon
// Brutzels eigene sein koennten (BRUTZEL_STANDARD_NAMEN) - sonst stuende
// eine von beiden zweimal in der Liste.
const ANZAHL_ALTERNATIVEN = 2;

/**
 * Auswahl von Brutzels Stimme.
 *
 * Bewusst KEINE feste Liste mit Stimmnamen: Welche Stimmen es gibt,
 * entscheidet das Geraet. Ein iPhone hat andere als ein Samsung, und
 * selbst zwei iPhones unterscheiden sich, je nachdem welche Stimmen in
 * den Systemeinstellungen nachgeladen wurden. Eine fest eingebaute Liste
 * waere auf der Haelfte der Geraete schlicht falsch. Begrenzt wird nur
 * die ANZAHL der angebotenen Alternativen, nicht WELCHE es sind.
 */
export default function BrutzelVoicePicker() {
  const { colors, gradient, radius } = useTheme();
  const [voices, setVoices] = useState<GermanVoice[]>([]);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [playing, setPlaying] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    Promise.all([getGermanVoices(), loadBrutzelVoice()])
      .then(([list, stored]) => {
        const alternativen = list
          .filter((v) => !BRUTZEL_STANDARD_NAMEN.some((n) => v.name.toLowerCase().includes(n) || v.identifier.toLowerCase().includes(n)))
          .slice(0, ANZAHL_ALTERNATIVEN);
        setVoices(alternativen);
        setSelected(stored);
      })
      .finally(() => setIsLoading(false));
    // Aufraeumfunktion darf nichts zurueckgeben, was wie ein Promise
    // aussieht - deshalb der Block statt des kurzen Pfeils.
    return () => {
      Speech.stop();
    };
  }, []);

  const preview = (voice?: GermanVoice) => {
    Speech.stop();
    const id = voice?.identifier ?? 'standard';
    setPlaying(id);
    Speech.speak(VOICE_SAMPLE, {
      language: SPEECH_LANGUAGE,
      voice: voice?.identifier,
      pitch: BRUTZEL_PITCH,
      rate: BRUTZEL_RATE,
      onDone: () => setPlaying(null),
      onStopped: () => setPlaying(null),
      onError: () => setPlaying(null),
    });
  };

  const choose = async (voice?: GermanVoice) => {
    setSelected(voice?.identifier);
    await saveBrutzelVoice(voice?.identifier ?? null);
    preview(voice);
  };

  if (isLoading) {
    return (
      <View style={{ paddingVertical: 18, alignItems: 'center' }}>
        <ActivityIndicator color={colors.muted} />
      </View>
    );
  }

  const rows: (GermanVoice | undefined)[] = [undefined, ...voices];

  return (
    <View>
      <Text style={[styles.label, { color: colors.muted }]}>BRUTZELS STIMME</Text>
      <Text style={[styles.hint, { color: colors.muted }]}>
        {voices.length === 0
          ? 'Dein Gerät meldet keine weiteren deutschen Stimmen. Brutzel spricht dann mit seiner normalen Stimme.'
          : 'Antippen zum Anhören und Auswählen.'}
      </Text>

      {rows.map((voice) => {
        const id = voice?.identifier ?? 'standard';
        const isActive = voice ? selected === voice.identifier : !selected;
        return (
          <Pressable
            key={id}
            onPress={() => choose(voice)}
            style={[
              styles.row,
              {
                backgroundColor: colors.card,
                borderRadius: radius.md,
                borderWidth: isActive ? 1.5 : 0,
                borderColor: gradient[0],
              },
            ]}
          >
            <View style={{ flex: 1 }}>
              <Text style={[styles.name, { color: colors.text }]}>
                {voice ? voice.name : 'Brutzels Stimme'}
              </Text>
              <Text style={[styles.meta, { color: colors.muted }]}>
                {voice
                  ? [voice.language, voice.quality && voice.quality.toLowerCase() !== 'default' ? 'hohe Qualität' : null]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Normale männliche Stimme'}
              </Text>
            </View>

            <Pressable onPress={() => preview(voice)} hitSlop={10} style={{ padding: 6 }}>
              <MaterialCommunityIcons
                name={playing === id ? 'stop-circle-outline' : 'play-circle-outline'}
                size={22}
                color={gradient[0]}
              />
            </Pressable>
            {isActive && <Text style={{ color: gradient[0], fontSize: 17, marginLeft: 4 }}>✓</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginTop: 26, marginBottom: 6 },
  hint: { fontSize: 11.5, lineHeight: 17, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 12, marginBottom: 8 },
  name: { fontSize: 13.5, fontWeight: '600' },
  meta: { fontSize: 11, marginTop: 2 },
});
