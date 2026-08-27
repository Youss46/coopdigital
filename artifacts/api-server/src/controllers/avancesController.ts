import { type Request, type Response } from "express";
import { checkAvance, creerAnomalies } from "../services/anomalieService";
import {
  db,
  avancesTable,
  membresTable,
  campagnesTable,
  remboursementsAvancesMembresTable,
  usersTable,
  caissesTable,
  sessionsCaisseTable,
  mouvementsCaisseTable,
  comptesMobilesMarchandsTable,
  mouvementsMobileMarchandTable,
  comptesBancairesTable,
  mouvementsBanqueTable,
} from "@workspace/db";
import { eq, and, sql, desc, ne, isNull, or, lt } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

const saisiseurAlias = alias(usersTable, "saisiseur_user");
import { CampagneFermeeError, assertCampagneActiveExiste } from "../lib/campagneGuard";
import { CreateAvanceBody, RembourserAvanceBody } from "@workspace/api-zod";
import { generateEcrituresAvance } from "../services/comptabiliteService";
import { apiError } from "../lib/apiError";

const CATEGORIE_DELEGUE_LOCALITE = "délégué de localités";

function estPorteeDelegueLocalite(res: Response): boolean {
  return res.locals.membreDelegueLocalite === true;
}

function membreDelegueLocaliteCible(res: Response): number | null {
  const id = Number(res.locals.membreDelegueId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export async function listAvances(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const statut = req.query["statut"] as string | undefined;
    const membreId = membreDelegueLocaliteCible(res)
      ?? (req.params["membreId"] ? parseInt(String(req.params["membreId"])) : undefined)
      ?? (req.query["membre_id"] ? parseInt(String(req.query["membre_id"])) : undefined);

    const conditions: ReturnType<typeof eq>[] = [eq(membresTable.cooperativeId, cooperativeId)];
    if (statut) conditions.push(eq(avancesTable.statut, statut as "en_cours" | "rembourse" | "en_retard"));
    if (membreId) conditions.push(eq(avancesTable.membreId, membreId));
    if (estPorteeDelegueLocalite(res)) {
      conditions.push(eq(membresTable.categorieMembre, CATEGORIE_DELEGUE_LOCALITE));
    }
    // Un délégué ne voit que les avances des membres qui lui sont rattachés
    if (req.user?.role === "delegue" && req.user?.id) {
      conditions.push(eq(membresTable.delegueId, req.user.id));
    }

    const avances = await db
      .select({
        id: avancesTable.id,
        membreId: avancesTable.membreId,
        montantOctroyeFcfa: avancesTable.montantOctroyeFcfa,
        montantRembourseFcfa: avancesTable.montantRembourse_fcfa,
        soldeRestantFcfa: avancesTable.soldeRestantFcfa,
        dateOctroi: avancesTable.dateOctroi,
        dateEcheance: avancesTable.dateEcheance,
        motif: avancesTable.motif,
        statut: avancesTable.statut,
        planType: avancesTable.planType,
        montantPartielFcfa: avancesTable.montantPartielFcfa,
        reportDate: avancesTable.reportDate,
        agentId: avancesTable.agentId,
        agentSaisiseurId: avancesTable.agentSaisiseurId,
        agentSaisiseurNom: saisiseurAlias.nom,
        createdAt: avancesTable.createdAt,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
      })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .leftJoin(saisiseurAlias, eq(avancesTable.agentSaisiseurId, saisiseurAlias.id))
      .where(and(...conditions))
      .orderBy(desc(avancesTable.createdAt));

    res.json({ avances, total: avances.length });
  } catch (err) {
    req.log.error({ err }, "Erreur listAvances");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createAvance(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const body: Record<string, unknown> = {
    ...(req.body as Record<string, unknown>),
    ...(membreDelegueLocaliteCible(res) ? { membreId: membreDelegueLocaliteCible(res) } : {}),
  };
  const parse = CreateAvanceBody.safeParse(body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  const { membreId, montantOctroyeFcfa, dateOctroi, dateEcheance, motif } = parse.data;
  const planType = body["planType"] ?? "integral";
  const montantPartielFcfa = body["montantPartielFcfa"];
  const reportDate = body["reportDate"];
  const modePaiement = body["modePaiement"] ?? "especes";

  if (!Number.isInteger(montantOctroyeFcfa) || montantOctroyeFcfa <= 0) {
    res.status(400).json({ erreur: "Le montant de l'avance doit être un entier strictement positif" });
    return;
  }
  if (!["integral", "partiel", "reporte"].includes(String(planType))) {
    res.status(400).json({ erreur: "Plan de remboursement invalide" });
    return;
  }
  if (!["especes", "mobile", "banque"].includes(String(modePaiement))) {
    res.status(400).json({ erreur: "Mode de paiement invalide" });
    return;
  }
  if (planType === "partiel" && (!Number.isInteger(Number(montantPartielFcfa)) || Number(montantPartielFcfa) <= 0)) {
    res.status(400).json({ erreur: "Un montant partiel entier strictement positif est requis" });
    return;
  }
  if (planType === "reporte" && (typeof reportDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(reportDate))) {
    res.status(400).json({ erreur: "Une date de reprise valide est requise pour un plan reporté" });
    return;
  }

  try {
    const [membre] = await db.select().from(membresTable).where(eq(membresTable.id, membreId)).limit(1);
    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    if (membre.cooperativeId !== cooperativeId) {
      res.status(403).json({ erreur: "Ce membre n'appartient pas à votre coopérative" });
      return;
    }
    if (estPorteeDelegueLocalite(res) && membre.categorieMembre !== CATEGORIE_DELEGUE_LOCALITE) {
      res.status(404).json({ erreur: "Délégué de localités introuvable" });
      return;
    }

    // Les avances ne peuvent être octroyées qu'en cours de campagne active
    try {
      await assertCampagneActiveExiste(cooperativeId);
    } catch (err) {
      if (err instanceof CampagneFermeeError) {
        res.status(err.status).json({ erreur: err.erreur });
        return;
      }
      throw err;
    }

    // ── Détection anomalies ──────────────────────────────────────────────
    const anomaliesDetectees = await checkAvance(cooperativeId, {
      membreId, montantOctroyeFcfa,
      agentId: req.user?.id ?? null,
    });
    const anomaliesCritiques = anomaliesDetectees.filter((a) => a.niveauGravite === "critique");
    if (anomaliesCritiques.length > 0) {
      void creerAnomalies(cooperativeId, anomaliesCritiques, "avances");
      res.status(422).json({
        erreur: anomaliesCritiques[0]!.description,
        anomalie: "bloquee",
        anomalies: anomaliesCritiques,
      });
      return;
    }
    const anomaliesAttention = anomaliesDetectees.filter((a) => a.niveauGravite !== "critique");

    const dateOctroiEffective = dateOctroi ?? new Date().toISOString().split("T")[0]!;
    const avance = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(avancesTable)
        .values({
          membreId,
          montantOctroyeFcfa,
          soldeRestantFcfa: montantOctroyeFcfa,
          dateOctroi: dateOctroiEffective,
          dateEcheance: dateEcheance ?? null,
          motif: motif ?? null,
          statut: "en_cours",
          agentId: req.user?.id ?? null,
          planType: planType as "integral" | "partiel" | "reporte",
          montantPartielFcfa: planType === "partiel" ? Number(montantPartielFcfa) : null,
          reportDate: planType === "reporte" ? String(reportDate) : null,
        })
        .returning();

      const reference = `AVA-${created!.id}`;
      const libelle = `Avance – ${membre.prenoms} ${membre.nom}`;
      const montant = montantOctroyeFcfa;
      const userId = req.user?.id ?? null;

      if (modePaiement === "especes") {
        const [caisse] = await tx
          .select()
          .from(caissesTable)
          .where(and(
            eq(caissesTable.cooperativeId, cooperativeId),
            eq(caissesTable.typeCaisse, "centrale"),
            eq(caissesTable.actif, true),
          ))
          .limit(1);
        if (!caisse) throw new Error("Aucune caisse centrale active n'est configurée.");

        const [session] = await tx
          .select()
          .from(sessionsCaisseTable)
          .where(and(
            eq(sessionsCaisseTable.caisseId, caisse.id),
            eq(sessionsCaisseTable.statut, "ouverte"),
          ))
          .orderBy(desc(sessionsCaisseTable.id))
          .limit(1);
        if (!session) throw new Error("Aucune session de caisse ouverte pour la caisse centrale.");

        const solde = Number(caisse.soldeActuelFcfa);
        if (solde < montant) {
          throw new Error(`Solde caisse insuffisant. Disponible : ${solde.toLocaleString("fr-FR")} FCFA`);
        }
        const nouveauSolde = solde - montant;
        await tx.insert(mouvementsCaisseTable).values({
          caisseId: caisse.id,
          sessionId: session.id,
          cooperativeId,
          type: "sortie",
          motif: "avance",
          montantFcfa: String(montant),
          libelle,
          referenceOperation: reference,
          soldeApresFcfa: String(nouveauSolde),
          enregistrePar: userId,
        });
        await tx.update(caissesTable)
          .set({ soldeActuelFcfa: String(nouveauSolde) })
          .where(eq(caissesTable.id, caisse.id));
      } else if (modePaiement === "mobile") {
        const [compte] = await tx
          .select()
          .from(comptesMobilesMarchandsTable)
          .where(and(
            eq(comptesMobilesMarchandsTable.cooperativeId, cooperativeId),
            eq(comptesMobilesMarchandsTable.actif, true),
          ))
          .orderBy(comptesMobilesMarchandsTable.id)
          .limit(1);
        if (!compte) throw new Error("Aucun compte Mobile Marchand actif n'est configuré.");

        const solde = Number(compte.soldeActuelFcfa);
        if (solde < montant) {
          throw new Error(`Solde Mobile Marchand insuffisant. Disponible : ${solde.toLocaleString("fr-FR")} FCFA`);
        }
        const nouveauSolde = solde - montant;
        await tx.insert(mouvementsMobileMarchandTable).values({
          compteId: compte.id,
          cooperativeId,
          type: "debit",
          motif: "avance",
          montantFcfa: String(montant),
          libelle,
          reference,
          dateOperation: dateOctroiEffective,
          soldeApresFcfa: String(nouveauSolde),
          enregistrePar: userId,
        });
        await tx.update(comptesMobilesMarchandsTable)
          .set({ soldeActuelFcfa: String(nouveauSolde) })
          .where(eq(comptesMobilesMarchandsTable.id, compte.id));
      } else {
        const [compte] = await tx
          .select()
          .from(comptesBancairesTable)
          .where(and(
            eq(comptesBancairesTable.cooperativeId, cooperativeId),
            eq(comptesBancairesTable.actif, true),
          ))
          .orderBy(comptesBancairesTable.id)
          .limit(1);
        if (!compte) throw new Error("Aucun compte bancaire actif n'est configuré.");

        const solde = Number(compte.soldeActuelFcfa);
        if (solde < montant) {
          throw new Error(`Solde bancaire insuffisant. Disponible : ${solde.toLocaleString("fr-FR")} FCFA`);
        }
        const nouveauSolde = solde - montant;
        await tx.insert(mouvementsBanqueTable).values({
          compteId: compte.id,
          cooperativeId,
          type: "debit",
          motif: "avance",
          montantFcfa: String(montant),
          libelle,
          reference,
          dateOperation: dateOctroiEffective,
          soldeApresFcfa: String(nouveauSolde),
          enregistrePar: userId,
        });
        await tx.update(comptesBancairesTable)
          .set({ soldeActuelFcfa: String(nouveauSolde) })
          .where(eq(comptesBancairesTable.id, compte.id));
      }

      return created!;
    });

    if (anomaliesAttention.length > 0) {
      void creerAnomalies(cooperativeId, anomaliesAttention, "avances", { entiteId: avance!.id, entiteType: "avance" });
    }

    void generateEcrituresAvance(cooperativeId, {
      avanceId: avance!.id,
      membreId,
      membreNom: `${membre.prenoms} ${membre.nom}`,
      montantFcfa: montantOctroyeFcfa,
      dateOctroi: avance.dateOctroi,
      modePaiement: modePaiement as "especes" | "mobile" | "banque",
    });

    res.status(201).json(avance);
  } catch (err) {
    req.log.error({ err }, "Erreur createAvance");
    const erreur = apiError(err);
    const estErreurMetier = err instanceof Error && !err.message.startsWith("Failed query:");
    res.status(estErreurMetier ? 400 : 500).json({ erreur });
  }
}

export async function getAvancesEncours(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const avances = await db
      .select({
        id: avancesTable.id,
        membreId: avancesTable.membreId,
        montantOctroyeFcfa: avancesTable.montantOctroyeFcfa,
        montantRembourseFcfa: avancesTable.montantRembourse_fcfa,
        soldeRestantFcfa: avancesTable.soldeRestantFcfa,
        dateOctroi: avancesTable.dateOctroi,
        dateEcheance: avancesTable.dateEcheance,
        motif: avancesTable.motif,
        statut: avancesTable.statut,
        agentId: avancesTable.agentId,
        createdAt: avancesTable.createdAt,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
      })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(avancesTable.statut, "en_cours")))
      .orderBy(desc(avancesTable.createdAt));

    const totaux = avances.reduce(
      (acc, a) => ({
        totalOctroye: acc.totalOctroye + (a.montantOctroyeFcfa ?? 0),
        totalRembourse: acc.totalRembourse + (a.montantRembourseFcfa ?? 0),
        solde: acc.solde + (a.soldeRestantFcfa ?? 0),
      }),
      { totalOctroye: 0, totalRembourse: 0, solde: 0 },
    );

    res.json({
      totalOctroye: totaux.totalOctroye,
      totalRembourse: totaux.totalRembourse,
      soldeToral: totaux.solde,
      count: avances.length,
      avances,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur getAvancesEncours");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function rembourserAvance(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const parse = RembourserAvanceBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides" });
    return;
  }

  const { montantFcfa } = parse.data;
  const id = parseInt(String(req.params["id"] ?? "0"));
  if (!Number.isInteger(montantFcfa) || montantFcfa <= 0) {
    res.status(400).json({ erreur: "Le montant remboursé doit être un entier strictement positif" });
    return;
  }

  try {
    const [row] = await db
      .select({ avance: avancesTable, membreCoopId: membresTable.cooperativeId, categorieMembre: membresTable.categorieMembre })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .where(eq(avancesTable.id, id))
      .limit(1);
    if (!row) {
      res.status(404).json({ erreur: "Avance introuvable" });
      return;
    }
    if (row.membreCoopId !== cooperativeId) {
      res.status(403).json({ erreur: "Cette avance n'appartient pas à votre coopérative" });
      return;
    }
    if (
      estPorteeDelegueLocalite(res)
      && (row.categorieMembre !== CATEGORIE_DELEGUE_LOCALITE
        || (membreDelegueLocaliteCible(res) !== null && row.avance.membreId !== membreDelegueLocaliteCible(res)))
    ) {
      res.status(404).json({ erreur: "Avance de délégué de localités introuvable" });
      return;
    }
    const avance = row.avance;
    if (avance.statut === "rembourse" || avance.soldeRestantFcfa <= 0) {
      res.status(400).json({ erreur: "Cette avance est déjà remboursée" });
      return;
    }

    const avanceMaj = await db.transaction(async (tx) => {
      // Partage le même verrou que le paiement automatique des commissions.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${avance.membreId})`);
      const [avanceFraiche] = await tx
        .select()
        .from(avancesTable)
        .where(eq(avancesTable.id, id))
        .for("update")
        .limit(1);
      if (!avanceFraiche || avanceFraiche.statut === "rembourse" || avanceFraiche.soldeRestantFcfa <= 0) {
        throw new Error("Cette avance est déjà remboursée");
      }

      const [caisse] = await tx
        .select()
        .from(caissesTable)
        .where(and(
          eq(caissesTable.cooperativeId, cooperativeId),
          eq(caissesTable.typeCaisse, "centrale"),
          eq(caissesTable.actif, true),
        ))
        .for("update")
        .limit(1);
      if (!caisse) throw new Error("Aucune caisse centrale active n'est configurée.");

      const [session] = await tx
        .select()
        .from(sessionsCaisseTable)
        .where(and(
          eq(sessionsCaisseTable.caisseId, caisse.id),
          eq(sessionsCaisseTable.statut, "ouverte"),
        ))
        .orderBy(desc(sessionsCaisseTable.id))
        .for("update")
        .limit(1);
      if (!session) throw new Error("Aucune session de caisse ouverte pour la caisse centrale.");

      const montantReel = Math.min(montantFcfa, avanceFraiche.soldeRestantFcfa);
      const nouveauRembourse = avanceFraiche.montantRembourse_fcfa + montantReel;
      const nouveauSolde = avanceFraiche.soldeRestantFcfa - montantReel;
      const nouveauStatut = nouveauSolde === 0 ? "rembourse" : "en_cours";
      const soldeCaisse = Number(caisse.soldeActuelFcfa);
      const nouveauSoldeCaisse = soldeCaisse + montantReel;

      const [remboursement] = await tx.insert(remboursementsAvancesMembresTable).values({
        avanceId: id,
        montantFcfa: montantReel,
        note: typeof req.body?.note === "string" && req.body.note.trim()
          ? req.body.note.trim().slice(0, 500)
          : "Remboursement manuel",
      }).returning({ id: remboursementsAvancesMembresTable.id });

      const [updated] = await tx
        .update(avancesTable)
        .set({
          montantRembourse_fcfa: nouveauRembourse,
          soldeRestantFcfa: nouveauSolde,
          statut: nouveauStatut,
        })
        .where(eq(avancesTable.id, id))
        .returning();

      await tx.insert(mouvementsCaisseTable).values({
        caisseId: caisse.id,
        sessionId: session.id,
        cooperativeId,
        type: "entree",
        motif: "remboursement",
        montantFcfa: String(montantReel),
        libelle: `Remboursement avance AVA-${id}`,
        referenceOperation: `AVA-${id}-RMB-${remboursement?.id ?? "MANUEL"}`,
        soldeApresFcfa: String(nouveauSoldeCaisse),
        enregistrePar: req.user?.id ?? null,
      });
      await tx.update(caissesTable)
        .set({ soldeActuelFcfa: String(nouveauSoldeCaisse) })
        .where(eq(caissesTable.id, caisse.id));
      return updated!;
    });

    res.json(avanceMaj);
  } catch (err) {
    req.log.error({ err }, "Erreur rembourserAvance");
    const erreur = apiError(err);
    const estErreurMetier = err instanceof Error && !err.message.startsWith("Failed query:");
    res.status(estErreurMetier ? 400 : 500).json({ erreur });
  }
}

// ─── Plan de déduction ────────────────────────────────────────────────────────

export async function updatePlanAvanceMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }

  const id = parseInt(String(req.params["id"] ?? "0"));
  const { plan_type, montant_partiel_fcfa, report_date } = req.body as {
    plan_type?: string;
    montant_partiel_fcfa?: number | null;
    report_date?: string | null;
  };

  const validPlans = ["integral", "partiel", "reporte"];
  if (plan_type && !validPlans.includes(plan_type)) {
    res.status(400).json({ erreur: "plan_type invalide (integral | partiel | reporte)" });
    return;
  }

  try {
    const [row] = await db
      .select({ avance: avancesTable, coopId: membresTable.cooperativeId, categorieMembre: membresTable.categorieMembre })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .where(eq(avancesTable.id, id))
      .limit(1);

    if (!row) { res.status(404).json({ erreur: "Avance introuvable" }); return; }
    if (row.coopId !== cooperativeId) { res.status(403).json({ erreur: "Accès refusé" }); return; }
    if (
      estPorteeDelegueLocalite(res)
      && (row.categorieMembre !== CATEGORIE_DELEGUE_LOCALITE
        || (membreDelegueLocaliteCible(res) !== null && row.avance.membreId !== membreDelegueLocaliteCible(res)))
    ) {
      res.status(404).json({ erreur: "Avance de délégué de localités introuvable" }); return;
    }
    if (row.avance.statut === "rembourse") {
      res.status(400).json({ erreur: "Cette avance est déjà remboursée" }); return;
    }
    const finalPlan = plan_type ?? row.avance.planType;
    const finalMontantPartiel = plan_type === "partiel"
      ? montant_partiel_fcfa
      : row.avance.montantPartielFcfa;
    const finalReportDate = plan_type === "reporte"
      ? report_date
      : row.avance.reportDate;

    if (finalPlan === "partiel" && (!Number.isInteger(Number(finalMontantPartiel)) || Number(finalMontantPartiel) <= 0)) {
      res.status(400).json({ erreur: "Un montant partiel entier strictement positif est requis" }); return;
    }
    if (finalPlan === "reporte" && (!finalReportDate || !/^\d{4}-\d{2}-\d{2}$/.test(finalReportDate))) {
      res.status(400).json({ erreur: "Une date de reprise valide est requise" }); return;
    }

    const [updated] = await db
      .update(avancesTable)
      .set({
        planType: finalPlan as "integral" | "partiel" | "reporte",
        montantPartielFcfa: finalPlan === "partiel" ? Number(finalMontantPartiel) : null,
        reportDate: finalPlan === "reporte" ? finalReportDate : null,
      })
      .where(eq(avancesTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "updatePlanAvanceMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── Avances membres avec plan "reporté" et date dépassée ou nulle ───────────

export async function getAvancesReportees(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }

  try {
    const today = new Date().toISOString().split("T")[0]!;

    const conditions: ReturnType<typeof eq>[] = [
      eq(membresTable.cooperativeId, cooperativeId),
      eq(avancesTable.planType, "reporte"),
      ne(avancesTable.statut, "rembourse"),
      or(isNull(avancesTable.reportDate), lt(avancesTable.reportDate, today))!,
    ];

    // Un délégué ne voit que les avances des membres qui lui sont rattachés
    if (req.user?.role === "delegue" && req.user?.id) {
      conditions.push(eq(membresTable.delegueId, req.user.id));
    }
    if (estPorteeDelegueLocalite(res)) {
      conditions.push(eq(membresTable.categorieMembre, CATEGORIE_DELEGUE_LOCALITE));
    }

    const avances = await db
      .select({
        id:                 avancesTable.id,
        membreId:           avancesTable.membreId,
        montantOctroyeFcfa: avancesTable.montantOctroyeFcfa,
        soldeRestantFcfa:   avancesTable.soldeRestantFcfa,
        dateOctroi:         avancesTable.dateOctroi,
        dateEcheance:       avancesTable.dateEcheance,
        statut:             avancesTable.statut,
        planType:           avancesTable.planType,
        reportDate:         avancesTable.reportDate,
        membreNom:          membresTable.nom,
        membrePrenoms:      membresTable.prenoms,
      })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .where(and(...conditions))
      .orderBy(desc(avancesTable.dateOctroi));

    const soldeTotal = avances.reduce((s: number, a) => s + (a.soldeRestantFcfa ?? 0), 0);
    res.json({ avances, total: avances.length, soldeTotal });
  } catch (err) {
    req.log.error({ err }, "getAvancesReportees");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getRemboursementsAvanceMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non associée" }); return; }

  const id = parseInt(String(req.params["id"] ?? "0"));

  try {
    const [row] = await db
      .select({ avance: avancesTable, coopId: membresTable.cooperativeId, categorieMembre: membresTable.categorieMembre })
      .from(avancesTable)
      .leftJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
      .where(eq(avancesTable.id, id))
      .limit(1);

    if (!row) { res.status(404).json({ erreur: "Avance introuvable" }); return; }
    if (row.coopId !== cooperativeId) { res.status(403).json({ erreur: "Accès refusé" }); return; }
    if (
      estPorteeDelegueLocalite(res)
      && (row.categorieMembre !== CATEGORIE_DELEGUE_LOCALITE
        || (membreDelegueLocaliteCible(res) !== null && row.avance.membreId !== membreDelegueLocaliteCible(res)))
    ) {
      res.status(404).json({ erreur: "Avance de délégué de localités introuvable" }); return;
    }

    const rows = await db
      .select()
      .from(remboursementsAvancesMembresTable)
      .where(eq(remboursementsAvancesMembresTable.avanceId, id))
      .orderBy(desc(remboursementsAvancesMembresTable.createdAt));

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "getRemboursementsAvanceMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
