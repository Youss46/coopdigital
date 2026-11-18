import { beforeEach, describe, expect, it } from "vitest";
import {
  clearPwaUpdateReminder,
  deferPwaUpdateReminder,
  getPwaUpdateReminderAt,
  getPwaUpdateReminderDelay,
  PWA_UPDATE_REMINDER_DELAY_MS,
  PWA_UPDATE_REMINDER_KEY,
} from "./pwaUpdateReminder";

describe("rappel des mises à jour PWA", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("programme le rappel exactement dix minutes plus tard", () => {
    const now = 1_800_000_000_000;

    expect(deferPwaUpdateReminder(localStorage, now)).toBe(
      now + 10 * 60 * 1000,
    );
    expect(PWA_UPDATE_REMINDER_DELAY_MS).toBe(600_000);
    expect(localStorage.getItem(PWA_UPDATE_REMINDER_KEY)).toBe(
      String(now + 600_000),
    );
  });

  it("calcule le temps restant et considère le rappel arrivé à l’échéance", () => {
    const now = 1_800_000_000_000;
    deferPwaUpdateReminder(localStorage, now);

    expect(getPwaUpdateReminderDelay(localStorage, now + 599_999)).toBe(1);
    expect(getPwaUpdateReminderDelay(localStorage, now + 600_000)).toBe(0);
    expect(getPwaUpdateReminderAt(localStorage)).toBe(now + 600_000);
  });

  it("efface le rappel après mise à jour", () => {
    deferPwaUpdateReminder(localStorage, 1_800_000_000_000);

    clearPwaUpdateReminder(localStorage);

    expect(getPwaUpdateReminderAt(localStorage)).toBeNull();
  });
});
