import { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import {
  authentifierMembre,
  checkRateLimit,
  resetRateLimit,
  getProfilMembre,
  getLivraisonsMembre,
  getAvancesMembre,
  getIntrantsMembre,
  getPartsSocialesMembre,
  getScoreMembre,
  generateRecuLivraison,
  generateCarteMembre,
} from "../services/portailService";

// ─── POST /portail/connexion ──────────────────────────────────────────────────

export async function connexionPortail(req: Request, res: Response): Promise<void> {
  const { code_membre, telephone } = req.body as { code_membre?: string; telephone?: string };

  if (!code_membre || !telephone) {
    res.status(400).json({ erreur: "code_membre et telephone sont requis" });
    return;
  }

  const rl = checkRateLimit(telephone);
  if (!rl.allowed) {
    res.status(429).json({
      erreur: "Trop de tentatives. Réessayez dans un moment.",
      retryAfterSeconds: rl.retryAfter,
    });
    return;
  }

  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    req.log.error("JWT_SECRET non configuré");
    res.status(500).json({ erreur: "Erreur serveur" });
    return;
  }

  try {
    const membre = await authentifierMembre(code_membre, telephone);
    resetRateLimit(telephone);

    const token = jwt.sign(
      { membreId: membre.id, cooperativeId: membre.cooperativeId, role: "portail_membre" },
      secret,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      membre: {
        id: membre.id,
        nom: membre.nom,
        prenoms: membre.prenoms,
        telephone: membre.telephone,
        statut: membre.statut,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur d'authentification";
    res.status(401).json({ erreur: msg });
  }
}

// ─── GET /portail/profil ──────────────────────────────────────────────────────

export async function getProfilHandler(req: Request, res: Response): Promise<void> {
  try {
    const profil = await getProfilMembre(req.membre!.membreId);
    res.json(profil);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur";
    res.status(404).json({ erreur: msg });
  }
}

// ─── GET /portail/livraisons ──────────────────────────────────────────────────

export async function getLivraisonsHandler(req: Request, res: Response): Promise<void> {
  try {
    const livraisons = await getLivraisonsMembre(req.membre!.membreId);
    res.json(livraisons);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur";
    res.status(500).json({ erreur: msg });
  }
}

// ─── GET /portail/avances ─────────────────────────────────────────────────────

export async function getAvancesHandler(req: Request, res: Response): Promise<void> {
  try {
    const avances = await getAvancesMembre(req.membre!.membreId);
    res.json(avances);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur";
    res.status(500).json({ erreur: msg });
  }
}

// ─── GET /portail/intrants ────────────────────────────────────────────────────

export async function getIntrantsHandler(req: Request, res: Response): Promise<void> {
  try {
    const intrants = await getIntrantsMembre(req.membre!.membreId);
    res.json(intrants);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur";
    res.status(500).json({ erreur: msg });
  }
}

// ─── GET /portail/parts-sociales ──────────────────────────────────────────────

export async function getPartsSocialesHandler(req: Request, res: Response): Promise<void> {
  try {
    const parts = await getPartsSocialesMembre(req.membre!.membreId);
    res.json(parts);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur";
    res.status(500).json({ erreur: msg });
  }
}

// ─── GET /portail/score ───────────────────────────────────────────────────────

export async function getScoreHandler(req: Request, res: Response): Promise<void> {
  try {
    const score = await getScoreMembre(req.membre!.membreId);
    res.json(score);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur";
    res.status(500).json({ erreur: msg });
  }
}

// ─── GET /portail/recus/:livraison_id ────────────────────────────────────────

export async function getRecuLivraisonHandler(req: Request, res: Response): Promise<void> {
  const livraisonId = parseInt(String(req.params["livraison_id"] ?? ""), 10);
  if (isNaN(livraisonId)) {
    res.status(400).json({ erreur: "ID livraison invalide" });
    return;
  }
  try {
    const pdf = await generateRecuLivraison(req.membre!.membreId, livraisonId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="recu-livraison-${livraisonId}.pdf"`);
    res.send(pdf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur";
    res.status(404).json({ erreur: msg });
  }
}

// ─── GET /portail/carte-membre ───────────────────────────────────────────────

export async function getCarteMembreHandler(req: Request, res: Response): Promise<void> {
  try {
    const pdf = await generateCarteMembre(req.membre!.membreId);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="carte-membre.pdf"`);
    res.send(pdf);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Erreur";
    res.status(500).json({ erreur: msg });
  }
}
