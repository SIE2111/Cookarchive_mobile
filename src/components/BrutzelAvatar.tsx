import React from 'react';
import { Image, StyleSheet } from 'react-native';

interface Props {
  size?: number;
  // 'head': kleiner, runder Kopf-Ausschnitt (Standard, fuer knappe
  // Kontext-Hinweise). 'full': ganze Figur, nicht rund zugeschnitten - fuer
  // den Kochtipp im Koch-Modus, der jetzt bewusst prominenter/groesser
  // gezeigt wird statt nur des kleinen Kopfes.
  variant?: 'head' | 'full';
}

// Breite/Hoehe von assets/brutzel-full.png. Muss zum tatsaechlichen Bild
// passen - stimmt das Verhaeltnis nicht, entsteht leerer Rand neben dem
// Bild. Seit der neuen Zeichnung ist es ein quadratisches Abzeichen.
const FULL_ASPECT_RATIO = 1;

/**
 * Brutzel - echte Illustrations-Assets (assets/brutzel-avatar.png fuer den
 * Kopf, assets/brutzel-full.png fuer die ganze Figur), ersetzen die
 * fruehere programmatische SVG-Annaeherung.
 */
export default function BrutzelAvatar({ size = 44, variant = 'head' }: Props) {
  if (variant === 'full') {
    const height = size;
    const width = Math.round(height * FULL_ASPECT_RATIO);
    return (
      <Image
        source={require('../../assets/brutzel-full.png')}
        style={{ width, height }}
        resizeMode="contain"
      />
    );
  }
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
