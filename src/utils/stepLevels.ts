export interface RecipeStep {
  order: number;
  text: string;
  timer_seconds?: number | null;
  technique_tag?: string | null;
  user_note?: string | null;
}

export type HaubenLevel = 'anfaenger' | 'fortgeschritten' | 'profi';

// Gruppengroesse je Stufe: Anfaenger = keine Zusammenfassung (Gruppengroesse 1),
// Fortgeschritten = je 2 Schritte, Profi = je 3 Schritte zusammenfassen.
// Rein algorithmisch, keine redaktionelle Kuratierung - bewusster Kompromiss
// statt 51 Rezepte manuell dreifach zu schreiben (siehe Umsetzungskonzept).
const GROUP_SIZE: Record<HaubenLevel, number> = {
  anfaenger: 1,
  fortgeschritten: 2,
  profi: 3,
};

/**
 * Fasst die Basis-Schrittliste (immer die volle, detaillierteste Fassung,
 * wie sie im Backend gespeichert ist) fuer eine gegebene Hauben-Stufe
 * zusammen. Text wird verkettet, ein vorhandener Timer bleibt erhalten
 * (der laengste innerhalb der Gruppe, damit keine Zeitangabe verloren
 * geht), der erste vorhandene technique_tag der Gruppe bleibt erhalten.
 */
export function deriveStepsForLevel(baseSteps: RecipeStep[], level: HaubenLevel): RecipeStep[] {
  const groupSize = GROUP_SIZE[level];
  if (groupSize <= 1 || baseSteps.length === 0) {
    return baseSteps;
  }

  const result: RecipeStep[] = [];
  for (let i = 0; i < baseSteps.length; i += groupSize) {
    const group = baseSteps.slice(i, i + groupSize);

    const mergedText = group.map((s) => s.text.replace(/\.$/, '')).join('. ') + '.';
    const timerCandidates = group.map((s) => s.timer_seconds).filter((t): t is number => !!t && t > 0);
    const mergedTimer = timerCandidates.length > 0 ? Math.max(...timerCandidates) : null;
    const mergedTechniqueTag = group.find((s) => s.technique_tag)?.technique_tag ?? null;
    const notes = group.map((s) => s.user_note).filter((n): n is string => !!n && n.trim().length > 0);
    const mergedNote = notes.length > 0 ? notes.join(' / ') : null;

    result.push({
      order: result.length + 1,
      text: mergedText,
      timer_seconds: mergedTimer,
      technique_tag: mergedTechniqueTag,
      user_note: mergedNote,
    });
  }
  return result;
}
