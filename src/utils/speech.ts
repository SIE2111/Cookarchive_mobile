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
 * Brutzel spricht mit normaler Tonhoehe (22.09.2026) - eine erwachsene,
 * maennliche Vorlesestimme statt der vorherigen, hoeher gepitchten
 * Charakterstimme. Etwas langsamer als die Schrittansage bleibt er, das
 * hat mit der Tonlage nichts zu tun.
 */
export const BRUTZEL_PITCH = 1.0;
export const BRUTZEL_RATE = 0.95;

/** Beispielsatz zum Anhoeren in der Stimmenauswahl. */
/**
 * Brutzels Stimme, wenn der Nutzer keine ausgewaehlt hat: eine normale,
 * MAENNLICHE Vorlesestimme (22.09.2026, vorher probeweise Apples
 * Charakterstimmen wie 'rocko'/'eddy' - klang nicht mehr wie eine
 * "Normalstimme"). 'yannick' und 'markus' sind die bekannten deutschen
 * iOS-Systemstimmen eines Mannes (Yannick in hoeherer Qualitaet, wo
 * nachgeladen), 'martin' die dritte maennliche seit iOS 11. Auf Android
 * gibt es diese Namen meist nicht - dort entscheidet wie bisher die
 * Reihenfolge aus getGermanVoices() (beste Qualitaet zuerst), ohne dass
 * sich am Geschlecht der Stimme etwas erzwingen liesse.
 */
const BRUTZEL_STANDARD_STIMMEN = ['yannick', 'markus', 'martin'];
// Fuer die Stimmenauswahl exportiert, um Duplikate von Brutzels eigener
// Stimme aus den Alternativen auszuschliessen (siehe BrutzelVoicePicker).
export const BRUTZEL_STANDARD_NAMEN = BRUTZEL_STANDARD_STIMMEN;

/**
 * Die Stimme, mit der Brutzel ueberall spricht: die gewaehlte, sonst die
 * beste der Standardstimmen. Eine Stelle statt drei, damit die Begruessung
 * nicht anders klingt als der Koch-Modus.
 */
export async function brutzelStimme(): Promise<string | undefined> {
  const gewaehlt = await loadBrutzelVoice();
  if (gewaehlt) return gewaehlt;

  const stimmen = await getGermanVoices();
  for (const name of BRUTZEL_STANDARD_STIMMEN) {
    const treffer = stimmen.find(
      (v) => v.name.toLowerCase().includes(name) || v.identifier.toLowerCase().includes(name),
    );
    if (treffer) return treffer.identifier;
  }
  // Keiner der drei Namen gefunden (z.B. weil "Martin" auf diesem Geraet
  // unter einer anderen Bezeichnung laeuft): 'siri_male' steht in der
  // Kennung selbst bei jeder maennlichen iOS-Systemstimme, unabhaengig
  // vom angezeigten Namen - ein zweiter, robusterer Versuch, bevor
  // ungeachtet des Geschlechts irgendeine Stimme genommen wird.
  const maennlich = stimmen.find((v) => v.identifier.toLowerCase().includes('siri_male'));
  if (maennlich) return maennlich.identifier;
  return stimmen[0]?.identifier;
}

export const VOICE_SAMPLE = 'Servus, ich bin Brutzel. Lass die Zwiebel goldgelb werden, nicht braun.';

/**
 * Die "Vorleser-Stimme": liest Schritte, die Begruessung, die
 * Fertigstellung und den Timer-Countdown vor - ueberall dort, wo die App
 * selbst zum Nutzer spricht, nicht Brutzel persoenlich. Bis 22.09.2026
 * lief das ohne jede Vorgabe (Speech.speak ohne voice-Parameter), also
 * mit der Standardstimme des Geraets. Seit Brutzels eigene Stimme mit
 * normaler statt hoeher gepitchter Tonlage spricht, konnten beide auf
 * demselben Geraet zufaellig dieselbe Systemstimme treffen - dann war
 * nicht mehr zu unterscheiden, ob gerade der Schritt vorgelesen wird
 * oder Brutzel selbst spricht.
 *
 * Deshalb jetzt fest eine WEIBLICHE Stimme, klar getrennt von Brutzels
 * maennlicher: 'anna' ist Apples bekannte deutsche Standardstimme einer
 * Frau, 'petra' und 'helena' die hoeherwertigen Alternativen dazu.
 */
const VORLESER_STANDARD_STIMMEN = ['anna', 'petra', 'helena'];

export async function vorleserStimme(): Promise<string | undefined> {
  const stimmen = await getGermanVoices();
  for (const name of VORLESER_STANDARD_STIMMEN) {
    const treffer = stimmen.find(
      (v) => v.name.toLowerCase().includes(name) || v.identifier.toLowerCase().includes(name),
    );
    if (treffer) return treffer.identifier;
  }
  // Wie bei brutzelStimme(): 'siri_female' als robusterer zweiter Versuch
  // ueber die Kennung, bevor der Ausweich-Zweig unten (irgendeine andere
  // Stimme als Brutzel) greift.
  const weiblich = stimmen.find((v) => v.identifier.toLowerCase().includes('siri_female'));
  if (weiblich) return weiblich.identifier;
  // Keiner der bekannten weiblichen Namen auf dem Geraet (z.B. Android):
  // wenigstens eine andere Stimme als Brutzels eigene, damit beide nicht
  // zusammenfallen.
  const brutzel = await brutzelStimme();
  return stimmen.find((v) => v.identifier !== brutzel)?.identifier ?? stimmen[stimmen.length - 1]?.identifier;
}
