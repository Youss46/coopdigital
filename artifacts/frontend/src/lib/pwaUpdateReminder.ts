export const PWA_UPDATE_REMINDER_DELAY_MS = 10 * 60 * 1000;
export const PWA_UPDATE_REMINDER_KEY = "coop_pwa_update_reminder_at";

type ReminderStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function getPwaUpdateReminderAt(storage: ReminderStorage): number | null {
  try {
    const value = storage.getItem(PWA_UPDATE_REMINDER_KEY);
    if (value === null) return null;

    const timestamp = Number(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
  } catch {
    return null;
  }
}

export function getPwaUpdateReminderDelay(
  storage: ReminderStorage,
  now = Date.now(),
): number | null {
  const reminderAt = getPwaUpdateReminderAt(storage);
  return reminderAt === null ? null : Math.max(0, reminderAt - now);
}

export function deferPwaUpdateReminder(
  storage: ReminderStorage,
  now = Date.now(),
): number {
  const reminderAt = now + PWA_UPDATE_REMINDER_DELAY_MS;
  try {
    storage.setItem(PWA_UPDATE_REMINDER_KEY, String(reminderAt));
  } catch {
    // Keep the in-memory timer even if persistent storage is unavailable.
  }
  return reminderAt;
}

export function clearPwaUpdateReminder(storage: ReminderStorage): void {
  try {
    storage.removeItem(PWA_UPDATE_REMINDER_KEY);
  } catch {
    // The next page load will simply ask about the update again.
  }
}
