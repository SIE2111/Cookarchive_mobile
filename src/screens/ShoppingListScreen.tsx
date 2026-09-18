import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, SectionList, Pressable, StyleSheet, ActivityIndicator, TextInput, Alert, Keyboard } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeContext';
import * as Sharing from 'expo-sharing';
import ScanFab from '../components/ScanFab';
import { api, ApiError } from '../api/client';
import type { CompositeScreenProps } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { MainTabParamList, MainStackParamList } from '../navigation/AppNavigator';

type Props = CompositeScreenProps<
  BottomTabScreenProps<MainTabParamList, 'Einkauf'>,
  NativeStackScreenProps<MainStackParamList>
>;

interface ShoppingItem {
  id: string;
  ingredient_name: string;
  amount: number | null;
  unit: string | null;
  category: string | null;
  checked: boolean;
  source_recipe_id: string | null;
}

export default function ShoppingListScreen({}: Props) {
  const { colors, gradient, radius } = useTheme();
  const [sections, setSections] = useState<{ title: string; data: ShoppingItem[] }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newItemName, setNewItemName] = useState('');
  const [newItemAmount, setNewItemAmount] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await api.get<{ categories: Record<string, ShoppingItem[]> }>('/shopping-list/');
      const list = Object.entries(data.categories)
        .map(([title, items]) => ({ title, data: items }))
        .sort((a, b) => a.title.localeCompare(b.title));
      setSections(list);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.detail : 'Einkaufszettel konnte nicht geladen werden');
    }
  }, []);

  useEffect(() => {
    load().finally(() => setIsLoading(false));
  }, [load]);

  // Bei jeder Rueckkehr auf diesen Tab neu laden.
  //
  // Das war der Grund, warum die Einkaufsliste nach "Zutaten der Woche zur
  // Einkaufsliste" leer blieb, obwohl die Eintraege in der Datenbank
  // standen: Tab-Bildschirme bleiben geladen. Der useEffect oben laeuft
  // nur EINMAL, beim ersten Anzeigen - wer den Einkauf-Tab vorher schon
  // offen hatte, sah danach unveraendert den alten, leeren Stand.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const [isExporting, setIsExporting] = useState(false);
  const [isMailing, setIsMailing] = useState(false);

  // Drucken laeuft ueber PDF + Teilen-Blatt, nicht ueber ein eigenes
  // Druck-Paket: Dasselbe Verfahren wie beim Rezept-PDF, und aus dem
  // Teilen-Blatt heraus erreicht man den Drucker, AirDrop, Notizen und
  // alles andere - ein reiner Druckdialog koennte weniger.
  const handlePrint = async () => {
    setIsExporting(true);
    try {
      const localUri = await api.downloadFile('/shopping-list/pdf', 'einkaufsliste.pdf');
      if (!(await Sharing.isAvailableAsync())) {
        Alert.alert('Nicht verfügbar', 'Teilen und Drucken wird auf diesem Gerät nicht unterstützt.');
        return;
      }
      await Sharing.shareAsync(localUri, { mimeType: 'application/pdf', dialogTitle: 'Einkaufsliste' });
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Das PDF konnte nicht erstellt werden.');
    } finally {
      setIsExporting(false);
    }
  };

  const handleMail = () => {
    Alert.alert(
      'Einkaufsliste verschicken',
      'An deine eigene E-Mail-Adresse senden? Erledigte Posten bleiben weg.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Senden',
          onPress: async () => {
            setIsMailing(true);
            try {
              await api.post('/shopping-list/email', {});
              Alert.alert('Verschickt', 'Die Einkaufsliste ist unterwegs.');
            } catch (err) {
              Alert.alert('Nicht verschickt', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
            } finally {
              setIsMailing(false);
            }
          },
        },
      ],
    );
  };

  const handleToggle = async (item: ShoppingItem) => {
    // Optimistisch umschalten, damit es sich sofort reaktionsschnell anfuehlt
    setSections((prev) =>
      prev.map((s) => ({ ...s, data: s.data.map((i) => (i.id === item.id ? { ...i, checked: !i.checked } : i)) })),
    );
    try {
      await api.patch(`/shopping-list/${item.id}/toggle`);
    } catch (err) {
      // 404 bedeutet meist nur eine harmlose Race Condition (z.B. der
      // Eintrag wurde kurz zuvor per Long-Press geloescht, bevor die Liste
      // neu geladen war) - dann reicht stilles Neuladen, kein Alert noetig.
      if (err instanceof ApiError && err.status === 404) {
        load();
        return;
      }
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Konnte nicht aktualisiert werden');
      load();
    }
  };

  const handleDelete = async (item: ShoppingItem) => {
    setSections((prev) => prev.map((s) => ({ ...s, data: s.data.filter((i) => i.id !== item.id) })));
    try {
      await api.delete(`/shopping-list/${item.id}`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        load();
        return;
      }
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Konnte nicht gelöscht werden');
      load();
    }
  };

  const handleClearChecked = async () => {
    try {
      await api.delete('/shopping-list/checked');
      load();
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Konnte nicht geleert werden');
    }
  };

  const handleClearAll = () => {
    Alert.alert('Ganze Liste löschen?', 'Alle Einträge werden entfernt, auch nicht abgehakte.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete('/shopping-list/all');
            load();
          } catch (err) {
            Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Konnte nicht gelöscht werden');
          }
        },
      },
    ]);
  };

  const handleAddManual = async () => {
    const name = newItemName.trim();
    if (!name) return;
    Keyboard.dismiss();
    setIsAdding(true);
    try {
      await api.post('/shopping-list/manual', {
        ingredient_name: name,
        amount: newItemAmount.trim() ? Number(newItemAmount.trim()) : null,
        unit: newItemUnit.trim() || null,
      });
      setNewItemName('');
      setNewItemAmount('');
      setNewItemUnit('');
      await load();
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Konnte nicht hinzugefügt werden');
    } finally {
      setIsAdding(false);
    }
  };

  const hasCheckedItems = sections.some((s) => s.data.some((i) => i.checked));
  const hasAnyItems = sections.some((s) => s.data.length > 0);

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      {error && <Text style={[styles.errorText, { color: '#DC2626' }]}>{error}</Text>}

      <View style={styles.addRow}>
        <TextInput
          value={newItemName}
          onChangeText={setNewItemName}
          placeholder="Zutat manuell hinzufügen…"
          placeholderTextColor={colors.muted}
          onSubmitEditing={handleAddManual}
          style={[styles.addInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
        />
        <TextInput
          value={newItemAmount}
          onChangeText={setNewItemAmount}
          placeholder="Menge"
          placeholderTextColor={colors.muted}
          keyboardType="numeric"
          onSubmitEditing={handleAddManual}
          style={[styles.addAmountInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
        />
        <TextInput
          value={newItemUnit}
          onChangeText={setNewItemUnit}
          placeholder="Einh."
          placeholderTextColor={colors.muted}
          onSubmitEditing={handleAddManual}
          style={[styles.addUnitInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
        />
        <Pressable
          onPress={handleAddManual}
          disabled={isAdding || !newItemName.trim()}
          style={[styles.addButton, { backgroundColor: gradient[0], borderRadius: radius.md, opacity: isAdding ? 0.6 : 1 }]}
        >
          <MaterialCommunityIcons name="plus" size={20} color="#fff" />
        </Pressable>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: 40 }}
        ListEmptyComponent={
          !error ? (
            <Text style={[styles.emptyText, { color: colors.muted }]}>
              Einkaufszettel ist leer – füg Zutaten über ein Rezept oder manuell hinzu.
            </Text>
          ) : null
        }
        renderSectionHeader={({ section }) => (
          <Text style={[styles.sectionHeader, { color: colors.muted }]}>{section.title.toUpperCase()}</Text>
        )}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => handleToggle(item)}
            onLongPress={() => handleDelete(item)}
            style={[styles.itemRow, { backgroundColor: colors.card, borderRadius: radius.sm }]}
          >
            <MaterialCommunityIcons
              name={item.checked ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
              size={22}
              color={item.checked ? gradient[0] : colors.muted}
            />
            <Text
              style={[
                styles.itemText,
                { color: item.checked ? colors.muted : colors.text },
                item.checked && styles.itemTextChecked,
              ]}
            >
              {item.ingredient_name}
              {item.amount ? `  ·  ${item.amount}${item.unit ?? ''}` : ''}
            </Text>
          </Pressable>
        )}
      />

      {hasAnyItems && (
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 4 }}>
          <Pressable
            onPress={handlePrint}
            disabled={isExporting}
            style={[styles.clearButton, { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' }]}
          >
            {isExporting ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : (
              <MaterialCommunityIcons name="printer-outline" size={15} color={gradient[0]} />
            )}
            <Text style={[styles.clearButtonText, { color: gradient[0] }]}>Drucken / PDF</Text>
          </Pressable>
          <Pressable
            onPress={handleMail}
            disabled={isMailing}
            style={[styles.clearButton, { flex: 1, flexDirection: 'row', gap: 6, justifyContent: 'center' }]}
          >
            {isMailing ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : (
              <MaterialCommunityIcons name="email-outline" size={15} color={gradient[0]} />
            )}
            <Text style={[styles.clearButtonText, { color: gradient[0] }]}>Per Mail</Text>
          </Pressable>
        </View>
      )}

      {(hasCheckedItems || hasAnyItems) && (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          {hasCheckedItems && (
            <Pressable onPress={handleClearChecked} style={[styles.clearButton, { flex: 1 }]}>
              <Text style={[styles.clearButtonText, { color: colors.muted }]}>Abgehakte entfernen</Text>
            </Pressable>
          )}
          {hasAnyItems && (
            <Pressable onPress={handleClearAll} style={[styles.clearButton, { flex: 1 }]}>
              <Text style={[styles.clearButtonText, { color: '#DC2626' }]}>Liste leeren</Text>
            </Pressable>
          )}
        </View>
      )}
      <ScanFab />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 18, paddingTop: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorText: { fontSize: 12, marginBottom: 12 },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  addInput: { flex: 1, height: 44, paddingHorizontal: 14, fontSize: 13.5 },
  addAmountInput: { width: 56, height: 44, paddingHorizontal: 8, fontSize: 13.5, textAlign: 'center' },
  addUnitInput: { width: 52, height: 44, paddingHorizontal: 8, fontSize: 13.5, textAlign: 'center' },
  addButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  sectionHeader: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, marginTop: 14, marginBottom: 8 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 6 },
  itemText: { fontSize: 13.5, flex: 1 },
  itemTextChecked: { textDecorationLine: 'line-through' },
  emptyText: { fontSize: 13, textAlign: 'center', marginTop: 40, lineHeight: 20 },
  clearButton: { alignItems: 'center', paddingVertical: 14 },
  clearButtonText: { fontSize: 12, fontWeight: '600' },
});
