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
  recipe: { steps: RecipeStep[]; steps_anfaenger?: RecipeStep[] | null; steps_profi?: RecipeStep[] | null },
  level: HaubenLevel,
): RecipeStep[] {
  if (level === 'anfaenger' && recipe.steps_anfaenger && recipe.steps_anfaenger.length > 0) {
    return recipe.steps_anfaenger;
  }
  if (level === 'profi' && recipe.steps_profi && recipe.steps_profi.length > 0) {
    return recipe.steps_profi;
  }
  return recipe.steps;
}
