import { type Request, type Response } from "express";
import {
  db, livraisonsTable, avancesTable, remboursementsAvancesMembresTable, paiementsTable,
  membresTable, fournisseursTable, lotLivraisonsTable, lotsTable, campagnesTable,
  entrepotsTable, mouvementsStockTable, usersTable, sessionsPeseeTable,
  remboursementsIntrantsTable, distributionsIntrantsTable, entrepotsDeleguesTable,
  entrepotsMouvementsTable, mouvementsCaisseDelegueTable, commissionsDeleguesTable,
  chequesEmisTable, expeditionLotsTable, auditTrailTable, ecrituresComptablesTable,
  ecrituresEnAttenteTable, exercicesTable,
} from "@workspace/db";
import { alias } from "drizzle-orm/pg-core";

// Alias pour la jointure agent saisie (évite conflit avec d'éventuels autres joins usersTable)
const agentUserAlias = alias(usersTable, "agent_user");
// Alias pour la jointure peseur saisie physique (proxy délégué central)
const peseurUserAlias = alias(usersTable, "peseur_user");
import { creerChequeDepuisLivraison } from "../services/chequesService.js";
import { eq, and, desc, notInArray, or, sql, gte, lte, isNull, inArray, like } from "drizzle-orm";
import { CampagneFermeeError, assertCampagneOuverte } from "../lib/campagneGuard";
import { checkLivraison, creerAnomalies } from "../services/anomalieService";
import { CreateLivraisonBody } from "@workspace/api-zod";
import { generateEcrituresLivraison } from "../services/comptabiliteService";
import { getMontantAlimentationsCaisseDelegue } from "../services/delegueService";
import { getEncoursMembre, enregistrerRemboursementParLivraison } from "../services/intrantsService";
import { envoyerPushGroupePortail } from "../services/pushService";
import { entrerStockSiDelegue, entrerStockLivraison } from "../services/entrepotDelegueService";
import { genererNumeroRecu, genererNumeroLivraison, reserverNumeroPesee } from "../services/recuService.js";
import { calculerRetenueAvanceLivraison } from "../services/peseeSessionService.js";

export async function listLivraisons(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const membreId = req.query["membre_id"] ? parseInt(String(req.query["membre_id"])) : undefined;
    const categorieMembreDelegue = req.query["categorie_membre_delegue"] === "true";
    // When fetching all delegue livraisons for the aggregated view, we don't cap at 200.
    const defaultLimit = categorieMembreDelegue ? 10000 : 20;
    const limit = Math.min(10000, parseInt(String(req.query["limit"] ?? String(defaultLimit))));
    const statutPaiementFilter = req.query["statut_paiement"] ? String(req.query["statut_paiement"]) : undefined;
    const dateDebut = req.query["date_debut"] ? String(req.query["date_debut"]) : undefined;
    const dateFin = req.query["date_fin"] ? String(req.query["date_fin"]) : undefined;

    const coopCondition = or(
      eq(membresTable.cooperativeId, cooperativeId),
      eq(fournisseursTable.cooperativeId, cooperativeId),
    );
    const extraConditions = [];
    if (membreId) extraConditions.push(eq(livraisonsTable.membreId, membreId));
    if (categorieMembreDelegue) {
      extraConditions.push(eq(membresTable.categorieMembre, "délégué de localités"));
    }
    if (statutPaiementFilter) {
      extraConditions.push(eq(livraisonsTable.statutPaiement, statutPaiementFilter));
    }
    if (dateDebut) {
      extraConditions.push(gte(livraisonsTable.dateLivraison, dateDebut));
    }
    if (dateFin) {
      extraConditions.push(lte(livraisonsTable.dateLivraison, dateFin));
    }
    if (req.user?.role === "delegue" && req.user?.id) {
      // Membres rattachés AU délégué OU fournisseurs externes créés PAR ce délégué
      extraConditions.push(
        or(
          eq(membresTable.delegueId, req.user.id),
          eq(fournisseursTable.creeParDelegueId, req.user.id),
        )!,
      );
    }
    const whereClause = extraConditions.length > 0
      ? and(coopCondition, ...extraConditions)
      : coopCondition;

    const livraisons = await db
      .select({
        id: livraisonsTable.id,
        numeroPesee: livraisonsTable.numeroPesee,
        membreId: livraisonsTable.membreId,
        fournisseurId: livraisonsTable.fournisseurId,
        poidsKg: livraisonsTable.poidsKg,
        prixUnitaireFcfa: livraisonsTable.prixUnitaireFcfa,
        montantBrutFcfa: livraisonsTable.montantBrutFcfa,
        avanceDeduiteFcfa: livraisonsTable.avanceDeduiteFcfa,
        intrantsDeduitsFcfa: livraisonsTable.intrantsDeduitsFcfa,
        montantNetFcfa: livraisonsTable.montantNetFcfa,
        dateLivraison: livraisonsTable.dateLivraison,
        statutPaiement: livraisonsTable.statutPaiement,
        agentId: livraisonsTable.agentId,
        createdAt: livraisonsTable.createdAt,
        membreNom: membresTable.nom,
        membrePrenoms: membresTable.prenoms,
        fournisseurNom: fournisseursTable.nom,
        fournisseurPrenoms: fournisseursTable.prenoms,
        agentNom: agentUserAlias.nom,
        agentPrenoms: agentUserAlias.prenoms,
        agentRole: agentUserAlias.role,
        peseurNom: peseurUserAlias.nom,
        peseurPrenoms: peseurUserAlias.prenoms,
        planAvanceType: livraisonsTable.planAvanceType,
        nombreSacs: livraisonsTable.nombreSacs,
      })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .leftJoin(agentUserAlias, eq(livraisonsTable.agentId, agentUserAlias.id))
      .leftJoin(peseurUserAlias, eq(livraisonsTable.peseurId, peseurUserAlias.id))
      .where(whereClause)
      .orderBy(
        desc(livraisonsTable.dateLivraison),
        sql`COALESCE(${livraisonsTable.numeroPesee}, 0) DESC`,
        desc(livraisonsTable.createdAt),
        desc(livraisonsTable.id),
      )
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

    // Numéro de réçu attribué avant la transaction (gap acceptable si tx rollback)
    const numeroRecu = await genererNumeroRecu(cooperativeId);
    const dateNumero = dateLivraison ?? new Date().toISOString().split("T")[0]!;
    const { numero: numeroPesee, annee: anneeNumeroPesee } =
      await reserverNumeroPesee(cooperativeId, dateNumero);
    // Numéro de livraison délégué — uniquement quand l'entrepôt délégué est précisé
    const numeroLivraison = entrepotDelegueId
      ? await genererNumeroLivraison(entrepotDelegueId)
      : null;

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
        // Même verrou que la clôture d'une session de pesée : une livraison
        // directe et une clôture concurrentes ne peuvent pas consommer le
        // même solde d'avance.
        await tx.execute(sql`SELECT pg_advisory_xact_lock(${membreId})`);
        const avancesEnCours = await tx
          .select().from(avancesTable)
          .where(and(
            eq(avancesTable.membreId, membreId),
            inArray(avancesTable.statut, ["en_cours", "en_retard"] as const),
            // Une avance affectée à la commission ne doit jamais réduire
            // le net d'une livraison. Les anciennes lignes sans source
            // restent compatibles avec le comportement historique.
            or(
              isNull(avancesTable.deductionSource),
              eq(avancesTable.deductionSource, "livraison"),
            )!,
          ))
          .orderBy(avancesTable.dateOctroi); // plus ancienne en premier

        let budgetRestant = montantBrut;
        for (const av of avancesEnCours) {
          if (budgetRestant <= 0) break;
          // Utiliser le même calcul que la clôture d'une session de pesée :
          // un plan reporté sans date ne doit jamais tomber sur le fallback
          // historique « intégral ».
          const montantCePeriode = calculerRetenueAvanceLivraison(av, dateStr, budgetRestant);

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
          cooperativeId,
          membreId: membreId ?? null,
          fournisseurId: fournisseurId ?? null,
          campagneId: campagneIdResolu,
          numeroPesee,
          anneeNumeroPesee,
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
          numeroLivraison: numeroLivraison ?? null,
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
          cooperativeId,
          livraisonId: livraison!.id,
          membreId: membreId ?? null,
          montantFcfa: montantNet,
          // Un règlement différé choisit son moyen à chaque versement.
          // Laisser le mode null évite de figer le premier versement en espèces.
          modePaiement: estDiffere
            ? null
            : ((modePaiement as "orange_money" | "mtn_momo" | "especes" | "wave" | "cheque") ?? "especes"),
          statut: "en_attente",
          numeroRecu,
        })
        .returning();

      // Mettre à jour chaque avance déduite + enregistrer l'historique
      let avanceMaj = null;
      for (const { av, montant } of avancesATraiter) {
        const nouveauRembourse = av.montantRembourse_fcfa + montant;
        const nouveauSolde = av.soldeRestantFcfa - montant;
        const [updated] = await tx
          .update(avancesTable)
          .set({ montantRembourse_fcfa: nouveauRembourse, soldeRestantFcfa: nouveauSolde, statut: nouveauSolde === 0 ? "rembourse" : av.statut })
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
        await enregistrerRemboursementParLivraison(tx, cooperativeId, membreId, intrantsDeduits, dateStr, livraison!.id);
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
            livraisonId: livraison!.id,
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

    // Déterminer si le délégué collecteur a été pré-financé par la caisse coop
    // → ventilation OHADA 601/521 (caisse) vs 601/401 (dette fournisseur).
    void (async () => {
      let montantCoopFcfa = 0;
      const delegueId = result.livraison.agentId;
      if (delegueId) {
        const cutoff = result.livraison.dateLivraison
          ? new Date(result.livraison.dateLivraison)
          : new Date();
        try {
          montantCoopFcfa = await getMontantAlimentationsCaisseDelegue(
            delegueId, cooperativeId, cutoff,
          );
        } catch {
          // non-bloquant — on continue sans la ventilation caisse
        }
      }
      await generateEcrituresLivraison(cooperativeId, {
        livraisonId: result.livraison.id,
        membreId: membreId ?? undefined,
        fournisseurId: fournisseurId ?? undefined,
        membreNom: nomProducteur,
        montantBrutFcfa: result.livraison.montantBrutFcfa,
        avanceDeduiteFcfa: result.livraison.avanceDeduiteFcfa,
        montantNetFcfa: result.livraison.montantNetFcfa,
        dateLivraison: result.livraison.dateLivraison,
        montantCoopFcfa: montantCoopFcfa > 0 ? montantCoopFcfa : undefined,
      });
    })();

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
        nombreSacs: livraisonsTable.nombreSacs,
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

class AnnulationLivraisonError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

function asJsonRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function listLivraisonsAnnulees(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const rows = await db
      .select({
        id: auditTrailTable.entiteId,
        annuleeLe: auditTrailTable.createdAt,
        valeursAvant: auditTrailTable.valeursAvant,
        valeursApres: auditTrailTable.valeursApres,
        userNom: auditTrailTable.userNom,
      })
      .from(auditTrailTable)
      .where(and(
        eq(auditTrailTable.cooperativeId, cooperativeId),
        eq(auditTrailTable.module, "livraisons"),
        eq(auditTrailTable.entiteType, "livraison_annulee"),
      ))
      .orderBy(desc(auditTrailTable.createdAt))

    res.json(rows.map((row) => {
      const avant = asJsonRecord(row.valeursAvant);
      const apres = asJsonRecord(row.valeursApres);
      const livraison = asJsonRecord(avant["livraison"]);
      const membre = asJsonRecord(avant["membre"]);
      const fournisseur = asJsonRecord(avant["fournisseur"]);
      return {
        id: row.id,
        annuleeLe: row.annuleeLe,
        annuleePar: row.userNom,
        motif: typeof apres["motif"] === "string" ? apres["motif"] : "",
        livraison: {
          ...livraison,
          membreNom: membre["nom"] ?? null,
          membrePrenoms: membre["prenoms"] ?? null,
          fournisseurNom: fournisseur["nom"] ?? null,
          fournisseurPrenoms: fournisseur["prenoms"] ?? null,
        },
      };
    }));
  } catch (err) {
    req.log.error({ err }, "Erreur listLivraisonsAnnulees");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function annulerLivraison(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  const livraisonId = Number.parseInt(String(req.params["id"] ?? ""), 10);
  const motif = typeof req.body?.motif === "string" ? req.body.motif.trim() : "";

  if (!cooperativeId || !userId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  if (!Number.isInteger(livraisonId) || livraisonId <= 0 || motif.length < 5 || motif.length > 500) {
    res.status(400).json({ erreur: "Un motif d'au moins 5 caractères est obligatoire" });
    return;
  }

  try {
    await db.transaction(async (tx) => {
      const [livraison] = await tx
        .select()
        .from(livraisonsTable)
        .where(and(
          eq(livraisonsTable.id, livraisonId),
          eq(livraisonsTable.cooperativeId, cooperativeId),
        ))
        .for("update")
        .limit(1);

      if (!livraison) throw new AnnulationLivraisonError("Livraison introuvable", 404);

      const [membre] = livraison.membreId
        ? await tx.select({ nom: membresTable.nom, prenoms: membresTable.prenoms })
          .from(membresTable)
          .where(and(
            eq(membresTable.id, livraison.membreId),
            eq(membresTable.cooperativeId, cooperativeId),
          ))
          .limit(1)
        : [];
      const [fournisseur] = livraison.fournisseurId
        ? await tx.select({ nom: fournisseursTable.nom, prenoms: fournisseursTable.prenoms })
          .from(fournisseursTable)
          .where(and(
            eq(fournisseursTable.id, livraison.fournisseurId),
            eq(fournisseursTable.cooperativeId, cooperativeId),
          ))
          .limit(1)
        : [];
      if ((livraison.membreId && !membre) || (livraison.fournisseurId && !fournisseur)) {
        throw new AnnulationLivraisonError("Annulation impossible : le producteur lié n'appartient pas à cette coopérative");
      }

      const [session] = await tx
        .select()
        .from(sessionsPeseeTable)
        .where(and(
          eq(sessionsPeseeTable.livraisonId, livraisonId),
          eq(sessionsPeseeTable.cooperativeId, cooperativeId),
        ))
        .for("update")
        .limit(1);
      if (session && session.statut !== "terminee") {
        throw new AnnulationLivraisonError("Seule une livraison issue d'une pesée terminée peut être annulée");
      }

      const [lotLink] = await tx
        .select({ lotId: lotLivraisonsTable.lotId })
        .from(lotLivraisonsTable)
        .innerJoin(lotsTable, eq(lotLivraisonsTable.lotId, lotsTable.id))
        .where(and(
          eq(lotLivraisonsTable.livraisonId, livraisonId),
          eq(lotsTable.cooperativeId, cooperativeId),
        ))
        .limit(1);
      if (lotLink) {
        throw new AnnulationLivraisonError("Cette livraison est déjà intégrée à un lot et ne peut pas être annulée");
      }

      const [expeditionLink] = await tx
        .select({ id: expeditionLotsTable.id })
        .from(expeditionLotsTable)
        .where(eq(expeditionLotsTable.livraisonId, livraisonId))
        .limit(1);
      if (expeditionLink) {
        throw new AnnulationLivraisonError("Cette livraison est déjà rattachée à une expédition et ne peut pas être annulée");
      }

      const paiements = await tx
        .select()
        .from(paiementsTable)
        .where(and(
          eq(paiementsTable.livraisonId, livraisonId),
          eq(paiementsTable.cooperativeId, cooperativeId),
        ))
        .for("update");
      if (paiements.some((p) => p.statut === "confirme" || p.statut === "effectue")) {
        throw new AnnulationLivraisonError("Annulation impossible : un règlement de cette livraison est déjà confirmé");
      }

      const cheques = await tx
        .select()
        .from(chequesEmisTable)
        .where(and(
          eq(chequesEmisTable.cooperativeId, cooperativeId),
          eq(chequesEmisTable.livraisonId, livraisonId),
        ))
        .for("update");
      if (cheques.some((c) => c.statut !== "annule" && c.statut !== "rejete")) {
        throw new AnnulationLivraisonError("Annulez ou rejetez d'abord le chèque lié à cette livraison");
      }

      const mouvementsCaisse = await tx
        .select()
        .from(mouvementsCaisseDelegueTable)
        .where(eq(mouvementsCaisseDelegueTable.livraisonId, livraisonId))
        .for("update");
      if (mouvementsCaisse.length > 0) {
        throw new AnnulationLivraisonError("Annulation impossible : une opération de caisse du délégué est déjà liée à cette livraison");
      }

      const commissions = await tx
        .select()
        .from(commissionsDeleguesTable)
        .where(eq(commissionsDeleguesTable.livraisonId, livraisonId))
        .for("update");
      if (commissions.some((c) => (c.statut !== "en_attente" && c.statut !== "annulé") || c.mouvementId != null)) {
        throw new AnnulationLivraisonError("Annulation impossible : la commission liée à cette livraison a déjà été réglée");
      }

      const avances = await tx
        .select()
        .from(remboursementsAvancesMembresTable)
        .where(eq(remboursementsAvancesMembresTable.livraisonId, livraisonId))
        .for("update");
      const montantAvancesHistorique = avances.reduce((s, r) => s + r.montantFcfa, 0);
      if (montantAvancesHistorique !== livraison.avanceDeduiteFcfa) {
        throw new AnnulationLivraisonError(
          "Annulation impossible : l'historique des retenues d'avance ne correspond pas au montant de la livraison",
        );
      }

      const remboursementsIntrants = await tx
        .select()
        .from(remboursementsIntrantsTable)
        .where(eq(remboursementsIntrantsTable.livraisonId, livraisonId))
        .for("update");
      const montantIntrantsHistorique = remboursementsIntrants
        .filter((r) => r.mode === "deduction_livraison")
        .reduce((s, r) => s + Math.round(Number(r.montantFcfa)), 0);
      if (montantIntrantsHistorique !== livraison.intrantsDeduitsFcfa) {
        throw new AnnulationLivraisonError(
          "Annulation impossible : l'historique des retenues d'intrants n'est pas complet pour cette livraison",
        );
      }

      const conditionsMouvementsStock = [
        eq(mouvementsStockTable.livraisonId, livraisonId),
        eq(mouvementsStockTable.motif, `Livraison #${livraisonId}`),
      ];
      if (session) {
        conditionsMouvementsStock.push(
          eq(mouvementsStockTable.motif, `Session pesée #${session.id}`),
          eq(mouvementsStockTable.motif, `Livraison membre-délégué — session #${session.id}`),
        );
      }
      const mouvementsStock = await tx
        .select({
          id: mouvementsStockTable.id,
          entrepotId: mouvementsStockTable.entrepotId,
          type: mouvementsStockTable.type,
          poidsKg: mouvementsStockTable.poidsKg,
          nombreSacs: mouvementsStockTable.nombreSacs,
          motif: mouvementsStockTable.motif,
        })
        .from(mouvementsStockTable)
        .innerJoin(entrepotsTable, eq(mouvementsStockTable.entrepotId, entrepotsTable.id))
        .where(and(
          eq(entrepotsTable.cooperativeId, cooperativeId),
          or(...conditionsMouvementsStock),
        ));

      const entrepotMouvements = await tx
        .select()
        .from(entrepotsMouvementsTable)
        .where(eq(entrepotsMouvementsTable.livraisonId, livraisonId))
        .for("update");
      if (entrepotMouvements.some((m) => m.typeMouvement === "sortie")) {
        throw new AnnulationLivraisonError("Annulation impossible : le stock de l'entrepôt délégué a déjà été transféré");
      }

      const ecritures = await tx
        .select()
        .from(ecrituresComptablesTable)
        .where(and(
          eq(ecrituresComptablesTable.cooperativeId, cooperativeId),
          eq(ecrituresComptablesTable.source, "livraison"),
          eq(ecrituresComptablesTable.sourceId, livraisonId),
        ))
        .for("update");
      const anneeCorrection = new Date().getFullYear();
      let exerciceCorrection = anneeCorrection;
      if (ecritures.length > 0) {
        const [exerciceOuvert] = await tx
          .select({ annee: exercicesTable.annee })
          .from(exercicesTable)
          .where(and(
            eq(exercicesTable.cooperativeId, cooperativeId),
            eq(exercicesTable.annee, anneeCorrection),
            eq(exercicesTable.statut, "ouvert"),
          ))
          .limit(1);
        if (!exerciceOuvert) {
          throw new AnnulationLivraisonError(
            "Annulation impossible : aucun exercice comptable ouvert n'est disponible pour enregistrer la contre-écriture",
          );
        }
        exerciceCorrection = exerciceOuvert.annee;
      }
      const ecrituresEnAttente = await tx
        .select()
        .from(ecrituresEnAttenteTable)
        .where(and(
          eq(ecrituresEnAttenteTable.cooperativeId, cooperativeId),
          eq(ecrituresEnAttenteTable.source, "livraison"),
          eq(ecrituresEnAttenteTable.sourceId, livraisonId),
          eq(ecrituresEnAttenteTable.statut, "en_attente"),
        ))
        .for("update");

      const mouvementStockInverse: Array<{ entrepotId: number; poidsKg: number }> = [];
      const mouvementsParEntrepot = new Map<number, typeof mouvementsStock>();
      for (const mouvement of mouvementsStock) {
        if (mouvement.type !== "entree") continue;
        const groupe = mouvementsParEntrepot.get(mouvement.entrepotId) ?? [];
        groupe.push(mouvement);
        mouvementsParEntrepot.set(mouvement.entrepotId, groupe);
      }
      for (const [entrepotId, lignes] of mouvementsParEntrepot) {
        const historiques = await tx
          .select({ type: mouvementsStockTable.type, poidsKg: mouvementsStockTable.poidsKg })
          .from(mouvementsStockTable)
          .where(eq(mouvementsStockTable.entrepotId, entrepotId));
        const stockActuel = historiques.reduce((total, mouvement) => {
          const poids = Number(mouvement.poidsKg);
          if (mouvement.type === "entree" || mouvement.type === "retour_refus") return total + poids;
          if (mouvement.type === "sortie" || mouvement.type === "declassement" || mouvement.type === "perte") return total - poids;
          return total;
        }, 0);
        const poidsALibérer = lignes.reduce((total, ligne) => total + Number(ligne.poidsKg), 0);
        if (stockActuel + 0.001 < poidsALibérer) {
          throw new AnnulationLivraisonError("Annulation impossible : le stock correspondant à cette livraison a déjà été utilisé");
        }
        mouvementStockInverse.push({ entrepotId, poidsKg: poidsALibérer });
      }

      const delegatedByWarehouse = new Map<number, typeof entrepotMouvements>();
      for (const movement of entrepotMouvements) {
        const list = delegatedByWarehouse.get(movement.entrepotId) ?? [];
        list.push(movement);
        delegatedByWarehouse.set(movement.entrepotId, list);
      }
      for (const [entrepotId, movements] of delegatedByWarehouse) {
        const [entrepot] = await tx
          .select()
          .from(entrepotsDeleguesTable)
          .where(and(
            eq(entrepotsDeleguesTable.id, entrepotId),
            eq(entrepotsDeleguesTable.cooperativeId, cooperativeId),
          ))
          .for("update")
          .limit(1);
        if (!entrepot) throw new AnnulationLivraisonError("L'entrepôt délégué lié à cette livraison est introuvable");
        const poids = movements.reduce((s, m) => s + Number(m.poidsKg), 0);
        const stockAvant = Number(entrepot.stockActuelKg ?? 0);
        if (stockAvant + 0.001 < poids) {
          throw new AnnulationLivraisonError("Annulation impossible : le stock de l'entrepôt délégué a déjà été utilisé");
        }
        const stockApres = stockAvant - poids;
        await tx.update(entrepotsDeleguesTable)
          .set({ stockActuelKg: String(stockApres), stockMisAJourLe: new Date(), updatedAt: new Date() })
          .where(eq(entrepotsDeleguesTable.id, entrepotId));
        await tx.insert(entrepotsMouvementsTable).values({
          entrepotId,
          typeMouvement: "sortie",
          motif: "livraison_membre",
          poidsKg: String(poids),
          stockAvantKg: String(stockAvant),
          stockApresKg: String(stockApres),
          livraisonId: null,
          enregistrePar: userId,
          notes: `Annulation livraison #${livraisonId} : ${motif}`,
        });
      }

      const distributionsAvant: Array<typeof distributionsIntrantsTable.$inferSelect> = [];
      const intrantsParDistribution = new Map<number, number>();
      for (const remboursement of remboursementsIntrants) {
        if (remboursement.mode !== "deduction_livraison") continue;
        intrantsParDistribution.set(
          remboursement.distributionId,
          (intrantsParDistribution.get(remboursement.distributionId) ?? 0) + Number(remboursement.montantFcfa),
        );
      }
      for (const [distributionId, montantARestaurer] of intrantsParDistribution) {
        const [distribution] = await tx
          .select()
          .from(distributionsIntrantsTable)
          .where(eq(distributionsIntrantsTable.id, distributionId))
          .for("update")
          .limit(1);
        if (!distribution) throw new AnnulationLivraisonError("Une distribution d'intrants liée est introuvable");
        if (!livraison.membreId || distribution.membreId !== livraison.membreId) {
          throw new AnnulationLivraisonError("Annulation impossible : la retenue d'intrants ne correspond pas au producteur de cette livraison");
        }
        distributionsAvant.push(distribution);
        const rembourse = Number(distribution.montantRembourse_fcfa) - montantARestaurer;
        if (rembourse < -0.01) throw new AnnulationLivraisonError("Le remboursement d'intrants ne peut pas être rétabli sans incohérence");
        const montantRembourse = Math.max(0, rembourse);
        const montantDu = Number(distribution.montantMembreFcfa);
        await tx.update(distributionsIntrantsTable).set({
          montantRembourse_fcfa: String(montantRembourse),
          statutRemboursement: montantRembourse <= 0
            ? "non_rembourse"
            : montantRembourse >= montantDu - 0.01 ? "rembourse" : "partiel",
        }).where(eq(distributionsIntrantsTable.id, distribution.id));
      }

      const avancesAvant: Array<Pick<
        typeof avancesTable.$inferSelect,
        "id" | "membreId" | "montantRembourse_fcfa" | "soldeRestantFcfa" | "statut" | "dateEcheance"
      >> = [];
      const avanceTotals = new Map<number, number>();
      for (const remboursement of avances) {
        avanceTotals.set(
          remboursement.avanceId,
          (avanceTotals.get(remboursement.avanceId) ?? 0) + remboursement.montantFcfa,
        );
      }
      for (const [avanceId, montant] of avanceTotals) {
        const [avance] = await tx
          .select({
            id: avancesTable.id,
            membreId: avancesTable.membreId,
            montantRembourse_fcfa: avancesTable.montantRembourse_fcfa,
            soldeRestantFcfa: avancesTable.soldeRestantFcfa,
            statut: avancesTable.statut,
            dateEcheance: avancesTable.dateEcheance,
          })
          .from(avancesTable)
          .innerJoin(membresTable, eq(avancesTable.membreId, membresTable.id))
          .where(and(
            eq(avancesTable.id, avanceId),
            eq(membresTable.cooperativeId, cooperativeId),
            livraison.membreId ? eq(avancesTable.membreId, livraison.membreId) : sql`false`,
          ))
          .for("update")
          .limit(1);
        if (!avance) throw new AnnulationLivraisonError("Une avance liée à cette livraison est introuvable");
        if (avance.statut === "annulee" || avance.statut === "cloturee") {
          throw new AnnulationLivraisonError("Annulation impossible : une avance liée a été annulée ou clôturée depuis cette livraison");
        }
        avancesAvant.push(avance);
        const nouveauRembourse = avance.montantRembourse_fcfa - montant;
        const nouveauSolde = avance.soldeRestantFcfa + montant;
        const statut = nouveauSolde <= 0
          ? "rembourse"
          : avance.dateEcheance && avance.dateEcheance < new Date().toISOString().slice(0, 10)
            ? "en_retard"
            : "en_cours";
        await tx.update(avancesTable).set({
          montantRembourse_fcfa: Math.max(0, nouveauRembourse),
          soldeRestantFcfa: nouveauSolde,
          statut,
        }).where(eq(avancesTable.id, avanceId));
      }

      for (const mouvement of mouvementStockInverse) {
        await tx.insert(mouvementsStockTable).values({
          entrepotId: mouvement.entrepotId,
          livraisonId,
          type: "sortie",
          poidsKg: String(mouvement.poidsKg),
          motif: `Annulation livraison #${livraisonId} : ${motif}`,
          agentId: userId,
        });
      }

      const dateCorrection = new Date().toISOString().slice(0, 10);
      for (const ecriture of ecritures) {
        await tx.insert(ecrituresComptablesTable).values({
          cooperativeId,
          dateEcriture: dateCorrection,
          numeroPiece: `ANN-LIV-${livraisonId}`,
          libelle: `Annulation livraison #${livraisonId} — ${motif}`,
          compteDebit: ecriture.compteCredit,
          compteCredit: ecriture.compteDebit,
          montantFcfa: ecriture.montantFcfa,
          source: "livraison",
          sourceId: livraisonId,
          exercice: exerciceCorrection,
          typeEcriture: "annulation",
          ecritureSourceId: ecriture.id,
          tiersId: ecriture.tiersId,
          tiersType: ecriture.tiersType,
          motifCorrection: motif,
          corrigePar: userId,
          corrigeLe: new Date(),
        });
      }

      if (ecrituresEnAttente.length > 0) {
        await tx.update(ecrituresEnAttenteTable)
          .set({
            statut: "rejetee",
            commentaireComptable: `Livraison annulée : ${motif}`,
            traiteLe: new Date(),
            traitePar: userId,
          })
          .where(inArray(ecrituresEnAttenteTable.id, ecrituresEnAttente.map((e) => e.id)));
      }

      if (commissions.length > 0) {
        await tx.update(commissionsDeleguesTable)
          .set({ statut: "annulé", livraisonId: null })
          .where(inArray(commissionsDeleguesTable.id, commissions.map((c) => c.id)));
      }
      if (entrepotMouvements.length > 0) {
        await tx.update(entrepotsMouvementsTable)
          .set({ livraisonId: null })
          .where(inArray(entrepotsMouvementsTable.id, entrepotMouvements.map((m) => m.id)));
      }
      if (cheques.length > 0) {
        await tx.update(chequesEmisTable)
          .set({ livraisonId: null, paiementId: null, paiementLigneId: null })
          .where(inArray(chequesEmisTable.id, cheques.map((c) => c.id)));
      }
      if (avances.length > 0) {
        await tx.delete(remboursementsAvancesMembresTable)
          .where(inArray(remboursementsAvancesMembresTable.id, avances.map((r) => r.id)));
      }
      if (remboursementsIntrants.length > 0) {
        await tx.delete(remboursementsIntrantsTable)
          .where(inArray(remboursementsIntrantsTable.id, remboursementsIntrants.map((r) => r.id)));
      }

      if (session) {
        await tx.update(sessionsPeseeTable)
          .set({
            statut: "annulee",
            livraisonId: null,
            notes: sql`concat_ws(E'\n', ${sessionsPeseeTable.notes}, ${`Livraison #${livraisonId} annulée par décision de gestion. Motif : ${motif}`})`,
          })
          .where(eq(sessionsPeseeTable.id, session.id));
      }

      await tx.insert(auditTrailTable).values({
        cooperativeId,
        userId,
        userNom: (req.user as { nom?: string } | undefined)?.nom ?? null,
        userRole: req.user?.role ?? null,
        userIp: req.socket.remoteAddress ?? null,
        userAgent: req.headers["user-agent"]?.slice(0, 500) ?? null,
        action: "DELETE",
        module: "livraisons",
        entiteType: "livraison_annulee",
        entiteId: livraisonId,
        valeursAvant: {
          livraison,
          session,
          membre: membre ?? null,
          fournisseur: fournisseur ?? null,
          paiements,
          cheques,
          avances,
          remboursementsIntrants,
          avancesAvant,
          distributionsAvant,
          mouvementsStock,
          entrepotMouvements,
          commissions,
          ecritures,
          ecrituresEnAttente,
        },
        valeursApres: { statut: "annulee", motif },
        champsModifies: ["statut", "motif"],
        description: `Livraison #${livraisonId} annulée — ${motif}`,
        campagneId: livraison.campagneId ?? undefined,
      });

      await tx.delete(livraisonsTable)
        .where(and(
          eq(livraisonsTable.id, livraisonId),
          eq(livraisonsTable.cooperativeId, cooperativeId),
        ));
    });

    res.json({ ok: true, id: livraisonId, statut: "annulee" });
  } catch (err) {
    if (err instanceof AnnulationLivraisonError) {
      res.status(err.status).json({ erreur: err.message });
      return;
    }
    req.log.error({ err, livraisonId }, "Erreur annulerLivraison");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
