import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

/**
 * Haelt den Server-Sync-Schalter zentral vor.
 *
 * Warum ein eigener Kontext und nicht einfach pro Knopf laden: Der
 * Veroeffentlichen-Knopf sitzt an JEDER Rezeptzeile. Wuerde jeder davon
 * die Einstellungen selbst abfragen, entstuenden bei 119 Rezepten 119
 * Anfragen fuer ein und denselben Wert - beim Scrollen immer wieder neu.
 * So wird er einmal geladen und von allen mitbenutzt.
 *
 * Der Wert entscheidet, ob der Community-Pool ueberhaupt nutzbar ist
 * (siehe _require_server_sync im Backend). Ohne aktivierten Sync sind die
 * Pool-Knoepfe ausgegraut, statt erst nach dem Antippen mit einer
 * Fehlermeldung zu antworten.
 */
interface ServerSyncContextValue {
  serverSyncEnabled: boolean;
  /** Noch nicht geladen - Knoepfe zeigen sich dann neutral, nicht gesperrt. */
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const ServerSyncContext = createContext<ServerSyncContextValue>({
  serverSyncEnabled: false,
  isLoading: true,
  refresh: async () => {},
});

export function ServerSyncProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [serverSyncEnabled, setServerSyncEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!session) {
      setServerSyncEnabled(false);
      setIsLoading(false);
      return;
    }
    try {
      const prefs = await api.get<{ server_sync_enabled: boolean }>('/preferences/');
      setServerSyncEnabled(!!prefs.server_sync_enabled);
    } catch {
      // Laesst sich der Wert nicht laden, bleibt es beim zuletzt bekannten
      // Stand. Die Knoepfe deshalb zu sperren waere falsch - ein
      // Netzwerkaussetzer ist kein "nicht erlaubt".
    } finally {
      setIsLoading(false);
    }
  }, [session]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <ServerSyncContext.Provider value={{ serverSyncEnabled, isLoading, refresh }}>
      {children}
    </ServerSyncContext.Provider>
  );
}

export function useServerSync(): ServerSyncContextValue {
  return useContext(ServerSyncContext);
}
