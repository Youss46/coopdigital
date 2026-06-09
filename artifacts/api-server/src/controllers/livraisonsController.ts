import { type Request, type Response } from "express";
import { db, livraisonsTable, avancesTable, paiementsTable, membresTable, lotLivraisonsTable, campagnesTable, entrepotsTable, mouvementsStockTable } from "@workspace/db";
import { eq, and, desc, notInArray } from "drizzle-orm";
import { checkLivraison, creerAnomalies } from "../services/anomalieService";
import { CreateLivraisonBody } from "@workspace/api-zod";
import { generateEcrituresLivraison } from "../services/comptabiliteService";
import { getEncoursMembre, enregistrerRemboursementParLivraison } from "../services/intrantsService";

export async function listLivraisons(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const membreId = req.query["membre_id"] ? parseInt(String(req.query["membre_id"])) : undefined;
    const limit = Math.min(100, parseInt(String(req.query["limit"] ?? "20")));

    const conditions: ReturnType<typeof eq>[] = [eq(membresTable.cooperativeId, cooperativeId)];
    if (membreId) conditions.push(eq(livraisonsTable.membreId, membreId));

    const livraisons = await db
      .select({
        id: livraisonsTable.id,
        membreId: livraisonsTable.membreId,
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
      })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
      .where(and(...conditions))
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

  const { membreId, poidsKg, prixUnitaireFcfa, dateLivraison, modePaiement,
          campagneId, nombreSacs, retenueKg, sectionLivraison, entrepotId,
          datePaiementPrevue } = parse.data;

  const estDiffere = modePaiement === "differe";

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

    // Résoudre la campagne : obligatoire (règle métier : 1 livraison = 1 campagne active)
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

    // ── Détection anomalies AVANT la transaction ──────────────────────────
    const anomaliesDetectees = await checkLivraison(cooperativeId, {
      membreId, poidsKg, prixUnitaireFcfa,
      campagneIdResolu,
      agentId: req.user?.id ?? null,
    });
    const anomaliesCritiques = anomaliesDetectees.filter((a) => a.niveauGravite === "critique");
    if (anomaliesCritiques.length > 0) {
      void creerAnomalies(cooperativeId, anomaliesCritiques, "livraisons");
      res.status(422).json({
        erreur: anomaliesCritiques[0]!.description,
        anomalie: "bloquee",
        anomalies: anomaliesCritiques,
      });
      return;
    }
    const anomaliesAttention = anomaliesDetectees.filter((a) => a.niveauGravite !== "critique");

    // Récupérer l'encours intrants AVANT la transaction (lecture seule)
    const encoursIntrants = await getEncoursMembre(cooperativeId, membreId);

    const result = await db.transaction(async (tx) => {
      const montantBrut = Math.round(poidsKg * prixUnitaireFcfa);

      // Récupérer l'avance en cours du membre
      const [avanceEnCours] = await tx
        .select()
        .from(avancesTable)
        .where(and(eq(avancesTable.membreId, membreId), eq(avancesTable.statut, "en_cours")))
        .orderBy(desc(avancesTable.dateOctroi))
        .limit(1);

      const avanceDeduite = avanceEnCours ? Math.min(avanceEnCours.soldeRestantFcfa, montantBrut) : 0;
      const apresAvance = montantBrut - avanceDeduite;

      // Déduction intrants APRÈS avance
      const intrantsDeduits = Math.min(encoursIntrants, Math.max(0, apresAvance));
      const montantNet = apresAvance - intrantsDeduits;

      const dateStr = dateLivraison ?? new Date().toISOString().split("T")[0]!;

      // Créer la livraison
      const [livraison] = await tx
        .insert(livraisonsTable)
        .values({
          membreId,
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

      // Créer le paiement (différé = mode especes par défaut, sera confirmé lors du règlement)
      const [paiement] = await tx
        .insert(paiementsTable)
        .values({
          livraisonId: livraison!.id,
          membreId,
          montantFcfa: montantNet,
          modePaiement: estDiffere
            ? "especes"
            : ((modePaiement as "orange_money" | "mtn_momo" | "especes") ?? "especes"),
          statut: "en_attente",
        })
        .returning();

      // Mettre à jour l'avance si applicable
      let avanceMaj = null;
      if (avanceEnCours && avanceDeduite > 0) {
        const nouveauRembourse = avanceEnCours.montantRembourse_fcfa + avanceDeduite;
        const nouveauSolde = avanceEnCours.soldeRestantFcfa - avanceDeduite;
        const nouveauStatut = nouveauSolde === 0 ? "rembourse" : "en_cours";

        const [updated] = await tx
          .update(avancesTable)
          .set({
            montantRembourse_fcfa: nouveauRembourse,
            soldeRestantFcfa: nouveauSolde,
            statut: nouveauStatut,
          })
          .where(eq(avancesTable.id, avanceEnCours.id))
          .returning();

        avanceMaj = updated;
      }

      // Remboursement automatique des intrants par déduction livraison
      if (intrantsDeduits > 0) {
        await enregistrerRemboursementParLivraison(tx, cooperativeId, membreId, intrantsDeduits, dateStr);
      }

      // Créer un mouvement de stock "entrée" dans l'entrepôt choisi (ou le premier par défaut)
      const entrepotCondition = entrepotId
        ? and(eq(entrepotsTable.id, entrepotId), eq(entrepotsTable.cooperativeId, cooperativeId))
        : eq(entrepotsTable.cooperativeId, cooperativeId);
      const [entrepot] = await tx
        .select({ id: entrepotsTable.id })
        .from(entrepotsTable)
        .where(entrepotCondition)
        .orderBy(entrepotsTable.id)
        .limit(1);

      if (entrepot) {
        const poidsNet = retenueKg != null ? poidsKg - retenueKg : poidsKg;
        await tx.insert(mouvementsStockTable).values({
          entrepotId: entrepot.id,
          lotId: null,
          type: "entree",
          poidsKg: String(Math.max(0, poidsNet)),
          motif: `Livraison #${livraison!.id}`,
          agentId: req.user?.id ?? null,
        });
      }

      return {
        livraison: { ...livraison!, membreNom: membre.nom, membrePrenoms: membre.prenoms },
        paiement,
        avanceMiseAJour: avanceMaj,
      };
    });

    if (anomaliesAttention.length > 0) {
      void creerAnomalies(cooperativeId, anomaliesAttention, "livraisons", {
        entiteId: result.livraison.id,
        entiteType: "livraison",
      });
    }

    void generateEcrituresLivraison(cooperativeId, {
      livraisonId: result.livraison.id,
      membreNom: `${result.livraison.membrePrenoms} ${result.livraison.membreNom}`,
      montantBrutFcfa: result.livraison.montantBrutFcfa,
      avanceDeduiteFcfa: result.livraison.avanceDeduiteFcfa,
      montantNetFcfa: result.livraison.montantNetFcfa,
      dateLivraison: result.livraison.dateLivraison,
    });

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
    const deja = await db.select({ livraisonId: lotLivraisonsTable.livraisonId }).from(lotLivraisonsTable);
    const dejaIds = deja.map((d) => d.livraisonId);

    const coopCondition = eq(membresTable.cooperativeId, cooperativeId);
    const nonLoteCondition = dejaIds.length > 0 ? notInArray(livraisonsTable.id, dejaIds) : undefined;

    const livraisons = await db
      .select({
        id: livraisonsTable.id,
        membreId: livraisonsTable.membreId,
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
      })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
      .where(nonLoteCondition ? and(coopCondition, nonLoteCondition) : coopCondition)
      .orderBy(desc(livraisonsTable.dateLivraison))
      .limit(500);

    res.json(livraisons);
  } catch (err) {
    req.log.error({ err }, "Erreur getLivraisonsNonLotees");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
