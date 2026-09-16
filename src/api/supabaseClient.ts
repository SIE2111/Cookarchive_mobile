import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Statt stillschweigend mit leeren Strings weiterzumachen (das fuehrt zu
// einem nicht nachvollziehbaren weissen Bildschirm beim Start, siehe
// Weinkeller-Lektion): klarer, sichtbarer Fehler direkt beim Laden.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'EXPO_PUBLIC_SUPABASE_URL/_ANON_KEY fehlen. Lokal: .env pruefen (Datei vorhanden? ' +
    'Terminal neu gestartet nach Aenderung?). Im EAS-Build: eas.json-env oder ' +
    '"eas secret:create" pruefen - Build-Server haben keinen Zugriff auf die lokale .env.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
