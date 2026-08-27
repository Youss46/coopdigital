import { describe, expect, beforeEach, it, vi } from "vitest";
import type { Request, Response } from "express";
import * as XLSX from "xlsx";
import { db } from "@workspace/db";
import { importBalanceSage } from "../controllers/balanceSageController.js";

function chain<T>(rows: T[]) {
  const value: Record<string, unknown> = {};
  value.from = vi.fn(() => value);
  value.where = vi.fn(() => value);
  value.orderBy = vi.fn(() => value);
  value.then = (resolve: (result: T[]) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(rows).then(resolve, reject);
  return value;
}

function response() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function sageFile() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([["101", "Capital", 0, 100, 0, 100]]);
  XLSX.utils.book_append_sheet(workbook, sheet, "Sage");
  return {
    fieldname: "fichier",
    originalname: "balance.xls",
    encoding: "7bit",
    mimetype: "application/vnd.ms-excel",
    buffer: XLSX.write(workbook, { type: "buffer", bookType: "xls" }) as Buffer,
    size: 100,
  };
}

describe("importBalanceSage", () => {
  beforeEach(() => {
    vi.mocked(db.select).mockReset();
    vi.mocked(db.insert).mockReset();
  });

  it("retourne 409 quand la même balance est importée deux fois", async () => {
    vi.mocked(db.select).mockReturnValue(chain([{ numeroCompte: "101" }]) as never);
    const returning = vi.fn().mockRejectedValue(new Error("duplicate key value violates unique constraint balance_sage_imports_coop_exercice_hash_mode_unique"));
    vi.mocked(db.insert).mockReturnValue({ values: vi.fn(() => ({ returning })) } as never);
    const req = {
      file: sageFile(),
      body: { exercice: "2025", mode: "historique", mapping: JSON.stringify({ numeroCompte: 0, libelle: 1, totalDebit: 2, totalCredit: 3, soldeDebiteur: 4, soldeCrediteur: 5 }) },
      user: { cooperativeId: 42, id: 7 },
      log: { error: vi.fn() },
    } as unknown as Request;
    const res = response();

    await importBalanceSage(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ erreur: "Ce fichier a déjà été importé pour cette coopérative, cet exercice et ce mode." });
  });
});