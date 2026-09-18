import { Platform } from 'react-native';
import * as Speech from 'expo-speech';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Sprache fuer die Sprachausgabe.
 *
 * iOS bringt eine oesterreichische Stimme mit, Android in aller Regel
 * NICHT - dort fuehrt ein unbekanntes Sprachkuerzel je nach Geraet dazu,
 * dass schlicht nichts gesprochen wird. Das ist der unangenehmste Fall:
 * kein Fehler, kein Ton, nur Stille. Deshalb auf Android das allgemeine
 * Deutsch, das jedes Geraet hat.
 */
export const SPEECH_LANGUAGE = Platform.OS === 'android' ? 'de-DE' : 'de-AT';

/**
 * Brutzels Stimme wird LOKAL gespeichert, nicht im Profil auf dem Server.
 *
 * Das ist kein Sparen, sondern notwendig: Stimmen-Kennungen sind
 * geraetespezifisch (auf einem iPhone etwa
 * 'com.apple.voice.compact.de-DE.Anna', auf einem Android-Geraet ganz
 * anders). Eine auf dem Handy gewaehlte Stimme waere auf dem Tablet ein
 * unbekannter Bezeichner - und unbekannte Bezeichner fuehren wieder zu
 * Stille.
 */
const VOICE_KEY = 'brutzel_voice_id';

export interface GermanVoice {
  identifier: string;
  name: string;
  language: string;
  quality?: string;
}

/**
 * Alle deutschsprachigen Stimmen des Geraets, beste zuerst.
 *
 * 'Enhanced'/'Premium' klingen deutlich natuerlicher als die
 * Kompakt-Varianten, sind aber oft nicht vorinstalliert - sie muessen in
 * den Systemeinstellungen nachgeladen werden. Deshalb nach Qualitaet
 * sortiert: Was da ist und gut klingt, steht oben.
 */
export async function getGermanVoices(): Promise<GermanVoice[]> {
  try {
    const all = await Speech.getAvailableVoicesAsync();
    return all
      .filter((v) => (v.language ?? '').toLowerCase().startsWith('de'))
      .map((v) => ({
        identifier: v.identifier,
        name: v.name ?? v.identifier,
        language: v.language ?? 'de',
        quality: (v as { quality?: string }).quality,
      }))
      .sort((a, b) => {
        const rank = (q?: string) => (q && q.toLowerCase() !== 'default' ? 0 : 1);
        return rank(a.quality) - rank(b.quality) || a.name.localeCompare(b.name);
      });
  } catch {
    return [];
  }
}

export async function loadBrutzelVoice(): Promise<string | undefined> {
  try {
    return (await AsyncStorage.getItem(VOICE_KEY)) ?? undefined;
  } catch {
    return undefined;
  }
}

export async function saveBrutzelVoice(identifier: string | null): Promise<void> {
  try {
    if (identifier) await AsyncStorage.setItem(VOICE_KEY, identifier);
    else await AsyncStorage.removeItem(VOICE_KEY);
  } catch {
    // Nicht kritisch - dann gilt beim naechsten Start wieder die Standardstimme.
  }
}

/**
 * Brutzel spricht etwas hoeher und einen Tick langsamer als die
 * Schrittansage. So ist auch dann hoerbar, wer gerade redet, wenn das
 * Geraet nur eine einzige deutsche Stimme hat.
 */
export const BRUTZEL_PITCH = 1.15;
export const BRUTZEL_RATE = 0.95;

/** Beispielsatz zum Anhoeren in der Stimmenauswahl. */
export const VOICE_SAMPLE = 'Servus, ich bin Brutzel. Lass die Zwiebel goldgelb werden, nicht braun.';
