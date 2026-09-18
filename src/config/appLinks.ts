/**
 * Links in die App-Stores, fuer die Bewertungsbitte nach dem Kochen.
 *
 * Solange die App nicht veroeffentlicht ist, gibt es diese IDs nicht -
 * deshalb stehen hier leere Zeichenketten und der Bewerten-Knopf wird
 * ausgeblendet. Ein Knopf, der auf eine Fehlerseite fuehrt, ist schlimmer
 * als gar keiner.
 *
 * Nach der Veroeffentlichung hier eintragen:
 *   IOS_APP_ID      - die neunstellige Zahl aus der App-Store-URL
 *   ANDROID_PACKAGE - der Paketname aus app.json (android.package)
 */
export const IOS_APP_ID = '';
export const ANDROID_PACKAGE = '';

export const IOS_REVIEW_URL = IOS_APP_ID
  ? `https://apps.apple.com/app/id${IOS_APP_ID}?action=write-review`
  : null;

export const ANDROID_REVIEW_URL = ANDROID_PACKAGE
  ? `https://play.google.com/store/apps/details?id=${ANDROID_PACKAGE}`
  : null;

/** Text fuer das Teilen-Blatt. Funktioniert auch ohne Store-Links. */
export const SHARE_MESSAGE =
  'Ich koche mit „Mein Kochbuch" – alle Rezepte an einem Ort, Schritt für Schritt durch die Zubereitung. Schau es dir an!';
