import { db } from "@workspace/db";
import {
  usersTable, membresTable, fournisseursTable, avancesTable, livraisonsTable, paiementsTable,
  distributionsIntrantsTable, historiquePrixTable, campagnesTable,
  caissesTable, mouvementsCaisseTable, sessionsPeseeTable,
  cooperativesTable,
} from "@workspace/db";
import { and, eq, sql, desc, or, isNull } from "drizzle-orm";
import { creerCommissionSiTaux } from "./commissionService.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { logger } from "../lib/logger.js";
import { envoyerPushGroupePortail } from "./pushService.js";
import { entrerStockSiDelegue } from "./entrepotDelegueService.js";

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

  const tel = telephone.trim().replace(/\s+/g, "");
  const [user] = await db
    .select()
    .from(usersTable)
    .where(and(eq(usersTable.telephone, tel), eq(usersTable.actif, true)))
    .limit(1);

  const rolesAutorisés = ["delegue", "agent_terrain", "peseur", "chauffeur"];
  if (!user || !rolesAutorisés.includes(user.role as string)) return null;

  const ok = await bcrypt.compare(motDePasse, user.passwordHash);
  if (!ok) return null;

  // Récupérer le paramètre machine_pesee_obligatoire depuis la coopérative
  let machinePeseeObligatoire = false;
  if (user.cooperativeId) {
    const [coop] = await db
      .select({ machinePeseeObligatoire: cooperativesTable.machinePeseeObligatoire })
      .from(cooperativesTable)
      .where(eq(cooperativesTable.id, user.cooperativeId))
      .limit(1);
    machinePeseeObligatoire = coop?.machinePeseeObligatoire ?? false;
  }

  const payload = {
    id: user.id,
    role: user.role,
    cooperativeId: user.cooperativeId ?? null,
    section: user.section ?? null,
    zoneType: user.zoneType ?? null,
    zoneNom: user.zoneNom ?? null,
    ...(user.role === "peseur"   ? { delegueId:   user.delegueId   ?? null } : {}),
    ...(user.role === "chauffeur" ? { chauffeurId: (user as typeof user & { chauffeurId?: number | null }).chauffeurId ?? null } : {}),
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
      zoneType: user.zoneType ?? null,
      zoneNom: user.zoneNom ?? null,
      motDePasseTemporaire: user.motDePasseTemporaire,
      machinePeseeObligatoire,
      ...(user.role === "peseur"   ? { delegueId:   user.delegueId   ?? null } : {}),
      ...(user.role === "chauffeur" ? { chauffeurId: (user as typeof user & { chauffeurId?: number | null }).chauffeurId ?? null } : {}),
    },
  };
}

export async function changerMotDePasse(agentId: number, nouveauMotDePasse: string) {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, agentId)).limit(1);
  if (!user) throw new Error("Agent introuvable");

  if (nouveauMotDePasse.length < 6) throw new Error("Le nouveau mot de passe doit contenir au moins 6 caractères");

  const hash = await bcrypt.hash(nouveauMotDePasse, 12);
  await db.update(usersTable)
    .set({ passwordHash: hash, motDePasseTemporaire: false })
    .where(eq(usersTable.id, agentId));
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

  // Cherche d'abord un prix lié à la campagne active, sinon prend le plus récent de la coopérative
  const [prixCampagne] = await db
    .select({ prixBordChampFcfa: historiquePrixTable.prixBordChampFcfa })
    .from(historiquePrixTable)
    .where(and(
      eq(historiquePrixTable.cooperativeId, cooperativeId),
      eq(historiquePrixTable.campagneId, campagneId),
    ))
    .orderBy(desc(historiquePrixTable.createdAt))
    .limit(1);

  const [prixRecent] = prixCampagne
    ? [prixCampagne]
    : await db
        .select({ prixBordChampFcfa: historiquePrixTable.prixBordChampFcfa })
        .from(historiquePrixTable)
        .where(eq(historiquePrixTable.cooperativeId, cooperativeId))
        .orderBy(desc(historiquePrixTable.createdAt))
        .limit(1);

  return {
    prixBordChampFcfa: prixRecent ? toNum(prixRecent.prixBordChampFcfa) : 1000,
    campagneId,
  };
}

// ─── Fournisseurs ─────────────────────────────────────────────────────────

export async function getFournisseurs(
  cooperativeId: number,
  section?: string,
  search?: string,
  /** Périmètre peseur :
   *  - number → membres rattachés à ce délégué
   *  - null   → membres sans délégué (base centrale)
   *  - undefined → pas de filtre (délégué, agent_terrain)
   */
  peseurScopeDelegueId?: number | null,
  /**
   * ID du délégué pour filtrer les fournisseurs externes par créateur :
   *  - number → externals créés par ce délégué uniquement
   *  - undefined → tous les externals actifs de la coopérative
   */
  delegueId?: number,
) {
  const whereConditions: ReturnType<typeof eq>[] = [eq(membresTable.cooperativeId, cooperativeId)];
  if (peseurScopeDelegueId !== undefined) {
    if (peseurScopeDelegueId === null) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      whereConditions.push(isNull(membresTable.delegueId) as any);
    } else {
      whereConditions.push(eq(membresTable.delegueId, peseurScopeDelegueId));
    }
  }

  const membres = await db
    .select()
    .from(membresTable)
    .where(and(...whereConditions))
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

  const membresResult = await Promise.all(
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
        avanceId: null as number | null,
        intrantsDus: toNum(intrantsDus?.total),
        derniereLivraison: lastLiv?.date ?? null,
        nbJoursDepuisLivraison: null as number | null,
      };
    })
  );

  // ── Fournisseurs externes créés par ce délégué ──────────────────────────
  const extConditions = [
    eq(fournisseursTable.cooperativeId, cooperativeId),
    eq(fournisseursTable.typeFournisseur, "externe"),
    eq(fournisseursTable.actif, true),
  ];
  if (delegueId !== undefined) {
    extConditions.push(eq(fournisseursTable.creeParDelegueId, delegueId) as ReturnType<typeof eq>);
  }

  let externals = await db
    .select()
    .from(fournisseursTable)
    .where(and(...extConditions))
    .orderBy(fournisseursTable.nom);

  if (section) {
    externals = externals.filter((f) => f.section === section);
  }
  if (search) {
    const s = search.toLowerCase();
    externals = externals.filter(
      (f) =>
        f.nom.toLowerCase().includes(s) ||
        (f.prenoms ?? "").toLowerCase().includes(s) ||
        (f.telephone ?? "").includes(s) ||
        (f.code ?? "").toLowerCase().includes(s),
    );
  }

  const externalsResult = externals.slice(0, 50).map((f) => ({
    id: f.id,
    code: f.code ?? `EXT-${String(f.id).padStart(4, "0")}`,
    nom: f.nom,
    prenoms: f.prenoms ?? "",
    telephone: f.telephone ?? "",
    section: f.section ?? null,
    village: null as string | null,
    typeMembre: "externe",
    avanceEnCours: 0,
    avanceId: null as number | null,
    intrantsDus: 0,
    derniereLivraison: null as string | null,
    nbJoursDepuisLivraison: null as number | null,
  }));

  // Membres en premier, puis externaux — les deux triés par nom
  return [...membresResult, ...externalsResult].sort((a, b) =>
    a.nom.localeCompare(b.nom, "fr"),
  );
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
    /** Membre inscrit à la coopérative (exclusif avec fournisseurId) */
    membreId?: number;
    /** Fournisseur externe / pisteur (exclusif avec membreId) */
    fournisseurId?: number;
    nombreSacs: number;
    poidsBrutKg: number;
    retenueKg: number;
    /** ID du peseur ayant physiquement enregistré la collecte (traçabilité) */
    peseurId?: number;
  }
) {
  const prix = await getPrixActuel(cooperativeId);
  const prixUnitaire = prix.prixBordChampFcfa;

  const poidsNet = Math.max(0, data.poidsBrutKg - data.retenueKg);
  const montantBrut = Math.round(poidsNet * prixUnitaire);

  // Avance et intrants — uniquement pour les membres (les fournisseurs externes n'en ont pas)
  let avance: typeof avancesTable.$inferSelect | undefined;
  let avanceDeduite = 0;
  let intrantsDed = 0;

  if (data.membreId) {
    const [av] = await db
      .select()
      .from(avancesTable)
      .where(and(eq(avancesTable.membreId, data.membreId), eq(avancesTable.statut, "en_cours")))
      .orderBy(desc(avancesTable.createdAt))
      .limit(1);
    avance = av;
    avanceDeduite = avance ? Math.min(avance.soldeRestantFcfa, montantBrut) : 0;

    const [intrantsDus] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${distributionsIntrantsTable.montantMembreFcfa} - ${distributionsIntrantsTable.montantRembourse_fcfa}), 0)`,
      })
      .from(distributionsIntrantsTable)
      .where(eq(distributionsIntrantsTable.membreId, data.membreId));
    intrantsDed = Math.max(0, Math.min(toNum(intrantsDus?.total), montantBrut - avanceDeduite));
  }

  const montantNet = montantBrut - avanceDeduite - intrantsDed;

  const today = new Date().toISOString().slice(0, 10);

  // Le règlement est toujours différé : le peseur enregistre la collecte,
  // le paiement est confirmé ultérieurement via la page Règlements.
  const statutPaiement = "DIFFÉRÉ" as const;

  const [livraison] = await db.insert(livraisonsTable).values({
    membreId: data.membreId ?? null,
    fournisseurId: data.fournisseurId ?? null,
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
    peseurId: data.peseurId ?? null,
    statutPaiement,
    montantRestant: String(montantNet),
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

  // Créer le paiement en_attente — le mode sera choisi lors du règlement
  await db.insert(paiementsTable).values({
    livraisonId: livraison.id,
    membreId: data.membreId ?? null,
    campagneId: prix.campagneId ?? undefined,
    montantFcfa: montantNet,
    statut: "en_attente",
  });

  // Résolution du nom et push portail (uniquement pour les membres)
  let membreNom = "";
  if (data.membreId) {
    const [membre] = await db
      .select({ nom: membresTable.nom, prenoms: membresTable.prenoms })
      .from(membresTable)
      .where(eq(membresTable.id, data.membreId));
    membreNom = membre ? `${membre.nom} ${membre.prenoms}` : "";

    void envoyerPushGroupePortail([data.membreId], {
      title: "Livraison enregistrée",
      body: `${poidsNet.toLocaleString("fr-FR")} kg — ${montantNet.toLocaleString("fr-FR")} FCFA net`,
      url: "/portail/livraisons",
    });
  } else if (data.fournisseurId) {
    const [fourn] = await db
      .select({ nom: fournisseursTable.nom, prenoms: fournisseursTable.prenoms })
      .from(fournisseursTable)
      .where(eq(fournisseursTable.id, data.fournisseurId));
    membreNom = fourn ? `${fourn.nom} ${fourn.prenoms ?? ""}`.trim() : "";
  }

  // Entrée stock entrepôt délégué — poids BRUT (fire-and-forget — non bloquant)
  void entrerStockSiDelegue(agentId, cooperativeId, data.poidsBrutKg, livraison.id);

  // Commission délégué — uniquement pour les membres (Option A : délégué du membre)
  let commissionFcfa: number | null = null;
  if (data.membreId) {
    const [membreDelegue] = await db
      .select({ delegueId: membresTable.delegueId })
      .from(membresTable)
      .where(eq(membresTable.id, data.membreId))
      .limit(1);
    if (membreDelegue?.delegueId) {
      commissionFcfa = await creerCommissionSiTaux(
        livraison.id,
        membreDelegue.delegueId,
        prix.campagneId ?? null,
        poidsNet,
        cooperativeId
      );
    }
  }

  return {
    livraisonId: livraison.id,
    ref: `LIV-${new Date().getFullYear()}-${String(livraison.id).padStart(4, "0")}`,
    membreNom,
    poidsNetKg: poidsNet,
    montantBrutFcfa: montantBrut,
    avanceDeduiteFcfa: avanceDeduite,
    intrantsDeduitsFcfa: intrantsDed,
    montantNetFcfa: montantNet,
    modePaiement: "en_attente",
    prixUnitaireFcfa: prixUnitaire,
    statutPaiement,
    commissionFcfa,
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
    .leftJoin(sessionsPeseeTable, eq(sessionsPeseeTable.livraisonId, livraisonsTable.id))
    .where(and(
      or(
        eq(livraisonsTable.agentId, agentId),
        eq(livraisonsTable.peseurId, agentId),
        eq(sessionsPeseeTable.peseurId, agentId),
      ),
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
      fromSession: sessionsPeseeTable.id,
    })
    .from(livraisonsTable)
    .leftJoin(sessionsPeseeTable, eq(sessionsPeseeTable.livraisonId, livraisonsTable.id))
    .where(and(
      or(
        eq(livraisonsTable.agentId, agentId),
        eq(livraisonsTable.peseurId, agentId),
        eq(sessionsPeseeTable.peseurId, agentId),
      ),
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
      type: l.fromSession !== null ? "session_collecte" : "collecte",
      label: `${l.fromSession !== null ? "Session groupée" : "Collecte"} ${(l.membreId ? nomMap.get(l.membreId) : null) ?? ""} — ${toNum(l.poidsKg)} kg`,
      montant: 0,
    })),
    ...recentesPaiements.map((p) => ({
      heure: new Date(p.createdAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
      type: "paiement",
      label: `Paiement ${(p.membreId ? nomMap.get(p.membreId) : null) ?? ""} — ${formatFcfa(p.montantFcfa)}`,
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
    type: "collecte" | "paiement" | "avance" | "gps_collecte";
    data: Record<string, unknown>;
    timestamp: number;
  }>,
  /** ID du peseur rattaché à un délégué (traçabilité) */
  peseurId?: number,
) {
  const sorted = [...operations].sort((a, b) => a.timestamp - b.timestamp);
  const succes: string[] = [];
  const echecs: Array<{ localId: string; erreur: string }> = [];

  for (const op of sorted) {
    try {
      if (op.type === "collecte") {
        await enregistrerCollecte(agentId, cooperativeId, { ...(op.data as Parameters<typeof enregistrerCollecte>[2]), peseurId });
      } else if (op.type === "paiement") {
        await enregistrerPaiement(agentId, cooperativeId, op.data as Parameters<typeof enregistrerPaiement>[2]);
      } else if (op.type === "avance") {
        await octroierAvance(agentId, cooperativeId, op.data as Parameters<typeof octroierAvance>[2]);
      } else if (op.type === "gps_collecte") {
        const { collecterParcelleAgent } = await import("./missionsAgentService.js");
        const d = op.data as { missionId: number; membreId: number; polygoneGps: object; photos: string[]; notes?: string; superficieCalculeeHa?: number; probleme?: { type: string; description: string } };
        await collecterParcelleAgent(d.missionId, d.membreId, agentId, {
          polygoneGps: d.polygoneGps,
          photos: d.photos,
          notes: d.notes,
          superficieCalculeeHa: d.superficieCalculeeHa,
          probleme: d.probleme,
        });
      }
      succes.push(op.localId);
    } catch (err) {
      echecs.push({ localId: op.localId, erreur: (err as Error).message });
      logger.warn({ op, err }, "Erreur sync opération terrain");
    }
  }

  return { succes, echecs };
}

// ─── Historique collectes peseur ─────────────────────────────────────────

export async function getPeseurCollectes(agentId: number, cooperativeId: number) {
  const rows = await db
    .select({
      id: livraisonsTable.id,
      dateLivraison: livraisonsTable.dateLivraison,
      poidsKg: livraisonsTable.poidsKg,
      montantNetFcfa: livraisonsTable.montantNetFcfa,
      statutPaiement: livraisonsTable.statutPaiement,
      membreNom: membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      membreCode: membresTable.carteNumero,
      sessionId: sessionsPeseeTable.id,
    })
    .from(livraisonsTable)
    .leftJoin(membresTable, eq(membresTable.id, livraisonsTable.membreId))
    .leftJoin(sessionsPeseeTable, eq(sessionsPeseeTable.livraisonId, livraisonsTable.id))
    .where(
      and(
        // Livraisons enregistrées directement par l'agent OU converties depuis une session pesée par cet agent
        or(
          eq(livraisonsTable.agentId, agentId),
          eq(livraisonsTable.peseurId, agentId),
          eq(sessionsPeseeTable.peseurId, agentId),
        ),
        eq(membresTable.cooperativeId, cooperativeId),
      ),
    )
    .orderBy(desc(livraisonsTable.dateLivraison), desc(livraisonsTable.id))
    .limit(200);

  return rows.map((r) => ({
    id: r.id,
    dateLivraison: r.dateLivraison,
    poidsKg: toNum(r.poidsKg),
    montantNetFcfa: r.montantNetFcfa,
    statutPaiement: r.statutPaiement ?? "PAYÉ",
    membreNom: r.membreNom ?? "—",
    membrePrenoms: r.membrePrenoms ?? "",
    membreCode: r.membreCode ?? "",
    fromSession: r.sessionId !== null,
  }));
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
