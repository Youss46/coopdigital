import { Request, Response } from "express";
import * as svc from "../services/fiscaliteService.js";

export async function getObligations(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    res.json(await svc.listObligations(cooperativeId));
  }
  catch (err) { req.log.error({ err }, "getObligations"); res.status(500).json({ erreur: apiError(err) }); }
}

export async function getAllObligations(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    res.json(await svc.listObligationsAll(cooperativeId));
  }
  catch (err) { req.log.error({ err }, "getAllObligations"); res.status(500).json({ erreur: apiError(err) }); }
}
export async function postInitObligationsCI(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const result = await svc.initObligationsCI(cooperativeId);
    res.status(201).json(result);
  } catch (err) { req.log.error({ err }, "postInitObligationsCI"); res.status(500).json({ erreur: apiError(err) }); }
}

export async function postGenererMensuel(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const mois  = parseInt(String(req.params["mois"]), 10);
    const annee = parseInt(String(req.params["annee"]), 10);
    if (mois < 1 || mois > 12 || annee < 2000) { res.status(400).json({ error: "mois (1-12) et annee valides requis" }); return; }
    res.status(201).json(await svc.genererDeclarationsMensuelles(cooperativeId, mois, annee));
  } catch (err) { req.log.error({ err }, "postGenererMensuel"); res.status(500).json({ erreur: apiError(err) }); }
}

export async function postGenererAnnuel(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const annee = parseInt(String(req.params["annee"]), 10);
    if (annee < 2000) { res.status(400).json({ error: "annee valide requise" }); return; }
    res.status(201).json(await svc.genererDeclarationsAnnuelles(cooperativeId, annee));
  } catch (err) { req.log.error({ err }, "postGenererAnnuel"); res.status(500).json({ erreur: apiError(err) }); }
}

export async function getDeclarations(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const { statut, type_taxe, periode } = req.query as Record<string, string | undefined>;
    res.json(await svc.listDeclarations(cooperativeId, { statut, typeTaxe: type_taxe, periode }));
  } catch (err) { req.log.error({ err }, "getDeclarations"); res.status(500).json({ erreur: apiError(err) }); }
}

export async function deleteDeclaration(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    if (!id) { res.status(400).json({ error: "id invalide" }); return; }
    await svc.supprimerDeclaration(cooperativeId, id);
    res.status(204).end();
  } catch (err) {
    const msg = apiError(err);
    if (msg.includes("introuvable") || msg.includes("impossible")) {
      res.status(400).json({ error: msg });
    } else {
      req.log.error({ err }, "deleteDeclaration");
      res.status(500).json({ erreur: apiError(err) });
    }
  }
}

export async function putRecalculer(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    if (!id) { res.status(400).json({ error: "id invalide" }); return; }
    await svc.recalculerDeclaration(cooperativeId, id);
    res.json({ ok: true });
  } catch (err) {
    const msg = apiError(err);
    if (msg.includes("introuvable") || msg.includes("impossible") || msg.includes("parseable")) {
      res.status(400).json({ error: msg });
    } else {
      req.log.error({ err }, "putRecalculer");
      res.status(500).json({ erreur: apiError(err) });
    }
  }
}

export async function putPayer(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    const { montantPaye, reference, datePaiement } = req.body as {
      montantPaye: number; reference?: string; datePaiement?: string;
    };
    if (!montantPaye) { res.status(400).json({ error: "montantPaye requis" }); return; }
    res.json(await svc.enregistrerPaiement(cooperativeId, id, { montantPaye: Math.round(montantPaye), reference, datePaiement }));
  } catch (err) {
    const msg = apiError(err);
    req.log.error({ err }, "putPayer");
    res.status(400).json({ error: msg });
  }
}

export async function getCalendrier(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    res.json(await svc.getCalendrier(cooperativeId));
  }
  catch (err) { req.log.error({ err }, "getCalendrier"); res.status(500).json({ erreur: apiError(err) }); }
}

export async function getAlertes(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    res.json(await svc.getAlertes(cooperativeId));
  }
  catch (err) { req.log.error({ err }, "getAlertes fiscalite"); res.status(500).json({ erreur: apiError(err) }); }
}

export async function getRapportAnnuel(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const annee = parseInt((req.query["annee"] as string) ?? String(new Date().getFullYear()), 10);
    res.json(await svc.getRapportAnnuel(cooperativeId, annee));
  } catch (err) { req.log.error({ err }, "getRapportAnnuel"); res.status(500).json({ erreur: apiError(err) }); }
}

export async function getRapportPdf(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const annee = parseInt((req.query["annee"] as string) ?? String(new Date().getFullYear()), 10);
    const buf   = await svc.genererRapportPdf(cooperativeId, annee);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="rapport-fiscal-${annee}.pdf"`);
    res.send(buf);
  } catch (err) { req.log.error({ err }, "getRapportPdf fiscalite"); res.status(500).json({ erreur: apiError(err) }); }
}

export async function getBordereauCnpsPdf(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const mois  = parseInt(req.params["mois"]  as string, 10);
    const annee = parseInt(req.params["annee"] as string, 10);
    if (isNaN(mois) || mois < 1 || mois > 12 || isNaN(annee) || annee < 2000) {
      res.status(400).json({ error: "Mois ou année invalide" }); return;
    }
    const buf = await svc.genererBordereauCnpsPdf(cooperativeId, mois, annee);
    const moisStr = String(mois).padStart(2, "0");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="bordereau-cnps-${annee}-${moisStr}.pdf"`);
    res.send(buf);
  } catch (err) { req.log.error({ err }, "getBordereauCnpsPdf"); res.status(500).json({ erreur: apiError(err) }); }
}

export async function patchObligationToggle(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) { res.status(400).json({ error: "id invalide" }); return; }

    const { confirme } = (req.body ?? {}) as { confirme?: boolean };

    // Si l'obligation est active et qu'on va la désactiver → vérifier les déclarations en attente
    const obligations = await svc.listObligationsAll(cooperativeId);
    const obl = obligations.find(o => o.id === id);
    if (obl?.actif && !confirme) {
      const count = await svc.countDeclarationsEnAttente(cooperativeId, id);
      if (count > 0) {
        res.status(409).json({
          needsConfirmation: true,
          declarationsEnAttente: count,
          message: `Cette obligation a ${count} déclaration(s) non payée(s) (à payer ou en retard). Confirmer la désactivation ?`,
        });
        return;
      }
    }

    const updated = await svc.toggleObligation(cooperativeId, id);
    res.json(updated);
  } catch (err) {
    const msg = apiError(err);
    req.log.error({ err }, "patchObligationToggle");
    res.status(400).json({ error: msg });
  }
}

const VALID_TYPE_TAXE   = ["cnps","its","tva","impot_societes","taxe_apprentissage","fpc","autre"];
const VALID_PERIODICITE = ["mensuel","trimestriel","annuel"];

function validateObligationFields(body: Record<string, unknown>): string | null {
  const { libelle, typeTaxe, periodicite, jourEcheance, tauxPct } = body;
  if (typeof libelle === "string" && libelle.trim().length === 0)
    return "Le libellé ne peut pas être vide";
  if (typeTaxe !== undefined && !VALID_TYPE_TAXE.includes(typeTaxe as string))
    return `Type de taxe invalide. Valeurs autorisées : ${VALID_TYPE_TAXE.join(", ")}`;
  if (periodicite !== undefined && !VALID_PERIODICITE.includes(periodicite as string))
    return `Périodicité invalide. Valeurs autorisées : ${VALID_PERIODICITE.join(", ")}`;
  if (jourEcheance !== undefined && jourEcheance !== null) {
    const j = Number(jourEcheance);
    if (!Number.isInteger(j) || j < 1 || j > 31)
      return "Le jour d'échéance doit être un entier entre 1 et 31";
  }
  if (tauxPct !== undefined && tauxPct !== null && tauxPct !== "") {
    const t = parseFloat(String(tauxPct));
    if (isNaN(t) || t < 0 || t > 100)
      return "Le taux doit être compris entre 0 et 100";
  }
  return null;
}

export async function putObligation(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const id = parseInt(String(req.params["id"]), 10);
    if (isNaN(id)) { res.status(400).json({ error: "id invalide" }); return; }
    const validErr = validateObligationFields(req.body as Record<string, unknown>);
    if (validErr) { res.status(400).json({ error: validErr }); return; }
    const { libelle, typeTaxe, periodicite, jourEcheance, tauxPct, baseCalcul } = req.body as {
      libelle?: string; typeTaxe?: string; periodicite?: string;
      jourEcheance?: number | null; tauxPct?: string | null; baseCalcul?: string | null;
    };
    const updated = await svc.updateObligation(cooperativeId, id, { libelle, typeTaxe, periodicite, jourEcheance, tauxPct, baseCalcul });
    res.json(updated);
  } catch (err) {
    const msg = apiError(err);
    req.log.error({ err }, "putObligation");
    res.status(400).json({ error: msg });
  }
}

export async function postObligation(req: Request, res: Response): Promise<void> {
  try {
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }
    const { libelle, typeTaxe, periodicite, jourEcheance, tauxPct, baseCalcul } = req.body as {
      libelle: string; typeTaxe: string; periodicite: string;
      jourEcheance?: number; tauxPct?: string; baseCalcul?: string;
    };
    if (!libelle?.trim() || !typeTaxe?.trim() || !periodicite?.trim()) {
      res.status(400).json({ error: "libelle, typeTaxe et periodicite sont requis" }); return;
    }
    const validErr = validateObligationFields(req.body as Record<string, unknown>);
    if (validErr) { res.status(400).json({ error: validErr }); return; }
    const created = await svc.createObligation(cooperativeId, { libelle, typeTaxe, periodicite, jourEcheance, tauxPct, baseCalcul });
    res.status(201).json(created);
  } catch (err) { req.log.error({ err }, "postObligation"); res.status(500).json({ erreur: apiError(err) }); }
}
