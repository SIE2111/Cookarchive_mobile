import React, { useState } from 'react';
import {
  Text, TextInput, Pressable, StyleSheet, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import { api, ApiError } from '../api/client';

type Props = { navigation: any };

/**
 * Passwort vergessen - in zwei Schritten auf einem Bildschirm.
 *
 * Bewusst derselbe Weg wie bei der Registrierung: ein sechsstelliger
 * Code per E-Mail, kein Link. Ein Link muesste die App oeffnen, was
 * eine eingerichtete Verknuepfung voraussetzt (und im Store-Build eine
 * andere ist als in Expo Go). Ein Code funktioniert ueberall gleich.
 *
 * Der Server antwortet auf die Anforderung IMMER gleich, auch wenn es
 * die Adresse nicht gibt - sonst waere der Bildschirm eine Auskunft
 * darueber, wer hier ein Konto hat. Der Hinweistext sagt deshalb "wenn
 * es ein Konto gibt" und nicht "der Code wurde verschickt".
 */
export default function ForgotPasswordScreen({ navigation }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { t } = useUebersetzung();

  const [schritt, setSchritt] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [passwort, setPasswort] = useState('');
  const [laeuft, setLaeuft] = useState(false);

  const codeAnfordern = async () => {
    if (!email.trim()) return;
    setLaeuft(true);
    try {
      await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      setSchritt('code');
    } catch (err) {
      Alert.alert(
        t('passwort.fehlgeschlagen'),
        err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'),
      );
    } finally {
      setLaeuft(false);
    }
  };

  const passwortSetzen = async () => {
    setLaeuft(true);
    try {
      await api.post('/auth/reset-password', {
        email: email.trim().toLowerCase(),
        code: code.trim(),
        neues_passwort: passwort,
      });
      Alert.alert(t('passwort.geaendert'), t('passwort.geaendertText'), [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (err) {
      Alert.alert(
        t('passwort.fehlgeschlagen'),
        err instanceof ApiError ? err.detail : t('profil.unbekannterFehler'),
      );
    } finally {
      setLaeuft(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: colors.bg }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.titel, { color: colors.text }]}>{t('passwort.vergessenTitel')}</Text>
      <Text style={[styles.text, { color: colors.muted }]}>
        {schritt === 'email' ? t('passwort.vergessenText') : t('passwort.codeGeschickt')}
      </Text>

      <TextInput
        style={[styles.feld, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
        placeholder="name@beispiel.at"
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        editable={schritt === 'email'}
        value={email}
        onChangeText={setEmail}
      />

      {schritt === 'code' && (
        <>
          <TextInput
            style={[styles.feld, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md, letterSpacing: 6 }]}
            placeholder={t('passwort.codeEingeben')}
            placeholderTextColor={colors.muted}
            keyboardType="number-pad"
            maxLength={6}
            value={code}
            onChangeText={setCode}
          />
          <TextInput
            style={[styles.feld, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
            placeholder={t('passwort.neuesPasswort')}
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            value={passwort}
            onChangeText={setPasswort}
          />
        </>
      )}

      <Pressable
        onPress={schritt === 'email' ? codeAnfordern : passwortSetzen}
        disabled={laeuft || (schritt === 'code' && (code.trim().length < 6 || passwort.length < 8))}
        style={[styles.knopf, {
          backgroundColor: gradient[0], borderRadius: radius.md,
          opacity: laeuft || (schritt === 'code' && (code.trim().length < 6 || passwort.length < 8)) ? 0.5 : 1,
        }]}
      >
        {laeuft ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.knopfText}>
            {schritt === 'email' ? t('passwort.codeSchicken') : t('passwort.passwortSetzen')}
          </Text>
        )}
      </Pressable>

      <Pressable onPress={() => navigation.goBack()} style={styles.zurueck}>
        <Text style={{ color: colors.muted, fontSize: 13.5 }}>{t('passwort.zurueckZurAnmeldung')}</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 24, paddingTop: 40 },
  titel: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  text: { fontSize: 13.5, lineHeight: 20, marginBottom: 22 },
  feld: { minHeight: 48, paddingHorizontal: 14, fontSize: 15, marginBottom: 12 },
  knopf: { minHeight: 50, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  knopfText: { color: '#fff', fontSize: 15.5, fontWeight: '700' },
  zurueck: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 14 },
});
