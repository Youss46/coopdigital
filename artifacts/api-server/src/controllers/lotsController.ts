import { type Request, type Response } from "express";
import {
  db,
  lotsTable,
  lotLivraisonsTable,
  livraisonsTable,
  membresTable,
  fournisseursTable,
  ventesExportateursTable,
  exportateursTable,
  parcellesTable,
  entrepotsTable,
} from "@workspace/db";
import { eq, inArray, sql, desc, and, or, isNull, isNotNull } from "drizzle-orm";
import { CreateLotBody, UpdateLotStatutBody } from "@workspace/api-zod";
import { generateLotEudrPdf } from "../services/pdfService";

const livraisonSelect = {
  id: livraisonsTable.id,
  membreId: livraisonsTable.membreId,
  poidsKg: livraisonsTable.poidsKg,
  produitBrutKg: livraisonsTable.produitBrutKg,
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
    if (statut) {
      const statuts = statut.split(",").map(s => s.trim()).filter(Boolean) as ("en_stock" | "vendu" | "transit" | "refoule" | "fusionne")[];
      if (statuts.length === 1) {
        conditions.push(eq(lotsTable.statut, statuts[0]!));
      } else if (statuts.length > 1) {
        conditions.push(inArray(lotsTable.statut, statuts));
      }
    }

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
        nombreSacs: lotsTable.nombreSacs,
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

export async function previewAutoLot(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const body = req.body as { quantiteCibleKg?: number; pourFournisseurs?: boolean };
  const quantiteCibleKg = Number(body.quantiteCibleKg);
  if (!quantiteCibleKg || quantiteCibleKg <= 0) {
    res.status(400).json({ erreur: "quantiteCibleKg doit être un nombre positif" });
    return;
  }
  const pourFournisseurs = body.pourFournisseurs === true;

  try {
    // Livraisons disponibles (non encore dans un lot) pour cette coopérative, triées FIFO
    const disponibles = await db
      .select({ id: livraisonsTable.id, poidsKg: livraisonsTable.poidsKg, produitBrutKg: livraisonsTable.produitBrutKg, nombreSacs: livraisonsTable.nombreSacs })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .leftJoin(lotLivraisonsTable, eq(lotLivraisonsTable.livraisonId, livraisonsTable.id))
      .where(
        and(
          isNull(lotLivraisonsTable.livraisonId),
          pourFournisseurs
            ? and(
                isNotNull(livraisonsTable.fournisseurId),
                eq(fournisseursTable.cooperativeId, cooperativeId),
              )
            : and(
                isNotNull(livraisonsTable.membreId),
                eq(membresTable.cooperativeId, cooperativeId),
              ),
        ),
      )
      .orderBy(livraisonsTable.dateLivraison); // FIFO — les plus anciennes en premier

    // Phase 1 — FIFO strict : n'inclure une livraison que si elle ne fait PAS dépasser la cible
    // On travaille sur le poids brut (produit_brut_kg) = poids entré en stock.
    // Si produit_brut_kg est null (livraison sans pesée brute), on retombe sur poids_kg.
    const selectedIds: number[] = [];
    const candidatesRestantes: Array<{ id: number; poidsKg: string; produitBrutKg: string | null; nombreSacs: number | null }> = [];
    let cumul = 0;
    let totalSacs = 0;

    for (const l of disponibles) {
      const poids = parseFloat(String(l.produitBrutKg ?? l.poidsKg));
      if (cumul + poids <= quantiteCibleKg) {
        selectedIds.push(l.id);
        cumul += poids;
        totalSacs += l.nombreSacs ?? 0;
      } else {
        candidatesRestantes.push(l);
      }
    }

    // Phase 2 — remplissage de l'écart : ajouter des livraisons sautées si leur poids ≤ reste
    let reste = Math.round((quantiteCibleKg - cumul) * 1000) / 1000;
    const nonSelectionnees: Array<{ id: number; poidsKg: string; produitBrutKg: string | null; nombreSacs: number | null }> = [];
    for (const l of candidatesRestantes) {
      if (reste <= 0) {
        nonSelectionnees.push(l);
        continue;
      }
      const poids = parseFloat(String(l.produitBrutKg ?? l.poidsKg));
      if (poids <= reste + 0.001) { // tolérance flottant 1g
        selectedIds.push(l.id);
        cumul += poids;
        totalSacs += l.nombreSacs ?? 0;
        reste = Math.round((quantiteCibleKg - cumul) * 1000) / 1000;
      } else {
        nonSelectionnees.push(l);
      }
    }

    // Phase 3 — fractionnement : si déficit > 0 et des livraisons non sélectionnées existent,
    // proposer de fractionner la plus légère d'entre elles pour combler exactement le reste (poids brut).
    let fractionLivraisonId: number | undefined;
    let fractionPoidsKg: number | undefined;   // portion brut retenue
    let fractionReliquatKg: number | undefined; // reliquat brut

    reste = Math.round((quantiteCibleKg - cumul) * 1000) / 1000;
    if (reste > 0.001 && nonSelectionnees.length > 0) {
      // Choisir la livraison avec le poids brut le plus proche du reste (minimise le reliquat)
      let meilleure = nonSelectionnees[0]!;
      let ecartMin = Math.abs(parseFloat(String(meilleure.produitBrutKg ?? meilleure.poidsKg)) - reste);
      for (const l of nonSelectionnees.slice(1)) {
        const ecart = Math.abs(parseFloat(String(l.produitBrutKg ?? l.poidsKg)) - reste);
        if (ecart < ecartMin) {
          meilleure = l;
          ecartMin = ecart;
        }
      }
      fractionLivraisonId = meilleure.id;
      fractionPoidsKg = Math.round(reste * 100) / 100;
      fractionReliquatKg = Math.round((parseFloat(String(meilleure.produitBrutKg ?? meilleure.poidsKg)) - fractionPoidsKg) * 100) / 100;
      cumul += fractionPoidsKg;
    }

    const deficitKg = Math.max(0, Math.round((quantiteCibleKg - cumul) * 100) / 100);

    res.json({
      livraisonIds: selectedIds,
      poidsTotalKg: Math.round(cumul * 100) / 100,
      nbLivraisons: selectedIds.length,
      nbDisponibles: disponibles.length,   // total avant filtrage
      deficitKg,
      nombreSacsTotal: totalSacs,
      fractionLivraisonId,
      fractionPoidsKg,
      fractionReliquatKg,
    });
  } catch (err) {
    req.log.error({ err }, "Erreur previewAutoLot");
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

  const { livraisonIds: livraisonIdsRaw, entrepot, nombreSacs, quantiteCibleKg, fractionLivraisonId, fractionPoidsKg } = parse.data;

  // IDs finaux à inclure dans le lot (pourra être augmenté d'un ID de fraction créée)
  let livraisonIds = [...livraisonIdsRaw];

  try {
    // ── Fractionnement ─────────────────────────────────────────────────────────
    // Si une livraison doit être scindée pour atteindre exactement la cible :
    // 1. Récupérer la livraison originale
    // 2. Créer une nouvelle livraison (portion pour le lot) avec poidsKg = fractionPoidsKg
    // 3. Réduire la livraison originale (reliquat) à poidsKg = originalPoids - fractionPoidsKg
    // 4. Ajouter l'ID de la nouvelle livraison à livraisonIds
    if (fractionLivraisonId != null && fractionPoidsKg != null && fractionPoidsKg > 0) {
      const [original] = await db
        .select()
        .from(livraisonsTable)
        .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
        .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
        .where(
          and(
            eq(livraisonsTable.id, fractionLivraisonId),
            or(
              eq(membresTable.cooperativeId, cooperativeId),
              eq(fournisseursTable.cooperativeId, cooperativeId),
            ),
          ),
        );

      if (!original) {
        res.status(403).json({ erreur: "La livraison à fractionner n'appartient pas à votre coopérative" });
        return;
      }

      const liv = original.livraisons;
      // Le fractionnement se base sur le poids BRUT (= poids entré en stock)
      const originalPoidsBrut = parseFloat(String(liv.produitBrutKg ?? liv.poidsKg));
      const originalPoidsNet  = parseFloat(liv.poidsKg);
      const reliquatBrut = Math.round((originalPoidsBrut - fractionPoidsKg) * 100) / 100;

      if (reliquatBrut <= 0) {
        res.status(400).json({ erreur: "fractionPoidsKg doit être inférieur au poids brut de la livraison originale" });
        return;
      }

      // Vérifier que la livraison originale n'est pas déjà dans un lot
      const [dejaFraction] = await db
        .select({ livraisonId: lotLivraisonsTable.livraisonId })
        .from(lotLivraisonsTable)
        .where(eq(lotLivraisonsTable.livraisonId, fractionLivraisonId));

      if (dejaFraction) {
        res.status(400).json({ erreur: `La livraison ${fractionLivraisonId} est déjà dans un lot` });
        return;
      }

      // Répartition proportionnelle des sacs (sur base brut)
      const originalSacs = liv.nombreSacs ?? 0;
      const sacsFraction = originalSacs > 0
        ? Math.floor(originalSacs * fractionPoidsKg / originalPoidsBrut)
        : null;
      const sacsReliquat = originalSacs > 0 && sacsFraction != null
        ? originalSacs - sacsFraction
        : null;

      // Poids nets proportionnels au brut
      const poidsNetFraction  = Math.round(originalPoidsNet * fractionPoidsKg / originalPoidsBrut * 100) / 100;
      const poidsNetReliquat  = Math.round(originalPoidsNet * reliquatBrut / originalPoidsBrut * 100) / 100;

      await db.transaction(async (tx) => {
        // Créer la livraison fractionnée (portion pour ce lot)
        const [nouvelleLiv] = await tx
          .insert(livraisonsTable)
          .values({
            membreId: liv.membreId,
            fournisseurId: liv.fournisseurId,
            campagneId: liv.campagneId,
            produit: liv.produit ?? "cacao",
            produitBrutKg: String(fractionPoidsKg),
            poidsKg: String(poidsNetFraction),
            nombreSacs: sacsFraction,
            prixUnitaireFcfa: liv.prixUnitaireFcfa,
            montantBrutFcfa: Math.round(liv.montantBrutFcfa * fractionPoidsKg / originalPoidsBrut),
            avanceDeduiteFcfa: 0,
            intrantsDeduitsFcfa: 0,
            montantNetFcfa: Math.round(liv.montantNetFcfa * fractionPoidsKg / originalPoidsBrut),
            dateLivraison: liv.dateLivraison,
            agentId: liv.agentId,
            sectionLivraison: liv.sectionLivraison,
            typeFournisseur: liv.typeFournisseur,
            statutPaiement: liv.statutPaiement ?? "PAYÉ",
          })
          .returning({ id: livraisonsTable.id });

        if (!nouvelleLiv) throw new Error("Échec création livraison fractionnée");

        // Réduire la livraison originale au reliquat (brut + net proportionnel)
        await tx
          .update(livraisonsTable)
          .set({
            produitBrutKg: String(reliquatBrut),
            poidsKg: String(poidsNetReliquat),
            nombreSacs: sacsReliquat,
            montantBrutFcfa: Math.round(liv.montantBrutFcfa * reliquatBrut / originalPoidsBrut),
            montantNetFcfa: Math.round(liv.montantNetFcfa * reliquatBrut / originalPoidsBrut),
          })
          .where(eq(livraisonsTable.id, fractionLivraisonId));

        livraisonIds = [...livraisonIds, nouvelleLiv.id];
      });
    }

    // ── Vérifications standard ─────────────────────────────────────────────────
    // Vérifier que toutes les livraisons appartiennent à cette coopérative
    // (membres OU fournisseurs externes) — on utilise Drizzle type-safe au lieu
    // de sql`ANY()` qui ne sérialise pas les tableaux JS correctement avec pg.
    const livraisonsVerif = await db
      .select({ id: livraisonsTable.id })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
      .leftJoin(fournisseursTable, eq(livraisonsTable.fournisseurId, fournisseursTable.id))
      .where(
        and(
          inArray(livraisonsTable.id, livraisonIds),
          or(
            eq(membresTable.cooperativeId, cooperativeId),
            eq(fournisseursTable.cooperativeId, cooperativeId),
          ),
        ),
      );

    if (livraisonsVerif.length !== livraisonIds.length) {
      res.status(403).json({ erreur: "Une ou plusieurs livraisons n'appartiennent pas à votre coopérative" });
      return;
    }

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

    // Somme sur le poids BRUT (produit_brut_kg) — c'est ce qui entre en stock.
    // COALESCE : si produit_brut_kg est null (ancienne livraison sans pesée brute), on retombe sur poids_kg.
    const [poidsRow] = await db
      .select({ total: sql<number>`coalesce(sum(coalesce(produit_brut_kg, poids_kg)::numeric), 0)::float` })
      .from(livraisonsTable)
      .where(inArray(livraisonsTable.id, livraisonIds));

    const poidsTotalKg = String(poidsRow?.total ?? 0);

    // Garde quantité cible — refuser si le total brut dépasse la cible demandée
    if (quantiteCibleKg && (poidsRow?.total ?? 0) > quantiteCibleKg + 0.001) {
      res.status(400).json({
        erreur: `Le poids brut total des livraisons sélectionnées (${poidsRow?.total?.toFixed(1)} kg) dépasse la quantité cible (${quantiteCibleKg} kg)`,
      });
      return;
    }

    // Auto-détecter l'entrepôt coopératif si non fourni
    let entrepotFinal = entrepot ?? null;
    if (!entrepotFinal) {
      const [premierEntrepot] = await db
        .select({ nom: entrepotsTable.nom })
        .from(entrepotsTable)
        .where(and(eq(entrepotsTable.cooperativeId, cooperativeId), eq(entrepotsTable.pourFournisseursExt, false)))
        .orderBy(entrepotsTable.id)
        .limit(1);
      entrepotFinal = premierEntrepot?.nom ?? null;
    }

    // Auto-calculer le nombre de sacs si non fourni (somme des livraisons)
    let nombreSacsFinal = nombreSacs ?? null;
    if (nombreSacsFinal === null || nombreSacsFinal === undefined) {
      const [sacsRow] = await db
        .select({ total: sql<number>`coalesce(sum(nombre_sacs), 0)::int` })
        .from(livraisonsTable)
        .where(inArray(livraisonsTable.id, livraisonIds));
      const totalSacs = sacsRow?.total ?? 0;
      if (totalSacs > 0) nombreSacsFinal = totalSacs;
    }

    const [lot] = await db
      .insert(lotsTable)
      .values({ cooperativeId, poidsTotalKg, entrepot: entrepotFinal, nombreSacs: nombreSacsFinal ?? null })
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
        nombreSacs: lotsTable.nombreSacs,
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
        nombreSacs: lotsTable.nombreSacs,
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
          nombreSacs: lotsTable.nombreSacs,
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
        nombreSacs: lotsTable.nombreSacs,
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
    const membreIds = [...new Set(livraisons.map((l) => l.membreId))].filter(
      (mid): mid is number => mid != null,
    );
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
            superficieCalculeeHa: parcellesTable.superficieCalculeeHa,
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

export async function getLotEudrPdf(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }
  const id = parseInt(String(req.params["id"] ?? "0"));
  if (!id) {
    res.status(400).json({ erreur: "ID lot invalide" });
    return;
  }
  try {
    const buf = await generateLotEudrPdf(id, cooperativeId);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="lot-${id}-eudr.pdf"`,
      "Content-Length": String(buf.length),
    });
    res.send(buf);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erreur interne";
    if (msg === "Lot introuvable") {
      res.status(404).json({ erreur: msg });
    } else {
      req.log.error({ err }, "Erreur getLotEudrPdf");
      res.status(500).json({ erreur: "Erreur interne du serveur" });
    }
  }
}
