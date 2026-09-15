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
  signUpWithPassword: (email: string, password: string) => Promise<void>;
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
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        // Markiert diese Session als "gerade neu registriert" - der
        // AppNavigator entscheidet anhand dieses Flags, ob nach dem Login
        // zuerst das Onboarding oder direkt die Startseite gezeigt wird.
        setJustRegistered(true);
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
