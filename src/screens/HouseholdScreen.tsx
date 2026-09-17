import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert, Share } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';

interface Member {
  user_id: string;
  display_name: string;
  role: 'owner' | 'member';
  joined_at: string;
}

interface Household {
  id: string;
  name: string;
  created_by: string;
  members: Member[];
}

export default function HouseholdScreen() {
  const { colors, gradient, radius } = useTheme();
  const [household, setHousehold] = useState<Household | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const [newHouseholdName, setNewHouseholdName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  const loadHousehold = () => {
    api
      .get<Household | null>('/households/me')
      .then(setHousehold)
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Haushalt konnte nicht geladen werden'));
  };

  useEffect(() => {
    loadHousehold();
  }, []);

  const handleCreate = async () => {
    if (!newHouseholdName.trim()) return;
    setIsBusy(true);
    try {
      const created = await api.post<Household>('/households/', { name: newHouseholdName.trim() });
      setHousehold(created);
      setNewHouseholdName('');
    } catch (err) {
      Alert.alert('Anlegen fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsBusy(false);
    }
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setIsBusy(true);
    try {
      const joined = await api.post<Household>('/households/join', { code: joinCode.trim().toUpperCase() });
      setHousehold(joined);
      setJoinCode('');
    } catch (err) {
      Alert.alert('Beitreten fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsBusy(false);
    }
  };

  const handleInvite = async () => {
    setIsBusy(true);
    try {
      const invite = await api.post<{ code: string; expires_at: string }>('/households/invite');
      setInviteCode(invite.code);
    } catch (err) {
      Alert.alert('Einladung fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
    } finally {
      setIsBusy(false);
    }
  };

  const handleShareInvite = () => {
    if (!inviteCode) return;
    Share.share({
      message: `Komm in meinen Kochbuch-Haushalt "${household?.name}"! Gib in der App unter Profil → Haushalt diesen Code ein: ${inviteCode} (24 Std. gültig)`,
    }).catch(() => {
      // Teilen abgebrochen/fehlgeschlagen - kein Alert noetig, der Code steht ja weiterhin sichtbar da
    });
  };

  const handleLeave = () => {
    Alert.alert('Haushalt verlassen?', 'Geteilte Rezepte bleiben in deiner eigenen Sammlung, aber nicht mehr für die anderen sichtbar.', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Verlassen',
        style: 'destructive',
        onPress: async () => {
          setIsBusy(true);
          try {
            await api.delete('/households/leave');
            setHousehold(null);
            setInviteCode(null);
          } catch (err) {
            Alert.alert('Fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
          } finally {
            setIsBusy(false);
          }
        },
      },
    ]);
  };

  const handleRemoveMember = (memberUserId: string) => {
    Alert.alert('Mitglied entfernen?', undefined, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Entfernen',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/households/members/${memberUserId}`);
            loadHousehold();
          } catch (err) {
            Alert.alert('Fehlgeschlagen', err instanceof ApiError ? err.detail : 'Unbekannter Fehler');
          }
        },
      },
    ]);
  };

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <Text style={{ color: '#DC2626', fontSize: 13 }}>{error}</Text>
      </View>
    );
  }

  if (household === undefined) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  if (household === null) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg }]}>
        <Text style={[styles.sectionLabel, { color: colors.muted }]}>HAUSHALT ANLEGEN</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
          placeholder="z.B. Familie Müller"
          placeholderTextColor={colors.muted}
          value={newHouseholdName}
          onChangeText={setNewHouseholdName}
        />
        <Pressable onPress={handleCreate} disabled={isBusy} style={[styles.primaryButton, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
          <Text style={styles.primaryButtonText}>Haushalt anlegen</Text>
        </Pressable>

        <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 28 }]}>ODER BEITRETEN</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
          placeholder="6-stelliger Einladungscode"
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          value={joinCode}
          onChangeText={setJoinCode}
        />
        <Pressable onPress={handleJoin} disabled={isBusy} style={[styles.secondaryButton, { borderColor: gradient[0], borderRadius: radius.md }]}>
          <Text style={[styles.secondaryButtonText, { color: gradient[0] }]}>Beitreten</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <Text style={[styles.householdName, { color: colors.text }]}>{household.name}</Text>
      <Text style={[styles.sectionLabel, { color: colors.muted, marginTop: 20 }]}>MITGLIEDER</Text>
      {household.members.map((member) => (
        <View key={member.user_id} style={[styles.memberRow, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <Text style={[styles.memberText, { color: colors.text }]} numberOfLines={1}>
            {member.display_name}
          </Text>
          <Text style={[styles.roleTag, { color: colors.muted }]}>{member.role === 'owner' ? 'Owner' : 'Mitglied'}</Text>
          {member.role !== 'owner' && (
            <Pressable onPress={() => handleRemoveMember(member.user_id)} hitSlop={8}>
              <Text style={{ color: '#DC2626', fontSize: 12 }}>Entfernen</Text>
            </Pressable>
          )}
        </View>
      ))}

      <Pressable onPress={handleInvite} disabled={isBusy} style={[styles.secondaryButton, { borderColor: gradient[0], borderRadius: radius.md, marginTop: 16 }]}>
        <Text style={[styles.secondaryButtonText, { color: gradient[0] }]}>Mitglied einladen</Text>
      </Pressable>

      {inviteCode && (
        <View style={[styles.inviteCodeBox, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <Text style={[styles.inviteCodeLabel, { color: colors.muted }]}>Einladungscode (24 Std. gültig)</Text>
          <Text style={[styles.inviteCodeValue, { color: gradient[0] }]}>{inviteCode}</Text>
          <Pressable onPress={handleShareInvite} style={[styles.shareInviteButton, { borderColor: gradient[0], borderRadius: radius.sm }]}>
            <Text style={{ color: gradient[0], fontSize: 12.5, fontWeight: '700' }}>Code teilen</Text>
          </Pressable>
        </View>
      )}

      <Pressable onPress={handleLeave} style={[styles.leaveButton, { borderColor: '#DC2626', borderRadius: radius.md }]}>
        <Text style={styles.leaveButtonText}>Haushalt verlassen</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  input: { height: 44, paddingHorizontal: 14, fontSize: 13.5, marginBottom: 10 },
  primaryButton: { height: 46, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#fff', fontWeight: '700', fontSize: 13.5 },
  secondaryButton: { height: 44, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { fontWeight: '700', fontSize: 13 },
  householdName: { fontSize: 18, fontWeight: '700' },
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, marginBottom: 7 },
  memberText: { flex: 1, fontSize: 11.5 },
  roleTag: { fontSize: 10.5, fontWeight: '600' },
  inviteCodeBox: { padding: 16, alignItems: 'center', marginTop: 12 },
  inviteCodeLabel: { fontSize: 10, marginBottom: 6 },
  inviteCodeValue: { fontSize: 24, fontWeight: '700', letterSpacing: 3 },
  shareInviteButton: { marginTop: 10, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1.3 },
  leaveButton: { height: 44, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 'auto' },
  leaveButtonText: { color: '#DC2626', fontWeight: '600', fontSize: 13 },
});
