import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Modal, TextInput, Linking, Alert } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import * as Speech from 'expo-speech';
import { useTheme } from '../theme/ThemeContext';
import { api, ApiError } from '../api/client';
import { deriveStepsForLevel, HaubenLevel, RecipeStep } from '../utils/stepLevels';
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
}

const LEVEL_TO_HAT_COUNT: Record<HaubenLevel, number> = { anfaenger: 1, fortgeschritten: 2, profi: 3 };
const HAT_COUNT_TO_LEVEL: Record<number, HaubenLevel> = { 1: 'anfaenger', 2: 'fortgeschritten', 3: 'profi' };

function formatTime(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const BRUTZEL_TIPS: Record<string, string> = {
  mehlieren: 'Erst kurz vorm Braten mehlieren, sonst wird die Kruste matschig statt knusprig.',
  zwiebel_schneiden: 'Gleichmäßige Ringe/Würfel braten gleichmäßiger durch.',
  koecheln_lassen: 'Nicht sprudelnd kochen lassen – nur leise Bläschen, sonst wird die Suppe trüb.',
};

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
  onFinished: () => void; // vom Elternteil gesteuert statt navigation.goBack(),
  // da mehrere Tabs sich nicht jeweils eigenstaendig "zurueck" navigieren sollen
}

export default function SingleRecipeCookView({ recipeId, isActive, onTitleLoaded, onFinished }: Props) {
  const { colors, gradient, radius } = useTheme();

  const [recipe, setRecipe] = useState<RecipeForCooking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<HaubenLevel>('fortgeschritten');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isIngredientsOpen, setIsIngredientsOpen] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [autoReadSteps, setAutoReadSteps] = useState(false);
  const [techniqueVideo, setTechniqueVideo] = useState<TechniqueVideoInfo | null>(null);
  const [isNoteModalOpen, setIsNoteModalOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  useEffect(() => {
    api
      .get<{ auto_read_steps: boolean; default_hauben_level: HaubenLevel }>('/preferences/')
      .then((prefs) => {
        setAutoReadSteps(prefs.auto_read_steps);
        setLevel(prefs.default_hauben_level);
      })
      .catch(() => {
        // Praeferenz konnte nicht geladen werden - Auto-Vorlesen bleibt aus,
        // Hauben-Stufe bleibt beim Fallback 'fortgeschritten', kein Grund
        // den ganzen Koch-Modus zu blockieren
      });
  }, []);

  const handleSpeak = () => {
    if (!currentStep) return;
    if (isSpeaking) {
      Speech.stop();
      setIsSpeaking(false);
      return;
    }
    setIsSpeaking(true);
    Speech.speak(currentStep.text, {
      language: 'de-AT',
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
      cancelTimerNotification(timerNotificationIdRef.current);
    };
  }, []);
  useEffect(() => {
    Speech.stop();
    setIsSpeaking(false);
    if (autoReadSteps && currentStep) {
      setIsSpeaking(true);
      Speech.speak(currentStep.text, {
        language: 'de-AT',
        onDone: () => setIsSpeaking(false),
        onStopped: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
    // currentStep bewusst nicht in den Dependencies - haengt schon an
    // currentIndex/level, die Referenz waere bei jedem Render neu
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentIndex, level, autoReadSteps, recipe]);

  // Timer-Zustand: nur aktiv, wenn der aktuelle Schritt timer_seconds hat
  // und der Nutzer ihn gestartet hat. Echtes setInterval, keine Attrappe.
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
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
        setRecipe(data);
        onTitleLoaded?.(data.title);
      })
      .catch((err) => setError(err instanceof ApiError ? err.detail : 'Rezept konnte nicht geladen werden'));
    // onTitleLoaded bewusst nicht in den Dependencies - waere bei jedem
    // Render eine neue Funktionsreferenz vom Elternteil, wuerde den Ladevorgang
    // unnoetig wiederholen. recipeId ist der einzige relevante Trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recipeId]);

  const derivedSteps = recipe ? deriveStepsForLevel(recipe.steps, level) : [];
  const currentStep = derivedSteps[currentIndex];

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
    setLevel(newLevel);
    setCurrentIndex(0);
  };

  const handleOpenNoteModal = () => {
    setNoteDraft(currentStep.user_note ?? '');
    setIsNoteModalOpen(true);
  };

  const handleSaveNote = async () => {
    if (!recipe) return;
    setIsSavingNote(true);
    try {
      // Notizen werden IMMER auf die Original-Schrittliste geschrieben, nicht
      // auf die fuer Fortgeschritten/Profi zusammengefasste Ansicht - dort
      // wuerde "order" mehrere Original-Schritte gleichzeitig meinen, das
      // Bearbeiten ist deshalb bewusst auf die Anfaenger-Stufe beschraenkt
      // (siehe Button-Disabled-Zustand unten).
      const updatedSteps = recipe.steps.map((s) =>
        s.order === currentStep.order ? { ...s, user_note: noteDraft.trim() || null } : s,
      );
      await api.patch(`/recipes/${recipeId}`, { steps: updatedSteps });
      setRecipe({ ...recipe, steps: updatedSteps });
      setIsNoteModalOpen(false);
    } catch (err) {
      Alert.alert('Fehler', err instanceof ApiError ? err.detail : 'Notiz konnte nicht gespeichert werden');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleStartTimer = async () => {
    setIsTimerRunning(true);
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

  // Beim Schrittwechsel: laufenden Timer stoppen, neuen Startwert setzen
  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsTimerRunning(false);
    cancelTimerNotification(timerNotificationId);
    setTimerNotificationId(null);
    setRemainingSeconds(currentStep?.timer_seconds ?? null);
  }, [currentIndex, currentStep?.timer_seconds]);

  useEffect(() => {
    if (!isTimerRunning) return;

    intervalRef.current = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev === null) return null;
        if (prev <= 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          setIsTimerRunning(false);
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
  const progress = (currentIndex + 1) / totalSteps;
  const isLastStep = currentIndex === totalSteps - 1;

  const goNext = () => {
    if (isLastStep) {
      onFinished();
      return;
    }
    setCurrentIndex((i) => i + 1);
  };

  const goBackStep = () => {
    if (currentIndex === 0) {
      onFinished();
      return;
    }
    setCurrentIndex((i) => i - 1);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg, display: isActive ? 'flex' : 'none' }]}>
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
            <Text key={i} style={[styles.ingredientLine, { color: colors.text }]}>
              {ing.amount ? `${ing.amount} ${ing.unit ?? ''} ` : ''}
              {ing.name}
            </Text>
          ))}
        </View>
      )}

      <Text style={[styles.stepIndicator, { color: colors.muted }]}>
        SCHRITT {currentIndex + 1}/{totalSteps}
      </Text>

      <View style={[styles.progressTrack, { backgroundColor: colors.card }]}>
        <View style={[styles.progressFill, { width: `${progress * 100}%`, backgroundColor: gradient[0] }]} />
      </View>

      <View style={styles.stepTextRow}>
        <Text style={[styles.stepText, { color: colors.text }]}>{currentStep.text}</Text>
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

      {currentStep.technique_tag && (
        <View style={[styles.brutzelCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <BrutzelAvatar size={26} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.brutzelText, { color: colors.muted }]}>
              <Text style={{ fontWeight: '700', color: gradient[0] }}>Brutzel: </Text>
              {BRUTZEL_TIPS[currentStep.technique_tag] ??
                'Bei dieser Technik lohnt sich besondere Aufmerksamkeit – nimm dir kurz Zeit dafür.'}
            </Text>
            {techniqueVideo?.available && techniqueVideo.youtube_video_id && (
              <Pressable
                onPress={() => Linking.openURL(`https://www.youtube.com/watch?v=${techniqueVideo.youtube_video_id}`)}
                style={styles.videoLink}
              >
                <MaterialCommunityIcons name="youtube" size={15} color="#DC2626" />
                <Text style={[styles.videoLinkText, { color: gradient[0] }]}>Technik-Video ansehen</Text>
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
          <Text style={[styles.addNoteText, { color: colors.muted }]}>Notiz zu diesem Schritt hinzufügen</Text>
        </Pressable>
      ) : null}

      {remainingSeconds !== null && (
        <View style={[styles.timerCard, { backgroundColor: colors.card, borderRadius: radius.md }]}>
          <Text style={[styles.timerLabel, { color: colors.muted }]}>
            {isTimerRunning ? 'TIMER LÄUFT' : remainingSeconds === 0 ? 'FERTIG' : 'TIMER'}
          </Text>
          <Text style={[styles.timerValue, { color: gradient[0] }]}>{formatTime(remainingSeconds)}</Text>
          {!isTimerRunning && remainingSeconds > 0 && (
            <Pressable onPress={handleStartTimer} style={[styles.timerButton, { backgroundColor: gradient[0], borderRadius: radius.sm }]}>
              <Text style={styles.timerButtonText}>Timer starten</Text>
            </Pressable>
          )}
          {isTimerRunning && (
            <Pressable onPress={handlePauseTimer} style={[styles.timerButton, { backgroundColor: colors.bg, borderRadius: radius.sm }]}>
              <Text style={[styles.timerButtonText, { color: colors.text }]}>Pausieren</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.navRow}>
        <Pressable onPress={goBackStep} style={[styles.navButtonSecondary, { borderColor: colors.muted, borderRadius: radius.md }]}>
          <Text style={[styles.navButtonSecondaryText, { color: colors.muted }]}>Zurück</Text>
        </Pressable>
        <Pressable onPress={goNext} style={[styles.navButtonPrimary, { backgroundColor: gradient[0], borderRadius: radius.md }]}>
          <Text style={styles.navButtonPrimaryText}>{isLastStep ? 'Fertig' : 'Weiter'}</Text>
        </Pressable>
      </View>

      <Modal visible={isNoteModalOpen} transparent animationType="fade" onRequestClose={() => setIsNoteModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, { backgroundColor: colors.bg, borderRadius: radius.lg }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Notiz zu diesem Schritt</Text>
            <TextInput
              style={[styles.modalInput, { backgroundColor: colors.card, color: colors.text, borderRadius: radius.md }]}
              placeholder="z.B. Beim letzten Mal weniger Salz genommen"
              placeholderTextColor={colors.muted}
              value={noteDraft}
              onChangeText={setNoteDraft}
              multiline
              autoFocus
            />
            <View style={styles.modalButtonRow}>
              <Pressable onPress={() => setIsNoteModalOpen(false)} style={styles.modalCancelButton}>
                <Text style={[styles.modalCancelText, { color: colors.muted }]}>Abbrechen</Text>
              </Pressable>
              <Pressable
                onPress={handleSaveNote}
                disabled={isSavingNote}
                style={[styles.modalSaveButton, { backgroundColor: gradient[0], borderRadius: radius.sm, opacity: isSavingNote ? 0.7 : 1 }]}
              >
                {isSavingNote ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalSaveText}>Speichern</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  levelRow: { flexDirection: 'row', marginBottom: 12 },
  ingredientsToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, marginBottom: 4 },
  ingredientsToggleText: { fontSize: 12.5, fontWeight: '600' },
  ingredientsList: { padding: 12, marginBottom: 16 },
  ingredientLine: { fontSize: 12.5, lineHeight: 20 },
  stepIndicator: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 10 },
  progressTrack: { height: 4, borderRadius: 2, overflow: 'hidden', marginBottom: 24 },
  progressFill: { height: '100%' },
  stepTextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 14 },
  stepText: { flex: 1, fontSize: 16, lineHeight: 24, fontWeight: '400' },
  speakButton: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  techniqueBadge: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, marginBottom: 10 },
  techniqueText: { fontSize: 11, textTransform: 'capitalize' },
  brutzelCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, padding: 10, marginBottom: 10 },
  brutzelText: { flex: 1, fontSize: 12, lineHeight: 17 },
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
