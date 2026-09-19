/**
 * Zerlegt eine Zutatenzeile in Menge, Einheit und Name.
 *
 * Gebraucht wird das, weil die Erfassungs-Screens die Zutaten zum
 * Bearbeiten als eine Zeile je Zutat anzeigen ("500 g Hühnerbrust").
 * Beim Speichern wurde diese Zeile bisher vollstaendig in das Feld
 * "name" geschrieben, mit amount und unit auf null.
 *
 * Die Folgen sah man erst spaeter und an ganz anderer Stelle: Im
 * Rezept-PDF stand in jeder Portionsspalte "nach Bedarf", die
 * Einkaufsliste bekam Posten ohne Menge, das Umrechnen auf eine andere
 * Portionenzahl tat nichts, und die Naehrwert-Schaetzung hatte nichts zu
 * rechnen.
 *
 * Bewusst zurueckhaltend: Was sich nicht sicher zerlegen laesst, bleibt
 * vollstaendig im Namen. Eine falsch geratene Menge waere schlimmer als
 * gar keine - sie wird beim Umrechnen vervielfacht.
 */

export interface ZerlegteZutat {
  name: string;
  amount: number | null;
  unit: string | null;
}

// Gebraeuchliche Einheiten. Reihenfolge egal, der Vergleich ist exakt
// (nach Kleinschreibung und ohne Punkt am Ende).
const EINHEITEN = [
  'g', 'kg', 'mg', 'ml', 'l', 'dl', 'cl',
  // dag = Dekagramm, in oesterreichischen Rezepten gebraeuchlich
  'dag', 'deka',
  'el', 'tl', 'kl', 'msp', 'prise', 'prisen',
  'stk', 'stück', 'stueck', 'st',
  'pck', 'pkg', 'packung', 'päckchen', 'paeckchen', 'pkt',
  'dose', 'dosen', 'glas', 'gläser', 'glaeser',
  'bund', 'zehe', 'zehen', 'blatt', 'blätter', 'blaetter',
  'scheibe', 'scheiben', 'tasse', 'tassen', 'becher',
  'tropfen', 'schuss', 'handvoll', 'kopf', 'stange', 'stangen',
  'cup', 'cups', 'tbsp', 'tsp', 'oz', 'lb',
];

/** "1/2" und "1,5" ebenso wie "1.5" und "1 1/2". */
function zahlLesen(text: string): { wert: number; rest: string } | null {
  const gemischt = text.match(/^(\d+)\s+(\d+)\s*\/\s*(\d+)\s*(.*)$/s);
  if (gemischt) {
    const nenner = Number(gemischt[3]);
    if (nenner > 0) {
      return { wert: Number(gemischt[1]) + Number(gemischt[2]) / nenner, rest: gemischt[4] };
    }
  }
  const bruch = text.match(/^(\d+)\s*\/\s*(\d+)\s*(.*)$/s);
  if (bruch) {
    const nenner = Number(bruch[2]);
    if (nenner > 0) return { wert: Number(bruch[1]) / nenner, rest: bruch[3] };
  }
  const dezimal = text.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/s);
  if (dezimal) {
    return { wert: Number(dezimal[1].replace(',', '.')), rest: dezimal[2] };
  }
  return null;
}

export function zutatZerlegen(zeile: string): ZerlegteZutat {
  const text = zeile.trim();
  if (!text) return { name: '', amount: null, unit: null };

  const zahl = zahlLesen(text);
  if (!zahl) {
    // Kein fuehrender Zahlenwert: "Salz", "Pfeffer", "etwas Öl".
    return { name: text, amount: null, unit: null };
  }

  const rest = zahl.rest.trim();

  // Spannen bleiben ungeteilt: "2 bis 3 Bananen", "2 -3 Ei", "2-3 Eier".
  // Eine Spanne hat keine eine Menge - "2" herauszuziehen und "bis 3
  // Bananen" als Namen stehen zu lassen, waere schlechter als gar nichts.
  if (/^(bis|-|–|bis zu)\b/i.test(rest) || /^\d/.test(rest)) {
    return { name: text, amount: null, unit: null };
  }
  const woerter = rest.split(/\s+/);
  const erstes = (woerter[0] || '').toLowerCase().replace(/\.$/, '');

  if (erstes && EINHEITEN.includes(erstes)) {
    const name = woerter.slice(1).join(' ').trim();
    // "500 g" ohne Zutat waere unbrauchbar - dann lieber alles im Namen.
    if (!name) return { name: text, amount: null, unit: null };
    return { name, amount: zahl.wert, unit: woerter[0].replace(/\.$/, '') };
  }

  // Zahl ohne Einheit: "3 Zwiebeln", "4 Eier".
  if (!rest) return { name: text, amount: null, unit: null };
  return { name: rest, amount: zahl.wert, unit: null };
}
