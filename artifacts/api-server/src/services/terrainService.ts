import { db } from "@workspace/db";
import {
  usersTable, membresTable, avancesTable, livraisonsTable, paiementsTable,
  distributionsIntrantsTable, historiquePrixTable, campagnesTable,
} from "@workspace/db";
import { and, eq, sql, desc } from "drizzle-orm";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { logger } from "../lib/logger.js";

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

function formatFcfa(n: number): string {
  return n.toLocaleString("fr-FR") + " FCFA";
}

// ─── Auth terrain ──────────────────────────────────────────────────────────

export async function loginTerrain(telephone: string, motDePasse: string) {
  const secret = process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET non configuré");

  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.telephone, telephone), eq(usersTable.actif, true)))
    .limit(1);

  if (!user || user.role !== "agent_terrain") return null;

  const ok = await bcrypt.compare(motDePasse, user.passwordHash);
  if (!ok) return null;

  const payload = {
    id: user.id,
    role: user.role,
    cooperativeId: user.cooperativeId ?? null,
    section: user.section ?? null,
  };
  const token = jwt.sign(payload, secret, { expiresIn: "24h" });

  return {
    token,
    agent: {
      id: user.id,
      nom: user.nom,
      prenoms: user.prenoms,
      email: user.email,
      telephone: user.telephone,
      role: user.role,
      cooperativeId: user.cooperativeId ?? null,
      section: user.section ?? null,
    },
  };
}

// ─── Profil + stats ────────────────────────────────────────────────────────

export async function getProfilAgent(agentId: number, cooperativeId: number) {
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, agentId));

  const bilan = await getBilanJour(agentId, cooperativeId);
  const prix = await getPrixActuel(cooperativeId);

  return {
    id: user.id,
    nom: user.nom,
    prenoms: user.prenoms,
    email: user.email,
    telephone: user.telephone,
    role: user.role,
    cooperativeId: user.cooperativeId,
    section: user.section ?? null,
    statsJour: bilan,
    prixActuel: prix,
  };
}

// ─── Prix actuel ──────────────────────────────────────────────────────────

export async function getPrixActuel(cooperativeId: number) {
  const [campagneActive] = await db
    .select({ id: campagnesTable.id })
    .from(campagnesTable)
    .where(and(
      eq(campagnesTable.cooperativeId, cooperativeId),
      eq(campagnesTable.statut, "ouverte"),
    ))
    .limit(1);

  const campagneId = campagneActive?.id ?? null;
  if (!campagneId) throw new Error("Aucune campagne active. Impossible d'enregistrer une collecte.");

  const baseWhere = campagneId
    ? and(
        eq(historiquePrixTable.cooperativeId, cooperativeId),
        eq(historiquePrixTable.campagneId, campagneId),
      )
    : eq(historiquePrixTable.cooperativeId, cooperativeId);

  const [prixRow] = await db
    .select({ prixBordChampFcfa: historiquePrixTable.prixBordChampFcfa })
    .from(historiquePrixTable)
    .where(baseWhere)
    .orderBy(desc(historiquePrixTable.createdAt))
    .limit(1);

  return {
    prixBordChampFcfa: prixRow ? toNum(prixRow.prixBordChampFcfa) : 1000,
    campagneId,
  };
}

// ─── Fournisseurs ─────────────────────────────────────────────────────────

export async function getFournisseurs(cooperativeId: number, section?: string, search?: string) {
  const membres = await db
    .select()
    .from(membresTable)
    .where(eq(membresTable.cooperativeId, cooperativeId))
    .orderBy(membresTable.nom)
    .limit(300);

  let filtered = section
    ? membres.filter((m) => m.section === section)
    : membres;

  if (search) {
    const s = search.toLowerCase();
    filtered = filtered.filter((m) =>
      m.nom.toLowerCase().includes(s) ||
      m.prenoms.toLowerCase().includes(s) ||
      m.telephone.includes(s)
    );
  }

  const result = await Promise.all(
    filtered.slice(0, 50).map(async (m) => {
      const [avance] = await db
        .select({ solde: avancesTable.soldeRestantFcfa })
        .from(avancesTable)
        .where(and(eq(avancesTable.membreId, m.id), eq(avancesTable.statut, "en_cours")))
        .orderBy(desc(avancesTable.createdAt))
        .limit(1);

      const [lastLiv] = await db
        .select({ date: livraisonsTable.dateLivraison })
        .from(livraisonsTable)
        .where(eq(livraisonsTable.membreId, m.id))
        .orderBy(desc(livraisonsTable.dateLivraison))
        .limit(1);

      const [intrantsDus] = await db
        .select({
          total: sql<string>`COALESCE(SUM(${distributionsIntrantsTable.montantMembreFcfa} - ${distributionsIntrantsTable.montantRembourse_fcfa}), 0)`,
        })
        .from(distributionsIntrantsTable)
        .where(eq(distributionsIntrantsTable.membreId, m.id));

      return {
        id: m.id,
        code: `M-${String(m.id).padStart(4, "0")}`,
        nom: m.nom,
        prenoms: m.prenoms,
        telephone: m.telephone,
        section: m.section ?? null,
        village: m.village ?? null,
        typeMembre: (m.typeFournisseur ?? "membre") as string,
        avanceEnCours: avance ? toNum(avance.solde) : 0,
        intrantsDus: toNum(intrantsDus?.total),
        derniereLivraison: lastLiv?.date ?? null,
      };
    })
  );

  return result;
}

// ─── Recap fournisseur ────────────────────────────────────────────────────

export async function getFournisseurRecap(membreId: number, cooperativeId: number) {
  const [membre] = await db
    .select()
    .from(membresTable)
    .where(and(eq(membresTable.id, membreId), eq(membresTable.cooperativeId, cooperativeId)));

  if (!membre) return null;

  const [avance] = await db
    .select()
    .from(avancesTable)
    .where(and(eq(avancesTable.membreId, membreId), eq(avancesTable.statut, "en_cours")))
    .orderBy(desc(avancesTable.createdAt))
    .limit(1);

  const [lastLiv] = await db
    .select({ date: livraisonsTable.dateLivraison })
    .from(livraisonsTable)
    .where(eq(livraisonsTable.membreId, membreId))
    .orderBy(desc(livraisonsTable.dateLivraison))
    .limit(1);

  const [intrantsDus] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${distributionsIntrantsTable.montantMembreFcfa} - ${distributionsIntrantsTable.montantRembourse_fcfa}), 0)`,
    })
    .from(distributionsIntrantsTable)
    .where(eq(distributionsIntrantsTable.membreId, membreId));

  const nbJours = lastLiv?.date
    ? Math.floor((Date.now() - new Date(lastLiv.date).getTime()) / (24 * 3600 * 1000))
    : null;

  return {
    id: membre.id,
    code: `M-${String(membre.id).padStart(4, "0")}`,
    nom: membre.nom,
    prenoms: membre.prenoms,
    telephone: membre.telephone,
    section: membre.section ?? null,
    village: membre.village ?? null,
    typeMembre: membre.typeFournisseur ?? "membre",
    avanceEnCours: avance ? toNum(avance.soldeRestantFcfa) : 0,
    avanceId: avance?.id ?? null,
    intrantsDus: toNum(intrantsDus?.total),
    derniereLivraison: lastLiv?.date ?? null,
    nbJoursDepuisLivraison: nbJours,
  };
}

// ─── Enregistrer collecte ─────────────────────────────────────────────────

export async function enregistrerCollecte(
  agentId: number,
  cooperativeId: number,
  data: {
    membreId: number;
    nombreSacs: number;
    poidsBrutKg: number;
    retenueKg: number;
    modePaiement: string;
  }
) {
  const prix = await getPrixActuel(cooperativeId);
  const prixUnitaire = prix.prixBordChampFcfa;

  const poidsNet = Math.max(0, data.poidsBrutKg - data.retenueKg);
  const montantBrut = Math.round(poidsNet * prixUnitaire);

  // Avance en cours
  const [avance] = await db
    .select()
    .from(avancesTable)
    .where(and(eq(avancesTable.membreId, data.membreId), eq(avancesTable.statut, "en_cours")))
    .orderBy(desc(avancesTable.createdAt))
    .limit(1);

  const avanceDeduite = avance ? Math.min(avance.soldeRestantFcfa, montantBrut) : 0;

  // Intrants dus
  const [intrantsDus] = await db
    .select({
      total: sql<string>`COALESCE(SUM(${distributionsIntrantsTable.montantMembreFcfa} - ${distributionsIntrantsTable.montantRembourse_fcfa}), 0)`,
    })
    .from(distributionsIntrantsTable)
    .where(eq(distributionsIntrantsTable.membreId, data.membreId));
  const intrantsDed = Math.max(0, Math.min(toNum(intrantsDus?.total), montantBrut - avanceDeduite));

  const montantNet = montantBrut - avanceDeduite - intrantsDed;

  const today = new Date().toISOString().slice(0, 10);

  const [livraison] = await db.insert(livraisonsTable).values({
    membreId: data.membreId,
    campagneId: prix.campagneId ?? undefined,
    nombreSacs: data.nombreSacs,
    produitBrutKg: String(data.poidsBrutKg),
    retenueKg: String(data.retenueKg),
    poidsNetKg: String(poidsNet),
    poidsKg: String(poidsNet),
    prixUnitaireFcfa: prixUnitaire,
    montantBrutFcfa: montantBrut,
    avanceDeduiteFcfa: avanceDeduite,
    intrantsDeduitsFcfa: intrantsDed,
    montantNetFcfa: montantNet,
    dateLivraison: today,
    agentId,
  }).returning();

  if (!livraison) throw new Error("Erreur lors de l'enregistrement de la collecte");

  // Déduire avance
  if (avance && avanceDeduite > 0) {
    const nouveauSolde = avance.soldeRestantFcfa - avanceDeduite;
    const nouveauRembourse = (avance.montantRembourse_fcfa ?? 0) + avanceDeduite;
    await db.update(avancesTable)
      .set({
        montantRembourse_fcfa: nouveauRembourse,
        soldeRestantFcfa: nouveauSolde,
        statut: nouveauSolde <= 0 ? "rembourse" : "en_cours",
      })
      .where(eq(avancesTable.id, avance.id));
  }

  // Créer le paiement
  await db.insert(paiementsTable).values({
    livraisonId: livraison.id,
    membreId: data.membreId,
    campagneId: prix.campagneId ?? undefined,
    montantFcfa: montantNet,
    modePaiement: data.modePaiement as "orange_money" | "mtn_momo" | "especes",
    statut: "confirme",
  });

  const [membre] = await db
    .select({ nom: membresTable.nom, prenoms: membresTable.prenoms })
    .from(membresTable)
    .where(eq(membresTable.id, data.membreId));

  return {
    livraisonId: livraison.id,
    ref: `LIV-${new Date().getFullYear()}-${String(livraison.id).padStart(4, "0")}`,
    membreNom: membre ? `${membre.nom} ${membre.prenoms}` : "",
    poidsNetKg: poidsNet,
    montantBrutFcfa: montantBrut,
    avanceDeduiteFcfa: avanceDeduite,
    intrantsDeduitsFcfa: intrantsDed,
    montantNetFcfa: montantNet,
    modePaiement: data.modePaiement,
    prixUnitaireFcfa: prixUnitaire,
  };
}

// ─── Enregistrer paiement ─────────────────────────────────────────────────

export async function enregistrerPaiement(
  agentId: number,
  cooperativeId: number,
  data: { membreId: number; livraisonId: number; modePaiement: string }
) {
  const [livraison] = await db
    .select()
    .from(livraisonsTable)
    .where(and(eq(livraisonsTable.id, data.livraisonId), eq(livraisonsTable.membreId, data.membreId)));

  if (!livraison) throw new Error("Livraison introuvable");

  const [paiement] = await db.insert(paiementsTable).values({
    livraisonId: data.livraisonId,
    membreId: data.membreId,
    campagneId: livraison.campagneId ?? undefined,
    montantFcfa: livraison.montantNetFcfa,
    modePaiement: data.modePaiement as "orange_money" | "mtn_momo" | "especes",
    statut: "confirme",
  }).returning();

  return {
    paiementId: paiement?.id ?? 0,
    ref: `PAI-${new Date().getFullYear()}-${String(paiement?.id ?? 0).padStart(4, "0")}`,
  };
}

// ─── Octroyer avance ──────────────────────────────────────────────────────

export async function octroierAvance(
  agentId: number,
  cooperativeId: number,
  data: { membreId: number; montantFcfa: number; motif: string }
) {
  const [existing] = await db
    .select()
    .from(avancesTable)
    .where(and(eq(avancesTable.membreId, data.membreId), eq(avancesTable.statut, "en_cours")))
    .limit(1);

  if (existing) {
    throw new Error(`Ce membre a déjà une avance en cours de ${formatFcfa(existing.soldeRestantFcfa)}`);
  }

  const [avance] = await db.insert(avancesTable).values({
    membreId: data.membreId,
    montantOctroyeFcfa: data.montantFcfa,
    soldeRestantFcfa: data.montantFcfa,
    motif: data.motif,
    statut: "en_cours",
    dateOctroi: new Date().toISOString().slice(0, 10),
  }).returning();

  return { avanceId: avance?.id ?? 0 };
}

// ─── Bilan journée ────────────────────────────────────────────────────────

export async function getBilanJour(agentId: number, cooperativeId: number) {
  const todayStr = new Date().toISOString().slice(0, 10);

  const [collectesStats] = await db
    .select({
      nb: sql<number>`COUNT(*)`,
      tonnage: sql<string>`COALESCE(SUM(${livraisonsTable.poidsKg}), 0)`,
      valeur: sql<string>`COALESCE(SUM(${livraisonsTable.montantBrutFcfa}), 0)`,
    })
    .from(livraisonsTable)
    .where(and(
      eq(livraisonsTable.agentId, agentId),
      eq(livraisonsTable.dateLivraison, todayStr),
    ));

  const [paiementsStats] = await db
    .select({
      nb: sql<number>`COUNT(*)`,
      total: sql<string>`COALESCE(SUM(${paiementsTable.montantFcfa}), 0)`,
    })
    .from(paiementsTable)
    .innerJoin(membresTable, eq(membresTable.id, paiementsTable.membreId))
    .where(and(
      eq(membresTable.cooperativeId, cooperativeId),
      sql`DATE(${paiementsTable.createdAt}) = ${todayStr}::date`,
    ));

  const [avancesStats] = await db
    .select({
      nb: sql<number>`COUNT(*)`,
      total: sql<string>`COALESCE(SUM(${avancesTable.montantOctroyeFcfa}), 0)`,
    })
    .from(avancesTable)
    .innerJoin(membresTable, eq(membresTable.id, avancesTable.membreId))
    .where(and(
      eq(membresTable.cooperativeId, cooperativeId),
      sql`DATE(${avancesTable.createdAt}) = ${todayStr}::date`,
    ));

  const recentesLivraisons = await db
    .select({
      id: livraisonsTable.id,
      membreId: livraisonsTable.membreId,
      poidsKg: livraisonsTable.poidsKg,
      createdAt: livraisonsTable.createdAt,
    })
    .from(livraisonsTable)
    .where(and(
      eq(livraisonsTable.agentId, agentId),
      eq(livraisonsTable.dateLivraison, todayStr),
    ))
    .orderBy(desc(livraisonsTable.createdAt))
    .limit(4);

  const recentesPaiements = await db
    .select({
      id: paiementsTable.id,
      membreId: paiementsTable.membreId,
      montantFcfa: paiementsTable.montantFcfa,
      createdAt: paiementsTable.createdAt,
    })
    .from(paiementsTable)
    .innerJoin(membresTable, eq(membresTable.id, paiementsTable.membreId))
    .where(and(
      eq(membresTable.cooperativeId, cooperativeId),
      sql`DATE(${paiementsTable.createdAt}) = ${todayStr}::date`,
    ))
    .orderBy(desc(paiementsTable.createdAt))
    .limit(3);

  const membresIds = [
    ...recentesLivraisons.map((l) => l.membreId),
    ...recentesPaiements.map((p) => p.membreId),
  ].filter((id, i, arr) => arr.indexOf(id) === i);

  let noms: Array<{ id: number; nom: string; prenoms: string }> = [];
  if (membresIds.length > 0) {
    noms = await db
      .select({ id: membresTable.id, nom: membresTable.nom, prenoms: membresTable.prenoms })
      .from(membresTable)
      .where(sql`${membresTable.id} = ANY(${sql.raw(`ARRAY[${membresIds.join(",")}]::int[]`)})`);
  }

  const nomMap = new Map(noms.map((n) => [n.id, `${n.nom} ${n.prenoms}`]));

  const dernieresOps = [
    ...recentesLivraisons.map((l) => ({
      heure: new Date(l.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      type: "collecte",
      label: `Collecte ${nomMap.get(l.membreId) ?? ""} — ${toNum(l.poidsKg)} kg`,
      montant: 0,
    })),
    ...recentesPaiements.map((p) => ({
      heure: new Date(p.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      type: "paiement",
      label: `Paiement ${nomMap.get(p.membreId) ?? ""} — ${formatFcfa(p.montantFcfa)}`,
      montant: p.montantFcfa,
    })),
  ].sort((a, b) => b.heure.localeCompare(a.heure)).slice(0, 8);

  return {
    collectes: {
      nb: Number(collectesStats?.nb ?? 0),
      tonnage: toNum(collectesStats?.tonnage),
      valeur: toNum(collectesStats?.valeur),
    },
    paiements: {
      nb: Number(paiementsStats?.nb ?? 0),
      total: toNum(paiementsStats?.total),
    },
    avances: {
      nb: Number(avancesStats?.nb ?? 0),
      total: toNum(avancesStats?.total),
    },
    dernieresOps,
  };
}

// ─── Sync opérations hors ligne ──────────────────────────────────────────

export async function syncOperations(
  agentId: number,
  cooperativeId: number,
  operations: Array<{
    localId: string;
    type: "collecte" | "paiement" | "avance";
    data: Record<string, unknown>;
    timestamp: number;
  }>
) {
  const sorted = [...operations].sort((a, b) => a.timestamp - b.timestamp);
  const succes: string[] = [];
  const echecs: Array<{ localId: string; erreur: string }> = [];

  for (const op of sorted) {
    try {
      if (op.type === "collecte") {
        await enregistrerCollecte(agentId, cooperativeId, op.data as Parameters<typeof enregistrerCollecte>[2]);
      } else if (op.type === "paiement") {
        await enregistrerPaiement(agentId, cooperativeId, op.data as Parameters<typeof enregistrerPaiement>[2]);
      } else if (op.type === "avance") {
        await octroierAvance(agentId, cooperativeId, op.data as Parameters<typeof octroierAvance>[2]);
      }
      succes.push(op.localId);
    } catch (err) {
      echecs.push({ localId: op.localId, erreur: (err as Error).message });
      logger.warn({ op, err }, "Erreur sync opération terrain");
    }
  }

  return { succes, echecs };
}

// ─── Rapport journalier ──────────────────────────────────────────────────

export async function envoyerRapportJournalier(agentId: number, cooperativeId: number) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, agentId));
  const bilan = await getBilanJour(agentId, cooperativeId);
  const today = new Date().toLocaleDateString("fr-FR");

  const rapport = `Rapport ${user.nom} ${user.prenoms} — ${today}
Section : ${user.section ?? "N/A"}
Collectes : ${bilan.collectes.nb} (${(bilan.collectes.tonnage / 1000).toFixed(1)} T)
Paiements : ${bilan.paiements.nb} (${formatFcfa(bilan.paiements.total)})
Avances : ${bilan.avances.nb} (${formatFcfa(bilan.avances.total)})`;

  logger.info({ agentId, rapport }, "Rapport journalier terrain");

  return { message: rapport };
}
