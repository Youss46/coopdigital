import { type Request, type Response } from "express";
import { db, livraisonsTable, avancesTable, paiementsTable, membresTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { CreateLivraisonBody } from "@workspace/api-zod";

export async function listLivraisons(req: Request, res: Response): Promise<void> {
  try {
    const membreId = req.query["membre_id"] ? parseInt(String(req.query["membre_id"])) : undefined;
    const limit = Math.min(100, parseInt(String(req.query["limit"] ?? "20")));

    const where = membreId ? eq(livraisonsTable.membreId, membreId) : undefined;

    const livraisons = await db
      .select({
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
      })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(livraisonsTable.membreId, membresTable.id))
      .where(where)
      .orderBy(desc(livraisonsTable.dateLivraison))
      .limit(limit);

    res.json(livraisons);
  } catch (err) {
    req.log.error({ err }, "Erreur listLivraisons");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createLivraison(req: Request, res: Response): Promise<void> {
  const parse = CreateLivraisonBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  const { membreId, poidsKg, prixUnitaireFcfa, dateLivraison, modePaiement } = parse.data;

  try {
    const [membre] = await db.select().from(membresTable).where(eq(membresTable.id, membreId)).limit(1);
    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }

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
      const montantNet = montantBrut - avanceDeduite;
      const dateStr = dateLivraison ?? new Date().toISOString().split("T")[0]!;

      // Créer la livraison
      const [livraison] = await tx
        .insert(livraisonsTable)
        .values({
          membreId,
          poidsKg: String(poidsKg),
          prixUnitaireFcfa,
          montantBrutFcfa: montantBrut,
          avanceDeduiteFcfa: avanceDeduite,
          montantNetFcfa: montantNet,
          dateLivraison: dateStr,
          agentId: req.user?.id ?? null,
        })
        .returning();

      // Créer le paiement
      const [paiement] = await tx
        .insert(paiementsTable)
        .values({
          livraisonId: livraison!.id,
          membreId,
          montantFcfa: montantNet,
          modePaiement: (modePaiement as "orange_money" | "mtn_momo" | "especes") ?? "especes",
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

      return {
        livraison: { ...livraison!, membreNom: membre.nom, membrePrenoms: membre.prenoms },
        paiement,
        avanceMiseAJour: avanceMaj,
      };
    });

    res.status(201).json(result);
  } catch (err) {
    req.log.error({ err }, "Erreur createLivraison");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
