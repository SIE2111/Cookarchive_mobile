/**
 * Kein Test-Framework noetig - einfaches Skript, das die Funktion mit
 * echten Beispieldaten durchspielt und die Ergebnisse gegen erwartete
 * Werte prueft. Ausfuehren mit: npx ts-node src/utils/stepLevels.test.ts
 */
import { deriveStepsForLevel, RecipeStep } from './stepLevels';

const zwiebelrostbratenSteps: RecipeStep[] = [
  { order: 1, text: 'Sehnen am Fleischrand einschneiden, Scheiben flach drücken' },
  { order: 2, text: 'Beidseitig mit Senf bestreichen, salzen, pfeffern, mehlieren', technique_tag: 'mehlieren' },
  { order: 3, text: 'Mit der mehlierten Seite nach unten scharf anbraten' },
  { order: 4, text: 'Bei 80°C im Ofen ruhen lassen', timer_seconds: 420 },
  { order: 5, text: 'Bratensatz mit Brühe ablöschen, köcheln lassen', timer_seconds: 600 },
  { order: 6, text: 'Zwiebeln in Ringe schneiden, hellbraun braten' },
  { order: 7, text: 'Sauce mit kalter Butter binden' },
  { order: 8, text: 'Fleisch zur Sauce geben, anrichten' },
];

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error('FEHLGESCHLAGEN:', message);
    process.exitCode = 1;
  } else {
    console.log('OK:', message);
  }
}

// Anfaenger: keine Zusammenfassung, 8 bleiben 8
const anfaenger = deriveStepsForLevel(zwiebelrostbratenSteps, 'anfaenger');
assert(anfaenger.length === 8, `Anfaenger hat 8 Schritte (tatsaechlich: ${anfaenger.length})`);
assert(anfaenger[0].text === zwiebelrostbratenSteps[0].text, 'Anfaenger-Text unveraendert');

// Fortgeschritten: je 2 zusammengefasst, 8 -> 4
const fortgeschritten = deriveStepsForLevel(zwiebelrostbratenSteps, 'fortgeschritten');
assert(fortgeschritten.length === 4, `Fortgeschritten hat 4 Schritte (tatsaechlich: ${fortgeschritten.length})`);
assert(
  fortgeschritten[0].text.includes('Sehnen') && fortgeschritten[0].text.includes('mehlieren'),
  'Erster Fortgeschritten-Schritt verkettet Schritt 1+2',
);
assert(fortgeschritten[0].technique_tag === 'mehlieren', 'technique_tag aus Gruppe uebernommen');

// Profi: je 3 zusammengefasst, 8 -> 3 (letzte Gruppe hat nur 2)
const profi = deriveStepsForLevel(zwiebelrostbratenSteps, 'profi');
assert(profi.length === 3, `Profi hat 3 Schritte (tatsaechlich: ${profi.length})`);
assert(profi[1].timer_seconds === 600, `Timer der 2. Profi-Gruppe ist der laengste (600s), tatsaechlich: ${profi[1].timer_seconds}`);

// user_note: bleibt erhalten und wird bei mehreren in der Gruppe verkettet
const stepsWithNotes: RecipeStep[] = [
  { order: 1, text: 'Erster Schritt', user_note: 'Klappt gut mit Butterschmalz' },
  { order: 2, text: 'Zweiter Schritt' },
  { order: 3, text: 'Dritter Schritt', user_note: 'Lieber 5 Min laenger' },
];
const withNotesFortgeschritten = deriveStepsForLevel(stepsWithNotes, 'fortgeschritten');
assert(withNotesFortgeschritten[0].user_note === 'Klappt gut mit Butterschmalz', 'Einzelne Notiz bleibt erhalten (Gruppe 1)');
assert(withNotesFortgeschritten[1].user_note === 'Lieber 5 Min laenger', 'Notiz aus Schritt 3 bleibt in eigener Gruppe erhalten');

// Edge Case: leere Liste darf nicht abstuerzen
const empty = deriveStepsForLevel([], 'profi');
assert(empty.length === 0, 'Leere Liste bleibt leer, kein Crash');

// Edge Case: einzelner Schritt
const single = deriveStepsForLevel([{ order: 1, text: 'Nur ein Schritt' }], 'profi');
assert(single.length === 1, 'Einzelner Schritt bleibt bei Zusammenfassung erhalten');

console.log('\nAlle Tests durchgelaufen.');
