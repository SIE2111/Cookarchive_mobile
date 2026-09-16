import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert, Linking } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'Register'>;

const AGB_URL = 'https://www.homearchive.at/meinkochbuch/agb';

export default function RegisterScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { signUpWithPassword } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agbAccepted, setAgbAccepted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleRegister = async () => {
    if (!email || !password) {
      Alert.alert('Fehlt noch was', 'Bitte E-Mail und Passwort eingeben.');
      return;
    }
    if (!agbAccepted) {
      Alert.alert('AGB erforderlich', 'Bitte AGB und Datenschutzerklärung akzeptieren.');
      return;
    }
    setIsSubmitting(true);
    try {
      const { needsEmailConfirmation } = await signUpWithPassword(email, password);
      if (needsEmailConfirmation) {
        navigation.navigate('ConfirmEmail', { email });
      }
      // Falls keine Bestaetigung noetig war, wechselt der AppNavigator
      // automatisch zum Onboarding, sobald die Session gesetzt ist -
      // hier ist dann nichts weiter zu tun.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Registrierung fehlgeschlagen';
      Alert.alert('Registrierung fehlgeschlagen', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
        <Text style={[styles.title, { color: colors.text }]}>Konto erstellen</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>Dauert nur eine Minute</Text>

        <Text style={[styles.label, { color: colors.muted }]}>Name</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
          placeholder="Markus"
          placeholderTextColor={colors.muted}
          value={name}
          onChangeText={setName}
        />

        <Text style={[styles.label, { color: colors.muted }]}>E-Mail</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
          placeholder="deine@email.at"
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={[styles.label, { color: colors.muted }]}>Passwort</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
          placeholder="••••••••••"
          placeholderTextColor={colors.muted}
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />

        <Pressable
          onPress={() => setAgbAccepted((prev) => !prev)}
          style={styles.checkboxRow}
        >
          <View
            style={[
              styles.checkbox,
              { borderRadius: radius.sm, backgroundColor: agbAccepted ? gradient[0] : 'transparent', borderColor: gradient[0] },
            ]}
          >
            {agbAccepted && <Text style={styles.checkboxMark}>✓</Text>}
          </View>
          <Text style={[styles.checkboxLabel, { color: colors.muted }]}>
            Ich akzeptiere die{' '}
            <Text style={{ color: gradient[0], fontWeight: '600' }} onPress={() => Linking.openURL(AGB_URL)}>
              AGB
            </Text>{' '}
            und Datenschutzerklärung
          </Text>
        </Pressable>

        <Pressable onPress={handleRegister} disabled={isSubmitting} style={{ marginTop: 12 }}>
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, { borderRadius: radius.md }]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Konto erstellen</Text>
            )}
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: 18 }}>
          <Text style={[styles.link, { color: colors.muted }]}>
            Schon ein Konto? <Text style={{ color: gradient[0], fontWeight: '600' }}>Anmelden</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  card: { marginHorizontal: 20, padding: 24 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 12, textAlign: 'center', marginBottom: 22 },
  label: { fontSize: 11, fontWeight: '500', marginBottom: 6, marginTop: 10 },
  input: { height: 44, paddingHorizontal: 14, fontSize: 14 },
  checkboxRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16, gap: 9 },
  checkbox: { width: 16, height: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  checkboxMark: { color: '#fff', fontSize: 11, fontWeight: '700' },
  checkboxLabel: { fontSize: 11, lineHeight: 16, flex: 1 },
  button: { height: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  link: { fontSize: 12.5, textAlign: 'center' },
});
