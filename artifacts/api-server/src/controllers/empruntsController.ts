import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  empruntsTable, preteursTable, echeancierEmpruntsTable, remboursementsEmpruntsTable,
} from "@workspace/db";
import { eq, and, sql, desc, asc, gte, lte, between } from "drizzle-orm";
import { generateEcheancier, computeEcheancier } from "../services/empruntService";
import { proposerEcriture } from "../services/comptabiliteService";

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

// ─── PRÊTEURS ─────────────────────────────────────────────────────────────────

export async function listPreteurs(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(preteursTable)
      .where(eq(preteursTable.cooperativeId, coopId(req)))
      .orderBy(asc(preteursTable.nom));
    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur listPreteurs");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createPreteur(req: Request, res: Response): Promise<void> {
  try {
    const { type, nom, contact, ville } = req.body as Record<string, unknown>;
    const [row] = await db.insert(preteursTable).values({
      cooperativeId: coopId(req),
      type: (type as "banque") ?? "banque",
      nom: String(nom ?? ""),
      contact: contact ? String(contact) : null,
      ville: ville ? String(ville) : null,
    }).returning();
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur createPreteur");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── EMPRUNTS ─────────────────────────────────────────────────────────────────

export async function listEmprunts(req: Request, res: Response): Promise<void> {
  try {
    const statut = req.query["statut"] as string | undefined;

    const rows = await db
      .select({
        id: empruntsTable.id,
        libelle: empruntsTable.libelle,
        montantFcfa: empruntsTable.montantFcfa,
        tauxInteretAnnuelPct: empruntsTable.tauxInteretAnnuelPct,
        dureeMois: empruntsTable.dureeMois,
        dateDebut: empruntsTable.dateDebut,
        dateEcheance: empruntsTable.dateEcheance,
        periodicite: empruntsTable.periodicite,
        montantRembourse: empruntsTable.montantRembourse,
        soldeRestant: empruntsTable.soldeRestant,
        statut: empruntsTable.statut,
        objet: empruntsTable.objet,
        garantie: empruntsTable.garantie,
        createdAt: empruntsTable.createdAt,
        updatedAt: empruntsTable.updatedAt,
        preteurId: preteursTable.id,
        preteurNom: preteursTable.nom,
        preteurType: preteursTable.type,
      })
      .from(empruntsTable)
      .leftJoin(preteursTable, eq(empruntsTable.preteurId, preteursTable.id))
      .where(
        and(
          eq(empruntsTable.cooperativeId, coopId(req)),
          statut ? eq(empruntsTable.statut, statut as "en_cours") : undefined,
        )
      )
      .orderBy(desc(empruntsTable.createdAt));

    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur listEmprunts");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getEmpruntById(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const [emprunt] = await db
      .select({
        id: empruntsTable.id,
        libelle: empruntsTable.libelle,
        montantFcfa: empruntsTable.montantFcfa,
        tauxInteretAnnuelPct: empruntsTable.tauxInteretAnnuelPct,
        dureeMois: empruntsTable.dureeMois,
        dateDebut: empruntsTable.dateDebut,
        dateEcheance: empruntsTable.dateEcheance,
        periodicite: empruntsTable.periodicite,
        montantRembourse: empruntsTable.montantRembourse,
        soldeRestant: empruntsTable.soldeRestant,
        statut: empruntsTable.statut,
        objet: empruntsTable.objet,
        garantie: empruntsTable.garantie,
        createdAt: empruntsTable.createdAt,
        updatedAt: empruntsTable.updatedAt,
        preteurId: preteursTable.id,
        preteurNom: preteursTable.nom,
        preteurType: preteursTable.type,
        preteurContact: preteursTable.contact,
      })
      .from(empruntsTable)
      .leftJoin(preteursTable, eq(empruntsTable.preteurId, preteursTable.id))
      .where(and(eq(empruntsTable.id, id), eq(empruntsTable.cooperativeId, coopId(req))))
      .limit(1);

    if (!emprunt) { res.status(404).json({ erreur: "Emprunt introuvable" }); return; }

    const echeancier = await db
      .select()
      .from(echeancierEmpruntsTable)
      .where(eq(echeancierEmpruntsTable.empruntId, id))
      .orderBy(asc(echeancierEmpruntsTable.numeroEcheance));

    res.json({ ...emprunt, echeancier });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getEmpruntById");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createEmprunt(req: Request, res: Response): Promise<void> {
  try {
    const {
      preteurId, libelle, montantFcfa, tauxInteretAnnuelPct,
      dureeMois, dateDebut, periodicite, objet, garantie,
    } = req.body as Record<string, unknown>;

    const montant  = Number(montantFcfa);
    const taux     = Number(tauxInteretAnnuelPct);
    const duree    = Number(dureeMois);
    const periode  = String(periodicite ?? "mensuel");
    const debut    = String(dateDebut ?? "");

    // Calcul de la date d'échéance finale
    const dateEch  = new Date(debut);
    dateEch.setMonth(dateEch.getMonth() + duree);
    const dateEcheanceFin = dateEch.toISOString().slice(0, 10);

    const [emprunt] = await db.insert(empruntsTable).values({
      cooperativeId:        coopId(req),
      preteurId:            Number(preteurId),
      libelle:              String(libelle ?? ""),
      montantFcfa:          String(montant),
      tauxInteretAnnuelPct: String(taux),
      dureeMois:            duree,
      dateDebut:            debut,
      dateEcheance:         dateEcheanceFin,
      periodicite:          periode as "mensuel",
      soldeRestant:         String(montant),
      objet:                objet ? String(objet) : null,
      garantie:             garantie ? String(garantie) : null,
    }).returning();

    // Génération automatique de l'échéancier
    await generateEcheancier({
      empruntId: emprunt.id,
      montantFcfa: montant,
      tauxInteretAnnuelPct: taux,
      dureeMois: duree,
      dateDebut: debut,
      periodicite: periode,
    });

    // Écriture comptable : réception emprunt → 521 Banque / 164 Emprunts associés
    if (montant > 0) {
      const dateEcriture = debut || new Date().toISOString().slice(0, 10);
      void proposerEcriture(coopId(req), {
        source: "emprunt",
        sourceId: emprunt.id,
        libelle: `Réception emprunt – ${String(libelle ?? "")}`,
        compteDebit: "521",
        compteCredit: "164",
        montantFcfa: montant,
        date: dateEcriture,
        numeroPiece: `EMP-${emprunt.id}`,
      });
    }

    res.status(201).json(emprunt);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur createEmprunt");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getEcheancier(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const rows = await db
      .select()
      .from(echeancierEmpruntsTable)
      .where(eq(echeancierEmpruntsTable.empruntId, id))
      .orderBy(asc(echeancierEmpruntsTable.numeroEcheance));
    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getEcheancier");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function previewEcheancier(req: Request, res: Response): Promise<void> {
  try {
    const {
      montantFcfa, tauxInteretAnnuelPct, dureeMois, dateDebut, periodicite,
    } = req.body as Record<string, unknown>;

    const lignes = computeEcheancier({
      empruntId: 0,
      montantFcfa: Number(montantFcfa),
      tauxInteretAnnuelPct: Number(tauxInteretAnnuelPct),
      dureeMois: Number(dureeMois),
      dateDebut: String(dateDebut ?? ""),
      periodicite: String(periodicite ?? "mensuel"),
    });
    res.json(lignes);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur previewEcheancier");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function enregistrerRemboursement(req: Request, res: Response): Promise<void> {
  try {
    const empruntId = parseInt(String(req.params["id"] ?? "0"));
    const {
      echeanceId, dateRemboursement, montantCapitalFcfa,
      montantInteretFcfa, modePaiement, reference,
    } = req.body as Record<string, unknown>;

    const capital  = Number(montantCapitalFcfa ?? 0);
    const interet  = Number(montantInteretFcfa ?? 0);
    const total    = capital + interet;
    const dateRem  = String(dateRemboursement ?? new Date().toISOString().slice(0, 10));

    // Récupérer l'emprunt
    const [emprunt] = await db
      .select()
      .from(empruntsTable)
      .where(and(eq(empruntsTable.id, empruntId), eq(empruntsTable.cooperativeId, coopId(req))))
      .limit(1);
    if (!emprunt) { res.status(404).json({ erreur: "Emprunt introuvable" }); return; }

    // Insérer le remboursement
    const [rem] = await db.insert(remboursementsEmpruntsTable).values({
      empruntId,
      echeanceId:          echeanceId ? Number(echeanceId) : null,
      dateRemboursement:   dateRem,
      montantCapitalFcfa:  String(capital),
      montantInteretFcfa:  String(interet),
      montantTotalFcfa:    String(total),
      modePaiement:        modePaiement ? String(modePaiement) : null,
      reference:           reference    ? String(reference)    : null,
    }).returning();

    // Mettre à jour l'échéance si fournie
    if (echeanceId) {
      await db
        .update(echeancierEmpruntsTable)
        .set({ statut: "paye", datePaiement: dateRem, referencePaiement: reference ? String(reference) : null })
        .where(eq(echeancierEmpruntsTable.id, Number(echeanceId)));
    }

    // Mettre à jour solde emprunt
    const nouveauRembourse = Number(emprunt.montantRembourse) + capital;
    const nouveauSolde     = Number(emprunt.montantFcfa) - nouveauRembourse;
    const nouveauStatut    = nouveauSolde <= 0 ? "rembourse" : emprunt.statut;

    await db
      .update(empruntsTable)
      .set({
        montantRembourse: String(nouveauRembourse),
        soldeRestant:     String(Math.max(0, nouveauSolde)),
        statut:           nouveauStatut,
        updatedAt:        new Date(),
      })
      .where(eq(empruntsTable.id, empruntId));

    // Écritures comptables remboursement
    const piece = `REM-${rem.id}`;
    if (capital > 0) {
      void proposerEcriture(coopId(req), {
        source: "emprunt",
        sourceId: rem.id,
        libelle: `Remboursement capital – ${emprunt.libelle}`,
        compteDebit: "164",
        compteCredit: "521",
        montantFcfa: capital,
        date: dateRem,
        numeroPiece: piece,
      });
    }
    if (interet > 0) {
      void proposerEcriture(coopId(req), {
        source: "emprunt",
        sourceId: rem.id,
        libelle: `Intérêts emprunt – ${emprunt.libelle}`,
        compteDebit: "671",
        compteCredit: "521",
        montantFcfa: interet,
        date: dateRem,
        numeroPiece: piece,
      });
    }

    res.status(201).json(rem);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur enregistrerRemboursement");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getAlertes(req: Request, res: Response): Promise<void> {
  try {
    const today   = new Date();
    const in30    = new Date(today); in30.setDate(in30.getDate() + 30);
    const todayStr = today.toISOString().slice(0, 10);
    const in30Str  = in30.toISOString().slice(0, 10);

    const rows = await db
      .select({
        echeanceId:         echeancierEmpruntsTable.id,
        empruntId:          echeancierEmpruntsTable.empruntId,
        numeroEcheance:     echeancierEmpruntsTable.numeroEcheance,
        dateEcheance:       echeancierEmpruntsTable.dateEcheance,
        capitalFcfa:        echeancierEmpruntsTable.capitalFcfa,
        interetFcfa:        echeancierEmpruntsTable.interetFcfa,
        totalEcheanceFcfa:  echeancierEmpruntsTable.totalEcheanceFcfa,
        statut:             echeancierEmpruntsTable.statut,
        libelle:            empruntsTable.libelle,
        preteurNom:         preteursTable.nom,
      })
      .from(echeancierEmpruntsTable)
      .leftJoin(empruntsTable,  eq(echeancierEmpruntsTable.empruntId, empruntsTable.id))
      .leftJoin(preteursTable,  eq(empruntsTable.preteurId, preteursTable.id))
      .where(
        and(
          eq(empruntsTable.cooperativeId, coopId(req)),
          between(echeancierEmpruntsTable.dateEcheance, todayStr, in30Str),
        )
      )
      .orderBy(asc(echeancierEmpruntsTable.dateEcheance));

    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getAlertes");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function getDashboard(req: Request, res: Response): Promise<void> {
  try {
    const [totaux] = await db
      .select({
        totalEmprunte:    sql<string>`COALESCE(SUM(montant_fcfa), 0)`,
        totalRembourse:   sql<string>`COALESCE(SUM(montant_rembourse_fcfa), 0)`,
        soldeTotal:       sql<string>`COALESCE(SUM(solde_restant_fcfa), 0)`,
        nbActifs:         sql<number>`COUNT(*) FILTER (WHERE statut IN ('en_cours','en_retard'))`,
      })
      .from(empruntsTable)
      .where(eq(empruntsTable.cooperativeId, coopId(req)));

    const today = new Date().toISOString().slice(0, 10);
    const [prochaineEch] = await db
      .select({
        dateEcheance:     echeancierEmpruntsTable.dateEcheance,
        totalEcheance:    echeancierEmpruntsTable.totalEcheanceFcfa,
        libelle:          empruntsTable.libelle,
        preteurNom:       preteursTable.nom,
      })
      .from(echeancierEmpruntsTable)
      .leftJoin(empruntsTable, eq(echeancierEmpruntsTable.empruntId, empruntsTable.id))
      .leftJoin(preteursTable, eq(empruntsTable.preteurId, preteursTable.id))
      .where(
        and(
          eq(empruntsTable.cooperativeId, coopId(req)),
          eq(echeancierEmpruntsTable.statut, "a_payer"),
          gte(echeancierEmpruntsTable.dateEcheance, today),
        )
      )
      .orderBy(asc(echeancierEmpruntsTable.dateEcheance))
      .limit(1);

    res.json({
      totalEmprunte:   Number(totaux?.totalEmprunte  ?? 0),
      totalRembourse:  Number(totaux?.totalRembourse  ?? 0),
      soldeTotal:      Number(totaux?.soldeTotal      ?? 0),
      nbEmpruntsActifs:Number(totaux?.nbActifs        ?? 0),
      prochaineEcheance: prochaineEch ?? null,
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getDashboard emprunts");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}
