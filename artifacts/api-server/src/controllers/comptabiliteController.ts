import { type Request, type Response } from "express";
import { checkEcriture, creerAnomalies } from "../services/anomalieService";
import { db, ecrituresComptablesTable, planComptableTable, exercicesTable, configComptableTable, ecrituresEnAttenteTable, membresTable, usersTable, personnelTable, exportateursTable, fournisseursTable } from "@workspace/db";
import { eq, and, gte, lte, sql, desc, asc, inArray } from "drizzle-orm";
import { CreateEcritureManuelleBody } from "@workspace/api-zod";
import { assignerNumeroPiece, assignerNumerosPieces } from "../lib/numeroPiece";
import ExcelJS from "exceljs";

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

function exerciceCourant(): number {
  return new Date().getFullYear();
}

export async function getGrandLivre(req: Request, res: Response): Promise<void> {
  try {
    const compte = req.query["compte"] as string | undefined;
    const dateDebut = req.query["date_debut"] as string | undefined;
    const dateFin = req.query["date_fin"] as string | undefined;
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : undefined;
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const limit = Math.min(200, parseInt(String(req.query["limit"] ?? "50")));
    const offset = (page - 1) * limit;

    const conditions = [eq(ecrituresComptablesTable.cooperativeId, coopId(req))];
    if (exercice) conditions.push(eq(ecrituresComptablesTable.exercice, exercice));
    if (dateDebut) conditions.push(gte(ecrituresComptablesTable.dateEcriture, dateDebut));
    if (dateFin) conditions.push(lte(ecrituresComptablesTable.dateEcriture, dateFin));
    if (compte) {
      conditions.push(
        sql`(${ecrituresComptablesTable.compteDebit} = ${compte} OR ${ecrituresComptablesTable.compteCredit} = ${compte})`
      );
    }

    const where = and(...conditions);

    const [ecritures, [{ count }]] = await Promise.all([
      db.select().from(ecrituresComptablesTable)
        .where(where)
        .orderBy(desc(ecrituresComptablesTable.dateEcriture), desc(ecrituresComptablesTable.id))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` })
        .from(ecrituresComptablesTable)
        .where(where),
    ]);

    res.json({ ecritures, total: count ?? 0, page, limit });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getGrandLivre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getBalance(req: Request, res: Response): Promise<void> {
  try {
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant();

    // On part des écritures (source de vérité) et on enrichit avec le plan comptable.
    // L'ancienne requête partait du plan_comptable → retournait 0 ligne si le plan
    // était vide ou si les numéros de comptes ne correspondaient pas exactement.
    const rows = await db.execute(sql`
      SELECT
        a.numero_compte                        AS "numeroCompte",
        COALESCE(p.libelle, a.numero_compte)   AS libelle,
        p.type,
        a.total_debit::int                     AS "totalDebit",
        a.total_credit::int                    AS "totalCredit",
        (a.total_debit - a.total_credit)::int  AS "solde"
      FROM (
        SELECT
          numero_compte,
          SUM(total_debit)  AS total_debit,
          SUM(total_credit) AS total_credit
        FROM (
          SELECT
            compte_debit  AS numero_compte,
            SUM(montant_fcfa) AS total_debit,
            0             AS total_credit
          FROM ecritures_comptables
          WHERE cooperative_id = ${coopId(req)}
            AND exercice = ${exercice}
          GROUP BY compte_debit

          UNION ALL

          SELECT
            compte_credit AS numero_compte,
            0             AS total_debit,
            SUM(montant_fcfa) AS total_credit
          FROM ecritures_comptables
          WHERE cooperative_id = ${coopId(req)}
            AND exercice = ${exercice}
          GROUP BY compte_credit
        ) sub
        GROUP BY numero_compte
      ) a
      LEFT JOIN plan_comptable p
        ON p.numero_compte = a.numero_compte
        AND p.cooperative_id = ${coopId(req)}
      ORDER BY a.numero_compte ASC
    `);

    res.json(rows.rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getBalance");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getJournalComptable(req: Request, res: Response): Promise<void> {
  try {
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant();
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const limit = Math.min(200, parseInt(String(req.query["limit"] ?? "50")));
    const offset = (page - 1) * limit;
    const source = req.query["source"] as string | undefined;
    const dateDebut = req.query["date_debut"] as string | undefined;
    const dateFin = req.query["date_fin"] as string | undefined;

    const conditions = [
      eq(ecrituresComptablesTable.cooperativeId, coopId(req)),
      eq(ecrituresComptablesTable.exercice, exercice),
    ];
    if (source) conditions.push(eq(ecrituresComptablesTable.source, source as "livraison" | "vente" | "avance" | "paiement" | "manuel" | "encaissement" | "salaire" | "stock"));
    if (dateDebut) conditions.push(gte(ecrituresComptablesTable.dateEcriture, dateDebut));
    if (dateFin) conditions.push(lte(ecrituresComptablesTable.dateEcriture, dateFin));

    const where = and(...conditions);

    const [ecritures, [{ count }]] = await Promise.all([
      db.select().from(ecrituresComptablesTable)
        .where(where)
        .orderBy(asc(ecrituresComptablesTable.dateEcriture), asc(ecrituresComptablesTable.id))
        .limit(limit)
        .offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(ecrituresComptablesTable).where(where),
    ]);

    res.json({ ecritures, total: count ?? 0, page, limit });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getJournalComptable");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function createEcritureManuelle(req: Request, res: Response): Promise<void> {
  const parse = CreateEcritureManuelleBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  const { dateEcriture, numeroPiece, libelle, compteDebit, compteCredit, montantFcfa } = parse.data;
  const exercice = new Date(dateEcriture).getFullYear();

  try {
    // ── Détection anomalies ──────────────────────────────────────────────
    const anomaliesDetectees = await checkEcriture(coopId(req), { montantFcfa, agentId: (req.user as { id?: number } | undefined)?.id ?? null });
    const anomaliesCritiques = anomaliesDetectees.filter((a) => a.niveauGravite === "critique");
    if (anomaliesCritiques.length > 0) {
      void creerAnomalies(coopId(req), anomaliesCritiques, "comptabilite");
      res.status(422).json({
        erreur: anomaliesCritiques[0]!.description,
        anomalie: "bloquee",
        anomalies: anomaliesCritiques,
      });
      return;
    }
    const anomaliesAttention = anomaliesDetectees.filter((a) => a.niveauGravite !== "critique");

    const [ecriture] = await db.insert(ecrituresComptablesTable).values({
      cooperativeId: coopId(req),
      dateEcriture,
      numeroPiece: numeroPiece ?? null,
      libelle,
      compteDebit,
      compteCredit,
      montantFcfa,
      source: "manuel",
      sourceId: null,
      exercice,
    }).returning();

    if (ecriture && !numeroPiece) {
      ecriture.numeroPiece = await assignerNumeroPiece(ecriture.id, "manuel", exercice, coopId(req));
    }

    if (anomaliesAttention.length > 0) {
      void creerAnomalies(coopId(req), anomaliesAttention, "comptabilite", { entiteId: ecriture!.id, entiteType: "ecriture" });
    }
    res.status(201).json(ecriture);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur createEcritureManuelle");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function exportJournalCsv(req: Request, res: Response): Promise<void> {
  try {
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant();
    const source = req.query["source"] as string | undefined;
    const dateDebut = req.query["date_debut"] as string | undefined;
    const dateFin = req.query["date_fin"] as string | undefined;

    const conditions = [
      eq(ecrituresComptablesTable.cooperativeId, coopId(req)),
      eq(ecrituresComptablesTable.exercice, exercice),
    ];
    if (source) conditions.push(eq(ecrituresComptablesTable.source, source as "livraison" | "vente" | "avance" | "paiement" | "manuel" | "encaissement" | "salaire" | "stock"));
    if (dateDebut) conditions.push(gte(ecrituresComptablesTable.dateEcriture, dateDebut));
    if (dateFin) conditions.push(lte(ecrituresComptablesTable.dateEcriture, dateFin));

    const ecritures = await db
      .select()
      .from(ecrituresComptablesTable)
      .where(and(...conditions))
      .orderBy(asc(ecrituresComptablesTable.dateEcriture), asc(ecrituresComptablesTable.id));

    const SOURCE_LABELS: Record<string, string> = {
      livraison: "Livraisons prod.",
      paiement:  "Paiements prod.",
      avance:    "Avances prod.",
      vente:     "Ventes export.",
      encaissement: "Encaissements",
      salaire:   "Salaires",
      stock:     "Stocks",
      manuel:    "Manuel",
    };

    // ── Génération Excel ─────────────────────────────────────────────────────────
    const wb = new ExcelJS.Workbook();
    wb.creator  = "CoopDigital";
    wb.created  = new Date();

    const ws = wb.addWorksheet("Journal comptable");

    ws.columns = [
      { header: "Date",          key: "date",    width: 14 },
      { header: "N° Pièce",      key: "piece",   width: 22 },
      { header: "Libellé",       key: "libelle", width: 50 },
      { header: "Compte Débit",  key: "debit",   width: 16 },
      { header: "Compte Crédit", key: "credit",  width: 16 },
      { header: "Montant FCFA",  key: "montant", width: 18 },
      { header: "Source",        key: "source",  width: 22 },
    ];

    // En-tête : fond vert foncé, texte blanc, gras
    const headerRow = ws.getRow(1);
    headerRow.height = 22;
    headerRow.font      = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    headerRow.fill      = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A4731" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center" };

    // Données
    for (let i = 0; i < ecritures.length; i++) {
      const e = ecritures[i]!;
      const row = ws.addRow({
        date:    e.dateEcriture  ?? "",
        piece:   e.numeroPiece  ?? "",
        libelle: e.libelle       ?? "",
        debit:   e.compteDebit  ?? "",
        credit:  e.compteCredit ?? "",
        montant: parseFloat(String(e.montantFcfa)) || 0,
        source:  SOURCE_LABELS[e.source] ?? e.source ?? "",
      });
      row.font = { size: 9 };
      // Lignes alternées : gris très clair sur les lignes paires
      if (i % 2 === 1) {
        row.eachCell({ includeEmpty: true }, cell => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
        });
      }
    }

    // Colonne montant : format numérique + alignement droite
    ws.getColumn("montant").numFmt    = '#,##0';
    ws.getColumn("montant").alignment = { horizontal: "right" };

    // Figer la 1ère ligne, activer l'auto-filtre
    ws.views      = [{ state: "frozen", ySplit: 1 }];
    ws.autoFilter = { from: "A1", to: "G1" };

    const filename = `journal-${exercice}${source ? `-${source}` : ""}.xlsx`;
    const buf      = await wb.xlsx.writeBuffer();

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buf);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur exportJournalExcel");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getMargeCollecte(req: Request, res: Response): Promise<void> {
  try {
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant();

    const rows = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN compte_credit = '701' THEN montant_fcfa ELSE 0 END), 0)::int AS "caVentesFcfa",
        COALESCE(SUM(CASE WHEN compte_debit = '601' THEN montant_fcfa ELSE 0 END), 0)::int AS "coutAchatsFcfa",
        COALESCE(SUM(CASE WHEN compte_debit IN ('621', '641', '661') THEN montant_fcfa ELSE 0 END), 0)::int AS "chargesFcfa"
      FROM ecritures_comptables
      WHERE cooperative_id = ${coopId(req)} AND exercice = ${exercice}
    `);

    const r = rows.rows[0] as { caVentesFcfa: number; coutAchatsFcfa: number; chargesFcfa: number };
    const caVentesFcfa = r?.caVentesFcfa ?? 0;
    const coutAchatsFcfa = r?.coutAchatsFcfa ?? 0;
    const chargesFcfa = r?.chargesFcfa ?? 0;
    const margeNetteFcfa = caVentesFcfa - coutAchatsFcfa - chargesFcfa;
    const tauxMarge = caVentesFcfa > 0 ? Math.round((margeNetteFcfa / caVentesFcfa) * 10000) / 100 : 0;

    res.json({ caVentesFcfa, coutAchatsFcfa, chargesFcfa, margeNetteFcfa, exercice, tauxMarge });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getMargeCollecte");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getTresorerie(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN compte_debit = '521' THEN montant_fcfa ELSE 0 END) -
                 SUM(CASE WHEN compte_credit = '521' THEN montant_fcfa ELSE 0 END), 0)::int AS "soldeBanqueFcfa",
        COALESCE(SUM(CASE WHEN compte_debit = '571' THEN montant_fcfa ELSE 0 END) -
                 SUM(CASE WHEN compte_credit = '571' THEN montant_fcfa ELSE 0 END), 0)::int AS "soldeCaisseFcfa"
      FROM ecritures_comptables
      WHERE cooperative_id = ${coopId(req)}
    `);

    const r = rows.rows[0] as { soldeBanqueFcfa: number; soldeCaisseFcfa: number };
    const soldeBanqueFcfa = r?.soldeBanqueFcfa ?? 0;
    const soldeCaisseFcfa = r?.soldeCaisseFcfa ?? 0;

    res.json({
      soldeBanqueFcfa,
      soldeCaisseFcfa,
      totalFcfa: soldeBanqueFcfa + soldeCaisseFcfa,
      dateCalcul: new Date().toISOString(),
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getTresorerie");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── Config comptable ─────────────────────────────────────────────────────────

export async function getConfigComptable(req: Request, res: Response): Promise<void> {
  try {
    const rows = await db
      .select()
      .from(configComptableTable)
      .where(eq(configComptableTable.cooperativeId, coopId(req)))
      .limit(1);

    if (rows.length === 0) {
      await db.insert(configComptableTable).values({ cooperativeId: coopId(req) }).onConflictDoNothing();
      const created = await db.select().from(configComptableTable).where(eq(configComptableTable.cooperativeId, coopId(req))).limit(1);
      res.json(created[0]);
      return;
    }
    res.json(rows[0]);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "getConfigComptable");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function updateConfigComptable(req: Request, res: Response): Promise<void> {
  try {
    const body = req.body as {
      autoLivraisons?: boolean;
      autoPaiements?: boolean;
      autoAvances?: boolean;
      autoVentesExport?: boolean;
      autoEncaissements?: boolean;
      autoSalaires?: boolean;
      autoStocks?: boolean;
      autoIntrants?: boolean;
      autoTransport?: boolean;
      autoMaintenances?: boolean;
      autoEmprunts?: boolean;
      autoInvestissements?: boolean;
      autoDons?: boolean;
    };

    const [updated] = await db
      .update(configComptableTable)
      .set({
        ...body,
        modifiePar: req.user?.id ?? null,
        updatedAt: new Date(),
      })
      .where(eq(configComptableTable.cooperativeId, coopId(req)))
      .returning();

    if (!updated) {
      await db.insert(configComptableTable).values({ cooperativeId: coopId(req), ...body, modifiePar: req.user?.id ?? null, updatedAt: new Date() }).onConflictDoNothing();
      const created = await db.select().from(configComptableTable).where(eq(configComptableTable.cooperativeId, coopId(req))).limit(1);
      res.json(created[0]);
      return;
    }
    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "updateConfigComptable");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── Écritures en attente ─────────────────────────────────────────────────────

export async function listEcrituresEnAttente(req: Request, res: Response): Promise<void> {
  try {
    const source = req.query["source"] as string | undefined;
    const statut = (req.query["statut"] as string | undefined) ?? "en_attente";
    const dateDebut = req.query["date_debut"] as string | undefined;
    const dateFin = req.query["date_fin"] as string | undefined;

    const conditions = [eq(ecrituresEnAttenteTable.cooperativeId, coopId(req))];
    if (source) conditions.push(eq(ecrituresEnAttenteTable.source, source as "livraison" | "paiement" | "avance" | "vente" | "encaissement" | "salaire" | "stock"));
    if (statut) conditions.push(eq(ecrituresEnAttenteTable.statut, statut as "en_attente" | "validee" | "rejetee" | "modifiee"));
    if (dateDebut) conditions.push(gte(ecrituresEnAttenteTable.dateProposee, dateDebut));
    if (dateFin) conditions.push(lte(ecrituresEnAttenteTable.dateProposee, dateFin));

    const ecritures = await db
      .select()
      .from(ecrituresEnAttenteTable)
      .where(and(...conditions))
      .orderBy(desc(ecrituresEnAttenteTable.creeLe));

    res.json(ecritures);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "listEcrituresEnAttente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function countEcrituresEnAttente(req: Request, res: Response): Promise<void> {
  try {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ecrituresEnAttenteTable)
      .where(and(
        eq(ecrituresEnAttenteTable.cooperativeId, coopId(req)),
        eq(ecrituresEnAttenteTable.statut, "en_attente"),
      ));
    res.json({ count: count ?? 0 });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "countEcrituresEnAttente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function validerEcritureEnAttente(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]));
    if (!id || isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const [ecriture] = await db
      .select()
      .from(ecrituresEnAttenteTable)
      .where(and(eq(ecrituresEnAttenteTable.id, id), eq(ecrituresEnAttenteTable.cooperativeId, coopId(req))))
      .limit(1);

    if (!ecriture) { res.status(404).json({ erreur: "Écriture introuvable" }); return; }
    if (ecriture.statut !== "en_attente") { res.status(400).json({ erreur: "Cette écriture a déjà été traitée" }); return; }

    const body = req.body as {
      compteDebit?: string;
      compteCredit?: string;
      montantFcfa?: number;
      libelle?: string;
      commentaire?: string;
    };

    const compteDebit = body.compteDebit ?? ecriture.compteDebitPropose;
    const compteCredit = body.compteCredit ?? ecriture.compteCreditPropose;
    const montantFcfa = body.montantFcfa ?? ecriture.montantFcfa;
    const libelle = body.libelle ?? ecriture.libelleProppose;

    const modifie =
      compteDebit !== ecriture.compteDebitPropose ||
      compteCredit !== ecriture.compteCreditPropose ||
      montantFcfa !== ecriture.montantFcfa ||
      libelle !== ecriture.libelleProppose;

    const nouveauStatut = modifie ? "modifiee" : "validee";

    const exercice = new Date(ecriture.dateProposee).getFullYear();
    const sourceMap: Record<string, "livraison" | "vente" | "avance" | "paiement" | "manuel" | "encaissement" | "salaire" | "stock"> = {
      livraison: "livraison",
      paiement: "paiement",
      avance: "avance",
      vente: "vente",
      encaissement: "encaissement",
      salaire: "salaire",
      stock: "stock",
    };

    const srcVal = sourceMap[ecriture.source] ?? "manuel";
    const [inserted] = await db.insert(ecrituresComptablesTable).values({
      cooperativeId: coopId(req),
      dateEcriture: ecriture.dateProposee,
      libelle: modifie ? `${libelle} [modifiée]` : libelle,
      compteDebit,
      compteCredit,
      montantFcfa,
      source: srcVal,
      sourceId: ecriture.sourceId,
      exercice,
    }).returning({ id: ecrituresComptablesTable.id });
    if (inserted) await assignerNumeroPiece(inserted.id, srcVal, exercice, coopId(req));

    const [updated] = await db
      .update(ecrituresEnAttenteTable)
      .set({
        statut: nouveauStatut,
        commentaireComptable: body.commentaire ?? null,
        traiteLe: new Date(),
        traitePar: req.user?.id ?? null,
      })
      .where(eq(ecrituresEnAttenteTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "validerEcritureEnAttente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function rejeterEcritureEnAttente(req: Request, res: Response): Promise<void> {
  try {
    const id = parseInt(String(req.params["id"]));
    if (!id || isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

    const [ecriture] = await db
      .select()
      .from(ecrituresEnAttenteTable)
      .where(and(eq(ecrituresEnAttenteTable.id, id), eq(ecrituresEnAttenteTable.cooperativeId, coopId(req))))
      .limit(1);

    if (!ecriture) { res.status(404).json({ erreur: "Écriture introuvable" }); return; }
    if (ecriture.statut !== "en_attente") { res.status(400).json({ erreur: "Cette écriture a déjà été traitée" }); return; }

    const { commentaire } = req.body as { commentaire?: string };
    if (!commentaire?.trim()) { res.status(400).json({ erreur: "Le motif du rejet est obligatoire" }); return; }

    const [updated] = await db
      .update(ecrituresEnAttenteTable)
      .set({
        statut: "rejetee",
        commentaireComptable: commentaire,
        traiteLe: new Date(),
        traitePar: req.user?.id ?? null,
      })
      .where(eq(ecrituresEnAttenteTable.id, id))
      .returning();

    res.json(updated);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "rejeterEcritureEnAttente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function validerToutEcrituresEnAttente(req: Request, res: Response): Promise<void> {
  try {
    const enAttente = await db
      .select()
      .from(ecrituresEnAttenteTable)
      .where(and(
        eq(ecrituresEnAttenteTable.cooperativeId, coopId(req)),
        eq(ecrituresEnAttenteTable.statut, "en_attente"),
      ));

    if (enAttente.length === 0) {
      res.json({ validees: 0 });
      return;
    }

    const sourceMap: Record<string, "livraison" | "vente" | "avance" | "paiement" | "manuel" | "encaissement" | "salaire" | "stock"> = {
      livraison: "livraison", paiement: "paiement", avance: "avance",
      vente: "vente", encaissement: "encaissement", salaire: "salaire", stock: "stock",
    };

    const insertedAll = await db.insert(ecrituresComptablesTable).values(
      enAttente.map((e) => ({
        cooperativeId: coopId(req),
        dateEcriture: e.dateProposee,
        libelle: e.libelleProppose,
        compteDebit: e.compteDebitPropose,
        compteCredit: e.compteCreditPropose,
        montantFcfa: e.montantFcfa,
        source: sourceMap[e.source] ?? "manuel",
        sourceId: e.sourceId,
        exercice: new Date(e.dateProposee).getFullYear(),
      }))
    ).returning({ id: ecrituresComptablesTable.id, source: ecrituresComptablesTable.source, exercice: ecrituresComptablesTable.exercice });
    await assignerNumerosPieces(insertedAll.map((r) => ({ id: r.id, source: r.source, exercice: r.exercice, cooperativeId: coopId(req) })));

    const ids = enAttente.map((e) => e.id);
    await db
      .update(ecrituresEnAttenteTable)
      .set({ statut: "validee", traiteLe: new Date(), traitePar: req.user?.id ?? null })
      .where(inArray(ecrituresEnAttenteTable.id, ids));

    res.json({ validees: enAttente.length });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "validerToutEcrituresEnAttente");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── Régularisations d'inventaire (408, 418, 486, 487) ───────────────────────

// Comptes SYSCOHADA OHADA (plan officiel) :
// 408 = Fournisseurs, Factures non parvenues   → Débit charge / Crédit 408
// 418 = Clients, Produits à recevoir           → Débit 418   / Crédit produit
// 476 = Charges constatées d'avance            → Débit 476   / Crédit charge
// 477 = Produits constatés d'avance            → Débit produit/ Crédit 477
const REGULARISATION_TYPES = {
  "408": { label: "Charges à payer",             debitSide: "contrepartie", creditSide: "fixe" },
  "418": { label: "Produits à recevoir",          debitSide: "fixe",         creditSide: "contrepartie" },
  "476": { label: "Charges constatées d'avance",  debitSide: "fixe",         creditSide: "contrepartie" },
  "477": { label: "Produits constatés d'avance",  debitSide: "contrepartie", creditSide: "fixe" },
} as const;

export async function listRegularisations(req: Request, res: Response): Promise<void> {
  try {
    const coop    = coopId(req);
    const exercice = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : new Date().getFullYear() - 1;

    const rows = await db.execute(sql`
      SELECT id, date_ecriture AS "dateEcriture", libelle, compte_debit AS "compteDebit",
             compte_credit AS "compteCredit", montant_fcfa AS "montantFcfa",
             created_at AS "createdAt"
      FROM ecritures_comptables
      WHERE cooperative_id = ${coop}
        AND exercice = ${exercice}
        AND type_ecriture = 'regularisation'
      ORDER BY date_ecriture, id
    `);
    res.json(rows.rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function createRegularisation(req: Request, res: Response): Promise<void> {
  try {
    const coop = coopId(req);
    const { type, compteContrepartie, compteRegul, libelle, montantFcfa, date, exercice } = req.body as {
      type: "408" | "418" | "486" | "487";
      compteContrepartie: string;
      compteRegul?: string;           // compte fixe (côté régularisation), éditable par l'utilisateur
      libelle: string;
      montantFcfa: number;
      date: string;
      exercice: number;
    };

    if (!REGULARISATION_TYPES[type]) {
      res.status(400).json({ erreur: "Type invalide (408 | 418 | 486 | 487)" }); return;
    }
    if (!compteContrepartie || !libelle || !montantFcfa || montantFcfa <= 0) {
      res.status(400).json({ erreur: "Champs manquants ou montant invalide" }); return;
    }

    // Rejeter si l'exercice cible est clôturé
    const [exCheck] = await db.select({ statut: exercicesTable.statut }).from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, Number(exercice))));
    if (exCheck?.statut === "cloture") {
      res.status(409).json({ erreur: `L'exercice ${exercice} est clôturé — saisie impossible` }); return;
    }

    const compteFixe = (compteRegul ?? type).trim();
    const cfg = REGULARISATION_TYPES[type];
    const compteDebit  = cfg.debitSide  === "fixe" ? compteFixe : compteContrepartie;
    const compteCredit = cfg.creditSide === "fixe" ? compteFixe : compteContrepartie;

    const [inserted] = await db.insert(ecrituresComptablesTable).values({
      cooperativeId: coop,
      dateEcriture:  date,
      libelle,
      compteDebit,
      compteCredit,
      montantFcfa:   Math.round(montantFcfa),
      source:        "manuel",
      sourceId:      null,
      exercice,
      typeEcriture:  "regularisation",
    }).returning();

    if (inserted) await assignerNumeroPiece(inserted.id, "manuel", exercice, coop);
    res.status(201).json(inserted);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur createRegularisation");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function deleteRegularisation(req: Request, res: Response): Promise<void> {
  try {
    const coop = coopId(req);
    const id   = parseInt(String(req.params["id"]));

    // Vérifier que l'écriture appartient à la coop et est bien une régularisation
    const [row] = await db.select({
      id:          ecrituresComptablesTable.id,
      exercice:    ecrituresComptablesTable.exercice,
      typeEcriture: ecrituresComptablesTable.typeEcriture,
    }).from(ecrituresComptablesTable)
      .where(and(eq(ecrituresComptablesTable.id, id), eq(ecrituresComptablesTable.cooperativeId, coop)));

    if (!row) { res.status(404).json({ erreur: "Écriture introuvable" }); return; }
    if (row.typeEcriture !== "regularisation") { res.status(403).json({ erreur: "Cette écriture n'est pas une régularisation" }); return; }

    // Vérifier que l'exercice n'est pas clôturé
    const [ex] = await db.select({ statut: exercicesTable.statut }).from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, row.exercice)));
    if (ex?.statut === "cloture") { res.status(409).json({ erreur: "L'exercice est clôturé — suppression impossible" }); return; }

    await db.delete(ecrituresComptablesTable).where(eq(ecrituresComptablesTable.id, id));
    res.json({ supprime: id });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

// ─── Aperçu clôture (simulation lecture seule) ───────────────────────────────
export async function apercuCloture(req: Request, res: Response): Promise<void> {
  try {
    const coop          = coopId(req);
    const annee         = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant() - 1;
    const impotResultat = req.query["impot"]    ? Math.round(Number(req.query["impot"]))  : 0;
    const stockFinal    = req.query["stock"]    != null && req.query["stock"] !== "" ? Math.round(Number(req.query["stock"])) : null;

    // Statut exercice
    const [exercice] = await db.select().from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee)));

    // ── Phase 1 : vérifications ────────────────────────────────────────────────
    const v1 = await db.execute(sql`
      SELECT
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('52','57') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('52','57') THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeTresorerie",
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '40' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '40' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeFournisseurs",
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '48' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '48' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeRegularisation",
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '31' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '31' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeStock311"
      FROM ecritures_comptables
      WHERE cooperative_id = ${coop} AND exercice = ${annee}
        AND type_ecriture NOT IN ('cloture','a_nouveau')
    `);
    const p1 = v1.rows[0] as { soldeTresorerie: number; soldeFournisseurs: number; soldeRegularisation: number; soldeStock311: number; };
    const alertes: string[] = [];
    if (Number(p1?.soldeTresorerie    ?? 0) < 0)  alertes.push("⚠ Solde trésorerie négatif — vérifier comptes 52x/57x");
    if (Number(p1?.soldeRegularisation?? 0) !== 0) alertes.push("⚠ Comptes 48x non soldés — régulariser avant clôture");

    // ── Phase 4 (simulation) : calcul des soldes ───────────────────────────────
    const soldesQ = await db.execute(sql`
      SELECT
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('70','71','75') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('70','71','75') THEN montant_fcfa ELSE 0 END), 0))::bigint AS "prodExpl",
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('60','61','62','63','64','65','66','68','69') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('60','61','62','63','64','65','66','68','69') THEN montant_fcfa ELSE 0 END), 0))::bigint AS "chgExpl",
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '77' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '77' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "prodFin",
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '67' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '67' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "chgFin",
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('82','84','86') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('82','84','86') THEN montant_fcfa ELSE 0 END), 0))::bigint AS "prodHAO",
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('81','83','85') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('81','83','85') THEN montant_fcfa ELSE 0 END), 0))::bigint AS "chgHAO"
      FROM ecritures_comptables
      WHERE cooperative_id = ${coop} AND exercice = ${annee}
        AND type_ecriture NOT IN ('cloture','a_nouveau')
    `);
    const g = soldesQ.rows[0] as { prodExpl: number; chgExpl: number; prodFin: number; chgFin: number; prodHAO: number; chgHAO: number; };
    const prodExpl = Number(g?.prodExpl ?? 0);
    const chgExpl  = Number(g?.chgExpl  ?? 0);
    const prodFin  = Number(g?.prodFin  ?? 0);
    const chgFin   = Number(g?.chgFin   ?? 0);
    const prodHAO  = Number(g?.prodHAO  ?? 0);
    const chgHAO   = Number(g?.chgHAO   ?? 0);

    // Variation stocks simulée
    const stockInitial     = stockFinal !== null ? Math.max(0, Number(p1?.soldeStock311 ?? 0)) : 0;
    const variationStock   = stockFinal !== null ? (stockFinal - stockInitial) : 0;
    const chgExplAjustee   = chgExpl - variationStock; // variation positive réduit les charges nettes

    const resExpl  = prodExpl  - chgExplAjustee;
    const resFin   = prodFin   - chgFin;
    const rao      = resExpl   + resFin;
    const rhao     = prodHAO   - chgHAO;
    const avImpot  = rao       + rhao;
    const net      = avImpot   - impotResultat;

    // Régularisations existantes (seront extournées au 01/01/N+1 lors de la clôture)
    const regulRows = await db.execute(sql`
      SELECT libelle, compte_debit AS "compteDebit", compte_credit AS "compteCredit",
             montant_fcfa AS "montantFcfa"
      FROM   ecritures_comptables
      WHERE  cooperative_id = ${coop}
        AND  exercice       = ${annee}
        AND  type_ecriture  = 'regularisation'
      ORDER  BY id
    `);

    res.json({
      exercice:        annee,
      statut:          exercice?.statut ?? "ouvert",
      alertes,
      soldes: {
        produitsExploitation:  prodExpl,
        chargesExploitation:   chgExplAjustee,
        resultatExploitation:  resExpl,
        produitsFinanciers:    prodFin,
        chargesFinancieres:    chgFin,
        resultatFinancier:     resFin,
        rao,
        produitsHAO:           prodHAO,
        chargesHAO:            chgHAO,
        resultatHAO:           rhao,
        avantImpot:            avImpot,
        impot:                 impotResultat,
        net,
      },
      tresorerie:      Number(p1?.soldeTresorerie    ?? 0),
      fournisseurs:    Number(p1?.soldeFournisseurs   ?? 0),
      stockCacao:      Number(p1?.soldeStock311       ?? 0),
      regularisations: regulRows.rows as { libelle: string; compteDebit: string; compteCredit: string; montantFcfa: number }[],
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur apercuCloture");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── Clôture d'exercice — SYSCOHADA 6 phases complètes ───────────────────────
export async function cloturerExercice(req: Request, res: Response): Promise<void> {
  try {
    const coop          = coopId(req);
    const annee         = req.body.exercice       ? parseInt(String(req.body.exercice))        : exerciceCourant();
    const stockFinal    = req.body.stockFinalCacao != null ? Math.round(Number(req.body.stockFinalCacao)) : null;
    const impotResultat = req.body.impotResultat   != null ? Math.round(Number(req.body.impotResultat))   : 0;

    if (isNaN(annee) || annee < 2000 || annee > exerciceCourant()) {
      res.status(400).json({ erreur: "Exercice invalide" }); return;
    }

    const existing = await db.select().from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee)));
    if (existing[0]?.statut === "cloture") {
      res.status(409).json({ erreur: `L'exercice ${annee} est déjà clôturé` }); return;
    }

    // ── Type partagé pour toutes les écritures générées ──────────────────────
    type EntreeClot = {
      cooperativeId: number; dateEcriture: string; numeroPiece: string | null;
      libelle: string; compteDebit: string; compteCredit: string;
      montantFcfa: number; source: "manuel"; sourceId: null; exercice: number;
      typeEcriture: string;
    };
    const dateClot = `${annee}-12-31`;
    const dateOuv  = `${annee + 1}-01-01`;

    const mkE = (exo: number, type: string) =>
      (piece: string, libelle: string, debit: string, credit: string, montant: number): EntreeClot[] => {
        const m = Math.round(montant);
        if (m <= 0) return [];
        return [{ cooperativeId: coop, dateEcriture: exo === annee ? dateClot : dateOuv,
                  numeroPiece: piece, libelle, compteDebit: debit, compteCredit: credit,
                  montantFcfa: m, source: "manuel", sourceId: null, exercice: exo, typeEcriture: type }];
      };
    const ec = mkE(annee, "cloture");
    const ea = mkE(annee + 1, "a_nouveau");

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 1 — Vérifications préalables (informationnel, non-bloquant)
    // ══════════════════════════════════════════════════════════════════════════
    const v1 = await db.execute(sql`
      SELECT
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('52','57') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('52','57') THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeTresorerie",
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '40' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '40' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeFournisseurs",
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '42' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '42' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldePersonnel",
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '48' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '48' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeRegularisation",
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '31' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '31' THEN montant_fcfa ELSE 0 END), 0))::bigint AS "soldeStock311"
      FROM ecritures_comptables
      WHERE cooperative_id = ${coop} AND exercice = ${annee}
        AND type_ecriture NOT IN ('cloture','a_nouveau')
    `);
    const p1 = v1.rows[0] as {
      soldeTresorerie: number; soldeFournisseurs: number; soldePersonnel: number;
      soldeRegularisation: number; soldeStock311: number;
    };
    const alertes: string[] = [];
    if (Number(p1?.soldeTresorerie ?? 0) < 0)
      alertes.push("⚠ Solde trésorerie négatif — vérifier comptes 52x/57x avant clôture");
    if (Number(p1?.soldeRegularisation ?? 0) !== 0)
      alertes.push("⚠ Comptes 48x non soldés — régulariser 481/476/477 avant clôture");

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 2 — Amortissements non encore journalisés (681 → 28x)
    // ══════════════════════════════════════════════════════════════════════════
    const dotRows = await db.execute(sql`
      SELECT cat.compte_amortissement AS "compteAmort",
             SUM(d.dotation_fcfa)::bigint AS "total"
      FROM   dotations_amortissement d
      JOIN   equipements              e   ON e.id  = d.equipement_id
      JOIN   categories_equipements   cat ON cat.id = e.categorie_id
      WHERE  d.cooperative_id = ${coop}
        AND  d.exercice       = ${annee}
        AND  d.ecriture_id IS NULL
      GROUP  BY cat.compte_amortissement
      HAVING SUM(d.dotation_fcfa) > 0
    `);
    const phase2: EntreeClot[] = [];
    for (const row of dotRows.rows as { compteAmort: string; total: number }[]) {
      phase2.push(...ec(
        `CLOT-${annee}-AMORT`,
        `Dotations amortissements ${annee}`,
        "681", row.compteAmort || "284",
        Number(row.total),
      ));
    }
    if (phase2.length > 0) await db.insert(ecrituresComptablesTable).values(phase2);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 3 — Variation de stocks cacao (si stockFinalCacao fourni)
    // ══════════════════════════════════════════════════════════════════════════
    const phase3: EntreeClot[] = [];
    if (stockFinal !== null) {
      const stockInitial = Math.max(0, Number(p1?.soldeStock311 ?? 0));
      if (stockInitial > 0)
        phase3.push(...ec(`CLOT-${annee}-STK-INIT`, `Annulation stock initial cacao ${annee}`, "6031", "311", stockInitial));
      if (stockFinal > 0)
        phase3.push(...ec(`CLOT-${annee}-STK-FIN`,  `Constatation stock final cacao ${annee}`, "311", "6031", stockFinal));
      if (phase3.length > 0) await db.insert(ecrituresComptablesTable).values(phase3);
    }

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 4 — Calcul des soldes (APRÈS phases 2+3 = journal complet)
    //   SYSCOHADA correct :
    //     Charges exploitation : 60x-66x, 68x, 69x (incl. personnel, amort, provisions)
    //     Charges financières  : 67x  (frais financiers)
    //     Produits financiers  : 77x  (revenus financiers)
    //     Produits HAO         : 82x, 84x, 86x
    //     Charges HAO          : 81x, 83x, 85x
    // ══════════════════════════════════════════════════════════════════════════
    const soldesQ = await db.execute(sql`
      SELECT
        -- Produits exploitation (70x, 71x, 75x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('70','71','75') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('70','71','75') THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "prodExpl",
        -- Charges exploitation (60x–66x, 68x, 69x — personnel, amort, provisions inclus)
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('60','61','62','63','64','65','66','68','69') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('60','61','62','63','64','65','66','68','69') THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "chgExpl",
        -- Produits financiers (77x — revenus financiers SYSCOHADA)
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '77' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '77' THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "prodFin",
        -- Charges financières (67x — frais financiers SYSCOHADA)
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) = '67' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) = '67' THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "chgFin",
        -- Produits HAO (82x, 84x, 86x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('82','84','86') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('82','84','86') THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "prodHAO",
        -- Charges HAO (81x, 83x, 85x)
        (COALESCE(SUM(CASE WHEN LEFT(compte_debit, 2) IN ('81','83','85') THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN LEFT(compte_credit, 2) IN ('81','83','85') THEN montant_fcfa ELSE 0 END), 0))::bigint
        AS "chgHAO"
      FROM ecritures_comptables
      WHERE cooperative_id = ${coop} AND exercice = ${annee}
        AND type_ecriture NOT IN ('cloture','a_nouveau')
    `);
    const g = soldesQ.rows[0] as {
      prodExpl: number; chgExpl: number; prodFin: number; chgFin: number;
      prodHAO: number; chgHAO: number;
    };
    const prodExpl = Number(g?.prodExpl ?? 0);
    const chgExpl  = Number(g?.chgExpl  ?? 0);
    const prodFin  = Number(g?.prodFin  ?? 0);
    const chgFin   = Number(g?.chgFin   ?? 0);
    const prodHAO  = Number(g?.prodHAO  ?? 0);
    const chgHAO   = Number(g?.chgHAO   ?? 0);

    // Soldes intermédiaires de gestion
    const solde135 = prodExpl - chgExpl;        // Résultat exploitation
    const solde136 = prodFin  - chgFin;          // Résultat financier
    const solde137 = solde135 + solde136;         // RAO
    const solde138 = prodHAO  - chgHAO;           // RHAO
    const resAvantImpot = solde137 + solde138;
    const resultatNet   = resAvantImpot - impotResultat;

    const entries: EntreeClot[] = [];

    // ── Phase 4A : Résultat d'exploitation → 135 ─────────────────────────────
    entries.push(...ec(`CLOT-${annee}-E1-PRD`, `Clôture exploitation ${annee}`, "701", "135", prodExpl));
    entries.push(...ec(`CLOT-${annee}-E1-CHG`, `Clôture exploitation ${annee}`, "135", "601", chgExpl));

    // ── Phase 4B : Résultat financier → 136 ──────────────────────────────────
    entries.push(...ec(`CLOT-${annee}-E2-PRD`, `Clôture financier ${annee}`, "771", "136", prodFin));
    entries.push(...ec(`CLOT-${annee}-E2-CHG`, `Clôture financier ${annee}`, "136", "671", chgFin));

    // ── Phase 4C : RAO — virer 135 + 136 → 137 ───────────────────────────────
    if (solde135 > 0) entries.push(...ec(`CLOT-${annee}-E3-135P`, `Calcul RAO ${annee}`, "135",    "137",    solde135));
    if (solde135 < 0) entries.push(...ec(`CLOT-${annee}-E3-135N`, `Calcul RAO ${annee}`, "137",    "135",   -solde135));
    if (solde136 > 0) entries.push(...ec(`CLOT-${annee}-E3-136P`, `Calcul RAO ${annee}`, "136",    "137",    solde136));
    if (solde136 < 0) entries.push(...ec(`CLOT-${annee}-E3-136N`, `Calcul RAO ${annee}`, "137",    "136",   -solde136));

    // ── Phase 4D : RHAO → 138 ────────────────────────────────────────────────
    entries.push(...ec(`CLOT-${annee}-E4-PRD`, `Clôture HAO ${annee}`, "820", "138", prodHAO));
    entries.push(...ec(`CLOT-${annee}-E4-CHG`, `Clôture HAO ${annee}`, "138", "810", chgHAO));

    // ── Phase E : Impôt sur le résultat (891 / 441) ───────────────────────────
    if (impotResultat > 0)
      entries.push(...ec(`CLOT-${annee}-IMPOT`, `Impôt sur résultat ${annee}`, "891", "441", impotResultat));

    // ── Phase F : Résultat net → 131 (bénéfice) ou 139 (perte) ───────────────
    const cptRes  = resultatNet >= 0 ? "131" : "139";
    const libRes  = `Résultat net ${annee}`;
    if (solde137 > 0)        entries.push(...ec(`CLOT-${annee}-E5-137P`, libRes, "137",   cptRes,  solde137));
    if (solde137 < 0)        entries.push(...ec(`CLOT-${annee}-E5-137N`, libRes, cptRes,  "137",  -solde137));
    if (solde138 > 0)        entries.push(...ec(`CLOT-${annee}-E5-138P`, libRes, "138",   cptRes,  solde138));
    if (solde138 < 0)        entries.push(...ec(`CLOT-${annee}-E5-138N`, libRes, cptRes,  "138",  -solde138));
    if (impotResultat > 0)   entries.push(...ec(`CLOT-${annee}-E5-IMP`,  libRes, cptRes,  "891",   impotResultat));

    if (entries.length > 0) await db.insert(ecrituresComptablesTable).values(entries);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 5 — Balance d'ouverture (À-nouveaux exercice+1)
    //   Tous les comptes classes 1,2,3,4,5 avec solde non nul
    //   Solde débiteur  → DEBIT compte  / CREDIT "ANOUV"
    //   Solde créditeur → DEBIT "ANOUV" / CREDIT compte
    // ══════════════════════════════════════════════════════════════════════════
    const bilanQ = await db.execute(sql`
      SELECT compte, (SUM(td) - SUM(tc))::bigint AS solde
      FROM (
        SELECT compte_debit  AS compte, montant_fcfa AS td, 0 AS tc
        FROM   ecritures_comptables
        WHERE  cooperative_id = ${coop} AND exercice = ${annee}
          AND  LEFT(compte_debit, 1) IN ('1','2','3','4','5')
        UNION ALL
        SELECT compte_credit AS compte, 0 AS td, montant_fcfa AS tc
        FROM   ecritures_comptables
        WHERE  cooperative_id = ${coop} AND exercice = ${annee}
          AND  LEFT(compte_credit, 1) IN ('1','2','3','4','5')
      ) t
      GROUP  BY compte
      HAVING SUM(td) - SUM(tc) != 0
      ORDER  BY compte
    `);
    const aNouveaux: EntreeClot[] = [];
    for (const row of bilanQ.rows as { compte: string; solde: number }[]) {
      const s = Number(row.solde);
      if (s > 0)      aNouveaux.push(...ea(`AN-${annee + 1}`, `À-nouveau ${annee + 1}`, row.compte, "ANOUV", s));
      else if (s < 0) aNouveaux.push(...ea(`AN-${annee + 1}`, `À-nouveau ${annee + 1}`, "ANOUV", row.compte, -s));
    }
    if (aNouveaux.length > 0) await db.insert(ecrituresComptablesTable).values(aNouveaux);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 5B — Extournes des régularisations d'inventaire (01/01/N+1)
    //   Chaque écriture type='regularisation' de l'exercice N est inversée
    //   (débit ↔ crédit) au 01/01/N+1 avec type='extourne_regularisation'.
    //   Cela neutralise automatiquement leur effet sur le nouvel exercice.
    // ══════════════════════════════════════════════════════════════════════════
    const regulsQ = await db.execute(sql`
      SELECT id, libelle, compte_debit AS "compteDebit", compte_credit AS "compteCredit",
             montant_fcfa AS "montantFcfa", numero_piece AS "numeroPiece"
      FROM   ecritures_comptables
      WHERE  cooperative_id = ${coop}
        AND  exercice       = ${annee}
        AND  type_ecriture  = 'regularisation'
    `);
    const extournes: EntreeClot[] = [];
    for (const r of regulsQ.rows as { id: number; libelle: string; compteDebit: string; compteCredit: string; montantFcfa: number; numeroPiece: string | null }[]) {
      extournes.push({
        cooperativeId: coop,
        dateEcriture:  dateOuv,
        numeroPiece:   r.numeroPiece ? `EXT-${r.numeroPiece}` : `EXT-REG-${r.id}`,
        libelle:       `Extourne: ${r.libelle}`,
        compteDebit:   r.compteCredit,   // inversé
        compteCredit:  r.compteDebit,    // inversé
        montantFcfa:   Math.round(Number(r.montantFcfa)),
        source:        "manuel",
        sourceId:      null,
        exercice:      annee + 1,
        typeEcriture:  "extourne_regularisation",
      });
    }
    if (extournes.length > 0) await db.insert(ecrituresComptablesTable).values(extournes);

    // ══════════════════════════════════════════════════════════════════════════
    // PHASE 6 — Verrouillage exercice clôturé + ouverture exercice suivant
    // ══════════════════════════════════════════════════════════════════════════
    if (existing.length > 0) {
      await db.update(exercicesTable)
        .set({ statut: "cloture", dateCloture: new Date() })
        .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee)));
    } else {
      await db.insert(exercicesTable).values({ cooperativeId: coop, annee, statut: "cloture", dateCloture: new Date() });
    }
    const nextEx = await db.select().from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee + 1)));
    if (nextEx.length === 0)
      await db.insert(exercicesTable).values({ cooperativeId: coop, annee: annee + 1, statut: "ouvert" });

    res.json({
      message: `Exercice ${annee} clôturé avec succès`,
      exercice: annee,
      prochainExercice: annee + 1,
      alertes,
      soldes: {
        exploitation: solde135,
        financier:    solde136,
        rao:          solde137,
        rhao:         solde138,
        avantImpot:   resAvantImpot,
        impot:        impotResultat,
        net:          resultatNet,
      },
      compteResultat: cptRes,
      ecrituresGenerees: phase2.length + phase3.length + entries.length + aNouveaux.length + extournes.length,
      detailEcritures: {
        amortissements:          phase2.length,
        variationStocks:         phase3.length,
        cloture:                 entries.length,
        aNouveaux:               aNouveaux.length,
        extournesRegularisations: extournes.length,
      },
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur cloturerExercice");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── Balance auxiliaire (solde par tiers : membre / delegue / personnel) ─────
export async function getBalanceAuxiliaire(req: Request, res: Response): Promise<void> {
  try {
    const coop      = coopId(req);
    const exercice  = req.query["exercice"]  ? parseInt(String(req.query["exercice"])) : undefined;
    const tiersType = (req.query["tiersType"] as string) || "membre";
    const exerciceCond = exercice ? sql`AND e.exercice = ${exercice}` : sql``;

    type Row = {
      tiersId: number; nom: string; prenoms: string; code: string;
      totalDu: number; totalPaye: number;
      totalIntrantsDus: number; totalIntrantsRemb: number; soldeNet: number;
    };

    let result: { rows: Row[] };

    if (tiersType === "personnel") {
      // Compte 421 — Rémunérations dues au personnel
      result = await db.execute<Row>(sql`
        SELECT
          e.tiers_id                                                            AS "tiersId",
          COALESCE(p.nom, '—')                                                  AS nom,
          COALESCE(p.prenoms, '')                                               AS prenoms,
          COALESCE(p.poste, '')                                                 AS code,
          SUM(CASE WHEN e.compte_credit = '421' THEN e.montant_fcfa ELSE 0 END)::integer AS "totalDu",
          SUM(CASE WHEN e.compte_debit  = '421' THEN e.montant_fcfa ELSE 0 END)::integer AS "totalPaye",
          0::integer                                                            AS "totalIntrantsDus",
          0::integer                                                            AS "totalIntrantsRemb",
          (SUM(CASE WHEN e.compte_credit = '421' THEN e.montant_fcfa ELSE 0 END)
           - SUM(CASE WHEN e.compte_debit  = '421' THEN e.montant_fcfa ELSE 0 END))::integer AS "soldeNet"
        FROM ecritures_comptables e
        LEFT JOIN personnel p ON p.id = e.tiers_id
        WHERE e.cooperative_id = ${coop}
          AND e.tiers_type = 'personnel'
          ${exerciceCond}
        GROUP BY e.tiers_id, p.nom, p.prenoms, p.poste
        ORDER BY
          ABS(SUM(CASE WHEN e.compte_credit = '421' THEN e.montant_fcfa ELSE 0 END)
              - SUM(CASE WHEN e.compte_debit = '421'  THEN e.montant_fcfa ELSE 0 END)) DESC,
          p.nom
      `);
    } else if (tiersType === "delegue") {
      // Comptes 401/4091/4092 — Fournisseurs/avances (délégués)
      result = await db.execute<Row>(sql`
        SELECT
          e.tiers_id                                                            AS "tiersId",
          COALESCE(u.nom, '—')                                                  AS nom,
          COALESCE(u.prenoms, '')                                               AS prenoms,
          ''                                                                    AS code,
          SUM(CASE WHEN e.compte_credit IN ('401','4091','4092') THEN e.montant_fcfa ELSE 0 END)::integer AS "totalDu",
          SUM(CASE WHEN e.compte_debit  IN ('401','4091','4092') AND e.source = 'paiement'
                   THEN e.montant_fcfa ELSE 0 END)::integer                    AS "totalPaye",
          SUM(CASE WHEN e.compte_debit  = '4091' THEN e.montant_fcfa ELSE 0 END)::integer AS "totalIntrantsDus",
          SUM(CASE WHEN e.compte_credit = '4091' THEN e.montant_fcfa ELSE 0 END)::integer AS "totalIntrantsRemb",
          (SUM(CASE WHEN e.compte_credit IN ('401','4091','4092') THEN e.montant_fcfa ELSE 0 END)
           - SUM(CASE WHEN e.compte_debit  IN ('401','4091','4092') THEN e.montant_fcfa ELSE 0 END))::integer AS "soldeNet"
        FROM ecritures_comptables e
        LEFT JOIN users u ON u.id = e.tiers_id
        WHERE e.cooperative_id = ${coop}
          AND e.tiers_type = 'delegue'
          ${exerciceCond}
        GROUP BY e.tiers_id, u.nom, u.prenoms
        ORDER BY
          ABS(SUM(CASE WHEN e.compte_credit IN ('401','4091','4092') THEN e.montant_fcfa ELSE 0 END)
              - SUM(CASE WHEN e.compte_debit  IN ('401','4091','4092') THEN e.montant_fcfa ELSE 0 END)) DESC,
          u.nom
      `);
    } else if (tiersType === "exportateur") {
      // Compte 4111 — Clients exportateurs (créances sur ventes cacao)
      result = await db.execute<Row>(sql`
        SELECT
          e.tiers_id                                                             AS "tiersId",
          COALESCE(ex.nom, '—')                                                  AS nom,
          ''                                                                     AS prenoms,
          COALESCE(ex.pays, '')                                                  AS code,
          SUM(CASE WHEN e.compte_debit  IN ('411','4111') THEN e.montant_fcfa ELSE 0 END)::integer AS "totalDu",
          SUM(CASE WHEN e.compte_credit IN ('411','4111') THEN e.montant_fcfa ELSE 0 END)::integer AS "totalPaye",
          0::integer                                                             AS "totalIntrantsDus",
          0::integer                                                             AS "totalIntrantsRemb",
          (SUM(CASE WHEN e.compte_debit  IN ('411','4111') THEN e.montant_fcfa ELSE 0 END)
           - SUM(CASE WHEN e.compte_credit IN ('411','4111') THEN e.montant_fcfa ELSE 0 END))::integer AS "soldeNet"
        FROM ecritures_comptables e
        LEFT JOIN exportateurs ex ON ex.id = e.tiers_id
        WHERE e.cooperative_id = ${coop}
          AND e.tiers_type = 'exportateur'
          ${exerciceCond}
        GROUP BY e.tiers_id, ex.nom, ex.pays
        ORDER BY
          ABS(SUM(CASE WHEN e.compte_debit  IN ('411','4111') THEN e.montant_fcfa ELSE 0 END)
              - SUM(CASE WHEN e.compte_credit IN ('411','4111') THEN e.montant_fcfa ELSE 0 END)) DESC,
          ex.nom
      `);
    } else if (tiersType === "fournisseur_ext") {
      // Compte 401 — Fournisseurs externes (pisteurs, apporteurs tiers)
      result = await db.execute<Row>(sql`
        SELECT
          e.tiers_id                                                             AS "tiersId",
          COALESCE(f.nom, '—')                                                   AS nom,
          COALESCE(f.prenoms, '')                                                AS prenoms,
          COALESCE(f.code, '')                                                   AS code,
          SUM(CASE WHEN e.compte_credit = '401' THEN e.montant_fcfa ELSE 0 END)::integer AS "totalDu",
          SUM(CASE WHEN e.compte_debit  = '401' AND e.source = 'paiement'
                   THEN e.montant_fcfa ELSE 0 END)::integer                     AS "totalPaye",
          0::integer                                                             AS "totalIntrantsDus",
          0::integer                                                             AS "totalIntrantsRemb",
          (SUM(CASE WHEN e.compte_credit = '401' THEN e.montant_fcfa ELSE 0 END)
           - SUM(CASE WHEN e.compte_debit  = '401' THEN e.montant_fcfa ELSE 0 END))::integer AS "soldeNet"
        FROM ecritures_comptables e
        LEFT JOIN fournisseurs f ON f.id = e.tiers_id
        WHERE e.cooperative_id = ${coop}
          AND e.tiers_type = 'fournisseur_ext'
          ${exerciceCond}
        GROUP BY e.tiers_id, f.nom, f.prenoms, f.code
        ORDER BY
          ABS(SUM(CASE WHEN e.compte_credit = '401' THEN e.montant_fcfa ELSE 0 END)
              - SUM(CASE WHEN e.compte_debit  = '401' THEN e.montant_fcfa ELSE 0 END)) DESC,
          f.nom
      `);
    } else {
      // membre (défaut) — Comptes 401/4091/4092
      result = await db.execute<Row>(sql`
        SELECT
          e.tiers_id                                                            AS "tiersId",
          COALESCE(m.nom,          '—')                                         AS nom,
          COALESCE(m.prenoms,      '')                                          AS prenoms,
          COALESCE(m.carte_numero, '')                                          AS code,
          SUM(CASE WHEN e.compte_credit IN ('401','4091','4092') THEN e.montant_fcfa ELSE 0 END)::integer AS "totalDu",
          SUM(CASE WHEN e.compte_debit  IN ('401','4091','4092') AND e.source = 'paiement'
                   THEN e.montant_fcfa ELSE 0 END)::integer                    AS "totalPaye",
          SUM(CASE WHEN e.compte_debit  = '4091' THEN e.montant_fcfa ELSE 0 END)::integer AS "totalIntrantsDus",
          SUM(CASE WHEN e.compte_credit = '4091' THEN e.montant_fcfa ELSE 0 END)::integer AS "totalIntrantsRemb",
          (SUM(CASE WHEN e.compte_credit IN ('401','4091','4092') THEN e.montant_fcfa ELSE 0 END)
           - SUM(CASE WHEN e.compte_debit  IN ('401','4091','4092') THEN e.montant_fcfa ELSE 0 END))::integer AS "soldeNet"
        FROM ecritures_comptables e
        LEFT JOIN membres m ON m.id = e.tiers_id
        WHERE e.cooperative_id = ${coop}
          AND e.tiers_type = 'membre'
          ${exerciceCond}
        GROUP BY e.tiers_id, m.nom, m.prenoms, m.carte_numero
        ORDER BY
          ABS(SUM(CASE WHEN e.compte_credit IN ('401','4091','4092') THEN e.montant_fcfa ELSE 0 END)
              - SUM(CASE WHEN e.compte_debit  IN ('401','4091','4092') THEN e.montant_fcfa ELSE 0 END)) DESC,
          m.nom
      `);
    }

    res.json(result.rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getBalanceAuxiliaire");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── Grand livre tiers (position comptable individuelle) ─────────────────────
export async function getGrandLivreTiers(req: Request, res: Response): Promise<void> {
  try {
    const coop      = coopId(req);
    const tiersId   = parseInt(String(req.params["id"] ?? "0"));
    const tiersType = (req.query["type"] as string) || "membre";
    const exercice  = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : undefined;

    if (!tiersId) { res.status(400).json({ erreur: "id invalide" }); return; }

    const conds = [
      eq(ecrituresComptablesTable.cooperativeId, coop),
      eq(ecrituresComptablesTable.tiersId, tiersId),
      sql`tiers_type = ${tiersType}`,
    ];
    if (exercice) conds.push(eq(ecrituresComptablesTable.exercice, exercice));

    const ecritures = await db
      .select()
      .from(ecrituresComptablesTable)
      .where(and(...conds))
      .orderBy(asc(ecrituresComptablesTable.dateEcriture), asc(ecrituresComptablesTable.id));

    // Comptes "membre" OHADA (classe 4 fournisseur/avances)
    const COMPTES_FOURNISSEUR = new Set(["401", "4091", "4092"]);

    // Pour chaque écriture, on calcule l'impact du point de vue du membre :
    //   crédit sur compte fournisseur = la coop doit de l'argent au membre (+)
    //   débit  sur compte fournisseur = réduction de la dette (-)
    //   débit  sur 4091 = le membre doit des intrants à la coop (-)
    //   crédit sur 4091 = remboursement intrant (+)
    let solde = 0;
    const lignes = ecritures.map(e => {
      const creditFourn = COMPTES_FOURNISSEUR.has(e.compteCredit);
      const debitFourn  = COMPTES_FOURNISSEUR.has(e.compteDebit);
      const sens = creditFourn ? "credit" : debitFourn ? "debit" : "neutre";
      const impact = creditFourn ? e.montantFcfa : debitFourn ? -e.montantFcfa : 0;
      solde += impact;
      return {
        id:            e.id,
        dateEcriture:  e.dateEcriture,
        numeroPiece:   e.numeroPiece,
        libelle:       e.libelle,
        compteDebit:   e.compteDebit,
        compteCredit:  e.compteCredit,
        montantFcfa:   e.montantFcfa,
        source:        e.source,
        sens,
        impact,
        solde,
      };
    });

    // Totaux synthétiques
    const totalDuMembre      = ecritures.filter(e => COMPTES_FOURNISSEUR.has(e.compteCredit)).reduce((s, e) => s + e.montantFcfa, 0);
    const totalPaye          = ecritures.filter(e => COMPTES_FOURNISSEUR.has(e.compteDebit) && e.source === "paiement").reduce((s, e) => s + e.montantFcfa, 0);
    const totalIntrantsDus   = ecritures.filter(e => e.compteDebit === "4091").reduce((s, e) => s + e.montantFcfa, 0);
    const totalIntrantsRemb  = ecritures.filter(e => e.compteCredit === "4091").reduce((s, e) => s + e.montantFcfa, 0);

    res.json({
      tiersId, tiersType,
      lignes,
      totaux: {
        totalDuMembre,
        totalPaye,
        totalIntrantsDus,
        totalIntrantsRemb,
        soldeNet: solde,
      },
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getGrandLivreTiers");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function getApercuAffectationResultat(req: Request, res: Response): Promise<void> {
  try {
    const coop  = coopId(req);
    const annee = req.query["exercice"] ? parseInt(String(req.query["exercice"])) : exerciceCourant() - 1;

    // L'exercice doit être clôturé
    const [exercice] = await db.select().from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee)));
    if (!exercice || exercice.statut !== "cloture") {
      res.status(400).json({ erreur: `L'exercice ${annee} n'est pas clôturé` }); return;
    }

    // Solde compte 131 (bénéfice net porté en clôture)
    const soldeQ = await db.execute(sql`
      SELECT
        COALESCE(SUM(CASE WHEN compte_credit = '131' THEN montant_fcfa ELSE 0 END), 0)::bigint AS "credit131",
        COALESCE(SUM(CASE WHEN compte_debit  = '131' THEN montant_fcfa ELSE 0 END), 0)::bigint AS "debit131",
        COALESCE(SUM(CASE WHEN compte_credit = '139' THEN montant_fcfa ELSE 0 END), 0)::bigint AS "credit139",
        COALESCE(SUM(CASE WHEN compte_debit  = '139' THEN montant_fcfa ELSE 0 END), 0)::bigint AS "debit139"
      FROM ecritures_comptables
      WHERE cooperative_id = ${coop} AND exercice = ${annee}
        AND type_ecriture = 'cloture'
    `);
    const r = soldeQ.rows[0] as { credit131: number; debit131: number; credit139: number; debit139: number };
    const solde131 = Number(r.credit131) - Number(r.debit131);
    const solde139 = Number(r.credit139) - Number(r.debit139);

    // Vérifier si une affectation a déjà été enregistrée en N+1
    const affQ = await db.execute(sql`
      SELECT id, date_ecriture AS "dateEcriture", libelle, compte_debit AS "compteDebit",
             compte_credit AS "compteCredit", montant_fcfa AS "montantFcfa"
      FROM   ecritures_comptables
      WHERE  cooperative_id = ${coop}
        AND  exercice = ${annee + 1}
        AND  type_ecriture = 'affectation'
      ORDER  BY id
    `);
    const dejaAffecte = affQ.rows.length > 0;

    res.json({
      exercice: annee,
      solde131,
      solde139,
      compteResultat: solde131 >= solde139 ? "131" : "139",
      dejaAffecte,
      ecrituresAffectation: affQ.rows,
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getApercuAffectationResultat");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
export async function getStatutsExercices(req: Request, res: Response): Promise<void> {
  try {
    const coop = coopId(req);
    const rows = await db.select().from(exercicesTable)
      .where(eq(exercicesTable.cooperativeId, coop))
      .orderBy(desc(exercicesTable.annee));
    res.json(rows);
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    req.log.error({ err }, "Erreur getStatutsExercices");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function affecterResultat(req: Request, res: Response): Promise<void> {
  try {
    const coop           = coopId(req);
    const annee          = req.body.exercice        ? parseInt(String(req.body.exercice))        : null;
    const dateAG         = String(req.body.dateAG   ?? "").trim();
    const reserveLegale  = Math.round(Number(req.body.reserveLegale  ?? 0));
    const reportANouveau = Math.round(Number(req.body.reportANouveau ?? 0));
    const ristournes     = Math.round(Number(req.body.ristournes     ?? 0));

    if (!annee || isNaN(annee)) { res.status(400).json({ erreur: "Exercice manquant" }); return; }
    if (!dateAG || !/^\d{4}-\d{2}-\d{2}$/.test(dateAG)) {
      res.status(400).json({ erreur: "Date de l'AG invalide (format YYYY-MM-DD requis)" }); return;
    }
    if (reserveLegale < 0 || reportANouveau < 0 || ristournes < 0) {
      res.status(400).json({ erreur: "Les montants ne peuvent pas être négatifs" }); return;
    }
    const totalAffecte = reserveLegale + reportANouveau + ristournes;
    if (totalAffecte === 0) { res.status(400).json({ erreur: "Au moins un poste d'affectation doit être renseigné" }); return; }

    // L'exercice N doit être clôturé
    const [exercice] = await db.select().from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee)));
    if (!exercice || exercice.statut !== "cloture") {
      res.status(400).json({ erreur: `L'exercice ${annee} doit être clôturé avant l'affectation` }); return;
    }

    // L'exercice N+1 ne doit pas être clôturé (on ne peut pas écrire dans un exercice verrouillé)
    const [exerciceNPlus1] = await db.select({ statut: exercicesTable.statut }).from(exercicesTable)
      .where(and(eq(exercicesTable.cooperativeId, coop), eq(exercicesTable.annee, annee + 1)));
    if (exerciceNPlus1?.statut === "cloture") {
      res.status(409).json({ erreur: `L'exercice ${annee + 1} est déjà clôturé — impossible d'y écrire des écritures d'affectation` }); return;
    }

    // Solde 131 (calculé avant la transaction — lecture seule)
    const soldeQ = await db.execute(sql`
      SELECT
        (COALESCE(SUM(CASE WHEN compte_credit = '131' THEN montant_fcfa ELSE 0 END), 0)
         - COALESCE(SUM(CASE WHEN compte_debit = '131'  THEN montant_fcfa ELSE 0 END), 0))::bigint AS "solde131"
      FROM ecritures_comptables
      WHERE cooperative_id = ${coop} AND exercice = ${annee} AND type_ecriture = 'cloture'
    `);
    const solde131 = Number((soldeQ.rows[0] as { solde131: number }).solde131);

    if (solde131 <= 0) {
      res.status(400).json({ erreur: `L'exercice ${annee} présente un déficit (compte 139) — l'affectation de bénéfice n'est pas applicable` }); return;
    }
    // Tolérance d'arrondi de 1 FCFA
    if (Math.abs(totalAffecte - solde131) > 1) {
      res.status(400).json({
        erreur: `Le total affecté (${totalAffecte.toLocaleString("fr-FR")} FCFA) ne correspond pas au bénéfice net (${solde131.toLocaleString("fr-FR")} FCFA)`,
      }); return;
    }

    const exoAffect = annee + 1;

    type EntreeAff = {
      cooperativeId: number; dateEcriture: string; numeroPiece: string | null;
      libelle: string; compteDebit: string; compteCredit: string;
      montantFcfa: number; source: "manuel"; sourceId: null;
      exercice: number; typeEcriture: string;
    };
    const mk = (debit: string, credit: string, montant: number, libelle: string): EntreeAff[] => {
      const m = Math.round(montant);
      if (m <= 0) return [];
      return [{ cooperativeId: coop, dateEcriture: dateAG, numeroPiece: `AFF-${annee}-AG`, libelle,
                compteDebit: debit, compteCredit: credit, montantFcfa: m,
                source: "manuel", sourceId: null, exercice: exoAffect, typeEcriture: "affectation" }];
    };

    const entries: EntreeAff[] = [
      ...mk("131", "1061", reserveLegale,  `Réserve légale — affectation résultat ${annee}`),
      ...mk("131", "110",  reportANouveau, `Report à nouveau — affectation résultat ${annee}`),
      ...mk("131", "4461", ristournes,     `Ristournes membres — affectation résultat ${annee}`),
    ];

    if (entries.length === 0) { res.status(400).json({ erreur: "Aucune écriture à générer" }); return; }

    // Insertion atomique : advisory lock par (coop, annee) pour éviter les doublons concurrents
    let ecrituresGenerees = 0;
    await db.transaction(async (tx) => {
      // Lock exclusif pour cette coopérative + exercice source (libéré à la fin de la transaction)
      const lockKey = (BigInt(coop) << 20n) | BigInt(annee % (1 << 20));
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${lockKey})`);

      // Double-check à l'intérieur du verrou
      const dup = await tx.execute(sql`
        SELECT 1 FROM ecritures_comptables
        WHERE cooperative_id = ${coop} AND exercice = ${exoAffect} AND type_ecriture = 'affectation'
        LIMIT 1
      `);
      if (dup.rows.length > 0) {
        throw Object.assign(new Error("DUPLICATE_AFFECTATION"), { status: 409 });
      }

      await tx.insert(ecrituresComptablesTable).values(entries);
      ecrituresGenerees = entries.length;

      // Créer exercice N+1 s'il n'existe pas encore
      if (!exerciceNPlus1) {
        await tx.insert(exercicesTable).values({ cooperativeId: coop, annee: exoAffect, statut: "ouvert" });
      }
    });

    res.json({
      message: `Affectation du résultat ${annee} enregistrée avec succès`,
      exercice: annee,
      dateAG,
      solde131,
      affectation: { reserveLegale, reportANouveau, ristournes, total: totalAffecte },
      ecrituresGenerees,
    });
  } catch (err) {
    if (err instanceof TenantError) { res.status(401).json({ erreur: (err as TenantError).erreur }); return; }
    if ((err as Error & { status?: number }).status === 409) {
      res.status(409).json({ erreur: `Une affectation du résultat ${req.body.exercice} existe déjà` }); return;
    }
    req.log.error({ err }, "Erreur affecterResultat");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
