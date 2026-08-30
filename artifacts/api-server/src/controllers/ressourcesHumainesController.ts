import { type Request, type Response } from "express";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import multer from "multer";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  db,
  personnelTable,
  usersTable,
  rhAbsencesTable,
  rhCongesTable,
  rhContratsTable,
  rhDocumentsTable,
  rhHistoriqueTable,
} from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage.js";

const CONGE_SOLDE_ANNUEL = 26;
const ECHEANCE_JOURS = 60;
const RH_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
const RH_DOCUMENT_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};
const objectStorageService = new ObjectStorageService();

class TenantError extends Error {
  readonly status = 401;
  constructor() {
    super("TENANT_REQUIRED");
  }
}

function cooperativeId(req: Request): number {
  const id = req.user?.cooperativeId;
  if (!id) throw new TenantError();
  return id;
}

function idOf(value: unknown): number {
  const id = Number(value);
  return Number.isInteger(id) ? id : 0;
}

function textOf(value: unknown): string | null {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  return String(value).trim();
}

function requiredText(value: unknown): string | null {
  const result = textOf(value);
  return result && result.length <= 500 ? result : null;
}

function validDate(value: unknown): string | null {
  const result = textOf(value);
  if (!result || !/^\d{4}-\d{2}-\d{2}$/.test(result)) return null;
  const parsed = new Date(`${result}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : result;
}

function fileExtension(name: string): string {
  const lastDot = name.lastIndexOf(".");
  return lastDot >= 0 ? name.slice(lastDot).toLowerCase() : "";
}

export function validateRhDocumentFile(file: {
  originalname: string;
  mimetype: string;
  size: number;
  buffer?: Buffer;
}): string | null {
  const extension = fileExtension(file.originalname);
  const expectedMimeType = RH_DOCUMENT_TYPES[extension];
  if (!expectedMimeType) {
    return "Format non supporté. Utilisez PDF, JPG, PNG, WEBP, DOC ou DOCX.";
  }
  if (file.size > RH_DOCUMENT_MAX_BYTES) {
    return "Le fichier dépasse la taille maximale de 10 Mo.";
  }
  if (file.mimetype !== expectedMimeType) {
    return "Le type MIME du fichier ne correspond pas à son extension.";
  }
  if (!file.buffer) return null;

  const startsWith = (bytes: number[]) => bytes.every((byte, index) => file.buffer![index] === byte);
  const validSignature = extension === ".pdf"
    ? file.buffer.subarray(0, 5).toString("ascii") === "%PDF-"
    : extension === ".png"
      ? startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      : extension === ".jpg" || extension === ".jpeg"
        ? startsWith([0xff, 0xd8, 0xff])
        : extension === ".webp"
          ? file.buffer.subarray(0, 4).toString("ascii") === "RIFF"
            && file.buffer.subarray(8, 12).toString("ascii") === "WEBP"
          : extension === ".docx"
            ? startsWith([0x50, 0x4b, 0x03, 0x04])
            : startsWith([0xd0, 0xcf, 0x11, 0xe0]);
  return validSignature ? null : "Le contenu du fichier ne correspond pas à un document valide.";
}

export const rhDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RH_DOCUMENT_MAX_BYTES },
  fileFilter: (_req, file, callback) => {
    const error = validateRhDocumentFile({ ...file, size: 0 });
    if (error) {
      callback(new Error(error));
    } else {
      callback(null, true);
    }
  },
});

export function rhDocumentUploadMiddleware(
  req: Request,
  res: Response,
  next: (error?: unknown) => void,
): void {
  rhDocumentUpload.single("fichier")(req, res, (error) => {
    if (!error) {
      next();
      return;
    }
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ erreur: "Le fichier dépasse la taille maximale de 10 Mo." });
      return;
    }
    res.status(400).json({ erreur: error instanceof Error ? error.message : "Fichier invalide" });
  });
}

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._ ()-]/g, "_").slice(0, 180) || "document";
}

function documentView(row: typeof rhDocumentsTable.$inferSelect, personnelNom?: string) {
  const { fichierPath, fichierNom, fichierMimeType, fichierTaille, ...document } = row;
  return {
    ...document,
    ...(personnelNom ? { personnelNom } : {}),
    pieceJointe: fichierPath
      ? {
          nom: fichierNom ?? "document",
          typeMime: fichierMimeType ?? "application/octet-stream",
          taille: fichierTaille ?? 0,
          url: `/api/rh/documents/${row.id}/fichier`,
        }
      : null,
  };
}

export function inclusiveDays(start: string, end: string): number {
  const startMs = Date.parse(`${start}T00:00:00Z`);
  const endMs = Date.parse(`${end}T00:00:00Z`);
  return Math.floor((endMs - startMs) / 86_400_000) + 1;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

async function personnelFor(coopId: number, personnelId: number) {
  const [personnel] = await db
    .select({ id: personnelTable.id, nom: personnelTable.nom, prenoms: personnelTable.prenoms, statut: personnelTable.statut })
    .from(personnelTable)
    .where(and(eq(personnelTable.id, personnelId), eq(personnelTable.cooperativeId, coopId)))
    .limit(1);
  return personnel ?? null;
}

async function logHistory(
  coopId: number,
  personnelId: number | null,
  entite: string,
  entiteId: number | null,
  action: string,
  details: unknown,
  faitPar: number | null,
) {
  await db.insert(rhHistoriqueTable).values({
    cooperativeId: coopId,
    personnelId,
    entite,
    entiteId,
    action,
    details: details as Record<string, unknown>,
    faitPar,
  });
}

function handleError(req: Request, res: Response, err: unknown, operation: string) {
  if (err instanceof TenantError) {
    res.status(401).json({ erreur: "Coopérative non associée au compte" });
    return;
  }
  req.log.error({ err }, operation);
  res.status(500).json({ erreur: "Erreur interne du serveur" });
}

const personnelProjection = {
  id: personnelTable.id,
  cooperativeId: personnelTable.cooperativeId,
  nom: personnelTable.nom,
  prenoms: personnelTable.prenoms,
  poste: personnelTable.poste,
  roleSysteme: personnelTable.roleSysteme,
  userId: personnelTable.userId,
  dateEmbauche: personnelTable.dateEmbauche,
  dateFinContrat: personnelTable.dateFinContrat,
  dateNaissance: personnelTable.dateNaissance,
  adresse: personnelTable.adresse,
  contactUrgenceNom: personnelTable.contactUrgenceNom,
  contactUrgenceTelephone: personnelTable.contactUrgenceTelephone,
  numeroCnps: personnelTable.numeroCnps,
  numeroCni: personnelTable.numeroCni,
  statut: personnelTable.statut,
};

export async function listRhPersonnel(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db.select(personnelProjection).from(personnelTable)
      .where(eq(personnelTable.cooperativeId, cooperativeId(req)))
      .orderBy(asc(personnelTable.nom), asc(personnelTable.prenoms));
    res.json(rows);
  } catch (err) {
    handleError(req, res, err, "listRhPersonnel");
  }
}

export async function listRhUserOptions(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const rows = await db.select({
      id: usersTable.id,
      nom: usersTable.nom,
      prenoms: usersTable.prenoms,
      email: usersTable.email,
      role: usersTable.role,
      actif: usersTable.actif,
    }).from(usersTable).where(eq(usersTable.cooperativeId, coopId)).orderBy(asc(usersTable.nom));
    res.json(rows);
  } catch (err) {
    handleError(req, res, err, "listRhUserOptions");
  }
}

export async function getRhPersonnel(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const id = idOf(req.params["id"]);
    const [row] = await db.select(personnelProjection).from(personnelTable)
      .where(and(eq(personnelTable.id, id), eq(personnelTable.cooperativeId, coopId))).limit(1);
    if (!row) {
      res.status(404).json({ erreur: "Dossier personnel introuvable" });
      return;
    }
    const [contrats, documents, conges, absences, historique] = await Promise.all([
      db.select().from(rhContratsTable).where(and(eq(rhContratsTable.cooperativeId, coopId), eq(rhContratsTable.personnelId, id))).orderBy(desc(rhContratsTable.dateDebut)),
      db.select().from(rhDocumentsTable).where(and(eq(rhDocumentsTable.cooperativeId, coopId), eq(rhDocumentsTable.personnelId, id))).orderBy(desc(rhDocumentsTable.dateExpiration)),
      db.select().from(rhCongesTable).where(and(eq(rhCongesTable.cooperativeId, coopId), eq(rhCongesTable.personnelId, id))).orderBy(desc(rhCongesTable.dateDebut)),
      db.select().from(rhAbsencesTable).where(and(eq(rhAbsencesTable.cooperativeId, coopId), eq(rhAbsencesTable.personnelId, id))).orderBy(desc(rhAbsencesTable.dateDebut)),
      db.select({
        id: rhHistoriqueTable.id,
        cooperativeId: rhHistoriqueTable.cooperativeId,
        personnelId: rhHistoriqueTable.personnelId,
        entite: rhHistoriqueTable.entite,
        entiteId: rhHistoriqueTable.entiteId,
        action: rhHistoriqueTable.action,
        details: rhHistoriqueTable.details,
        faitPar: rhHistoriqueTable.faitPar,
        faitParNom: usersTable.nom,
        faitParPrenoms: usersTable.prenoms,
        faitParEmail: usersTable.email,
        createdAt: rhHistoriqueTable.createdAt,
      }).from(rhHistoriqueTable)
        .leftJoin(usersTable, and(eq(usersTable.id, rhHistoriqueTable.faitPar), eq(usersTable.cooperativeId, coopId)))
        .where(and(eq(rhHistoriqueTable.cooperativeId, coopId), eq(rhHistoriqueTable.personnelId, id)))
        .orderBy(desc(rhHistoriqueTable.createdAt)),
    ]);
    res.json({ personnel: row, contrats, documents: documents.map((document) => documentView(document)), conges, absences, historique });
  } catch (err) {
    handleError(req, res, err, "getRhPersonnel");
  }
}

export async function updateRhPersonnel(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const id = idOf(req.params["id"]);
    const current = await personnelFor(coopId, id);
    if (!current) {
      res.status(404).json({ erreur: "Dossier personnel introuvable" });
      return;
    }
    const body = req.body as Record<string, unknown>;
    const updates: Partial<typeof personnelTable.$inferInsert> = { updatedAt: new Date() };
    const allowedText = ["nom", "prenoms", "poste", "roleSysteme", "adresse", "contactUrgenceNom", "contactUrgenceTelephone", "numeroCnps", "numeroCni", "notesRh"] as const;
    for (const field of allowedText) {
      if (body[field] !== undefined) {
        const value = textOf(body[field]);
        if (field === "nom" || field === "prenoms" || field === "poste") {
          if (!value) {
            res.status(400).json({ erreur: `${field} est obligatoire` });
            return;
          }
        }
        updates[field] = value as never;
      }
    }
    if (body["dateNaissance"] !== undefined) {
      const dateNaissance = body["dateNaissance"] ? validDate(body["dateNaissance"]) : null;
      if (body["dateNaissance"] && !dateNaissance) {
        res.status(400).json({ erreur: "Date de naissance invalide" });
        return;
      }
      updates.dateNaissance = dateNaissance;
    }
    if (body["dateEmbauche"] !== undefined) {
      const dateEmbauche = validDate(body["dateEmbauche"]);
      if (!dateEmbauche) {
        res.status(400).json({ erreur: "Date d'embauche invalide" });
        return;
      }
      updates.dateEmbauche = dateEmbauche;
    }
    if (body["dateFinContrat"] !== undefined) {
      const dateFinContrat = body["dateFinContrat"] ? validDate(body["dateFinContrat"]) : null;
      if (body["dateFinContrat"] && !dateFinContrat) {
        res.status(400).json({ erreur: "Date de fin de contrat invalide" });
        return;
      }
      updates.dateFinContrat = dateFinContrat;
    }
    if (body["statut"] !== undefined && ["actif", "suspendu", "sorti"].includes(String(body["statut"]))) {
      updates.statut = body["statut"] as "actif" | "suspendu" | "sorti";
    }
    if (body["userId"] !== undefined) {
      const userId = body["userId"] === null || body["userId"] === "" ? null : idOf(body["userId"]);
      if (userId) {
        const [user] = await db.select({ id: usersTable.id }).from(usersTable)
          .where(and(eq(usersTable.id, userId), eq(usersTable.cooperativeId, coopId))).limit(1);
        if (!user) {
          res.status(400).json({ erreur: "Le compte utilisateur doit appartenir à la coopérative" });
          return;
        }
        const [alreadyAssigned] = await db.select({ id: personnelTable.id }).from(personnelTable)
          .where(and(eq(personnelTable.cooperativeId, coopId), eq(personnelTable.userId, userId))).limit(1);
        if (alreadyAssigned && alreadyAssigned.id !== id) {
          res.status(409).json({ erreur: "Ce compte utilisateur est déjà associé à un dossier personnel" });
          return;
        }
      }
      updates.userId = userId;
    }
    const [updated] = await db.update(personnelTable).set(updates)
      .where(and(eq(personnelTable.id, id), eq(personnelTable.cooperativeId, coopId))).returning(personnelProjection);
    await logHistory(coopId, id, "personnel", id, "modification", { champs: Object.keys(updates) }, req.user?.id ?? null);
    res.json(updated);
  } catch (err) {
    handleError(req, res, err, "updateRhPersonnel");
  }
}

async function validatePersonnelReference(req: Request, res: Response, coopId: number): Promise<number | null> {
  const personnelId = idOf((req.body as Record<string, unknown>)["personnelId"]);
  if (!personnelId || !await personnelFor(coopId, personnelId)) {
    res.status(400).json({ erreur: "Personnel introuvable dans cette coopérative" });
    return null;
  }
  return personnelId;
}

export async function listRhContrats(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const rows = await db.select({
      contrat: rhContratsTable,
      nom: personnelTable.nom,
      prenoms: personnelTable.prenoms,
      poste: personnelTable.poste,
    }).from(rhContratsTable)
      .innerJoin(personnelTable, eq(personnelTable.id, rhContratsTable.personnelId))
      .where(eq(rhContratsTable.cooperativeId, coopId))
      .orderBy(desc(rhContratsTable.dateDebut));
    res.json(rows.map((row) => ({ ...row.contrat, personnelNom: `${row.nom} ${row.prenoms}`, poste: row.poste })));
  } catch (err) {
    handleError(req, res, err, "listRhContrats");
  }
}

export async function createRhContrat(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const personnelId = await validatePersonnelReference(req, res, coopId);
    if (!personnelId) return;
    const body = req.body as Record<string, unknown>;
    const dateDebut = validDate(body["dateDebut"]);
    if (!dateDebut || !requiredText(body["type"])) {
      res.status(400).json({ erreur: "Type et date de début obligatoires" });
      return;
    }
    const dateFin = body["dateFin"] ? validDate(body["dateFin"]) : null;
    if (body["dateFin"] && !dateFin) {
      res.status(400).json({ erreur: "Date de fin invalide" });
      return;
    }
    if (dateFin && dateFin < dateDebut) {
      res.status(400).json({ erreur: "La date de fin doit être postérieure au début" });
      return;
    }
    const [row] = await db.insert(rhContratsTable).values({
      cooperativeId: coopId, personnelId, type: requiredText(body["type"])!,
      reference: textOf(body["reference"]), dateDebut, dateFin,
      dateSignature: body["dateSignature"] ? validDate(body["dateSignature"]) : null,
      statut: ["actif", "resilie", "expire"].includes(String(body["statut"])) ? String(body["statut"]) : "actif",
      notes: textOf(body["notes"]), createdBy: req.user?.id ?? null,
    }).returning();
    await logHistory(coopId, personnelId, "contrat", row?.id ?? null, "creation", { type: row?.type }, req.user?.id ?? null);
    res.status(201).json(row);
  } catch (err) {
    handleError(req, res, err, "createRhContrat");
  }
}

export async function updateRhContrat(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const id = idOf(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const [existing] = await db.select().from(rhContratsTable).where(and(eq(rhContratsTable.id, id), eq(rhContratsTable.cooperativeId, coopId))).limit(1);
    if (!existing) {
      res.status(404).json({ erreur: "Contrat introuvable" });
      return;
    }
    const updates: Partial<typeof rhContratsTable.$inferInsert> = { updatedAt: new Date() };
    if (body["type"] !== undefined) updates.type = textOf(body["type"]) ?? existing.type;
    if (body["reference"] !== undefined) updates.reference = textOf(body["reference"]);
    if (body["notes"] !== undefined) updates.notes = textOf(body["notes"]);
    if (body["dateDebut"] !== undefined) updates.dateDebut = body["dateDebut"] ? validDate(body["dateDebut"]) ?? existing.dateDebut : existing.dateDebut;
    if (body["dateFin"] !== undefined) updates.dateFin = body["dateFin"] ? validDate(body["dateFin"]) : null;
    if (body["dateSignature"] !== undefined) updates.dateSignature = body["dateSignature"] ? validDate(body["dateSignature"]) : null;
    if (body["statut"] !== undefined && ["actif", "resilie", "expire"].includes(String(body["statut"]))) updates.statut = String(body["statut"]);
    const [updated] = await db.update(rhContratsTable).set(updates).where(eq(rhContratsTable.id, id)).returning();
    await logHistory(coopId, existing.personnelId, "contrat", id, "modification", { champs: Object.keys(updates) }, req.user?.id ?? null);
    res.json(updated);
  } catch (err) {
    handleError(req, res, err, "updateRhContrat");
  }
}

export async function listRhDocuments(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const rows = await db.select({
      document: rhDocumentsTable,
      nom: personnelTable.nom,
      prenoms: personnelTable.prenoms,
    }).from(rhDocumentsTable)
      .innerJoin(personnelTable, eq(personnelTable.id, rhDocumentsTable.personnelId))
      .where(eq(rhDocumentsTable.cooperativeId, coopId))
      .orderBy(asc(rhDocumentsTable.dateExpiration), desc(rhDocumentsTable.createdAt));
    res.json(rows.map((row) => documentView(row.document, `${row.nom} ${row.prenoms}`)));
  } catch (err) {
    handleError(req, res, err, "listRhDocuments");
  }
}

export async function createRhDocument(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const personnelId = await validatePersonnelReference(req, res, coopId);
    if (!personnelId) return;
    const body = req.body as Record<string, unknown>;
    const titre = requiredText(body["titre"]);
    const type = requiredText(body["type"]);
    if (!titre || !type) {
      res.status(400).json({ erreur: "Type et titre obligatoires" });
      return;
    }
    const dateExpiration = body["dateExpiration"] ? validDate(body["dateExpiration"]) : null;
    if (body["dateExpiration"] && !dateExpiration) {
      res.status(400).json({ erreur: "Date d'expiration invalide" });
      return;
    }
    const [row] = await db.insert(rhDocumentsTable).values({
      cooperativeId: coopId, personnelId, type, titre,
      reference: textOf(body["reference"]),
      dateDocument: body["dateDocument"] ? validDate(body["dateDocument"]) : null,
      dateExpiration, url: textOf(body["url"]), notes: textOf(body["notes"]),
      createdBy: req.user?.id ?? null,
    }).returning();
    await logHistory(coopId, personnelId, "document", row?.id ?? null, "creation", { type, titre }, req.user?.id ?? null);
    res.status(201).json(documentView(row));
  } catch (err) {
    handleError(req, res, err, "createRhDocument");
  }
}

export async function updateRhDocument(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const id = idOf(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const [existing] = await db.select().from(rhDocumentsTable).where(and(eq(rhDocumentsTable.id, id), eq(rhDocumentsTable.cooperativeId, coopId))).limit(1);
    if (!existing) {
      res.status(404).json({ erreur: "Document introuvable" });
      return;
    }
    const updates: Partial<typeof rhDocumentsTable.$inferInsert> = { updatedAt: new Date() };
    if (body["type"] !== undefined) updates.type = textOf(body["type"]) ?? existing.type;
    if (body["titre"] !== undefined) updates.titre = textOf(body["titre"]) ?? existing.titre;
    if (body["reference"] !== undefined) updates.reference = textOf(body["reference"]);
    if (body["url"] !== undefined) updates.url = textOf(body["url"]);
    if (body["notes"] !== undefined) updates.notes = textOf(body["notes"]);
    if (body["dateDocument"] !== undefined) updates.dateDocument = body["dateDocument"] ? validDate(body["dateDocument"]) : null;
    if (body["dateExpiration"] !== undefined) updates.dateExpiration = body["dateExpiration"] ? validDate(body["dateExpiration"]) : null;
    const [updated] = await db.update(rhDocumentsTable).set(updates).where(eq(rhDocumentsTable.id, id)).returning();
    await logHistory(coopId, existing.personnelId, "document", id, "modification", { champs: Object.keys(updates) }, req.user?.id ?? null);
    res.json(documentView(updated));
  } catch (err) {
    handleError(req, res, err, "updateRhDocument");
  }
}

export async function uploadRhDocumentFile(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const id = idOf(req.params["id"]);
    const [existing] = await db.select().from(rhDocumentsTable).where(
      and(eq(rhDocumentsTable.id, id), eq(rhDocumentsTable.cooperativeId, coopId)),
    ).limit(1);
    if (!existing) {
      res.status(404).json({ erreur: "Document introuvable" });
      return;
    }
    if (!req.file) {
      res.status(400).json({ erreur: "Fichier requis" });
      return;
    }
    const validationError = validateRhDocumentFile(req.file);
    if (validationError) {
      res.status(400).json({ erreur: validationError });
      return;
    }

    const extension = fileExtension(req.file.originalname);
    const objectPath = `/objects/rh-documents/${coopId}/${existing.personnelId}/${id}/${randomUUID()}${extension}`;
    await objectStorageService.uploadPrivateObject(objectPath, req.file.buffer, req.file.mimetype);

    let updated: typeof existing | undefined;
    try {
      [updated] = await db.update(rhDocumentsTable).set({
        fichierPath: objectPath,
        fichierNom: safeFileName(req.file.originalname),
        fichierMimeType: req.file.mimetype,
        fichierTaille: req.file.size,
        updatedAt: new Date(),
      }).where(and(eq(rhDocumentsTable.id, id), eq(rhDocumentsTable.cooperativeId, coopId))).returning();
    } catch (error) {
      await objectStorageService.deletePrivateObject(objectPath).catch((cleanupError) => req.log.warn({ err: cleanupError }, "Impossible de supprimer le nouveau fichier RH après échec DB"));
      throw error;
    }
    if (!updated) {
      await objectStorageService.deletePrivateObject(objectPath).catch(() => undefined);
      res.status(404).json({ erreur: "Document introuvable" });
      return;
    }
    if (existing.fichierPath && existing.fichierPath !== objectPath) {
      await objectStorageService.deletePrivateObject(existing.fichierPath).catch((error) => req.log.warn({ err: error }, "Ancien fichier RH impossible à supprimer"));
    }
    await logHistory(coopId, existing.personnelId, "document", id, existing.fichierPath ? "remplacement_fichier" : "ajout_fichier", {
      nom: safeFileName(req.file.originalname),
      taille: req.file.size,
    }, req.user?.id ?? null);
    res.json(documentView(updated));
  } catch (err) {
    handleError(req, res, err, "uploadRhDocumentFile");
  }
}

export async function deleteRhDocumentFile(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const id = idOf(req.params["id"]);
    const [existing] = await db.select().from(rhDocumentsTable).where(
      and(eq(rhDocumentsTable.id, id), eq(rhDocumentsTable.cooperativeId, coopId)),
    ).limit(1);
    if (!existing) {
      res.status(404).json({ erreur: "Document introuvable" });
      return;
    }
    const [updated] = await db.update(rhDocumentsTable).set({
      fichierPath: null,
      fichierNom: null,
      fichierMimeType: null,
      fichierTaille: null,
      updatedAt: new Date(),
    }).where(and(eq(rhDocumentsTable.id, id), eq(rhDocumentsTable.cooperativeId, coopId))).returning();
    if (existing.fichierPath) {
      await objectStorageService.deletePrivateObject(existing.fichierPath).catch((error) => req.log.warn({ err: error }, "Fichier RH impossible à supprimer du stockage"));
    }
    await logHistory(coopId, existing.personnelId, "document", id, "suppression_fichier", {}, req.user?.id ?? null);
    res.json(documentView(updated));
  } catch (err) {
    handleError(req, res, err, "deleteRhDocumentFile");
  }
}

export async function downloadRhDocumentFile(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const id = idOf(req.params["id"]);
    const [document] = await db.select().from(rhDocumentsTable).where(
      and(eq(rhDocumentsTable.id, id), eq(rhDocumentsTable.cooperativeId, coopId)),
    ).limit(1);
    if (!document || !document.fichierPath) {
      res.status(404).json({ erreur: "Fichier RH introuvable" });
      return;
    }
    const objectFile = await objectStorageService.getObjectEntityFile(document.fichierPath);
    const response = await objectStorageService.downloadObject(objectFile, 0);
    await logHistory(coopId, document.personnelId, "document", id, "consultation_fichier", {
      nom: document.fichierNom ?? "document",
      typeMime: document.fichierMimeType ?? "application/octet-stream",
      taille: document.fichierTaille ?? 0,
    }, req.user?.id ?? null);
    res.status(response.status);
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.setHeader("Content-Disposition", `attachment; filename="${safeFileName(document.fichierNom ?? "document")}"`);
    if (response.body) {
      Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
    } else {
      res.end();
    }
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ erreur: "Fichier RH introuvable" });
      return;
    }
    handleError(req, res, err, "downloadRhDocumentFile");
  }
}

async function annualLeaveBalance(coopId: number, personnelId: number, year: number) {
  const rows = await db.select({ jours: rhCongesTable.jours, dateDebut: rhCongesTable.dateDebut }).from(rhCongesTable).where(and(
    eq(rhCongesTable.cooperativeId, coopId),
    eq(rhCongesTable.personnelId, personnelId),
    eq(rhCongesTable.type, "annuel"),
    eq(rhCongesTable.statut, "approuve"),
  ));
  const used = rows
    .filter((row) => row.dateDebut.startsWith(String(year)))
    .reduce((sum, row) => sum + (row.jours ?? 0), 0);
  return { entitlement: CONGE_SOLDE_ANNUEL, used, remaining: Math.max(0, CONGE_SOLDE_ANNUEL - used), year };
}

export async function listRhConges(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const rows = await db.select({
      conge: rhCongesTable,
      nom: personnelTable.nom,
      prenoms: personnelTable.prenoms,
      poste: personnelTable.poste,
    }).from(rhCongesTable)
      .innerJoin(personnelTable, eq(personnelTable.id, rhCongesTable.personnelId))
      .where(eq(rhCongesTable.cooperativeId, coopId))
      .orderBy(desc(rhCongesTable.createdAt));
    const year = Number(req.query["annee"] ?? new Date().getUTCFullYear());
    const personnelIds = [...new Set(rows.map((row) => row.conge.personnelId))];
    const balances = await Promise.all(personnelIds.map(async (personnelId) => [personnelId, await annualLeaveBalance(coopId, personnelId, year)] as const));
    const balanceByPerson = new Map(balances);
    res.json(rows.map((row) => ({
      ...row.conge,
      personnelNom: `${row.nom} ${row.prenoms}`,
      poste: row.poste,
      solde: balanceByPerson.get(row.conge.personnelId),
    })));
  } catch (err) {
    handleError(req, res, err, "listRhConges");
  }
}

export async function createRhConge(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const personnelId = await validatePersonnelReference(req, res, coopId);
    if (!personnelId) return;
    const body = req.body as Record<string, unknown>;
    const dateDebut = validDate(body["dateDebut"]);
    const dateFin = validDate(body["dateFin"]);
    const type = requiredText(body["type"]) ?? "annuel";
    if (!dateDebut || !dateFin || dateFin < dateDebut || inclusiveDays(dateDebut, dateFin) <= 0) {
      res.status(400).json({ erreur: "Période de congé invalide" });
      return;
    }
    const jours = inclusiveDays(dateDebut, dateFin);
    if (type === "annuel") {
      const balance = await annualLeaveBalance(coopId, personnelId, Number(dateDebut.slice(0, 4)));
      if (jours > balance.remaining) {
        res.status(409).json({ erreur: "Solde de congés annuel insuffisant", solde: balance });
        return;
      }
    }
    const [row] = await db.insert(rhCongesTable).values({
      cooperativeId: coopId, personnelId, type, dateDebut, dateFin, jours,
      motif: textOf(body["motif"]), demandeurId: req.user?.id ?? null,
    }).returning();
    await logHistory(coopId, personnelId, "conge", row?.id ?? null, "demande", { jours, type }, req.user?.id ?? null);
    res.status(201).json(row);
  } catch (err) {
    handleError(req, res, err, "createRhConge");
  }
}

export async function decideRhConge(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const id = idOf(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const decision = String(body["decision"] ?? "");
    if (decision !== "approuve" && decision !== "refuse") {
      res.status(400).json({ erreur: "La décision doit être approuve ou refuse" });
      return;
    }
    const [existing] = await db.select().from(rhCongesTable).where(and(eq(rhCongesTable.id, id), eq(rhCongesTable.cooperativeId, coopId))).limit(1);
    if (!existing) {
      res.status(404).json({ erreur: "Demande de congé introuvable" });
      return;
    }
    if (existing.statut !== "demande") {
      res.status(409).json({ erreur: "Cette demande a déjà été traitée" });
      return;
    }
    if (decision === "approuve" && existing.type === "annuel") {
      const balance = await annualLeaveBalance(coopId, existing.personnelId, Number(existing.dateDebut.slice(0, 4)));
      if (existing.jours > balance.remaining) {
        res.status(409).json({ erreur: "Solde de congés annuel insuffisant", solde: balance });
        return;
      }
    }
    const [updated] = await db.update(rhCongesTable).set({
      statut: decision,
      validePar: req.user?.id ?? null,
      valideAt: new Date(),
      commentaireValidation: textOf(body["commentaire"]),
      updatedAt: new Date(),
    }).where(and(eq(rhCongesTable.id, id), eq(rhCongesTable.statut, "demande"))).returning();
    if (!updated) {
      res.status(409).json({ erreur: "La demande a été traitée entre-temps" });
      return;
    }
    await logHistory(coopId, existing.personnelId, "conge", id, decision, { commentaire: textOf(body["commentaire"]) }, req.user?.id ?? null);
    res.json(updated);
  } catch (err) {
    handleError(req, res, err, "decideRhConge");
  }
}

export async function listRhAbsences(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const rows = await db.select({
      absence: rhAbsencesTable,
      nom: personnelTable.nom,
      prenoms: personnelTable.prenoms,
      poste: personnelTable.poste,
    }).from(rhAbsencesTable)
      .innerJoin(personnelTable, eq(personnelTable.id, rhAbsencesTable.personnelId))
      .where(eq(rhAbsencesTable.cooperativeId, coopId))
      .orderBy(desc(rhAbsencesTable.dateDebut));
    res.json(rows.map((row) => ({ ...row.absence, personnelNom: `${row.nom} ${row.prenoms}`, poste: row.poste })));
  } catch (err) {
    handleError(req, res, err, "listRhAbsences");
  }
}

export async function createRhAbsence(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const personnelId = await validatePersonnelReference(req, res, coopId);
    if (!personnelId) return;
    const body = req.body as Record<string, unknown>;
    const dateDebut = validDate(body["dateDebut"]);
    const dateFin = validDate(body["dateFin"]);
    if (!dateDebut || !dateFin || dateFin < dateDebut) {
      res.status(400).json({ erreur: "Période d'absence invalide" });
      return;
    }
    const [row] = await db.insert(rhAbsencesTable).values({
      cooperativeId: coopId, personnelId,
      type: requiredText(body["type"]) ?? "justifiee",
      dateDebut, dateFin, jours: inclusiveDays(dateDebut, dateFin),
      motif: textOf(body["motif"]), justificatifUrl: textOf(body["justificatifUrl"]),
    }).returning();
    await logHistory(coopId, personnelId, "absence", row?.id ?? null, "signalement", { jours: row?.jours }, req.user?.id ?? null);
    res.status(201).json(row);
  } catch (err) {
    handleError(req, res, err, "createRhAbsence");
  }
}

export async function updateRhAbsence(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const id = idOf(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const [existing] = await db.select().from(rhAbsencesTable).where(and(eq(rhAbsencesTable.id, id), eq(rhAbsencesTable.cooperativeId, coopId))).limit(1);
    if (!existing) {
      res.status(404).json({ erreur: "Absence introuvable" });
      return;
    }
    const updates: Partial<typeof rhAbsencesTable.$inferInsert> = { updatedAt: new Date() };
    if (body["type"] !== undefined) updates.type = textOf(body["type"]) ?? existing.type;
    if (body["motif"] !== undefined) updates.motif = textOf(body["motif"]);
    if (body["justificatifUrl"] !== undefined) updates.justificatifUrl = textOf(body["justificatifUrl"]);
    if (body["statut"] !== undefined && ["signalee", "validee", "refusee"].includes(String(body["statut"]))) {
      updates.statut = String(body["statut"]);
      updates.validePar = req.user?.id ?? null;
      updates.valideAt = new Date();
    }
    const [updated] = await db.update(rhAbsencesTable).set(updates).where(eq(rhAbsencesTable.id, id)).returning();
    await logHistory(coopId, existing.personnelId, "absence", id, "modification", { champs: Object.keys(updates) }, req.user?.id ?? null);
    res.json(updated);
  } catch (err) {
    handleError(req, res, err, "updateRhAbsence");
  }
}

export async function getRhDashboard(req: Request, res: Response): Promise<void> {
  try {
    const coopId = cooperativeId(req);
    const [personnel, contrats, documents, conges, absences] = await Promise.all([
      db.select().from(personnelTable).where(eq(personnelTable.cooperativeId, coopId)),
      db.select().from(rhContratsTable).where(eq(rhContratsTable.cooperativeId, coopId)),
      db.select().from(rhDocumentsTable).where(eq(rhDocumentsTable.cooperativeId, coopId)),
      db.select().from(rhCongesTable).where(eq(rhCongesTable.cooperativeId, coopId)),
      db.select().from(rhAbsencesTable).where(eq(rhAbsencesTable.cooperativeId, coopId)),
    ]);
    const today = todayIso();
    const threshold = addDays(today, ECHEANCE_JOURS);
    const echeances = [
      ...contrats.filter((row) => row.dateFin && row.dateFin <= threshold).map((row) => {
        const date = row.dateFin!;
        return {
        id: row.id, nature: "contrat", personnelId: row.personnelId, date, titre: `Contrat ${row.type}`, urgent: date < today,
        };
      }),
      ...documents.filter((row) => row.dateExpiration && row.dateExpiration <= threshold).map((row) => {
        const date = row.dateExpiration!;
        return {
        id: row.id, nature: "document", personnelId: row.personnelId, date, titre: row.titre, urgent: date < today,
        };
      }),
    ].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const currentYear = new Date().getUTCFullYear();
    const approvedCurrentYear = conges.filter((row) => row.statut === "approuve" && row.type === "annuel" && row.dateDebut.startsWith(String(currentYear)));
    const absencesCurrentYear = absences.filter((row) => row.dateDebut.startsWith(String(currentYear)));
    res.json({
      effectif: {
        total: personnel.length,
        actifs: personnel.filter((row) => row.statut === "actif").length,
        suspendus: personnel.filter((row) => row.statut === "suspendu").length,
        sortis: personnel.filter((row) => row.statut === "sorti").length,
      },
      mouvements: {
        embauches30J: personnel.filter((row) => row.dateEmbauche >= addDays(today, -30)).length,
        finsContrat60J: contrats.filter((row) => row.dateFin && row.dateFin >= today && row.dateFin <= threshold).length,
      },
      conges: {
        demandes: conges.filter((row) => row.statut === "demande").length,
        approuvesAnnee: approvedCurrentYear.reduce((sum, row) => sum + row.jours, 0),
        soldeReference: CONGE_SOLDE_ANNUEL,
      },
      absences: {
        enAttente: absences.filter((row) => row.statut === "signalee").length,
        joursAnnee: absencesCurrentYear.reduce((sum, row) => sum + row.jours, 0),
      },
      echeances,
    });
  } catch (err) {
    handleError(req, res, err, "getRhDashboard");
  }
}

export async function getRhAlertes(req: Request, res: Response): Promise<void> {
  try {
    const dashboard = await new Promise<unknown>((resolve, reject) => {
      const fakeResponse = {
        json: resolve,
        status: () => fakeResponse,
      } as unknown as Response;
      getRhDashboard(req, fakeResponse).catch(reject);
    });
    res.json((dashboard as { echeances?: unknown[] }).echeances ?? []);
  } catch (err) {
    handleError(req, res, err, "getRhAlertes");
  }
}