import { db } from "@workspace/db";
import { ticketsSupportTable, messagesTicketTable } from "@workspace/db";
import { eq, and, desc, sql, lt, isNull, not } from "drizzle-orm";
import { sendSMS } from "./smsService.js";
import { logger } from "../lib/logger";

// ─── Config ───────────────────────────────────────────────────────────────────

const YOUSSOUF_TEL   = "0714174082";
const YOUSSOUF_EMAIL = "contacteyouss@gmail.com";

// ─── Génération de référence ──────────────────────────────────────────────────

async function genererReference(): Promise<string> {
  const annee = new Date().getFullYear();
  const [row] = await db.execute<{ nb: string }>(sql`
    SELECT COUNT(*)::text AS nb
    FROM tickets_support
    WHERE EXTRACT(YEAR FROM created_at) = ${annee}
  `).then((r) => r.rows);
  const n = (Number(row?.nb ?? 0) + 1).toString().padStart(4, "0");
  return `TKT-${annee}-${n}`;
}

// ─── SMS ──────────────────────────────────────────────────────────────────────

async function notifierSmsUrgent(reference: string, titre: string, nomCoop: string) {
  const msg = `🚨 URGENT — Ticket ${reference} de ${nomCoop}. ${titre}. Connecte-toi au dashboard M15.`;
  try {
    await sendSMS(YOUSSOUF_TEL, msg);
    logger.info({ reference }, "SMS urgent envoyé");
  } catch (err) {
    logger.error({ err, reference }, "Échec SMS urgent");
  }
}

async function notifierSmsHaute(reference: string, titre: string, nomCoop: string) {
  const msg = `⚠️ Ticket ${reference} — Priorité HAUTE — ${nomCoop}. ${titre}. Dashboard M15.`;
  try {
    await sendSMS(YOUSSOUF_TEL, msg);
    logger.info({ reference }, "SMS haute priorité envoyé");
  } catch (err) {
    logger.error({ err, reference }, "Échec SMS haute priorité");
  }
}

/** Email de confirmation (simulé — intégration SMTP future) */
function envoyerEmailConfirmation(params: {
  to: string;
  reference: string;
  titre: string;
}) {
  logger.info(
    { to: params.to, reference: params.reference },
    `Email confirmation ticket ${params.reference} → ${params.titre}`
  );
  // TODO: intégrer un service email (nodemailer / Brevo) ici
}

// ─── CRON — Alertes haute priorité (+30 min) ──────────────────────────────────

export async function envoyerAlertesHautePriorite() {
  const trenteMinsAgo = new Date(Date.now() - 30 * 60 * 1000);
  const tickets = await db
    .select({
      id:          ticketsSupportTable.id,
      reference:   ticketsSupportTable.reference,
      titre:       ticketsSupportTable.titre,
      cooperativeId: ticketsSupportTable.cooperativeId,
    })
    .from(ticketsSupportTable)
    .where(
      and(
        eq(ticketsSupportTable.priorite, "haute"),
        eq(ticketsSupportTable.statut, "ouvert"),
        eq(ticketsSupportTable.smsHauteEnvoye, false),
        lt(ticketsSupportTable.createdAt, trenteMinsAgo),
      )
    );

  for (const t of tickets) {
    await notifierSmsHaute(t.reference, t.titre, `Coop #${t.cooperativeId}`);
    await db
      .update(ticketsSupportTable)
      .set({ smsHauteEnvoye: true })
      .where(eq(ticketsSupportTable.id, t.id));
  }

  if (tickets.length > 0) {
    logger.info({ nb: tickets.length }, "Alertes haute priorité envoyées");
  }
}

// ─── Créer ticket ─────────────────────────────────────────────────────────────

export async function creerTicket(params: {
  cooperativeId: number;
  ouvertPar: number;
  titre: string;
  description: string;
  categorie?: string;
  priorite?: string;
  moduleConcerne?: string;
  captureEcranUrl?: string;
}) {
  const reference = await genererReference();
  const priorite  = params.priorite ?? "normale";

  // Récupérer le nom de l'utilisateur
  const [userRow] = await db.execute<{ nom: string; prenoms: string; email: string }>(
    sql`SELECT nom, prenoms, email FROM users WHERE id = ${params.ouvertPar}`
  ).then((r) => r.rows);
  const auteurNom = userRow ? `${userRow.nom} ${userRow.prenoms}` : `Utilisateur #${params.ouvertPar}`;

  const [ticket] = await db
    .insert(ticketsSupportTable)
    .values({
      cooperativeId:   params.cooperativeId,
      reference,
      titre:           params.titre,
      description:     params.description,
      categorie:       params.categorie ?? "question",
      priorite,
      moduleConcerne:  params.moduleConcerne ?? null,
      captureEcranUrl: params.captureEcranUrl ?? null,
      ouvertPar:       params.ouvertPar,
    })
    .returning();

  // Message initial = description
  await db.insert(messagesTicketTable).values({
    ticketId:   ticket!.id,
    auteurType: "client",
    auteurId:   params.ouvertPar,
    auteurNom,
    contenu:    params.description,
    lu:         false,
  });

  // Notifications
  if (priorite === "urgente") {
    void notifierSmsUrgent(reference, params.titre, `Coop #${params.cooperativeId}`);
  }
  if (userRow?.email) {
    envoyerEmailConfirmation({ to: userRow.email, reference, titre: params.titre });
  }

  return ticket!;
}

// ─── Mes tickets ──────────────────────────────────────────────────────────────

export async function mesTickets(cooperativeId: number, ouvertPar?: number) {
  const rows = await db
    .select()
    .from(ticketsSupportTable)
    .where(
      and(
        eq(ticketsSupportTable.cooperativeId, cooperativeId),
        ouvertPar ? eq(ticketsSupportTable.ouvertPar, ouvertPar) : undefined,
      )
    )
    .orderBy(desc(ticketsSupportTable.createdAt));
  return rows;
}

// ─── Détail ticket ────────────────────────────────────────────────────────────

export async function detailTicket(ticketId: number, cooperativeId?: number) {
  const conditions = [eq(ticketsSupportTable.id, ticketId)];
  if (cooperativeId) conditions.push(eq(ticketsSupportTable.cooperativeId, cooperativeId));

  const [ticket] = await db
    .select()
    .from(ticketsSupportTable)
    .where(and(...conditions))
    .limit(1);

  if (!ticket) return null;

  const messages = await db
    .select()
    .from(messagesTicketTable)
    .where(eq(messagesTicketTable.ticketId, ticketId))
    .orderBy(messagesTicketTable.createdAt);

  return { ...ticket, messages };
}

// ─── Ajouter message ──────────────────────────────────────────────────────────

export async function ajouterMessage(params: {
  ticketId: number;
  cooperativeId?: number;
  auteurType: "client" | "m15tech";
  auteurId?: number;
  auteurNom: string;
  contenu: string;
  pieceJointeUrl?: string;
}) {
  const ticket = await detailTicket(params.ticketId, params.cooperativeId);
  if (!ticket) throw new Error("Ticket introuvable");
  if (ticket.statut === "ferme") throw new Error("Ticket fermé");

  const [msg] = await db
    .insert(messagesTicketTable)
    .values({
      ticketId:       params.ticketId,
      auteurType:     params.auteurType,
      auteurId:       params.auteurId ?? null,
      auteurNom:      params.auteurNom,
      contenu:        params.contenu,
      pieceJointeUrl: params.pieceJointeUrl ?? null,
      lu:             false,
    })
    .returning();

  // Si M15 répond → mettre en_cours
  if (params.auteurType === "m15tech" && ticket.statut === "ouvert") {
    await db
      .update(ticketsSupportTable)
      .set({ statut: "en_cours", updatedAt: new Date() })
      .where(eq(ticketsSupportTable.id, params.ticketId));
  }

  return msg!;
}

// ─── Fermer ticket ────────────────────────────────────────────────────────────

export async function fermerTicket(params: {
  ticketId: number;
  cooperativeId: number;
  satisfaction?: number;
}) {
  const [ticket] = await db
    .update(ticketsSupportTable)
    .set({
      statut:          "ferme",
      satisfaction:    params.satisfaction ?? null,
      dateResolution:  new Date(),
      updatedAt:       new Date(),
    })
    .where(
      and(
        eq(ticketsSupportTable.id, params.ticketId),
        eq(ticketsSupportTable.cooperativeId, params.cooperativeId),
      )
    )
    .returning();
  return ticket ?? null;
}

// ─── M15 — Tous les tickets ───────────────────────────────────────────────────

export async function tousLesTickets(filters?: {
  priorite?: string;
  statut?: string;
  cooperativeId?: number;
}) {
  const rows = await db.execute<{
    id: number;
    reference: string;
    titre: string;
    priorite: string;
    statut: string;
    categorie: string;
    module_concerne: string | null;
    assigne_m15: string | null;
    cooperative_id: number;
    cooperative_nom: string;
    ouvert_par_nom: string | null;
    created_at: string;
    nb_messages: string;
    nb_non_lus: string;
  }>(sql`
    SELECT
      t.id, t.reference, t.titre, t.priorite, t.statut, t.categorie,
      t.module_concerne, t.assigne_m15, t.cooperative_id,
      c.nom AS cooperative_nom,
      u.nom || ' ' || u.prenoms AS ouvert_par_nom,
      t.created_at::text,
      COUNT(m.id)::text AS nb_messages,
      COUNT(m.id) FILTER (WHERE m.lu = false AND m.auteur_type = 'client')::text AS nb_non_lus
    FROM tickets_support t
    JOIN cooperatives c ON c.id = t.cooperative_id
    LEFT JOIN users u ON u.id = t.ouvert_par
    LEFT JOIN messages_ticket m ON m.ticket_id = t.id
    WHERE 1=1
      ${filters?.priorite     ? sql`AND t.priorite = ${filters.priorite}` : sql``}
      ${filters?.statut       ? sql`AND t.statut = ${filters.statut}` : sql``}
      ${filters?.cooperativeId ? sql`AND t.cooperative_id = ${filters.cooperativeId}` : sql``}
    GROUP BY t.id, c.nom, u.nom, u.prenoms
    ORDER BY
      CASE t.priorite WHEN 'urgente' THEN 1 WHEN 'haute' THEN 2 WHEN 'normale' THEN 3 ELSE 4 END,
      t.created_at DESC
  `);

  return rows.rows.map((r) => ({
    ...r,
    nb_messages: Number(r.nb_messages),
    nb_non_lus:  Number(r.nb_non_lus),
  }));
}

// ─── M15 — Prendre en charge ──────────────────────────────────────────────────

export async function prendreEnCharge(ticketId: number, nomAgent: string) {
  const [ticket] = await db
    .update(ticketsSupportTable)
    .set({ statut: "en_cours", assigneM15: nomAgent, updatedAt: new Date() })
    .where(eq(ticketsSupportTable.id, ticketId))
    .returning();
  return ticket ?? null;
}

// ─── M15 — Marquer résolu ─────────────────────────────────────────────────────

export async function marquerResolu(ticketId: number) {
  const [ticket] = await db
    .update(ticketsSupportTable)
    .set({ statut: "resolu", dateResolution: new Date(), updatedAt: new Date() })
    .where(eq(ticketsSupportTable.id, ticketId))
    .returning();
  return ticket ?? null;
}

// ─── FAQ statique ─────────────────────────────────────────────────────────────

export function getFaq() {
  return [
    {
      categorie: "Membres",
      questions: [
        { q: "Comment ajouter un nouveau membre ?", a: "Aller dans Membres > + Nouveau membre. Remplir le formulaire avec les informations du producteur." },
        { q: "Comment générer le QR code d'un membre ?", a: "Ouvrir la fiche du membre et cliquer sur 'Afficher QR Code'. Le code peut être imprimé ou envoyé." },
      ],
    },
    {
      categorie: "Livraisons",
      questions: [
        { q: "Comment saisir une livraison ?", a: "Livraisons > Nouvelle livraison. Scanner le QR du membre ou chercher par nom. Saisir le poids brut." },
        { q: "L'avance est-elle déduite automatiquement ?", a: "Oui, si le membre a une avance en cours, elle est déduite automatiquement du montant net à payer." },
      ],
    },
    {
      categorie: "Avances",
      questions: [
        { q: "Comment créer une avance ?", a: "Avances > Nouvelle avance. Sélectionner le membre et saisir le montant. Un seul emprunt actif par membre." },
        { q: "Comment rembourser une avance manuellement ?", a: "Ouvrir la fiche de l'avance > Rembourser. Saisir le montant partiel ou total." },
      ],
    },
    {
      categorie: "Comptabilité",
      questions: [
        { q: "Qu'est-ce qu'une écriture en attente ?", a: "Ce sont des écritures à valider (livraisons, paiements) avant clôture de période." },
        { q: "Comment générer un grand livre ?", a: "Comptabilité > Grand livre. Sélectionner la période et exporter en PDF." },
      ],
    },
    {
      categorie: "Technique",
      questions: [
        { q: "J'ai oublié mon mot de passe.", a: "Contacter M15 Tech par WhatsApp au 0714174082 ou par email à contacteyouss@gmail.com." },
        { q: "L'application ne répond plus.", a: "Actualiser la page (F5). Si le problème persiste, créer un ticket de type 'bug' avec une capture d'écran." },
      ],
    },
  ];
}
