import { type Request, type Response } from "express";
import multer from "multer";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import {
  balanceSageImportsTable,
  balanceSageLignesTable,
  balanceSageRepriseAuditTable,
  db,
  ecrituresComptablesTable,
  exercicesTable,
  planComptableTable,
} from "@workspace/db";
import { usersTable } from "@workspace/db";
import { parseBalanceSage, type BalanceSageMapping } from "../services/balanceSageService.js";

export const balanceSageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = file.originalname.toLowerCase();
    if (name.endsWith(".xls") || name.endsWith(".xlsx") || name.endsWith(".csv")) cb(null, true);
    else cb(new Error("Format non supporté — utilisez un fichier Sage .xls, .xlsx ou CSV"));
  },
});

const tenant = (req: Request): number | null => req.user?.cooperativeId ?? null;
const userId = (req: Request): number | null => (req.user as { id?: number } | undefined)?.id ?? null;
const prepareurUser = alias(usersTable, "balance_sage_prepareur");
const validateurUser = alias(usersTable, "balance_sage_validateur");
const auditUser = alias(usersTable, "balance_sage_audit_user");

const importWithUsersSelection = {
  importRow: balanceSageImportsTable,
  prepareeParNom: sql<string | null>`concat_ws(' ', ${prepareurUser.prenoms}, ${prepareurUser.nom})`,
  prepareeParRole: prepareurUser.role,
  valideeParNom: sql<string | null>`concat_ws(' ', ${validateurUser.prenoms}, ${validateurUser.nom})`,
  valideeParRole: validateurUser.role,
};

async function enregistrerEchecReprise(
  req: Request,
  context: { cooperativeId: number; importId: number; exercice: number; action: "preparation" | "validation" },
  message: string,
): Promise<void> {
  try {
    await db.insert(balanceSageRepriseAuditTable).values({
      ...context,
      statut: "echec",
      userId: userId(req),
      message: message.slice(0, 4000),
    });
  } catch (auditError) {
    req.log.error({ err: auditError, importId: context.importId, originalError: message }, "Impossible d'enregistrer l'échec de reprise dans l'audit");
  }
}

function bodyMapping(value: unknown): BalanceSageMapping | undefined {
  if (!value) return undefined;
  const parsed = typeof value === "string" ? JSON.parse(value) : value;
  if (!parsed || typeof parsed !== "object") throw new Error("Mapping de colonnes invalide");
  const p = parsed as Record<string, unknown>;
  const required = ["numeroCompte", "libelle", "totalDebit", "totalCredit"];
  if (required.some((key) => !Number.isInteger(p[key]))) throw new Error("Les quatre colonnes obligatoires doivent être mappées");
  return {
    numeroCompte: Number(p.numeroCompte),
    libelle: Number(p.libelle),
    totalDebit: Number(p.totalDebit),
    totalCredit: Number(p.totalCredit),
    soldeDebiteur: Number.isInteger(p.soldeDebiteur) ? Number(p.soldeDebiteur) : undefined,
    soldeCrediteur: Number.isInteger(p.soldeCrediteur) ? Number(p.soldeCrediteur) : undefined,
  };
}

function parseExercice(value: unknown): number {
  const exercice = Number(value);
  if (!Number.isInteger(exercice) || exercice < 1900 || exercice > 2200) throw new Error("Exercice invalide");
  return exercice;
}

export async function previewBalanceSage(req: Request, res: Response): Promise<void> {
  try {
    if (!req.file) { res.status(400).json({ erreur: "Fichier requis" }); return; }
    const parsed = parseBalanceSage(req.file.buffer, req.file.originalname);
    res.json({
      empreinte: parsed.empreinte,
      feuille: parsed.feuille,
      headers: parsed.headers,
      preview: parsed.preview,
      mappingSuggere: parsed.mappingSuggere,
      lignesDetectees: parsed.rows.length,
    });
  } catch (err) {
    res.status(400).json({ erreur: err instanceof Error ? err.message : "Erreur de lecture du fichier" });
  }
}

export async function importBalanceSage(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = tenant(req);
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    if (!req.file) { res.status(400).json({ erreur: "Fichier requis" }); return; }
    const exercice = parseExercice(req.body["exercice"]);
    const mode = String(req.body["mode"] ?? "");
    if (!["historique", "reprise"].includes(mode)) throw new Error("Mode d’import invalide");
    const parsed = parseBalanceSage(req.file.buffer, req.file.originalname, bodyMapping(req.body["mapping"]));
    const plans = await db.select({ numeroCompte: planComptableTable.numeroCompte })
      .from(planComptableTable)
      .where(and(eq(planComptableTable.cooperativeId, cooperativeId), eq(planComptableTable.actif, true)));
    const comptes = new Set(plans.map((p) => p.numeroCompte));
    const lignes = parsed.rows.map((row) => ({
      ...row,
      compteConnu: comptes.has(row.numeroCompte),
      erreur: row.erreur ?? (comptes.has(row.numeroCompte) ? null : "Compte absent du plan comptable de la coopérative"),
    }));
    const erreurs = lignes.filter((row) => row.erreur).length;
    const comptesInconnus = lignes.filter((row) => !row.compteConnu).length;
    const [created] = await db.insert(balanceSageImportsTable).values({
      cooperativeId, exercice, mode,
      nomFichier: req.file.originalname,
      empreinte: parsed.empreinte,
      feuille: parsed.feuille,
      statut: erreurs ? "a_corriger" : "importe",
      nombreLignes: lignes.length,
      nombreErreurs: erreurs,
      comptesInconnus,
      creePar: userId(req),
    }).returning();
    if (!created) throw new Error("Import non créé");
    if (lignes.length) {
      await db.insert(balanceSageLignesTable).values(lignes.map((row) => ({
        importId: created.id, numeroLigne: row.numeroLigne, numeroCompte: row.numeroCompte,
        libelle: row.libelle, totalDebit: row.totalDebit, totalCredit: row.totalCredit,
        soldeDebiteur: row.soldeDebiteur, soldeCrediteur: row.soldeCrediteur,
        compteConnu: row.compteConnu, erreur: row.erreur,
      })));
    }
    res.status(201).json({ ...created, avertissements: erreurs ? "Certaines lignes doivent être corrigées ou vérifiées." : null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur d’import";
    if (message.includes("balance_sage_imports_coop_exercice_hash_mode_unique")) {
      res.status(409).json({ erreur: "Ce fichier a déjà été importé pour cette coopérative, cet exercice et ce mode." });
      return;
    }
    req.log.error({ err }, "importBalanceSage");
    res.status(400).json({ erreur: message });
  }
}

export async function listBalanceSageImports(req: Request, res: Response): Promise<void> {
  const cooperativeId = tenant(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const exercice = req.query["exercice"] ? parseExercice(req.query["exercice"]) : undefined;
  const where = exercice
    ? and(eq(balanceSageImportsTable.cooperativeId, cooperativeId), eq(balanceSageImportsTable.exercice, exercice))
    : eq(balanceSageImportsTable.cooperativeId, cooperativeId);
  const rows = await db.select(importWithUsersSelection)
    .from(balanceSageImportsTable)
    .leftJoin(prepareurUser, eq(prepareurUser.id, balanceSageImportsTable.prepareePar))
    .leftJoin(validateurUser, eq(validateurUser.id, balanceSageImportsTable.valideePar))
    .where(where)
    .orderBy(sql`${balanceSageImportsTable.createdAt} DESC`);
  res.json(rows.map(({ importRow, ...users }) => ({ ...importRow, ...users })));
}

export async function getBalanceSageImport(req: Request, res: Response): Promise<void> {
  const cooperativeId = tenant(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  const id = Number(req.params["id"]);
  const [importWithUsers] = await db.select(importWithUsersSelection)
    .from(balanceSageImportsTable)
    .leftJoin(prepareurUser, eq(prepareurUser.id, balanceSageImportsTable.prepareePar))
    .leftJoin(validateurUser, eq(validateurUser.id, balanceSageImportsTable.valideePar))
    .where(and(eq(balanceSageImportsTable.id, id), eq(balanceSageImportsTable.cooperativeId, cooperativeId)));
  if (!importWithUsers) { res.status(404).json({ erreur: "Import introuvable" }); return; }
  const { importRow: imp, ...users } = importWithUsers;
  const lignes = await db.select().from(balanceSageLignesTable)
    .where(eq(balanceSageLignesTable.importId, id)).orderBy(asc(balanceSageLignesTable.numeroLigne));
  res.json({ ...imp, ...users, lignes });
}

async function loadImport(req: Request) {
  const cooperativeId = tenant(req);
  if (!cooperativeId) throw new Error("TENANT_REQUIRED");
  const id = Number(req.params["id"]);
  const [imp] = await db.select().from(balanceSageImportsTable)
    .where(and(eq(balanceSageImportsTable.id, id), eq(balanceSageImportsTable.cooperativeId, cooperativeId)));
  if (!imp) throw new Error("IMPORT_NOT_FOUND");
  const lignes = await db.select().from(balanceSageLignesTable).where(eq(balanceSageLignesTable.importId, id)).orderBy(asc(balanceSageLignesTable.numeroLigne));
  return { imp, lignes, cooperativeId };
}

export async function prepareBalanceSageReprise(req: Request, res: Response): Promise<void> {
  let auditContext: { cooperativeId: number; importId: number; exercice: number; action: "preparation" } | null = null;
  try {
    const { imp, lignes, cooperativeId } = await loadImport(req);
    auditContext = { cooperativeId, importId: imp.id, exercice: imp.exercice, action: "preparation" };
    if (imp.mode !== "reprise") throw new Error("Seul un import en mode reprise peut générer des à-nouveaux");
    if (imp.statut === "validee") throw new Error("Cette reprise est déjà validée");
    const compteContrepartie = String(req.body["compteContrepartie"] ?? "").trim();
    if (!compteContrepartie) throw new Error("Le compte de contrepartie est obligatoire");
    const dateReprise = String(req.body["dateReprise"] ?? `${imp.exercice}-01-01`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReprise)) throw new Error("Date de reprise invalide");
    const plans = await db.select({ numeroCompte: planComptableTable.numeroCompte, libelle: planComptableTable.libelle })
      .from(planComptableTable)
      .where(and(eq(planComptableTable.cooperativeId, cooperativeId), eq(planComptableTable.actif, true)));
    const compte = plans.find((p) => p.numeroCompte === compteContrepartie);
    if (!compte) throw new Error("Le compte de contrepartie doit exister dans le plan comptable actif");
    const invalid = lignes.filter((l) => l.erreur || !l.compteConnu || l.numeroCompte === compteContrepartie);
    if (invalid.length) throw new Error(`${invalid.length} ligne(s) doivent être corrigées avant la préparation`);
    const totalDebiteur = lignes.reduce((sum, row) => sum + row.soldeDebiteur, 0);
    const totalCrediteur = lignes.reduce((sum, row) => sum + row.soldeCrediteur, 0);
    if (totalDebiteur !== totalCrediteur) throw new Error(`La reprise n’est pas équilibrée : écart de ${Math.abs(totalDebiteur - totalCrediteur)} FCFA`);
    const nombreEcritures = lignes.filter((l) => l.soldeDebiteur > 0 || l.soldeCrediteur > 0).length;
    const updated = await db.transaction(async (tx) => {
      const [nextImport] = await tx.update(balanceSageImportsTable).set({
        statut: "preparee", compteContrepartie, dateReprise,
        prepareePar: userId(req), prepareeLe: new Date(), nombreEcritures,
      }).where(and(eq(balanceSageImportsTable.id, imp.id), eq(balanceSageImportsTable.statut, "importe"))).returning();
      if (!nextImport) throw new Error("La reprise a changé d’état, rechargez la page");
      await tx.insert(balanceSageRepriseAuditTable).values({
        cooperativeId, importId: imp.id, exercice: imp.exercice,
        action: "preparation", statut: "succes", userId: userId(req),
        message: `${nombreEcritures} à-nouveaux préparés avec le compte de contrepartie ${compteContrepartie}.`,
      });
      return nextImport;
    });
    res.json({
      import: updated,
      compteContrepartie: compte,
      totalDebiteur,
      totalCrediteur,
      nombreEcritures,
      ecritures: lignes.flatMap((l) => l.soldeDebiteur > 0
        ? [{ compteDebit: l.numeroCompte, compteCredit: compteContrepartie, montantFcfa: l.soldeDebiteur, libelle: `À-nouveau ${imp.exercice} — ${l.libelle}` }]
        : l.soldeCrediteur > 0
          ? [{ compteDebit: compteContrepartie, compteCredit: l.numeroCompte, montantFcfa: l.soldeCrediteur, libelle: `À-nouveau ${imp.exercice} — ${l.libelle}` }]
          : []),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de préparation";
    if (auditContext) await enregistrerEchecReprise(req, auditContext, message);
    res.status(message === "IMPORT_NOT_FOUND" ? 404 : message === "TENANT_REQUIRED" ? 401 : 422).json({ erreur: message === "IMPORT_NOT_FOUND" ? "Import introuvable" : message });
  }
}

export async function validateBalanceSageReprise(req: Request, res: Response): Promise<void> {
  let auditContext: { cooperativeId: number; importId: number; exercice: number; action: "validation" } | null = null;
  try {
    const { imp, lignes, cooperativeId } = await loadImport(req);
    auditContext = { cooperativeId, importId: imp.id, exercice: imp.exercice, action: "validation" };
    if (imp.mode !== "reprise" || imp.statut !== "preparee" || !imp.compteContrepartie || !imp.dateReprise) {
      throw new Error("La reprise doit être préparée et contrôlée avant validation");
    }
    const [exercice] = await db.select({ statut: exercicesTable.statut }).from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, cooperativeId), eq(exercicesTable.annee, imp.exercice)));
    if (exercice?.statut === "cloture") throw new Error("Impossible de valider une reprise dans un exercice clôturé");
    const entries = lignes.flatMap((l) => l.soldeDebiteur > 0
      ? [{ debit: l.numeroCompte, credit: imp.compteContrepartie!, montant: l.soldeDebiteur, libelle: `À-nouveau ${imp.exercice} — ${l.libelle}` }]
      : l.soldeCrediteur > 0
        ? [{ debit: imp.compteContrepartie!, credit: l.numeroCompte, montant: l.soldeCrediteur, libelle: `À-nouveau ${imp.exercice} — ${l.libelle}` }]
        : []);
    const updated = await db.transaction(async (tx) => {
      const [nextImport] = await tx.update(balanceSageImportsTable).set({
        statut: "validee", valideePar: userId(req), valideeLe: new Date(),
      }).where(and(eq(balanceSageImportsTable.id, imp.id), eq(balanceSageImportsTable.statut, "preparee"))).returning();
      if (!nextImport) throw new Error("Cette reprise est déjà en cours de validation ou validée");
      for (const entry of entries) {
        await tx.insert(ecrituresComptablesTable).values({
          cooperativeId, dateEcriture: imp.dateReprise!, numeroPiece: `SAGE-${imp.id}`,
          libelle: entry.libelle, compteDebit: entry.debit, compteCredit: entry.credit,
          montantFcfa: entry.montant, source: "manuel", sourceId: imp.id,
          exercice: imp.exercice, typeEcriture: "a_nouveau",
        });
      }
      await tx.insert(balanceSageRepriseAuditTable).values({
        cooperativeId, importId: imp.id, exercice: imp.exercice,
        action: "validation", statut: "succes", userId: userId(req),
        message: `${entries.length} à-nouveaux validés et enregistrés dans le journal comptable.`,
      });
      return nextImport;
    });
    res.json({ ...updated, nombreEcritures: entries.length, message: `${entries.length} à-nouveau validés dans le journal comptable.` });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erreur de validation";
    if (auditContext) await enregistrerEchecReprise(req, auditContext, message);
    res.status(message === "IMPORT_NOT_FOUND" ? 404 : message === "TENANT_REQUIRED" ? 401 : 422).json({ erreur: message === "IMPORT_NOT_FOUND" ? "Import introuvable" : message });
  }
}

export async function listBalanceSageRepriseAudit(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = tenant(req);
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const exercice = req.query["exercice"] ? parseExercice(req.query["exercice"]) : undefined;
    const rawImportId = req.query["importId"];
    const importId = rawImportId === undefined ? undefined : Number(rawImportId);
    if (importId !== undefined && (!Number.isInteger(importId) || importId <= 0)) {
      res.status(400).json({ erreur: "Import invalide" });
      return;
    }
    const filters = [
      eq(balanceSageRepriseAuditTable.cooperativeId, cooperativeId),
      exercice === undefined ? undefined : eq(balanceSageRepriseAuditTable.exercice, exercice),
      importId === undefined ? undefined : eq(balanceSageRepriseAuditTable.importId, importId),
    ].filter((value): value is NonNullable<typeof value> => value !== undefined);
    const events = await db.select({
      id: balanceSageRepriseAuditTable.id,
      cooperativeId: balanceSageRepriseAuditTable.cooperativeId,
      importId: balanceSageRepriseAuditTable.importId,
      exercice: balanceSageRepriseAuditTable.exercice,
      action: balanceSageRepriseAuditTable.action,
      statut: balanceSageRepriseAuditTable.statut,
      userId: balanceSageRepriseAuditTable.userId,
      userNom: sql<string | null>`concat_ws(' ', ${auditUser.prenoms}, ${auditUser.nom})`,
      userRole: auditUser.role,
      message: balanceSageRepriseAuditTable.message,
      createdAt: balanceSageRepriseAuditTable.createdAt,
      nomFichier: balanceSageImportsTable.nomFichier,
    })
      .from(balanceSageRepriseAuditTable)
      .leftJoin(auditUser, eq(auditUser.id, balanceSageRepriseAuditTable.userId))
      .leftJoin(balanceSageImportsTable, eq(balanceSageImportsTable.id, balanceSageRepriseAuditTable.importId))
      .where(and(...filters))
      .orderBy(desc(balanceSageRepriseAuditTable.createdAt));
    res.json(events);
  } catch (err) {
    req.log.error({ err }, "listBalanceSageRepriseAudit");
    res.status(400).json({ erreur: err instanceof Error ? err.message : "Erreur de lecture du journal de reprise" });
  }
}