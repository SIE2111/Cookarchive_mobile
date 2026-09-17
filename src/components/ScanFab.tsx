import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../theme/ThemeContext';
import type { MainStackParamList } from '../navigation/AppNavigator';

/**
 * Der schwebende Erfassen-Knopf, der auf allen Hauptscreens gleich
 * aussieht und gleich funktioniert: oeffnet das RecipeSourceMenu
 * (selbst erstellen / Foto / Web-Import / KI / Pool).
 *
 * Als eigene Komponente, nicht viermal kopiert - er sitzt jetzt auf
 * Dashboard, Rezepten, Einkaufsliste und Community-Pool. Bei vier Kopien
 * waere die naechste Aenderung an Position oder Ziel garantiert an einer
 * Stelle vergessen worden.
 *
 * Er ersetzt zugleich den bisherigen Scan-Tab in der unteren Leiste: Der
 * Tab hatte nie einen eigenen Inhalt, sondern oeffnete nur dieses Menue -
 * ein Tab, der kein Ziel ist, sondern eine Aktion. Als schwebender Knopf
 * ist genau das ehrlicher, und der Platz in der Leiste wird fuer den
 * Community-Pool frei.
 */
export default function ScanFab({ bottom = 18 }: { bottom?: number }) {
  const { gradient } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Rezept erfassen"
      onPress={() => navigation.navigate('RecipeSourceMenu')}
      style={[styles.fab, { backgroundColor: gradient[0], bottom }]}
    >
      <View style={styles.iconStack}>
        <MaterialCommunityIcons name="camera-plus-outline" size={24} color="#fff" />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 18,
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  iconStack: { alignItems: 'center', justifyContent: 'center' },
});
