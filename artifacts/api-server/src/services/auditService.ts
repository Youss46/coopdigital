import { type Request } from "express";
import crypto from "crypto";
import PDFDocument from "pdfkit";

import { db } from "@workspace/db";
import { auditTrailTable, sessionsUtilisateursTable, usersTable } from "@workspace/db";
import { eq, and, gte, lte, desc, sql, type SQL } from "drizzle-orm";
import { logger } from "../lib/logger";
import { drawHeader, drawFooter } from "./pdfHeaderService";



export type AuditAction =
  | "CREATE" | "UPDATE" | "DELETE"
  | "LOGIN" | "LOGOUT"
  | "EXPORT" | "PRINT" | "VALIDATE" | "REJECT" | "CONFIG_CHANGE";

export interface AuditLogParams {
  action:        AuditAction;
  module:        string;
  entiteType?:   string;
  entiteId?:     number;
  valeursAvant?: Record<string, unknown> | null;
  valeursApres?: Record<string, unknown> | null;
  description?:  string;
  sessionId?:    string;
  campagneId?:   number;
}

export interface AuditFilters {
  userId?:    number;
  module?:    string;
  action?:    string;
  entiteId?:  number;
  entiteType?: string;
  dateDebut?: string;
  dateFin?:   string;
  recherche?: string;
  limit?:     number;
  offset?:    number;
}

/** Calcule la liste des champs modifiés entre avant et après */
function calcChampsModifies(
  avant: Record<string, unknown> | null | undefined,
  apres: Record<string, unknown> | null | undefined,
): string[] {
  if (!avant || !apres) return [];
  return Object.keys(apres).filter((k) => {
    const a = avant[k];
    const b = apres[k];
    return JSON.stringify(a) !== JSON.stringify(b);
  });
}

/** Extrait l'IP depuis la requête */
function extractIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

/**
 * Enregistre une entrée d'audit.
 * JAMAIS de throw — l'audit ne doit jamais bloquer une opération métier.
 */
export async function log(req: Request, params: AuditLogParams): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId ?? null;
    const champsModifies = calcChampsModifies(
      params.valeursAvant ?? null,
      params.valeursApres ?? null,
    );
    const ip = extractIp(req);

    await db.insert(auditTrailTable).values({
      cooperativeId:  cooperativeId,
      userId:         req.user?.id,
      userNom:        (req.user as { nom?: string } | undefined)?.nom,
      userRole:       req.user?.role,
      userIp:         ip,
      userAgent:      req.headers["user-agent"]?.slice(0, 500),
      action:         params.action,
      module:         params.module,
      entiteType:     params.entiteType,
      entiteId:       params.entiteId,
      valeursAvant:   params.valeursAvant ?? null,
      valeursApres:   params.valeursApres ?? null,
      champsModifies: champsModifies.length ? champsModifies : null,
      description:    params.description,
      ipAddress:      ip === "unknown" ? undefined : ip,
      sessionId:      params.sessionId,
      campagneId:     params.campagneId,
    });
  } catch (err) {
    logger.warn({ err }, "auditService.log: échec silencieux");
  }
}

/** Enregistre une entrée d'audit sans contexte de requête (ex: login) */
export async function logRaw(params: AuditLogParams & {
  userId?: number;
  userRole?: string;
  ip?: string;
  userAgent?: string;
  cooperativeId?: number;
}): Promise<void> {
  try {
    const cooperativeId = params.cooperativeId ?? null;
    await db.insert(auditTrailTable).values({
      cooperativeId:  cooperativeId,
      userId:         params.userId,
      userRole:       params.userRole,
      userIp:         params.ip,
      userAgent:      params.userAgent?.slice(0, 500),
      action:         params.action,
      module:         params.module,
      entiteType:     params.entiteType,
      entiteId:       params.entiteId,
      description:    params.description,
      sessionId:      params.sessionId,
    });
  } catch (err) {
    logger.warn({ err }, "auditService.logRaw: échec silencieux");
  }
}

/** Mappe une ligne Drizzle auditTrailTable → shape snake_case conforme au spec AuditEntry */
function toAuditEntry(r: typeof auditTrailTable.$inferSelect) {
  return {
    id:              r.id,
    cooperative_id:  r.cooperativeId ?? null,
    user_id:         r.userId ?? null,
    user_nom:        r.userNom ?? null,
    user_role:       r.userRole ?? null,
    user_ip:         r.userIp ?? null,
    user_agent:      r.userAgent ?? null,
    action:          r.action,
    module:          r.module,
    entite_type:     r.entiteType ?? null,
    entite_id:       r.entiteId ?? null,
    valeurs_avant:   r.valeursAvant ?? null,
    valeurs_apres:   r.valeursApres ?? null,
    champs_modifies: r.champsModifies ?? null,
    description:     r.description ?? null,
    ip_address:      r.ipAddress ?? null,
    session_id:      r.sessionId ?? null,
    campagne_id:     r.campagneId ?? null,
    created_at:      r.createdAt.toISOString(),
  };
}

/** Journal filtré avec pagination */
export async function getJournal(cooperativeId: number, filters: AuditFilters) {
  const conditions: SQL[] = [eq(auditTrailTable.cooperativeId, cooperativeId)];

  if (filters.userId)    conditions.push(eq(auditTrailTable.userId, filters.userId));
  if (filters.module)    conditions.push(eq(auditTrailTable.module, filters.module));
  if (filters.action)    conditions.push(eq(auditTrailTable.action, filters.action));
  if (filters.entiteType) conditions.push(eq(auditTrailTable.entiteType, filters.entiteType));
  if (filters.entiteId)  conditions.push(eq(auditTrailTable.entiteId, filters.entiteId));
  if (filters.dateDebut) conditions.push(gte(auditTrailTable.createdAt, new Date(filters.dateDebut)));
  if (filters.dateFin)   conditions.push(lte(auditTrailTable.createdAt, new Date(filters.dateFin + "T23:59:59")));
  if (filters.recherche) {
    const q = `%${filters.recherche}%`;
    conditions.push(sql`(${auditTrailTable.description} ILIKE ${q} OR ${auditTrailTable.userNom} ILIKE ${q})`);
  }

  const limit  = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;

  const where = and(...conditions);

  const [rows, [countRow]] = await Promise.all([
    db
      .select()
      .from(auditTrailTable)
      .where(where)
      .orderBy(desc(auditTrailTable.createdAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<string>`COUNT(*)` })
      .from(auditTrailTable)
      .where(where),
  ]);

  return {
    entries: rows.map(toAuditEntry),
    total: parseInt(countRow?.count ?? "0"),
    limit,
    offset,
  };
}

/** Historique complet d'un enregistrement */
export async function getHistoriqueEntite(cooperativeId: number, entiteType: string, entiteId: number) {
  const rows = await db
    .select()
    .from(auditTrailTable)
    .where(
      and(
        eq(auditTrailTable.cooperativeId, cooperativeId),
        eq(auditTrailTable.entiteType, entiteType),
        eq(auditTrailTable.entiteId, entiteId),
      ),
    )
    .orderBy(desc(auditTrailTable.createdAt));
  return rows.map(toAuditEntry);
}

/** Toutes les actions d'un utilisateur */
export async function getUserActions(cooperativeId: number, userId: number, limit = 100) {
  const rows = await db
    .select()
    .from(auditTrailTable)
    .where(
      and(
        eq(auditTrailTable.cooperativeId, cooperativeId),
        eq(auditTrailTable.userId, userId),
      ),
    )
    .orderBy(desc(auditTrailTable.createdAt))
    .limit(limit);
  return rows.map(toAuditEntry);
}

/** Statistiques du journal */
export async function getStats(cooperativeId: number) {
  const now      = new Date();
  const debutJour = new Date(now); debutJour.setHours(0, 0, 0, 0);
  const debutSemaine = new Date(now); debutSemaine.setDate(now.getDate() - 7);
  const debut30j = new Date(now); debut30j.setDate(now.getDate() - 30);

  const [aujourd, semaine, parModule, parUser, sensibles, evolution] = await Promise.all([
    db.select({ count: sql<string>`COUNT(*)` })
      .from(auditTrailTable)
      .where(and(eq(auditTrailTable.cooperativeId, cooperativeId), gte(auditTrailTable.createdAt, debutJour))),

    db.select({ count: sql<string>`COUNT(*)` })
      .from(auditTrailTable)
      .where(and(eq(auditTrailTable.cooperativeId, cooperativeId), gte(auditTrailTable.createdAt, debutSemaine))),

    db.select({ module: auditTrailTable.module, nb: sql<string>`COUNT(*)` })
      .from(auditTrailTable)
      .where(and(eq(auditTrailTable.cooperativeId, cooperativeId), gte(auditTrailTable.createdAt, debut30j)))
      .groupBy(auditTrailTable.module)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10),

    db.select({
        userId: auditTrailTable.userId,
        userNom: sql<string>`COALESCE(TRIM(${usersTable.prenoms} || ' ' || ${usersTable.nom}), ${auditTrailTable.userNom})`,
        userRole: auditTrailTable.userRole,
        nb: sql<string>`COUNT(*)`,
      })
      .from(auditTrailTable)
      .leftJoin(usersTable, eq(usersTable.id, auditTrailTable.userId))
      .where(and(eq(auditTrailTable.cooperativeId, cooperativeId), gte(auditTrailTable.createdAt, debut30j)))
      .groupBy(auditTrailTable.userId, usersTable.nom, usersTable.prenoms, auditTrailTable.userRole)
      .orderBy(desc(sql`COUNT(*)`))
      .limit(10),

    db.select()
      .from(auditTrailTable)
      .where(
        and(
          eq(auditTrailTable.cooperativeId, cooperativeId),
          gte(auditTrailTable.createdAt, debut30j),
          sql`${auditTrailTable.action} IN ('DELETE', 'CONFIG_CHANGE')`,
        ),
      )
      .orderBy(desc(auditTrailTable.createdAt))
      .limit(30),

    db.select({
        jour: sql<string>`DATE_TRUNC('day', ${auditTrailTable.createdAt})::DATE::TEXT`,
        heure: sql<string>`DATE_TRUNC('hour', ${auditTrailTable.createdAt})::TEXT`,
        nb: sql<string>`COUNT(*)`,
      })
      .from(auditTrailTable)
      .where(and(eq(auditTrailTable.cooperativeId, cooperativeId), gte(auditTrailTable.createdAt, debutSemaine)))
      .groupBy(
        sql`DATE_TRUNC('day', ${auditTrailTable.createdAt})`,
        sql`DATE_TRUNC('hour', ${auditTrailTable.createdAt})`,
      )
      .orderBy(sql`DATE_TRUNC('hour', ${auditTrailTable.createdAt})`),
  ]);

  return {
    nb_actions_aujourd_hui: parseInt(aujourd[0]?.count ?? "0"),
    nb_actions_semaine:     parseInt(semaine[0]?.count ?? "0"),
    actions_par_module:     parModule.map((r) => ({ module: r.module, nb: parseInt(r.nb) })),
    actions_par_user:       parUser.map((r) => ({ userId: r.userId, nom: r.userNom, role: r.userRole, nb: parseInt(r.nb) })),
    modifications_critiques: sensibles,
    evolution_horaire:      evolution.map((r) => ({ heure: r.heure, nb: parseInt(r.nb) })),
  };
}

/** Liste des sessions */
export async function getSessions(cooperativeId: number, limit = 50) {
  const rows = await db
    .select()
    .from(sessionsUtilisateursTable)
    .where(eq(sessionsUtilisateursTable.cooperativeId, cooperativeId))
    .orderBy(desc(sessionsUtilisateursTable.dateConnexion))
    .limit(limit);

  return rows.map((s) => ({
    id:               s.id,
    cooperative_id:   s.cooperativeId,
    user_id:          s.userId,
    session_token:    s.sessionToken,
    ip_address:       s.ipAddress ?? null,
    user_agent:       s.userAgent ?? null,
    date_connexion:   s.dateConnexion.toISOString(),
    date_deconnexion: s.dateDeconnexion ? s.dateDeconnexion.toISOString() : null,
    duree_session_min: s.dureeSessionMin ?? null,
    nb_actions:       s.nbActions,
    statut:           s.statut,
  }));
}

/** Génère un PDF du journal signé avec hash SHA256 */
export async function exportAuditPDF(
  cooperativeId: number,
  filters: AuditFilters,
  generatedBy: string,
): Promise<Buffer> {
  const { entries } = await getJournal(cooperativeId, { ...filters, limit: 500, offset: 0 });
  const timestamp   = new Date().toISOString();

  const contenu = entries
    .map((e) => `${e.createdAt.toISOString()}|${e.action}|${e.module}|${e.userId}|${e.description ?? ""}`)
    .join("\n");
  const hashInput = `${contenu}|${timestamp}|${cooperativeId}`;
  const hash      = crypto.createHash("sha256").update(hashInput).digest("hex");

  const doc = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  const endPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end",  () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  // ─── En-tête ───────────────────────────────────────────────────────────────
  await drawHeader(doc, cooperativeId, { titre_document: "Journal d'Audit" });

    doc
      .fontSize(10)
      .fillColor("#666")
      .text(`Généré le ${new Date().toLocaleString("fr-FR")} par ${generatedBy}`, { align: "center" })
      .moveDown(0.5);

    // Filtres appliqués
    if (filters.dateDebut || filters.dateFin || filters.module) {
      doc.fontSize(9).fillColor("#444").text(
        `Période : ${filters.dateDebut ?? "—"} → ${filters.dateFin ?? "—"}   Module : ${filters.module ?? "tous"}`,
        { align: "center" },
      );
    }

    doc.moveDown(1).moveTo(40, doc.y).lineTo(555, doc.y).stroke("#1a4731").moveDown(0.5);

    // ─── Tableau ───────────────────────────────────────────────
    const colW = [95, 100, 65, 80, 210];
    const headers = ["Date/Heure", "Utilisateur", "Action", "Module", "Description"];

    // Header row
    doc.fontSize(8).fillColor("white");
    let x = 40;
    doc.rect(40, doc.y, 515, 16).fill("#1a4731");
    headers.forEach((h, i) => {
      doc.fillColor("white").text(h, x + 2, doc.y - 14, { width: colW[i]! - 4, lineBreak: false });
      x += colW[i]!;
    });
    doc.moveDown(0.5);

    // Rows
    let rowIdx = 0;
    for (const e of entries) {
      const rowY = doc.y;
      if (rowY > 750) {
        doc.addPage();
      }
      const bg = rowIdx % 2 === 0 ? "#f9f9f9" : "#ffffff";
      doc.rect(40, doc.y, 515, 15).fill(bg);

      x = 40;
      const rowData = [
        e.createdAt.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }),
        e.userNom ?? `User #${e.userId ?? "?"}`,
        e.action,
        e.module,
        (e.description ?? "").slice(0, 80),
      ];

      const actionColor = e.action === "DELETE" ? "#dc2626"
        : e.action === "CREATE" ? "#16a34a"
        : e.action === "CONFIG_CHANGE" ? "#7c3aed"
        : "#374151";

      rowData.forEach((val, i) => {
        const color = i === 2 ? actionColor : "#374151";
        doc.fontSize(7).fillColor(color).text(val, x + 2, doc.y - 13, { width: colW[i]! - 4, lineBreak: false });
        x += colW[i]!;
      });
      rowIdx++;
      doc.moveDown(0.4);
    }

    // ─── Pied de page avec hash ─────────────────────────────────
    doc
      .moveDown(2)
      .moveTo(40, doc.y).lineTo(555, doc.y).stroke("#ccc")
      .moveDown(0.5)
      .fontSize(7)
      .fillColor("#888")
      .text(
        `Document certifié — Hash SHA256 : ${hash}`,
        { align: "center" },
      )
      .text(
        `Généré le ${new Date().toLocaleString("fr-FR")} par ${generatedBy} — CoopDigital M15 Tech`,
        { align: "center" },
      );

  doc.end();
  return endPromise;
}
