import { useWindowDimensions } from 'react-native';

/**
 * Obergrenze fuer die Breite von Inhalt.
 *
 * Auf einem iPad laeuft Text sonst ueber die volle Breite - bei 10 Zoll
 * sind das gut 120 Zeichen je Zeile. Beim Lesen verliert man die Zeile,
 * und genau das passiert in der Kueche mit nassen Haenden und einem Blick
 * aufs Geraet. 620 Punkte entsprechen etwa der Breite, die auch Buecher
 * und Zeitungen fuer eine Spalte waehlen.
 *
 * Auf dem Handy greift die Grenze nie: Dort ist der Bildschirm schmaler
 * als das Limit, die Zeile bleibt also unveraendert.
 */
export const MAX_INHALTSBREITE = 620;

/**
 * Ab dieser Breite behandeln wir das Geraet als Tablet. Der Wert liegt
 * ueber dem groessten Handy im Querformat, aber unter dem kleinsten iPad.
 */
const TABLET_AB = 700;

export function useLayout() {
  const { width } = useWindowDimensions();
  return {
    istTablet: width >= TABLET_AB,
    /**
     * Auf Container legen, die Text oder Karten enthalten:
     * `[styles.container, inhaltsBreite]`. Zentriert und begrenzt.
     */
    inhaltsBreite: {
      width: '100%' as const,
      maxWidth: MAX_INHALTSBREITE,
      alignSelf: 'center' as const,
    },
  };
}
