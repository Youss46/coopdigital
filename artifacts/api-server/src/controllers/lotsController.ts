import { type Request, type Response } from "express";
import {
  db,
  lotsTable,
  lotLivraisonsTable,
  livraisonsTable,
  membresTable,
  ventesExportateursTable,
  exportateursTable,
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
    if (statut) conditions.push(eq(lotsTable.statut, statut as "en_stock" | "vendu" | "transit"));

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
    // Vérifier que les livraisons existent et ne sont pas déjà dans un lot
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

    // Calculer le poids total
    const [poidsRow] = await db
      .select({ total: sql<number>`coalesce(sum(poids_kg::numeric), 0)::float` })
      .from(livraisonsTable)
      .where(inArray(livraisonsTable.id, livraisonIds));

    const poidsTotalKg = String(poidsRow?.total ?? 0);

    // Créer le lot
    const [lot] = await db
      .insert(lotsTable)
      .values({ cooperativeId, poidsTotalKg, entrepot: entrepot ?? null })
      .returning();

    if (!lot) {
      res.status(500).json({ erreur: "Erreur lors de la création du lot" });
      return;
    }

    // Lier les livraisons
    await db
      .insert(lotLivraisonsTable)
      .values(livraisonIds.map((lid) => ({ lotId: lot.id, livraisonId: lid })));

    // Retourner le lot avec compteurs
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
    const [lot] = await db
      .update(lotsTable)
      .set({ statut: parse.data.statut })
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

    res.json({ lot, livraisons, membres, vente: vente ?? null });
  } catch (err) {
    req.log.error({ err }, "Erreur getLotTracabilite");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
