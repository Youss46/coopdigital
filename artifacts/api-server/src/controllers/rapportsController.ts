import { type Request, type Response } from "express";
import { generateFicheMembre, generateRapportMensuel, generateBilanCampagne } from "../services/pdfService";

export async function getMemberPdf(req: Request, res: Response): Promise<void> {
  const membreId = parseInt(String(req.params["id"] ?? "0"));
  if (!membreId) {
    res.status(400).json({ erreur: "ID membre invalide" });
    return;
  }

  try {
    const buffer = await generateFicheMembre(membreId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="fiche_membre_${membreId}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
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
    res.status(400).json({ erreur: "Mois ou année invalide" });
    return;
  }

  try {
    const buffer = await generateRapportMensuel(1, mois, annee);
    const moisStr = String(mois).padStart(2, "0");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="rapport_mensuel_${annee}_${moisStr}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (err) {
    req.log.error({ err }, "Erreur getMonthlyReport");
    res.status(500).json({ erreur: "Erreur génération PDF" });
  }
}

export async function getCampaignBilan(req: Request, res: Response): Promise<void> {
  const annee = parseInt(String(req.params["annee"] ?? "0"));
  if (!annee) {
    res.status(400).json({ erreur: "Année invalide" });
    return;
  }

  try {
    const buffer = await generateBilanCampagne(1, annee);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="bilan_campagne_${annee}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (err) {
    req.log.error({ err }, "Erreur getCampaignBilan");
    res.status(500).json({ erreur: "Erreur génération PDF" });
  }
}
