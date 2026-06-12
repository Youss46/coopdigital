import { type Request, type Response } from "express";
import { db, messagesInternesTable, lecturesMessagesTable, usersTable } from "@workspace/db";
import { eq, desc, and, notExists, inArray, sql } from "drizzle-orm";
import { envoyerPushGroupe } from "../services/pushService.js";

function coopId(req: Request): number | null {
  return req.user?.cooperativeId ?? null;
}

const ROLES_DIRECTION = ["pca", "directeur", "comptable"] as const;

// ─── Résoudre les destinataires selon la cible ────────────────────────────────

async function resoudreDestinataires(cooperativeId: number, cible: string): Promise<number[]> {
  let rows: { id: number }[];

  if (cible === "tous") {
    rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(eq(usersTable.cooperativeId, cooperativeId), eq(usersTable.actif, true)));
  } else if (cible === "direction") {
    rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(
        eq(usersTable.cooperativeId, cooperativeId),
        eq(usersTable.actif, true),
        inArray(usersTable.role, [...ROLES_DIRECTION]),
      ));
  } else {
    rows = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(and(
        eq(usersTable.cooperativeId, cooperativeId),
        eq(usersTable.actif, true),
        eq(usersTable.role, cible as typeof ROLES_DIRECTION[number]),
      ));
  }

  return rows.map((r) => r.id);
}

// ─── POST /communication/messages ─────────────────────────────────────────────

export async function envoyerMessage(req: Request, res: Response): Promise<void> {
  const cooperativeId = coopId(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  const { sujet, contenu, destinataires = "tous" } = req.body as {
    sujet?: string;
    contenu?: string;
    destinataires?: string;
  };

  if (!sujet?.trim() || !contenu?.trim()) {
    res.status(400).json({ erreur: "Sujet et contenu sont requis" });
    return;
  }

  try {
    const userIds = await resoudreDestinataires(cooperativeId, destinataires);

    const [msg] = await db
      .insert(messagesInternesTable)
      .values({
        cooperativeId,
        auteurId: req.user?.id ?? null,
        sujet: sujet.trim(),
        contenu: contenu.trim(),
        destinataires,
        nbDestinataires: userIds.length,
      })
      .returning();

    envoyerPushGroupe(userIds, {
      title: `📬 ${sujet.trim()}`,
      body: contenu.trim().slice(0, 120),
      url: "/communication",
    }).catch(() => {});

    res.status(201).json({ id: msg!.id, nbDestinataires: userIds.length });
  } catch (err) {
    req.log.error({ err }, "Erreur envoyerMessage");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── GET /communication/messages ─────────────────────────────────────────────

export async function getMessagesEnvoyes(req: Request, res: Response): Promise<void> {
  const cooperativeId = coopId(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  try {
    const rows = await db
      .select({
        id: messagesInternesTable.id,
        sujet: messagesInternesTable.sujet,
        contenu: messagesInternesTable.contenu,
        destinataires: messagesInternesTable.destinataires,
        nbDestinataires: messagesInternesTable.nbDestinataires,
        createdAt: messagesInternesTable.createdAt,
        auteurNom: sql<string>`concat(${usersTable.prenoms}, ' ', ${usersTable.nom})`,
      })
      .from(messagesInternesTable)
      .leftJoin(usersTable, eq(messagesInternesTable.auteurId, usersTable.id))
      .where(eq(messagesInternesTable.cooperativeId, cooperativeId))
      .orderBy(desc(messagesInternesTable.createdAt))
      .limit(100);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur getMessagesEnvoyes");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── GET /communication/messages/recus ───────────────────────────────────────

export async function getMessagesRecus(req: Request, res: Response): Promise<void> {
  const cooperativeId = coopId(req);
  const userId = req.user?.id;
  const userRole = req.user?.role;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  try {
    const ciblesValides = ["tous", userRole, "direction"];

    if (userRole && ["pca", "directeur", "comptable"].includes(userRole)) {
      ciblesValides.push("direction");
    }

    const rows = await db
      .select({
        id: messagesInternesTable.id,
        sujet: messagesInternesTable.sujet,
        contenu: messagesInternesTable.contenu,
        destinataires: messagesInternesTable.destinataires,
        createdAt: messagesInternesTable.createdAt,
        auteurNom: sql<string>`concat(${usersTable.prenoms}, ' ', ${usersTable.nom})`,
        lu: sql<boolean>`EXISTS (
          SELECT 1 FROM lectures_messages
          WHERE message_id = ${messagesInternesTable.id}
          AND user_id = ${userId}
        )`,
      })
      .from(messagesInternesTable)
      .leftJoin(usersTable, eq(messagesInternesTable.auteurId, usersTable.id))
      .where(and(
        eq(messagesInternesTable.cooperativeId, cooperativeId),
        inArray(messagesInternesTable.destinataires, ciblesValides.filter((c): c is string => !!c)),
      ))
      .orderBy(desc(messagesInternesTable.createdAt))
      .limit(100);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur getMessagesRecus");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── PUT /communication/messages/:id/lire ────────────────────────────────────

export async function marquerLu(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const messageId = parseInt(String(req.params["id"]));
  if (!messageId) { res.status(400).json({ erreur: "ID message invalide" }); return; }

  try {
    await db
      .insert(lecturesMessagesTable)
      .values({ messageId, userId })
      .onConflictDoNothing();
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Erreur marquerLu");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── GET /communication/messages/non-lus ─────────────────────────────────────

export async function getNonLus(req: Request, res: Response): Promise<void> {
  const cooperativeId = coopId(req);
  const userId = req.user?.id;
  const userRole = req.user?.role;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  try {
    const ciblesValides = ["tous", userRole];
    if (userRole && ["pca", "directeur", "comptable"].includes(userRole)) {
      ciblesValides.push("direction");
    }

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messagesInternesTable)
      .where(and(
        eq(messagesInternesTable.cooperativeId, cooperativeId),
        inArray(messagesInternesTable.destinataires, ciblesValides.filter((c): c is string => !!c)),
        notExists(
          db.select({ one: sql`1` })
            .from(lecturesMessagesTable)
            .where(and(
              eq(lecturesMessagesTable.messageId, messagesInternesTable.id),
              eq(lecturesMessagesTable.userId, userId),
            )),
        ),
      ));

    res.json({ count: row?.count ?? 0 });
  } catch (err) {
    req.log.error({ err }, "Erreur getNonLus");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
