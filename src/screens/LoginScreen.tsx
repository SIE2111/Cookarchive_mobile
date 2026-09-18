import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import DismissKeyboardView from '../components/DismissKeyboardView';
import { useAuth } from '../context/AuthContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Fehlt noch was', 'Bitte E-Mail und Passwort eingeben.');
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithPassword(email, password);
      // Navigation zur App uebernimmt der Root-Navigator automatisch,
      // sobald AuthContext eine gueltige Session meldet.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login fehlgeschlagen';
      Alert.alert('Anmeldung fehlgeschlagen', message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DismissKeyboardView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
        <Text style={[styles.title, { color: colors.text }]}>Mein Kochbuch</Text>

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

        <Pressable onPress={handleLogin} disabled={isSubmitting} style={{ marginTop: 8 }}>
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, { borderRadius: radius.md }]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Anmelden</Text>
            )}
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Register')} style={{ marginTop: 20 }}>
          <Text style={[styles.link, { color: colors.muted }]}>
            Noch kein Konto? <Text style={{ color: gradient[0], fontWeight: '600' }}>Registrieren</Text>
          </Text>
        </Pressable>
      </View>
    </DismissKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  card: { marginHorizontal: 20, padding: 24 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 28 },
  label: { fontSize: 11, fontWeight: '500', marginBottom: 6, marginTop: 12 },
  input: { height: 46, paddingHorizontal: 14, fontSize: 14 },
  button: { height: 48, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  link: { fontSize: 12.5, textAlign: 'center' },
});
