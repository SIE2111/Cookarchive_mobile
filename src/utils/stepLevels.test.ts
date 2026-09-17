/**
 * Kein Test-Framework noetig - einfaches Skript, das die Funktion mit
 * echten Beispieldaten durchspielt und die Ergebnisse gegen erwartete
 * Werte prueft. Ausfuehren mit: npx ts-node src/utils/stepLevels.test.ts
 */
import { pickStepsForLevel, RecipeStep } from './stepLevels';

const baseSteps: RecipeStep[] = [
  { order: 1, text: 'Sehnen am Fleischrand einschneiden, Scheiben flach drücken' },
  { order: 2, text: 'Beidseitig mit Senf bestreichen, salzen, pfeffern, mehlieren', technique_tag: 'mehlieren' },
  { order: 3, text: 'Mit der mehlierten Seite nach unten scharf anbraten', timer_seconds: 300 },
];

const anfaengerVariant: RecipeStep[] = [
  { order: 1, text: 'Die Sehnen am Rand des Fleisches vorsichtig mit einem scharfen Messer einschneiden, dabei nicht zu tief ins Fleisch schneiden. Die Scheiben dann mit der flachen Hand leicht flach drücken.' },
  { order: 2, text: 'Beide Seiten gleichmäßig mit Senf bestreichen (das gibt Würze und hilft dem Mehl beim Haften), salzen, pfeffern und danach in Mehl wenden - überschüssiges Mehl abklopfen.', technique_tag: 'mehlieren' },
  { order: 3, text: 'Die Pfanne gut erhitzen, dann das Fleisch mit der mehlierten Seite nach unten hineinlegen und scharf anbraten, bis es goldbraun ist.', timer_seconds: 300 },
];

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error('FEHLGESCHLAGEN:', message);
    process.exitCode = 1;
  } else {
    console.log('OK:', message);
  }
}

const fortgeschritten = pickStepsForLevel(
  { steps: baseSteps, steps_anfaenger: anfaengerVariant, steps_profi: null },
  'fortgeschritten',
);
assert(fortgeschritten === baseSteps, 'Fortgeschritten nutzt immer die Basisfassung');

const anfaengerMitVariante = pickStepsForLevel(
  { steps: baseSteps, steps_anfaenger: anfaengerVariant, steps_profi: null },
  'anfaenger',
);
assert(anfaengerMitVariante === anfaengerVariant, 'Anfaenger nutzt die generierte Variante, wenn vorhanden');
assert(anfaengerMitVariante[0].text.length > baseSteps[0].text.length, 'Anfaenger-Text ist tatsaechlich ausfuehrlicher als die Basisfassung');
assert(anfaengerMitVariante[1].technique_tag === 'mehlieren', 'technique_tag aus der Basisfassung bleibt in der Variante erhalten');
assert(anfaengerMitVariante[2].timer_seconds === 300, 'timer_seconds aus der Basisfassung bleibt in der Variante erhalten');

const anfaengerOhneVariante = pickStepsForLevel({ steps: baseSteps, steps_anfaenger: null, steps_profi: null }, 'anfaenger');
assert(anfaengerOhneVariante === baseSteps, 'Anfaenger faellt ohne generierte Variante auf die Basisfassung zurueck');

const profiOhneVariante = pickStepsForLevel({ steps: baseSteps, steps_anfaenger: null, steps_profi: null }, 'profi');
assert(profiOhneVariante === baseSteps, 'Profi faellt ohne generierte Variante auf die Basisfassung zurueck');

const empty = pickStepsForLevel({ steps: [], steps_anfaenger: null, steps_profi: null }, 'profi');
assert(empty.length === 0, 'Leere Basisliste bleibt leer, kein Crash');

const emptyVariant = pickStepsForLevel({ steps: baseSteps, steps_anfaenger: [], steps_profi: null }, 'anfaenger');
assert(emptyVariant === baseSteps, 'Leeres Varianten-Array faellt auf die Basisfassung zurueck statt eine leere Liste zu zeigen');

console.log('\nAlle Tests durchgelaufen.');
