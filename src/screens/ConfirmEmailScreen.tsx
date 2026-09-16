import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import { useAuth } from '../context/AuthContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'ConfirmEmail'>;

export default function ConfirmEmailScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const { colors, gradient, radius } = useTheme();
  const { resendConfirmationEmail } = useAuth();
  const [isResending, setIsResending] = useState(false);

  const handleResend = async () => {
    setIsResending(true);
    try {
      await resendConfirmationEmail(email);
      Alert.alert('Gesendet', 'Bestätigungs-E-Mail wurde erneut verschickt.');
    } catch (err) {
      // Supabase begrenzt, wie oft eine Bestaetigungs-Mail pro Zeitraum
      // verschickt werden darf - diese Fehlermeldung (z.B. "email rate
      // limit exceeded") wird hier 1:1 durchgereicht, damit klar ist,
      // dass es kein App-Fehler ist, sondern eine Wartezeit.
      const message = err instanceof Error ? err.message : 'Erneutes Senden fehlgeschlagen';
      Alert.alert('Erneutes Senden fehlgeschlagen', message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
        <Text style={styles.emoji}>📬</Text>
        <Text style={[styles.title, { color: colors.text }]}>Fast geschafft</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Wir haben eine Bestätigungs-E-Mail an{'\n'}
          <Text style={{ color: colors.text, fontWeight: '600' }}>{email}</Text>{'\n'}
          geschickt. Bitte den Link darin öffnen, dann kannst du dich anmelden.
        </Text>

        <Pressable onPress={handleResend} disabled={isResending} style={{ marginTop: 24 }}>
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, { borderRadius: radius.md }]}
          >
            {isResending ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>E-Mail erneut senden</Text>
            )}
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: 18 }}>
          <Text style={[styles.link, { color: colors.muted }]}>
            Schon bestätigt? <Text style={{ color: gradient[0], fontWeight: '600' }}>Jetzt anmelden</Text>
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  card: { marginHorizontal: 20, padding: 24, alignItems: 'center' },
  emoji: { fontSize: 40, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 10 },
  button: { height: 48, minWidth: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  link: { fontSize: 12.5, textAlign: 'center' },
});
