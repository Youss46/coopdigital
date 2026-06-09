import { db } from "@workspace/db";
import {
  usersTable,
  membresTable,
  livraisonsTable,
  paiementsTable,
  caissesDeleguesTable,
  mouvementsCaisseDelegueTable,
  caissesTable,
  mouvementsCaisseTable,
  alimentationsCaisseDelegueTable,
  campagnesTable,
} from "@workspace/db";
import { and, eq, sql, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { creerNotification, notifierParRole } from "./notificationService.js";

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

// ─── Caisse du délégué ──────────────────────────────────────────────────────

export async function getOrCreateCaisse(agentId: number, cooperativeId: number) {
  const [existing] = await db
    .select()
    .from(caissesDeleguesTable)
    .where(eq(caissesDeleguesTable.userId, agentId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(caissesDeleguesTable)
    .values({ userId: agentId, cooperativeId, solde: "0" })
    .returning();
  return created!;
}

export async function getCaisseDelegue(agentId: number, cooperativeId: number) {
  const caisse = await getOrCreateCaisse(agentId, cooperativeId);

  const [differes] = await db
    .select({ nb: sql<number>`COUNT(*)` })
    .from(livraisonsTable)
    .where(and(
      eq(livraisonsTable.agentId, agentId),
      eq(livraisonsTable.statutPaiement, "DIFFÉRÉ"),
    ));

  const [montantDu] = await db
    .select({ total: sql<string>`COALESCE(SUM(${livraisonsTable.montantRestant}), 0)` })
    .from(livraisonsTable)
    .where(and(
      eq(livraisonsTable.agentId, agentId),
      eq(livraisonsTable.statutPaiement, "DIFFÉRÉ"),
    ));

  return {
    id: caisse.id,
    solde: toNum(caisse.solde),
    plafond: caisse.plafond ? toNum(caisse.plafond) : null,
    paiementsDifferesCount: Number(differes?.nb ?? 0),
    montantDuFcfa: toNum(montantDu?.total),
  };
}

export async function approvisionnerCaisse(
  agentId: number,
  cooperativeId: number,
  montantFcfa: number,
  note: string | null,
  adminId: number,
) {
  if (montantFcfa <= 0) throw new Error("Le montant doit être positif");
  const caisse = await getOrCreateCaisse(agentId, cooperativeId);
  const nouveauSolde = toNum(caisse.solde) + montantFcfa;

  await db.update(caissesDeleguesTable)
    .set({ solde: String(nouveauSolde), updatedAt: new Date() })
    .where(eq(caissesDeleguesTable.id, caisse.id));

  await db.insert(mouvementsCaisseDelegueTable).values({
    caisseDelegueId: caisse.id,
    type: "approvisionnement",
    montantFcfa: String(montantFcfa),
    soldeApresFcfa: String(nouveauSolde),
    note: note ?? `Approvisionnement par admin`,
    createdById: adminId,
  });

  return { solde: nouveauSolde };
}

// ─── Paiements différés ─────────────────────────────────────────────────────

export async function getPaiementsDifferes(agentId: number, cooperativeId: number) {
  const rows = await db
    .select({
      livraisonId: livraisonsTable.id,
      membreId: livraisonsTable.membreId,
      dateLivraison: livraisonsTable.dateLivraison,
      poidsKg: livraisonsTable.poidsKg,
      montantNetFcfa: livraisonsTable.montantNetFcfa,
      montantRestant: livraisonsTable.montantRestant,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
    })
    .from(livraisonsTable)
    .innerJoin(membresTable, eq(membresTable.id, livraisonsTable.membreId))
    .where(and(
      eq(livraisonsTable.agentId, agentId),
      eq(livraisonsTable.statutPaiement, "DIFFÉRÉ"),
    ))
    .orderBy(desc(livraisonsTable.dateLivraison))
    .limit(100);

  return rows.map((r) => ({
    livraisonId: r.livraisonId,
    membreId: r.membreId,
    membreNom: `${r.membreNom} ${r.membrePrenoms}`,
    dateLivraison: r.dateLivraison,
    poidsKg: toNum(r.poidsKg),
    montantNetFcfa: r.montantNetFcfa,
    montantRestant: toNum(r.montantRestant),
  }));
}

export async function regulariserPaiement(
  agentId: number,
  cooperativeId: number,
  livraisonId: number,
  modePaiement: string,
) {
  const [livraison] = await db
    .select()
    .from(livraisonsTable)
    .where(and(
      eq(livraisonsTable.id, livraisonId),
      eq(livraisonsTable.agentId, agentId),
      eq(livraisonsTable.statutPaiement, "DIFFÉRÉ"),
    ));

  if (!livraison) throw new Error("Paiement différé introuvable");

  const montant = toNum(livraison.montantRestant);
  const caisse = await getOrCreateCaisse(agentId, cooperativeId);

  if (toNum(caisse.solde) < montant) {
    throw new Error(`Fonds insuffisants — solde : ${toNum(caisse.solde).toLocaleString("fr-FR")} FCFA, requis : ${montant.toLocaleString("fr-FR")} FCFA`);
  }

  const nouveauSolde = toNum(caisse.solde) - montant;

  await db.update(livraisonsTable)
    .set({ statutPaiement: "PAYÉ", montantRestant: "0" })
    .where(eq(livraisonsTable.id, livraisonId));

  await db.update(paiementsTable)
    .set({ statut: "confirme", modePaiement: modePaiement as "especes" | "orange_money" | "mtn_momo" })
    .where(and(
      eq(paiementsTable.livraisonId, livraisonId),
      eq(paiementsTable.statut, "en_attente"),
    ));

  await db.update(caissesDeleguesTable)
    .set({ solde: String(nouveauSolde), updatedAt: new Date() })
    .where(eq(caissesDeleguesTable.id, caisse.id));

  await db.insert(mouvementsCaisseDelegueTable).values({
    caisseDelegueId: caisse.id,
    type: "regularisation",
    montantFcfa: String(-montant),
    soldeApresFcfa: String(nouveauSolde),
    livraisonId,
    note: `Régularisation paiement LIV-${livraisonId}`,
    createdById: agentId,
  });

  return { solde: nouveauSolde, montantPayeFcfa: montant };
}

// ─── Vue admin : liste délégués avec caisse ──────────────────────────────────

export async function listDelegues(cooperativeId: number) {
  const agents = await db
    .select({
      id: usersTable.id,
      nom: usersTable.nom,
      prenoms: usersTable.prenoms,
      telephone: usersTable.telephone,
      section: usersTable.section,
      actif: usersTable.actif,
    })
    .from(usersTable)
    .where(and(
      eq(usersTable.cooperativeId, cooperativeId),
      eq(usersTable.role, "delegue"),
    ))
    .orderBy(usersTable.nom);

  const result = await Promise.all(agents.map(async (a) => {
    const [caisse] = await db
      .select({ solde: caissesDeleguesTable.solde, id: caissesDeleguesTable.id })
      .from(caissesDeleguesTable)
      .where(eq(caissesDeleguesTable.userId, a.id))
      .limit(1);

    const [differes] = await db
      .select({ nb: sql<number>`COUNT(*)`, total: sql<string>`COALESCE(SUM(${livraisonsTable.montantRestant}), 0)` })
      .from(livraisonsTable)
      .where(and(
        eq(livraisonsTable.agentId, a.id),
        eq(livraisonsTable.statutPaiement, "DIFFÉRÉ"),
      ));

    const [collectesTotal] = await db
      .select({ nb: sql<number>`COUNT(*)` })
      .from(livraisonsTable)
      .where(eq(livraisonsTable.agentId, a.id));

    return {
      id: a.id,
      nom: a.nom,
      prenoms: a.prenoms,
      telephone: a.telephone ?? null,
      section: a.section ?? null,
      actif: a.actif,
      caisse: {
        id: caisse?.id ?? null,
        solde: caisse ? toNum(caisse.solde) : 0,
      },
      paiementsDifferes: {
        nb: Number(differes?.nb ?? 0),
        montantTotal: toNum(differes?.total),
      },
      nbCollectes: Number(collectesTotal?.nb ?? 0),
    };
  }));

  return result;
}

export async function getDetailCaisse(agentId: number, cooperativeId: number) {
  const caisse = await getOrCreateCaisse(agentId, cooperativeId);
  const [agent] = await db
    .select({ nom: usersTable.nom, prenoms: usersTable.prenoms, section: usersTable.section })
    .from(usersTable)
    .where(eq(usersTable.id, agentId));

  const mouvements = await db
    .select()
    .from(mouvementsCaisseDelegueTable)
    .where(eq(mouvementsCaisseDelegueTable.caisseDelegueId, caisse.id))
    .orderBy(desc(mouvementsCaisseDelegueTable.createdAt))
    .limit(50);

  const differes = await getPaiementsDifferes(agentId, cooperativeId);

  return {
    agent: { id: agentId, nom: agent?.nom, prenoms: agent?.prenoms, section: agent?.section ?? null },
    caisse: { id: caisse.id, solde: toNum(caisse.solde), plafond: caisse.plafond ? toNum(caisse.plafond) : null },
    mouvements: mouvements.map((m) => ({
      id: m.id,
      type: m.type,
      montantFcfa: toNum(m.montantFcfa),
      soldeApresFcfa: toNum(m.soldeApresFcfa),
      note: m.note,
      livraisonId: m.livraisonId,
      createdAt: m.createdAt,
    })),
    paiementsDifferes: differes,
  };
}

export async function getPaiementsDifferesCooperative(cooperativeId: number) {
  const rows = await db
    .select({
      livraisonId: livraisonsTable.id,
      dateLivraison: livraisonsTable.dateLivraison,
      montantRestant: livraisonsTable.montantRestant,
      agentId: livraisonsTable.agentId,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      agentNom: usersTable.nom,
      agentPrenoms: usersTable.prenoms,
      agentSection: usersTable.section,
    })
    .from(livraisonsTable)
    .innerJoin(membresTable, eq(membresTable.id, livraisonsTable.membreId))
    .leftJoin(usersTable, eq(usersTable.id, livraisonsTable.agentId))
    .where(and(
      eq(membresTable.cooperativeId, cooperativeId),
      eq(livraisonsTable.statutPaiement, "DIFFÉRÉ"),
    ))
    .orderBy(desc(livraisonsTable.dateLivraison))
    .limit(200);

  return rows.map((r) => ({
    livraisonId: r.livraisonId,
    dateLivraison: r.dateLivraison,
    montantRestant: toNum(r.montantRestant),
    membreNom: `${r.membreNom} ${r.membrePrenoms}`,
    agentNom: r.agentNom ? `${r.agentNom} ${r.agentPrenoms}` : "—",
    agentSection: r.agentSection ?? "—",
  }));
}

// ─── Alimentation depuis caisse principale ────────────────────────────────────

export async function alimenterDepuisCaissePrincipale(
  agentId: number,
  coopId: number,
  montantFcfa: number,
  caisseSourceId: number,
  motif: string,
  adminId: number,
): Promise<{ solde: number; soldeSource: number }> {
  if (montantFcfa <= 0) throw new Error("Le montant doit être positif");

  // 1. Vérifier solde de la caisse source
  const [source] = await db.select()
    .from(caissesTable)
    .where(and(eq(caissesTable.id, caisseSourceId), eq(caissesTable.cooperativeId, coopId)))
    .limit(1);
  if (!source) throw new Error("Caisse source introuvable");

  const soldeSource = toNum(source.soldeActuelFcfa);
  if (soldeSource < montantFcfa) {
    throw new Error(`Solde insuffisant en caisse principale. Disponible : ${soldeSource.toLocaleString("fr-FR")} FCFA`);
  }

  // 2. Informations du délégué
  const [agent] = await db
    .select({ nom: usersTable.nom, prenoms: usersTable.prenoms, telephone: usersTable.telephone, section: usersTable.section })
    .from(usersTable).where(eq(usersTable.id, agentId)).limit(1);
  if (!agent) throw new Error("Délégué introuvable");
  const nomDelegue = `${agent.nom} ${agent.prenoms ?? ""}`.trim();

  // 3. Caisse du délégué
  const caisse = await getOrCreateCaisse(agentId, coopId);
  const ancienSolde = toNum(caisse.solde);
  const nouveauSolde = ancienSolde + montantFcfa;
  const nouveauSoldeSource = soldeSource - montantFcfa;

  // 4. Débiter la caisse principale
  await db.update(caissesTable)
    .set({ soldeActuelFcfa: String(nouveauSoldeSource) })
    .where(eq(caissesTable.id, caisseSourceId));

  // Enregistrer mouvement sur caisse principale si session ouverte
  const sessionResult = await db.execute<{ id: number }>(sql`
    SELECT id FROM sessions_caisse
    WHERE caisse_id = ${caisseSourceId} AND date_session = CURRENT_DATE AND statut = 'ouverte'
    LIMIT 1
  `);
  const sessionId = sessionResult.rows[0]?.id;

  if (sessionId) {
    await db.insert(mouvementsCaisseTable).values({
      caisseId: caisseSourceId,
      sessionId,
      cooperativeId: coopId,
      type: "sortie",
      motif: "alimentation_delegue",
      montantFcfa: String(montantFcfa),
      libelle: `Alimentation caisse délégué ${nomDelegue}`,
      soldeApresFcfa: String(nouveauSoldeSource),
      enregistrePar: adminId,
    });
  }

  // 5. Créditer la caisse déléguée
  await db.update(caissesDeleguesTable)
    .set({ solde: String(nouveauSolde), updatedAt: new Date() })
    .where(eq(caissesDeleguesTable.id, caisse.id));

  await db.insert(mouvementsCaisseDelegueTable).values({
    caisseDelegueId: caisse.id,
    type: "approvisionnement",
    montantFcfa: String(montantFcfa),
    soldeApresFcfa: String(nouveauSolde),
    note: motif || `Alimentation depuis caisse principale`,
    createdById: adminId,
  });

  // 6. Enregistrer l'alimentation
  await db.insert(alimentationsCaisseDelegueTable).values({
    cooperativeId: coopId,
    caisseDelegueId: caisse.id,
    caisseSourceId,
    montantFcfa: String(montantFcfa),
    motif,
    statut: "confirme",
    envoyePar: adminId,
    dateEnvoi: new Date(),
  });

  // 7. Notification délégué (alimentation caisse)
  void creerNotification(coopId, [agentId], {
    type:         "caisse_delegue",
    titre:        "Caisse alimentée",
    message:      `Votre caisse a été alimentée de ${montantFcfa.toLocaleString("fr-FR")} FCFA. Nouveau solde : ${nouveauSolde.toLocaleString("fr-FR")} FCFA.`,
    lien:         "/caisse",
    lienLibelle:  "Voir ma caisse",
    gravite:      "info",
    sourceModule: "delegues",
  });

  logger.info({ agentId, montantFcfa, caisseSourceId, nouveauSolde }, "Caisse déléguée alimentée");
  return { solde: nouveauSolde, soldeSource: nouveauSoldeSource };
}

// ─── Clôture journée ──────────────────────────────────────────────────────────

export async function cloturerJournee(
  agentId: number,
  coopId: number,
  soldeReel: number,
  adminId: number,
  observations?: string,
): Promise<{
  soldeTheorique: number;
  soldeReel: number;
  ecart: number;
  montantRecu: number;
  montantPaye: number;
}> {
  const caisse = await getOrCreateCaisse(agentId, coopId);
  const [agent] = await db
    .select({ nom: usersTable.nom, prenoms: usersTable.prenoms, telephone: usersTable.telephone, section: usersTable.section })
    .from(usersTable).where(eq(usersTable.id, agentId)).limit(1);

  const today = new Date().toISOString().slice(0, 10);

  // Calculer totaux du jour depuis mouvements caisse déléguée
  const statsResult = await db.execute<{ type: string; total: string }>(sql`
    SELECT type, SUM(ABS(montant_fcfa)) as total
    FROM mouvements_caisse_delegue
    WHERE caisse_delegue_id = ${caisse.id}
      AND DATE(created_at AT TIME ZONE 'UTC') = ${today}
    GROUP BY type
  `);

  let montantRecu = 0;
  let montantPaye = 0;
  for (const r of statsResult.rows) {
    if (r.type === "approvisionnement") montantRecu += toNum(r.total);
    else montantPaye += toNum(r.total);
  }

  const soldeTheorique = toNum(caisse.solde);
  const ecart = soldeReel - soldeTheorique;

  // Notification direction si écart significatif (> 500 FCFA)
  if (Math.abs(ecart) > 500) {
    const dateStr = new Date().toLocaleDateString("fr-FR");
    void notifierParRole(coopId, ["directeur", "pca"], {
      type:         "caisse_delegue",
      titre:        `Écart de caisse — ${agent?.nom ?? ""} (${dateStr})`,
      message:      `Reçu : ${montantRecu.toLocaleString("fr-FR")} FCFA. Payé : ${montantPaye.toLocaleString("fr-FR")} FCFA. Solde théorique : ${soldeTheorique.toLocaleString("fr-FR")} FCFA. Réel : ${soldeReel.toLocaleString("fr-FR")} FCFA. Écart : ${ecart > 0 ? "+" : ""}${ecart.toLocaleString("fr-FR")} FCFA. Zone : ${agent?.section ?? "—"}`,
      lien:         "/delegues/alertes",
      lienLibelle:  "Voir les alertes",
      gravite:      Math.abs(ecart) > 5000 ? "critique" : "attention",
      sourceModule: "delegues",
    });
  }

  logger.info({ agentId, soldeTheorique, soldeReel, ecart }, "Clôture journée délégué");

  return {
    soldeTheorique,
    soldeReel,
    ecart,
    montantRecu,
    montantPaye,
  };
}

// ─── Alertes caisses déléguées ────────────────────────────────────────────────

export async function getAlertesCaissesDelegues(coopId: number) {
  const agents = await listDelegues(coopId);
  return agents.filter((a) => a.caisse.solde === 0 || a.paiementsDifferes.nb > 0);
}
