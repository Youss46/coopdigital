import { Request, Response } from "express";
import { db } from "@workspace/db";
import {
  bailleursTable,
  subventionsTable,
  tranchesSubventionTable,
  lignesBudgetSubventionTable,
  rapportsBailleursTable,
  ecrituresComptablesTable,
} from "@workspace/db";
import { eq, and, sql, desc, asc } from "drizzle-orm";

const COOP_ID = 1;

const pid = (v: string | string[]): number => parseInt(Array.isArray(v) ? v[0] : v, 10);

// ─── BAILLEURS ────────────────────────────────────────────────────────────────

export async function listerBailleurs(req: Request, res: Response): Promise<void> {
  const rows = await db
    .select()
    .from(bailleursTable)
    .where(eq(bailleursTable.cooperativeId, COOP_ID))
    .orderBy(asc(bailleursTable.nom));
  res.json(rows);
}

export async function creerBailleur(req: Request, res: Response): Promise<void> {
  const { nom, type, pays, contactNom, contactEmail, contactTelephone } = req.body as {
    nom?: string; type?: string; pays?: string; contactNom?: string; contactEmail?: string; contactTelephone?: string;
  };
  if (!nom) { res.status(400).json({ erreur: "nom requis" }); return; }

  const [row] = await db.insert(bailleursTable).values({
    cooperativeId:    COOP_ID,
    nom,
    type:             (type as "ong" | "institution" | "etat" | "prive") ?? "ong",
    pays,
    contactNom,
    contactEmail,
    contactTelephone,
  }).returning();
  res.status(201).json(row);
}

export async function modifierBailleur(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  const { nom, type, pays, contactNom, contactEmail, contactTelephone } = req.body as {
    nom?: string; type?: string; pays?: string; contactNom?: string; contactEmail?: string; contactTelephone?: string;
  };
  const [row] = await db
    .update(bailleursTable)
    .set({ nom, type: type as "ong" | "institution" | "etat" | "prive" | undefined, pays, contactNom, contactEmail, contactTelephone })
    .where(and(eq(bailleursTable.id, id), eq(bailleursTable.cooperativeId, COOP_ID)))
    .returning();
  if (!row) { res.status(404).json({ erreur: "Bailleur introuvable" }); return; }
  res.json(row);
}

export async function supprimerBailleur(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  await db.delete(bailleursTable)
    .where(and(eq(bailleursTable.id, id), eq(bailleursTable.cooperativeId, COOP_ID)));
  res.status(204).end();
}

// ─── SUBVENTIONS ──────────────────────────────────────────────────────────────

export async function listerSubventions(req: Request, res: Response): Promise<void> {
  const rows = await db
    .select({ subvention: subventionsTable, bailleur: bailleursTable })
    .from(subventionsTable)
    .leftJoin(bailleursTable, eq(subventionsTable.bailleurId, bailleursTable.id))
    .where(eq(subventionsTable.cooperativeId, COOP_ID))
    .orderBy(desc(subventionsTable.createdAt));

  const aujourd_hui = new Date();
  const result = rows.map(({ subvention, bailleur }) => {
    const total   = parseFloat(subvention.montantTotalFcfa ?? "0");
    const solde   = parseFloat(subvention.montantSoldeFcfa ?? "0");
    const utilise = total - solde;
    const tauxUtil = total > 0 ? (utilise / total) * 100 : 0;

    let alerteExpiration = false;
    if (subvention.dateFin) {
      const jours = Math.ceil((new Date(subvention.dateFin).getTime() - aujourd_hui.getTime()) / 86400000);
      alerteExpiration = jours >= 0 && jours <= 60;
    }
    let alerteSousUtilisation = false;
    if (subvention.dateDebut && subvention.dateFin) {
      const debut    = new Date(subvention.dateDebut).getTime();
      const fin      = new Date(subvention.dateFin).getTime();
      const parcouru = (aujourd_hui.getTime() - debut) / (fin - debut);
      alerteSousUtilisation = parcouru >= 0.5 && tauxUtil < 30;
    }
    return { ...subvention, bailleur, tauxUtilisationPct: Math.round(tauxUtil), alerteExpiration, alerteSousUtilisation };
  });
  res.json(result);
}

export async function creerSubvention(req: Request, res: Response): Promise<void> {
  const {
    bailleurId, reference, libelle, montantTotalFcfa, deviseOrigine, montantDeviseOrigine,
    dateConvention, dateDebut, dateFin, statut, conditions, rapportRequis, periodiciteRapport,
    lignesBudget,
  } = req.body as {
    bailleurId?: number; reference?: string; libelle?: string; montantTotalFcfa?: number;
    deviseOrigine?: string; montantDeviseOrigine?: number; dateConvention?: string;
    dateDebut?: string; dateFin?: string; statut?: string; conditions?: string;
    rapportRequis?: boolean; periodiciteRapport?: string; lignesBudget?: { posteBudgetaire: string; montantAlloueFcfa: number }[];
  };

  if (!bailleurId || !reference || !libelle || !montantTotalFcfa) {
    res.status(400).json({ erreur: "bailleurId, reference, libelle, montantTotalFcfa requis" });
    return;
  }

  const [sub] = await db.insert(subventionsTable).values({
    cooperativeId:        COOP_ID,
    bailleurId,
    reference,
    libelle,
    montantTotalFcfa:     String(montantTotalFcfa),
    montantSoldeFcfa:     String(montantTotalFcfa),
    deviseOrigine:        deviseOrigine ?? "XOF",
    montantDeviseOrigine: montantDeviseOrigine ? String(montantDeviseOrigine) : undefined,
    dateConvention,
    dateDebut,
    dateFin,
    statut:               (statut as "en_attente" | "actif" | "cloture" | "suspendu") ?? "en_attente",
    conditions,
    rapportRequis:        rapportRequis ?? true,
    periodiciteRapport,
  }).returning();

  if (Array.isArray(lignesBudget) && lignesBudget.length > 0) {
    await db.insert(lignesBudgetSubventionTable).values(
      lignesBudget.map((l) => ({
        subventionId:      sub.id,
        posteBudgetaire:   l.posteBudgetaire,
        montantAlloueFcfa: String(l.montantAlloueFcfa ?? 0),
      }))
    );
  }
  res.status(201).json(sub);
}

export async function getSubventionDetail(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);

  const [found] = await db
    .select({ subvention: subventionsTable, bailleur: bailleursTable })
    .from(subventionsTable)
    .leftJoin(bailleursTable, eq(subventionsTable.bailleurId, bailleursTable.id))
    .where(and(eq(subventionsTable.id, id), eq(subventionsTable.cooperativeId, COOP_ID)))
    .limit(1);

  if (!found) { res.status(404).json({ erreur: "Subvention introuvable" }); return; }

  const [tranches, lignes, rapports] = await Promise.all([
    db.select().from(tranchesSubventionTable).where(eq(tranchesSubventionTable.subventionId, id)).orderBy(asc(tranchesSubventionTable.numeroTranche)),
    db.select().from(lignesBudgetSubventionTable).where(eq(lignesBudgetSubventionTable.subventionId, id)),
    db.select().from(rapportsBailleursTable).where(eq(rapportsBailleursTable.subventionId, id)).orderBy(desc(rapportsBailleursTable.createdAt)),
  ]);

  res.json({ ...found, tranches, lignes, rapports });
}

// ─── RÉCEPTION TRANCHE ────────────────────────────────────────────────────────

export async function enregistrerTranche(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  const { montantFcfa, datePrevue, referenceVirement, trancheId } = req.body as {
    montantFcfa?: number; datePrevue?: string; referenceVirement?: string; trancheId?: number;
  };

  if (!montantFcfa) { res.status(400).json({ erreur: "montantFcfa requis" }); return; }

  const [sub] = await db
    .select()
    .from(subventionsTable)
    .where(and(eq(subventionsTable.id, id), eq(subventionsTable.cooperativeId, COOP_ID)))
    .limit(1);
  if (!sub) { res.status(404).json({ erreur: "Subvention introuvable" }); return; }

  const montant        = parseFloat(String(montantFcfa));
  const nouvelleRecus  = parseFloat(sub.montantRecuFcfa  ?? "0") + montant;
  const nouveauSolde   = Math.max(parseFloat(sub.montantTotalFcfa ?? "0") - nouvelleRecus, 0);

  if (trancheId) {
    await db.update(tranchesSubventionTable)
      .set({ statut: "recue", dateRecue: new Date().toISOString().slice(0, 10), referenceVirement })
      .where(eq(tranchesSubventionTable.id, trancheId));
  } else {
    const [cnt] = await db.select({ c: sql<number>`COUNT(*)::int` })
      .from(tranchesSubventionTable)
      .where(eq(tranchesSubventionTable.subventionId, id));
    await db.insert(tranchesSubventionTable).values({
      subventionId:      id,
      numeroTranche:     (Number(cnt?.c ?? 0)) + 1,
      montantFcfa:       String(montant),
      datePrevue,
      dateRecue:         new Date().toISOString().slice(0, 10),
      statut:            "recue",
      referenceVirement,
    });
  }

  await db.update(subventionsTable)
    .set({ montantRecuFcfa: String(nouvelleRecus), montantSoldeFcfa: String(nouveauSolde), statut: "actif", updatedAt: new Date() })
    .where(eq(subventionsTable.id, id));

  // Écriture comptable : Débit 521 (Banque) / Crédit 141 (Subventions reçues)
  await db.insert(ecrituresComptablesTable).values({
    cooperativeId: COOP_ID,
    libelle:       `Réception tranche subvention - ${sub.reference}`,
    compteDebit:   "521",
    compteCredit:  "141",
    montantFcfa:   Math.round(montant),
    dateEcriture:  new Date().toISOString().slice(0, 10),
    exercice:      new Date().getFullYear(),
    source:        "encaissement",
    sourceId:      id,
  });

  req.log.info({ subventionId: id, montant }, "Tranche subvention enregistrée");
  res.json({ ok: true, montantRecuFcfa: nouvelleRecus, montantSoldeFcfa: nouveauSolde });
}

// ─── UTILISER FONDS ───────────────────────────────────────────────────────────

export async function utiliserFonds(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  const { ligneId, montant, justificatifUrl } = req.body as {
    ligneId?: number; montant?: number; justificatifUrl?: string;
  };

  if (!ligneId || !montant) { res.status(400).json({ erreur: "ligneId et montant requis" }); return; }

  const [ligne] = await db
    .select()
    .from(lignesBudgetSubventionTable)
    .where(and(eq(lignesBudgetSubventionTable.id, ligneId), eq(lignesBudgetSubventionTable.subventionId, id)))
    .limit(1);
  if (!ligne) { res.status(404).json({ erreur: "Ligne budgétaire introuvable" }); return; }

  const alloue        = parseFloat(ligne.montantAlloueFcfa  ?? "0");
  const utilise       = parseFloat(ligne.montantUtiliseFcfa ?? "0");
  const nouvelUtilise = utilise + parseFloat(String(montant));

  if (nouvelUtilise > alloue) {
    res.status(400).json({ erreur: "Montant dépasse l'allocation disponible", solde: alloue - utilise });
    return;
  }

  const [updated] = await db
    .update(lignesBudgetSubventionTable)
    .set({ montantUtiliseFcfa: String(nouvelUtilise), justificatifUrl: justificatifUrl ?? ligne.justificatifUrl })
    .where(eq(lignesBudgetSubventionTable.id, ligneId))
    .returning();

  await db.update(subventionsTable).set({ updatedAt: new Date() }).where(eq(subventionsTable.id, id));
  req.log.info({ subventionId: id, ligneId, montant }, "Fonds subvention utilisés");
  res.json(updated);
}

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

export async function getDashboard(req: Request, res: Response): Promise<void> {
  const rows = await db
    .select()
    .from(subventionsTable)
    .where(and(eq(subventionsTable.cooperativeId, COOP_ID), sql`statut != 'cloture'`));

  let totalRecu = 0, totalSolde = 0, totalTotal = 0;
  for (const s of rows) {
    totalTotal += parseFloat(s.montantTotalFcfa ?? "0");
    totalRecu  += parseFloat(s.montantRecuFcfa  ?? "0");
    totalSolde += parseFloat(s.montantSoldeFcfa ?? "0");
  }
  const totalUtilise       = totalRecu - totalSolde;
  const tauxUtilisationPct = totalRecu > 0 ? Math.round((totalUtilise / totalRecu) * 100) : 0;

  const prochaines = await db
    .select({ tranche: tranchesSubventionTable, subvention: subventionsTable })
    .from(tranchesSubventionTable)
    .innerJoin(subventionsTable, eq(tranchesSubventionTable.subventionId, subventionsTable.id))
    .where(and(
      eq(subventionsTable.cooperativeId, COOP_ID),
      eq(tranchesSubventionTable.statut, "attendue"),
    ))
    .orderBy(asc(tranchesSubventionTable.datePrevue))
    .limit(1);

  res.json({
    totalRecu:            Math.round(totalRecu),
    totalUtilise:         Math.round(totalUtilise),
    soldeDisponible:      Math.round(totalSolde),
    tauxUtilisationPct,
    nbSubventionsActives: rows.filter((s) => s.statut === "actif").length,
    prochaineTranche:     prochaines[0] ?? null,
  });
}

// ─── RAPPORT BAILLEUR ─────────────────────────────────────────────────────────

export async function genererRapport(req: Request, res: Response): Promise<void> {
  const id = pid(req.params.id);
  const { periode, typeRapport } = req.body as { periode?: string; typeRapport?: string };

  const [found] = await db
    .select({ subvention: subventionsTable, bailleur: bailleursTable })
    .from(subventionsTable)
    .leftJoin(bailleursTable, eq(subventionsTable.bailleurId, bailleursTable.id))
    .where(and(eq(subventionsTable.id, id), eq(subventionsTable.cooperativeId, COOP_ID)))
    .limit(1);
  if (!found) { res.status(404).json({ erreur: "Subvention introuvable" }); return; }

  const [lignes, tranches] = await Promise.all([
    db.select().from(lignesBudgetSubventionTable).where(eq(lignesBudgetSubventionTable.subventionId, id)),
    db.select().from(tranchesSubventionTable).where(eq(tranchesSubventionTable.subventionId, id)),
  ]);

  const tonnageResult = await db.execute<{ tonnage: string }>(
    sql`SELECT COALESCE(SUM(poids_kg), 0)::text AS tonnage FROM livraisons WHERE cooperative_id = ${COOP_ID}`
  );
  const membresResult = await db.execute<{ nb: string }>(
    sql`SELECT COUNT(*)::text AS nb FROM membres WHERE cooperative_id = ${COOP_ID} AND statut = 'actif'`
  );

  const contenuJson = {
    subvention:       { id, reference: found.subvention.reference, libelle: found.subvention.libelle },
    bailleur:         found.bailleur,
    periode,
    typeRapport,
    dateGeneration:   new Date().toISOString(),
    utilisationFonds: lignes.map((l) => {
      const alloue  = parseFloat(l.montantAlloueFcfa  ?? "0");
      const utilise = parseFloat(l.montantUtiliseFcfa ?? "0");
      return {
        posteBudgetaire: l.posteBudgetaire,
        montantAlloue:   alloue,
        montantUtilise:  utilise,
        solde:           alloue - utilise,
        tauxUtilisation: alloue > 0 ? Math.round((utilise / alloue) * 100) : 0,
      };
    }),
    tranches,
    donneesCoopDigital: {
      tonnageTotalKg:  parseFloat(tonnageResult.rows[0]?.["tonnage"] ?? "0"),
      nbMembresActifs: parseInt(membresResult.rows[0]?.["nb"] ?? "0"),
    },
  };

  const [rapport] = await db.insert(rapportsBailleursTable).values({
    subventionId:  id,
    cooperativeId: COOP_ID,
    periode,
    typeRapport,
    statut:        "brouillon",
    contenuJson,
  }).returning();

  res.status(201).json({ rapport, contenuJson });
}

export async function soumettreRapport(req: Request, res: Response): Promise<void> {
  const rapportId = pid(req.params.rapportId);
  const [updated] = await db
    .update(rapportsBailleursTable)
    .set({ statut: "soumis", dateSoumission: new Date().toISOString().slice(0, 10) })
    .where(eq(rapportsBailleursTable.id, rapportId))
    .returning();
  res.json(updated);
}
