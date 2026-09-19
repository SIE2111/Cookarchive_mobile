import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../theme/ThemeContext';
import { SPRACHEN, Sprachwahl, spracheSetzen, useUebersetzung } from '../i18n';

const SPEICHER_SCHLUESSEL = 'meinkochbuch:sprache';

export default function LanguageSettingsScreen({ navigation }: any) {
  const { colors, radius, gradient } = useTheme();
  const { t } = useUebersetzung();
  const [wahl, setWahl] = useState<Sprachwahl>('system');

  useEffect(() => {
    AsyncStorage.getItem(SPEICHER_SCHLUESSEL)
      .then((gespeichert) => setWahl((gespeichert as Sprachwahl) ?? 'system'))
      .catch(() => setWahl('system'));
  }, []);

  const waehlen = async (neu: Sprachwahl) => {
    setWahl(neu);
    await spracheSetzen(neu);
  };

  const zeile = (schluessel: Sprachwahl, titel: string, untertitel?: string) => (
    <Pressable
      key={schluessel}
      onPress={() => waehlen(schluessel)}
      style={[
        styles.row,
        {
          backgroundColor: colors.card,
          borderRadius: radius.md,
          borderWidth: wahl === schluessel ? 1.5 : 0,
          borderColor: gradient[0],
        },
      ]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowTitle, { color: colors.text }]}>{titel}</Text>
        {untertitel ? (
          <Text style={[styles.rowSub, { color: colors.muted }]}>{untertitel}</Text>
        ) : null}
      </View>
      {wahl === schluessel && <Text style={{ color: gradient[0], fontSize: 18 }}>✓</Text>}
    </Pressable>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {navigation.canGoBack() && (
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={{ marginBottom: 10 }}>
            <Text style={{ color: gradient[0], fontSize: 14, fontWeight: '600' }}>
              ‹ {t('allgemein.zurueck')}
            </Text>
          </Pressable>
        )}

        <Text style={[styles.title, { color: colors.text }]}>{t('sprache.titel')}</Text>

        {zeile('system', t('sprache.system'))}
        {SPRACHEN.map((s) => zeile(s.code, s.eigenname))}

        <Text style={[styles.hinweis, { color: colors.muted }]}>{t('sprache.hinweis')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 16 },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, marginBottom: 8, minHeight: 56 },
  rowTitle: { fontSize: 15.5, fontWeight: '600' },
  rowSub: { fontSize: 12.5, marginTop: 2 },
  hinweis: { fontSize: 12.5, lineHeight: 17, marginTop: 14 },
});
