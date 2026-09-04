import { type Request, type Response } from "express";
import { db, exportateursTable, ventesExportateursTable, traitementsRefusTable, lotsTable, campagnesTable, expeditionsTable, expeditionLotsTable, paiementsTable, paiementLignesTable } from "@workspace/db";
import { eq, sql, desc, and, lte, inArray } from "drizzle-orm";
import { CreateExportateurBody, CreateVenteBody, EncaisserVenteBody } from "@workspace/api-zod";
import { generateEcrituresVente, generateEcrituresEncaissement, generateEcrituresEncaissementDansTransaction } from "../services/comptabiliteService";
import { calculerPoidsDisponibleVente } from "../services/venteReceptionService";
import { creerChequeRecuDansTransaction } from "../services/chequesRecusService.js";

const venteSelect = {
  id: ventesExportateursTable.id,
  exportateurId: ventesExportateursTable.exportateurId,
  exportateurNom: exportateursTable.nom,
  lotId: ventesExportateursTable.lotId,
  expeditionId: ventesExportateursTable.expeditionId,
  poidsKg: ventesExportateursTable.poidsKg,
  prixUnitaireFcfa: ventesExportateursTable.prixUnitaireFcfa,
  montantTotalFcfa: ventesExportateursTable.montantTotalFcfa,
  dateVente: ventesExportateursTable.dateVente,
  dateEcheanceReglement: ventesExportateursTable.dateEcheanceReglement,
  montantRecuFcfa: ventesExportateursTable.montantRecuFcfa,
  soldeDuFcfa: ventesExportateursTable.soldeDuFcfa,
  statut: ventesExportateursTable.statut,
  createdAt: ventesExportateursTable.createdAt,
};

export async function listExportateurs(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const rows = await db
      .select({
        id: exportateursTable.id,
        cooperativeId: exportateursTable.cooperativeId,
        nom: exportateursTable.nom,
        contact: exportateursTable.contact,
        ville: exportateursTable.ville,
        agrementNumero: exportateursTable.agrementNumero,
        createdAt: exportateursTable.createdAt,
        soldeTotalDuFcfa: sql<number>`coalesce(sum(${ventesExportateursTable.soldeDuFcfa}), 0)::int`,
      })
      .from(exportateursTable)
      .leftJoin(
        ventesExportateursTable,
        and(
          eq(ventesExportateursTable.exportateurId, exportateursTable.id),
          sql`${ventesExportateursTable.statut} != 'regle'`
        )
      )
      .where(eq(exportateursTable.cooperativeId, cooperativeId))
      .groupBy(exportateursTable.id)
      .orderBy(exportateursTable.nom);

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur listExportateurs");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createExportateur(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const parse = CreateExportateurBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const [exp] = await db
      .insert(exportateursTable)
      .values({ ...parse.data, cooperativeId })
      .returning();

    res.status(201).json({ ...exp, soldeTotalDuFcfa: 0 });
  } catch (err) {
    req.log.error({ err }, "Erreur createExportateur");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getExportateurById(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const id = parseInt(String(req.params["id"] ?? "0"));
  try {
    const [exp] = await db
      .select({
        id: exportateursTable.id,
        cooperativeId: exportateursTable.cooperativeId,
        nom: exportateursTable.nom,
        contact: exportateursTable.contact,
        ville: exportateursTable.ville,
        agrementNumero: exportateursTable.agrementNumero,
        createdAt: exportateursTable.createdAt,
        soldeTotalDuFcfa: sql<number>`coalesce(sum(${ventesExportateursTable.soldeDuFcfa}), 0)::int`,
      })
      .from(exportateursTable)
      .leftJoin(
        ventesExportateursTable,
        and(
          eq(ventesExportateursTable.exportateurId, exportateursTable.id),
          sql`${ventesExportateursTable.statut} != 'regle'`
        )
      )
      .where(and(eq(exportateursTable.id, id), eq(exportateursTable.cooperativeId, cooperativeId)))
      .groupBy(exportateursTable.id);

    if (!exp) {
      res.status(404).json({ erreur: "Exportateur non trouvé" });
      return;
    }

    const ventes = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(eq(ventesExportateursTable.exportateurId, id))
      .orderBy(desc(ventesExportateursTable.dateVente));

    res.json({ exportateur: exp, ventes, soldeTotalDuFcfa: exp.soldeTotalDuFcfa });
  } catch (err) {
    req.log.error({ err }, "Erreur getExportateurById");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function listVentes(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const exportateurId = req.query["exportateur_id"] ? parseInt(String(req.query["exportateur_id"])) : undefined;
    const statut = req.query["statut"] as string | undefined;

    const conditions: ReturnType<typeof eq>[] = [eq(exportateursTable.cooperativeId, cooperativeId)];
    if (exportateurId) conditions.push(eq(ventesExportateursTable.exportateurId, exportateurId));
    if (statut)
      conditions.push(
        eq(ventesExportateursTable.statut, statut as "en_attente" | "partiel" | "regle" | "en_retard")
      );

    const rows = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(and(...conditions))
      .orderBy(desc(ventesExportateursTable.dateVente));

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur listVentes");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function listStocksReceptionnes(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const expeditions = await db
      .select({
        expeditionId: expeditionsTable.id,
        numeroExpedition: expeditionsTable.numeroExpedition,
        port: expeditionsTable.port,
        dateReception: expeditionsTable.dateArriveePort,
        poidsRecuPortKg: expeditionsTable.poidsRecuPortKg,
        poidsAcceptePortKg: expeditionsTable.poidsAcceptePortKg,
      })
      .from(expeditionsTable)
      .where(and(
        eq(expeditionsTable.cooperativeId, cooperativeId),
        eq(expeditionsTable.statut, "receptionne"),
      ))
      .orderBy(desc(expeditionsTable.dateArriveePort));

    if (expeditions.length === 0) {
      res.json([]);
      return;
    }

    const expeditionIds = expeditions.map((expedition) => expedition.expeditionId);
    const [soldRows, lotRows] = await Promise.all([
      db
        .select({
          expeditionId: ventesExportateursTable.expeditionId,
          poidsVenduKg: sql<number>`coalesce(sum(${ventesExportateursTable.poidsKg}), 0)::float8`,
        })
        .from(ventesExportateursTable)
        .where(inArray(ventesExportateursTable.expeditionId, expeditionIds))
        .groupBy(ventesExportateursTable.expeditionId),
      db
        .select({
          expeditionId: expeditionLotsTable.expeditionId,
          lotId: expeditionLotsTable.lotId,
          poidsKg: expeditionLotsTable.poidsKg,
        })
        .from(expeditionLotsTable)
        .where(inArray(expeditionLotsTable.expeditionId, expeditionIds)),
    ]);

    const soldByExpedition = new Map(
      soldRows.map((row) => [row.expeditionId, Number(row.poidsVenduKg ?? 0)]),
    );
    const lotsByExpedition = new Map<number, Array<{ lotId: number; poidsKg: number }>>();
    for (const row of lotRows) {
      if (row.lotId == null) continue;
      const lots = lotsByExpedition.get(row.expeditionId) ?? [];
      lots.push({ lotId: row.lotId, poidsKg: Number(row.poidsKg ?? 0) });
      lotsByExpedition.set(row.expeditionId, lots);
    }

    const result = expeditions.flatMap((expedition) => {
      const accepte = Number(expedition.poidsAcceptePortKg ?? 0);
      const vendu = soldByExpedition.get(expedition.expeditionId) ?? 0;
      const disponible = Math.max(0, Math.round((accepte - vendu) * 100) / 100);
      if (accepte <= 0 || disponible <= 0) return [];
      return [{
        expeditionId: expedition.expeditionId,
        numeroExpedition: expedition.numeroExpedition,
        port: expedition.port,
        dateReception: expedition.dateReception?.toISOString() ?? "",
        poidsRecuPortKg: Number(expedition.poidsRecuPortKg ?? 0),
        poidsAcceptePortKg: accepte,
        poidsVenduKg: Math.round(vendu * 100) / 100,
          poidsDisponibleKg: calculerPoidsDisponibleVente(accepte, vendu),
        lots: lotsByExpedition.get(expedition.expeditionId) ?? [],
      }];
    });

    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur listStocksReceptionnes");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createVente(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const parse = CreateVenteBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const { exportateurId, lotId, expeditionId, poidsKg, prixUnitaireFcfa, dateVente, dateEcheanceReglement } = parse.data;
    const nombreSacs = typeof req.body.nombreSacs === "number" && req.body.nombreSacs > 0 ? req.body.nombreSacs as number : undefined;

    const [exp] = await db.select({ id: exportateursTable.id }).from(exportateursTable)
      .where(and(eq(exportateursTable.id, exportateurId), eq(exportateursTable.cooperativeId, cooperativeId))).limit(1);
    if (!exp) { res.status(403).json({ erreur: "Exportateur introuvable ou non autorisé" }); return; }
    if (!Number.isFinite(poidsKg) || poidsKg <= 0) {
      res.status(400).json({ erreur: "Le poids vendu doit être strictement positif" });
      return;
    }
    const montantTotalFcfa = Math.round(poidsKg * prixUnitaireFcfa);

    // Rattacher à la campagne active de la coopérative
    const [campagneActive] = await db
      .select({ id: campagnesTable.id })
      .from(campagnesTable)
      .where(and(eq(campagnesTable.cooperativeId, cooperativeId), eq(campagnesTable.statut, "ouverte")))
      .orderBy(desc(campagnesTable.dateOuverture))
      .limit(1);

    let resolvedLotId = lotId ?? null;
    if (expeditionId != null) {
      const [expedition] = await db
        .select({
          id: expeditionsTable.id,
          statut: expeditionsTable.statut,
          cooperativeId: expeditionsTable.cooperativeId,
          exportateurId: expeditionsTable.exportateurId,
          poidsAcceptePortKg: expeditionsTable.poidsAcceptePortKg,
        })
        .from(expeditionsTable)
        .where(and(eq(expeditionsTable.id, expeditionId), eq(expeditionsTable.cooperativeId, cooperativeId)))
        .limit(1);

      if (!expedition) {
        res.status(404).json({ erreur: "Expédition introuvable ou non autorisée" });
        return;
      }
      if (expedition.statut !== "receptionne") {
        res.status(409).json({ erreur: "Une expédition en litige ou non réceptionnée n'est pas vendable" });
        return;
      }
      if (expedition.exportateurId != null && expedition.exportateurId !== exportateurId) {
        res.status(400).json({ erreur: "L'exportateur ne correspond pas à celui de l'expédition" });
        return;
      }

      const expeditionLotRows = await db
        .select({ lotId: expeditionLotsTable.lotId })
        .from(expeditionLotsTable)
        .where(eq(expeditionLotsTable.expeditionId, expeditionId));
      const lotIds = expeditionLotRows.flatMap((row) => row.lotId == null ? [] : [row.lotId]);
      if (resolvedLotId != null && !lotIds.includes(resolvedLotId)) {
        res.status(400).json({ erreur: "Le lot ne fait pas partie de cette expédition" });
        return;
      }
      if (resolvedLotId == null && lotIds.length === 1) resolvedLotId = lotIds[0]!;

      const available = await db.transaction(async (tx) => {
        const [lockedExpedition] = await tx
          .select({ poidsAcceptePortKg: expeditionsTable.poidsAcceptePortKg, statut: expeditionsTable.statut })
          .from(expeditionsTable)
          .where(and(eq(expeditionsTable.id, expeditionId), eq(expeditionsTable.cooperativeId, cooperativeId)))
          .for("update")
          .limit(1);
        if (!lockedExpedition || lockedExpedition.statut !== "receptionne") return null;
        const [sold] = await tx
          .select({ poidsVenduKg: sql<number>`coalesce(sum(${ventesExportateursTable.poidsKg}), 0)::float8` })
          .from(ventesExportateursTable)
          .where(eq(ventesExportateursTable.expeditionId, expeditionId));
        const accepted = Number(lockedExpedition.poidsAcceptePortKg ?? 0);
        const alreadySold = Number(sold?.poidsVenduKg ?? 0);
        const remaining = Math.round((accepted - alreadySold) * 100) / 100;
        if (poidsKg > remaining + 0.001) return { created: undefined, remaining };
        const [created] = await tx
          .insert(ventesExportateursTable)
          .values({
            exportateurId,
            lotId: resolvedLotId,
            expeditionId,
            campagneId: campagneActive?.id ?? null,
            poidsKg: String(poidsKg),
            prixUnitaireFcfa,
            montantTotalFcfa,
            dateVente,
            dateEcheanceReglement: dateEcheanceReglement ?? null,
            montantRecuFcfa: 0,
            soldeDuFcfa: montantTotalFcfa,
            statut: "en_attente",
          })
          .returning();
        return { created, remaining };
      });

      if (!available) {
        res.status(409).json({ erreur: "L'expédition n'est plus disponible à la vente" });
        return;
      }
      if (!available.created) {
        res.status(409).json({
          erreur: `Quantité acceptée disponible insuffisante (${Math.max(0, available.remaining).toFixed(2)} kg)`,
        });
        return;
      }
      const vente = available.created;

      const [detail] = await db
        .select(venteSelect)
        .from(ventesExportateursTable)
        .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
        .where(eq(ventesExportateursTable.id, vente.id));
      void generateEcrituresVente(cooperativeId, {
        venteId: vente.id,
        exportateurId,
        exportateurNom: detail?.exportateurNom ?? `exp-${exportateurId}`,
        montantFcfa: montantTotalFcfa,
        dateVente,
      });
      res.status(201).json(detail);
      return;
    }

    const [vente] = await db
      .insert(ventesExportateursTable)
      .values({
        exportateurId,
        lotId: lotId ?? null,
        expeditionId: null,
        campagneId: campagneActive?.id ?? null,
        poidsKg: String(poidsKg),
        prixUnitaireFcfa,
        montantTotalFcfa,
        dateVente,
        dateEcheanceReglement: dateEcheanceReglement ?? null,
        montantRecuFcfa: 0,
        soldeDuFcfa: montantTotalFcfa,
        statut: "en_attente",
      })
      .returning();

    // Marquer le lot comme "vendu" et lier la vente (+ nb sacs si fourni)
    if (lotId) {
      await db
        .update(lotsTable)
        .set({ statut: "vendu", venteExportateurId: vente!.id, ...(nombreSacs !== undefined ? { nombreSacs } : {}) })
        .where(and(eq(lotsTable.id, lotId), eq(lotsTable.cooperativeId, cooperativeId)));
    }

    const [detail] = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(eq(ventesExportateursTable.id, vente!.id));

    void generateEcrituresVente(cooperativeId, {
      venteId: vente!.id,
      exportateurId,
      exportateurNom: detail?.exportateurNom ?? `exp-${exportateurId}`,
      montantFcfa: montantTotalFcfa,
      dateVente,
    });

    res.status(201).json(detail);
  } catch (err) {
    req.log.error({ err }, "Erreur createVente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function encaisserVente(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const id = parseInt(String(req.params["id"] ?? "0"));
  const parse = EncaisserVenteBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    const [current] = await db
      .select()
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(and(eq(ventesExportateursTable.id, id), eq(exportateursTable.cooperativeId, cooperativeId)));

    if (!current) {
      res.status(404).json({ erreur: "Vente non trouvée" });
      return;
    }

    const vente = current.ventes_exportateurs;
    const body = parse.data;
    const lignes = body.ventilations ?? [{
      modePaiement: body.modePaiement ?? null,
      montantFcfa: body.montantFcfa,
      numeroCheque: body.numeroCheque ?? null,
      banque: body.banque ?? null,
      dateEcheanceCheque: body.dateEcheanceCheque ?? null,
    }];
    if (body.ventilations && body.modePaiement) {
      res.status(400).json({ erreur: "Utilisez soit modePaiement, soit ventilations, pas les deux." });
      return;
    }
    const modeLegacy = !body.modePaiement && !body.ventilations;
    const modes = lignes.map((ligne) => ligne.modePaiement);
    if (!modeLegacy && lignes.some((ligne) => ligne.modePaiement !== "especes" && ligne.modePaiement !== "cheque")) {
      res.status(400).json({ erreur: "Le mode de règlement doit être espèces ou chèque." });
      return;
    }
    const montantVentile = lignes.reduce((sum, ligne) => sum + Number(ligne.montantFcfa), 0);
    if (montantVentile !== body.montantFcfa) {
      res.status(400).json({ erreur: "Le total des moyens de paiement doit être égal au montant encaissé." });
      return;
    }
    const chequeLignes = lignes.filter((ligne) => ligne.modePaiement === "cheque");
    for (const ligne of chequeLignes) {
      if (!ligne.numeroCheque?.trim() || !ligne.banque?.trim()) {
        res.status(400).json({ erreur: "Le numéro et la banque sont obligatoires pour chaque chèque reçu." });
        return;
      }
    }
    const userId = req.user?.id ?? null;
    const dateOperation = body.dateEncaissement ?? new Date().toISOString().split("T")[0]!;

    const transactionResult = await db.transaction(async (tx) => {
      const [locked] = await tx
        .select()
        .from(ventesExportateursTable)
        .where(eq(ventesExportateursTable.id, id))
        .for("update")
        .limit(1);
      if (!locked) throw new Error("Vente non trouvée");
      const resteAvant = locked.soldeDuFcfa;
      if (body.montantFcfa > resteAvant) {
        throw new Error(`Le montant dépasse le solde de la vente (${resteAvant.toLocaleString("fr-FR")} FCFA).`);
      }

      let paiementId: number | null = null;
      let paiementLigneIds: number[] = [];
      if (!modeLegacy) {
        const modeUnique = lignes.length === 1 ? lignes[0]?.modePaiement : null;
        const [paiement] = await tx.insert(paiementsTable).values({
          cooperativeId,
          libelle: `Encaissement vente exportateur #${id}`,
          modeReglement: modeUnique ?? "mixte",
          montantAPayerFcfa: String(body.montantFcfa),
          montantVerseFcfa: String(body.montantFcfa),
          resteAPayerFcfa: "0",
          montantFcfa: body.montantFcfa,
          modePaiement: modeUnique === "especes" || modeUnique === "cheque" ? modeUnique : null,
          statut: chequeLignes.length > 0 ? "confirme" : "effectue",
          validePar: userId,
          dateValidation: new Date(),
          agentSaisiseurId: userId,
        }).returning({ id: paiementsTable.id });
        paiementId = paiement?.id ?? null;
        if (!paiementId) throw new Error("Le règlement de la vente n'a pas pu être créé");
        const insertedLines = await tx.insert(paiementLignesTable).values(lignes.map((ligne) => ({
          paiementId: paiementId!,
          modePaiement: ligne.modePaiement as "especes" | "cheque",
          montantFcfa: Number(ligne.montantFcfa),
          numeroCheque: ligne.numeroCheque ?? null,
          banque: ligne.banque ?? null,
          dateEcheance: ligne.dateEcheanceCheque ?? null,
        }))).returning({ id: paiementLignesTable.id });
        paiementLigneIds = insertedLines.map((ligne) => ligne.id);
      }

      const montantEncaisse = locked.montantRecuFcfa + body.montantFcfa;
      const solde = locked.montantTotalFcfa - montantEncaisse;
      let statut: "en_attente" | "partiel" | "regle" | "en_retard" = "partiel";
      if (solde <= 0) statut = "regle";
      else if (locked.dateEcheanceReglement && new Date(locked.dateEcheanceReglement) < new Date()) statut = "en_retard";

      const [updated] = await tx.update(ventesExportateursTable).set({
        montantRecuFcfa: montantEncaisse,
        soldeDuFcfa: Math.max(0, solde),
        statut,
      }).where(eq(ventesExportateursTable.id, id)).returning();
      if (!updated) throw new Error("La vente n'a pas pu être mise à jour");

      if (modeLegacy) {
        await generateEcrituresEncaissementDansTransaction(tx, cooperativeId, {
          venteId: id,
          exportateurId: vente.exportateurId,
          exportateurNom: current.exportateurs?.nom ?? `exp-${vente.exportateurId}`,
          montantFcfa: body.montantFcfa,
          date: dateOperation,
          compteDebit: "521",
        });
      } else {
        for (const [index, ligne] of lignes.entries()) {
          await generateEcrituresEncaissementDansTransaction(tx, cooperativeId, {
            venteId: id,
            exportateurId: vente.exportateurId,
            exportateurNom: current.exportateurs?.nom ?? `exp-${vente.exportateurId}`,
            montantFcfa: Number(ligne.montantFcfa),
            date: dateOperation,
            compteDebit: ligne.modePaiement === "cheque" ? "511" : "571",
            libelle: `${ligne.modePaiement === "cheque" ? "Chèque reçu" : "Espèces"} — vente exportateur ${current.exportateurs?.nom ?? vente.exportateurId}`,
          });
          if (ligne.modePaiement === "cheque") {
            await creerChequeRecuDansTransaction(tx, {
              cooperativeId,
              numeroCheque: ligne.numeroCheque!.trim(),
              banque: ligne.banque!.trim(),
              montantFcfa: Number(ligne.montantFcfa),
              dateReception: dateOperation,
              dateEcheance: ligne.dateEcheanceCheque ?? null,
              venteExportateurId: id,
              exportateurId: vente.exportateurId,
              paiementId: paiementId!,
              paiementLigneId: paiementLigneIds[index]!,
              createdBy: userId ?? 0,
            });
          }
        }
      }
      return updated;
    });

    const [detail] = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(eq(ventesExportateursTable.id, transactionResult.id));

    res.json(detail);
  } catch (err) {
    const msg = (err as Error).message;
    if (msg === "Vente non trouvée") { res.status(404).json({ erreur: msg }); return; }
    if (msg.startsWith("Le montant dépasse") || msg.includes("numéro") || msg.includes("duplicate key")) {
      res.status(409).json({ erreur: msg.includes("duplicate key") ? "Ce numéro de chèque existe déjà pour cette coopérative." : msg });
      return;
    }
    req.log.error({ err }, "Erreur encaisserVente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getCreances(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const aujourd_hui = new Date().toISOString().split("T")[0]!;
    const dansUneSemaine = new Date();
    dansUneSemaine.setDate(dansUneSemaine.getDate() + 7);
    const semaineFin = dansUneSemaine.toISOString().split("T")[0]!;

    const ventes = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(and(sql`${ventesExportateursTable.statut} != 'regle'`, eq(exportateursTable.cooperativeId, cooperativeId)))
      .orderBy(ventesExportateursTable.dateEcheanceReglement);

    const totalDuFcfa = ventes.reduce((s, v) => s + v.soldeDuFcfa, 0);
    const enRetardFcfa = ventes
      .filter(
        (v) => v.dateEcheanceReglement && v.dateEcheanceReglement < aujourd_hui
      )
      .reduce((s, v) => s + v.soldeDuFcfa, 0);
    const aEchoirSemaineFcfa = ventes
      .filter(
        (v) =>
          v.dateEcheanceReglement &&
          v.dateEcheanceReglement >= aujourd_hui &&
          v.dateEcheanceReglement <= semaineFin
      )
      .reduce((s, v) => s + v.soldeDuFcfa, 0);

    res.json({ totalDuFcfa, enRetardFcfa, aEchoirSemaineFcfa, ventes });
  } catch (err) {
    req.log.error({ err }, "Erreur getCreances");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// POST /ventes/:id/refus — Signaler un lot refoulé
export async function signalerRefus(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const venteId = parseInt(String(req.params["id"] ?? "0"));
  if (isNaN(venteId) || venteId <= 0) {
    res.status(400).json({ erreur: "ID de vente invalide" });
    return;
  }

  const { poidsRefuleKg, nombreSacsRefoules, dateRefus, motifRefus, entrepotRetourId } =
    req.body as {
      poidsRefuleKg?: number;
      nombreSacsRefoules?: number;
      dateRefus?: string;
      motifRefus?: string;
      entrepotRetourId?: number;
    };

  if (!poidsRefuleKg || !nombreSacsRefoules || !dateRefus || !entrepotRetourId) {
    res.status(400).json({ erreur: "poidsRefuleKg, nombreSacsRefoules, dateRefus et entrepotRetourId sont requis" });
    return;
  }

  try {
    // Récupérer la vente avec ses détails (et vérifier qu'elle appartient à la coop)
    const [vente] = await db
      .select({
        id: ventesExportateursTable.id,
        poidsKg: ventesExportateursTable.poidsKg,
        prixUnitaireFcfa: ventesExportateursTable.prixUnitaireFcfa,
        soldeDuFcfa: ventesExportateursTable.soldeDuFcfa,
        statut: ventesExportateursTable.statut,
      })
      .from(ventesExportateursTable)
      .innerJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(
        and(
          eq(ventesExportateursTable.id, venteId),
          eq(exportateursTable.cooperativeId, cooperativeId),
        )
      )
      .limit(1);

    if (!vente) {
      res.status(404).json({ erreur: "Vente introuvable" });
      return;
    }

    if (vente.statut === "regle") {
      res.status(400).json({ erreur: "Impossible de signaler un refus sur une vente réglée" });
      return;
    }

    // Calcul : refus total ou partiel ?
    const poidsVenteKg = parseFloat(String(vente.poidsKg));
    const poidsRefouleNum = parseFloat(String(poidsRefuleKg));
    const estRefusTotal = poidsRefouleNum >= poidsVenteKg;

    const montantAnnuleFcfa = Math.round(poidsRefouleNum * vente.prixUnitaireFcfa);
    const nouveauSoldeDuFcfa = estRefusTotal ? 0 : Math.max(0, vente.soldeDuFcfa - montantAnnuleFcfa);
    const nouveauStatut = estRefusTotal ? "refoule" : "partiellement_refoule";

    let refus!: typeof traitementsRefusTable.$inferSelect;

    await db.transaction(async (tx) => {
      // 1. Créer le refus
      const [r] = await tx
        .insert(traitementsRefusTable)
        .values({
          cooperativeId,
          venteExportateurId: venteId,
          poidsRefuleKg: String(poidsRefouleNum),
          nombreSacsRefoules,
          dateRefus,
          motifRefus: motifRefus ?? null,
          entrepotRetourId,
          statut: "en_attente",
        })
        .returning();
      refus = r!;

      // 2. Mettre à jour le statut et le solde de la vente
      const [venteUpdated] = await tx
        .update(ventesExportateursTable)
        .set({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          statut: nouveauStatut as any,
          soldeDuFcfa: nouveauSoldeDuFcfa,
          nombreSacsRefoules: sql`COALESCE(nombre_sacs_refoules, 0) + ${nombreSacsRefoules}`,
          poidsRefuleKg: sql`COALESCE(poids_refoule_kg::numeric, 0) + ${poidsRefouleNum}`,
        })
        .where(eq(ventesExportateursTable.id, venteId))
        .returning({ lotId: ventesExportateursTable.lotId });

      // 2b. Propager le statut REFOULÉ au lot lié (si applicable)
      if (venteUpdated?.lotId) {
        await tx
          .update(lotsTable)
          .set({ statut: "refoule" })
          .where(eq(lotsTable.id, venteUpdated.lotId));
      }

      // NOTE : le stock entrepôt N'est PAS touché ici.
      // L'entrepotRetourId est stocké dans traitements_refus pour pré-remplir
      // le modal de traitement. Le mouvement de stock sera créé uniquement
      // dans traiterRefus() si la décision est 'retour_stock'.
    });

    res.status(201).json({ refus, vente: null });
  } catch (err) {
    req.log.error({ err }, "Erreur signalerRefus");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
