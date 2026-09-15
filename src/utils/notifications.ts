import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

/**
 * Timer-Push-Benachrichtigungen: wenn die App im Hintergrund ist und ein
 * Kochtimer ablaeuft, soll der Nutzer trotzdem benachrichtigt werden (siehe
 * Umsetzungskonzept, Abschnitt "paralleles Kochen" - Timer laeuft weiter,
 * auch wenn man gerade nicht in der App ist).
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  if (existingStatus === 'granted') return true;

  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

/**
 * Plant eine lokale Benachrichtigung fuer den Moment, an dem der Timer
 * ablaeuft. Gibt die Notification-ID zurueck, die zum Abbrechen (Pause/
 * Schrittwechsel) gebraucht wird - oder null, wenn keine Berechtigung
 * vorliegt (Timer laeuft dann trotzdem weiter, nur ohne Push).
 */
export async function scheduleTimerNotification(recipeTitle: string, stepText: string, secondsFromNow: number): Promise<string | null> {
  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission || secondsFromNow <= 0) return null;

  return Notifications.scheduleNotificationAsync({
    content: {
      title: `Timer fertig: ${recipeTitle}`,
      body: stepText.length > 80 ? `${stepText.slice(0, 80)}…` : stepText,
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: secondsFromNow,
      ...(Platform.OS === 'android' ? { channelId: 'timer' } : {}),
    },
  });
}

export async function cancelTimerNotification(notificationId: string | null): Promise<void> {
  if (!notificationId) return;
  await Notifications.cancelScheduledNotificationAsync(notificationId);
}

/** Android braucht einen expliziten Notification-Channel, sonst werden
 * Sound/Priority-Einstellungen ignoriert. iOS braucht das nicht. */
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('timer', {
    name: 'Kochtimer',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
  });
}
