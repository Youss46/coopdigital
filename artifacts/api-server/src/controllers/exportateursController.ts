import { type Request, type Response } from "express";
import { db, exportateursTable, ventesExportateursTable, traitementsRefusTable, lotsTable, campagnesTable } from "@workspace/db";
import { eq, sql, desc, and, lte } from "drizzle-orm";
import { CreateExportateurBody, CreateVenteBody, EncaisserVenteBody } from "@workspace/api-zod";
import { generateEcrituresVente, generateEcrituresEncaissement } from "../services/comptabiliteService";

const venteSelect = {
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
    const { exportateurId, lotId, poidsKg, prixUnitaireFcfa, dateVente, dateEcheanceReglement } = parse.data;

    const [exp] = await db.select({ id: exportateursTable.id }).from(exportateursTable)
      .where(and(eq(exportateursTable.id, exportateurId), eq(exportateursTable.cooperativeId, cooperativeId))).limit(1);
    if (!exp) { res.status(403).json({ erreur: "Exportateur introuvable ou non autorisé" }); return; }
    const montantTotalFcfa = Math.round(poidsKg * prixUnitaireFcfa);

    // Rattacher à la campagne active de la coopérative
    const [campagneActive] = await db
      .select({ id: campagnesTable.id })
      .from(campagnesTable)
      .where(and(eq(campagnesTable.cooperativeId, cooperativeId), eq(campagnesTable.statut, "ouverte")))
      .orderBy(desc(campagnesTable.dateOuverture))
      .limit(1);

    const [vente] = await db
      .insert(ventesExportateursTable)
      .values({
        exportateurId,
        lotId: lotId ?? null,
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

    const [detail] = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(eq(ventesExportateursTable.id, vente!.id));

    void generateEcrituresVente(cooperativeId, {
      venteId: vente!.id,
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

    const montantEncaisse = vente.montantRecuFcfa + parse.data.montantFcfa;
    const solde = vente.montantTotalFcfa - montantEncaisse;

    let statut: "en_attente" | "partiel" | "regle" | "en_retard" = "partiel";
    if (solde <= 0) {
      statut = "regle";
    } else if (
      vente.dateEcheanceReglement &&
      new Date(vente.dateEcheanceReglement) < new Date()
    ) {
      statut = "en_retard";
    }

    const [updated] = await db
      .update(ventesExportateursTable)
      .set({
        montantRecuFcfa: montantEncaisse,
        soldeDuFcfa: Math.max(0, solde),
        statut,
      })
      .where(eq(ventesExportateursTable.id, id))
      .returning();

    const [detail] = await db
      .select(venteSelect)
      .from(ventesExportateursTable)
      .leftJoin(exportateursTable, eq(exportateursTable.id, ventesExportateursTable.exportateurId))
      .where(eq(ventesExportateursTable.id, updated!.id));

    void generateEcrituresEncaissement(cooperativeId, {
      venteId: id,
      exportateurNom: detail?.exportateurNom ?? `exp-${id}`,
      montantFcfa: parse.data.montantFcfa,
      date: new Date().toISOString().split("T")[0]!,
    });

    res.json(detail);
  } catch (err) {
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
