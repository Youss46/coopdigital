import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  FEATURE_ACCESS_DENIAL_SPIKE_THRESHOLD,
  FEATURE_ACCESS_DENIAL_WINDOW_MS,
  recordFeatureAccessDenied,
  resetFeatureAccessDenialMetrics,
} from "../services/featureAccessMetrics.js";
import { OPERATIONS_ALERT_CHANNEL } from "../lib/logger.js";

describe("feature access denial metrics", () => {
  const logger = { warn: vi.fn() };
  const context = {
    cooperativeId: 17,
    featureKey: "stocks",
    mode: "disabled" as const,
    method: "post",
  };

  beforeEach(() => {
    resetFeatureAccessDenialMetrics();
    logger.warn.mockClear();
    vi.useRealTimers();
  });

  it("counts refusals by cooperative, feature, and mode", () => {
    expect(recordFeatureAccessDenied(context, logger)).toBe(1);
    expect(recordFeatureAccessDenied(context, logger)).toBe(2);
    expect(recordFeatureAccessDenied({ ...context, mode: "lecture_seule" }, logger)).toBe(1);
    expect(recordFeatureAccessDenied({ ...context, cooperativeId: 18 }, logger)).toBe(1);

    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({
      event: "feature_access_denied",
      cooperativeId: 17,
      featureKey: "stocks",
      mode: "disabled",
      method: "POST",
      denialCount: 2,
      windowSeconds: FEATURE_ACCESS_DENIAL_WINDOW_MS / 1000,
    }), expect.any(String));
  });

  it("emits one explicit spike event at the operational threshold", () => {
    for (let i = 0; i < FEATURE_ACCESS_DENIAL_SPIKE_THRESHOLD; i += 1) {
      recordFeatureAccessDenied(context, logger);
    }

    const spikeCalls = logger.warn.mock.calls.filter(([fields]) => fields.event === "feature_access_denied_spike");
    expect(spikeCalls).toHaveLength(1);
    expect(spikeCalls[0][0]).toMatchObject({
      channel: OPERATIONS_ALERT_CHANNEL,
      cooperativeId: 17,
      featureKey: "stocks",
      mode: "disabled",
      denialCount: FEATURE_ACCESS_DENIAL_SPIKE_THRESHOLD,
      threshold: FEATURE_ACCESS_DENIAL_SPIKE_THRESHOLD,
    });
  });

  it("keeps the operations alert limited to approved operational fields", () => {
    for (let i = 0; i < FEATURE_ACCESS_DENIAL_SPIKE_THRESHOLD; i += 1) {
      recordFeatureAccessDenied(context, logger);
    }

    const spikeFields = logger.warn.mock.calls
      .map(([fields]) => fields)
      .find((fields) => fields.event === "feature_access_denied_spike");

    expect(spikeFields).toEqual({
      channel: OPERATIONS_ALERT_CHANNEL,
      event: "feature_access_denied_spike",
      cooperativeId: 17,
      featureKey: "stocks",
      mode: "disabled",
      denialCount: FEATURE_ACCESS_DENIAL_SPIKE_THRESHOLD,
      windowSeconds: FEATURE_ACCESS_DENIAL_WINDOW_MS / 1000,
      threshold: FEATURE_ACCESS_DENIAL_SPIKE_THRESHOLD,
    });
  });

  it("starts a new count after the five-minute window", () => {
    vi.useFakeTimers();
    const start = new Date("2026-08-29T15:00:00.000Z");
    vi.setSystemTime(start);
    expect(recordFeatureAccessDenied(context, logger)).toBe(1);

    vi.advanceTimersByTime(FEATURE_ACCESS_DENIAL_WINDOW_MS);
    expect(recordFeatureAccessDenied(context, logger)).toBe(1);
  });

  it("does not log request data or credentials", () => {
    recordFeatureAccessDenied(context, logger);

    const fields = logger.warn.mock.calls[0][0];
    expect(fields).not.toHaveProperty("url");
    expect(fields).not.toHaveProperty("userId");
    expect(fields).not.toHaveProperty("authorization");
    expect(fields).not.toHaveProperty("body");
  });
});