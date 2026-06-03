import { type Request, type Response } from "express";
import {
  db,
  personnelTable,
  composantesSalaireTable,
  bulletinsPaieTable,
  lignesBulletinTable,
  avancesPersonnelTable,
} from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { generateBulletin, generateMasse } from "../services/paieService";
import { generateEcrituresSalaire } from "../services/comptabiliteService";

const COOP_ID = 1;

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
      .where(eq(personnelTable.cooperativeId, COOP_ID))
      .orderBy(personnelTable.nom);
    res.json(rows);
  } catch (err) {
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
          eq(personnelTable.cooperativeId, COOP_ID),
        ),
      )
      .limit(1);
    if (!row) {
      res.status(404).json({ erreur: "Personnel introuvable" });
      return;
    }
    res.json(row);
  } catch (err) {
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
        cooperativeId: COOP_ID,
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
          eq(personnelTable.cooperativeId, COOP_ID),
        ),
      )
      .returning();

    if (!updated) {
      res.status(404).json({ erreur: "Personnel introuvable" });
      return;
    }
    res.json(updated);
  } catch (err) {
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
          eq(personnelTable.cooperativeId, COOP_ID),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ erreur: "Personnel introuvable" });
      return;
    }
    res.json(updated);
  } catch (err) {
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
          eq(personnelTable.cooperativeId, COOP_ID),
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
      .where(eq(composantesSalaireTable.cooperativeId, COOP_ID));
    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "listComposantes");
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
          generateBulletin(pid, mois, annee, COOP_ID),
        ),
      );
      const mapped = personnelIds.map((pid, i) => {
        const r = results[i];
        if (r && r.status === "fulfilled") return { personnelId: pid, bulletinId: r.value };
        return { personnelId: pid, bulletinId: -1, erreur: r?.status === "rejected" ? String(r.reason) : "Inconnu" };
      });
      res.json(mapped);
    } else {
      const masse = await generateMasse(COOP_ID, mois, annee);
      res.json(masse);
    }
  } catch (err) {
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

    const conditions = [eq(bulletinsPaieTable.cooperativeId, COOP_ID)];
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
          eq(bulletinsPaieTable.cooperativeId, COOP_ID),
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
          eq(bulletinsPaieTable.cooperativeId, COOP_ID),
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
    const { referencePaiement } = req.body as { referencePaiement?: string };

    const [b] = await db
      .select()
      .from(bulletinsPaieTable)
      .where(
        and(
          eq(bulletinsPaieTable.id, id),
          eq(bulletinsPaieTable.cooperativeId, COOP_ID),
        ),
      )
      .limit(1);
    if (!b) {
      res.status(404).json({ erreur: "Bulletin introuvable" });
      return;
    }
    if (b.statut !== "valide") {
      res.status(400).json({ erreur: "Seuls les bulletins validés peuvent être marqués payés" });
      return;
    }
    const [updated] = await db
      .update(bulletinsPaieTable)
      .set({
        statut: "paye",
        datePaiement: new Date(),
        referencePaiement: referencePaiement ?? null,
        payePar: req.user?.id ?? null,
      })
      .where(eq(bulletinsPaieTable.id, id))
      .returning();

    void (async () => {
      const [p] = await db
        .select({ nom: personnelTable.nom, prenoms: personnelTable.prenoms })
        .from(personnelTable)
        .where(eq(personnelTable.id, b.personnelId))
        .limit(1);
      if (p && updated) {
        await generateEcrituresSalaire({
          bulletinId: updated.id,
          personnelNom: `${p.prenoms} ${p.nom}`,
          salaireNetFcfa: updated.salaireNetFcfa,
          salaireBrutFcfa: updated.salaireBrutFcfa,
          cotisationsSalarieFcfa: updated.salaireBrutFcfa - updated.salaireNetFcfa,
          datePaiement: new Date().toISOString().split("T")[0]!,
        });
      }
    })();

    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "payerBulletin");
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
          eq(bulletinsPaieTable.cooperativeId, COOP_ID),
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
    req.log.error({ err }, "deleteBulletin");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getBulletinPdf(
  req: Request,
  res: Response,
): Promise<void> {
  res.status(501).json({ erreur: "Export PDF disponible prochainement" });
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

    const conditions = [eq(avancesPersonnelTable.cooperativeId, COOP_ID)];
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
          eq(personnelTable.cooperativeId, COOP_ID),
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
        cooperativeId: COOP_ID,
        montantFcfa: Number(montantFcfa),
        dateOctroi: String(dateOctroi),
        motif: motif ? String(motif) : null,
      })
      .returning();
    res.status(201).json(row);
  } catch (err) {
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
          eq(bulletinsPaieTable.cooperativeId, COOP_ID),
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
          eq(bulletinsPaieTable.cooperativeId, COOP_ID),
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
          eq(personnelTable.cooperativeId, COOP_ID),
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
      .where(eq(bulletinsPaieTable.cooperativeId, COOP_ID))
      .groupBy(
        bulletinsPaieTable.mois,
        bulletinsPaieTable.annee,
        bulletinsPaieTable.periode,
      )
      .orderBy(desc(bulletinsPaieTable.annee), desc(bulletinsPaieTable.mois))
      .limit(12);

    res.json(rows.reverse());
  } catch (err) {
    req.log.error({ err }, "getHistoriqueMasse");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
