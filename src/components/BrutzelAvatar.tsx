import React from 'react';
import { Image, StyleSheet } from 'react-native';

interface Props {
  size?: number;
}

/**
 * Brutzels Kopf - echtes Illustrations-Asset (assets/brutzel-avatar.png,
 * aus der finalen Maskottchen-Grafik zugeschnitten), ersetzt die fruehere
 * programmatische SVG-Annaeherung. Nur der Kopf, keine Vollfigur - passend
 * fuer kleine Kontext-Hinweise wie Kochtipps im Koch-Modus (siehe Regel
 * "Vollfigur nur bei grossen Momenten").
 */
export default function BrutzelAvatar({ size = 28 }: Props) {
  return (
    <Image
      source={require('../../assets/brutzel-avatar.png')}
      style={[styles.image, { width: size, height: size, borderRadius: size / 2 }]}
      resizeMode="cover"
    />
  );
}

const styles = StyleSheet.create({
  image: {
    backgroundColor: '#FFFFFF',
  },
});
