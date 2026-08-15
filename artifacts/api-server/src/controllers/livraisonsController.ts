import { type Request, type Response } from "express";
import { db, livraisonsTable, avancesTable, remboursementsAvancesMembresTable, paiementsTable, membresTable, fournisseursTable, lotLivraisonsTable, lotsTable, campagnesTable, entrepotsTable, mouvementsStockTable, usersTable } from "@workspace/db";
import { alias } from "drizzle-orm/pg-core";

// Alias pour la jointure agent saisie (évite conflit avec d'éventuels autres joins usersTable)
const agentUserAlias = alias(usersTable, "agent_user");
import { creerChequeDepuisLivraison } from "../services/chequesService.js";
import { eq, and, desc, notInArray, or } from "drizzle-orm";
import { CampagneFermeeError, assertCampagneOuverte } from "../lib/campagneGuard";
import { checkLivraison, creerAnomalies } from "../services/anomalieService";
import { CreateLivraisonBody } from "@workspace/api-zod";
import { generateEcrituresLivraison } from "../services/comptabiliteService";
import { getEncoursMembre, enregistrerRemboursementParLivraison } from "../services/intrantsService";
import { envoyerPushGroupePortail } from "../services/pushService";
import { entrerStockSiDelegue, entrerStockLivraison } from "../services/entrepotDelegueService";

export async function listLivraisons(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const membreId = req.query["membre_id"] ? parseInt(String(req.query["membre_id"])) : undefined;
    const limit = Math.min(100, parseInt(String(req.query["limit"] ?? "20")));

    const coopCondition = or(
      eq(membresTable.cooperativeId, cooperativeId),
      eq(fournisseursTable.cooperativeId, cooperativeId),
    );
    const extraConditions = [];
    if (membreId) extraConditions.push(eq(livraisonsTable.membreId, membreId));
    if (req.user?.role === "delegue" && req.user?.id) {
      extraConditions.push(eq(membresTable.delegueId, req.user.id));
    }
    const whereClause = extraConditions.length > 0
      ? and(coopCondition, ...extraConditions)
      : coopCondition;

    const livraisons = await db
      .select({
        id: livraisonsTable.id,
        membreId: livraisonsTable.membreId,
        fournisseurId: livraisonsTable.fournisseurId,
        poidsKg: livraisonsTable.poidsKg,
        prixUnitaireFcfa: livraisonsTable.prixUnitaireFcfa,
        montantBrutFcfa: livraisonsTable.montantBrutFcfa,
        avanceDeduiteFcfa: livraisonsTable.avanceDeduiteFcfa,
        intrantsDeduitsFcfa: livraisonsTable.intrantsDeduitsFcfa,
        montantNetFcfa: livraisonsTable.montantNetFcfa,
        dateLivraison: livraisonsTable.dateLivraison,
        agentId: livraisonsTable.agentId,
        createdAt: livraisonsTable.createdAt,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
        fournisseurNom: fournisseursTable.nom,
        fournisseurPrenoms: fournisseursTable.prenoms,
        agentNom: agentUserAlias.nom,
        agentPrenoms: agentUserAlias.prenoms,
        agentRole: agentUserAlias.role,
      })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .leftJoin(agentUserAlias, eq(livraisonsTable.agentId, agentUserAlias.id))
      .where(whereClause)
      .orderBy(desc(livraisonsTable.dateLivraison))
      .limit(limit);

    res.json(livraisons);
  } catch (err) {
    req.log.error({ err }, "Erreur listLivraisons");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createLivraison(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const parse = CreateLivraisonBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  const { membreId, fournisseurId, poidsKg, prixUnitaireFcfa, dateLivraison, modePaiement,
          campagneId, nombreSacs, retenueKg, sectionLivraison, entrepotId,
          entrepotDelegueId, datePaiementPrevue } = parse.data;

  if (!membreId && !fournisseurId) {
    res.status(400).json({ erreur: "membreId ou fournisseurId est requis" });
    return;
  }

  const poidsBrut = poidsKg + (retenueKg ?? 0);
  const estDiffere = modePaiement === "differe";

  try {
    // ── Résolution du producteur (membre ou fournisseur externe) ──────────
    let nomProducteur = "";
    let membre: typeof membresTable.$inferSelect | undefined;

    if (membreId) {
      const rows = await db.select().from(membresTable).where(eq(membresTable.id, membreId)).limit(1);
      membre = rows[0];
      if (!membre) { res.status(404).json({ erreur: "Membre introuvable" }); return; }
      if (membre.cooperativeId !== cooperativeId) {
        res.status(403).json({ erreur: "Ce membre n'appartient pas à votre coopérative" }); return;
      }
      nomProducteur = `${membre.prenoms ?? ""} ${membre.nom}`.trim();
    } else {
      const [fourn] = await db.select().from(fournisseursTable).where(eq(fournisseursTable.id, fournisseurId!)).limit(1);
      if (!fourn || fourn.cooperativeId !== cooperativeId) {
        res.status(404).json({ erreur: "Fournisseur introuvable" }); return;
      }
      nomProducteur = `${fourn.prenoms ?? ""} ${fourn.nom}`.trim();
    }

    // ── Résolution campagne ────────────────────────────────────────────────
    let campagneIdResolu: number | null = campagneId ?? null;
    if (!campagneIdResolu) {
      const [campagneActive] = await db
        .select({ id: campagnesTable.id })
        .from(campagnesTable)
        .where(and(eq(campagnesTable.cooperativeId, cooperativeId), eq(campagnesTable.statut, "ouverte")))
        .orderBy(desc(campagnesTable.dateOuverture))
        .limit(1);
      campagneIdResolu = campagneActive?.id ?? null;
    }
    if (!campagneIdResolu) {
      res.status(400).json({ erreur: "Aucune campagne active. Ouvrez une campagne avant d'enregistrer des livraisons." });
      return;
    }

    if (campagneId != null) {
      try {
        await assertCampagneOuverte(cooperativeId, campagneIdResolu);
      } catch (err) {
        if (err instanceof CampagneFermeeError) { res.status(err.status).json({ erreur: err.erreur }); return; }
        throw err;
      }
    }

    // ── Anomalies (membres seulement) ─────────────────────────────────────
    const anomaliesDetectees = membreId
      ? await checkLivraison(cooperativeId, { membreId, poidsKg, prixUnitaireFcfa, campagneIdResolu, agentId: req.user?.id ?? null })
      : [];
    const anomaliesCritiques = anomaliesDetectees.filter((a) => a.niveauGravite === "critique");
    if (anomaliesCritiques.length > 0) {
      void creerAnomalies(cooperativeId, anomaliesCritiques, "livraisons");
      res.status(422).json({ erreur: anomaliesCritiques[0]!.description, anomalie: "bloquee", anomalies: anomaliesCritiques });
      return;
    }
    const anomaliesAttention = anomaliesDetectees.filter((a) => a.niveauGravite !== "critique");

    // ── Encours intrants (membres seulement) ──────────────────────────────
    const encoursIntrants = membreId ? await getEncoursMembre(cooperativeId, membreId) : 0;

    // ── Résolution entrepôt dédié fournisseurs ext ────────────────────────
    let resolvedEntrepotId = entrepotId ?? null;
    if (fournisseurId && !entrepotId && !entrepotDelegueId) {
      const [dedié] = await db
        .select({ id: entrepotsTable.id })
        .from(entrepotsTable)
        .where(and(eq(entrepotsTable.cooperativeId, cooperativeId), eq(entrepotsTable.pourFournisseursExt, true)))
        .orderBy(entrepotsTable.id)
        .limit(1);
      if (dedié) resolvedEntrepotId = dedié.id;
    }

    const result = await db.transaction(async (tx) => {
      const montantBrut = Math.round(poidsKg * prixUnitaireFcfa);
      let avanceDeduite = 0;
      let intrantsDeduits = 0;
      let avanceEnCours: typeof avancesTable.$inferSelect | undefined;

      const dateStr = dateLivraison ?? new Date().toISOString().split("T")[0]!;

      // Plan flexible par avance — on traite toutes les avances en_cours par ordre d'octroi
      type AvancePasse = { av: typeof avancesTable.$inferSelect; montant: number };
      const avancesATraiter: AvancePasse[] = [];

      if (membreId) {
        const avancesEnCours = await tx
          .select().from(avancesTable)
          .where(and(eq(avancesTable.membreId, membreId), eq(avancesTable.statut, "en_cours")))
          .orderBy(avancesTable.dateOctroi); // plus ancienne en premier

        let budgetRestant = montantBrut;
        for (const av of avancesEnCours) {
          if (budgetRestant <= 0) break;
          const planType = av.planType ?? "integral";

          // Reporté : sauter si la livraison est avant la date de report
          if (planType === "reporte" && av.reportDate) {
            if (dateStr < av.reportDate) continue;
          }

          const montantCePeriode = planType === "partiel" && av.montantPartielFcfa
            ? Math.min(av.montantPartielFcfa, av.soldeRestantFcfa, budgetRestant)
            : Math.min(av.soldeRestantFcfa, budgetRestant);

          if (montantCePeriode <= 0) continue;
          avanceDeduite += montantCePeriode;
          budgetRestant -= montantCePeriode;
          avancesATraiter.push({ av, montant: montantCePeriode });
        }

        // Pour compatibilité avec le champ avanceEnCours utilisé plus bas
        avanceEnCours = avancesATraiter[0]?.av;
        const apresAvances = montantBrut - avanceDeduite;
        intrantsDeduits = Math.min(encoursIntrants, Math.max(0, apresAvances));
      }

      const montantNet = montantBrut - avanceDeduite - intrantsDeduits;

      const [livraison] = await tx
        .insert(livraisonsTable)
        .values({
          membreId: membreId ?? null,
          fournisseurId: fournisseurId ?? null,
          campagneId: campagneIdResolu,
          poidsKg: String(poidsKg),
          prixUnitaireFcfa,
          montantBrutFcfa: montantBrut,
          avanceDeduiteFcfa: avanceDeduite,
          intrantsDeduitsFcfa: intrantsDeduits,
          montantNetFcfa: montantNet,
          dateLivraison: dateStr,
          agentId: req.user?.id ?? null,
          nombreSacs: nombreSacs ?? null,
          retenueKg: retenueKg != null ? String(retenueKg) : null,
          sectionLivraison: sectionLivraison ?? null,
          ...(estDiffere && {
            statutPaiement: "EN_ATTENTE",
            montantRestant: String(montantNet),
            datePaiementPrevue: datePaiementPrevue ?? null,
          }),
        })
        .returning();

      const [paiement] = await tx
        .insert(paiementsTable)
        .values({
          livraisonId: livraison!.id,
          membreId: membreId ?? null,
          montantFcfa: montantNet,
          modePaiement: estDiffere
            ? "especes"
            : ((modePaiement as "orange_money" | "mtn_momo" | "especes" | "wave" | "cheque") ?? "especes"),
          statut: "en_attente",
        })
        .returning();

      // Mettre à jour chaque avance déduite + enregistrer l'historique
      let avanceMaj = null;
      for (const { av, montant } of avancesATraiter) {
        const nouveauRembourse = av.montantRembourse_fcfa + montant;
        const nouveauSolde = av.soldeRestantFcfa - montant;
        const [updated] = await tx
          .update(avancesTable)
          .set({ montantRembourse_fcfa: nouveauRembourse, soldeRestantFcfa: nouveauSolde, statut: nouveauSolde === 0 ? "rembourse" : "en_cours" })
          .where(eq(avancesTable.id, av.id))
          .returning();
        if (!avanceMaj) avanceMaj = updated;

        // Historique de déduction
        await tx.insert(remboursementsAvancesMembresTable).values({
          avanceId: av.id,
          livraisonId: livraison!.id,
          montantFcfa: montant,
          note: "Déduction automatique sur livraison",
        });
      }

      if (membreId && intrantsDeduits > 0) {
        await enregistrerRemboursementParLivraison(tx, cooperativeId, membreId, intrantsDeduits, dateStr);
      }

      if (!entrepotDelegueId) {
        const entrepotCondition = resolvedEntrepotId
          ? and(eq(entrepotsTable.id, resolvedEntrepotId), eq(entrepotsTable.cooperativeId, cooperativeId))
          : eq(entrepotsTable.cooperativeId, cooperativeId);
        const [entrepotCentral] = await tx
          .select({ id: entrepotsTable.id })
          .from(entrepotsTable)
          .where(entrepotCondition)
          .orderBy(entrepotsTable.id)
          .limit(1);

        if (entrepotCentral) {
          await tx.insert(mouvementsStockTable).values({
            entrepotId: entrepotCentral.id,
            lotId: null,
            type: "entree",
            poidsKg: String(poidsBrut),
            motif: `Livraison #${livraison!.id}`,
            agentId: req.user?.id ?? null,
          });
        }
      }

      return { livraison: { ...livraison!, nomProducteur }, paiement, avanceMiseAJour: avanceMaj };
    });

    if (anomaliesAttention.length > 0) {
      void creerAnomalies(cooperativeId, anomaliesAttention, "livraisons", {
        entiteId: result.livraison.id,
        entiteType: "livraison",
      });
    }

    void generateEcrituresLivraison(cooperativeId, {
      livraisonId: result.livraison.id,
      membreId: membreId ?? undefined,
      membreNom: nomProducteur,
      montantBrutFcfa: result.livraison.montantBrutFcfa,
      avanceDeduiteFcfa: result.livraison.avanceDeduiteFcfa,
      montantNetFcfa: result.livraison.montantNetFcfa,
      dateLivraison: result.livraison.dateLivraison,
    });

    if (membreId) {
      void envoyerPushGroupePortail([membreId], {
        title: "Livraison enregistrée",
        body: `${Number(result.livraison.poidsKg).toLocaleString("fr-FR")} kg — ${result.livraison.montantNetFcfa.toLocaleString("fr-FR")} FCFA net`,
        url: "/portail/livraisons",
      });

      if (modePaiement === "cheque" && result.paiement) {
        const dateStr = typeof dateLivraison === "string" ? dateLivraison : new Date().toISOString().slice(0, 10);
        void creerChequeDepuisLivraison(cooperativeId, {
          paiementId:   result.paiement.id,
          membreId,
          livraisonId:  result.livraison.id,
          membreNom:    nomProducteur,
          montantFcfa:  result.livraison.montantNetFcfa,
          dateEmission: dateStr,
        }, req.user?.id ?? 0);
      }
    }

    if (entrepotDelegueId) {
      void entrerStockLivraison(entrepotDelegueId, cooperativeId, poidsBrut, result.livraison.id, req.user!.id);
    } else {
      void entrerStockSiDelegue(result.livraison.agentId, cooperativeId, poidsBrut, result.livraison.id);
    }

    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur createLivraison");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getLivraisonsNonLotees(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const deja = await db
      .select({ livraisonId: lotLivraisonsTable.livraisonId })
      .from(lotLivraisonsTable)
      .innerJoin(lotsTable, eq(lotLivraisonsTable.lotId, lotsTable.id))
      .where(eq(lotsTable.cooperativeId, cooperativeId));
    const dejaIds = deja.map((d) => d.livraisonId);

    const coopCondition = or(
      eq(membresTable.cooperativeId, cooperativeId),
      eq(fournisseursTable.cooperativeId, cooperativeId),
    );
    const nonLoteCondition = dejaIds.length > 0 ? notInArray(livraisonsTable.id, dejaIds) : undefined;

    const livraisons = await db
      .select({
        id: livraisonsTable.id,
        membreId: livraisonsTable.membreId,
        fournisseurId: livraisonsTable.fournisseurId,
        poidsKg: livraisonsTable.poidsKg,
        produitBrutKg: livraisonsTable.produitBrutKg,
        prixUnitaireFcfa: livraisonsTable.prixUnitaireFcfa,
        montantBrutFcfa: livraisonsTable.montantBrutFcfa,
        avanceDeduiteFcfa: livraisonsTable.avanceDeduiteFcfa,
        intrantsDeduitsFcfa: livraisonsTable.intrantsDeduitsFcfa,
        montantNetFcfa: livraisonsTable.montantNetFcfa,
        dateLivraison: livraisonsTable.dateLivraison,
        agentId: livraisonsTable.agentId,
        createdAt: livraisonsTable.createdAt,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
        fournisseurNom: fournisseursTable.nom,
        fournisseurPrenoms: fournisseursTable.prenoms,
      })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .where(nonLoteCondition ? and(coopCondition, nonLoteCondition) : coopCondition)
      .orderBy(desc(livraisonsTable.dateLivraison))
      .limit(500);

    res.json(livraisons);
  } catch (err) {
    req.log.error({ err }, "Erreur getLivraisonsNonLotees");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
