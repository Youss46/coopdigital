import { type Request, type Response } from "express";
import { db, campagnesTable, usersTable, livraisonsTable, membresTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import {
  generateFicheMembre,
  generateRapportMensuel,
  generateBilanCampagne,
  generateBilanOHADA,
  generateCompteResultatOHADA,
  generateFluxTresoreiriePdf,
  generateRecuLivraison,
  generateRecuPaiement,
  generateBulletinPaie,
  generateBordereauPesee,
  generateRecuAvance,
  generateRecuIntrant,
  generateEtatPartsSociales,
  generateReleveCommissions,
} from "../services/pdfService";

function sendPdf(res: Response, buffer: Buffer, filename: string): void {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Content-Length", String(buffer.length));
  res.end(buffer);
}

export async function getMemberPdf(req: Request, res: Response): Promise<void> {
  const membreId = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!membreId) { res.status(400).json({ erreur: "ID membre invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  try {
    const buffer = await generateFicheMembre(membreId, cooperativeId);
    sendPdf(res, buffer, `fiche_membre_${membreId}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getMemberPdf");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getMonthlyReport(req: Request, res: Response): Promise<void> {
  const mois = parseInt(String(req.params["mois"] ?? "0"));
  const annee = parseInt(String(req.params["an"] ?? "0"));
  if (!mois || mois < 1 || mois > 12 || !annee) {
    res.status(400).json({ erreur: "Mois ou année invalide" }); return;
  }
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
  try {
    const buffer = await generateRapportMensuel(cooperativeId, mois, annee);
    const moisStr = String(mois).padStart(2, "0");
    sendPdf(res, buffer, `rapport_mensuel_${annee}_${moisStr}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getMonthlyReport");
    res.status(500).json({ erreur: "Erreur génération PDF" });
  }
}

export async function getCampaignBilan(req: Request, res: Response): Promise<void> {
  const annee = parseInt(String(req.params["annee"] ?? "0"));
  if (!annee) { res.status(400).json({ erreur: "Année invalide" }); return; }

  const anneeEnCours = new Date().getFullYear();
  if (annee >= anneeEnCours) {
    res.status(422).json({
      erreur: `La campagne ${annee} n'est pas encore clôturée. Le bilan annuel ne peut être généré qu'après la clôture de l'exercice.`,
      code: "CAMPAGNE_NON_CLOTUREE",
    });
    return;
  }

  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  try {
    const buffer = await generateBilanCampagne(cooperativeId, annee);
    sendPdf(res, buffer, `bilan_campagne_${annee}.pdf`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    req.log.error({ err, msg, stack }, "Erreur getCampaignBilan");
    res.status(500).json({ erreur: "Erreur génération PDF", detail: msg });
  }
}

// ─── Nouveaux reçus ───────────────────────────────────────────────────────────

export async function getRecuLivraison(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID livraison invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateRecuLivraison(id, cooperativeId);
    sendPdf(res, buffer, `recu_livraison_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getRecuLivraison");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getTerrainRecuLivraison(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const agent = req.agent;
  const cooperativeId = agent?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID livraison invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  // For peseur: verify ownership using the same join/fields as getPeseurCollectes history.
  // Must check agentId (the field used when a peseur records a delivery) and scope to
  // the agent's cooperative via membresTable (livraisons has no direct cooperativeId column).
  if (agent?.role === "peseur") {
    const [livraison] = await db
      .select({ agentId: livraisonsTable.agentId })
      .from(livraisonsTable)
      .leftJoin(membresTable, eq(membresTable.id, livraisonsTable.membreId))
      .where(
        and(
          eq(livraisonsTable.id, id),
          eq(membresTable.cooperativeId, cooperativeId),
        ),
      )
      .limit(1);
    if (!livraison) { res.status(404).json({ erreur: "Livraison introuvable" }); return; }
    if (livraison.agentId !== agent.id) {
      res.status(403).json({ erreur: "Accès non autorisé à cette livraison" }); return;
    }
  }

  try {
    const buffer = await generateRecuLivraison(id, cooperativeId);
    sendPdf(res, buffer, `recu_livraison_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getTerrainRecuLivraison");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getRecuPaiement(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID paiement invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateRecuPaiement(id, cooperativeId);
    sendPdf(res, buffer, `recu_paiement_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getRecuPaiement");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getBulletinPaie(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID bulletin invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateBulletinPaie(id, cooperativeId);
    sendPdf(res, buffer, `bulletin_paie_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getBulletinPaie");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getBordereauPesee(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID livraison invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateBordereauPesee(id, cooperativeId);
    sendPdf(res, buffer, `bordereau_pesee_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getBordereauPesee");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getRecuAvance(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID avance invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateRecuAvance(id, cooperativeId);
    sendPdf(res, buffer, `recu_avance_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getRecuAvance");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getRecuIntrant(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID distribution invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateRecuIntrant(id, cooperativeId);
    sendPdf(res, buffer, `recu_intrant_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getRecuIntrant");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getEtatPartsSociales(req: Request, res: Response): Promise<void> {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const cooperativeId = req.user?.cooperativeId;
  if (!id) { res.status(400).json({ erreur: "ID membre invalide" }); return; }
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateEtatPartsSociales(id, cooperativeId);
    sendPdf(res, buffer, `parts_sociales_${id}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getEtatPartsSociales");
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message });
    } else {
      res.status(500).json({ erreur: "Erreur génération PDF" });
    }
  }
}

export async function getBilanOHADAPdf(req: Request, res: Response): Promise<void> {
  const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : new Date().getFullYear();
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateBilanOHADA(cooperativeId, exercice);
    sendPdf(res, buffer, `bilan_ohada_${exercice}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getBilanOHADAPdf");
    res.status(500).json({ erreur: "Erreur génération PDF bilan" });
  }
}

export async function getCompteResultatOHADAPdf(req: Request, res: Response): Promise<void> {
  const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : new Date().getFullYear();
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateCompteResultatOHADA(cooperativeId, exercice);
    sendPdf(res, buffer, `compte_resultat_ohada_${exercice}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getCompteResultatOHADAPdf");
    res.status(500).json({ erreur: "Erreur génération PDF compte de résultat" });
  }
}

export async function getFluxTresoreiriePdf(req: Request, res: Response): Promise<void> {
  const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : new Date().getFullYear();
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const buffer = await generateFluxTresoreiriePdf(cooperativeId, exercice);
    sendPdf(res, buffer, `flux_tresorerie_${exercice}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getFluxTresoreiriePdf");
    res.status(500).json({ erreur: "Erreur génération PDF flux de trésorerie" });
  }
}

export async function getAdminReleveCommissions(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  const delegueId = parseInt(String(req.params["agentId"] ?? "0"));
  if (!delegueId) { res.status(400).json({ erreur: "ID délégué invalide" }); return; }

  // Vérifier que le délégué appartient à la coopérative du responsable
  const [delegue] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(and(eq(usersTable.id, delegueId), eq(usersTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!delegue) { res.status(404).json({ erreur: "Délégué introuvable ou non autorisé" }); return; }

  let campagneId: number | undefined;
  if (req.query.campagneId !== undefined) {
    const parsed = Number(req.query.campagneId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ erreur: "campagneId doit être un entier positif" });
      return;
    }
    const [campagne] = await db
      .select({ id: campagnesTable.id })
      .from(campagnesTable)
      .where(and(eq(campagnesTable.id, parsed), eq(campagnesTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (!campagne) { res.status(404).json({ erreur: "Campagne introuvable ou non autorisée" }); return; }
    campagneId = parsed;
  }

  try {
    const buffer = await generateReleveCommissions(delegueId, cooperativeId, campagneId);
    const suffix = campagneId ? `_campagne_${campagneId}` : "_toutes";
    sendPdf(res, buffer, `releve_commissions_delegue_${delegueId}${suffix}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getAdminReleveCommissions");
    res.status(500).json({ erreur: "Erreur génération PDF relevé commissions" });
  }
}

export async function getTerrainReleveCommissions(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.agent?.cooperativeId;
  const delegueId = req.agent?.id;
  if (!cooperativeId || !delegueId) {
    res.status(401).json({ erreur: "Non autorisé" });
    return;
  }
  let campagneId: number | undefined;
  if (req.query.campagneId !== undefined) {
    const parsed = Number(req.query.campagneId);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      res.status(400).json({ erreur: "campagneId doit être un entier positif" });
      return;
    }
    // Vérifier que la campagne existe et appartient à la coopérative de l'agent
    const [campagne] = await db
      .select({ id: campagnesTable.id })
      .from(campagnesTable)
      .where(and(eq(campagnesTable.id, parsed), eq(campagnesTable.cooperativeId, cooperativeId)))
      .limit(1);
    if (!campagne) {
      res.status(404).json({ erreur: "Campagne introuvable ou non autorisée" });
      return;
    }
    campagneId = parsed;
  }
  try {
    const buffer = await generateReleveCommissions(delegueId, cooperativeId, campagneId);
    const suffix = campagneId ? `_campagne_${campagneId}` : "_toutes";
    sendPdf(res, buffer, `releve_commissions${suffix}.pdf`);
  } catch (err) {
    req.log.error({ err }, "Erreur getTerrainReleveCommissions");
    res.status(500).json({ erreur: "Erreur génération PDF relevé commissions" });
  }
}
