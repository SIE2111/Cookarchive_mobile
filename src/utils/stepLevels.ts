export interface RecipeStep {
  order: number;
  text: string;
  timer_seconds?: number | null;
  technique_tag?: string | null;
  user_note?: string | null;
}

export type HaubenLevel = 'anfaenger' | 'fortgeschritten' | 'profi';

/**
 * Waehlt die fuer die gegebene Hauben-Stufe passende Schrittliste aus.
 * 'fortgeschritten' ist die Basisfassung (steps), wie urspruenglich erfasst.
 * 'anfaenger'/'profi' nutzen echte, vom Backend KI-generierte und dort
 * zwischengespeicherte Textvarianten (siehe POST /ai/adapt-steps/{id}) -
 * ausfuehrlicher bzw. knapper formuliert, NICHT nur eine Gruppierung
 * derselben Basis-Texte wie zuvor. Sind die Varianten noch nicht generiert
 * (steps_anfaenger/steps_profi sind null), faellt das vorerst auf die
 * Basisfassung zurueck - SingleRecipeCookView stoesst die Generierung an
 * und aktualisiert dann.
 */
export function pickStepsForLevel(
  recipe: {
    steps: RecipeStep[];
    steps_anfaenger?: RecipeStep[] | null;
    steps_profi?: RecipeStep[] | null;
    steps_fortgeschritten?: RecipeStep[] | null;
  },
  level: HaubenLevel,
): RecipeStep[] {
  if (level === 'anfaenger' && recipe.steps_anfaenger && recipe.steps_anfaenger.length > 0) {
    return recipe.steps_anfaenger;
  }
  if (level === 'profi' && recipe.steps_profi && recipe.steps_profi.length > 0) {
    return recipe.steps_profi;
  }
  if (level === 'fortgeschritten' && recipe.steps_fortgeschritten && recipe.steps_fortgeschritten.length > 0) {
    return recipe.steps_fortgeschritten;
  }
  return recipe.steps;
}

/**
 * Ab wie vielen Original-Schritten die Fortgeschritten-Stufe das Original
 * selbst ist (siehe fortgeschritten_ziel im Backend): Kuerzere Rezepte
 * bekommen eine auf 6 Schritte aufgeteilte Fassung, zwei weniger als die
 * Anfaenger-Stufe mit mindestens 8.
 */
export const FORTGESCHRITTEN_MIN_SCHRITTE = 6;

export type StufenFeld = 'steps' | 'steps_anfaenger' | 'steps_fortgeschritten' | 'steps_profi';

/**
 * Das Feld, dessen Liste auf dieser Stufe gerade ANGEZEIGT wird - dieselbe
 * Auswahl wie pickStepsForLevel. Aenderungen an einem Schritt (Text,
 * Notiz, Loeschen) gehoeren in genau diese Liste, sonst traefen sie den
 * Schritt mit derselben Nummer in einer anderen Fassung.
 */
export function feldFuerStufe(
  recipe: {
    steps_anfaenger?: RecipeStep[] | null;
    steps_profi?: RecipeStep[] | null;
    steps_fortgeschritten?: RecipeStep[] | null;
  },
  level: HaubenLevel,
): StufenFeld {
  if (level === 'anfaenger' && recipe.steps_anfaenger?.length) return 'steps_anfaenger';
  if (level === 'profi' && recipe.steps_profi?.length) return 'steps_profi';
  if (level === 'fortgeschritten' && recipe.steps_fortgeschritten?.length) return 'steps_fortgeschritten';
  return 'steps';
}

type MitStufen = {
  steps_anfaenger?: RecipeStep[] | null;
  steps_profi?: RecipeStep[] | null;
  steps_fortgeschritten?: RecipeStep[] | null;
};

/** Traegt eine der erzeugten Stufenfassungen eine Notiz? */
export function hatStufenNotizen(recipe: MitStufen | null | undefined): boolean {
  if (!recipe) return false;
  return [recipe.steps_anfaenger, recipe.steps_profi, recipe.steps_fortgeschritten].some(
    (liste) => !!liste?.some((s) => !!s.user_note?.trim()),
  );
}

/**
 * Dieselbe Pruefung wie _schritt_inhalt im Backend: Aendert sich Text,
 * Reihenfolge oder Timer, verwirft das Backend beim Speichern die
 * Stufenfassungen. Notizen zaehlen nicht als Aenderung.
 */
export function schritteInhaltGeaendert(
  alt: { order?: number; text: string; timer_seconds?: number | null }[],
  neu: { order?: number; text: string; timer_seconds?: number | null }[],
): boolean {
  const norm = (l: typeof alt) =>
    [...l]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((s) => `${s.text.trim()}\u0000${s.timer_seconds || ''}`)
      .join('\u0001');
  return norm(alt) !== norm(neu);
}
