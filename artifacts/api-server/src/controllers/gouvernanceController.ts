import { Request, Response } from "express";
import { db } from "@workspace/db";
import {
  assembleesGeneralesTable,
  presencesAgTable,
  pointsOrdreDuJourTable,
  votesAgTable,
  convocationsAgTable,
  membresTable,
} from "@workspace/db";
import { eq, and, sql, desc, asc } from "drizzle-orm";
import { sendBulkSMS } from "../services/smsService";
import { generatePvAg } from "../services/pdfService";

const coopId = (req: import("express").Request) => req.user?.cooperativeId ?? 1;

const pid = (v: string | string[]): number => parseInt(Array.isArray(v) ? v[0] : v, 10);

// ─── AG — Liste + Planification ──────────────────────────────────────────────

export async function listerAGs(req: Request, res: Response): Promise<void> {
  const rows = await db
    .select({
      ag:        assembleesGeneralesTable,
      nbPoints:  sql<number>`(SELECT COUNT(*) FROM points_ordre_du_jour WHERE ag_id = ${assembleesGeneralesTable.id})::int`,
      nbVotes:   sql<number>`(SELECT COUNT(*) FROM votes_ag WHERE ag_id = ${assembleesGeneralesTable.id})::int`,
    })
    .from(assembleesGeneralesTable)
    .where(eq(assembleesGeneralesTable.cooperativeId, coopId(req)))
    .orderBy(desc(assembleesGeneralesTable.dateAg));

  res.json(rows);
}

export async function planifierAG(req: Request, res: Response): Promise<void> {
  const {
    type, libelle, dateAg, heureDebut, heureFin, lieu,
    ordreDuJour, quorumRequisPct, points,
  } = req.body as {
    type?: string; libelle?: string; dateAg?: string; heureDebut?: string;
    heureFin?: string; lieu?: string; ordreDuJour?: string[];
    quorumRequisPct?: number; points?: { intitule: string; type: string; rapporteur?: string; dureeMinutes?: number }[];
  };

  if (!libelle || !dateAg) {
    res.status(400).json({ erreur: "libelle et dateAg requis" });
    return;
  }

  // Compter membres actifs pour nb_convoques
  const [nbMembres] = await db.select({ nb: sql<number>`COUNT(*)::int` })
    .from(membresTable)
    .where(and(eq(membresTable.cooperativeId, coopId(req)), eq(membresTable.statut, "actif")));

  const [ag] = await db.insert(assembleesGeneralesTable).values({
    cooperativeId:     coopId(req),
    type:              (type as "ordinaire"|"extraordinaire"|"constitutive") ?? "ordinaire",
    libelle,
    dateAg,
    heureDebut:        heureDebut ?? undefined,
    heureFin:          heureFin   ?? undefined,
    lieu,
    ordreDuJour:       ordreDuJour ?? [],
    quorumRequisPct:   String(quorumRequisPct ?? 50),
    nbMembresConvoques:Number(nbMembres?.nb ?? 0),
    statut:            "planifiee",
  }).returning();

  // Insérer les points si fournis
  if (Array.isArray(points) && points.length > 0) {
    await db.insert(pointsOrdreDuJourTable).values(
      points.map((p, i) => ({
        agId:         ag!.id,
        numero:       i + 1,
        intitule:     p.intitule,
        type:         (p.type as "information"|"deliberation"|"vote"|"election") ?? "information",
        rapporteur:   p.rapporteur,
        dureeMinutes: p.dureeMinutes,
      }))
    );
  }

  req.log.info({ agId: ag!.id }, "AG planifiée");
  res.status(201).json(ag);
}

export async function getAgDetail(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);

  const [ag] = await db
    .select()
    .from(assembleesGeneralesTable)
    .where(and(eq(assembleesGeneralesTable.id, id), eq(assembleesGeneralesTable.cooperativeId, coopId(req))))
    .limit(1);

  if (!ag) { res.status(404).json({ erreur: "AG introuvable" }); return; }

  const [points, presences, convocations] = await Promise.all([
    db.select().from(pointsOrdreDuJourTable).where(eq(pointsOrdreDuJourTable.agId, id)).orderBy(asc(pointsOrdreDuJourTable.numero)),
    db.select({ p: presencesAgTable, m: membresTable })
      .from(presencesAgTable)
      .innerJoin(membresTable, eq(presencesAgTable.membreId, membresTable.id))
      .where(eq(presencesAgTable.agId, id))
      .orderBy(asc(presencesAgTable.heureArrivee)),
    db.select().from(convocationsAgTable).where(eq(convocationsAgTable.agId, id)).orderBy(desc(convocationsAgTable.createdAt)),
  ]);

  // Votes par point
  const votes = await db.select().from(votesAgTable).where(eq(votesAgTable.agId, id));

  res.json({ ag, points, presences, votes, convocations });
}

export async function modifierAG(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  const { libelle, dateAg, heureDebut, heureFin, lieu, quorumRequisPct, ordreDuJour } = req.body as {
    libelle?: string; dateAg?: string; heureDebut?: string; heureFin?: string;
    lieu?: string; quorumRequisPct?: number; ordreDuJour?: string[];
  };

  const [updated] = await db
    .update(assembleesGeneralesTable)
    .set({
      libelle,
      dateAg:           dateAg     ?? undefined,
      heureDebut:       heureDebut ?? undefined,
      heureFin:         heureFin   ?? undefined,
      lieu,
      quorumRequisPct:  quorumRequisPct ? String(quorumRequisPct) : undefined,
      ordreDuJour:      ordreDuJour ?? undefined,
      updatedAt:        new Date(),
    })
    .where(and(eq(assembleesGeneralesTable.id, id), eq(assembleesGeneralesTable.cooperativeId, coopId(req))))
    .returning();

  if (!updated) { res.status(404).json({ erreur: "AG introuvable" }); return; }
  res.json(updated);
}

export async function ouvrirSeance(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  const [updated] = await db
    .update(assembleesGeneralesTable)
    .set({ statut: "ouverte", updatedAt: new Date() })
    .where(and(eq(assembleesGeneralesTable.id, id), eq(assembleesGeneralesTable.cooperativeId, coopId(req))))
    .returning();
  if (!updated) { res.status(404).json({ erreur: "AG introuvable" }); return; }
  req.log.info({ agId: id }, "Séance AG ouverte");
  res.json(updated);
}

export async function cloturerSeance(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  const { heureFin } = req.body as { heureFin?: string };

  const [updated] = await db
    .update(assembleesGeneralesTable)
    .set({ statut: "cloturee", heureFin: heureFin ?? undefined, updatedAt: new Date() })
    .where(and(eq(assembleesGeneralesTable.id, id), eq(assembleesGeneralesTable.cooperativeId, coopId(req))))
    .returning();
  if (!updated) { res.status(404).json({ erreur: "AG introuvable" }); return; }
  req.log.info({ agId: id }, "Séance AG clôturée");
  res.json(updated);
}

// ─── CONVOCATIONS ────────────────────────────────────────────────────────────

export async function envoyerConvocations(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  const { canal, messagePersonnalise } = req.body as { canal?: string; messagePersonnalise?: string };

  const [ag] = await db
    .select()
    .from(assembleesGeneralesTable)
    .where(and(eq(assembleesGeneralesTable.id, id), eq(assembleesGeneralesTable.cooperativeId, coopId(req))))
    .limit(1);
  if (!ag) { res.status(404).json({ erreur: "AG introuvable" }); return; }

  const membres = await db
    .select({ telephone: membresTable.telephone, nom: membresTable.nom, prenoms: membresTable.prenoms })
    .from(membresTable)
    .where(and(eq(membresTable.cooperativeId, coopId(req)), eq(membresTable.statut, "actif")));

  const heureStr = ag.heureDebut ? ` à ${ag.heureDebut.slice(0, 5)}` : "";
  const ordrePts = (ag.ordreDuJour ?? []).slice(0, 3).join(", ");

  const messages = membres.map((m) => {
    const prenom = m.prenoms ? m.prenoms.split(" ")[0] : "";
    const nomComplet = [prenom, m.nom].filter(Boolean).join(" ");
    const typeFr = ag.type === "ordinaire" ? "Ordinaire" : ag.type === "extraordinaire" ? "Extraordinaire" : "Constitutive";
    return messagePersonnalise
      ? messagePersonnalise.replace("{nom}", nomComplet).replace("{type}", typeFr)
      : `Cher(e) ${nomComplet}, vous êtes convoqué(e) à l'AG ${typeFr} le ${new Date(ag.dateAg).toLocaleDateString("fr-FR")}${heureStr} au ${ag.lieu ?? "siège"}. Ordre du jour : ${ordrePts}. Répondez OUI pour confirmer.`;
  });

  const telephones = membres.map((m) => m.telephone ?? "").filter(Boolean);
  const defaultMsg = `Convocation AG ${ag.libelle} — ${new Date(ag.dateAg).toLocaleDateString("fr-FR")}`;

  // Envoi groupé (1 message par membre pour personnalisation)
  let envoyes = 0, echecs = 0;
  const BATCH = 50;
  for (let i = 0; i < telephones.length; i += BATCH) {
    const batchTels = telephones.slice(i, i + BATCH);
    const batchMsgs = messages.slice(i, i + BATCH);
    // Envoi individualisé
    const results = await Promise.all(
      batchTels.map(async (tel, j) => {
        const msg = batchMsgs[j] ?? defaultMsg;
        const result = await sendBulkSMS([tel], msg);
        return result.envoyes;
      })
    );
    envoyes += results.reduce((a, b) => a + b, 0);
    echecs  += batchTels.length - results.reduce((a, b) => a + b, 0);
  }

  await db.insert(convocationsAgTable).values({
    agId:          id,
    canal:         (canal as "sms"|"whatsapp"|"affichage") ?? "sms",
    nbEnvoyes:     envoyes,
    messageEnvoye: messages[0] ?? defaultMsg,
  });

  // Mise à jour nb_membres_convoques
  await db.update(assembleesGeneralesTable)
    .set({ nbMembresConvoques: membres.length, updatedAt: new Date() })
    .where(eq(assembleesGeneralesTable.id, id));

  req.log.info({ agId: id, canal, envoyes, echecs }, "Convocations envoyées");
  res.json({ ok: true, envoyes, echecs, total: membres.length });
}

// ─── PRÉSENCES ────────────────────────────────────────────────────────────────

export async function enregistrerPresence(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  const { membreId, modePresence, mandataireId } = req.body as {
    membreId?: number; modePresence?: string; mandataireId?: number;
  };

  if (!membreId) { res.status(400).json({ erreur: "membreId requis" }); return; }

  const [ag] = await db.select()
    .from(assembleesGeneralesTable)
    .where(and(eq(assembleesGeneralesTable.id, id), eq(assembleesGeneralesTable.cooperativeId, coopId(req))))
    .limit(1);
  if (!ag) { res.status(404).json({ erreur: "AG introuvable" }); return; }

  // Upsert présence (ON CONFLICT ignore — UNIQUE ag_id + membre_id)
  await db.execute(
    sql`INSERT INTO presences_ag (ag_id, membre_id, mode_presence, mandataire_id, heure_arrivee, emargement_numerique)
        VALUES (${id}, ${membreId}, ${modePresence ?? "physique"}, ${mandataireId ?? null}, NOW(), true)
        ON CONFLICT (ag_id, membre_id) DO UPDATE SET
          mode_presence = EXCLUDED.mode_presence,
          mandataire_id = EXCLUDED.mandataire_id,
          emargement_numerique = true`
  );

  // Recalculer présents + quorum
  const [cnt] = await db.select({ nb: sql<number>`COUNT(*)::int` })
    .from(presencesAgTable)
    .where(eq(presencesAgTable.agId, id));

  const presents = Number(cnt?.nb ?? 0);
  const quorumAtteint = ag.nbMembresConvoques && ag.nbMembresConvoques > 0
    ? (presents / ag.nbMembresConvoques) * 100 >= parseFloat(ag.quorumRequisPct ?? "50")
    : false;

  const [updated] = await db.update(assembleesGeneralesTable)
    .set({ nbMembresPresents: presents, quorumAtteint, updatedAt: new Date() })
    .where(eq(assembleesGeneralesTable.id, id))
    .returning();

  req.log.info({ agId: id, membreId, presents, quorumAtteint }, "Présence enregistrée");
  res.json({ ok: true, nbMembresPresents: presents, quorumAtteint, ag: updated });
}

export async function listerPresences(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  const rows = await db
    .select({ presence: presencesAgTable, membre: membresTable })
    .from(presencesAgTable)
    .innerJoin(membresTable, eq(presencesAgTable.membreId, membresTable.id))
    .where(eq(presencesAgTable.agId, id))
    .orderBy(asc(presencesAgTable.heureArrivee));
  res.json(rows);
}

// ─── VOTES ────────────────────────────────────────────────────────────────────

export async function enregistrerVote(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  const { pointId, intituleResolution, nbPour, nbContre, nbAbstention } = req.body as {
    pointId?: number; intituleResolution?: string; nbPour?: number; nbContre?: number; nbAbstention?: number;
  };

  if (!pointId || !intituleResolution) {
    res.status(400).json({ erreur: "pointId et intituleResolution requis" });
    return;
  }

  const pour       = nbPour       ?? 0;
  const contre     = nbContre     ?? 0;
  const abstention = nbAbstention ?? 0;
  const votants    = pour + contre + abstention;
  const pct        = votants > 0 ? (pour / votants) * 100 : 0;
  const resultat   = votants === 0 ? "nul" : pct > 50 ? "adopte" : "rejete";

  const [vote] = await db.insert(votesAgTable).values({
    agId:               id,
    pointId,
    intituleResolution,
    nbPour:             pour,
    nbContre:           contre,
    nbAbstention:       abstention,
    nbVotants:          votants,
    resultat:           resultat as "adopte"|"rejete"|"nul",
    pourcentagePour:    String(Math.round(pct * 100) / 100),
  }).returning();

  // Marquer le point comme traité
  await db.update(pointsOrdreDuJourTable)
    .set({ statut: "traite", decision: `${resultat === "adopte" ? "Adopté" : "Rejeté"} à ${Math.round(pct)}% (${pour} pour, ${contre} contre, ${abstention} abstentions)` })
    .where(eq(pointsOrdreDuJourTable.id, pointId));

  req.log.info({ agId: id, pointId, resultat, pct: Math.round(pct) }, "Vote enregistré");
  res.status(201).json(vote);
}

// ─── PV PDF ───────────────────────────────────────────────────────────────────

export async function getPvPdf(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);

  const [ag] = await db
    .select()
    .from(assembleesGeneralesTable)
    .where(and(eq(assembleesGeneralesTable.id, id), eq(assembleesGeneralesTable.cooperativeId, coopId(req))))
    .limit(1);
  if (!ag) { res.status(404).json({ erreur: "AG introuvable" }); return; }

  const [points, presences, votes] = await Promise.all([
    db.select().from(pointsOrdreDuJourTable).where(eq(pointsOrdreDuJourTable.agId, id)).orderBy(asc(pointsOrdreDuJourTable.numero)),
    db.select({ p: presencesAgTable, m: membresTable })
      .from(presencesAgTable)
      .innerJoin(membresTable, eq(presencesAgTable.membreId, membresTable.id))
      .where(eq(presencesAgTable.agId, id))
      .orderBy(asc(presencesAgTable.createdAt)),
    db.select().from(votesAgTable).where(eq(votesAgTable.agId, id)),
  ]);

  const pdfBuffer = await generatePvAg({ ag, points, presences, votes });

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="PV_AG_${ag.dateAg}_${id}.pdf"`);
  res.end(pdfBuffer);
}
