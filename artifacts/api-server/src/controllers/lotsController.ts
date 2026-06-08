import { type Request, type Response } from "express";
import {
  db,
  lotsTable,
  lotLivraisonsTable,
  livraisonsTable,
  membresTable,
  ventesExportateursTable,
  exportateursTable,
  parcellesTable,
} from "@workspace/db";
import { eq, inArray, sql, desc, and } from "drizzle-orm";
import { CreateLotBody, UpdateLotStatutBody } from "@workspace/api-zod";

const livraisonSelect = {
  id: livraisonsTable.id,
  membreId: livraisonsTable.membreId,
  poidsKg: livraisonsTable.poidsKg,
  prixUnitaireFcfa: livraisonsTable.prixUnitaireFcfa,
  montantBrutFcfa: livraisonsTable.montantBrutFcfa,
  avanceDeduiteFcfa: livraisonsTable.avanceDeduiteFcfa,
  montantNetFcfa: livraisonsTable.montantNetFcfa,
  dateLivraison: livraisonsTable.dateLivraison,
  agentId: livraisonsTable.agentId,
  createdAt: livraisonsTable.createdAt,
  membreNom: membresTable.nom,
  membrePrenoms: membresTable.prenoms,
};

export async function listLots(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  try {
    const statut = req.query["statut"] as string | undefined;

    const conditions: ReturnType<typeof eq>[] = [eq(lotsTable.cooperativeId, cooperativeId)];
    if (statut) conditions.push(eq(lotsTable.statut, statut as "en_stock" | "vendu" | "transit" | "refoule" | "fusionne"));

    const rows = await db
      .select({
        id: lotsTable.id,
        cooperativeId: lotsTable.cooperativeId,
        qrCodeLot: lotsTable.qrCodeLot,
        statut: lotsTable.statut,
        poidsTotalKg: lotsTable.poidsTotalKg,
        dateCreation: lotsTable.dateCreation,
        entrepot: lotsTable.entrepot,
        createdAt: lotsTable.createdAt,
        venteExportateurId: lotsTable.venteExportateurId,
        parentLotIds: lotsTable.parentLotIds,
        nbLivraisons: sql<number>`count(${lotLivraisonsTable.livraisonId})::int`,
        nbProducteurs: sql<number>`count(distinct ${livraisonsTable.membreId})::int`,
      })
      .from(lotsTable)
      .leftJoin(lotLivraisonsTable, eq(lotLivraisonsTable.lotId, lotsTable.id))
      .leftJoin(livraisonsTable, eq(livraisonsTable.id, lotLivraisonsTable.livraisonId))
      .where(and(...conditions))
      .groupBy(lotsTable.id)
      .orderBy(desc(lotsTable.createdAt));

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur listLots");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createLot(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const parse = CreateLotBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  const { livraisonIds, entrepot } = parse.data;

  try {
    const deja = await db
      .select({ livraisonId: lotLivraisonsTable.livraisonId })
      .from(lotLivraisonsTable)
      .where(inArray(lotLivraisonsTable.livraisonId, livraisonIds));

    if (deja.length > 0) {
      res.status(400).json({
        erreur: `Les livraisons ${deja.map((d) => d.livraisonId).join(", ")} sont déjà dans un lot`,
      });
      return;
    }

    const [poidsRow] = await db
      .select({ total: sql<number>`coalesce(sum(poids_kg::numeric), 0)::float` })
      .from(livraisonsTable)
      .where(inArray(livraisonsTable.id, livraisonIds));

    const poidsTotalKg = String(poidsRow?.total ?? 0);

    const [lot] = await db
      .insert(lotsTable)
      .values({ cooperativeId, poidsTotalKg, entrepot: entrepot ?? null })
      .returning();

    if (!lot) {
      res.status(500).json({ erreur: "Erreur lors de la création du lot" });
      return;
    }

    await db
      .insert(lotLivraisonsTable)
      .values(livraisonIds.map((lid) => ({ lotId: lot.id, livraisonId: lid })));

    const [detail] = await db
      .select({
        id: lotsTable.id,
        cooperativeId: lotsTable.cooperativeId,
        qrCodeLot: lotsTable.qrCodeLot,
        statut: lotsTable.statut,
        poidsTotalKg: lotsTable.poidsTotalKg,
        dateCreation: lotsTable.dateCreation,
        entrepot: lotsTable.entrepot,
        createdAt: lotsTable.createdAt,
        venteExportateurId: lotsTable.venteExportateurId,
        parentLotIds: lotsTable.parentLotIds,
        nbLivraisons: sql<number>`count(${lotLivraisonsTable.livraisonId})::int`,
        nbProducteurs: sql<number>`count(distinct ${livraisonsTable.membreId})::int`,
      })
      .from(lotsTable)
      .leftJoin(lotLivraisonsTable, eq(lotLivraisonsTable.lotId, lotsTable.id))
      .leftJoin(livraisonsTable, eq(livraisonsTable.id, lotLivraisonsTable.livraisonId))
      .where(eq(lotsTable.id, lot.id))
      .groupBy(lotsTable.id);

    res.status(201).json(detail);
  } catch (err) {
    req.log.error({ err }, "Erreur createLot");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getLotByQr(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const code = String(req.params["code"] ?? "");
  try {
    const [lot] = await db
      .select({
        id: lotsTable.id,
        cooperativeId: lotsTable.cooperativeId,
        qrCodeLot: lotsTable.qrCodeLot,
        statut: lotsTable.statut,
        poidsTotalKg: lotsTable.poidsTotalKg,
        dateCreation: lotsTable.dateCreation,
        entrepot: lotsTable.entrepot,
        createdAt: lotsTable.createdAt,
        venteExportateurId: lotsTable.venteExportateurId,
        parentLotIds: lotsTable.parentLotIds,
        nbLivraisons: sql<number>`count(${lotLivraisonsTable.livraisonId})::int`,
        nbProducteurs: sql<number>`count(distinct ${livraisonsTable.membreId})::int`,
      })
      .from(lotsTable)
      .leftJoin(lotLivraisonsTable, eq(lotLivraisonsTable.lotId, lotsTable.id))
      .leftJoin(livraisonsTable, eq(livraisonsTable.id, lotLivraisonsTable.livraisonId))
      .where(and(eq(lotsTable.qrCodeLot, code), eq(lotsTable.cooperativeId, cooperativeId)))
      .groupBy(lotsTable.id);

    if (!lot) {
      res.status(404).json({ erreur: "Lot non trouvé" });
      return;
    }
    res.json(lot);
  } catch (err) {
    req.log.error({ err }, "Erreur getLotByQr");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function updateLotStatut(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const id = parseInt(String(req.params["id"] ?? "0"));
  const parse = UpdateLotStatutBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const setData: any = { statut: parse.data.statut };
    if (parse.data.venteExportateurId !== undefined) {
      setData.venteExportateurId = parse.data.venteExportateurId;
    }

    const [lot] = await db
      .update(lotsTable)
      .set(setData)
      .where(and(eq(lotsTable.id, id), eq(lotsTable.cooperativeId, cooperativeId)))
      .returning();

    if (!lot) {
      res.status(404).json({ erreur: "Lot non trouvé" });
      return;
    }
    res.json({ ...lot, nbLivraisons: 0, nbProducteurs: 0 });
  } catch (err) {
    req.log.error({ err }, "Erreur updateLotStatut");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function expedierLot(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const id = parseInt(String(req.params["id"] ?? "0"));
  const { venteExportateurId } = req.body as { venteExportateurId?: number };

  if (!venteExportateurId) {
    res.status(400).json({ erreur: "venteExportateurId est requis" });
    return;
  }

  try {
    // Vérifier que le lot appartient à la coop
    const [lotExist] = await db
      .select({ id: lotsTable.id, statut: lotsTable.statut })
      .from(lotsTable)
      .where(and(eq(lotsTable.id, id), eq(lotsTable.cooperativeId, cooperativeId)));

    if (!lotExist) {
      res.status(404).json({ erreur: "Lot non trouvé" });
      return;
    }

    if (lotExist.statut !== "en_stock") {
      res.status(400).json({ erreur: "Seuls les lots EN STOCK peuvent être expédiés" });
      return;
    }

    // Mettre à jour : statut transit + lier la vente
    const [lot] = await db
      .update(lotsTable)
      .set({ statut: "transit", venteExportateurId })
      .where(eq(lotsTable.id, id))
      .returning();

    if (!lot) {
      res.status(500).json({ erreur: "Erreur lors de la mise à jour" });
      return;
    }

    // Lier aussi la vente exportateur vers ce lot (sens inverse)
    await db
      .update(ventesExportateursTable)
      .set({ lotId: id })
      .where(eq(ventesExportateursTable.id, venteExportateurId));

    res.json({ ...lot, nbLivraisons: 0, nbProducteurs: 0 });
  } catch (err) {
    req.log.error({ err }, "Erreur expedierLot");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function fusionnerLots(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const body = req.body as { lotIds?: unknown; entrepot?: unknown };
  const lotIds = Array.isArray(body.lotIds) ? (body.lotIds as number[]) : null;
  const entrepot = typeof body.entrepot === "string" ? body.entrepot : null;

  if (!lotIds || lotIds.length < 2 || !entrepot) {
    res.status(400).json({ erreur: "lotIds (min 2) et entrepot sont requis" });
    return;
  }

  try {
    // Vérifier que tous les lots existent, appartiennent à la coop et sont EN STOCK
    const lots = await db
      .select({ id: lotsTable.id, statut: lotsTable.statut, poidsTotalKg: lotsTable.poidsTotalKg })
      .from(lotsTable)
      .where(and(inArray(lotsTable.id, lotIds), eq(lotsTable.cooperativeId, cooperativeId)));

    if (lots.length !== lotIds.length) {
      res.status(400).json({ erreur: "Un ou plusieurs lots introuvables" });
      return;
    }

    const nonEnStock = lots.filter((l) => l.statut !== "en_stock");
    if (nonEnStock.length > 0) {
      res.status(400).json({
        erreur: `Seuls les lots EN STOCK peuvent être fusionnés. Lots non conformes : ${nonEnStock.map((l) => l.id).join(", ")}`,
      });
      return;
    }

    // Récupérer toutes les livraisons des lots sources
    const livraisonLinks = await db
      .select({ livraisonId: lotLivraisonsTable.livraisonId })
      .from(lotLivraisonsTable)
      .where(inArray(lotLivraisonsTable.lotId, lotIds));

    const livraisonIds = livraisonLinks.map((l) => l.livraisonId);

    // Calculer le poids total
    const poidsTotal = lots.reduce((sum, l) => sum + parseFloat(String(l.poidsTotalKg)), 0);

    await db.transaction(async (tx) => {
      // 1. Créer le nouveau lot fusionné
      const [nouveauLot] = await tx
        .insert(lotsTable)
        .values({
          cooperativeId,
          poidsTotalKg: String(poidsTotal),
          entrepot,
          parentLotIds: lotIds,
        })
        .returning();

      if (!nouveauLot) throw new Error("Erreur création lot fusionné");

      // 2. Transférer toutes les livraisons vers le nouveau lot
      if (livraisonIds.length > 0) {
        // Supprimer les anciens liens
        await tx
          .delete(lotLivraisonsTable)
          .where(inArray(lotLivraisonsTable.lotId, lotIds));

        // Créer les nouveaux liens
        await tx
          .insert(lotLivraisonsTable)
          .values(livraisonIds.map((lid) => ({ lotId: nouveauLot.id, livraisonId: lid })));
      }

      // 3. Archiver les lots sources avec statut FUSIONNE
      await tx
        .update(lotsTable)
        .set({ statut: "fusionne" })
        .where(inArray(lotsTable.id, lotIds));

      // Retourner le lot créé avec les compteurs
      const [detail] = await tx
        .select({
          id: lotsTable.id,
          cooperativeId: lotsTable.cooperativeId,
          qrCodeLot: lotsTable.qrCodeLot,
          statut: lotsTable.statut,
          poidsTotalKg: lotsTable.poidsTotalKg,
          dateCreation: lotsTable.dateCreation,
          entrepot: lotsTable.entrepot,
          createdAt: lotsTable.createdAt,
          venteExportateurId: lotsTable.venteExportateurId,
          parentLotIds: lotsTable.parentLotIds,
          nbLivraisons: sql<number>`count(${lotLivraisonsTable.livraisonId})::int`,
          nbProducteurs: sql<number>`count(distinct ${livraisonsTable.membreId})::int`,
        })
        .from(lotsTable)
        .leftJoin(lotLivraisonsTable, eq(lotLivraisonsTable.lotId, lotsTable.id))
        .leftJoin(livraisonsTable, eq(livraisonsTable.id, lotLivraisonsTable.livraisonId))
        .where(eq(lotsTable.id, nouveauLot.id))
        .groupBy(lotsTable.id);

      res.status(201).json(detail);
    });
  } catch (err) {
    req.log.error({ err }, "Erreur fusionnerLots");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getLotTracabilite(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const id = parseInt(String(req.params["id"] ?? "0"));
  try {
    const [lot] = await db
      .select({
        id: lotsTable.id,
        cooperativeId: lotsTable.cooperativeId,
        qrCodeLot: lotsTable.qrCodeLot,
        statut: lotsTable.statut,
        poidsTotalKg: lotsTable.poidsTotalKg,
        dateCreation: lotsTable.dateCreation,
        entrepot: lotsTable.entrepot,
        createdAt: lotsTable.createdAt,
        venteExportateurId: lotsTable.venteExportateurId,
        parentLotIds: lotsTable.parentLotIds,
        nbLivraisons: sql<number>`count(${lotLivraisonsTable.livraisonId})::int`,
        nbProducteurs: sql<number>`count(distinct ${livraisonsTable.membreId})::int`,
      })
      .from(lotsTable)
      .leftJoin(lotLivraisonsTable, eq(lotLivraisonsTable.lotId, lotsTable.id))
      .leftJoin(livraisonsTable, eq(livraisonsTable.id, lotLivraisonsTable.livraisonId))
      .where(and(eq(lotsTable.id, id), eq(lotsTable.cooperativeId, cooperativeId)))
      .groupBy(lotsTable.id);

    if (!lot) {
      res.status(404).json({ erreur: "Lot non trouvé" });
      return;
    }

    // Livraisons liées
    const livraisonLinks = await db
      .select({ livraisonId: lotLivraisonsTable.livraisonId })
      .from(lotLivraisonsTable)
      .where(eq(lotLivraisonsTable.lotId, id));

    const livraisonIds = livraisonLinks.map((l) => l.livraisonId);

    const livraisons = livraisonIds.length
      ? await db
          .select(livraisonSelect)
          .from(livraisonsTable)
          .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
          .where(inArray(livraisonsTable.id, livraisonIds))
      : [];

    // Membres uniques
    const membreIds = [...new Set(livraisons.map((l) => l.membreId))];
    const membres = membreIds.length
      ? await db.select().from(membresTable).where(inArray(membresTable.id, membreIds))
      : [];

    // Vente liée si elle existe
    const [vente] = await db
      .select({
        id: ventesExportateursTable.id,
        exportateurId: ventesExportateursTable.exportateurId,
        exportateurNom: exportateursTable.nom,
        lotId: ventesExportateursTable.lotId,
        poidsKg: ventesExportateursTable.poidsKg,
        prixUnitaireFcfa: ventesExportateursTable.prixUnitaireFcfa,
        montantTotalFcfa: ventesExportateursTable.montantTotalFcfa,
        dateVente: ventesExportateursTable.dateVente,
        dateEcheanceReglement: ventesExportateursTable.dateEcheanceReglement,
        montantRecuFcfa: ventesExportateursTable.montantRecuFcfa,
        soldeDuFcfa: ventesExportateursTable.soldeDuFcfa,
        statut: ventesExportateursTable.statut,
        createdAt: ventesExportateursTable.createdAt,
      })
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(eq(ventesExportateursTable.lotId, id));

    // Parcelles GPS des membres pour EUDR
    const parcelles = membreIds.length
      ? await db
          .select({
            id: parcellesTable.id,
            membreId: parcellesTable.membreId,
            membreNom: membresTable.nom,
            membrePrenoms: membresTable.prenoms,
            coordonneesPoint: parcellesTable.coordonneesPoint,
            polygone: parcellesTable.polygone,
            superficieDeclareeHa: parcellesTable.superficieDeclareeHa,
            eudrStatut: parcellesTable.eudrStatut,
            eudrRisqueDeforestation: parcellesTable.eudrRisqueDeforestation,
          })
          .from(parcellesTable)
          .leftJoin(membresTable, eq(membresTable.id, parcellesTable.membreId))
          .where(and(inArray(parcellesTable.membreId, membreIds), eq(parcellesTable.actif, true)))
      : [];

    res.json({ lot, livraisons, membres, vente: vente ?? null, parcelles });
  } catch (err) {
    req.log.error({ err }, "Erreur getLotTracabilite");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
