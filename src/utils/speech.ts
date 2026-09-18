import { Platform } from 'react-native';

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
