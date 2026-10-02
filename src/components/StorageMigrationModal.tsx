// Speicher-Umzug der Rezeptbilder (Server: routers/storage_migration.py) -
// Gegenstueck zur Buero-/Medienablage (Wunsch 02.10.2026). Wird aus dem
// Speicherort-Bildschirm geoeffnet: per Zeile ('manual') oder als Rueckfrage
// direkt nach einem Wechsel des Speicherorts ('ask'). Der Umzug laeuft in kleinen
// Schritten mit Fortschrittsbalken und kann jederzeit abgebrochen und spaeter
// fortgesetzt werden. Brutzel fuehrt durch alle Schritte.
import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import BrutzelAvatar from './BrutzelAvatar';
import { api, ApiError } from '../api/client';
import { useTheme } from '../theme/ThemeContext';

type Phase = 'loading' | 'ask' | 'running' | 'done' | 'cleanAsk' | 'cleaning' | 'cleanDone' | 'nothing' | 'unsupported' | 'error'
  | 'missLoading' | 'missAsk' | 'missConfirmDelete' | 'missBusy' | 'missDone';
type Failed = { id: string | number; title: string; reason: string };
type Status = {
  supported: boolean; ready: boolean; reason: string | null; hint: string | null;
  target_label: string | null; total: number; movable: number; unreadable: number; sources: Record<string, number>;
};

const ROT = '#DC2626';
const AMBER = '#F59E0B';
const plural = (n: number, eins: string, mehr: string) => (n === 1 ? eins : mehr);
const fehlertext = (e: unknown, fallback: string) => (e instanceof ApiError ? e.detail : fallback);

export default function StorageMigrationModal({
  visible, mode, onClose,
}: {
  visible: boolean;
  mode: 'ask' | 'manual' | null;
  onClose: () => void;
}) {
  const { colors, gradient, radius } = useTheme();
  const akzent = gradient[0];
  const [phase, setPhase] = useState<Phase>('loading');
  const [st, setSt] = useState<Status | null>(null);
  const [done, setDone] = useState(0);
  const [failed, setFailed] = useState<Failed[]>([]);
  const [err, setErr] = useState('');
  const [cl, setCl] = useState<{ pending: number; deletable_now: number; sources: Record<string, number> } | null>(null);
  const [cDone, setCDone] = useState(0);
  const [cDeleted, setCDeleted] = useState(0);
  const [cFailed, setCFailed] = useState<Failed[]>([]);
  const cancelRef = useRef(false);
  const [miss, setMiss] = useState<{ count: number; items: { id: string; title: string }[] } | null>(null);
  const [missRes, setMissRes] = useState<{ done: number; failed: Failed[]; mode: string } | null>(null);

  async function loadCleanup() {
    try {
      const c = await api.get<{ pending: number; deletable_now: number; sources: Record<string, number> }>('/storage-migration/cleanup/status');
      setCl(c);
      return c;
    } catch {
      return null;
    }
  }

  async function load() {
    setPhase('loading'); setErr(''); setDone(0); setFailed([]);
    try {
      const s = await api.get<Status>('/storage-migration/status');
      setSt(s);
      if (!s.supported || !s.ready) setPhase('unsupported');
      else if (s.movable === 0) {
        const c = await loadCleanup();
        setPhase(c && c.pending > 0 ? 'cleanAsk' : 'nothing');
      } else setPhase('ask');
    } catch (e) {
      setErr(fehlertext(e, 'Status konnte nicht geladen werden.')); setPhase('error');
    }
  }
  useEffect(() => { if (visible) load(); }, [visible]);

  async function start() {
    cancelRef.current = false;
    setPhase('running'); setDone(0); setFailed([]);
    let moved = 0;
    const failedAcc: Failed[] = [];
    while (!cancelRef.current) {
      let r: { moved: number; failed: Failed[]; remaining: number };
      try {
        const skip = encodeURIComponent(failedAcc.map((f) => f.id).join(','));
        r = await api.post(`/storage-migration/run?batch=3&skip=${skip}`);
      } catch (e) {
        setErr(fehlertext(e, 'Verbindung unterbrochen.')); setPhase('error'); return;
      }
      moved += r.moved || 0;
      failedAcc.push(...(r.failed || []));
      setDone(moved + failedAcc.length);
      setFailed([...failedAcc]);
      if ((r.remaining || 0) <= 0) break;
      if (!r.moved && !(r.failed || []).length) break;   // kein Fortschritt -> nicht endlos wiederholen
    }
    const c = await loadCleanup();
    setPhase(c && c.pending > 0 && !cancelRef.current ? 'cleanAsk' : 'done');
  }

  async function startCleanup() {
    cancelRef.current = false;
    setPhase('cleaning'); setCDone(0); setCDeleted(0); setCFailed([]);
    let deleted = 0;
    const failedAcc: Failed[] = [];
    const totalPending = cl?.pending || 0;
    while (!cancelRef.current) {
      let r: { deleted: number; failed: Failed[]; remaining: number };
      try {
        r = await api.post(`/storage-migration/cleanup/run?batch=5&skip=${failedAcc.map((f) => f.id).join(',')}`);
      } catch (e) {
        setErr(fehlertext(e, 'Verbindung unterbrochen.')); setPhase('error'); return;
      }
      deleted += r.deleted || 0;
      failedAcc.push(...(r.failed || []));
      setCDeleted(deleted);
      setCFailed([...failedAcc]);
      setCDone(Math.min(totalPending, deleted + failedAcc.length));
      if ((r.remaining || 0) <= 0) break;
      if (!r.deleted && !(r.failed || []).length) break;
    }
    setPhase('cleanDone');
  }

  async function loadMissing() {
    setPhase('missLoading'); setErr('');
    try {
      setMiss(await api.get('/storage-migration/missing'));
      setPhase('missAsk');
    } catch (e) {
      setErr(fehlertext(e, 'Prüfung fehlgeschlagen.')); setPhase('error');
    }
  }

  async function resolveMissing(m: 'keep' | 'delete') {
    setPhase('missBusy');
    try {
      setMissRes(await api.post(`/storage-migration/missing/resolve?mode=${m}`));
      setPhase('missDone');
    } catch (e) {
      setErr(fehlertext(e, 'Das hat nicht geklappt.')); setPhase('error');
    }
  }

  async function keepOld() {
    try { await api.post('/storage-migration/cleanup/dismiss'); } catch { /* nichts geloescht, nur Vormerkung bleibt */ }
    onClose();
  }

  function close() {
    if (phase === 'running' || phase === 'cleaning') cancelRef.current = true;
    onClose();
  }

  const total = st?.movable || 0;
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const ziel = st?.target_label || 'den Speicher';
  const quellen = st?.sources ? Object.entries(st.sources).map(([k, v]) => `${v} aus ${k}`).join(', ') : '';
  const movedOk = Math.max(0, done - failed.length);
  const cPct = (cl?.pending || 0) > 0 ? Math.min(100, Math.round((cDone / (cl?.pending || 1)) * 100)) : 0;
  const cQuellen = cl?.sources ? Object.entries(cl.sources).map(([k, v]) => `${v} in ${k}`).join(', ') : '';

  const titel =
    phase === 'running' ? 'Brutzel verschiebt deine Bilder' :
    phase === 'done' ? 'Fertig' :
    phase === 'cleanAsk' ? 'Alte Kopien löschen?' :
    phase === 'cleaning' ? 'Brutzel räumt auf' :
    phase === 'cleanDone' ? 'Aufgeräumt' :
    phase === 'nothing' ? 'Alles am richtigen Ort ✓' :
    phase === 'missLoading' || phase === 'missBusy' ? 'Brutzel prüft deine Bilder' :
    phase === 'missAsk' ? 'Bilder nicht mehr vorhanden' :
    phase === 'missConfirmDelete' ? 'Wirklich löschen?' :
    phase === 'missDone' ? 'Erledigt' :
    phase === 'unsupported' ? 'Verschieben nicht möglich' :
    phase === 'error' ? 'Das hat nicht geklappt' :
    mode === 'ask' ? 'Bilder übernehmen?' : 'Bilder verschieben';

  const Knopf = ({ label, onPress, art = 'rand', farbe, voll }: { label: string; onPress: () => void; art?: 'voll' | 'rand'; farbe?: string; voll?: boolean }) => (
    <Pressable
      onPress={onPress}
      style={[voll ? s.btnFull : s.btn, { borderRadius: radius.md },
        art === 'voll' ? { backgroundColor: farbe || akzent } : { borderWidth: 2, borderColor: farbe || colors.cardBorder }]}
    >
      <Text style={[s.btnText, { color: art === 'voll' ? '#fff' : farbe || colors.text }]}>{label}</Text>
    </Pressable>
  );

  const Fehlerliste = ({ liste, kopf }: { liste: Failed[]; kopf: string }) => (
    <View style={{ marginTop: 10 }}>
      <Text style={[s.small, { color: ROT, fontWeight: '800' }]}>{kopf}</Text>
      {liste.slice(0, 6).map((f) => (
        <Text key={String(f.id)} style={[s.small, { color: colors.text }]} numberOfLines={3}>• {f.title} – {f.reason}</Text>
      ))}
      {liste.length > 6 && <Text style={[s.small, { color: colors.muted }]}>… und {liste.length - 6} weitere</Text>}
    </View>
  );

  const Hinweis = ({ children }: { children: React.ReactNode }) => (
    <View style={[s.note, { borderColor: AMBER, backgroundColor: 'rgba(245,158,11,0.10)', borderRadius: radius.md }]}>
      <Text style={[s.noteText, { color: colors.text }]}>{children}</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (phase !== 'running' && phase !== 'cleaning') close(); }}>
      <View style={s.backdrop}>
        <View style={[s.card, { backgroundColor: colors.card, borderColor: colors.cardBorder, borderRadius: radius.lg }]}>
          <View style={s.head}>
            <BrutzelAvatar size={52} />
            <View style={{ flex: 1 }}>
              <Text style={[s.who, { color: colors.muted }]}>Brutzel hat eine Frage</Text>
              <Text style={[s.title, { color: colors.text }]}>{titel}</Text>
            </View>
          </View>

          <ScrollView style={{ maxHeight: 380 }}>
            {(phase === 'loading' || phase === 'missLoading' || phase === 'missBusy') && (
              <ActivityIndicator color={akzent} style={{ marginVertical: 20 }} />
            )}

            {phase === 'ask' && (
              <>
                <Text style={[s.text, { color: colors.text }]}>
                  {mode === 'ask'
                    ? `Du hast den Speicherort geändert. ${total} ${plural(total, 'Rezeptbild liegt', 'Rezeptbilder liegen')} noch woanders (${quellen}). Soll ich sie jetzt nach ${ziel} übernehmen?`
                    : `${total} ${plural(total, 'Rezeptbild liegt', 'Rezeptbilder liegen')} nicht in ${ziel} (${quellen}). Soll ich sie jetzt dorthin verschieben?`}
                </Text>
                {st?.hint ? <Text style={[s.small, { color: colors.muted }]}>{st.hint}</Text> : null}
                <Hinweis>
                  ⏱ Das kann je nach Anzahl der Bilder einige Minuten dauern. Bitte lass die App währenddessen geöffnet. Du kannst jederzeit abbrechen und später unter „Speicherort“ fortsetzen.
                </Hinweis>
                <Text style={[s.small, { color: colors.muted }]}>
                  Beim Verschieben wird nichts gelöscht. Bilder aus Starter-Paketen und dem Pool werden nur kopiert – die gehören allen. Erst danach frage ich dich, ob ich deine eigenen alten Kopien entfernen soll.
                </Text>
                {(st?.unreadable || 0) > 0 && (
                  <Text style={[s.small, { color: ROT }]}>
                    {st?.unreadable} {plural(st?.unreadable || 0, 'weiteres Bild liegt', 'weitere Bilder liegen')} nur auf einem Handy und {plural(st?.unreadable || 0, 'kann', 'können')} nicht übernommen werden.
                  </Text>
                )}
              </>
            )}

            {phase === 'running' && (
              <>
                <Text style={[s.text, { color: colors.text }]}>{done} von {total} Bildern</Text>
                <View style={[s.barBg, { backgroundColor: colors.cardBorder }]}>
                  <View style={[s.barFg, { width: `${pct}%`, backgroundColor: akzent }]} />
                </View>
                <Text style={[s.small, { color: colors.muted }]}>{pct}% · Bitte die App geöffnet lassen.</Text>
                {failed.length > 0 && <Text style={[s.small, { color: ROT }]}>{failed.length} {plural(failed.length, 'Bild', 'Bilder')} nicht möglich (Details am Ende)</Text>}
              </>
            )}

            {phase === 'done' && (
              <>
                <Text style={[s.text, { color: colors.text }]}>
                  {movedOk} {plural(movedOk, 'Bild', 'Bilder')} nach {ziel} verschoben{cancelRef.current ? ' (abgebrochen – der Rest kann später fortgesetzt werden)' : ''}.
                </Text>
                {failed.length > 0 && (
                  <>
                    <Fehlerliste liste={failed} kopf={`${failed.length} ${plural(failed.length, 'Bild', 'Bilder')} nicht verschoben:`} />
                    <View style={{ marginTop: 12 }}>
                      <Knopf voll label="Fehlende Bilder bereinigen …" farbe={ROT} onPress={loadMissing} />
                    </View>
                  </>
                )}
              </>
            )}

            {phase === 'cleanAsk' && (
              <>
                <Text style={[s.text, { color: colors.text }]}>
                  Deine Bilder liegen jetzt in {ziel}. Im bisherigen Speicher liegen noch {cl?.pending || 0} alte {plural(cl?.pending || 0, 'Kopie', 'Kopien')} ({cQuellen}).{'\n\n'}Soll ich diese alten Kopien löschen?
                </Text>
                <Hinweis>
                  🔒 Ich lösche eine alte Kopie nur, wenn ich das Bild im neuen Speicher geöffnet und Byte für Byte mit dem Original verglichen habe – und kein anderes Rezept es noch benutzt.{'\n\n'}Gelöschte Bilder lassen sich nicht wiederherstellen.
                </Hinweis>
                {cl && cl.deletable_now < cl.pending && (
                  <Text style={[s.small, { color: ROT }]}>
                    {cl.pending - cl.deletable_now} alte {plural(cl.pending - cl.deletable_now, 'Kopie liegt', 'Kopien liegen')} in einer nicht mehr verbundenen Cloud – dort kann ich nichts löschen.
                  </Text>
                )}
              </>
            )}

            {phase === 'cleaning' && (
              <>
                <Text style={[s.text, { color: colors.text }]}>{cDone} von {cl?.pending || 0} alten Kopien geprüft</Text>
                <View style={[s.barBg, { backgroundColor: colors.cardBorder }]}>
                  <View style={[s.barFg, { width: `${cPct}%`, backgroundColor: akzent }]} />
                </View>
                <Text style={[s.small, { color: colors.muted }]}>{cPct}% · Jedes Bild wird vor dem Löschen geprüft.</Text>
              </>
            )}

            {phase === 'cleanDone' && (
              <>
                <Text style={[s.text, { color: colors.text }]}>
                  {cDeleted} alte {plural(cDeleted, 'Kopie', 'Kopien')} gelöscht{cancelRef.current ? ' (abgebrochen)' : ''}.
                </Text>
                {cFailed.length > 0 && <Fehlerliste liste={cFailed} kopf={`${cFailed.length} ${plural(cFailed.length, 'Kopie', 'Kopien')} bewusst NICHT gelöscht:`} />}
              </>
            )}

            {phase === 'nothing' && (
              <>
                <Text style={[s.text, { color: colors.text }]}>Alle deine Rezeptbilder liegen bereits in {ziel}.</Text>
                {st?.hint ? <Text style={[s.small, { color: colors.muted }]}>{st.hint}</Text> : null}
                {(st?.unreadable || 0) > 0 && (
                  <Text style={[s.small, { color: ROT }]}>
                    {st?.unreadable} {plural(st?.unreadable || 0, 'Bild liegt', 'Bilder liegen')} nur auf einem Handy und {plural(st?.unreadable || 0, 'kann', 'können')} nicht übernommen werden.
                  </Text>
                )}
                <View style={{ marginTop: 12 }}>
                  <Knopf voll label="Auf fehlende Bilder prüfen …" onPress={loadMissing} />
                </View>
              </>
            )}

            {phase === 'missAsk' && miss && (miss.count === 0 ? (
              <Text style={[s.text, { color: colors.text }]}>Alle Bilder sind vorhanden – es gibt nichts zu bereinigen.</Text>
            ) : (
              <>
                <Text style={[s.text, { color: colors.text }]}>
                  Zu {miss.count} {plural(miss.count, 'Rezept', 'Rezepten')} gibt es das Titelbild nicht mehr. Was soll ich damit machen?
                </Text>
                {miss.items.slice(0, 5).map((i) => (
                  <Text key={i.id} style={[s.small, { color: colors.text }]} numberOfLines={2}>• {i.title}</Text>
                ))}
                {miss.count > 5 && <Text style={[s.small, { color: colors.muted }]}>… und {miss.count - 5} weitere</Text>}
                <Hinweis>
                  <Text style={{ fontWeight: '800' }}>Rezepte behalten:</Text> Zutaten, Schritte und Notizen bleiben, nur der Verweis auf das fehlende Bild wird entfernt. Ein neues Bild kannst du jederzeit hinzufügen.{'\n\n'}
                  <Text style={{ fontWeight: '800' }}>Ganz löschen:</Text> Die Rezepte verschwinden komplett.
                </Hinweis>
              </>
            ))}

            {phase === 'missConfirmDelete' && (
              <Text style={[s.text, { color: colors.text }]}>
                {miss?.count || 0} {plural(miss?.count || 0, 'Rezept wird', 'Rezepte werden')} samt Zutaten, Schritten und Notizen gelöscht. Das lässt sich nicht rückgängig machen.
              </Text>
            )}

            {phase === 'missDone' && missRes && (
              <>
                <Text style={[s.text, { color: colors.text }]}>
                  {missRes.mode === 'keep'
                    ? `${missRes.done} ${plural(missRes.done, 'Rezept', 'Rezepte')} behalten – ohne Bild.`
                    : `${missRes.done} ${plural(missRes.done, 'Rezept', 'Rezepte')} gelöscht.`}
                </Text>
                {missRes.failed.slice(0, 5).map((f) => (
                  <Text key={String(f.id)} style={[s.small, { color: ROT }]} numberOfLines={3}>• {f.title} – {f.reason}</Text>
                ))}
              </>
            )}

            {phase === 'unsupported' && <Text style={[s.text, { color: colors.text }]}>{st?.reason || 'Aktuell nicht möglich.'}</Text>}
            {phase === 'error' && <Text style={[s.text, { color: ROT }]}>{err}</Text>}
          </ScrollView>

          <View style={s.btnRow}>
            {phase === 'ask' && (
              <>
                <Knopf label={mode === 'ask' ? 'Nein, später' : 'Abbrechen'} onPress={close} />
                <Knopf art="voll" label={mode === 'ask' ? 'Ja, übernehmen' : 'Jetzt verschieben'} onPress={start} />
              </>
            )}
            {phase === 'cleanAsk' && (
              <>
                <Knopf label="Nein, behalten" onPress={keepOld} />
                <Knopf art="voll" farbe={ROT} label="Ja, löschen" onPress={startCleanup} />
              </>
            )}
            {(phase === 'running' || phase === 'cleaning') && <Knopf label="Abbrechen" onPress={() => { cancelRef.current = true; }} />}
            {phase === 'done' && (cl?.pending || 0) > 0 && <Knopf label="Alte Kopien…" onPress={() => setPhase('cleanAsk')} />}
            {(phase === 'error' || (phase === 'done' && failed.length > 0)) && <Knopf label="Erneut versuchen" onPress={load} />}
            {phase === 'missAsk' && miss && miss.count > 0 && (
              <View style={{ flex: 1, gap: 8 }}>
                <Knopf voll art="voll" label="Rezepte behalten" onPress={() => resolveMissing('keep')} />
                <Knopf voll farbe={ROT} label="Ganz löschen" onPress={() => setPhase('missConfirmDelete')} />
                <Knopf voll label="Abbrechen" onPress={close} />
              </View>
            )}
            {phase === 'missConfirmDelete' && (
              <>
                <Knopf label="Zurück" onPress={() => setPhase('missAsk')} />
                <Knopf art="voll" farbe={ROT} label="Ja, löschen" onPress={() => resolveMissing('delete')} />
              </>
            )}
            {(phase === 'done' || phase === 'cleanDone' || phase === 'nothing' || phase === 'unsupported' || phase === 'error' ||
              phase === 'missDone' || (phase === 'missAsk' && miss?.count === 0)) && (
              <Knopf art="voll" label="Schließen" onPress={close} />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 22 },
  card: { borderWidth: 1.5, padding: 18 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  who: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  title: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  text: { fontSize: 14, lineHeight: 21 },
  small: { fontSize: 12.5, lineHeight: 18, marginTop: 8 },
  note: { borderWidth: 1.5, padding: 10, marginTop: 12 },
  noteText: { fontSize: 12.5, lineHeight: 18 },
  barBg: { height: 12, borderRadius: 6, overflow: 'hidden', marginTop: 12 },
  barFg: { height: 12, borderRadius: 6 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  btnFull: { paddingVertical: 12, alignItems: 'center' },
  btnText: { fontWeight: '800', fontSize: 14 },
});
