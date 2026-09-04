import { describe, expect, it, vi } from "vitest";
import { hasPermission } from "../middlewares/permissions.js";
import { ObjectStorageService, objectStorageClient } from "../lib/objectStorage.js";
import {
  cleanupOrphanedRhDocuments,
  inclusiveDays,
  validateRhDocumentFile,
} from "../controllers/ressourcesHumainesController.js";

describe("module RH", () => {
  it("calcule les jours de congé sur une période inclusive", () => {
    expect(inclusiveDays("2026-08-01", "2026-08-01")).toBe(1);
    expect(inclusiveDays("2026-08-01", "2026-08-05")).toBe(5);
  });

  it("sépare les responsabilités RH de la paie", () => {
    expect(hasPermission("responsable_rh", "rh", "lire")).toBe(true);
    expect(hasPermission("responsable_rh", "rh", "gerer_contrats")).toBe(true);
    expect(hasPermission("responsable_rh", "salaires", "generer_bulletins")).toBe(true);
    expect(hasPermission("comptable", "rh", "lire")).toBe(true);
    expect(hasPermission("comptable", "rh", "modifier_dossier")).toBe(false);
    expect(hasPermission("auditeur", "rh", "lire")).toBe(true);
    expect(hasPermission("auditeur", "rh", "gerer_documents")).toBe(false);
  });

  it("limite la visibilité et les actions du module Salaires", () => {
    const actions = [
      "creer_personnel",
      "modifier_personnel",
      "supprimer_personnel",
      "generer_bulletins",
      "valider_bulletins",
      "payer_bulletins",
      "supprimer_bulletin",
      "gerer_avances",
    ];

    for (const role of ["pca", "directeur", "comptable", "responsable_rh"]) {
      expect(hasPermission(role, "salaires", "lire")).toBe(true);
    }
    for (const role of ["comptable", "responsable_rh"]) {
      for (const action of actions) {
        expect(hasPermission(role, "salaires", action)).toBe(true);
      }
    }
    for (const role of ["pca", "directeur", "auditeur"]) {
      expect(hasPermission(role, "salaires", "lire")).toBe(role !== "auditeur");
      for (const action of actions) {
        expect(hasPermission(role, "salaires", action)).toBe(false);
      }
    }
  });

  it("contrôle le format, le type MIME, la taille et la signature des pièces RH", () => {
    expect(validateRhDocumentFile({
      originalname: "attestation.pdf",
      mimetype: "application/pdf",
      size: 128,
      buffer: Buffer.from("%PDF-1.7"),
    })).toBeNull();
    expect(validateRhDocumentFile({
      originalname: "attestation.exe",
      mimetype: "application/octet-stream",
      size: 128,
    })).toContain("Format non supporté");
    expect(validateRhDocumentFile({
      originalname: "attestation.pdf",
      mimetype: "application/pdf",
      size: 10 * 1024 * 1024 + 1,
    })).toContain("10 Mo");
    expect(validateRhDocumentFile({
      originalname: "attestation.pdf",
      mimetype: "application/pdf",
      size: 128,
      buffer: Buffer.from("not a PDF"),
    })).toContain("contenu");
    expect(validateRhDocumentFile({
      originalname: "attestation.pdf",
      mimetype: "image/png",
      size: 128,
    })).toContain("MIME");
  });

  it("conserve les objets RH récents et supprime les objets orphelins anciens", async () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    const referenced = "/objects/rh-documents/1/2/3/document.pdf";
    const oldOrphan = "/objects/rh-documents/1/2/4/orphan.pdf";
    const recentOrphan = "/objects/rh-documents/1/2/5/recent.pdf";
    const deleted: string[] = [];
    const executor = {
      select: vi.fn().mockReturnValue({
        from: () => ({
          where: async () => [{ fichierPath: referenced }],
        }),
      }),
    };
    const storage = {
      normalizeObjectEntityPath: (path: string) => path,
      listPrivateObjects: async () => [
        { objectPath: referenced, createdAt: new Date("2026-08-28T12:00:00.000Z"), updatedAt: null },
        { objectPath: oldOrphan, createdAt: new Date("2026-08-28T12:00:00.000Z"), updatedAt: null },
        { objectPath: recentOrphan, createdAt: new Date("2026-08-30T08:00:00.000Z"), updatedAt: null },
      ],
      deletePrivateObject: async (path: string) => { deleted.push(path); },
    };

    const result = await cleanupOrphanedRhDocuments({
      executor,
      storage,
      now,
    });

    expect(result).toMatchObject({ scanned: 3, referenced: 1, orphaned: 1, skippedRecent: 1, deleted: 1, errors: 0 });
    expect(deleted).toEqual([oldOrphan]);
  });

  it("n'efface pas une pièce RH dont les métadonnées sont indisponibles", async () => {
    const executor = {
      select: vi.fn().mockReturnValue({
        from: () => ({
          where: async () => [],
        }),
      }),
    };
    const deleted: string[] = [];
    const storage = {
      normalizeObjectEntityPath: (path: string) => path,
      listPrivateObjects: async () => [{
        objectPath: "/objects/rh-documents/1/2/6/unknown-date.pdf",
        createdAt: null,
        updatedAt: null,
        metadataError: new Error("metadata unavailable"),
      }],
      deletePrivateObject: async (path: string) => { deleted.push(path); },
    };

    const result = await cleanupOrphanedRhDocuments({ executor, storage });

    expect(result).toMatchObject({ scanned: 1, skippedWithoutMetadata: 1, deleted: 0, errors: 1 });
    expect(deleted).toEqual([]);
  });

  it("réconcilie un préfixe GCS représentatif sans bloquer sur une lecture ou suppression", async () => {
    const now = new Date("2026-08-30T12:00:00.000Z");
    const referenced = "/objects/rh-documents/1/2/3/document.pdf";
    const recentOrphan = "/objects/rh-documents/1/2/5/recent.pdf";
    const oldOrphan = "/objects/rh-documents/1/2/4/orphan.pdf";
    const deleted: string[] = [];
    const metadata = new Map<string, string>([
      ["private/rh-documents/1/2/3/document.pdf", "2026-08-28T12:00:00.000Z"],
      ["private/rh-documents/1/2/5/recent.pdf", "2026-08-30T08:00:00.000Z"],
      ["private/rh-documents/1/2/4/orphan.pdf", "2026-08-28T12:00:00.000Z"],
      ["private/rh-documents/1/2/7/fails-delete.pdf", "2026-08-27T12:00:00.000Z"],
    ]);
    const objectNames = [
      "private/rh-documents/",
      ...metadata.keys(),
      "private/rh-documents/1/2/8/fails-metadata.pdf",
    ];

    const fakeFiles = new Map(
      objectNames
        .filter((name) => !name.endsWith("/"))
        .map((name) => [
          name,
          {
            name,
            getMetadata: async () => {
              if (name.endsWith("fails-metadata.pdf")) {
                throw new Error("metadata unavailable");
              }
              const timestamp = metadata.get(name);
              return [{ timeCreated: timestamp, updated: timestamp }];
            },
            exists: async () => [true] as [boolean],
            delete: async () => {
              if (name.endsWith("fails-delete.pdf")) {
                throw new Error("delete unavailable");
              }
              deleted.push(name);
            },
          },
        ]),
    );
    const fakeBucket = {
      getFiles: async ({ prefix }: { prefix: string }) => {
        expect(prefix).toBe("private/rh-documents/");
        return [[...fakeFiles.values()]];
      },
      file: (name: string) => fakeFiles.get(name),
    };
    const bucketSpy = vi
      .spyOn(objectStorageClient, "bucket")
      .mockReturnValue(fakeBucket as unknown as ReturnType<typeof objectStorageClient.bucket>);
    const previousPrivateDir = process.env["PRIVATE_OBJECT_DIR"];
    process.env["PRIVATE_OBJECT_DIR"] = "/bucket/private";
    const executor = {
      select: vi.fn().mockReturnValue({
        from: () => ({
          where: async () => [{ fichierPath: referenced }],
        }),
      }),
    };

    try {
      const result = await cleanupOrphanedRhDocuments({
        executor,
        storage: new ObjectStorageService(),
        now,
      });

      expect(result).toMatchObject({
        scanned: 5,
        referenced: 1,
        orphaned: 2,
        skippedRecent: 1,
        skippedWithoutMetadata: 1,
        deleted: 1,
        errors: 2,
      });
      expect(deleted).toEqual(["private/rh-documents/1/2/4/orphan.pdf"]);
    } finally {
      bucketSpy.mockRestore();
      if (previousPrivateDir === undefined) {
        delete process.env["PRIVATE_OBJECT_DIR"];
      } else {
        process.env["PRIVATE_OBJECT_DIR"] = previousPrivateDir;
      }
    }
  });
});
