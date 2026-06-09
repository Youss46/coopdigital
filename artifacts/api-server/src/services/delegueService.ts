import { db } from "@workspace/db";
import {
  usersTable,
  membresTable,
  livraisonsTable,
  paiementsTable,
  caissesDeleguesTable,
  mouvementsCaisseDelegueTable,
  campagnesTable,
} from "@workspace/db";
import { and, eq, sql, desc } from "drizzle-orm";

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
