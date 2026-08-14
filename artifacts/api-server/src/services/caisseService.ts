import { db, caissesTable, sessionsCaisseTable, mouvementsCaisseTable, comptesMobilesMarchandsTable, mouvementsMobileMarchandTable, comptesBancairesTable, mouvementsBanqueTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import PDFDocument from "pdfkit";
import { proposerEcriture } from "./comptabiliteService.js";
import { drawHeader, drawFooter } from "./pdfHeaderService.js";


// ─── Mapping motif → comptes OHADA ────────────────────────────────────────────
// Entrée caisse : Débit 571 / Crédit [compte]
// Sortie caisse : Débit [compte] / Crédit 571

interface CompteMapping { debit: string; credit: string }

function comptesForMouvement(type: string, motif: string): CompteMapping {
  if (type === "entree") {
    const credits: Record<string, string> = {
      don:            "758",  // Produits divers (dons reçus)
      retrait_banque: "521",  // Banque
      remboursement:  "162",  // Emprunts établissements de crédit
      autre:          "471",  // Créditeurs divers
    };
    return { debit: "571", credit: credits[motif] ?? "471" };
  }
  // sortie
  const debits: Record<string, string> = {
    paiement_producteur:  "401",   // Fournisseurs
    avance:               "4091",  // Fournisseurs, avances et acomptes versés
    achat_intrants:       "604",   // Achats stockés de matières et fournitures
    frais_fonctionnement: "638",   // Autres charges externes
    depot_banque:         "521",   // Banque
    remboursement:        "162",   // Emprunts établissements de crédit
    autre:                "628",   // Frais de télécommunications / divers
  };
  return { debit: debits[motif] ?? "628", credit: "571" };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().slice(0, 10); }

async function getCaisse(id: number) {
  const rows = await db.select().from(caissesTable).where(eq(caissesTable.id, id)).limit(1);
  return rows[0] ?? null;
}

async function getSession(id: number) {
  const rows = await db.select().from(sessionsCaisseTable).where(eq(sessionsCaisseTable.id, id)).limit(1);
  return rows[0] ?? null;
}

async function getCoopNom(cooperativeId: number): Promise<string> {
  const r = await db.execute<{ nom: string }>(sql`SELECT nom FROM cooperatives WHERE id = ${cooperativeId} LIMIT 1`);
  return r.rows[0]?.nom ?? "CoopDigital";
}

// ─── CRUD Caisses ─────────────────────────────────────────────────────────────

export async function listCaisses(cooperativeId: number, responsableId?: number) {
  const result = await db.execute<{
    id: number; nom: string; type_caisse: string;
    responsable_id: number | null; responsable_nom: string | null;
    solde_actuel_fcfa: string; fond_caisse_minimum_fcfa: string; actif: boolean;
    session_id: number | null; session_statut: string | null; heure_ouverture: string | null;
    solde_ouverture_fcfa: string | null;
  }>(sql`
    SELECT
      c.id, c.nom, c.type_caisse, c.responsable_id, c.solde_actuel_fcfa, c.fond_caisse_minimum_fcfa, c.actif,
      u.nom AS responsable_nom,
      s.id  AS session_id, s.statut AS session_statut,
      s.heure_ouverture::text, s.solde_ouverture_fcfa
    FROM caisses c
    LEFT JOIN users u ON u.id = c.responsable_id
    LEFT JOIN sessions_caisse s
      ON s.caisse_id = c.id AND s.date_session = CURRENT_DATE AND s.statut = 'ouverte'
    WHERE c.cooperative_id = ${cooperativeId} AND c.actif = true
      ${responsableId !== undefined ? sql`AND c.responsable_id = ${responsableId}` : sql``}
    ORDER BY c.type_caisse, c.nom
  `);
  return result.rows;
}

export async function creerCaisse(data: {
  nom: string; typeCaisse?: "centrale" | "deleguee"; responsableId?: number;
  soldeinitial?: number; fondMinimum?: number;
}, cooperativeId: number) {
  const typeCaisse = data.typeCaisse ?? (data.responsableId ? "deleguee" : "centrale");
  const [row] = await db.insert(caissesTable).values({
    cooperativeId,
    nom: data.nom,
    typeCaisse,
    responsableId: data.responsableId ?? null,
    soldeActuelFcfa: (data.soldeinitial ?? 0).toString(),
    fondCaisseMinimumFcfa: (data.fondMinimum ?? 0).toString(),
  }).returning();
  return row;
}

export async function updateCaisse(id: number, data: Partial<{
  nom: string; responsableId: number; fondMinimum: number; actif: boolean;
}>, cooperativeId: number) {
  const [row] = await db.update(caissesTable).set({
    ...(data.nom           !== undefined && { nom: data.nom }),
    ...(data.responsableId !== undefined && { responsableId: data.responsableId }),
    ...(data.fondMinimum   !== undefined && { fondCaisseMinimumFcfa: data.fondMinimum.toString() }),
    ...(data.actif         !== undefined && { actif: data.actif }),
  }).where(and(eq(caissesTable.id, id), eq(caissesTable.cooperativeId, cooperativeId))).returning();
  return row ?? null;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getSessionActive(caisseId: number) {
  const result = await db.execute<{
    id: number; caisse_id: number; date_session: string; statut: string;
    solde_ouverture_fcfa: string; ouvert_par: number | null;
    heure_ouverture: string; nb_mouvements: string;
  }>(sql`
    SELECT
      s.*,
      s.date_session::text,
      s.heure_ouverture::text,
      COUNT(m.id) AS nb_mouvements
    FROM sessions_caisse s
    LEFT JOIN mouvements_caisse m ON m.session_id = s.id
    WHERE s.caisse_id = ${caisseId}
      AND s.date_session = CURRENT_DATE
      AND s.statut = 'ouverte'
    GROUP BY s.id
    LIMIT 1
  `);
  return result.rows[0] ?? null;
}

export async function ouvrirSession(caisseId: number, userId: number) {
  // Vérifier pas de session ouverte ce jour
  const existing = await getSessionActive(caisseId);
  if (existing) throw new Error("Une session est déjà ouverte pour cette caisse aujourd'hui");

  const caisse = await getCaisse(caisseId);
  if (!caisse) throw new Error("Caisse introuvable");

  const [session] = await db.insert(sessionsCaisseTable).values({
    caisseId,
    cooperativeId: caisse.cooperativeId,
    dateSession: today(),
    ouvertPar: userId,
    soldeOuvertureFcfa: caisse.soldeActuelFcfa,
    statut: "ouverte",
  }).returning();

  logger.info({ caisseId, sessionId: session?.id }, "Session caisse ouverte");
  return session;
}

// ─── Mouvements ───────────────────────────────────────────────────────────────

export interface MouvementInput {
  type: "entree" | "sortie";
  motif: string;
  montantFcfa: number;
  libelle?: string;
  referenceOperation?: string;
  userId?: number;
}

export async function enregistrerMouvement(
  caisseId: number,
  data: MouvementInput
): Promise<{
  mouvement: typeof mouvementsCaisseTable.$inferSelect;
  alerte?: string;
  soldeActuel: number;
}> {
  // Trouver la session ouverte
  const session = await getSessionActive(caisseId);
  if (!session) throw new Error("Aucune session ouverte pour cette caisse. Ouvrez d'abord une session.");

  const caisse = await getCaisse(caisseId);
  if (!caisse) throw new Error("Caisse introuvable");

  const soldeActuel = parseFloat(caisse.soldeActuelFcfa as string);
  const montant     = Math.round(data.montantFcfa);

  if (data.type === "sortie" && soldeActuel - montant < 0) {
    throw new Error(`Solde insuffisant en caisse. Disponible : ${soldeActuel.toLocaleString("fr-FR")} FCFA`);
  }

  const nouveauSolde = data.type === "entree"
    ? soldeActuel + montant
    : soldeActuel - montant;

  // Insérer le mouvement dans une transaction
  const [mouvement] = await db.insert(mouvementsCaisseTable).values({
    caisseId,
    sessionId: session.id,
    cooperativeId: caisse.cooperativeId,
    type: data.type,
    motif: data.motif,
    montantFcfa: montant.toString(),
    libelle: data.libelle ?? null,
    referenceOperation: data.referenceOperation ?? null,
    soldeApresFcfa: nouveauSolde.toString(),
    enregistrePar: data.userId ?? null,
  }).returning();

  // Mettre à jour le solde de la caisse
  await db.update(caissesTable)
    .set({ soldeActuelFcfa: nouveauSolde.toString() })
    .where(eq(caissesTable.id, caisseId));

  // Écriture comptable
  const comptes = comptesForMouvement(data.type, data.motif);
  proposerEcriture(caisse.cooperativeId, {
    source:      "caisse",
    sourceId:    mouvement?.id ?? undefined,
    libelle:     data.libelle ?? `Caisse — ${data.motif}`,
    compteDebit: comptes.debit,
    compteCredit:comptes.credit,
    montantFcfa: montant,
    date:        today(),
  }).catch((err) => logger.warn({ err }, "Écriture comptable caisse non enregistrée"));

  // Alerte fond minimum
  const fondMin = parseFloat(caisse.fondCaisseMinimumFcfa as string);
  let alerte: string | undefined;
  if (fondMin > 0 && nouveauSolde < fondMin) {
    alerte = `⚠️ Solde caisse sous le fond minimum (${fondMin.toLocaleString("fr-FR")} FCFA)`;
    logger.warn({ caisseId, nouveauSolde, fondMin }, "Caisse sous fond minimum");
  }

  return { mouvement: mouvement!, alerte, soldeActuel: nouveauSolde };
}

// ─── Transfert inter-caisses ──────────────────────────────────────────────────

export async function transfererFonds(
  sourceCaisseId: number,
  destCaisseId: number,
  montant: number,
  libelle: string | undefined,
  userId: number | undefined,
  cooperativeId: number
): Promise<{ sourceNouveauSolde: number; destNouveauSolde: number }> {
  if (sourceCaisseId === destCaisseId) throw new Error("La caisse source et destination doivent être différentes");
  const mt = Math.round(montant);
  if (mt <= 0) throw new Error("Le montant doit être positif");

  // Récupérer les deux caisses et vérifier qu'elles appartiennent à la même coopérative
  const [source, dest] = await Promise.all([getCaisse(sourceCaisseId), getCaisse(destCaisseId)]);
  if (!source) throw new Error("Caisse source introuvable");
  if (!dest)   throw new Error("Caisse destination introuvable");
  if (source.cooperativeId !== cooperativeId || dest.cooperativeId !== cooperativeId) {
    throw new Error("Les caisses doivent appartenir à la même coopérative");
  }

  // Sessions actives requises
  const [sessionSrc, sessionDest] = await Promise.all([
    getSessionActive(sourceCaisseId),
    getSessionActive(destCaisseId),
  ]);
  if (!sessionSrc)  throw new Error(`Aucune session ouverte pour la caisse source "${source.nom}". Ouvrez d'abord une session.`);
  if (!sessionDest) throw new Error(`Aucune session ouverte pour la caisse destination "${dest.nom}". Ouvrez d'abord une session.`);

  // Vérifier le solde source
  const soldeSrc = parseFloat(source.soldeActuelFcfa as string);
  if (soldeSrc - mt < 0) {
    throw new Error(`Solde insuffisant en caisse source. Disponible : ${soldeSrc.toLocaleString("fr-FR")} FCFA`);
  }

  const nouveauSoldeSrc  = soldeSrc - mt;
  const soldeDest        = parseFloat(dest.soldeActuelFcfa as string);
  const nouveauSoldeDest = soldeDest + mt;
  const ref              = `TRF-${Date.now()}`;
  const lib              = libelle || `Transfert vers ${dest.nom}`;
  const libDest          = `Transfert depuis ${source.nom}${libelle ? ` — ${libelle}` : ""}`;
  const dateAujourd      = today();

  // Insérer les deux mouvements + mettre à jour les soldes
  const [mvtSrc, mvtDest] = await Promise.all([
    db.insert(mouvementsCaisseTable).values({
      caisseId: sourceCaisseId, sessionId: sessionSrc.id,
      cooperativeId, type: "sortie", motif: "transfert_interne",
      montantFcfa: mt.toString(), libelle: lib,
      referenceOperation: ref, soldeApresFcfa: nouveauSoldeSrc.toString(),
      enregistrePar: userId ?? null,
    }).returning(),
    db.insert(mouvementsCaisseTable).values({
      caisseId: destCaisseId, sessionId: sessionDest.id,
      cooperativeId, type: "entree", motif: "transfert_interne",
      montantFcfa: mt.toString(), libelle: libDest,
      referenceOperation: ref, soldeApresFcfa: nouveauSoldeDest.toString(),
      enregistrePar: userId ?? null,
    }).returning(),
  ]);

  await Promise.all([
    db.update(caissesTable).set({ soldeActuelFcfa: nouveauSoldeSrc.toString() }).where(eq(caissesTable.id, sourceCaisseId)),
    db.update(caissesTable).set({ soldeActuelFcfa: nouveauSoldeDest.toString() }).where(eq(caissesTable.id, destCaisseId)),
  ]);

  // Écritures comptables OHADA — compte 585 (virements internes de fonds)
  Promise.all([
    proposerEcriture(cooperativeId, {
      source: "caisse", sourceId: mvtSrc[0]?.id ?? undefined,
      libelle: lib, compteDebit: "585", compteCredit: "571",
      montantFcfa: mt, date: dateAujourd,
    }),
    proposerEcriture(cooperativeId, {
      source: "caisse", sourceId: mvtDest[0]?.id ?? undefined,
      libelle: libDest, compteDebit: "571", compteCredit: "585",
      montantFcfa: mt, date: dateAujourd,
    }),
  ]).catch((err) => logger.warn({ err }, "Écritures comptables transfert non enregistrées"));

  logger.info({ ref, sourceCaisseId, destCaisseId, montant: mt }, "Transfert inter-caisses effectué");
  return { sourceNouveauSolde: nouveauSoldeSrc, destNouveauSolde: nouveauSoldeDest };
}

// ─── Fermeture session ────────────────────────────────────────────────────────

export async function fermerSession(
  caisseId: number,
  soldeReel: number,
  userId: number,
  observations?: string
) {
  const session = await getSessionActive(caisseId);
  if (!session) throw new Error("Aucune session ouverte pour cette caisse");

  // Calculer le solde théorique depuis les mouvements
  const mouvResult = await db.execute<{ total_entrees: string; total_sorties: string }>(sql`
    SELECT
      COALESCE(SUM(montant_fcfa) FILTER (WHERE type = 'entree'), 0) AS total_entrees,
      COALESCE(SUM(montant_fcfa) FILTER (WHERE type = 'sortie'), 0) AS total_sorties
    FROM mouvements_caisse
    WHERE session_id = ${session.id}
  `);
  const m = mouvResult.rows[0]!;
  const totalEntrees = parseFloat(m.total_entrees);
  const totalSorties = parseFloat(m.total_sorties);
  const soldeOuverture = parseFloat(session.solde_ouverture_fcfa);
  const soldeTheorique = soldeOuverture + totalEntrees - totalSorties;

  const ecart = soldeReel - soldeTheorique;

  // Fermer la session
  await db.update(sessionsCaisseTable).set({
    statut: "fermee",
    soldeFermetureTheoriqueFcfa: soldeTheorique.toString(),
    soldeFermetureReelFcfa: soldeReel.toString(),
    fermePar: userId,
    heureFermeture: new Date(),
    observations: observations ?? null,
  }).where(eq(sessionsCaisseTable.id, session.id));

  // Mettre à jour solde caisse avec le solde réel
  await db.update(caissesTable)
    .set({ soldeActuelFcfa: soldeReel.toString() })
    .where(eq(caissesTable.id, caisseId));

  // Alerte écart
  if (Math.abs(ecart) > 0) {
    const dateStr = new Date().toLocaleDateString("fr-FR");
    const msg = `Écart caisse ${dateStr} : ${ecart.toLocaleString("fr-FR")} FCFA. Théorique : ${soldeTheorique.toLocaleString("fr-FR")} | Réel : ${soldeReel.toLocaleString("fr-FR")}`;
    logger.warn({ sessionId: session.id, ecart, soldeTheorique, soldeReel }, "Écart caisse à la clôture");
    // Notification directeur (via le système de notification existant si dispo)
  }

  logger.info({ sessionId: session.id, ecart }, "Session caisse fermée");
  return { sessionId: session.id, soldeTheorique, soldeReel, ecart };
}

// ─── Journal de caisse ────────────────────────────────────────────────────────

export async function getJournal(caisseId: number, opts?: { dateDebut?: string; dateFin?: string }) {
  const dateD = opts?.dateDebut ?? today();
  const dateF = opts?.dateFin   ?? today();

  const result = await db.execute<{
    id: number; type: string; motif: string; montant_fcfa: string;
    libelle: string | null; reference_operation: string | null;
    solde_apres_fcfa: string | null; created_at: string;
    enregistre_par_nom: string | null; session_id: number;
    session_statut: string; date_session: string;
  }>(sql`
    SELECT
      m.id, m.type, m.motif, m.montant_fcfa,
      m.libelle, m.reference_operation, m.solde_apres_fcfa,
      m.created_at::text, m.session_id,
      u.nom AS enregistre_par_nom,
      s.statut AS session_statut, s.date_session::text
    FROM mouvements_caisse m
    JOIN sessions_caisse s ON s.id = m.session_id
    LEFT JOIN users u ON u.id = m.enregistre_par
    WHERE m.caisse_id = ${caisseId}
      AND s.date_session BETWEEN ${dateD} AND ${dateF}
    ORDER BY m.created_at
  `);

  const mvts = result.rows;
  const totalEntrees = mvts.filter(m => m.type === "entree").reduce((s, m) => s + parseFloat(m.montant_fcfa), 0);
  const totalSorties = mvts.filter(m => m.type === "sortie").reduce((s, m) => s + parseFloat(m.montant_fcfa), 0);

  return { mouvements: mvts, totalEntrees, totalSorties };
}

// ─── Soldes temps réel ────────────────────────────────────────────────────────

export async function getSoldes(cooperativeId: number) {
  return listCaisses(cooperativeId);
}

// ─── Alertes ──────────────────────────────────────────────────────────────────

export async function getAlertes(cooperativeId: number) {
  const caisses = await listCaisses(cooperativeId);
  return caisses.filter((c) => {
    const solde = parseFloat(c.solde_actuel_fcfa);
    const min   = parseFloat(c.fond_caisse_minimum_fcfa);
    return min > 0 && solde < min;
  });
}

// ─── Historique sessions ──────────────────────────────────────────────────────

export async function listSessions(caisseId: number, opts?: { dateDebut?: string; dateFin?: string }) {
  const result = await db.execute<{
    id: number; date_session: string; statut: string;
    solde_ouverture_fcfa: string; solde_fermeture_theorique_fcfa: string | null;
    solde_fermeture_reel_fcfa: string | null; ecart_fcfa: string | null;
    heure_ouverture: string; heure_fermeture: string | null;
    ouvert_par_nom: string | null; ferme_par_nom: string | null;
    nb_mouvements: string;
  }>(sql`
    SELECT
      s.id, s.date_session::text, s.statut,
      s.solde_ouverture_fcfa, s.solde_fermeture_theorique_fcfa,
      s.solde_fermeture_reel_fcfa, s.ecart_fcfa,
      s.heure_ouverture::text, s.heure_fermeture::text,
      u1.nom AS ouvert_par_nom, u2.nom AS ferme_par_nom,
      COUNT(m.id) AS nb_mouvements
    FROM sessions_caisse s
    LEFT JOIN users u1 ON u1.id = s.ouvert_par
    LEFT JOIN users u2 ON u2.id = s.ferme_par
    LEFT JOIN mouvements_caisse m ON m.session_id = s.id
    WHERE s.caisse_id = ${caisseId}
      ${opts?.dateDebut ? sql`AND s.date_session >= ${opts.dateDebut}` : sql``}
      ${opts?.dateFin   ? sql`AND s.date_session <= ${opts.dateFin}`   : sql``}
    GROUP BY s.id, u1.nom, u2.nom
    ORDER BY s.date_session DESC
  `);
  return result.rows;
}

// ─── Transfert caisse → banque (legacy — sortie caisse sans màj compte) ───────

export async function transfertVersBanque(
  caisseId: number,
  montant: number,
  userId: number,
  libelle?: string
) {
  const result = await enregistrerMouvement(caisseId, {
    type: "sortie",
    motif: "depot_banque",
    montantFcfa: montant,
    libelle: libelle ?? "Dépôt en banque",
    userId,
  });
  return result;
}

// ─── Virement Caisse → Banque (atomique, avec màj solde bancaire) ─────────────

export async function getComptesBancairesCoop(cooperativeId: number) {
  return db
    .select({
      id:               comptesBancairesTable.id,
      nom:              comptesBancairesTable.nom,
      banque:           comptesBancairesTable.banque,
      solde_actuel_fcfa: comptesBancairesTable.soldeActuelFcfa,
    })
    .from(comptesBancairesTable)
    .where(and(
      eq(comptesBancairesTable.cooperativeId, cooperativeId),
      eq(comptesBancairesTable.actif, true),
    ));
}

export async function virementVersBanque(
  caisseId: number,
  cooperativeId: number,
  params: {
    compteBancaireId: number;
    montantFcfa: number;
    libelle?: string;
    reference?: string;
    dateOperation?: string;
    userId?: number | null;
  }
) {
  const { compteBancaireId, montantFcfa, libelle, reference, dateOperation, userId } = params;
  const mt = Math.round(montantFcfa);
  if (mt <= 0) throw new Error("Le montant doit être positif");

  const caisse = await getCaisse(caisseId);
  if (!caisse) throw new Error("Caisse introuvable");
  if (caisse.cooperativeId !== cooperativeId) throw new Error("Caisse non autorisée");

  const session = await getSessionActive(caisseId);
  if (!session) throw new Error(`Aucune session ouverte pour la caisse "${caisse.nom}". Ouvrez d'abord une session.`);

  const [compteBancaire] = await db
    .select()
    .from(comptesBancairesTable)
    .where(and(
      eq(comptesBancairesTable.id, compteBancaireId),
      eq(comptesBancairesTable.cooperativeId, cooperativeId),
    ))
    .limit(1);
  if (!compteBancaire) throw new Error("Compte bancaire introuvable");

  const soldeCaisse  = parseFloat(caisse.soldeActuelFcfa as string);
  if (soldeCaisse < mt) {
    throw new Error(`Solde insuffisant en caisse (${soldeCaisse.toLocaleString("fr-FR")} FCFA disponible)`);
  }

  const nvSoldeCaisse = soldeCaisse - mt;
  const nvSoldeBanque = parseFloat(compteBancaire.soldeActuelFcfa as string) + mt;
  const dateOp  = dateOperation ?? today();
  const ref     = reference ?? `VIR-${Date.now()}`;
  const lib     = libelle ?? `Dépôt en banque — ${compteBancaire.nom}`;

  const result = await db.transaction(async (tx) => {
    // 1. Sortie caisse
    const [mvtCaisse] = await tx
      .insert(mouvementsCaisseTable)
      .values({
        caisseId,
        sessionId:        session.id,
        cooperativeId,
        type:             "sortie",
        motif:            "depot_banque",
        montantFcfa:      mt.toString(),
        libelle:          lib,
        referenceOperation: ref,
        soldeApresFcfa:   nvSoldeCaisse.toString(),
        enregistrePar:    userId ?? null,
      })
      .returning();

    await tx
      .update(caissesTable)
      .set({ soldeActuelFcfa: nvSoldeCaisse.toString() })
      .where(eq(caissesTable.id, caisseId));

    // 2. Entrée banque
    const [mvtBanque] = await tx
      .insert(mouvementsBanqueTable)
      .values({
        compteId:       compteBancaireId,
        cooperativeId,
        type:           "credit",
        motif:          "virement_entrant",
        montantFcfa:    mt.toString(),
        libelle:        `Dépôt depuis ${caisse.nom}${libelle ? ` — ${libelle}` : ""}`,
        reference:      ref,
        dateOperation:  dateOp,
        soldeApresFcfa: nvSoldeBanque.toString(),
        enregistrePar:  userId ?? null,
      })
      .returning();

    await tx
      .update(comptesBancairesTable)
      .set({ soldeActuelFcfa: nvSoldeBanque.toString() })
      .where(eq(comptesBancairesTable.id, compteBancaireId));

    return { mvtCaisse: mvtCaisse!, mvtBanque: mvtBanque! };
  });

  // 3. Écriture OHADA : 521 Débit / 571 Crédit
  proposerEcriture(cooperativeId, {
    source:      "caisse",
    sourceId:    result.mvtBanque.id,
    libelle:     lib,
    compteDebit: "521", compteCredit: "571",
    montantFcfa: mt, date: dateOp,
  }).catch((err) => logger.warn({ err }, "Écriture comptable virement caisse-banque non enregistrée"));

  return {
    mouvement_caisse: result.mvtCaisse.id,
    mouvement_banque: result.mvtBanque.id,
    solde_caisse:     nvSoldeCaisse,
    solde_banque:     nvSoldeBanque,
    reference:        ref,
  };
}

// ─── Rapport PDF journalier ───────────────────────────────────────────────────

export async function genererRapportPdf(caisseId: number, dateSession?: string): Promise<Buffer> {
  const dateStr = dateSession ?? today();
  const caisse = await getCaisse(caisseId);
  if (!caisse) throw new Error("Caisse introuvable");

  const journal = await getJournal(caisseId, { dateDebut: dateStr, dateFin: dateStr });
  const coopNom = await getCoopNom(caisse.cooperativeId);

  // Infos session
  const sessionResult = await db.execute<{
    id: number; statut: string; solde_ouverture_fcfa: string;
    solde_fermeture_theorique_fcfa: string | null; solde_fermeture_reel_fcfa: string | null;
    ecart_fcfa: string | null; heure_ouverture: string; heure_fermeture: string | null;
    ouvert_par_nom: string | null; ferme_par_nom: string | null;
  }>(sql`
    SELECT s.id, s.statut, s.solde_ouverture_fcfa,
      s.solde_fermeture_theorique_fcfa, s.solde_fermeture_reel_fcfa, s.ecart_fcfa,
      s.heure_ouverture::text, s.heure_fermeture::text,
      u1.nom AS ouvert_par_nom, u2.nom AS ferme_par_nom
    FROM sessions_caisse s
    LEFT JOIN users u1 ON u1.id = s.ouvert_par
    LEFT JOIN users u2 ON u2.id = s.ferme_par
    WHERE s.caisse_id = ${caisseId} AND s.date_session = ${dateStr}
    LIMIT 1
  `);
  const session = sessionResult.rows[0];

  const FCFA = (n: number | string) =>
    new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : n) + " FCFA";

  const doc = new PDFDocument({ margin: 45, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  await drawHeader(doc, caisse.cooperativeId, {
    titre_document: "RAPPORT DE CAISSE",
    reference: dateStr,
    hauteur_reservee: 90,
  });

  const margin = 45;
  const pageW  = doc.page.width;
  const cW     = pageW - margin * 2;

  // ── Infos caisse
  doc.moveDown(0.3)
    .font("Helvetica-Bold").fontSize(13).fillColor("#1a4731")
    .text(caisse.nom, margin, doc.y, { width: cW });
  doc.font("Helvetica").fontSize(9).fillColor("#555555")
    .text(`Date : ${new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}`, margin, doc.y, { width: cW });

  if (session) {
    const lignes = [
      [`Ouverture`, `${session.heure_ouverture?.slice(11, 16) ?? "—"} par ${session.ouvert_par_nom ?? "—"}`],
      [`Solde ouverture`, FCFA(session.solde_ouverture_fcfa)],
    ];
    if (session.statut === "fermee") {
      if (session.heure_fermeture) lignes.push([`Fermeture`, session.heure_fermeture.slice(11, 16) + ` par ${session.ferme_par_nom ?? "—"}`]);
      if (session.solde_fermeture_theorique_fcfa) lignes.push([`Solde théorique`, FCFA(session.solde_fermeture_theorique_fcfa)]);
      if (session.solde_fermeture_reel_fcfa) lignes.push([`Solde réel`, FCFA(session.solde_fermeture_reel_fcfa)]);
      const ecart = parseFloat(session.ecart_fcfa ?? "0");
      if (ecart !== 0) lignes.push([`Écart`, FCFA(ecart)]);
    }

    doc.moveDown(0.5);
    const boxY = doc.y;
    doc.save().rect(margin, boxY, cW, lignes.length * 16 + 12).fillColor("#f8f9fa").fill().restore();
    lignes.forEach(([label, val], i) => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#444444")
        .text(`${label} :`, margin + 8, boxY + 6 + i * 16, { width: 100, lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor("#222222")
        .text(val, margin + 110, boxY + 6 + i * 16, { width: cW - 118, lineBreak: false });
    });
    doc.y = boxY + lignes.length * 16 + 16;
  }

  // ── Résumé
  doc.moveDown(0.5);
  const resY = doc.y;
  const colW = cW / 3;
  [
    { label: "Total Entrées", val: FCFA(journal.totalEntrees), color: "#166534" },
    { label: "Total Sorties", val: FCFA(journal.totalSorties), color: "#991b1b" },
    { label: "Solde Actuel", val: FCFA(parseFloat(caisse.soldeActuelFcfa as string)), color: "#1a4731" },
  ].forEach(({ label, val, color }, i) => {
    const x = margin + i * colW;
    doc.save().rect(x, resY, colW - 4, 36).fillColor(color).fill().restore();
    doc.font("Helvetica").fontSize(7).fillColor("#ffffff")
      .text(label, x + 4, resY + 5, { width: colW - 12, align: "center", lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff")
      .text(val, x + 4, resY + 16, { width: colW - 12, align: "center", lineBreak: false });
  });
  doc.y = resY + 44;

  // ── Tableau des mouvements
  doc.moveDown(0.5);
  const headers = ["Heure", "Type", "Motif", "Libellé", "Montant", "Solde"];
  const colWidths = [42, 32, 75, 140, 68, 72];
  const tableX = margin;
  let tableY = doc.y;

  // En-tête tableau
  doc.save().rect(tableX, tableY, cW, 16).fillColor("#1a4731").fill().restore();
  let cx = tableX + 3;
  headers.forEach((h, i) => {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
      .text(h, cx, tableY + 4, { width: colWidths[i]! - 4, lineBreak: false });
    cx += colWidths[i]!;
  });
  tableY += 16;

  // Lignes
  if (journal.mouvements.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#888888")
      .text("Aucun mouvement enregistré pour cette session.", tableX + 4, tableY + 6);
    tableY += 22;
  } else {
    journal.mouvements.forEach((m, idx) => {
      if (tableY > doc.page.height - 80) {
        doc.addPage();
        tableY = 60;
      }
      const bg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
      doc.save().rect(tableX, tableY, cW, 14).fillColor(bg).fill().restore();
      const entree = m.type === "entree";
      const cols = [
        m.created_at?.slice(11, 16) ?? "—",
        entree ? "Entrée" : "Sortie",
        m.motif.replace(/_/g, " "),
        m.libelle ?? "—",
        FCFA(m.montant_fcfa),
        m.solde_apres_fcfa ? FCFA(m.solde_apres_fcfa) : "—",
      ];
      cx = tableX + 3;
      cols.forEach((v, i) => {
        const color = i === 1 ? (entree ? "#166534" : "#991b1b") : "#222222";
        doc.font(i === 1 ? "Helvetica-Bold" : "Helvetica")
          .fontSize(7).fillColor(color)
          .text(String(v).slice(0, i === 3 ? 45 : 30), cx, tableY + 3, { width: colWidths[i]! - 4, lineBreak: false });
        cx += colWidths[i]!;
      });
      // Bordure inférieure
      doc.moveTo(tableX, tableY + 14).lineTo(tableX + cW, tableY + 14).strokeColor("#e5e7eb").lineWidth(0.4).stroke();
      tableY += 14;
    });
  }
  doc.y = tableY + 10;

  // Footers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    await drawFooter(doc, caisse.cooperativeId, i + 1, range.count);
  }
  doc.flushPages();

  doc.end();
  return new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
}

// ─── Pré-vérification caisse délégué avant validation paiement espèces ─────────

export async function verifierCaisseEspeces(
  userId: number,
  cooperativeId: number,
  montantFcfa: number,
): Promise<void> {
  const [caisse] = await db
    .select()
    .from(caissesTable)
    .where(and(
      eq(caissesTable.responsableId, userId),
      eq(caissesTable.cooperativeId, cooperativeId),
      eq(caissesTable.actif, true),
    ))
    .limit(1);

  if (!caisse) {
    throw new Error("Aucune caisse ne vous est assignée. Contactez votre administrateur.");
  }

  const session = await getSessionActive(caisse.id);
  if (!session) {
    throw new Error("Aucune session de caisse ouverte. Ouvrez une session dans la page Caisse avant de valider des paiements en espèces.");
  }

  const solde = parseFloat(caisse.soldeActuelFcfa as string);
  if (solde < Math.round(montantFcfa)) {
    throw new Error(
      `Solde caisse insuffisant. Disponible : ${solde.toLocaleString("fr-FR")} FCFA, requis : ${Math.round(montantFcfa).toLocaleString("fr-FR")} FCFA`,
    );
  }
}

// ─── Vérification caisse centrale avant paiement de prime ────────────────────
// Utilise la caisse de type "centrale" de la coopérative (pas celle du délégué).

export async function verifierCaisseCentrale(
  cooperativeId: number,
  montantFcfa: number,
): Promise<void> {
  const [caisse] = await db
    .select()
    .from(caissesTable)
    .where(and(
      eq(caissesTable.cooperativeId, cooperativeId),
      eq(caissesTable.typeCaisse, "centrale"),
      eq(caissesTable.actif, true),
    ))
    .limit(1);

  if (!caisse) {
    throw new Error("Aucune caisse centrale n'est configurée pour cette coopérative. Créez une caisse centrale dans la page Caisse.");
  }

  const solde = parseFloat(caisse.soldeActuelFcfa as string);
  if (solde < Math.round(montantFcfa)) {
    throw new Error(
      `Solde caisse centrale insuffisant. Disponible : ${solde.toLocaleString("fr-FR")} FCFA, requis : ${Math.round(montantFcfa).toLocaleString("fr-FR")} FCFA`,
    );
  }
}

// ─── Débit caisse principale du délégué (paiement producteur web) ─────────────
// Utilisé lors de la validation d'un règlement espèces depuis le portail web.
// Différent de debiterCaisseDelegue (terrain) qui opère sur caisses_delegues.

export async function debiterCaisseParResponsable(
  userId: number,
  cooperativeId: number,
  montantFcfa: number,
  paiementId: number,
  livraisonId: number | null,
): Promise<{ nouveauSolde: number; alerte?: string }> {
  const [caisse] = await db
    .select()
    .from(caissesTable)
    .where(and(
      eq(caissesTable.responsableId, userId),
      eq(caissesTable.cooperativeId, cooperativeId),
      eq(caissesTable.actif, true),
    ))
    .limit(1);

  if (!caisse) {
    throw new Error("Aucune caisse ne vous est assignée. Contactez votre administrateur.");
  }

  const result = await enregistrerMouvement(caisse.id, {
    type: "sortie",
    motif: "paiement_producteur",
    montantFcfa,
    libelle: `Paiement producteur PAI-${paiementId}${livraisonId ? ` / LIV-${livraisonId}` : ""}`,
    referenceOperation: `PAI-${paiementId}`,
    userId,
  });

  logger.info(
    { userId, paiementId, montantFcfa, nouveauSolde: result.soldeActuel },
    "Caisse déléguée débitée (paiement producteur web)",
  );
  return { nouveauSolde: result.soldeActuel, alerte: result.alerte };
}

// ─── Débit caisse pour paiement de salaire ────────────────────────────────────
// Exige une session ouverte : le mouvement est rattaché à la session du jour.
// L'écriture comptable est gérée séparément par generateEcrituresSalaire.

// ─── Vérification compte Mobile Marchand avant paiement de prime ─────────────
// Lève une exception claire si le compte est absent ou le solde insuffisant.

export async function verifierCompteMobilePourPrime(
  cooperativeId: number,
  operateur: string,
  montantFcfa: number,
): Promise<void> {
  const LABELS: Record<string, string> = { orange_money: "Orange Money", mtn_momo: "MTN MoMo", wave: "Wave" };
  const label = LABELS[operateur] ?? operateur;

  const [compte] = await db
    .select()
    .from(comptesMobilesMarchandsTable)
    .where(and(
      eq(comptesMobilesMarchandsTable.cooperativeId, cooperativeId),
      eq(comptesMobilesMarchandsTable.operateur, operateur as "wave" | "orange_money" | "mtn_momo"),
      eq(comptesMobilesMarchandsTable.actif, true),
    ))
    .limit(1);

  if (!compte) {
    throw new Error(`Aucun compte ${label} actif n'est configuré pour cette coopérative. Créez un compte Mobile Marchand dans la page Mobile Marchands.`);
  }

  const solde = parseFloat(compte.soldeActuelFcfa as string);
  if (solde < Math.round(montantFcfa)) {
    throw new Error(
      `Solde ${label} insuffisant. Disponible : ${solde.toLocaleString("fr-FR")} FCFA, requis : ${Math.round(montantFcfa).toLocaleString("fr-FR")} FCFA`,
    );
  }
}

// ─── Débit compte Mobile Marchand pour paiement d'une prime ──────────────────
// Suppose que verifierCompteMobilePourPrime a déjà été appelée. Lève une
// exception si le compte est introuvable ou si le solde est devenu insuffisant
// entre la vérification et le débit.

export async function debiterCompteMobilePourPrime(
  cooperativeId: number,
  operateur: string,
  montantFcfa: number,
  primeMembreId: number,
  userId: number,
): Promise<{ nouveauSolde: number; alerte?: string }> {
  const LABELS: Record<string, string> = { orange_money: "Orange Money", mtn_momo: "MTN MoMo", wave: "Wave" };
  const label = LABELS[operateur] ?? operateur;

  const [compte] = await db
    .select()
    .from(comptesMobilesMarchandsTable)
    .where(and(
      eq(comptesMobilesMarchandsTable.cooperativeId, cooperativeId),
      eq(comptesMobilesMarchandsTable.operateur, operateur as "wave" | "orange_money" | "mtn_momo"),
      eq(comptesMobilesMarchandsTable.actif, true),
    ))
    .limit(1);

  if (!compte) {
    throw new Error(`Aucun compte ${label} actif n'est configuré pour cette coopérative. Créez un compte Mobile Marchand dans la page Mobile Marchands.`);
  }

  const soldeActuel = parseFloat(compte.soldeActuelFcfa as string);
  if (soldeActuel < Math.round(montantFcfa)) {
    throw new Error(
      `Solde ${label} insuffisant. Disponible : ${soldeActuel.toLocaleString("fr-FR")} FCFA, requis : ${Math.round(montantFcfa).toLocaleString("fr-FR")} FCFA`,
    );
  }

  const nouveauSolde = soldeActuel - Math.round(montantFcfa);
  const today = new Date().toISOString().slice(0, 10);

  await db.transaction(async (tx) => {
    await tx.insert(mouvementsMobileMarchandTable).values({
      compteId:       compte.id,
      cooperativeId,
      type:           "debit",
      motif:          "paiement_prime",
      montantFcfa:    Math.round(montantFcfa).toString(),
      libelle:        `Prime producteur PRM-PAY-${primeMembreId}`,
      reference:      `PRM-PAY-${primeMembreId}`,
      dateOperation:  today,
      soldeApresFcfa: nouveauSolde.toString(),
      enregistrePar:  userId,
    });
    await tx
      .update(comptesMobilesMarchandsTable)
      .set({ soldeActuelFcfa: nouveauSolde.toString() })
      .where(eq(comptesMobilesMarchandsTable.id, compte.id));
  });

  logger.info({ cooperativeId, operateur, primeMembreId, montantFcfa, nouveauSolde }, "Compte Mobile Marchand débité (prime membre)");

  const seuilMini = parseFloat(compte.soldeMiniAlerteFcfa as string);
  let alerte: string | undefined;
  if (seuilMini > 0 && nouveauSolde < seuilMini) {
    alerte = `⚠️ Compte ${label} sous le seuil minimum (${nouveauSolde.toLocaleString("fr-FR")} FCFA)`;
    logger.warn({ cooperativeId, operateur, nouveauSolde, seuilMini }, "Compte Mobile Marchand sous seuil minimum après paiement prime");
  }

  return { nouveauSolde, alerte };
}

// ─── Débit caisse centrale pour paiement d'une prime à un membre ─────────────
// Cible la caisse de type "centrale" de la coopérative (pas la caisse du délégué).

export async function debiterCaissePourPrimeMembre(
  userId: number,
  cooperativeId: number,
  montantFcfa: number,
  primeMembreId: number,
): Promise<{ nouveauSolde: number; alerte?: string }> {
  const [caisse] = await db
    .select()
    .from(caissesTable)
    .where(and(
      eq(caissesTable.cooperativeId, cooperativeId),
      eq(caissesTable.typeCaisse, "centrale"),
      eq(caissesTable.actif, true),
    ))
    .limit(1);

  if (!caisse) {
    throw new Error("Aucune caisse centrale n'est configurée pour cette coopérative. Créez une caisse centrale dans la page Caisse.");
  }

  const result = await enregistrerMouvement(caisse.id, {
    type: "sortie",
    motif: "paiement_prime",
    montantFcfa,
    libelle: `Prime producteur PRM-PAY-${primeMembreId}`,
    referenceOperation: `PRM-PAY-${primeMembreId}`,
    userId,
  });

  logger.info(
    { userId, primeMembreId, montantFcfa, caisseId: caisse.id, nouveauSolde: result.soldeActuel },
    "Caisse centrale débitée (prime membre)",
  );
  return { nouveauSolde: result.soldeActuel, alerte: result.alerte };
}

export async function debitCaisseForSalaire(
  caisseId: number,
  cooperativeId: number,
  montantFcfa: number,
  libelle: string,
  reference: string | null,
  userId: number | null,
): Promise<{ nouveauSolde: number; alerte?: string }> {
  const caisse = await getCaisse(caisseId);
  if (!caisse) throw new Error("Caisse introuvable");
  if (caisse.cooperativeId !== cooperativeId) throw new Error("Accès refusé");

  const sessionRow = await getSessionActive(caisseId);
  if (!sessionRow) {
    throw new Error(
      `Aucune session de caisse ouverte. Ouvrez une session dans la page Caisse avant de payer un salaire en espèces.`,
    );
  }

  const montant = Math.round(montantFcfa);
  const soldeActuel = parseFloat(caisse.soldeActuelFcfa as string);
  if (soldeActuel < montant) {
    throw new Error(`Solde insuffisant en caisse. Disponible : ${soldeActuel.toLocaleString("fr-FR")} FCFA`);
  }
  const nouveauSolde = soldeActuel - montant;

  await db.insert(mouvementsCaisseTable).values({
    caisseId,
    sessionId: sessionRow.id,
    cooperativeId,
    type: "sortie",
    motif: "paiement_salaire",
    montantFcfa: montant.toString(),
    libelle,
    referenceOperation: reference ?? null,
    soldeApresFcfa: nouveauSolde.toString(),
    enregistrePar: userId,
  });

  await db.update(caissesTable)
    .set({ soldeActuelFcfa: nouveauSolde.toString() })
    .where(eq(caissesTable.id, caisseId));

  const fondMin = parseFloat(caisse.fondCaisseMinimumFcfa as string);
  let alerte: string | undefined;
  if (fondMin > 0 && nouveauSolde < fondMin) {
    alerte = `⚠️ Solde caisse sous le fond minimum (${fondMin.toLocaleString("fr-FR")} FCFA)`;
    logger.warn({ caisseId, nouveauSolde, fondMin }, "Caisse sous fond minimum après paiement salaire");
  }

  logger.info({ caisseId, montant, nouveauSolde }, "Caisse débitée (paiement salaire)");
  return { nouveauSolde, alerte };
}
