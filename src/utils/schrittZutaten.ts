/**
 * Findet heraus, welche Zutaten in einem Zubereitungsschritt vorkommen -
 * rein in der App, ohne KI: Der Schritttext wird nach den Zutatennamen
 * durchsucht. Damit zeigt der Koch-Modus unter jedem Schritt gleich die
 * passenden Mengen, sofort, kostenlos und auch ohne Netz.
 *
 * Bewusst einfach gehalten. Was erkannt wird:
 * - Beugungen: "Zwiebeln" -> Zwiebel, "Eier" -> Ei, "Äpfel" -> Apfel
 * - Zusammensetzungen im Schritt: "Buttermasse" -> Butter,
 *   "Apfelscheiben" -> Äpfel, "Eigelb"/"Eischnee" -> Eier
 * - Kurzformen im Schritt: "Schnitzel" -> Kalbsschnitzel,
 *   "Brühe" -> Gemüsebrühe, "Marmelade" -> Marillenmarmelade
 * Bewusst NICHT: Wortende als Zutat ("Staubzucker" -> Zucker). Das traf
 * meist eine andere Zutat - Staubzucker zum Bestreuen ist nicht der Zucker
 * aus dem Teig, die Menge daneben waere falsch.
 * Was nicht geht: Sammelbegriffe ("die trockenen Zutaten", "die Masse")
 * und aufgeteilte Mengen ("die Hälfte des Zuckers" zeigt die ganze Menge).
 */

// Woerter in Zutatennamen, die nie die Zutat selbst bezeichnen.
const FUELLWOERTER = new Set([
  'und', 'oder', 'zum', 'zur', 'fur', 'mit', 'ohne', 'nach', 'bei', 'etwas', 'ca',
  'frisch', 'frische', 'frischer', 'gehackt', 'gerieben', 'geriebener', 'gewurfelt',
  'weich', 'kalt', 'warm', 'gross', 'grosse', 'klein', 'kleine', 'fein', 'grob',
  'bio', 'tk', 'dose', 'glas', 'packung', 'optional', 'geschmack', 'belieben',
  'and', 'or', 'for', 'with', 'fresh', 'chopped', 'grated', 'large', 'small', 'to', 'taste',
]);

// Zusammensetzungen mit "Ei", die zu den Eiern gehoeren. Allgemein mit "ei"
// beginnende Woerter zuzulassen, hiesse auch "Eis" oder "Eintopf".
const EI_WOERTER = new Set(['eigelb', 'eiweiss', 'eischnee', 'eidotter', 'eiklar']);

function normalisieren(wort: string): string {
  return wort
    .toLowerCase()
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss');
}

const ENDUNGEN_DE = ['en', 'er', 'es', 'e', 'n', 's'];
const ENDUNGEN_EN = ['es', 's'];

/** Grober Wortstamm - fuer Zutat und Schritt gleich gebildet, daher
 *  genuegt es, wenn er bei beiden gleich ausfaellt ("butter" -> "butt"). */
function stamm(wort: string, englisch: boolean): string {
  for (const e of englisch ? ENDUNGEN_EN : ENDUNGEN_DE) {
    if (wort.length - e.length >= 2 && wort.endsWith(e)) return wort.slice(0, -e.length);
  }
  return wort;
}

interface Schluessel {
  roh: string;
  stamm: string;
}

function schluesselFuerZutat(name: string, englisch: boolean): Schluessel[] {
  // Klammern und alles nach dem Komma sind Zusaetze ("Äpfel, säuerlich",
  // "Kichererbsen (Dose)", "Rindfleisch, Gulasch") - nicht der Name.
  const kern = name.replace(/\([^)]*\)/g, ' ').split(',')[0];
  return (kern.match(/[\p{L}]+/gu) ?? [])
    .map(normalisieren)
    .filter((w) => w.length >= 2 && !FUELLWOERTER.has(w))
    .map((w) => ({ roh: w, stamm: stamm(w, englisch) }));
}

/**
 * Liefert die Positionen (Index in `zutaten`) der Zutaten, die im
 * Schritttext vorkommen, in der Reihenfolge der Zutatenliste.
 */
export function zutatenImSchritt(
  schrittText: string,
  zutaten: { name: string }[],
  sprache: string = 'de',
): number[] {
  const englisch = sprache.slice(0, 2).toLowerCase() === 'en';
  const alleSchluessel = zutaten.map((z) => schluesselFuerZutat(z.name ?? '', englisch));

  // Im Deutschen sind Zutaten Hauptwoerter und damit grossgeschrieben.
  // Kleingeschriebene Woerter auszulassen verhindert, dass "braune Butter"
  // eine Zutat "Brauner Zucker" findet.
  const woerter = (schrittText.match(/[\p{L}]+/gu) ?? []).filter(
    (w) => englisch || w[0] !== w[0].toLowerCase(),
  );

  const gefunden = new Set<number>();
  for (const original of woerter) {
    const roh = normalisieren(original);
    const st = stamm(roh, englisch);
    // Je Wort nur die beste Trefferstufe: Steht "Butterschmalz" im Schritt
    // und gibt es Butter UND Butterschmalz, ist nur das Butterschmalz gemeint.
    let besteStufe = 0;
    let treffer: number[] = [];
    alleSchluessel.forEach((schluessel, index) => {
      let stufe = 0;
      for (const k of schluessel) {
        if (st === k.stamm) stufe = Math.max(stufe, 3);
        else if (k.stamm === 'ei' && (roh.startsWith('eier') || EI_WOERTER.has(roh))) stufe = Math.max(stufe, 2);
        else if (k.roh.length >= 4 && roh.startsWith(k.roh)) stufe = Math.max(stufe, 2); // Buttermasse
        else if ((st.length >= 3 || st === 'ol') && k.stamm.endsWith(st)) stufe = Math.max(stufe, 2); // Schnitzel -> Kalbsschnitzel
      }
      if (stufe > besteStufe) {
        besteStufe = stufe;
        treffer = [index];
      } else if (stufe > 0 && stufe === besteStufe) {
        treffer.push(index);
      }
    });
    treffer.forEach((i) => gefunden.add(i));
  }
  return [...gefunden].sort((a, b) => a - b);
}
