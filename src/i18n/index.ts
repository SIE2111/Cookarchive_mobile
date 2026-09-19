/**
 * Mehrsprachigkeit.
 *
 * Bewusst ohne i18next: Die App braucht Nachschlagen, Platzhalter und
 * Pluralformen - mehr nicht. Das sind hundert Zeilen, und dafuer keine
 * Bibliothek samt Ladekette in den Startvorgang zu haengen, haelt den
 * Start schnell und den Fehlerraum klein.
 *
 * Eine weitere Sprache ist eine Datei in ./locales und ein Eintrag in
 * SPRACHEN. Sonst nichts.
 *
 * Pluralformen: Nicht jede Sprache hat zwei. Polnisch hat drei
 * (1 / 2-4 / 5+), Franzoesisch und Italienisch zwei mit anderer Grenze
 * als im Deutschen. Deshalb entscheidet Intl.PluralRules, welche Form
 * gilt, und nicht ein "count === 1".
 */
import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';

import de from './locales/de.json';
import en from './locales/en.json';

export type Sprache = 'de' | 'en';

export const SPRACHEN: { code: Sprache; name: string; eigenname: string }[] = [
  { code: 'de', name: 'Deutsch', eigenname: 'Deutsch' },
  { code: 'en', name: 'Englisch', eigenname: 'English' },
];

const TEXTE: Record<Sprache, any> = { de, en };

const SPEICHER_SCHLUESSEL = 'meinkochbuch:sprache';

// 'system' heisst: der Geraeteeinstellung folgen.
export type Sprachwahl = Sprache | 'system';

let aktiveSprache: Sprache = 'de';
const hoerer = new Set<() => void>();

function geraetesprache(): Sprache {
  const codes = Localization.getLocales?.() ?? [];
  for (const eintrag of codes) {
    const kurz = (eintrag.languageCode || '').toLowerCase() as Sprache;
    if (TEXTE[kurz]) return kurz;
  }
  return 'de';
}

/** Wert aus dem verschachtelten Objekt holen: 'profil.titel' */
function nachschlagen(quelle: any, pfad: string): any {
  return pfad.split('.').reduce((o, teil) => (o == null ? undefined : o[teil]), quelle);
}

/**
 * Uebersetzt einen Schluessel.
 *
 * Platzhalter werden als {name} geschrieben:
 *   t('einkauf.entfernt', { anzahl: 3 })
 *
 * Fuer Pluralformen enthaelt der Eintrag ein Objekt mit den Formen, die
 * Intl.PluralRules fuer diese Sprache kennt:
 *   { "one": "{anzahl} Rezept", "other": "{anzahl} Rezepte" }
 * Uebergib dazu 'anzahl' oder 'count' in den Werten.
 */
export function t(schluessel: string, werte?: Record<string, string | number>): string {
  let eintrag = nachschlagen(TEXTE[aktiveSprache], schluessel);

  // Fehlt die Uebersetzung, gilt Deutsch. Ein sichtbarer deutscher Satz
  // ist immer noch besser als ein nackter Schluessel auf dem Bildschirm.
  if (eintrag === undefined && aktiveSprache !== 'de') {
    eintrag = nachschlagen(TEXTE.de, schluessel);
    if (__DEV__ && eintrag !== undefined) {
      console.warn(`[i18n] fehlt in ${aktiveSprache}: ${schluessel}`);
    }
  }
  if (eintrag === undefined) {
    if (__DEV__) console.warn(`[i18n] unbekannter Schluessel: ${schluessel}`);
    return schluessel;
  }

  if (typeof eintrag === 'object') {
    const anzahl = Number(werte?.anzahl ?? werte?.count ?? 0);
    let form = 'other';
    try {
      form = new Intl.PluralRules(aktiveSprache).select(anzahl);
    } catch {
      form = anzahl === 1 ? 'one' : 'other';
    }
    eintrag = eintrag[form] ?? eintrag.other ?? eintrag.one ?? '';
  }

  let text = String(eintrag);
  if (werte) {
    for (const [name, wert] of Object.entries(werte)) {
      text = text.split(`{${name}}`).join(String(wert));
    }
  }
  return text;
}

export function getSprache(): Sprache {
  return aktiveSprache;
}

function setzen(sprache: Sprache) {
  if (sprache === aktiveSprache) return;
  aktiveSprache = sprache;
  hoerer.forEach((f) => f());
}

/** Beim Start aufrufen: gespeicherte Wahl laden, sonst Geraetesprache. */
export async function spracheLaden(): Promise<Sprachwahl> {
  try {
    const gespeichert = (await AsyncStorage.getItem(SPEICHER_SCHLUESSEL)) as Sprachwahl | null;
    if (gespeichert && gespeichert !== 'system' && TEXTE[gespeichert as Sprache]) {
      setzen(gespeichert as Sprache);
      return gespeichert;
    }
  } catch {
    // Kein Zugriff auf den Speicher: Geraetesprache genuegt.
  }
  setzen(geraetesprache());
  return 'system';
}

export async function spracheSetzen(wahl: Sprachwahl): Promise<void> {
  setzen(wahl === 'system' ? geraetesprache() : wahl);
  try {
    await AsyncStorage.setItem(SPEICHER_SCHLUESSEL, wahl);
  } catch {
    // Nicht speichern zu koennen ist aergerlich, aber kein Grund,
    // die Umschaltung zurueckzunehmen - sie gilt fuer diese Sitzung.
  }
}

/**
 * Hook fuer Komponenten. Liefert t und die aktive Sprache und zeichnet
 * die Komponente neu, wenn umgeschaltet wird.
 */
export function useUebersetzung() {
  const [, neu] = useState(0);

  useEffect(() => {
    const f = () => neu((n) => n + 1);
    hoerer.add(f);
    return () => {
      hoerer.delete(f);
    };
  }, []);

  const uebersetzen = useCallback(
    (schluessel: string, werte?: Record<string, string | number>) => t(schluessel, werte),
    [],
  );

  return { t: uebersetzen, sprache: aktiveSprache };
}
