import { Alert } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { MainStackParamList } from '../navigation/AppNavigator';

// Absichtlich nur das, was hier gebraucht wird, statt des vollen
// Navigations-Typs: Die Funktion wird aus vier verschiedenen Screens
// aufgerufen, deren navigation-Objekte jeweils an ihre eigene Route
// gebunden sind und daher nicht denselben Typ haben. Sie koennen aber
// alle navigate und replace - und mehr braucht es nicht.
type Nav = Pick<NativeStackNavigationProp<MainStackParamList>, 'navigate' | 'replace'>;

/**
 * Was passiert, nachdem ein Rezept erfasst wurde - egal auf welchem Weg
 * (KI, Foto, Web-Import, aus dem Pool uebernommen).
 *
 * Vorher landete man nach dem Speichern wortlos wieder auf den Tabs. Das
 * ist genau der falsche Moment fuer eine Sackgasse: Wer sich gerade ein
 * Rezept besorgt hat, will es meistens entweder ansehen oder gleich
 * kochen - und dann auch die Zutaten einkaufen.
 *
 * Drei Wege statt eines, in der Reihenfolge ihrer Haeufigkeit:
 *   - Ansehen: Rezeptseite, dort haengen Einkaufsliste, Drucken, Notizen
 *   - Jetzt kochen: direkt in den Koch-Modus
 *   - Fertig: zurueck zur Uebersicht
 *
 * Als gemeinsame Funktion, weil vier Screens denselben Abschluss brauchen
 * und vier Kopien garantiert auseinanderlaufen wuerden.
 */
export function askWhatNext(
  navigation: Nav,
  recipe: { id: string; title: string },
) {
  Alert.alert(
    'Rezept gespeichert',
    `„${recipe.title}" liegt jetzt in deinem Kochbuch. Wie möchtest du weitermachen?`,
    [
      {
        text: 'Fertig',
        style: 'cancel',
        onPress: () => navigation.navigate('MainTabs'),
      },
      {
        text: 'Ansehen',
        onPress: () =>
          navigation.replace('RecipeDetail', { recipeId: recipe.id, title: recipe.title }),
      },
      {
        text: 'Jetzt kochen',
        onPress: () =>
          // replace statt navigate: Der Erfassen-Screen soll nicht hinter
          // dem Koch-Modus liegen bleiben - ein "Zurueck" aus dem Kochen
          // fuehrt sonst in ein Formular, das es so nicht mehr gibt.
          navigation.replace('CookMode', { recipeIds: [recipe.id] }),
      },
    ],
  );
}
