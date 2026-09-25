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
 * Fuer zweispaltige Ansichten - der Koch-Modus zeigt Zutaten und Schritt
 * nebeneinander und braucht dafuer mehr als eine Lesespalte.
 */
export const MAX_BREITE_ZWEISPALTIG = 980;

/**
 * Ab dieser Breite behandeln wir das Geraet als Tablet. Der Wert liegt
 * ueber dem groessten Handy im Querformat, aber unter dem kleinsten iPad.
 */
// Exportiert, damit App.tsx (Android-Ausrichtungssperre) dieselbe
// Schwelle verwendet statt eine zweite Zahl zu pflegen, die
// auseinanderlaufen koennte.
export const TABLET_AB = 700;

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const istTablet = width >= TABLET_AB;
  // Handys sind auf Hochformat fixiert (siehe app.json) und erreichen
  // TABLET_AB nie - quer/hoch unterscheiden also ausschliesslich
  // zwischen den beiden iPad-Ausrichtungen, nicht zwischen Handy/Tablet.
  const quer = istTablet && width > height;
  const hoch = istTablet && !quer;
  return {
    istTablet,
    quer,
    hoch,
    /**
     * Kachelbreite fuer ein Raster mit `spalten` Spalten in einem Bereich
     * von `breite` Punkten: (Breite - 2*Rand - (Spalten-1)*Abstand) / Spalten.
     * `rand` und `abstand` folgen den ueblichen Werten aus dem jeweiligen
     * Bildschirm-Layout, als Parameter statt fest verdrahtet.
     */
    kachelbreite: (breite: number, spalten: number, rand: number, abstand: number) =>
      (breite - 2 * rand - (spalten - 1) * abstand) / spalten,
    /**
     * Auf Container legen, die Text oder Karten enthalten:
     * `[styles.container, inhaltsBreite]`. Zentriert und begrenzt.
     */
    inhaltsBreite: {
      width: '100%' as const,
      maxWidth: MAX_INHALTSBREITE,
      alignSelf: 'center' as const,
    },
    inhaltsBreiteZweispaltig: {
      width: '100%' as const,
      maxWidth: width >= TABLET_AB ? MAX_BREITE_ZWEISPALTIG : MAX_INHALTSBREITE,
      alignSelf: 'center' as const,
    },
  };
}
