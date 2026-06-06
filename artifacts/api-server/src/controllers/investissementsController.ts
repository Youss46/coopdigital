import type { Request, Response } from "express";
import {
  listProjets,
  getProjet,
  createProjet,
  updateProjet,
  deleteProjet,
  ajouterDepense,
  getTableauBord,
} from "../services/investissementService.js";

// ─── Tableau de bord ──────────────────────────────────────────────────────────

export async function tableauBord(req: Request, res: Response) {
  try {
    const data = await getTableauBord();
    return res.json(data);
  } catch (err) {
    req.log.error({ err }, "tableauBord investissements");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Liste projets ────────────────────────────────────────────────────────────

export async function listeProjets(req: Request, res: Response) {
  try {
    const statut    = typeof req.query.statut    === "string" ? req.query.statut    : undefined;
    const categorie = typeof req.query.categorie === "string" ? req.query.categorie : undefined;
    const projets = await listProjets(statut, categorie);
    return res.json(projets);
  } catch (err) {
    req.log.error({ err }, "listeProjets");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Détail projet ────────────────────────────────────────────────────────────

export async function detailProjet(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const projet = await getProjet(id);
    if (!projet) return res.status(404).json({ error: "Projet introuvable" });
    return res.json(projet);
  } catch (err) {
    req.log.error({ err }, "detailProjet");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Créer projet ─────────────────────────────────────────────────────────────

export async function creerProjet(req: Request, res: Response) {
  try {
    const {
      titre, description, categorie, montantEstimeFcfa, sourceFinancement,
      empruntId, subventionId, dateDebutPrevue, dateFinPrevue,
      statut, priorite, responsableId,
    } = req.body as Record<string, unknown>;

    if (!titre || !montantEstimeFcfa) {
      return res.status(400).json({ error: "titre et montantEstimeFcfa requis" });
    }

    const projet = await createProjet({
      titre:             String(titre),
      description:       description ? String(description) : undefined,
      categorie:         categorie ? String(categorie) : "autre",
      montantEstimeFcfa: Number(montantEstimeFcfa),
      sourceFinancement: sourceFinancement ? String(sourceFinancement) : "fonds_propres",
      empruntId:         empruntId    ? Number(empruntId)    : undefined,
      subventionId:      subventionId ? Number(subventionId) : undefined,
      dateDebutPrevue:   dateDebutPrevue ? String(dateDebutPrevue) : undefined,
      dateFinPrevue:     dateFinPrevue   ? String(dateFinPrevue)   : undefined,
      statut:            statut    ? String(statut)    : undefined,
      priorite:          priorite  ? String(priorite)  : undefined,
      responsableId:     responsableId ? Number(responsableId) : undefined,
    });

    return res.status(201).json(projet);
  } catch (err) {
    req.log.error({ err }, "creerProjet");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Modifier projet ──────────────────────────────────────────────────────────

export async function modifierProjet(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const body = req.body as Record<string, unknown>;

    const updated = await updateProjet(id, {
      titre:             body.titre             ? String(body.titre)             : undefined,
      description:       body.description !== undefined ? String(body.description ?? "") : undefined,
      categorie:         body.categorie         ? String(body.categorie)         : undefined,
      montantEstimeFcfa: body.montantEstimeFcfa ? Number(body.montantEstimeFcfa) : undefined,
      montantEngageFcfa: body.montantEngageFcfa !== undefined ? Number(body.montantEngageFcfa) : undefined,
      sourceFinancement: body.sourceFinancement ? String(body.sourceFinancement) : undefined,
      empruntId:         body.empruntId         ? Number(body.empruntId)         : undefined,
      subventionId:      body.subventionId      ? Number(body.subventionId)      : undefined,
      dateDebutPrevue:   body.dateDebutPrevue   ? String(body.dateDebutPrevue)   : undefined,
      dateFinPrevue:     body.dateFinPrevue     ? String(body.dateFinPrevue)     : undefined,
      dateFinReelle:     body.dateFinReelle     ? String(body.dateFinReelle)     : undefined,
      statut:            body.statut            ? String(body.statut)            : undefined,
      priorite:          body.priorite          ? String(body.priorite)          : undefined,
      responsableId:     body.responsableId     ? Number(body.responsableId)     : undefined,
    });

    if (!updated) return res.status(404).json({ error: "Projet introuvable" });
    return res.json(updated);
  } catch (err) {
    req.log.error({ err }, "modifierProjet");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Supprimer projet ─────────────────────────────────────────────────────────

export async function supprimerProjet(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const ok = await deleteProjet(id);
    if (!ok) return res.status(404).json({ error: "Projet introuvable" });
    return res.status(204).end();
  } catch (err) {
    req.log.error({ err }, "supprimerProjet");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Ajouter dépense ──────────────────────────────────────────────────────────

export async function ajouterDepenseCtrl(req: Request, res: Response) {
  try {
    const projetId = Number(req.params.id);
    const {
      dateDepense, libelle, montantFcfa,
      fournisseur, referenceFacture, factureUrl, equipementId,
    } = req.body as Record<string, unknown>;

    if (!dateDepense || !libelle || !montantFcfa) {
      return res.status(400).json({ error: "dateDepense, libelle et montantFcfa requis" });
    }

    const depense = await ajouterDepense({
      projetId,
      dateDepense:      String(dateDepense),
      libelle:          String(libelle),
      montantFcfa:      Number(montantFcfa),
      fournisseur:      fournisseur      ? String(fournisseur)      : undefined,
      referenceFacture: referenceFacture ? String(referenceFacture) : undefined,
      factureUrl:       factureUrl       ? String(factureUrl)       : undefined,
      equipementId:     equipementId     ? Number(equipementId)     : undefined,
    });

    return res.status(201).json(depense);
  } catch (err: unknown) {
    req.log.error({ err }, "ajouterDepense");
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    if (msg.includes("Projet introuvable") || msg.includes("Impossible")) {
      return res.status(400).json({ error: msg });
    }
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
