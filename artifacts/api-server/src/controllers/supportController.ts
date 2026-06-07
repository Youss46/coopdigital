import type { Request, Response } from "express";
import {
  creerTicket,
  mesTickets,
  detailTicket,
  ajouterMessage,
  fermerTicket,
  tousLesTickets,
  prendreEnCharge,
  marquerResolu,
  getFaq,
} from "../services/supportService.js";

class TenantError extends Error {
  readonly status = 401;
  readonly erreur = "Coopérative non associée au compte";
  constructor() { super("TENANT_REQUIRED"); }
}

const coopId = (req: import("express").Request): number => {
  const id = req.user?.cooperativeId;
  if (!id) throw new TenantError();
  return id;
};

// ─── FAQ ──────────────────────────────────────────────────────────────────────

export async function getFaqHandler(_req: Request, res: Response) {
  return res.json(getFaq());
}

// ─── Créer ticket ─────────────────────────────────────────────────────────────

export async function creerTicketHandler(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Non authentifié" });

    const { titre, description, categorie, priorite, moduleConcerne, captureEcranUrl } =
      req.body as Record<string, unknown>;

    if (!titre || !description) {
      return res.status(400).json({ error: "titre et description requis" });
    }

    const ticket = await creerTicket({
      cooperativeId:   coopId(req),
      ouvertPar:       userId,
      titre:           String(titre),
      description:     String(description),
      categorie:       categorie  ? String(categorie)  : undefined,
      priorite:        priorite   ? String(priorite)   : undefined,
      moduleConcerne:  moduleConcerne  ? String(moduleConcerne)  : undefined,
      captureEcranUrl: captureEcranUrl ? String(captureEcranUrl) : undefined,
    });

    return res.status(201).json(ticket);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "creerTicket");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Mes tickets ──────────────────────────────────────────────────────────────

export async function mesTicketsHandler(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Non authentifié" });
    const tickets = await mesTickets(coopId(req), userId);
    return res.json(tickets);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "mesTickets");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Détail ticket ────────────────────────────────────────────────────────────

export async function detailTicketHandler(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    const userRole = req.user?.role ?? "";
    if (!userId) return res.status(401).json({ error: "Non authentifié" });
    const id = Number(req.params.id);
    const ticket = await detailTicket(id, coopId(req));
    if (!ticket) return res.status(404).json({ error: "Ticket introuvable" });
    if (!["pca","directeur","comptable"].includes(userRole) && ticket.ouvertPar !== userId) {
      return res.status(403).json({ error: "Accès refusé" });
    }
    return res.json(ticket);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "detailTicket");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Ajouter message ──────────────────────────────────────────────────────────

export async function ajouterMessageHandler(req: Request, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Non authentifié" });
    const id = Number(req.params.id);
    const { contenu, pieceJointeUrl } = req.body as Record<string, unknown>;
    if (!contenu) return res.status(400).json({ error: "contenu requis" });

    const msg = await ajouterMessage({
      ticketId:       id,
      cooperativeId:  coopId(req),
      auteurType:     "client",
      auteurId:       userId,
      auteurNom:      `Utilisateur #${userId}`,
      contenu:        String(contenu),
      pieceJointeUrl: pieceJointeUrl ? String(pieceJointeUrl) : undefined,
    });
    return res.status(201).json(msg);
  } catch (err: unknown) {
    req.log.error({ err }, "ajouterMessage");
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    if (msg.includes("Ticket") || msg.includes("fermé")) return res.status(400).json({ error: msg });
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── Fermer ticket ────────────────────────────────────────────────────────────

export async function fermerTicketHandler(req: Request, res: Response) {
  try {
    if (!req.user?.id) return res.status(401).json({ error: "Non authentifié" });
    const id = Number(req.params.id);
    const { satisfaction } = req.body as Record<string, unknown>;
    const ticket = await fermerTicket({
      ticketId:     id,
      cooperativeId: coopId(req),
      satisfaction: satisfaction ? Number(satisfaction) : undefined,
    });
    if (!ticket) return res.status(404).json({ error: "Ticket introuvable" });
    return res.json(ticket);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "fermerTicket");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── M15 — Tous les tickets ───────────────────────────────────────────────────

export async function tousLesTicketsM15Handler(req: Request, res: Response) {
  try {
    const priorite     = typeof req.query.priorite     === "string" ? req.query.priorite     : undefined;
    const statut       = typeof req.query.statut       === "string" ? req.query.statut       : undefined;
    const cooperativeId = typeof req.query.cooperative_id === "string" ? Number(req.query.cooperative_id) : undefined;
    const tickets = await tousLesTickets({ priorite, statut, cooperativeId });
    return res.json(tickets);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "tousLesTicketsM15");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── M15 — Détail ticket ─────────────────────────────────────────────────────

export async function detailTicketM15Handler(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const ticket = await detailTicket(id);
    if (!ticket) return res.status(404).json({ error: "Ticket introuvable" });
    return res.json(ticket);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "detailTicketM15");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── M15 — Répondre ──────────────────────────────────────────────────────────

export async function repondreM15Handler(req: Request, res: Response) {
  try {
    const user = (req as unknown as Record<string, unknown>).m15User as { nom: string; id: number };
    const id = Number(req.params.id);
    const { contenu, pieceJointeUrl } = req.body as Record<string, unknown>;
    if (!contenu) return res.status(400).json({ error: "contenu requis" });

    const msg = await ajouterMessage({
      ticketId:       id,
      auteurType:     "m15tech",
      auteurId:       user.id,
      auteurNom:      `M15 Tech — ${user.nom}`,
      contenu:        String(contenu),
      pieceJointeUrl: pieceJointeUrl ? String(pieceJointeUrl) : undefined,
    });
    return res.status(201).json(msg);
  } catch (err: unknown) {
    req.log.error({ err }, "repondreM15");
    const msg = err instanceof Error ? err.message : "Erreur serveur";
    if (msg.includes("Ticket") || msg.includes("fermé")) return res.status(400).json({ error: msg });
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── M15 — Prendre en charge ──────────────────────────────────────────────────

export async function prendreEnChargeHandler(req: Request, res: Response) {
  try {
    const user = (req as unknown as Record<string, unknown>).m15User as { nom: string };
    const id = Number(req.params.id);
    const ticket = await prendreEnCharge(id, user.nom);
    if (!ticket) return res.status(404).json({ error: "Ticket introuvable" });
    return res.json(ticket);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "prendreEnCharge");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}

// ─── M15 — Marquer résolu ─────────────────────────────────────────────────────

export async function marquerResoluHandler(req: Request, res: Response) {
  try {
    const id = Number(req.params.id);
    const ticket = await marquerResolu(id);
    if (!ticket) return res.status(404).json({ error: "Ticket introuvable" });
    return res.json(ticket);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "marquerResolu");
    return res.status(500).json({ error: "Erreur serveur" });
  }
}
