import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// TODO: echte Werte aus dem cookarchiv-Supabase-Projekt eintragen
// (Dashboard -> Project Settings -> API), z.B. via Expo-Umgebungsvariablen
// (EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY).
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://yahvzxcjthiayfemmrvd.supabase.co';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
