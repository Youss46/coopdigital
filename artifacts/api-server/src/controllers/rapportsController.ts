import { type Request, type Response } from "express";
import {
  generateFicheMembre,
  generateRapportMensuel,
  generateBilanCampagne,
  generateRecuLivraison,
  generateRecuPaiement,
  generateBulletinPaie,
  generateBordereauPesee,
  generateRecuAvance,
  generateRecuIntrant,
  generateEtatPartsSociales,
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
  try {
    const buffer = await generateRapportMensuel(1, mois, annee);
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
    req.log.error({ err }, "Erreur getCampaignBilan");
    res.status(500).json({ erreur: "Erreur génération PDF" });
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
