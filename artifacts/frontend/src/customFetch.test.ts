import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, customFetch, setOnUnauthorized } from "@workspace/api-client-react";

describe("customFetch account access errors", () => {
  afterEach(() => {
    setOnUnauthorized(null);
    vi.unstubAllGlobals();
  });

  it("notifies the session handler for a disabled account", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            code: "ROLE_DISABLED",
            erreur: "Votre compte est désactivé. Veuillez contacter le PCA.",
          }),
          { status: 403, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    setOnUnauthorized(onUnauthorized);

    await expect(customFetch("/api/dashboard")).rejects.toBeInstanceOf(ApiError);

    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(onUnauthorized.mock.calls[0]?.[0]).toMatchObject({
      status: 403,
      data: {
        code: "ROLE_DISABLED",
      },
    });
  });

  it("keeps the existing session handler behavior for an expired token", async () => {
    const onUnauthorized = vi.fn();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ erreur: "Token invalide ou expiré" }),
          { status: 401, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    setOnUnauthorized(onUnauthorized);

    await expect(customFetch("/api/dashboard")).rejects.toBeInstanceOf(ApiError);

    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(onUnauthorized.mock.calls[0]?.[0]).toMatchObject({ status: 401 });
  });
});