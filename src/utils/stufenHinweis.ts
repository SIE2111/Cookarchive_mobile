import { Alert } from 'react-native';
import { hatStufenNotizen, schritteInhaltGeaendert, RecipeStep } from './stepLevels';

type Stufen = {
  steps_anfaenger?: RecipeStep[] | null;
  steps_profi?: RecipeStep[] | null;
  steps_fortgeschritten?: RecipeStep[] | null;
};
type Schritt = { order?: number; text: string; timer_seconds?: number | null };

/**
 * Fragt nach, bevor eine Aenderung am Original gespeichert wird, die
 * Notizen in den Stufenfassungen kostet (das Backend verwirft die
 * Fassungen, sobald sich Text, Reihenfolge oder Timer aendern). Ohne
 * solche Notizen oder ohne inhaltliche Aenderung geht es ohne Frage weiter.
 */
export function mitStufenHinweis(
  recipe: Stufen | null | undefined,
  alt: Schritt[],
  neu: Schritt[] | undefined,
  t: (key: string) => string,
  weiter: () => void,
): void {
  if (!neu || !hatStufenNotizen(recipe) || !schritteInhaltGeaendert(alt, neu)) {
    weiter();
    return;
  }
  Alert.alert(t('detail.stufenNotizenTitel'), t('detail.stufenNotizenText'), [
    { text: t('allgemein.abbrechen'), style: 'cancel' },
    { text: t('detail.trotzdemSpeichern'), style: 'destructive', onPress: weiter },
  ]);
}
