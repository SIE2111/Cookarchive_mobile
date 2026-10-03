import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Alert, RefreshControl } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api } from '../api/client';

/**
 * Gemeldete Community-Rezepte prüfen - nur für Moderatoren (MODERATOR_EMAILS
 * am Server; im Profil nur sichtbar, wenn /pool/moderation/me "ja" sagt).
 * Bei jeder neuen Meldung kommt eine Mail an die Moderator-Adresse.
 */
interface Item { report_id: string; public_recipe_id: string; title: string; reason: string; reported_at: string }

export default function ModerationScreen() {
  const navigation = useNavigation<any>();
  const { colors, gradient, radius } = useTheme();
  const { t } = useUebersetzung();
  const [items, setItems] = useState<Item[] | null>(null);
  const laden = useCallback(() => { api.get<Item[]>('/pool/moderation/queue').then(setItems).catch(() => setItems([])); }, []);
  useFocusEffect(laden);

  function entscheiden(it: Item, action: 'ignore' | 'hide' | 'ban') {
    const frage = { ignore: t('moderation.frageIgnorieren'), hide: t('moderation.frageAusblenden'), ban: t('moderation.frageSperren') }[action];
    Alert.alert(t('moderation.entscheidung'), frage, [
      { text: t('allgemein.abbrechen'), style: 'cancel' },
      { text: t('moderation.bestaetigen'), style: action === 'ignore' ? 'default' : 'destructive',
        onPress: () => api.post(`/pool/moderation/${it.report_id}/resolve`, { action }).then(laden).catch(() => {}) },
    ]);
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 60 }}
      refreshControl={<RefreshControl refreshing={items === null} onRefresh={laden} tintColor={gradient[0]} />}>
      {items?.length === 0 && <Text style={{ color: colors.muted, textAlign: 'center', marginTop: 24 }}>{t('moderation.keine')}</Text>}
      {items?.map((it) => (
        <View key={it.report_id} style={{ backgroundColor: colors.card, borderRadius: radius.md, padding: 14, marginBottom: 10 }}>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{new Date(it.reported_at).toLocaleString()}</Text>
          <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700', marginTop: 2 }}>{it.title}</Text>
          <Text style={{ color: colors.text, fontSize: 13, marginTop: 4 }}>{t('moderation.grund')}: {it.reason}</Text>
          <Pressable onPress={() => navigation.navigate('PoolRecipeDetail', { publicRecipeId: it.public_recipe_id, title: it.title })} style={{ marginTop: 8 }}>
            <Text style={{ color: gradient[0], fontWeight: '600' }}>{t('moderation.rezeptAnsehen')}</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 }}>
            <Pressable onPress={() => entscheiden(it, 'ignore')}><Text style={{ color: colors.text }}>{t('moderation.unbegruendet')}</Text></Pressable>
            <Pressable onPress={() => entscheiden(it, 'hide')}><Text style={{ color: '#DC2626' }}>{t('moderation.ausblenden')}</Text></Pressable>
            <Pressable onPress={() => entscheiden(it, 'ban')}><Text style={{ color: '#DC2626' }}>{t('moderation.sperren')}</Text></Pressable>
          </View>
        </View>
      ))}
    </ScrollView>
  );
}
