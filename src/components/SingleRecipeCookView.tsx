import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Modal, TextInput, Linking, Alert, ScrollView, Keyboard } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Speech from 'expo-speech';
import { SPEECH_LANGUAGE, BRUTZEL_PITCH, BRUTZEL_RATE, loadBrutzelVoice } from '../utils/speech';
import { useTheme } from '../theme/ThemeContext';
import { useUebersetzung } from '../i18n';
import TranslationBanner from './TranslationBanner';
import { api, ApiError } from '../api/client';
import { pickStepsForLevel, HaubenLevel, RecipeStep } from '../utils/stepLevels';
import { scheduleTimerNotification, cancelTimerNotification, setupNotificationChannel } from '../utils/notifications';
import BrutzelAvatar from './BrutzelAvatar';

interface Ingredient {
  name: string;
  amount: number | null;
  unit: string | null;
}

interface RecipeForCooking {
  id: string;
  title: string;
  servings: number | null;
  ingredients: Ingredient[];
  steps: RecipeStep[];
  steps_anfaenger?: RecipeStep[] | null;
  steps_profi?: RecipeStep[] | null;
  locale?: string | null;
  available_translations?: string[];
}

const LEVEL_TO_HAT_COUNT: Record<HaubenLevel, number> = { anfaenger: 1, fortgeschritten: 2, profi: 3 };
const HAT_COUNT_TO_LEVEL: Record<number, HaubenLevel> = { 1: 'anfaenger', 2: 'fortgeschritten', 3: 'profi' };

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Fallback fuer Schritte OHNE fest hinterlegtes timer_seconds (betrifft
// alle KI-generierten/importierten/manuell getippten Rezepte - nur die
// 51 Starter-Rezepte haben das Feld von Hand gesetzt). Erkennt Zeitangaben
// direkt im Schritt-Text ("20 Minuten", "2 Stunden", "25-30 Min.") und
// leitet daraus einen Timer ab - aber erst AB 2 MINUTEN, wie gewuenscht,
// damit nicht jede beilaeufige Erwaehnung ("kurz anbraten, 1 Minute") einen
// Timer aufploppen laesst.
function parseDurationSecondsFromText(text: string): number | null {
  const rangeMatch = text.match(/(\d+)\s*[-–]\s*(\d+)\s*(Minuten|Min\.?|Stunden|Std\.?)/i);
  const singleMatch = !rangeMatch ? text.match(/(\d+)\s*(Minuten|Min\.?|Stunden|Std\.?)/i) : null;
  const match = rangeMatch ?? singleMatch;
  if (!match) return null;

  const isHours = /Stunden|Std/i.test(match[match.length - 1]);
  let value: number;
  if (rangeMatch) {
    // Bei einer Spanne (z.B. "25-30 Minuten") den Mittelwert nehmen -
    // repraesentativer als nur die untere oder obere Grenze.
    value = (Number(rangeMatch[1]) + Number(rangeMatch[2])) / 2;
  } else {
    value = Number(match[1]);
  }
  const seconds = isHours ? value * 3600 : value * 60;
  return seconds >= 120 ? Math.round(seconds) : null;
}

function getEffectiveTimerSeconds(step: { timer_seconds?: number | null; text: string }): number | null {
  return step.timer_seconds ?? parseDurationSecondsFromText(step.text);
}

// Ersatztipps, wenn die KI keine liefert (abgeschaltet oder nicht
// erreichbar). Die Texte stehen in den Sprachdateien unter
// kochen.tipp bzw. kochen.tippAllgemein - hier nur noch die
// Schluessel, sonst waeren sie fuer immer deutsch.
const BRUTZEL_TIP_KEYS: string[] = [
  'mehlieren',
  'zwiebel_schneiden',
  'koecheln_lassen',
  'apfel_schaelen',
  'filetieren',
  'germteig_gehen_lassen',
  'knoblauch_schaelen',
  'palatschinken_wenden',
  'risotto_ruehren',
  'ruehrteig_unterheben',
  'schnitzel_klopfen',
  'schwarte_einschneiden',
  'teig_kneten',
  'eiweiss_schlagen',
  'strudelteig_ausziehen',
];

const GENERIC_TIP_COUNT = 5;

interface TechniqueVideoInfo {
  keyword: string;
  title: string;
  youtube_video_id: string | null;
  available: boolean;
}

interface Props {
  recipeId: string;
  isActive: boolean; // steuert Sichtbarkeit, OHNE die Komponente zu unmounten -
  // laufende Timer der inaktiven Tabs sollen weiterlaufen (siehe Konzept:
  // "Timer laeuft im Hintergrund, waehrend am anderen Rezept gearbeitet wird")
  onTitleLoaded?: (title: string) => void;
  // completed=true: alle Schritte tatsaechlich durchlaufen (Feier + "als
  // zubereitet markieren" sollen ausgeloest werden). completed=false: am
  // ersten Schritt "Zurueck" gedrueckt, d.h. der Kochvorgang wird
  // abgebrochen/verlassen - dann NICHT als zubereitet markieren und keine
  // Guten-Appetit-Feier zeigen (war zuvor ein Bug: beides rief denselben
  // Callback ohne Unterscheidung auf).
  onFinished: (completed: boolean) => void; // vom Elternteil gesteuert statt navigation.goBack(),
  // da mehrere Tabs sich nicht jeweils eigenstaendig "zurueck" navigieren sollen
  // "Nur fuer diesen Kochvorgang" uebernommene Aenderungen aus dem Rezept-
  // Detail (VOR dem Kochstart bearbeitet, siehe RecipeDetailScreen) - werden
  // NACH dem Laden ueber das Rezept vom Server gelegt, nie gespeichert.
  sessionOverrides?: { ingredients?: Ingredient[]; steps?: RecipeStep[] };
}

export default function SingleRecipeCookView({ recipeId, isActive, onTitleLoaded, onFinished, sessionOverrides }: Props) {
  const { colors, gradient, radius } = useTheme();
  const { t, sprache } = useUebersetzung();

  const [recipe, setRecipe] = useState<RecipeForCooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<HaubenLevel>('fortgeschritten');
  const [tippsLaden, setTippsLaden] = useState(false);
  // Waehrend einer Umstellung wird der Schirm gesperrt (siehe unten).
  const [umstellung, setUmstellung] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isIngredientsOpen, setIsIngredientsOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoReadSteps, setAutoReadSteps] = useState(false);
  const [showBrutzel, setShowBrutzel] = useState(true);
  // Von der KI erzeugte Tipps je Schritt, per order. Bleibt leer, wenn der
  // Abruf scheitert - dann greifen die eingebauten Texte als Rueckfall.
  const [stepTips, setStepTips] = useState<Record<number, string>>({});
  const [isSpeakingTip, setIsSpeakingTip] = useState(false);
  // Der Tipp wird weiter unten aus dem aktuellen Schritt berechnet, der
  // Vorlese-Effekt steht aber weiter oben. Ein Ref ueberbrueckt das, ohne
  // die Reihenfolge im Code umzustellen - und er ist beim Auslesen nach
  // der Pause automatisch aktuell.
  const brutzelTipRef = React.useRef('');
  const [brutzelVoice, setBrutzelVoice] = useState<string | undefined>(undefined);
  const [largeText, setLargeText] = useState(false);
  const [techniqueVideo, setTechniqueVideo] = useState<TechniqueVideoInfo | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [isStepTextModalOpen, setIsStepTextModalOpen] = useState(false);
  const [stepTextDraft, setStepTextDraft] = useState('');
  const [isSavingStepText, setIsSavingStepText] = useState(false);
  const [editingIngredientIndex, setEditingIngredientIndex] = useState<number | null>(null);
  const [ingredientDraft, setIngredientDraft] = useState({ name: '', amount: '', unit: '' });
  const [isSavingIngredient, setIsSavingIngredient] = useState(false);

  // Gemeinsame Abfrage fuer jede Aenderung an Zutaten/Kochschritten waehrend
  // des Kochens: dauerhaft im Rezept speichern (PATCH ans Backend, gilt auch
  // kuenftig) oder nur fuer den aktuellen Kochvorgang uebernehmen (rein
  // lokaler State, das gespeicherte Rezept bleibt unveraendert). Bewusst
  // getrennt von der Notiz-Funktion (die hat ihre eigene, gleichartige
  // Abfrage), da Notiz ein eigenes Feld ist, hier geht es um die
  // eigentlichen Zutaten/Schritt-Daten.
  const saveRecipeChangeWithScope = (
    updatedFields: { ingredients?: Ingredient[]; steps?: RecipeStep[] },
    applyLocally: () => void,
    setSaving: (v: boolean) => void,
    onDone: () => void,
  ) => {
    Keyboard.dismiss();
    Alert.alert(
      'Änderung speichern',
      t('detail.aenderungFrage'),
      [
        { text: t('allgemein.abbrechen'), style: 'cancel' },
        {
          text: t('detail.nurDiesmal'),
          onPress: () => {
            applyLocally();
            onDone();
          },
        },
        {
          text: t('detail.dauerhaftImRezept'),
          onPress: async () => {
            setSaving(true);
            try {
              await api.patch(`/recipes/${recipeId}`, updatedFields);
              applyLocally();
              onDone();
            } catch (err) {
              Alert.alert(t('allgemein.fehler'), err instanceof ApiError ? err.detail : t('detail.nichtGespeichert'));
            } finally {
              setSaving(false);
            }
          },
        },
      ],
    );
  };
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    api
      .get<{ auto_read_steps: boolean; default_hauben_level: HaubenLevel; large_text: boolean; show_brutzel: boolean }>('/preferences/')
      .then((prefs) => {
        setAutoReadSteps(prefs.auto_read_steps);
        setLevel(prefs.default_hauben_level);
        setLargeText(prefs.large_text);
        setShowBrutzel(prefs.show_brutzel);
      })
      .catch(() => {
        // Praeferenz konnte nicht geladen werden - Auto-Vorlesen bleibt aus,
        // Hauben-Stufe bleibt beim Fallback 'fortgeschritten', kein Grund
        // den ganzen Koch-Modus zu blockieren
      });
  }, []);

  // Brutzels Tipps zum Rezept holen. Nur wenn Brutzel ueberhaupt
  // eingeschaltet ist - sonst waere es ein KI-Aufruf fuer etwas, das
  // niemand zu sehen bekommt.
  useEffect(() => {
    if (!showBrutzel || !recipe) return;
    // Die Stufe gehoert in die Anfrage: Die Schrittliste ist je Stufe eine
    // andere, und damit auch die Tipps. Ohne sie stand nach dem Umschalten
    // der Tipp zu Schritt 5 der einen Fassung neben Schritt 5 der anderen.
    setStepTips({});
    setTippsLaden(true);
    api
      .post<{ tips: { order: number; tip: string }[] }>(
        `/ai/step-tips/${recipeId}?level=${level}`,
      )
      .then((res) => {
        const byOrder: Record<number, string> = {};
        res.tips.forEach((t) => {
          if (t.order != null) byOrder[t.order] = t.tip;
        });
        setStepTips(byOrder);
      })
      .catch(() => {
        // Kein Grund, das Kochen zu stoeren - es greifen die eingebauten
        // Texte weiter unten.
      })
      .finally(() => setTippsLaden(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showBrutzel, recipeId, !!recipe, level]);

  // Eigene Stimme fuer Brutzel: eine ANDERE deutsche Stimme als die, die
  // die Schritte vorliest. So ist ohne Hinsehen klar, ob gerade das Rezept
  // gesprochen wird oder Brutzel dazwischenredet. Gibt es nur eine
  // deutsche Stimme, bleibt es bei der Standardstimme - dann sorgen
  // Tonhoehe und Tempo unten fuer den Unterschied.
  // Brutzels Stimme kommt jetzt aus der Auswahl im Profil. Vorher wurde
  // einfach die letzte deutsche Systemstimme genommen - das war Zufall
  // und klang je nach Geraet beliebig.
  useEffect(() => {
    loadBrutzelVoice().then(setBrutzelVoice);
  }, []);

  const handleSpeakTip = (text: string) => {
    if (isSpeakingTip) {
      Speech.stop();
      setIsSpeakingTip(false);
      return;
    }
    // Laufendes Schritt-Vorlesen zuerst stoppen, sonst reden beide
    // gleichzeitig.
    Speech.stop();
    setIsSpeaking(false);
    setIsSpeakingTip(true);
    Speech.speak(text, {
      language: SPEECH_LANGUAGE,
      voice: brutzelVoice,
      pitch: BRUTZEL_PITCH,
      rate: BRUTZEL_RATE,
      onDone: () => setIsSpeakingTip(false),
      onStopped: () => setIsSpeakingTip(false),
      onError: () => setIsSpeakingTip(false),
    });
  };

  const handleSpeak = () => {
    if (!currentStep) return;
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    Speech.speak(currentStep.text, {
      language: SPEECH_LANGUAGE,
      onDone: () => setIsSpeaking(false),
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
    });
  };

  // Beim Verlassen des Screens oder Schrittwechsel laufende Sprachausgabe
  // stoppen UND einen noch offenen Timer-Push abbrechen (per Ref, damit der
  // Cleanup immer die aktuelle Notification-ID sieht statt einer veralteten
  // aus dem ersten Render).
  useEffect(() => {
    return () => {
      Speech.stop();
      setIsSpeakingTip(false);
      cancelTimerNotification(timerNotificationIdRef.current);
    };
  }, []);
  useEffect(() => {
    Speech.stop();
    setIsSpeaking(false);
    if (!autoReadSteps || !currentStep) return;

    // Wird auf true gesetzt, sobald der Schritt gewechselt oder der Screen
    // verlassen wird. Ohne dieses Flag wuerde Brutzels Tipp nach der Pause
    // noch losreden, obwohl man laengst beim naechsten Schritt ist - der
    // Timer laeuft ja unabhaengig weiter.
    let abgebrochen = false;
    let tippTimer: ReturnType<typeof setTimeout> | null = null;

    setIsSpeaking(true);
    Speech.speak(currentStep.text, {
      language: SPEECH_LANGUAGE,
      onStopped: () => setIsSpeaking(false),
      onError: () => setIsSpeaking(false),
      onDone: () => {
        setIsSpeaking(false);
        // Brutzels Tipp im Anschluss - aber nur, wenn er ueberhaupt
        // eingeschaltet ist und es einen Tipp gibt.
        if (abgebrochen || !showBrutzel || !brutzelTipRef.current) return;

        // Kurze Pause dazwischen: Ohne sie klingt es wie ein einziger
        // langer Satz, und man haelt den Tipp fuer einen Teil des
        // Arbeitsschritts.
        tippTimer = setTimeout(() => {
          if (abgebrochen) return;
          setIsSpeakingTip(true);
          Speech.speak(`Brutzels Tipp. ${brutzelTipRef.current}`, {
            language: SPEECH_LANGUAGE,
            voice: brutzelVoice,
            pitch: BRUTZEL_PITCH,
            rate: BRUTZEL_RATE,
            onDone: () => setIsSpeakingTip(false),
            onStopped: () => setIsSpeakingTip(false),
            onError: () => setIsSpeakingTip(false),
          });
        }, 900);
      },
    });

    return () => {
      abgebrochen = true;
      if (tippTimer) clearTimeout(tippTimer);
    };
    // currentStep bewusst nicht in den Dependencies - haengt schon an
    // currentIndex/level, die Referenz waere bei jedem Render neu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, level, autoReadSteps, recipe, showBrutzel, brutzelVoice]);

  // Timer-Zustand: nur aktiv, wenn der aktuelle Schritt timer_seconds hat
  // und der Nutzer ihn gestartet hat. Echtes setInterval, keine Attrappe.
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [isEditingTimer, setIsEditingTimer] = useState(false);
  const [timerEditDraft, setTimerEditDraft] = useState('');
  // Welcher SCHRITT (Index) gerade einen laufenden/gestarteten Timer hat -
  // getrennt von currentIndex (welcher Schritt gerade ANGEZEIGT wird).
  // Ohne diese Trennung wurde der Timer bei jedem Weiter/Zurueck
  // faelschlich gestoppt und zurueckgesetzt (siehe Reset-Effekt unten).
  const [activeTimerStepIndex, setActiveTimerStepIndex] = useState<number | null>(null);
  const [timerNotificationId, setTimerNotificationId] = useState<string | null>(null);
  const timerNotificationIdRef = useRef<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setupNotificationChannel();
  }, []);

  useEffect(() => {
    timerNotificationIdRef.current = timerNotificationId;
  }, [timerNotificationId]);

  useEffect(() => {
    api
      .get<RecipeForCooking>(`/recipes/${recipeId}`)
      .then((data) => {
        // "Nur diesmal"-Aenderungen aus dem Rezept-Detail ueberschreiben
        // die vom Server geladenen Daten NUR fuer diese Session - werden
        // nirgends gespeichert.
        const merged = sessionOverrides
          ? {
              ...data,
              ingredients: sessionOverrides.ingredients ?? data.ingredients,
              steps: sessionOverrides.steps ?? data.steps,
            }
          : data;
        setRecipe(merged);
        onTitleLoaded?.(merged.title);
      })
      .catch((err) => setError(err instanceof ApiError ? err.detail : t('kochen.nichtGeladen')));
    // onTitleLoaded/sessionOverrides bewusst nicht in den Dependencies -
    // waeren bei jedem Render neue Referenzen vom Elternteil, wuerden den
    // Ladevorgang unnoetig wiederholen. recipeId ist der einzige relevante
    // Trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  const [isAdaptingSteps, setIsAdaptingSteps] = useState(false);

  // Wenn auf Anfaenger/Profi gewechselt wird (oder das Rezept frisch in
  // dieser Stufe geladen wurde) und noch keine generierte Variante
  // vorliegt, jetzt beim Backend anfordern (generiert + cacht dort einmalig,
  // siehe POST /ai/adapt-steps/{id}) und ins lokale Rezept einmischen.
  // Fortgeschritten braucht das nie, das ist immer die Basisfassung.
  useEffect(() => {
    if (!recipe || level === 'fortgeschritten') return;
    const cachedField = level === 'anfaenger' ? 'steps_anfaenger' : 'steps_profi';
    const alreadyCached = recipe[cachedField] && recipe[cachedField]!.length > 0;
    if (alreadyCached) return;

    let cancelled = false;
    setIsAdaptingSteps(true);
    api
      .post<{ steps: RecipeStep[] }>(`/ai/adapt-steps/${recipeId}`, { level })
      .then((result) => {
        if (cancelled) return;
        setRecipe((prev) => (prev ? { ...prev, [cachedField]: result.steps } : prev));
      })
      .catch(() => {
        // Generierung fehlgeschlagen (z.B. kein OPENAI_API_KEY) - kein
        // Alert noetig, pickStepsForLevel faellt automatisch auf die
        // Basisfassung zurueck, das Kochen bleibt trotzdem moeglich.
      })
      .finally(() => {
        if (!cancelled) setIsAdaptingSteps(false);
      });
    return () => {
      cancelled = true;
    };
  }, [recipe?.id, level]);


  // --- Uebersetzung ---------------------------------------------------
  // Dieselbe Schicht wie im Rezeptdetail: Das Original bleibt, die
  // Uebersetzung liegt darueber. Im Koch-Modus zaehlt sie doppelt - hier
  // steht man am Herd und hat keine Zeit, einen fremden Satz zu deuten.
  const quellsprache = (recipe?.locale || 'de').slice(0, 2);
  const brauchtUebersetzung = !!recipe && quellsprache !== sprache;
  const [uebersetzung, setUebersetzung] = useState<{
    title: string;
    steps: RecipeStep[];
    steps_anfaenger?: RecipeStep[] | null;
    steps_profi?: RecipeStep[] | null;
  } | null>(null);
  const [zeigeUebersetzung, setZeigeUebersetzung] = useState(true);
  const [uebersetztGerade, setUebersetztGerade] = useState(false);
  const [uebersetzungsfehler, setUebersetzungsfehler] = useState<string | null>(null);

  const holeUebersetzung = async () => {
    if (!recipe) return;
    setUebersetztGerade(true);
    setUebersetzungsfehler(null);
    try {
      const res = await api.post<{
        title: string; steps: RecipeStep[];
        steps_anfaenger?: RecipeStep[] | null; steps_profi?: RecipeStep[] | null;
      }>(`/ai/translate/${recipe.id}?locale=${sprache}`, {});
      setUebersetzung(res);
      setZeigeUebersetzung(true);
    } catch (err) {
      setUebersetzungsfehler(err instanceof ApiError ? err.detail : t('uebersetzung.fehlgeschlagen'));
    } finally {
      setUebersetztGerade(false);
    }
  };

  // Liegt sie schon vor, kostet das Holen keinen KI-Aufruf.
  useEffect(() => {
    if (brauchtUebersetzung && recipe?.available_translations?.includes(sprache) && !uebersetzung) {
      holeUebersetzung();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brauchtUebersetzung, recipe?.id, sprache]);

  const zeigtUebersetzung = !!uebersetzung && zeigeUebersetzung;

  // Die Stufenfassung der Uebersetzung, sofern es sie gibt - sonst faellt
  // es auf deren Basisfassung zurueck, nicht auf das Original: lieber die
  // richtige Sprache in der falschen Ausfuehrlichkeit als umgekehrt.
  const uebersetzteSchritte = (): RecipeStep[] | null => {
    if (!zeigtUebersetzung || !uebersetzung) return null;
    if (level === 'anfaenger' && uebersetzung.steps_anfaenger?.length) return uebersetzung.steps_anfaenger;
    if (level === 'profi' && uebersetzung.steps_profi?.length) return uebersetzung.steps_profi;
    return uebersetzung.steps;
  };

  const derivedSteps = uebersetzteSchritte() ?? (recipe ? pickStepsForLevel(recipe, level) : []);
  const currentStep = derivedSteps[currentIndex];

  // KI-Tipp zu genau diesem Schritt, sonst der eingebaute Technik-Tipp,
  // sonst ein allgemeiner. Die Reihenfolge ist Absicht: Der schrittgenaue
  // Hinweis ist der einzige, der wirklich hilft - die anderen sind
  // Rueckfall, falls die KI nicht erreichbar war.
  const brutzelTip = currentStep
    ? (stepTips[currentStep.order] ??
       (currentStep.technique_tag
         ? (BRUTZEL_TIP_KEYS.includes(currentStep.technique_tag)
             ? t(`kochen.tipp.${currentStep.technique_tag}`)
             : t('kochen.technikAufmerksamkeit'))
         : t(`kochen.tippAllgemein.${(currentIndex % GENERIC_TIP_COUNT) + 1}`)))
    : '';
  brutzelTipRef.current = brutzelTip;



  // Technik-Video zum aktuellen Schritt laden, falls ein technique_tag
  // gesetzt ist. Oeffentlicher Endpoint, kein Login-Overhead noetig.
  useEffect(() => {
    const tag = currentStep?.technique_tag;
    if (!tag) {
      setTechniqueVideo(null);
      return;
    }
    let cancelled = false;
    api
      .get<TechniqueVideoInfo>(`/technique-videos/${tag}`)
      .then((video) => {
        if (!cancelled) setTechniqueVideo(video);
      })
      .catch(() => {
        if (!cancelled) setTechniqueVideo(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentStep?.technique_tag]);

  // Beim Stufenwechsel auf Schritt 1 zurueckspringen - die Indizes bedeuten
  // je Stufe etwas anderes (unterschiedliche Gruppierung).
  const handleLevelChange = (newLevel: HaubenLevel) => {
    if (newLevel === level) return;
    setUmstellung(true);
    setLevel(newLevel);
    setCurrentIndex(0);
  };

  // Die Sperre endet, wenn beide Nachladevorgaenge durch sind. Der Ref
  // merkt sich, dass ueberhaupt einer begonnen hat - sonst wuerde die
  // Sperre schon im selben Durchlauf wieder aufgehoben, bevor die
  // Anfragen ueberhaupt losgelaufen sind.
  const ladenBegonnen = useRef(false);
  useEffect(() => {
    if (!umstellung) return;
    if (isAdaptingSteps || tippsLaden) {
      ladenBegonnen.current = true;
      return;
    }
    if (ladenBegonnen.current) {
      ladenBegonnen.current = false;
      setUmstellung(false);
    }
  }, [umstellung, isAdaptingSteps, tippsLaden]);

  // Sicherheitsnetz: Antwortet weder Schritt- noch Tippabruf (kein
  // Schluessel, kein Netz), darf der Schirm nicht dauerhaft gesperrt
  // bleiben. Nach acht Sekunden geht es ohne die Umstellung weiter.
  useEffect(() => {
    if (!umstellung) return;
    const timer = setTimeout(() => setUmstellung(false), 8000);
    return () => clearTimeout(timer);
  }, [umstellung]);

  const handleOpenStepTextModal = () => {
    setStepTextDraft(currentStep.text);
    setIsStepTextModalOpen(true);
  };

  const handleSaveStepText = () => {
    if (!recipe || !stepTextDraft.trim()) return;
    // Wie bei der Notiz: immer auf die Original-Schrittliste anwenden, daher
    // nur im Anfaenger-Modus bearbeitbar (siehe Button-Disabled-Zustand).
    const updatedSteps = recipe.steps.map((s) =>
      s.order === currentStep.order ? { ...s, text: stepTextDraft.trim() } : s,
    );
    saveRecipeChangeWithScope(
      { steps: updatedSteps },
      () => setRecipe({ ...recipe, steps: updatedSteps }),
      setIsSavingStepText,
      () => setIsStepTextModalOpen(false),
    );
  };

  const handleDeleteStep = () => {
    if (!recipe) return;
    if (recipe.steps.length <= 1) {
      Alert.alert(t('detail.nichtMoeglich'), t('detail.mindestensEinSchritt'));
      return;
    }
    const updatedSteps = recipe.steps.filter((s) => s.order !== currentStep.order);
    saveRecipeChangeWithScope(
      { steps: updatedSteps },
      () => {
        setRecipe({ ...recipe, steps: updatedSteps });
        // Wurde der letzte Schritt geloescht, auf den jetzt letzten
        // verbleibenden zurueckspringen statt ins Leere zu zeigen.
        setCurrentIndex((prev) => Math.min(prev, updatedSteps.length - 1));
      },
      setIsSavingStepText,
      () => setIsStepTextModalOpen(false),
    );
  };

  const handleOpenIngredientModal = (index: number) => {
    const ing = recipe!.ingredients[index];
    setIngredientDraft({ name: ing.name, amount: ing.amount != null ? String(ing.amount) : '', unit: ing.unit ?? '' });
    setEditingIngredientIndex(index);
  };

  const handleSaveIngredient = () => {
    if (!recipe || editingIngredientIndex === null || !ingredientDraft.name.trim()) return;
    const updatedIngredients = recipe.ingredients.map((ing, i) =>
      i === editingIngredientIndex
        ? {
            name: ingredientDraft.name.trim(),
            amount: ingredientDraft.amount.trim() ? Number(ingredientDraft.amount.trim()) : null,
            unit: ingredientDraft.unit.trim() || null,
          }
        : ing,
    );
    saveRecipeChangeWithScope(
      { ingredients: updatedIngredients },
      () => setRecipe({ ...recipe, ingredients: updatedIngredients }),
      setIsSavingIngredient,
      () => setEditingIngredientIndex(null),
    );
  };

  const handleDeleteIngredient = () => {
    if (!recipe || editingIngredientIndex === null) return;
    const updatedIngredients = recipe.ingredients.filter((_, i) => i !== editingIngredientIndex);
    saveRecipeChangeWithScope(
      { ingredients: updatedIngredients },
      () => setRecipe({ ...recipe, ingredients: updatedIngredients }),
      setIsSavingIngredient,
      () => setEditingIngredientIndex(null),
    );
  };

  const handleOpenNoteModal = () => {
    setNoteDraft(currentStep.user_note ?? '');
    setIsNoteModalOpen(true);
  };

  const handleSaveNote = () => {
    if (!recipe) return;
    // Notizen werden IMMER auf die Original-Schrittliste geschrieben, nicht
    // auf die fuer Fortgeschritten/Profi zusammengefasste Ansicht - dort
    // wuerde "order" mehrere Original-Schritte gleichzeitig meinen, das
    // Bearbeiten ist deshalb bewusst auf die Anfaenger-Stufe beschraenkt
    // (siehe Button-Disabled-Zustand unten).
    const updatedSteps = recipe.steps.map((s) =>
      s.order === currentStep.order ? { ...s, user_note: noteDraft.trim() || null } : s,
    );

    Keyboard.dismiss();
    Alert.alert(
      t('kochen.notizSpeichern'),
      t('kochen.notizFrage'),
      [
        { text: t('allgemein.abbrechen'), style: 'cancel' },
        {
          text: t('detail.nurDiesmal'),
          onPress: () => {
            // NICHT ans Backend schicken - nur lokal fuer die aktuelle
            // Kochsession uebernehmen, das gespeicherte Rezept bleibt
            // unveraendert.
            setRecipe({ ...recipe, steps: updatedSteps });
            setIsNoteModalOpen(false);
          },
        },
        {
          text: t('detail.dauerhaftImRezept'),
          onPress: async () => {
            setIsSavingNote(true);
            try {
              await api.patch(`/recipes/${recipeId}`, { steps: updatedSteps });
              setRecipe({ ...recipe, steps: updatedSteps });
              setIsNoteModalOpen(false);
            } catch (err) {
              Alert.alert(t('allgemein.fehler'), err instanceof ApiError ? err.detail : t('kochen.notizNichtGespeichert'));
            } finally {
              setIsSavingNote(false);
            }
          },
        },
      ],
    );
  };

  const handleOpenTimerEdit = () => {
    setTimerEditDraft(displayedRemainingSeconds !== null ? String(Math.round(displayedRemainingSeconds / 60)) : '');
    setIsEditingTimer(true);
  };

  const handleSaveTimerEdit = () => {
    const minutes = Number(timerEditDraft.trim());
    if (!minutes || minutes <= 0) {
      Alert.alert(t('kochen.ungueltigeZeit'), t('kochen.zahlGroesserNull'));
      return;
    }
    setRemainingSeconds(Math.round(minutes * 60));
    setIsEditingTimer(false);
  };

  const handleStartTimer = async () => {
    setIsTimerRunning(true);
    setActiveTimerStepIndex(currentIndex);
    if (recipe && currentStep && remainingSeconds) {
      const id = await scheduleTimerNotification(recipe.title, currentStep.text, remainingSeconds);
      setTimerNotificationId(id);
    }
  };

  const handlePauseTimer = () => {
    setIsTimerRunning(false);
    cancelTimerNotification(timerNotificationId);
    setTimerNotificationId(null);
  };

  // Beim Schrittwechsel: NUR zuruecksetzen, wenn der neu angezeigte Schritt
  // NICHT der Schritt mit dem laufenden/gestarteten Timer ist. Wechselt man
  // zwischenzeitlich zu einem anderen Schritt, bleibt der Timer im
  // Hintergrund unangetastet weiterlaufen (die Interval-Logik unten haengt
  // nur von isTimerRunning ab, nicht von currentIndex) - erst beim
  // Zurueckwechseln zu einem GANZ ANDEREN, timer-losen Schritt wird
  // zurueckgesetzt.
  useEffect(() => {
    if (activeTimerStepIndex !== null && activeTimerStepIndex === currentIndex) {
      return; // dieser Schritt hat den aktiven Timer - Anzeige unveraendert lassen
    }
    if (activeTimerStepIndex === null) {
      // Kein Timer aktiv irgendwo - normales Zuruecksetzen auf den
      // Startwert des jetzt angezeigten Schritts.
      setRemainingSeconds(currentStep ? getEffectiveTimerSeconds(currentStep) : null);
    }
    // Ist ein Timer fuer einen ANDEREN Schritt aktiv, wird hier bewusst
    // NICHTS an remainingSeconds/isTimerRunning veraendert - die Anzeige
    // fuer den jetzt sichtbaren (timer-losen oder eigenen) Schritt wird
    // weiter unten beim Rendern anhand von activeTimerStepIndex entschieden.
  }, [currentIndex]);

  useEffect(() => {
    if (!isTimerRunning) return;

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setIsTimerRunning(false);
          // Zuverlaessiges Tonsignal ueber Sprachausgabe (funktioniert
          // sicher im Vordergrund, unabhaengig davon, ob Benachrichtigungs-
          // Berechtigung erteilt wurde - die geplante Push-Benachrichtigung
          // allein reichte offenbar nicht als verlaessliches Signal).
          Speech.speak(t('kochen.timerFertig'), { language: SPEECH_LANGUAGE });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isTimerRunning]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (error) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg, display: isActive ? 'flex' : 'none' }]}>
        <Text style={{ color: '#DC2626', fontSize: 13 }}>{error}</Text>
      </View>
    );
  }

  if (!recipe || !currentStep) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.bg, display: isActive ? 'flex' : 'none' }]}>
        <ActivityIndicator color={colors.text} />
      </View>
    );
  }

  const totalSteps = derivedSteps.length;
  const isLastStep = currentIndex === totalSteps - 1;

  // Was fuer den JETZT sichtbaren Schritt anzuzeigen ist: laeuft dessen
  // eigener Timer, zeigt sich der echte Live-Countdown; sonst dessen
  // eigene (nicht laufende) Dauer - inklusive einer manuellen Bearbeitung
  // ueber "Timer-Zeit aendern", auch wenn der Timer noch gar nicht
  // gestartet wurde (Bug: vorher wurde in dem Fall IMMER die urspruengliche
  // Schritt-Dauer neu aus dem Rezepttext abgeleitet, eine Bearbeitung VOR
  // dem Start ging dadurch sofort wieder verloren). Nur wenn fuer einen
  // ANDEREN Schritt gerade ein Timer im Hintergrund aktiv ist, wird bewusst
  // dessen eigene (unbearbeitete) Dauer gezeigt statt remainingSeconds, das
  // ja dem Hintergrund-Timer gehoert.
  const isViewingActiveTimerStep = activeTimerStepIndex === currentIndex;
  const isTimerActiveOnOtherStep = activeTimerStepIndex !== null && activeTimerStepIndex !== currentIndex;
  const displayedRemainingSeconds = isTimerActiveOnOtherStep
    ? (currentStep ? getEffectiveTimerSeconds(currentStep) : null)
    : remainingSeconds;
  const displayedIsTimerRunning = isViewingActiveTimerStep && isTimerRunning;
  const isTimerRunningElsewhere = !isViewingActiveTimerStep && activeTimerStepIndex !== null && isTimerRunning;

  const goNext = () => {
    if (isLastStep) {
      onFinished(true);
      return;
    }
    setCurrentIndex((i) => i + 1);
  };

  const goBackStep = () => {
    if (currentIndex === 0) {
      onFinished(false);
      return;
    }
    setCurrentIndex((i) => i - 1);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, display: isActive ? 'flex' : 'none' }]}>
      <ScrollView
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag" style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 16 }}>
      {brauchtUebersetzung && (
        <TranslationBanner
          quellsprache={quellsprache}
          zeigtUebersetzung={zeigtUebersetzung}
          vorhanden={!!uebersetzung}
          laeuft={uebersetztGerade}
          fehler={uebersetzungsfehler}
          onUebersetzen={holeUebersetzung}
          onUmschalten={() => setZeigeUebersetzung((v) => !v)}
        />
      )}

      <View style={styles.levelRow}>
        {[1, 2, 3].map((hatCount) => {
          const isFilled = hatCount <= LEVEL_TO_HAT_COUNT[level];
          return (
            <Pressable key={hatCount} onPress={() => handleLevelChange(HAT_COUNT_TO_LEVEL[hatCount])} hitSlop={8}>
              <MaterialCommunityIcons
                name="chef-hat"
                size={20}
                color={isFilled ? gradient[0] : colors.card === '#1F1F1F' ? '#3A3A3A' : '#E7E1D4'}
                style={{ marginRight: 4 }}
              />
            </Pressable>
          );
        })}
      </View>

      <Pressable
        onPress={() => setIsIngredientsOpen((prev) => !prev)}
        style={[styles.ingredientsToggle, { backgroundColor: colors.card, borderRadius: radius.sm }]}
      >
        <Text style={[styles.ingredientsToggleText, { color: colors.text }]}>
          Zutaten ({recipe.ingredients.length})
          {recipe.servings ? `  ·  für ${recipe.servings} Portionen` : ''}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12 }}>{isIngredientsOpen ? '▲' : '▼'}</Text>
      </Pressable>

      {isIngredientsOpen && (
        <View style={[styles.ingredientsList, { backgroundColor: colors.card, borderRadius: radius.sm }]}>
          {recipe.ingredients.map((ing, i) => (
            <Pressable
              key={i}
              onPress={level === 'anfaenger' ? () => handleOpenIngredientModal(i) : undefined}
              style={styles.ingredientRow}
            >
              <Text style={[styles.ingredientLine, { color: colors.text, fontSize: largeText ? 16 : 13.5, flex: 1 }]}>
                {ing.amount ? `${ing.amount} ${ing.unit ?? ''} ` : ''}
                {ing.name}
              </Text>
              {level === 'anfaenger' && <MaterialCommunityIcons name="pencil-outline" size={14} color={colors.muted} />}
            </Pressable>
          ))}
        </View>
      )}

      <Text style={[styles.stepIndicator, { color: colors.muted }]}>
        SCHRITT {currentIndex + 1}/{totalSteps}
      </Text>

      <View style={styles.progressIconsRow}>
        {derivedSteps.map((_, i) => (
          <View key={i} style={styles.progressIconSlot}>
            {activeTimerStepIndex === i && isTimerRunning && (
              <MaterialCommunityIcons name="clock-outline" size={13} color="#3B82F6" />
            )}
          </View>
        ))}
      </View>
      <View style={styles.progressSegmentsRow}>
        {derivedSteps.map((step, i) => {
          const isPassedOrCurrent = i <= currentIndex;
          const hasTimer = getEffectiveTimerSeconds(step) !== null;
          return (
            <View
              key={i}
              style={[
                styles.progressSegment,
                {
                  backgroundColor: isPassedOrCurrent ? gradient[0] : colors.card,
                  // Schritte mit Timer bekommen einen sichtbaren Rahmen in
                  // einer eigenen Akzentfarbe, unabhaengig vom Fortschritt -
                  // so sieht man auf einen Blick, wo noch ein Timer kommt.
                  borderWidth: hasTimer ? 2 : 0,
                  borderColor: '#3B82F6',
                },
              ]}
            />
          );
        })}
      </View>

      {isAdaptingSteps && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <ActivityIndicator size="small" color={colors.muted} />
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            {level === 'anfaenger' ? t('kochen.umstellungAnfaenger') : t('kochen.umstellungProfi')}
          </Text>
        </View>
      )}
      <View style={styles.stepTextRow}>
        <Text style={[styles.stepText, { color: colors.text, fontSize: largeText ? 19 : 17, lineHeight: largeText ? 26 : 24 }]}>
          {currentStep.text}
        </Text>
        {/* Bearbeiten gilt der Originalfassung. Waehrend die Uebersetzung
            angezeigt wird, waere der Stift eine Falle - man aenderte einen
            Text, der so gar nicht dasteht. */}
        {level === 'anfaenger' && !zeigtUebersetzung && (
          <Pressable onPress={handleOpenStepTextModal} style={[styles.speakButton, { backgroundColor: colors.card }]}>
            <MaterialCommunityIcons name="pencil-outline" size={15} color={colors.text} />
          </Pressable>
        )}
        <Pressable onPress={handleSpeak} style={[styles.speakButton, { backgroundColor: isSpeaking ? '#DC2626' : gradient[0] }]}>
          <MaterialCommunityIcons name={isSpeaking ? 'stop' : 'volume-high'} size={16} color="#fff" />
        </Pressable>
      </View>

      {currentStep.technique_tag && (
        <View style={[styles.techniqueBadge, { backgroundColor: colors.card, borderRadius: radius.sm }]}>
          <Text style={[styles.techniqueText, { color: colors.muted }]}>
            Technik: {currentStep.technique_tag.replace(/_/g, ' ')}
          </Text>
        </View>
      )}

      {/* Brutzel nur zeigen, wenn er im Profil eingeschaltet ist. Wer ihn
          dort abschaltet, will ihn nirgends sehen - auch nicht mitten im
          Kochen. */}
      {showBrutzel && (
      <View style={[styles.brutzelCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
        <BrutzelAvatar size={88} variant="full" />
        <View style={{ flex: 1 }}>
          <Text style={[styles.brutzelText, { color: colors.muted }]}>
            <Text style={{ fontWeight: '700', color: gradient[0] }}>{t('kochen.brutzel')}</Text>
            {brutzelTip}
          </Text>
          <Pressable onPress={() => handleSpeakTip(brutzelTip)} hitSlop={8} style={styles.videoLink}>
            <MaterialCommunityIcons
              name={isSpeakingTip ? 'stop-circle-outline' : 'volume-high'}
              size={15}
              color={gradient[0]}
            />
            <Text style={[styles.videoLinkText, { color: gradient[0] }]}>
              {isSpeakingTip ? t('kochen.stopp') : t('kochen.vorlesen')}
            </Text>
          </Pressable>
          {techniqueVideo?.available && techniqueVideo.youtube_video_id && (
            <Pressable
              onPress={() => {
                // openURL wirft, wenn keine App den Link oeffnen kann -
                // ohne catch reisst das den Koch-Modus mit.
                Linking.openURL(`https://www.youtube.com/watch?v=${techniqueVideo.youtube_video_id}`).catch(() => {});
              }}
              style={styles.videoLink}
            >
              <MaterialCommunityIcons name="youtube" size={15} color="#DC2626" />
              <Text style={[styles.videoLinkText, { color: gradient[0] }]}>{t('kochen.technikVideo')}</Text>
            </Pressable>
          )}
        </View>
      </View>
      )}

      {currentStep.user_note ? (
        <Pressable
          onPress={level === 'anfaenger' ? handleOpenNoteModal : undefined}
          style={[styles.noteCard, { opacity: level === 'anfaenger' ? 1 : 0.85 }]}
        >
          <Text style={styles.noteLabel}>📌 Deine Notiz {level === 'anfaenger' ? '(antippen zum Bearbeiten)' : ''}</Text>
          <Text style={styles.noteText}>{currentStep.user_note}</Text>
        </Pressable>
      ) : level === 'anfaenger' ? (
        <Pressable onPress={handleOpenNoteModal} style={[styles.addNoteButton, { borderColor: colors.muted, borderRadius: radius.sm }]}>
          <MaterialCommunityIcons name="note-plus-outline" size={14} color={colors.muted} />
          <Text style={[styles.addNoteText, { color: colors.muted }]}>{t('kochen.notizHinzufuegen')}</Text>
        </Pressable>
      ) : null}

      {isTimerRunningElsewhere && (
        <View style={[styles.timerElsewhereBanner, { backgroundColor: colors.card, borderRadius: radius.sm }]}>
          <MaterialCommunityIcons name="timer-sand" size={14} color={gradient[0]} />
          <Text style={[styles.timerElsewhereText, { color: colors.muted }]}>
            Timer läuft weiter für Schritt {(activeTimerStepIndex ?? 0) + 1} · noch {formatTime(remainingSeconds ?? 0)}
          </Text>
        </View>
      )}

      {displayedRemainingSeconds !== null && (
        <View style={[styles.timerCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <Text style={[styles.timerLabel, { color: colors.muted }]}>
            {displayedIsTimerRunning ? 'TIMER LÄUFT' : displayedRemainingSeconds === 0 ? 'FERTIG' : 'TIMER'}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Text style={[styles.timerValue, { color: gradient[0] }]}>{formatTime(displayedRemainingSeconds)}</Text>
            {!isTimerRunningElsewhere && (
              <Pressable onPress={handleOpenTimerEdit} hitSlop={10}>
                <MaterialCommunityIcons name="pencil-outline" size={18} color={colors.muted} />
              </Pressable>
            )}
          </View>
          {!displayedIsTimerRunning && displayedRemainingSeconds > 0 && (
            <Pressable onPress={handleStartTimer} style={[styles.timerButton, { backgroundColor: gradient[0], borderRadius: radius.sm }]}>
              <Text style={styles.timerButtonText}>{t('kochen.timerStarten')}</Text>
            </Pressable>
          )}
          {displayedIsTimerRunning && (
            <Pressable onPress={handlePauseTimer} style={[styles.timerButton, { backgroundColor: colors.bg, borderRadius: radius.sm }]}>
              <Text style={[styles.timerButtonText, { color: colors.text }]}>{t('kochen.pausieren')}</Text>
            </Pressable>
          )}
        </View>
      )}
      </ScrollView>

      <View style={styles.navRow}>
        <Pressable onPress={goBackStep} style={[styles.navButtonSecondary, { borderColor: colors.muted, borderRadius: radius.md }]}>
          <Text style={[styles.navButtonSecondaryText, { color: colors.muted }]}>{t('allgemein.zurueck')}</Text>
        </Pressable>
        <Pressable onPress={goNext} style={[styles.navButtonPrimary, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
          <Text style={styles.navButtonPrimaryText}>{isLastStep ? t('allgemein.fertig') : t('allgemein.weiter')}</Text>
        </Pressable>
      </View>

      <Modal visible={isNoteModalOpen} transparent animationType="fade" onRequestClose={() => setIsNoteModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('kochen.notizZuSchritt')}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
              placeholder={t('kochen.notizPlatzhalter')}
              placeholderTextColor={colors.muted}
              value={noteDraft}
              onChangeText={setNoteDraft}
              multiline
              autoFocus
            />
            <View style={styles.modalButtonRow}>
              <Pressable onPress={() => { Keyboard.dismiss(); setIsNoteModalOpen(false); }} style={styles.modalCancelButton}>
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>{t('allgemein.abbrechen')}</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveNote}
                disabled={isSavingNote}
                style={[styles.modalSaveButton, { backgroundColor: gradient[0], borderRadius: radius.sm, opacity: isSavingNote ? 0.7 : 1 }]}
              >
                {isSavingNote ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>{t('allgemein.speichern')}</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isStepTextModalOpen} transparent animationType="fade" onRequestClose={() => setIsStepTextModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('kochen.kochschrittBearbeiten')}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
              value={stepTextDraft}
              onChangeText={setStepTextDraft}
              multiline
              autoFocus
            />
            <View style={[styles.modalButtonRow, { justifyContent: 'space-between' }]}>
              <Pressable onPress={handleDeleteStep} hitSlop={8}>
                <MaterialCommunityIcons name="trash-can-outline" size={22} color="#DC2626" />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <Pressable onPress={() => { Keyboard.dismiss(); setIsStepTextModalOpen(false); }} style={styles.modalCancelButton}>
                  <Text style={[styles.modalCancelText, { color: colors.muted }]}>{t('allgemein.abbrechen')}</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveStepText}
                  disabled={isSavingStepText}
                  style={[styles.modalSaveButton, { backgroundColor: gradient[0], borderRadius: radius.sm, opacity: isSavingStepText ? 0.7 : 1 }]}
                >
                  {isSavingStepText ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>{t('allgemein.speichern')}</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={editingIngredientIndex !== null} transparent animationType="fade" onRequestClose={() => setEditingIngredientIndex(null)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('kochen.zutatBearbeiten')}</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md, marginBottom: 8 }]}
              placeholder={t('kochen.name')}
              placeholderTextColor={colors.muted}
              value={ingredientDraft.name}
              onChangeText={(v) => setIngredientDraft((prev) => ({ ...prev, name: v }))}
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[styles.modalInput, { flex: 1, backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
                placeholder={t('kochen.menge')}
                placeholderTextColor={colors.muted}
                keyboardType="numeric"
                value={ingredientDraft.amount}
                onChangeText={(v) => setIngredientDraft((prev) => ({ ...prev, amount: v }))}
              />
              <TextInput
                style={[styles.modalInput, { flex: 1, backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
                placeholder={t('kochen.einheit')}
                placeholderTextColor={colors.muted}
                value={ingredientDraft.unit}
                onChangeText={(v) => setIngredientDraft((prev) => ({ ...prev, unit: v }))}
              />
            </View>
            <View style={[styles.modalButtonRow, { justifyContent: 'space-between' }]}>
              <Pressable onPress={handleDeleteIngredient} hitSlop={8}>
                <MaterialCommunityIcons name="trash-can-outline" size={22} color="#DC2626" />
              </Pressable>
              <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
                <Pressable onPress={() => { Keyboard.dismiss(); setEditingIngredientIndex(null); }} style={styles.modalCancelButton}>
                  <Text style={[styles.modalCancelText, { color: colors.muted }]}>{t('allgemein.abbrechen')}</Text>
                </Pressable>
                <Pressable
                  onPress={handleSaveIngredient}
                  disabled={isSavingIngredient}
                  style={[styles.modalSaveButton, { backgroundColor: gradient[0], borderRadius: radius.sm, opacity: isSavingIngredient ? 0.7 : 1 }]}
                >
                  {isSavingIngredient ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>{t('allgemein.speichern')}</Text>}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={isEditingTimer} transparent animationType="fade" onRequestClose={() => setIsEditingTimer(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>{t('kochen.timerZeitAendern')}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <TextInput
                style={[styles.modalInput, { flex: 1, backgroundColor: colors.card, color: colors.text, borderRadius: radius.md, textAlign: 'center', fontSize: 20 }]}
                keyboardType="numeric"
                value={timerEditDraft}
                onChangeText={setTimerEditDraft}
                autoFocus
              />
              <Text style={{ color: colors.muted, fontSize: 13 }}>{t('kochen.minuten')}</Text>
            </View>
            <View style={styles.modalButtonRow}>
              <Pressable onPress={() => { Keyboard.dismiss(); setIsEditingTimer(false); }} style={styles.modalCancelButton}>
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>{t('allgemein.abbrechen')}</Text>
              </Pressable>
              <Pressable
                onPress={() => { Keyboard.dismiss(); handleSaveTimerEdit(); }}
                style={[styles.modalSaveButton, { backgroundColor: gradient[0], borderRadius: radius.sm }]}
              >
                <Text style={styles.modalSaveText}>Übernehmen</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {umstellung && (
        <View style={styles.umstellungOverlay}>
          <View style={[styles.umstellungKarte, { backgroundColor: colors.card, borderRadius: radius.md }]}>
            <ActivityIndicator color={gradient[0]} />
            <Text style={[styles.umstellungText, { color: colors.text }]}>
              {level === 'anfaenger'
                ? t('kochen.umstellungAnfaenger')
                : level === 'profi'
                  ? t('kochen.umstellungProfi')
                  : t('kochen.umstellungAllgemein')}
            </Text>
            <Text style={[styles.umstellungHinweis, { color: colors.muted }]}>
              {t('kochen.umstellungHinweis')}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // Deckt den ganzen Schirm ab und schluckt Beruehrungen: Waehrend der
  // Umstellung stehen Schritte und Tipps noch aus verschiedenen Fassungen
  // nebeneinander. Weiterblaettern waere da nicht nur verwirrend, sondern
  // am Herd auch gefaehrlich.
  umstellungOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  umstellungKarte: { padding: 22, alignItems: 'center', maxWidth: 320 },
  umstellungText: { fontSize: 14.5, fontWeight: '600', textAlign: 'center', marginTop: 12 },
  umstellungHinweis: { fontSize: 12, textAlign: 'center', marginTop: 6 },
  container: { flex: 1, padding: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  levelRow: { flexDirection: 'row', marginBottom: 12 },
  ingredientsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, marginBottom: 4 },
  ingredientsToggleText: { fontSize: 12.5, fontWeight: '600' },
  ingredientsList: { padding: 12, marginBottom: 16 },
  ingredientLine: { fontSize: 12.5, lineHeight: 20 },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  stepIndicator: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  progressSegmentsRow: { flexDirection: 'row', gap: 4, marginBottom: 24 },
  progressSegment: { flex: 1, height: 6, borderRadius: 3 },
  progressIconsRow: { flexDirection: 'row', gap: 4, marginBottom: 3, height: 14 },
  progressIconSlot: { flex: 1, alignItems: 'center' },
  stepTextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  stepText: { flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '400' },
  speakButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  techniqueBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
  techniqueText: { fontSize: 11, textTransform: 'capitalize' },
  brutzelCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, marginBottom: 10 },
  brutzelText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  videoLink: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  videoLinkText: { fontSize: 11.5, fontWeight: '700' },
  noteCard: { backgroundColor: '#FEF3C7', borderRadius: 12, padding: 10, marginBottom: 16 },
  noteLabel: { fontSize: 10.5, fontWeight: '600', color: '#92400E', marginBottom: 3 },
  noteText: { fontSize: 11.5, fontStyle: 'italic', color: '#78350F' },
  addNoteButton: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 9, paddingHorizontal: 12, marginBottom: 16, alignSelf: 'flex-start' },
  addNoteText: { fontSize: 11.5 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', padding: 30 },
  modalCard: { padding: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', marginBottom: 14 },
  modalInput: { minHeight: 80, paddingHorizontal: 14, paddingVertical: 12, fontSize: 13.5, marginBottom: 16, textAlignVertical: 'top' },
  modalButtonRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 16, alignItems: 'center' },
  modalCancelButton: { paddingVertical: 8, paddingHorizontal: 4 },
  modalCancelText: { fontSize: 13, fontWeight: '600' },
  modalSaveButton: { paddingHorizontal: 18, paddingVertical: 10, minWidth: 80, alignItems: 'center' },
  modalSaveText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  timerCard: { padding: 20, alignItems: 'center', marginBottom: 20 },
  timerElsewhereBanner: { flexDirection: 'row', alignItems: 'center', gap: 7, padding: 10, marginBottom: 10 },
  timerElsewhereText: { fontSize: 11.5, fontWeight: '600', flex: 1 },
  timerLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5, marginBottom: 6 },
  timerValue: { fontSize: 32, fontWeight: '700', marginBottom: 12 },
  timerButton: { paddingHorizontal: 20, paddingVertical: 10 },
  timerButtonText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 'auto' },
  navButtonSecondary: { flex: 1, height: 50, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  navButtonSecondaryText: { fontWeight: '600', fontSize: 14 },
  navButtonPrimary: { flex: 2, height: 50, alignItems: 'center', justifyContent: 'center' },
  navButtonPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
