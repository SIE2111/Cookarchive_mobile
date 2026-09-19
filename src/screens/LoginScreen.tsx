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
import { useUebersetzung } from '../i18n';
import LanguageSwitchRow from '../components/LanguageSwitchRow';
import DismissKeyboardView from '../components/DismissKeyboardView';
import { useAuth } from '../context/AuthContext';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { AuthStackParamList } from '../navigation/AppNavigator';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export default function LoginScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { t } = useUebersetzung();
  const { signInWithPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert(t('auth.fehltNochWas'), t('auth.bitteEmailPasswort'));
      return;
    }
    setIsSubmitting(true);
    try {
      await signInWithPassword(email, password);
      // Navigation zur App uebernimmt der Root-Navigator automatisch,
      // sobald AuthContext eine gueltige Session meldet.
    } catch (err) {
      const message = err instanceof Error ? err.message : t('auth.loginFehlgeschlagen');
      Alert.alert(t('auth.anmeldungFehlgeschlagen'), message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DismissKeyboardView style={[styles.container, { backgroundColor: colors.bg }]}>
      <View style={[styles.card, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
        <Text style={[styles.title, { color: colors.text }]}>{t('auth.appName')}</Text>

        <Text style={[styles.label, { color: colors.muted }]}>{t('auth.email')}</Text>
        <TextInput
          style={[styles.input, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
          placeholder={t('auth.emailPlatzhalter')}
          placeholderTextColor={colors.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />

        <Text style={[styles.label, { color: colors.muted }]}>{t('auth.passwort')}</Text>
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
              <Text style={styles.buttonText}>{t('auth.anmelden')}</Text>
            )}
          </LinearGradient>
        </Pressable>

        <Pressable onPress={() => navigation.navigate('Register')} style={{ marginTop: 20 }}>
          <Text style={[styles.link, { color: colors.muted }]}>
            {t('auth.keinKonto')}{' '}
            <Text style={{ color: gradient[0], fontWeight: '600' }}>{t('auth.registrieren')}</Text>
          </Text>
        </Pressable>

        <Pressable

          onPress={() => navigation.navigate('ForgotPassword')}

          style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}

        >

          <Text style={{ color: colors.muted, fontSize: 13.5 }}>{t('passwort.vergessen')}</Text>

        </Pressable>

        <LanguageSwitchRow />
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
