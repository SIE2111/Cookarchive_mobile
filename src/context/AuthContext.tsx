import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../api/supabaseClient';

/**
 * Kochbuch nutzt bewusst Pflicht-Login (kein Kein-Kontozwang-Prinzip wie
 * beim portablen HomeArchive-Auth-Modul aus dem Weinkeller-Projekt) - der
 * Community-Pool erfordert ohnehin ein echtes Konto. Siehe Umsetzungs-
 * konzept Abschnitt 7b fuer die Begruendung.
 */

interface AuthContextValue {
  session: Session | null;
  isLoading: boolean;
  justRegistered: boolean;
  clearJustRegistered: () => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string) => Promise<{ needsEmailConfirmation: boolean }>;
  resendConfirmationEmail: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [justRegistered, setJustRegistered] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      justRegistered,
      clearJustRegistered: () => setJustRegistered(false),
      signInWithPassword: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      },
      signUpWithPassword: async (email, password) => {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.session) {
          // Bestaetigung war nicht noetig (z.B. "Confirm email" deaktiviert,
          // oder Nutzer wurde bereits vorher per Admin-API bestaetigt) -
          // Session ist sofort da, normaler Weg zum Onboarding.
          setJustRegistered(true);
          return { needsEmailConfirmation: false };
        }
        // Kein Fehler, aber auch keine Session: Supabase hat den Nutzer
        // angelegt und wartet auf Bestaetigung der E-Mail. Bisher blieb die
        // App hier im Login/Register-Bereich haengen, ohne dass sichtbar
        // war, woran es lag - deshalb jetzt explizit erkannt und an die
        // aufrufende Stelle (RegisterScreen) zurueckgemeldet.
        return { needsEmailConfirmation: true };
      },
      resendConfirmationEmail: async (email) => {
        const { error } = await supabase.auth.resend({ type: 'signup', email });
        if (error) throw error;
      },
      signOut: async () => {
        await supabase.auth.signOut();
      },
    }),
    [session, isLoading, justRegistered],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth() muss innerhalb eines <AuthProvider> aufgerufen werden');
  }
  return ctx;
}
