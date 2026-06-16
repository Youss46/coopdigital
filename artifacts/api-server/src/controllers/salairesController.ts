import { type Request, type Response } from "express";
import {
  db,
  personnelTable,
  composantesSalaireTable,
  bulletinsPaieTable,
  lignesBulletinTable,
  avancesPersonnelTable,
  configPaieTable,
  comptesMobilesMarchandsTable,
  mouvementsMobileMarchandTable,
  ecrituresComptablesTable,
  ecrituresEnAttenteTable,
} from "@workspace/db";
import { eq, and, desc, sql, inArray, notExists } from "drizzle-orm";
import { generateBulletin, generateMasse } from "../services/paieService";
import { generateEcrituresSalaire, insererEcrituresSalaireDirectes } from "../services/comptabiliteService";
import { generateBulletinPaie } from "../services/pdfService";
import { debitCaisseForSalaire, listCaisses } from "../services/caisseService";
import { debitBanqueForSalaire, listComptes as listComptessBanque } from "../services/banqueService";

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

function parseId(raw: unknown): number {
  return parseInt(String(raw ?? "0"), 10);
}

// ══════════════════════════════════════════════════════════════════════════════
//  PERSONNEL
// ══════════════════════════════════════════════════════════════════════════════

export async function listPersonnel(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(personnelTable)
      .where(eq(personnelTable.cooperativeId, coopId(req)))
      .orderBy(personnelTable.nom);
    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "listPersonnel");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getPersonnelById(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const [row] = await db
      .select()
      .from(personnelTable)
      .where(
        and(
          eq(personnelTable.id, id),
          eq(personnelTable.cooperativeId, coopId(req)),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ erreur: "Personnel introuvable" });
      return;
    }
    res.json(row);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "getPersonnelById");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createPersonnel(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const body = req.body as Record<string, unknown>;
    const {
      nom, prenoms, poste, roleSysteme, typeContrat,
      dateEmbauche, dateFinContrat, salaireBaseFcfa, sursalaireFcfa,
      numeroCnps, numeroCni, modePaiement, telephonePaiement, ribBanque,
    } = body;

    if (!nom || !prenoms || !poste || !dateEmbauche || salaireBaseFcfa === undefined) {
      res.status(400).json({ erreur: "Champs obligatoires manquants" });
      return;
    }

    const [row] = await db
      .insert(personnelTable)
      .values({
        cooperativeId: coopId(req),
        nom: String(nom),
        prenoms: String(prenoms),
        poste: String(poste),
        roleSysteme: roleSysteme ? String(roleSysteme) : null,
        typeContrat: (typeContrat as "cdi" | "cdd" | "journalier" | "stagiaire") ?? "cdi",
        dateEmbauche: String(dateEmbauche),
        dateFinContrat: dateFinContrat ? String(dateFinContrat) : null,
        salaireBaseFcfa: Number(salaireBaseFcfa),
        sursalaireFcfa: sursalaireFcfa ? Number(sursalaireFcfa) : 0,
        numeroCnps: numeroCnps ? String(numeroCnps) : null,
        numeroCni: numeroCni ? String(numeroCni) : null,
        modePaiement: (modePaiement as "orange_money" | "mtn_momo" | "virement" | "especes") ?? "especes",
        telephonePaiement: telephonePaiement ? String(telephonePaiement) : null,
        ribBanque: ribBanque ? String(ribBanque) : null,
      })
      .returning();

    res.status(201).json(row);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "createPersonnel");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function updatePersonnel(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const body = req.body as Record<string, unknown>;
    const updates: Partial<typeof personnelTable.$inferInsert> = {
      updatedAt: new Date(),
    };

    if (body["nom"] !== undefined) updates.nom = String(body["nom"]);
    if (body["prenoms"] !== undefined) updates.prenoms = String(body["prenoms"]);
    if (body["poste"] !== undefined) updates.poste = String(body["poste"]);
    if (body["roleSysteme"] !== undefined) updates.roleSysteme = body["roleSysteme"] ? String(body["roleSysteme"]) : null;
    if (body["typeContrat"] !== undefined) updates.typeContrat = body["typeContrat"] as "cdi" | "cdd" | "journalier" | "stagiaire";
    if (body["dateEmbauche"] !== undefined) updates.dateEmbauche = String(body["dateEmbauche"]);
    if (body["dateFinContrat"] !== undefined) updates.dateFinContrat = body["dateFinContrat"] ? String(body["dateFinContrat"]) : null;
    if (body["salaireBaseFcfa"] !== undefined) updates.salaireBaseFcfa = Number(body["salaireBaseFcfa"]);
    if (body["sursalaireFcfa"] !== undefined) updates.sursalaireFcfa = Number(body["sursalaireFcfa"]);
    if (body["numeroCnps"] !== undefined) updates.numeroCnps = body["numeroCnps"] ? String(body["numeroCnps"]) : null;
    if (body["numeroCni"] !== undefined) updates.numeroCni = body["numeroCni"] ? String(body["numeroCni"]) : null;
    if (body["modePaiement"] !== undefined) updates.modePaiement = body["modePaiement"] as "orange_money" | "mtn_momo" | "virement" | "especes";
    if (body["telephonePaiement"] !== undefined) updates.telephonePaiement = body["telephonePaiement"] ? String(body["telephonePaiement"]) : null;
    if (body["ribBanque"] !== undefined) updates.ribBanque = body["ribBanque"] ? String(body["ribBanque"]) : null;
    if (body["statut"] !== undefined) updates.statut = body["statut"] as "actif" | "suspendu" | "sorti";

    const [updated] = await db
      .update(personnelTable)
      .set(updates)
      .where(
        and(
          eq(personnelTable.id, id),
          eq(personnelTable.cooperativeId, coopId(req)),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ erreur: "Personnel introuvable" });
      return;
    }
    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "updatePersonnel");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function archiverPersonnel(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const [updated] = await db
      .update(personnelTable)
      .set({ statut: "sorti", updatedAt: new Date() })
      .where(
        and(
          eq(personnelTable.id, id),
          eq(personnelTable.cooperativeId, coopId(req)),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ erreur: "Personnel introuvable" });
      return;
    }
    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "archiverPersonnel");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getPersonnelHistorique(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseId(req.params["id"]);

    const [emp] = await db
      .select()
      .from(personnelTable)
      .where(
        and(
          eq(personnelTable.id, id),
          eq(personnelTable.cooperativeId, coopId(req)),
        ),
      )
      .limit(1);
    if (!emp) {
      res.status(404).json({ erreur: "Personnel introuvable" });
      return;
    }

    const bulletins = await db
      .select()
      .from(bulletinsPaieTable)
      .where(eq(bulletinsPaieTable.personnelId, id))
      .orderBy(desc(bulletinsPaieTable.annee), desc(bulletinsPaieTable.mois))
      .limit(12);

    const avances = await db
      .select()
      .from(avancesPersonnelTable)
      .where(eq(avancesPersonnelTable.personnelId, id))
      .orderBy(desc(avancesPersonnelTable.createdAt));

    res.json({ personnel: emp, bulletins, avances });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "getPersonnelHistorique");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  COMPOSANTES SALAIRE
// ══════════════════════════════════════════════════════════════════════════════

export async function listComposantes(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(composantesSalaireTable)
      .where(eq(composantesSalaireTable.cooperativeId, coopId(req)));
    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "listComposantes");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createComposante(req: Request, res: Response): Promise<void> {
  try {
    const { libelle, type, calcul, valeur, obligatoire } = req.body as {
      libelle: string; type: "avantage" | "retenue"; calcul: "fixe" | "pourcentage";
      valeur: number; obligatoire?: boolean;
    };
    if (!libelle?.trim()) { res.status(400).json({ erreur: "Libellé requis" }); return; }
    if (!["avantage", "retenue"].includes(type)) { res.status(400).json({ erreur: "Type invalide" }); return; }
    if (!["fixe", "pourcentage"].includes(calcul)) { res.status(400).json({ erreur: "Mode de calcul invalide" }); return; }

    const [row] = await db.insert(composantesSalaireTable).values({
      cooperativeId: coopId(req),
      libelle: libelle.trim(),
      type,
      calcul,
      valeur: Math.round(valeur ?? 0),
      obligatoire: obligatoire ?? false,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "createComposante");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function updateComposante(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const { libelle, type, calcul, valeur, obligatoire } = req.body as {
      libelle: string; type: "avantage" | "retenue"; calcul: "fixe" | "pourcentage";
      valeur: number; obligatoire?: boolean;
    };
    if (!libelle?.trim()) { res.status(400).json({ erreur: "Libellé requis" }); return; }

    const [row] = await db.update(composantesSalaireTable)
      .set({ libelle: libelle.trim(), type, calcul, valeur: Math.round(valeur ?? 0), obligatoire: obligatoire ?? false })
      .where(and(eq(composantesSalaireTable.id, id), eq(composantesSalaireTable.cooperativeId, coopId(req))))
      .returning();
    if (!row) { res.status(404).json({ erreur: "Composante introuvable" }); return; }
    res.json(row);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "updateComposante");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function deleteComposante(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const [row] = await db.select({ obligatoire: composantesSalaireTable.obligatoire })
      .from(composantesSalaireTable)
      .where(and(eq(composantesSalaireTable.id, id), eq(composantesSalaireTable.cooperativeId, coopId(req)))).limit(1);
    if (!row) { res.status(404).json({ erreur: "Composante introuvable" }); return; }
    if (row.obligatoire) { res.status(400).json({ erreur: "Cette composante est marquée obligatoire et ne peut pas être supprimée" }); return; }
    await db.delete(composantesSalaireTable)
      .where(and(eq(composantesSalaireTable.id, id), eq(composantesSalaireTable.cooperativeId, coopId(req))));
    res.status(204).end();
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "deleteComposante");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  BULLETINS DE PAIE
// ══════════════════════════════════════════════════════════════════════════════

export async function genererBulletins(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { mois, annee, personnelIds } = req.body as {
      mois?: number;
      annee?: number;
      personnelIds?: number[];
    };

    if (!mois || !annee) {
      res.status(400).json({ erreur: "mois et annee sont obligatoires" });
      return;
    }

    let results: PromiseSettledResult<number>[];
    if (personnelIds && personnelIds.length > 0) {
      results = await Promise.allSettled(
        personnelIds.map((pid) =>
          generateBulletin(pid, mois, annee, coopId(req)),
        ),
      );
      const mapped = personnelIds.map((pid, i) => {
        const r = results[i];
        if (r && r.status === "fulfilled") return { personnelId: pid, bulletinId: r.value };
        return { personnelId: pid, bulletinId: -1, erreur: r?.status === "rejected" ? String(r.reason) : "Inconnu" };
      });
      res.json(mapped);
    } else {
      const masse = await generateMasse(coopId(req), mois, annee);
      res.json(masse);
    }
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "genererBulletins");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function listBulletins(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const mois = req.query["mois"] ? parseInt(String(req.query["mois"])) : undefined;
    const annee = req.query["annee"] ? parseInt(String(req.query["annee"])) : undefined;
    const statut = req.query["statut"] ? String(req.query["statut"]) : undefined;

    const conditions = [eq(bulletinsPaieTable.cooperativeId, coopId(req))];
    if (mois) conditions.push(eq(bulletinsPaieTable.mois, mois));
    if (annee) conditions.push(eq(bulletinsPaieTable.annee, annee));
    if (statut) conditions.push(eq(bulletinsPaieTable.statut, statut as "brouillon" | "valide" | "paye"));

    const rows = await db
      .select({
        bulletin: bulletinsPaieTable,
        personnel: {
          id: personnelTable.id,
          nom: personnelTable.nom,
          prenoms: personnelTable.prenoms,
          poste: personnelTable.poste,
          modePaiement: personnelTable.modePaiement,
          telephonePaiement: personnelTable.telephonePaiement,
        },
      })
      .from(bulletinsPaieTable)
      .innerJoin(
        personnelTable,
        eq(bulletinsPaieTable.personnelId, personnelTable.id),
      )
      .where(and(...conditions))
      .orderBy(desc(bulletinsPaieTable.annee), desc(bulletinsPaieTable.mois), personnelTable.nom);

    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "listBulletins");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getBulletinById(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseId(req.params["id"]);

    const [row] = await db
      .select({
        bulletin: bulletinsPaieTable,
        personnel: personnelTable,
      })
      .from(bulletinsPaieTable)
      .innerJoin(
        personnelTable,
        eq(bulletinsPaieTable.personnelId, personnelTable.id),
      )
      .where(
        and(
          eq(bulletinsPaieTable.id, id),
          eq(bulletinsPaieTable.cooperativeId, coopId(req)),
        ),
      )
      .limit(1);

    if (!row) {
      res.status(404).json({ erreur: "Bulletin introuvable" });
      return;
    }

    const lignes = await db
      .select()
      .from(lignesBulletinTable)
      .where(eq(lignesBulletinTable.bulletinId, id));

    res.json({ ...row, lignes });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "getBulletinById");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function validerBulletin(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const [b] = await db
      .select()
      .from(bulletinsPaieTable)
      .where(
        and(
          eq(bulletinsPaieTable.id, id),
          eq(bulletinsPaieTable.cooperativeId, coopId(req)),
        ),
      )
      .limit(1);
    if (!b) {
      res.status(404).json({ erreur: "Bulletin introuvable" });
      return;
    }
    if (b.statut !== "brouillon") {
      res.status(400).json({ erreur: "Seuls les bulletins en brouillon peuvent être validés" });
      return;
    }
    const [updated] = await db
      .update(bulletinsPaieTable)
      .set({ statut: "valide", dateValidation: new Date() })
      .where(eq(bulletinsPaieTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "validerBulletin");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function payerBulletin(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const cid = coopId(req);
    const { referencePaiement, compteSourceType, compteSourceId } = req.body as {
      referencePaiement?: string;
      compteSourceType?: "caisse" | "banque" | "mobile";
      compteSourceId?: number;
    };

    const [b] = await db
      .select()
      .from(bulletinsPaieTable)
      .where(and(eq(bulletinsPaieTable.id, id), eq(bulletinsPaieTable.cooperativeId, cid)))
      .limit(1);
    if (!b) { res.status(404).json({ erreur: "Bulletin introuvable" }); return; }
    if (b.statut !== "valide") {
      res.status(400).json({ erreur: "Seuls les bulletins validés peuvent être marqués payés" });
      return;
    }

    // ── Débit du compte de trésorerie sélectionné ──────────────────────────────
    if (compteSourceType && compteSourceId) {
      const libelle = `Salaire – bulletin #${id}`;
      const ref = referencePaiement ?? null;
      const userId = req.user?.id ?? null;
      const montant = b.salaireNetFcfa;

      if (compteSourceType === "caisse") {
        await debitCaisseForSalaire(compteSourceId, cid, montant, libelle, ref, userId);
      } else if (compteSourceType === "banque") {
        await debitBanqueForSalaire(compteSourceId, cid, montant, libelle, ref, userId);
      } else if (compteSourceType === "mobile") {
        const [compte] = await db
          .select()
          .from(comptesMobilesMarchandsTable)
          .where(and(eq(comptesMobilesMarchandsTable.id, compteSourceId), eq(comptesMobilesMarchandsTable.cooperativeId, cid)))
          .limit(1);
        if (!compte) { res.status(404).json({ erreur: "Compte mobile introuvable" }); return; }
        const soldeActuel = parseFloat(compte.soldeActuelFcfa as string);
        if (soldeActuel < montant) {
          res.status(400).json({ erreur: `Solde insuffisant sur le compte mobile. Disponible : ${soldeActuel.toLocaleString("fr-FR")} FCFA` });
          return;
        }
        const newSolde = soldeActuel - montant;
        const today = new Date().toISOString().slice(0, 10);
        await db.insert(mouvementsMobileMarchandTable).values({
          compteId: compteSourceId,
          cooperativeId: cid,
          type: "debit",
          motif: "paiement_salaire",
          montantFcfa: montant.toString(),
          libelle,
          reference: ref ?? null,
          dateOperation: today,
          soldeApresFcfa: newSolde.toString(),
          enregistrePar: userId,
        });
        await db.update(comptesMobilesMarchandsTable)
          .set({ soldeActuelFcfa: newSolde.toString() })
          .where(eq(comptesMobilesMarchandsTable.id, compteSourceId));
      }
    }

    const [updated] = await db
      .update(bulletinsPaieTable)
      .set({
        statut: "paye",
        datePaiement: new Date(),
        referencePaiement: referencePaiement ?? null,
        payePar: req.user?.id ?? null,
        compteSourceType: compteSourceType ?? null,
        compteSourceId: compteSourceId ?? null,
      })
      .where(eq(bulletinsPaieTable.id, id))
      .returning();

    // Écriture comptable OHADA (async, non bloquant)
    void (async () => {
      try {
        const [p] = await db
          .select({ nom: personnelTable.nom, prenoms: personnelTable.prenoms })
          .from(personnelTable)
          .where(eq(personnelTable.id, b.personnelId))
          .limit(1);
        const personnelNom = p ? `${p.prenoms} ${p.nom}` : `Personnel #${b.personnelId}`;
        if (updated) {
          const compteCredit = compteSourceType === "caisse" ? "571" : compteSourceType === "mobile" ? "554" : "521";
          await generateEcrituresSalaire(cid, {
            bulletinId: updated.id,
            personnelNom,
            salaireNetFcfa: updated.salaireNetFcfa,
            salaireBrutFcfa: updated.salaireBrutFcfa,
            cotisationsSalarieFcfa: updated.salaireBrutFcfa - updated.salaireNetFcfa,
            datePaiement: new Date().toISOString().split("T")[0]!,
            compteCredit,
          });
        }
      } catch (err) {
        req.log.error({ err, bulletinId: id }, "Erreur génération écritures comptables salaire");
      }
    })();

    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "payerBulletin");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Comptes de trésorerie disponibles (pour le modal de paiement salaire) ──────

export async function getComptesTresorerie(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const cid = coopId(req);
    const [caisses, banques, mobiles] = await Promise.all([
      listCaisses(cid),
      listComptessBanque(cid),
      db.select({
        id: comptesMobilesMarchandsTable.id,
        nom: comptesMobilesMarchandsTable.nom,
        operateur: comptesMobilesMarchandsTable.operateur,
        solde_actuel_fcfa: comptesMobilesMarchandsTable.soldeActuelFcfa,
      })
        .from(comptesMobilesMarchandsTable)
        .where(and(
          eq(comptesMobilesMarchandsTable.cooperativeId, cid),
          eq(comptesMobilesMarchandsTable.actif, true),
        ))
        .orderBy(comptesMobilesMarchandsTable.nom),
    ]);
    res.json({ caisses, banques, mobiles });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "getComptesTresorerie");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function deleteBulletin(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const [b] = await db
      .select()
      .from(bulletinsPaieTable)
      .where(
        and(
          eq(bulletinsPaieTable.id, id),
          eq(bulletinsPaieTable.cooperativeId, coopId(req)),
        ),
      )
      .limit(1);
    if (!b) {
      res.status(404).json({ erreur: "Bulletin introuvable" });
      return;
    }
    if (b.statut !== "brouillon") {
      res.status(400).json({ erreur: "Seuls les brouillons peuvent être supprimés" });
      return;
    }
    await db
      .delete(bulletinsPaieTable)
      .where(eq(bulletinsPaieTable.id, id));
    res.status(204).send();
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "deleteBulletin");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getBulletinPdf(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const cid = coopId(req);
    const buffer = await generateBulletinPaie(id, cid);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="bulletin_paie_${id}.pdf"`);
    res.setHeader("Content-Length", String(buffer.length));
    res.end(buffer);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    if (err instanceof Error && err.message.includes("introuvable")) {
      res.status(404).json({ erreur: err.message }); return;
    }
    req.log.error({ err }, "getBulletinPdf");
    res.status(500).json({ erreur: "Erreur génération PDF" });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  AVANCES PERSONNEL
// ══════════════════════════════════════════════════════════════════════════════

export async function listAvancesPersonnel(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const personnelId = req.query["personnelId"]
      ? parseInt(String(req.query["personnelId"]))
      : undefined;
    const statut = req.query["statut"] ? String(req.query["statut"]) : undefined;

    const conditions = [eq(avancesPersonnelTable.cooperativeId, coopId(req))];
    if (personnelId) conditions.push(eq(avancesPersonnelTable.personnelId, personnelId));
    if (statut) conditions.push(eq(avancesPersonnelTable.statut, statut as "en_cours" | "rembourse"));

    const rows = await db
      .select({
        avance: avancesPersonnelTable,
        personnel: {
          id: personnelTable.id,
          nom: personnelTable.nom,
          prenoms: personnelTable.prenoms,
          poste: personnelTable.poste,
        },
      })
      .from(avancesPersonnelTable)
      .innerJoin(
        personnelTable,
        eq(avancesPersonnelTable.personnelId, personnelTable.id),
      )
      .where(and(...conditions))
      .orderBy(desc(avancesPersonnelTable.createdAt));

    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "listAvancesPersonnel");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createAvancePersonnel(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const { personnelId, montantFcfa, dateOctroi, motif } =
      req.body as Record<string, unknown>;

    if (!personnelId || !montantFcfa || !dateOctroi) {
      res.status(400).json({ erreur: "Champs obligatoires manquants" });
      return;
    }

    // Vérifier que le personnel appartient à la coop
    const [emp] = await db
      .select({ id: personnelTable.id })
      .from(personnelTable)
      .where(
        and(
          eq(personnelTable.id, Number(personnelId)),
          eq(personnelTable.cooperativeId, coopId(req)),
        ),
      )
      .limit(1);
    if (!emp) {
      res.status(404).json({ erreur: "Personnel introuvable" });
      return;
    }

    const [row] = await db
      .insert(avancesPersonnelTable)
      .values({
        personnelId: Number(personnelId),
        cooperativeId: coopId(req),
        montantFcfa: Number(montantFcfa),
        dateOctroi: String(dateOctroi),
        motif: motif ? String(motif) : null,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "createAvancePersonnel");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function rembourserAvance(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const { montantRembourse } = req.body as { montantRembourse?: number };

    const [av] = await db
      .select()
      .from(avancesPersonnelTable)
      .where(eq(avancesPersonnelTable.id, id))
      .limit(1);
    if (!av) {
      res.status(404).json({ erreur: "Avance introuvable" });
      return;
    }
    if (av.statut === "rembourse") {
      res.status(400).json({ erreur: "Cette avance est déjà remboursée" });
      return;
    }

    const nouveauMontant = montantRembourse ?? av.montantFcfa;
    const nouveauStatut =
      nouveauMontant >= av.montantFcfa ? "rembourse" : "en_cours";

    const [updated] = await db
      .update(avancesPersonnelTable)
      .set({ montantRembourse: nouveauMontant, statut: nouveauStatut })
      .where(eq(avancesPersonnelTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "rembourserAvance");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  RAPPORT MENSUEL
// ══════════════════════════════════════════════════════════════════════════════

export async function getRapportMensuel(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const mois = parseId(req.params["mois"]);
    const annee = parseId(req.params["annee"]);

    const [recap] = await db
      .select({
        nbBulletins: sql<number>`count(*)::int`,
        nbPayes: sql<number>`count(*) filter (where ${bulletinsPaieTable.statut} = 'paye')::int`,
        nbValides: sql<number>`count(*) filter (where ${bulletinsPaieTable.statut} = 'valide')::int`,
        nbBrouillons: sql<number>`count(*) filter (where ${bulletinsPaieTable.statut} = 'brouillon')::int`,
        totalBrut: sql<number>`coalesce(sum(${bulletinsPaieTable.salaireBrutFcfa}), 0)::int`,
        totalNet: sql<number>`coalesce(sum(${bulletinsPaieTable.salaireNetFcfa}), 0)::int`,
        totalChargesPatronales: sql<number>`coalesce(sum(${bulletinsPaieTable.chargesCnpsPatronaleFcfa} + ${bulletinsPaieTable.chargesTaxeApprentissageFcfa} + ${bulletinsPaieTable.chargesFpcFcfa}), 0)::int`,
        coutTotalEmployeur: sql<number>`coalesce(sum(${bulletinsPaieTable.coutTotalEmployeurFcfa}), 0)::int`,
      })
      .from(bulletinsPaieTable)
      .where(
        and(
          eq(bulletinsPaieTable.cooperativeId, coopId(req)),
          eq(bulletinsPaieTable.mois, mois),
          eq(bulletinsPaieTable.annee, annee),
        ),
      );

    // Répartition par poste
    const parPoste = await db
      .select({
        poste: personnelTable.poste,
        nbPersonnel: sql<number>`count(*)::int`,
        totalNet: sql<number>`coalesce(sum(${bulletinsPaieTable.salaireNetFcfa}), 0)::int`,
      })
      .from(bulletinsPaieTable)
      .innerJoin(
        personnelTable,
        eq(bulletinsPaieTable.personnelId, personnelTable.id),
      )
      .where(
        and(
          eq(bulletinsPaieTable.cooperativeId, coopId(req)),
          eq(bulletinsPaieTable.mois, mois),
          eq(bulletinsPaieTable.annee, annee),
        ),
      )
      .groupBy(personnelTable.poste);

    const [{ count: nbPersonnelActifs }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(personnelTable)
      .where(
        and(
          eq(personnelTable.cooperativeId, coopId(req)),
          eq(personnelTable.statut, "actif"),
        ),
      );

    res.json({
      mois,
      annee,
      nbPersonnelActifs: nbPersonnelActifs ?? 0,
      ...(recap ?? {
        nbBulletins: 0, nbPayes: 0, nbValides: 0, nbBrouillons: 0,
        totalBrut: 0, totalNet: 0, totalChargesPatronales: 0, coutTotalEmployeur: 0,
      }),
      detailsParPoste: parPoste,
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "getRapportMensuel");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  HISTORIQUE MASSE SALARIALE (12 mois)
// ══════════════════════════════════════════════════════════════════════════════

export async function getHistoriqueMasse(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const rows = await db
      .select({
        mois: bulletinsPaieTable.mois,
        annee: bulletinsPaieTable.annee,
        periode: bulletinsPaieTable.periode,
        totalBrut: sql<number>`coalesce(sum(${bulletinsPaieTable.salaireBrutFcfa}), 0)::int`,
        totalNet: sql<number>`coalesce(sum(${bulletinsPaieTable.salaireNetFcfa}), 0)::int`,
        coutTotalEmployeur: sql<number>`coalesce(sum(${bulletinsPaieTable.coutTotalEmployeurFcfa}), 0)::int`,
        nbBulletins: sql<number>`count(*)::int`,
      })
      .from(bulletinsPaieTable)
      .where(eq(bulletinsPaieTable.cooperativeId, coopId(req)))
      .groupBy(
        bulletinsPaieTable.mois,
        bulletinsPaieTable.annee,
        bulletinsPaieTable.periode,
      )
      .orderBy(desc(bulletinsPaieTable.annee), desc(bulletinsPaieTable.mois))
      .limit(12);

    res.json(rows.reverse());
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "getHistoriqueMasse");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
//  CONFIG PAIE
// ══════════════════════════════════════════════════════════════════════════════

// Valeurs légales par défaut (Côte d'Ivoire / OHADA)
const CONFIG_PAIE_DEFAULTS = {
  cnpsSalarialeActif: true, cnpsSalarialeTaux: 320, cnpsPlafondAnnuel: 1647315,
  cnpsPatronaleActif: true, cnpsPatronaleTaux: 770,
  cnpsAtmpActif: true,      cnpsAtmpTaux: 200,
  itsActif: true,
  taxeApprentissageActif: true, taxeApprentissageTaux: 50,
  fpcActif: true,               fpcTaux: 120,
  ancienneteActif: true,
  smigFcfa: 75_000,
};

export async function getConfigPaie(req: Request, res: Response): Promise<void> {
  try {
    const coop = coopId(req);
    const [row] = await db.select().from(configPaieTable)
      .where(eq(configPaieTable.cooperativeId, coop)).limit(1);
    res.json(row ?? { ...CONFIG_PAIE_DEFAULTS, cooperativeId: coop });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "getConfigPaie");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function updateConfigPaie(req: Request, res: Response): Promise<void> {
  try {
    const coop = coopId(req);
    const body = req.body as Partial<typeof CONFIG_PAIE_DEFAULTS>;

    const [existing] = await db.select({ id: configPaieTable.id })
      .from(configPaieTable).where(eq(configPaieTable.cooperativeId, coop)).limit(1);

    const data = {
      cnpsSalarialeActif:      body.cnpsSalarialeActif      ?? true,
      cnpsSalarialeTaux:       body.cnpsSalarialeTaux        ?? 320,
      cnpsPlafondAnnuel:       body.cnpsPlafondAnnuel        ?? 1647315,
      cnpsPatronaleActif:      body.cnpsPatronaleActif       ?? true,
      cnpsPatronaleTaux:       body.cnpsPatronaleTaux        ?? 770,
      cnpsAtmpActif:           body.cnpsAtmpActif            ?? true,
      cnpsAtmpTaux:            body.cnpsAtmpTaux             ?? 200,
      itsActif:                body.itsActif                 ?? true,
      taxeApprentissageActif:  body.taxeApprentissageActif   ?? true,
      taxeApprentissageTaux:   body.taxeApprentissageTaux    ?? 50,
      fpcActif:                body.fpcActif                 ?? true,
      fpcTaux:                 body.fpcTaux                  ?? 120,
      ancienneteActif:         body.ancienneteActif          ?? true,
      smigFcfa:                body.smigFcfa !== undefined ? Number(body.smigFcfa) : 75_000,
      updatedAt:               new Date(),
    };

    let row;
    if (existing) {
      [row] = await db.update(configPaieTable).set(data)
        .where(eq(configPaieTable.cooperativeId, coop)).returning();
    } else {
      [row] = await db.insert(configPaieTable).values({ cooperativeId: coop, ...data }).returning();
    }
    res.json(row);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "updateConfigPaie");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ── Réconciliation : génère les écritures manquantes pour les bulletins payés ──
export async function reconcilierEcrituresSalaires(req: Request, res: Response): Promise<void> {
  try {
    const cid = coopId(req);

    // Bulletins payés sans écriture dans le journal (on ignore "en attente" — on les nettoiera)
    const bulletinsPaye = await db
      .select({
        id: bulletinsPaieTable.id,
        personnelId: bulletinsPaieTable.personnelId,
        salaireNetFcfa: bulletinsPaieTable.salaireNetFcfa,
        salaireBrutFcfa: bulletinsPaieTable.salaireBrutFcfa,
        datePaiement: bulletinsPaieTable.datePaiement,
        compteSourceType: bulletinsPaieTable.compteSourceType,
      })
      .from(bulletinsPaieTable)
      .where(
        and(
          eq(bulletinsPaieTable.cooperativeId, cid),
          eq(bulletinsPaieTable.statut, "paye"),
          notExists(
            db.select({ x: sql`1` })
              .from(ecrituresComptablesTable)
              .where(and(
                eq(ecrituresComptablesTable.cooperativeId, cid),
                eq(ecrituresComptablesTable.source, "salaire"),
                eq(ecrituresComptablesTable.sourceId, bulletinsPaieTable.id),
              ))
          ),
        )
      );

    if (bulletinsPaye.length === 0) {
      res.json({ reconcilies: 0, message: "Tous les bulletins payés ont déjà leurs écritures dans le journal" });
      return;
    }

    // Charger le personnel en une seule requête
    const personnelIds = [...new Set(bulletinsPaye.map(b => b.personnelId))];
    const personnelRows = await db
      .select({ id: personnelTable.id, nom: personnelTable.nom, prenoms: personnelTable.prenoms })
      .from(personnelTable)
      .where(inArray(personnelTable.id, personnelIds));
    const personnelMap = Object.fromEntries(personnelRows.map(p => [p.id, p]));

    let reconcilies = 0;
    const erreurs: { bulletinId: number; erreur: string }[] = [];

    for (const b of bulletinsPaye) {
      try {
        // Supprimer les éventuelles écritures en_attente issues d'un précédent run raté
        await db.delete(ecrituresEnAttenteTable).where(
          and(
            eq(ecrituresEnAttenteTable.cooperativeId, cid),
            eq(ecrituresEnAttenteTable.source, "salaire"),
            eq(ecrituresEnAttenteTable.sourceId, b.id),
          )
        );

        const p = personnelMap[b.personnelId];
        const personnelNom = p ? `${p.prenoms} ${p.nom}` : `Personnel #${b.personnelId}`;
        const compteCredit = b.compteSourceType === "caisse" ? "571" : b.compteSourceType === "mobile" ? "554" : "521";
        const dateStr = b.datePaiement
          ? new Date(b.datePaiement).toISOString().split("T")[0]!
          : new Date().toISOString().split("T")[0]!;

        await insererEcrituresSalaireDirectes(cid, {
          bulletinId: b.id,
          personnelNom,
          salaireNetFcfa: b.salaireNetFcfa,
          salaireBrutFcfa: b.salaireBrutFcfa,
          cotisationsSalarieFcfa: b.salaireBrutFcfa - b.salaireNetFcfa,
          datePaiement: dateStr,
          compteCredit,
        });
        reconcilies++;
      } catch (err) {
        req.log.error({ err, bulletinId: b.id }, "reconcilierEcrituresSalaires: erreur bulletin");
        erreurs.push({ bulletinId: b.id, erreur: String(err) });
      }
    }

    res.json({
      reconcilies,
      total: bulletinsPaye.length,
      erreurs: erreurs.length > 0 ? erreurs : undefined,
      message: `${reconcilies} écriture(s) enregistrée(s) dans le journal sur ${bulletinsPaye.length} bulletin(s) traité(s)`,
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "reconcilierEcrituresSalaires");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
