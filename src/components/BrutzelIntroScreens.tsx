import React, { useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView, NativeSyntheticEvent, NativeScrollEvent, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { useLayout } from '../utils/layout';
import BrutzelAvatar from './BrutzelAvatar';
import MarkenZeile from './MarkenZeile';

interface Props {
  onFertig: () => void;
}

// Vier Karten statt mehr: eine wirklich KURZE Einfuehrung soll die
// zentralen Bereiche der App nennen, keine vollstaendige Tour. Wer mehr
// wissen will, findet Details in der Hilfe. Reihenfolge folgt der
// Tab-Leiste (Rezepte, Pool, Einkauf) und endet mit dem Koch-Modus als
// eigentlichem Kern der App.
const KARTEN = [
  { titel: 'sonstiges.introRezepteTitel', text: 'sonstiges.introRezepteText' },
  { titel: 'sonstiges.introKochenTitel', text: 'sonstiges.introKochenText' },
  { titel: 'sonstiges.introEinkaufTitel', text: 'sonstiges.introEinkaufText' },
  { titel: 'sonstiges.introHaushaltTitel', text: 'sonstiges.introHaushaltText' },
];

/**
 * Brutzels kurze Einfuehrung direkt nach der Registrierung (22.09.2026) -
 * eigener Schritt VOR dem bestehenden Einrichtungsbildschirm
 * (OnboardingScreen), nicht Teil der taeglichen Begruessung
 * (BrutzelGreetingOverlay), die bei jedem App-Start kommt und nur "Was
 * moechtest du heute kochen?" fragt. Wird durch den Aufruf von onFertig
 * aus dem Navigationsfluss entfernt und daher, wie der Rest des
 * Registrierungsablaufs, nur genau einmal gezeigt.
 */
export default function BrutzelIntroScreens({ onFertig }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { inhaltsBreite } = useLayout();
  const { t } = useUebersetzung();
  const { width } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const [seite, setSeite] = useState(0);
  const istLetzte = seite === KARTEN.length - 1;

  const gehZu = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * width, animated: true });
    setSeite(index);
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setSeite(Math.round(e.nativeEvent.contentOffset.x / width));
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.bg }]} edges={['top', 'bottom']}>
      <MarkenZeile style={styles.markenZeile} />

      <Pressable onPress={onFertig} hitSlop={10} style={styles.ueberspringen}>
        <Text style={{ color: colors.muted, fontSize: 13, fontWeight: '600' }}>{t('sonstiges.introUeberspringen')}</Text>
      </Pressable>

      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScrollEnd}
        style={{ flexGrow: 0 }}
      >
        {KARTEN.map((karte, i) => (
          <View key={i} style={[styles.karte, { width }]}>
            <View style={inhaltsBreite}>
              <BrutzelAvatar size={104} variant="full" />
              <Text style={[styles.titel, { color: colors.text }]}>{t(karte.titel)}</Text>
              <Text style={[styles.text, { color: colors.muted }]}>{t(karte.text)}</Text>
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.punkte}>
        {KARTEN.map((_, i) => (
          <Pressable key={i} onPress={() => gehZu(i)} hitSlop={8}>
            <View
              style={[
                styles.punkt,
                { backgroundColor: i === seite ? gradient[0] : colors.card, width: i === seite ? 18 : 7 },
              ]}
            />
          </Pressable>
        ))}
      </View>

      <View style={[styles.knopfReihe, inhaltsBreite]}>
        <Pressable
          onPress={() => (istLetzte ? onFertig() : gehZu(seite + 1))}
          style={[styles.weiterKnopf, { backgroundColor: gradient[0], borderRadius: radius.md }]}
        >
          <Text style={styles.weiterText}>{istLetzte ? t('sonstiges.introLosGehts') : t('allgemein.weiter')}</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  markenZeile: { alignSelf: 'center', marginTop: 8 },
  ueberspringen: { position: 'absolute', top: 14, right: 20, zIndex: 10, padding: 6 },
  karte: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
  titel: { fontSize: 21, fontWeight: '700', textAlign: 'center', marginTop: 18, marginBottom: 10 },
  text: { fontSize: 14.5, lineHeight: 21, textAlign: 'center' },
  punkte: { flexDirection: 'row', justifyContent: 'center', gap: 6, marginTop: 4, marginBottom: 18 },
  punkt: { height: 7, borderRadius: 4 },
  knopfReihe: { paddingHorizontal: 24, paddingBottom: 20 },
  weiterKnopf: { height: 50, alignItems: 'center', justifyContent: 'center' },
  weiterText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
