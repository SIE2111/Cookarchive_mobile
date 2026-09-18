import React, { useRef, useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';
import DismissKeyboardView from '../components/DismissKeyboardView';
import { useAuth } from '../context/AuthContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'ConfirmEmail'>;

const CODE_LENGTH = 4;

/**
 * Code-Eingabe statt Bestaetigungslink. Der Nutzer tippt die 4 Ziffern
 * aus der Mail ab; stimmt der Code, wird er sofort eingeloggt und landet
 * im Onboarding - kein Wechsel in den Browser, kein Deep Link zurueck.
 *
 * Die vier Kaestchen sind reine Anzeige: dahinter liegt EIN unsichtbares
 * TextInput ueber der ganzen Reihe. Vier echte Eingabefelder mit
 * Fokus-Weiterreichen sehen gleich aus, brechen aber regelmaessig beim
 * Loeschen und beim Einfuegen aus der Zwischenablage.
 */
export default function ConfirmEmailScreen({ navigation, route }: Props) {
  const { email } = route.params;
  const { colors, gradient, radius } = useTheme();
  const { verifyCode, resendCode } = useAuth();
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const inputRef = useRef<TextInput>(null);

  const submit = async (value: string) => {
    if (value.length !== CODE_LENGTH || isSubmitting) return;
    setIsSubmitting(true);
    try {
      await verifyCode(email, value);
      // Ab hier uebernimmt der AppNavigator: sobald die Session steht,
      // wird auf den Haupt-Stack (Onboarding) umgeschaltet.
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bestätigung fehlgeschlagen';
      if (message === 'BESTAETIGT_BITTE_ANMELDEN') {
        Alert.alert(
          'Konto bestätigt',
          'Dein Konto ist freigeschaltet. Bitte melde dich jetzt mit deinem Passwort an.',
          [{ text: 'Zur Anmeldung', onPress: () => navigation.navigate('Login') }],
        );
      } else {
        Alert.alert('Bestätigung fehlgeschlagen', message);
        setCode('');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (value: string) => {
    // Nur Ziffern zulassen - verhindert, dass ueber die Zwischenablage
    // Leerzeichen oder Buchstaben in den Code geraten.
    const digits = value.replace(/[^0-9]/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) {
      submit(digits);
    }
  };

  const handleResend = async () => {
    setIsResending(true);
    try {
      await resendCode(email);
      setCode('');
      Alert.alert('Gesendet', 'Ein neuer Code ist unterwegs. Der alte gilt nicht mehr.');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erneutes Senden fehlgeschlagen';
      Alert.alert('Erneutes Senden fehlgeschlagen', message);
    } finally {
      setIsResending(false);
    }
  };

  return (
    <DismissKeyboardView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
        <Text style={styles.emoji}>📬</Text>
        <Text style={[styles.title, { color: colors.text }]}>Fast geschafft</Text>
        <Text style={[styles.subtitle, { color: colors.muted }]}>
          Wir haben einen 4-stelligen Code an{'\n'}
          <Text style={{ color: colors.text, fontWeight: '600' }}>{email}</Text>{'\n'}
          geschickt. Bitte hier eintragen.
        </Text>

        <Pressable onPress={() => inputRef.current?.focus()} style={styles.codeRow}>
          {Array.from({ length: CODE_LENGTH }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.codeBox,
                {
                  backgroundColor: colors.card,
                  borderRadius: radius.md,
                  borderColor: i === code.length ? gradient[0] : 'transparent',
                },
              ]}
            >
              <Text style={[styles.codeDigit, { color: colors.text }]}>{code[i] ?? ''}</Text>
            </View>
          ))}
          <TextInput
            ref={inputRef}
            value={code}
            onChangeText={handleChange}
            keyboardType="number-pad"
            maxLength={CODE_LENGTH}
            autoFocus
            caretHidden
            style={styles.hiddenInput}
          />
        </Pressable>

        <Pressable
          onPress={() => submit(code)}
          disabled={code.length !== CODE_LENGTH || isSubmitting}
          style={{ marginTop: 20, opacity: code.length === CODE_LENGTH ? 1 : 0.45 }}
        >
          <LinearGradient
            colors={gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.button, { borderRadius: radius.md }]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Bestätigen</Text>
            )}
          </LinearGradient>
        </Pressable>

        <Pressable onPress={handleResend} disabled={isResending} style={{ marginTop: 18 }}>
          <Text style={[styles.link, { color: colors.muted }]}>
            Keine Mail bekommen?{' '}
            <Text style={{ color: gradient[0], fontWeight: '600' }}>
              {isResending ? 'Wird gesendet…' : 'Neuen Code senden'}
            </Text>
          </Text>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Login')} style={{ marginTop: 12 }}>
          <Text style={[styles.link, { color: colors.muted }]}>
            Schon bestätigt? <Text style={{ color: gradient[0], fontWeight: '600' }}>Jetzt anmelden</Text>
          </Text>
        </Pressable>
      </View>
    </DismissKeyboardView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center' },
  card: { marginHorizontal: 20, padding: 24, alignItems: 'center' },
  emoji: { fontSize: 40, marginBottom: 8 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center' },
  subtitle: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 10 },
  codeRow: { flexDirection: 'row', gap: 10, marginTop: 26 },
  codeBox: { width: 54, height: 64, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  codeDigit: { fontSize: 28, fontWeight: '700' },
  // Liegt unsichtbar ueber der Kaestchen-Reihe und faengt die Eingabe ab.
  hiddenInput: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: 0, color: 'transparent' },
  button: { height: 48, minWidth: 220, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  buttonText: { color: '#fff', fontWeight: '600', fontSize: 14.5 },
  link: { fontSize: 12.5, textAlign: 'center' },
});
