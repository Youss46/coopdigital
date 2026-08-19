import { type Request, type Response } from "express";
import {
  listReceptions, createReception, getReception,
  listDistributions, creerDistribution, getDistribution,
  validerDistribution, payerMembre, payerBulk, statsGlobales,
} from "../services/primesService.js";

function coop(req: Request) { return req.user?.cooperativeId ?? null; }
function uid(req: Request)  { return req.user?.id ?? 0; }

// ── Stats ─────────────────────────────────────────────────────────────────────

export async function getStats(req: Request, res: Response): Promise<void> {
  const cooperativeId = coop(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    res.json(await statsGlobales(cooperativeId));
  } catch (err) {
    req.log.error({ err }, "Erreur getStats primes");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Réceptions ────────────────────────────────────────────────────────────────

export async function listRecept(req: Request, res: Response): Promise<void> {
  const cooperativeId = coop(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const campagneId = req.query["campagneId"] ? parseInt(String(req.query["campagneId"])) : undefined;
    res.json(await listReceptions(cooperativeId, campagneId));
  } catch (err) {
    req.log.error({ err }, "Erreur listReceptions");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createRecept(req: Request, res: Response): Promise<void> {
  const cooperativeId = coop(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const rec = await createReception(cooperativeId, req.body, uid(req));
    res.status(201).json(rec);
  } catch (err: unknown) {
    req.log.error({ err }, "Erreur createReception");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function getRecept(req: Request, res: Response): Promise<void> {
  const cooperativeId = coop(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]));
    const rec = await getReception(cooperativeId, id);
    if (!rec) { res.status(404).json({ erreur: "Réception introuvable" }); return; }
    res.json(rec);
  } catch (err) {
    req.log.error({ err }, "Erreur getReception");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Distributions ─────────────────────────────────────────────────────────────

export async function listDist(req: Request, res: Response): Promise<void> {
  const cooperativeId = coop(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const campagneId = req.query["campagneId"] ? parseInt(String(req.query["campagneId"])) : undefined;
    res.json(await listDistributions(cooperativeId, campagneId));
  } catch (err) {
    req.log.error({ err }, "Erreur listDistributions");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createDist(req: Request, res: Response): Promise<void> {
  const cooperativeId = coop(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const dist = await creerDistribution(cooperativeId, req.body, uid(req));
    res.status(201).json(dist);
  } catch (err: unknown) {
    req.log.error({ err }, "Erreur creerDistribution");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function getDist(req: Request, res: Response): Promise<void> {
  const cooperativeId = coop(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]));
    const dist = await getDistribution(cooperativeId, id);
    if (!dist) { res.status(404).json({ erreur: "Distribution introuvable" }); return; }
    res.json(dist);
  } catch (err) {
    req.log.error({ err }, "Erreur getDistribution");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function validerDist(req: Request, res: Response): Promise<void> {
  const cooperativeId = coop(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]));
    const dist = await validerDistribution(cooperativeId, id, uid(req));
    res.json(dist);
  } catch (err: unknown) {
    req.log.error({ err }, "Erreur validerDistribution");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

export async function payerTous(req: Request, res: Response): Promise<void> {
  const cooperativeId = coop(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]));
    await payerBulk(cooperativeId, id, req.body, uid(req));
    res.json({ ok: true });
  } catch (err: unknown) {
    req.log.error({ err }, "Erreur payerBulk");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}

// ── Paiement individuel ───────────────────────────────────────────────────────

export async function payerMembrePrime(req: Request, res: Response): Promise<void> {
  const cooperativeId = coop(req);
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }
  try {
    const id = parseInt(String(req.params["id"]));
    const pm = await payerMembre(cooperativeId, id, req.body, uid(req));
    res.json(pm);
  } catch (err: unknown) {
    req.log.error({ err }, "Erreur payerMembre prime");
    const msg = err instanceof Error ? err.message : "Erreur interne";
    res.status(400).json({ erreur: msg });
  }
}
