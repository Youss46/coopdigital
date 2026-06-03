import { type Request, type Response } from "express";
import { db, historiqueSmsTable, membresTable } from "@workspace/db";
import { eq, desc, and } from "drizzle-orm";
import { SendSmsGroupeBody } from "@workspace/api-zod";
import { sendBulkSMS } from "../services/smsService";

export async function sendSmsGroupe(req: Request, res: Response): Promise<void> {
  const parse = SendSmsGroupeBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  const { message, groupement } = parse.data;

  try {
    const user = (req as Request & { user?: { id: number; cooperativeId?: number | null } }).user;
    const cooperativeId = user?.cooperativeId ?? 1;

    const conditions = [eq(membresTable.statut, "actif"), eq(membresTable.cooperativeId, cooperativeId)];
    if (groupement) conditions.push(eq(membresTable.groupement, groupement));

    const membres = await db
      .select({ telephone: membresTable.telephone })
      .from(membresTable)
      .where(and(...conditions));

    const telephones = membres.map((m) => m.telephone).filter(Boolean);

    const { envoyes, echecs } = await sendBulkSMS(telephones, message);

    const statut: "envoye" | "echec" | "partiel" =
      echecs === 0 ? "envoye" : envoyes === 0 ? "echec" : "partiel";

    await db.insert(historiqueSmsTable).values({
      cooperativeId,
      agentId: user?.id ?? null,
      message,
      groupement: groupement ?? null,
      nbDestinataires: telephones.length,
      nbEnvoyes: envoyes,
      nbEchecs: echecs,
      statut,
    });

    res.json({ envoyes, echecs, total: telephones.length });
  } catch (err) {
    req.log.error({ err }, "Erreur sendSmsGroupe");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getCommunicationHistorique(req: Request, res: Response): Promise<void> {
  try {
    const user = (req as Request & { user?: { cooperativeId?: number | null } }).user;
    const cooperativeId = user?.cooperativeId ?? 1;

    const rows = await db
      .select({
        id: historiqueSmsTable.id,
        cooperativeId: historiqueSmsTable.cooperativeId,
        message: historiqueSmsTable.message,
        groupement: historiqueSmsTable.groupement,
        nbDestinataires: historiqueSmsTable.nbDestinataires,
        nbEnvoyes: historiqueSmsTable.nbEnvoyes,
        nbEchecs: historiqueSmsTable.nbEchecs,
        statut: historiqueSmsTable.statut,
        createdAt: historiqueSmsTable.createdAt,
      })
      .from(historiqueSmsTable)
      .where(eq(historiqueSmsTable.cooperativeId, cooperativeId))
      .orderBy(desc(historiqueSmsTable.createdAt))
      .limit(100);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur getCommunicationHistorique");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
