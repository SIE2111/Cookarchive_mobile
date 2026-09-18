import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabaseClient';

// TODO: echte Backend-URL eintragen, sobald deployed (z.B. Render/Fly.io)
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

class ApiError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

/**
 * Zentrale Fetch-Hilfsfunktion: haengt automatisch das aktuelle Supabase-
 * JWT als Authorization-Header an, wirft eine ApiError mit lesbarer
 * Fehlermeldung bei nicht-2xx-Antworten (Backend liefert {"detail": "..."}).
 */
async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      detail = body.detail ?? detail;
    } catch {
      // Antwort war kein JSON - Standardmeldung behalten
    }
    throw new ApiError(response.status, detail);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
  // DELETE mit optionalem Body - braucht z.B. /account, das die eigene
  // E-Mail als Bestaetigung erwartet. HTTP erlaubt einen Body bei DELETE,
  // FastAPI liest ihn auch; nur wurde er hier bisher nicht durchgereicht.
  delete: <T>(path: string, body?: unknown) =>
    apiFetch<T>(path, { method: 'DELETE', body: body ? JSON.stringify(body) : undefined }),

  /**
   * Multipart-Upload fuer Bilder (siehe routers/images.py). Nutzt bewusst
   * kein JSON.stringify - FormData setzt seinen eigenen Content-Type-
   * Header inkl. Boundary automatisch, ein manuell gesetzter 'application/
   * json'-Header (wie in apiFetch) wuerde den Upload sonst kaputt machen,
   * daher hier ein eigener, schlankerer Fetch-Aufruf ohne den JSON-Header.
   */
  /**
   * Multipart-Upload fuer Bilder (siehe routers/images.py, routers/
   * ai_generation.py:scan-photo). Nutzt bewusst FileSystem.uploadAsync
   * statt manuell zusammengebauter FormData mit fetch() - React Natives
   * neuerer Netzwerk-Stack (ab RN 0.74+) unterstuetzt das klassische
   * {uri, name, type}-FormData-Part-Objekt nicht mehr und wirft dabei
   * "Unsupported FormDataPart implementation". FileSystem.uploadAsync
   * umgeht das, indem es die Datei direkt vom Dateisystem aus natives
   * Code hochlaedt.
   */
  /**
   * Mehrere Bilder in EINEM Aufruf hochladen.
   *
   * Nicht ueber FileSystem.uploadAsync wie uploadImage: Das kann genau
   * eine Datei. Hier braucht es FormData mit mehreren Eintraegen unter
   * demselben Feldnamen, damit FastAPI sie als Liste erhaelt.
   *
   * Wichtig ist das gemeinsame Hochladen, nicht mehrere Aufrufe: Die KI
   * muss alle Seiten zusammen sehen, um Zutaten von Seite 1 und
   * Zubereitung von Seite 2 zu EINEM Rezept zu verbinden.
   */
  uploadImages: async <T>(
    path: string,
    files: { uri: string; name: string; type: string }[],
  ): Promise<T> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const form = new FormData();
    files.forEach((f) => {
      // In React Native nimmt FormData dieses Objekt-Format statt eines Blobs.
      form.append('files', { uri: f.uri, name: f.name, type: f.type } as unknown as Blob);
    });

    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      // KEIN Content-Type setzen: Den Multipart-Trenner setzt fetch selbst,
      // von Hand gesetzt fehlt die boundary und der Server lehnt ab.
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: form,
    });

    const text = await response.text();
    if (!response.ok) {
      let detail = `HTTP ${response.status}`;
      try {
        detail = JSON.parse(text).detail ?? detail;
      } catch {
        // Antwort war kein JSON - beim Status bleiben
      }
      throw new ApiError(response.status, detail);
    }
    return JSON.parse(text) as T;
  },

  uploadImage: async (
    path: string,
    fileUri: string,
    fileName: string,
    mimeType: string,
    extraFields?: Record<string, string>,
  ): Promise<{ url: string; storage_warning?: string | null }> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;

    const result = await FileSystem.uploadAsync(`${API_BASE_URL}${path}`, fileUri, {
      httpMethod: 'POST',
      uploadType: FileSystem.FileSystemUploadType.MULTIPART,
      fieldName: 'file',
      mimeType,
      parameters: extraFields ?? {},
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    if (result.status < 200 || result.status >= 300) {
      let detail = `HTTP ${result.status}`;
      try {
        const body = JSON.parse(result.body);
        detail = body.detail ?? detail;
      } catch {
        // Antwort war kein JSON
      }
      throw new ApiError(result.status, detail);
    }
    return JSON.parse(result.body);
  },

  // Laedt eine Datei (z.B. das Rezept-PDF) authentifiziert vom Backend in
  // den lokalen Cache und gibt den lokalen file://-Pfad zurueck - von dort
  // kann sie z.B. per expo-sharing geteilt/gedruckt werden.
  downloadFile: async (path: string, localFileName: string): Promise<string> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const localUri = `${FileSystem.cacheDirectory}${localFileName}`;

    const result = await FileSystem.downloadAsync(`${API_BASE_URL}${path}`, localUri, {
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });

    if (result.status < 200 || result.status >= 300) {
      throw new ApiError(result.status, `HTTP ${result.status}`);
    }
    return result.uri;
  },
};

export { ApiError };
