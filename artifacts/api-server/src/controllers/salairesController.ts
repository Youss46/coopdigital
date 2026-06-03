import { type Request, type Response } from "express";
import { db, employesTable, fichesPaieTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";

const COOP_ID = 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseId(raw: unknown): number {
  return parseInt(String(raw ?? "0"), 10);
}

// ─── EMPLOYÉS ────────────────────────────────────────────────────────────────

export async function listEmployes(req: Request, res: Response): Promise<void> {
  try {
    const employes = await db
      .select()
      .from(employesTable)
      .where(eq(employesTable.cooperativeId, COOP_ID))
      .orderBy(employesTable.nom);
    res.json(employes);
  } catch (err) {
    req.log.error({ err }, "listEmployes");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getEmployeById(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const [employe] = await db
      .select()
      .from(employesTable)
      .where(and(eq(employesTable.id, id), eq(employesTable.cooperativeId, COOP_ID)))
      .limit(1);
    if (!employe) { res.status(404).json({ erreur: "Employé introuvable" }); return; }
    res.json(employe);
  } catch (err) {
    req.log.error({ err }, "getEmployeById");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createEmploye(req: Request, res: Response): Promise<void> {
  try {
    const { nom, prenoms, poste, telephone, email, dateEmbauche, salaireBaseFcfa } = req.body as Record<string, unknown>;
    if (!nom || !prenoms || !poste || !dateEmbauche || !salaireBaseFcfa) {
      res.status(400).json({ erreur: "Champs obligatoires manquants" });
      return;
    }
    const [employe] = await db
      .insert(employesTable)
      .values({
        cooperativeId: COOP_ID,
        nom: String(nom),
        prenoms: String(prenoms),
        poste: String(poste),
        telephone: telephone ? String(telephone) : null,
        email: email ? String(email) : null,
        dateEmbauche: String(dateEmbauche),
        salaireBaseFcfa: Number(salaireBaseFcfa),
      })
      .returning();
    res.status(201).json(employe);
  } catch (err) {
    req.log.error({ err }, "createEmploye");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function updateEmploye(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const { nom, prenoms, poste, telephone, email, dateEmbauche, salaireBaseFcfa, statut } = req.body as Record<string, unknown>;
    const updates: Partial<typeof employesTable.$inferInsert> = { updatedAt: new Date() };
    if (nom !== undefined) updates.nom = String(nom);
    if (prenoms !== undefined) updates.prenoms = String(prenoms);
    if (poste !== undefined) updates.poste = String(poste);
    if (telephone !== undefined) updates.telephone = telephone ? String(telephone) : null;
    if (email !== undefined) updates.email = email ? String(email) : null;
    if (dateEmbauche !== undefined) updates.dateEmbauche = String(dateEmbauche);
    if (salaireBaseFcfa !== undefined) updates.salaireBaseFcfa = Number(salaireBaseFcfa);
    if (statut !== undefined) updates.statut = statut as "actif" | "inactif";

    const [updated] = await db
      .update(employesTable)
      .set(updates)
      .where(and(eq(employesTable.id, id), eq(employesTable.cooperativeId, COOP_ID)))
      .returning();
    if (!updated) { res.status(404).json({ erreur: "Employé introuvable" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "updateEmploye");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function desactiverEmploye(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const [updated] = await db
      .update(employesTable)
      .set({ statut: "inactif", updatedAt: new Date() })
      .where(and(eq(employesTable.id, id), eq(employesTable.cooperativeId, COOP_ID)))
      .returning();
    if (!updated) { res.status(404).json({ erreur: "Employé introuvable" }); return; }
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "desactiverEmploye");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── FICHES DE PAIE ───────────────────────────────────────────────────────────

export async function listFichesPaie(req: Request, res: Response): Promise<void> {
  try {
    const mois = req.query["mois"] ? parseInt(String(req.query["mois"])) : undefined;
    const annee = req.query["annee"] ? parseInt(String(req.query["annee"])) : undefined;
    const employeId = req.query["employeId"] ? parseInt(String(req.query["employeId"])) : undefined;

    const conditions = [eq(fichesPaieTable.cooperativeId, COOP_ID)];
    if (mois) conditions.push(eq(fichesPaieTable.mois, mois));
    if (annee) conditions.push(eq(fichesPaieTable.annee, annee));
    if (employeId) conditions.push(eq(fichesPaieTable.employeId, employeId));

    const fiches = await db
      .select({
        fiche: fichesPaieTable,
        employe: {
          id: employesTable.id,
          nom: employesTable.nom,
          prenoms: employesTable.prenoms,
          poste: employesTable.poste,
        },
      })
      .from(fichesPaieTable)
      .innerJoin(employesTable, eq(fichesPaieTable.employeId, employesTable.id))
      .where(and(...conditions))
      .orderBy(desc(fichesPaieTable.annee), desc(fichesPaieTable.mois));

    res.json(fiches);
  } catch (err) {
    req.log.error({ err }, "listFichesPaie");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getFichePaieById(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const [row] = await db
      .select({
        fiche: fichesPaieTable,
        employe: employesTable,
      })
      .from(fichesPaieTable)
      .innerJoin(employesTable, eq(fichesPaieTable.employeId, employesTable.id))
      .where(and(eq(fichesPaieTable.id, id), eq(fichesPaieTable.cooperativeId, COOP_ID)))
      .limit(1);
    if (!row) { res.status(404).json({ erreur: "Fiche introuvable" }); return; }
    res.json(row);
  } catch (err) {
    req.log.error({ err }, "getFichePaieById");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createFichePaie(req: Request, res: Response): Promise<void> {
  try {
    const {
      employeId, mois, annee,
      salaireBaseFcfa, primesFcfa, indemnitésFcfa, heuresSupFcfa,
      deductionCnpsFcfa, deductionImpotFcfa, avanceSurSalaireFcfa,
      observations,
    } = req.body as Record<string, unknown>;

    if (!employeId || !mois || !annee || salaireBaseFcfa === undefined) {
      res.status(400).json({ erreur: "Champs obligatoires manquants" });
      return;
    }

    // Vérifier doublon mois/employé
    const [existing] = await db
      .select({ id: fichesPaieTable.id })
      .from(fichesPaieTable)
      .where(
        and(
          eq(fichesPaieTable.cooperativeId, COOP_ID),
          eq(fichesPaieTable.employeId, Number(employeId)),
          eq(fichesPaieTable.mois, Number(mois)),
          eq(fichesPaieTable.annee, Number(annee)),
        ),
      )
      .limit(1);
    if (existing) {
      res.status(409).json({ erreur: "Une fiche existe déjà pour cet employé ce mois-ci" });
      return;
    }

    const base = Number(salaireBaseFcfa);
    const primes = Number(primesFcfa ?? 0);
    const indemnites = Number(indemnitésFcfa ?? 0);
    const heuresSup = Number(heuresSupFcfa ?? 0);
    const cnps = Number(deductionCnpsFcfa ?? 0);
    const impot = Number(deductionImpotFcfa ?? 0);
    const avance = Number(avanceSurSalaireFcfa ?? 0);
    const net = base + primes + indemnites + heuresSup - cnps - impot - avance;

    const [fiche] = await db
      .insert(fichesPaieTable)
      .values({
        cooperativeId: COOP_ID,
        employeId: Number(employeId),
        mois: Number(mois),
        annee: Number(annee),
        salaireBaseFcfa: base,
        primesFcfa: primes,
        indemnitésFcfa: indemnites,
        heuresSupFcfa: heuresSup,
        deductionCnpsFcfa: cnps,
        deductionImpotFcfa: impot,
        avanceSurSalaireFcfa: avance,
        netAPayerFcfa: Math.max(0, net),
        observations: observations ? String(observations) : null,
        createdById: req.user?.id ?? null,
      })
      .returning();
    res.status(201).json(fiche);
  } catch (err) {
    req.log.error({ err }, "createFichePaie");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function validerFichePaie(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const [fiche] = await db
      .select()
      .from(fichesPaieTable)
      .where(and(eq(fichesPaieTable.id, id), eq(fichesPaieTable.cooperativeId, COOP_ID)))
      .limit(1);
    if (!fiche) { res.status(404).json({ erreur: "Fiche introuvable" }); return; }
    if (fiche.statut !== "brouillon") {
      res.status(400).json({ erreur: "Seules les fiches en brouillon peuvent être validées" });
      return;
    }
    const [updated] = await db
      .update(fichesPaieTable)
      .set({ statut: "valide", updatedAt: new Date() })
      .where(eq(fichesPaieTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "validerFichePaie");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function payerFichePaie(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const [fiche] = await db
      .select()
      .from(fichesPaieTable)
      .where(and(eq(fichesPaieTable.id, id), eq(fichesPaieTable.cooperativeId, COOP_ID)))
      .limit(1);
    if (!fiche) { res.status(404).json({ erreur: "Fiche introuvable" }); return; }
    if (fiche.statut !== "valide") {
      res.status(400).json({ erreur: "Seules les fiches validées peuvent être marquées payées" });
      return;
    }
    const [updated] = await db
      .update(fichesPaieTable)
      .set({ statut: "paye", datePaiement: new Date(), updatedAt: new Date() })
      .where(eq(fichesPaieTable.id, id))
      .returning();
    res.json(updated);
  } catch (err) {
    req.log.error({ err }, "payerFichePaie");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function deleteFichePaie(req: Request, res: Response): Promise<void> {
  try {
    const id = parseId(req.params["id"]);
    const [fiche] = await db
      .select()
      .from(fichesPaieTable)
      .where(and(eq(fichesPaieTable.id, id), eq(fichesPaieTable.cooperativeId, COOP_ID)))
      .limit(1);
    if (!fiche) { res.status(404).json({ erreur: "Fiche introuvable" }); return; }
    if (fiche.statut !== "brouillon") {
      res.status(400).json({ erreur: "Seules les fiches en brouillon peuvent être supprimées" });
      return;
    }
    await db.delete(fichesPaieTable).where(eq(fichesPaieTable.id, id));
    res.status(204).send();
  } catch (err) {
    req.log.error({ err }, "deleteFichePaie");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getRecapSalaires(req: Request, res: Response): Promise<void> {
  try {
    const mois = req.query["mois"] ? parseInt(String(req.query["mois"])) : new Date().getMonth() + 1;
    const annee = req.query["annee"] ? parseInt(String(req.query["annee"])) : new Date().getFullYear();

    const [recap] = await db
      .select({
        nbFiches: sql<number>`count(*)::int`,
        nbPayees: sql<number>`count(*) filter (where ${fichesPaieTable.statut} = 'paye')::int`,
        nbValidees: sql<number>`count(*) filter (where ${fichesPaieTable.statut} = 'valide')::int`,
        nbBrouillons: sql<number>`count(*) filter (where ${fichesPaieTable.statut} = 'brouillon')::int`,
        masseSalarialeBrute: sql<number>`coalesce(sum(${fichesPaieTable.salaireBaseFcfa} + ${fichesPaieTable.primesFcfa} + ${fichesPaieTable.indemnitésFcfa} + ${fichesPaieTable.heuresSupFcfa}), 0)::int`,
        masseSalarialeNette: sql<number>`coalesce(sum(${fichesPaieTable.netAPayerFcfa}), 0)::int`,
        totalCnps: sql<number>`coalesce(sum(${fichesPaieTable.deductionCnpsFcfa}), 0)::int`,
      })
      .from(fichesPaieTable)
      .where(
        and(
          eq(fichesPaieTable.cooperativeId, COOP_ID),
          eq(fichesPaieTable.mois, mois),
          eq(fichesPaieTable.annee, annee),
        ),
      );

    const nbEmployesActifs = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(employesTable)
      .where(and(eq(employesTable.cooperativeId, COOP_ID), eq(employesTable.statut, "actif")));

    res.json({
      mois,
      annee,
      nbEmployesActifs: nbEmployesActifs[0]?.count ?? 0,
      ...(recap ?? { nbFiches: 0, nbPayees: 0, nbValidees: 0, nbBrouillons: 0, masseSalarialeBrute: 0, masseSalarialeNette: 0, totalCnps: 0 }),
    });
  } catch (err) {
    req.log.error({ err }, "getRecapSalaires");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
