import { db, donsTable, lignesDonNatureTable, categoriesDonsTable, programmeDonsTable, membresTable, configComptableTable } from "@workspace/db";
import { eq, and, sql, desc, asc, gte, lte, isNotNull } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { proposerEcriture } from "./comptabiliteService.js";



// ── Helpers ────────────────────────────────────────────────────────────────────

function toDateStr(d: Date | string): string {
  return typeof d === "string" ? d : d.toISOString().slice(0, 10);
}

// ── Génération de référence ────────────────────────────────────────────────────

export async function genererReference(cooperativeId: number, sens: "effectue" | "recu"): Promise<string> {
  const annee = new Date().getFullYear();
  const prefix = sens === "effectue" ? "DON-EFF" : "DON-REC";
  const [row] = await db
    .select({ nb: sql<number>`count(*)::int` })
    .from(donsTable)
    .where(
      and(
        eq(donsTable.cooperativeId, cooperativeId),
        eq(donsTable.sens, sens),
        sql`EXTRACT(year FROM date_don) = ${annee}`,
      ),
    );
  const num = String((row?.nb ?? 0) + 1).padStart(4, "0");
  return `${prefix}-${annee}-${num}`;
}

// ── Créer un don ───────────────────────────────────────────────────────────────

export interface CreerDonPayload {
  sens: "effectue" | "recu";
  forme: "especes" | "nature";
  categorieId?: number;
  campagneId?: number;
  libelle: string;
  description?: string;
  dateDon: string;
  // Bénéficiaire
  beneficiaireType?: string;
  beneficiaireMembreId?: number;
  beneficiaireNom?: string;
  beneficiaireVillage?: string;
  beneficiaireContact?: string;
  // Donateur
  donateurType?: string;
  donateurNom?: string;
  donateurContact?: string;
  // Montant
  montantFcfa?: number;
  pvRemise?: boolean;
  // Lignes nature
  lignesNature?: Array<{
    designation: string;
    quantite: number;
    unite: string;
    valeurUnitaireFcfa: number;
  }>;
  enregistrePar?: number;
}

export async function creerDon(cooperativeId: number, payload: CreerDonPayload) {
  const reference = await genererReference(cooperativeId, payload.sens);

  const [don] = await db
    .insert(donsTable)
    .values({
      cooperativeId: cooperativeId,
      campagneId: payload.campagneId ?? null,
      sens: payload.sens,
      forme: payload.forme,
      categorieId: payload.categorieId ?? null,
      reference,
      libelle: payload.libelle,
      description: payload.description ?? null,
      dateDon: payload.dateDon,
      beneficiaireType: payload.beneficiaireType ?? null,
      beneficiaireMembreId: payload.beneficiaireMembreId ?? null,
      beneficiaireNom: payload.beneficiaireNom ?? null,
      beneficiaireVillage: payload.beneficiaireVillage ?? null,
      beneficiaireContact: payload.beneficiaireContact ?? null,
      donateurType: payload.donateurType ?? null,
      donateurNom: payload.donateurNom ?? null,
      donateurContact: payload.donateurContact ?? null,
      montantFcfa: String(payload.montantFcfa ?? 0),
      valeurEstimeeFcfa: "0",
      pvRemise: payload.pvRemise ?? false,
      enregistrePar: payload.enregistrePar ?? null,
      statut: "brouillon",
    })
    .returning();

  if (!don) throw new Error("Erreur lors de la création du don");

  // Insérer les lignes nature si applicable
  if (payload.forme === "nature" && payload.lignesNature && payload.lignesNature.length > 0) {
    await db.insert(lignesDonNatureTable).values(
      payload.lignesNature.map((l) => ({
        donId: don.id,
        designation: l.designation,
        quantite: String(l.quantite),
        unite: l.unite,
        valeurUnitaireFcfa: String(l.valeurUnitaireFcfa),
      })),
    );
    await calculerValeurNature(don.id);
  }

  return don;
}

// ── Calculer valeur nature ─────────────────────────────────────────────────────

export async function calculerValeurNature(donId: number): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`COALESCE(SUM(valeur_totale_fcfa), 0)::text` })
    .from(lignesDonNatureTable)
    .where(eq(lignesDonNatureTable.donId, donId));
  const total = parseFloat(row?.total ?? "0");
  await db
    .update(donsTable)
    .set({ valeurEstimeeFcfa: String(total) })
    .where(eq(donsTable.id, donId));
  return total;
}

// ── Valider un don ─────────────────────────────────────────────────────────────

export async function validerDon(donId: number, userId: number) {
  const [don] = await db.select().from(donsTable).where(eq(donsTable.id, donId)).limit(1);
  if (!don) throw new Error("Don introuvable");
  if (don.statut !== "brouillon") throw new Error("Le don n'est pas en statut brouillon");

  await db
    .update(donsTable)
    .set({ statut: "valide", validePar: userId, dateValidation: new Date() })
    .where(eq(donsTable.id, donId));

  // Générer les écritures comptables OHADA
  const montant = don.forme === "especes"
    ? parseFloat(String(don.montantFcfa ?? 0))
    : parseFloat(String(don.valeurEstimeeFcfa ?? 0));

  if (montant > 0) {
    try {
      if (don.sens === "effectue") {
        // 658 Dons et libéralités / 521 Banque (ou 571 Caisse si espèces)
        const compteCredit = don.forme === "especes" ? "521" : "31";
        await proposerEcriture(don.cooperativeId, {
          source: "don",
          sourceId: donId,
          libelle: `Don effectué – ${don.libelle} [${don.reference ?? ""}]`,
          compteDebit: "658",
          compteCredit,
          montantFcfa: montant,
          date: toDateStr(don.dateDon),
          numeroPiece: don.reference ?? undefined,
        });
      } else {
        // 521 Banque ou 31 Stocks / 754 Dons et subventions reçus
        const compteDebit = don.forme === "especes" ? "521" : "31";
        await proposerEcriture(don.cooperativeId, {
          source: "don",
          sourceId: donId,
          libelle: `Don reçu – ${don.libelle} [${don.reference ?? ""}]`,
          compteDebit,
          compteCredit: "754",
          montantFcfa: montant,
          date: toDateStr(don.dateDon),
          numeroPiece: don.reference ?? undefined,
        });
      }
      await db.update(donsTable).set({ ecritureGeneree: true }).where(eq(donsTable.id, donId));
    } catch (err) {
      logger.error({ err, donId }, "Erreur génération écriture don");
    }
  }

  return await getDonDetail(don.cooperativeId, donId);
}

// ── Annuler un don ─────────────────────────────────────────────────────────────

export async function annulerDon(donId: number, motif: string) {
  const [don] = await db.select().from(donsTable).where(eq(donsTable.id, donId)).limit(1);
  if (!don) throw new Error("Don introuvable");
  if (don.statut === "annule") throw new Error("Don déjà annulé");

  const [updated] = await db
    .update(donsTable)
    .set({ statut: "annule", motifAnnulation: motif, updatedAt: new Date() })
    .where(eq(donsTable.id, donId))
    .returning();
  return updated;
}

// ── Modifier un don ────────────────────────────────────────────────────────────

export async function modifierDon(donId: number, payload: Partial<CreerDonPayload>) {
  const [don] = await db.select().from(donsTable).where(eq(donsTable.id, donId)).limit(1);
  if (!don) throw new Error("Don introuvable");
  if (don.statut !== "brouillon") throw new Error("Seuls les dons en brouillon peuvent être modifiés");

  type DonUpdate = typeof donsTable.$inferInsert;
  const update: Partial<DonUpdate> = { updatedAt: new Date() };
  if (payload.libelle !== undefined) update.libelle = payload.libelle;
  if (payload.description !== undefined) update.description = payload.description;
  if (payload.dateDon !== undefined) update.dateDon = payload.dateDon;
  if (payload.categorieId !== undefined) update.categorieId = payload.categorieId;
  if (payload.montantFcfa !== undefined) update.montantFcfa = String(payload.montantFcfa);
  if (payload.beneficiaireNom !== undefined) update.beneficiaireNom = payload.beneficiaireNom;
  if (payload.beneficiaireType !== undefined) update.beneficiaireType = payload.beneficiaireType;
  if (payload.beneficiaireMembreId !== undefined) update.beneficiaireMembreId = payload.beneficiaireMembreId;
  if (payload.beneficiaireVillage !== undefined) update.beneficiaireVillage = payload.beneficiaireVillage;
  if (payload.beneficiaireContact !== undefined) update.beneficiaireContact = payload.beneficiaireContact;
  if (payload.donateurNom !== undefined) update.donateurNom = payload.donateurNom;
  if (payload.donateurType !== undefined) update.donateurType = payload.donateurType;
  if (payload.donateurContact !== undefined) update.donateurContact = payload.donateurContact;
  if (payload.pvRemise !== undefined) update.pvRemise = payload.pvRemise;

  const [updated] = await db
    .update(donsTable)
    .set(update)
    .where(eq(donsTable.id, donId))
    .returning();

  // Mettre à jour les lignes nature si fournies
  if (payload.lignesNature !== undefined && payload.lignesNature.length > 0) {
    await db.delete(lignesDonNatureTable).where(eq(lignesDonNatureTable.donId, donId));
    await db.insert(lignesDonNatureTable).values(
      payload.lignesNature.map((l) => ({
        donId,
        designation: l.designation,
        quantite: String(l.quantite),
        unite: l.unite,
        valeurUnitaireFcfa: String(l.valeurUnitaireFcfa),
      })),
    );
    await calculerValeurNature(donId);
  }

  return updated;
}

// ── Liste des dons ─────────────────────────────────────────────────────────────

export interface FiltreDons {
  sens?: string;
  forme?: string;
  categorieId?: number;
  statut?: string;
  dateDebut?: string;
  dateFin?: string;
  beneficiaireMembreId?: number;
}

export async function listerDons(cooperativeId: number, filtres: FiltreDons = {}) {
  const conditions = [eq(donsTable.cooperativeId, cooperativeId)];
  if (filtres.sens) conditions.push(eq(donsTable.sens, filtres.sens));
  if (filtres.forme) conditions.push(eq(donsTable.forme, filtres.forme));
  if (filtres.statut) conditions.push(eq(donsTable.statut, filtres.statut));
  if (filtres.categorieId) conditions.push(eq(donsTable.categorieId, filtres.categorieId));
  if (filtres.dateDebut) conditions.push(gte(donsTable.dateDon, filtres.dateDebut));
  if (filtres.dateFin) conditions.push(lte(donsTable.dateDon, filtres.dateFin));
  if (filtres.beneficiaireMembreId) {
    conditions.push(eq(donsTable.beneficiaireMembreId, filtres.beneficiaireMembreId));
  }

  const rows = await db
    .select({
      don: donsTable,
      categorie: categoriesDonsTable,
    })
    .from(donsTable)
    .leftJoin(categoriesDonsTable, eq(donsTable.categorieId, categoriesDonsTable.id))
    .where(and(...conditions))
    .orderBy(desc(donsTable.dateDon));

  return rows.map(({ don, categorie }) => ({
    ...don,
    categorieLibelle: categorie?.libelle ?? null,
  }));
}

// ── Détail d'un don ────────────────────────────────────────────────────────────

export async function getDonDetail(cooperativeId: number, donId: number) {
  const [row] = await db
    .select({ don: donsTable, categorie: categoriesDonsTable })
    .from(donsTable)
    .leftJoin(categoriesDonsTable, eq(donsTable.categorieId, categoriesDonsTable.id))
    .where(and(eq(donsTable.id, donId), eq(donsTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!row) throw new Error("Don introuvable");

  const lignes = await db
    .select()
    .from(lignesDonNatureTable)
    .where(eq(lignesDonNatureTable.donId, donId))
    .orderBy(asc(lignesDonNatureTable.id));

  return {
    ...row.don,
    categorieLibelle: row.categorie?.libelle ?? null,
    lignesNature: lignes,
  };
}

// ── Historique dons d'un membre ────────────────────────────────────────────────

export async function getDonsMembre(cooperativeId: number, membreId: number) {
  const rows = await db
    .select({ don: donsTable, categorie: categoriesDonsTable })
    .from(donsTable)
    .leftJoin(categoriesDonsTable, eq(donsTable.categorieId, categoriesDonsTable.id))
    .where(
      and(
        eq(donsTable.cooperativeId, cooperativeId),
        eq(donsTable.beneficiaireMembreId, membreId),
        eq(donsTable.statut, "valide"),
      ),
    )
    .orderBy(desc(donsTable.dateDon));

  const total = rows.reduce((acc, r) => {
    const m = r.don.forme === "especes"
      ? parseFloat(String(r.don.montantFcfa ?? 0))
      : parseFloat(String(r.don.valeurEstimeeFcfa ?? 0));
    return acc + m;
  }, 0);

  return {
    dons: rows.map(({ don, categorie }) => ({
      ...don,
      categorieLibelle: categorie?.libelle ?? null,
    })),
    totalRecu: total,
  };
}

// ── Statistiques ───────────────────────────────────────────────────────────────

export async function getStatsDons(cooperativeId: number, campagneId?: number) {
  const cond = [eq(donsTable.cooperativeId, cooperativeId), eq(donsTable.statut, "valide")];
  if (campagneId) cond.push(eq(donsTable.campagneId, campagneId));

  const rows = await db
    .select({ don: donsTable, categorie: categoriesDonsTable })
    .from(donsTable)
    .leftJoin(categoriesDonsTable, eq(donsTable.categorieId, categoriesDonsTable.id))
    .where(and(...cond))
    .orderBy(desc(donsTable.dateDon));

  const effectues = rows.filter((r) => r.don.sens === "effectue");
  const recus = rows.filter((r) => r.don.sens === "recu");

  function somme(list: typeof rows) {
    return list.reduce((acc, r) => {
      const m = r.don.forme === "especes"
        ? parseFloat(String(r.don.montantFcfa ?? 0))
        : parseFloat(String(r.don.valeurEstimeeFcfa ?? 0));
      return acc + m;
    }, 0);
  }

  function sommesEspNat(list: typeof rows) {
    return {
      nb: list.length,
      montantEspeces: list.filter((r) => r.don.forme === "especes")
        .reduce((acc, r) => acc + parseFloat(String(r.don.montantFcfa ?? 0)), 0),
      valeurNature: list.filter((r) => r.don.forme === "nature")
        .reduce((acc, r) => acc + parseFloat(String(r.don.valeurEstimeeFcfa ?? 0)), 0),
      total: somme(list),
    };
  }

  // Par catégorie
  const parCategorie = new Map<string, { label: string; montant: number }>();
  for (const { don, categorie } of rows) {
    const label = categorie?.libelle ?? "Sans catégorie";
    const montant = don.forme === "especes"
      ? parseFloat(String(don.montantFcfa ?? 0))
      : parseFloat(String(don.valeurEstimeeFcfa ?? 0));
    const existing = parCategorie.get(label) ?? { label, montant: 0 };
    parCategorie.set(label, { ...existing, montant: existing.montant + montant });
  }

  // Par mois (12 derniers mois)
  const parMois: Record<string, { effectue: number; recu: number }> = {};
  for (const { don } of rows) {
    const mois = String(don.dateDon).slice(0, 7);
    if (!parMois[mois]) parMois[mois] = { effectue: 0, recu: 0 };
    const montant = don.forme === "especes"
      ? parseFloat(String(don.montantFcfa ?? 0))
      : parseFloat(String(don.valeurEstimeeFcfa ?? 0));
    if (don.sens === "effectue") parMois[mois].effectue += montant;
    else parMois[mois].recu += montant;
  }

  const totalEffectue = somme(effectues);
  const totalRecu = somme(recus);

  return {
    donsEffectues: sommesEspNat(effectues),
    donsRecus: sommesEspNat(recus),
    soldeNet: totalRecu - totalEffectue,
    parCategorie: Array.from(parCategorie.values())
      .sort((a, b) => b.montant - a.montant)
      .slice(0, 10),
    parMois: Object.entries(parMois)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([mois, val]) => ({ mois, ...val })),
    derniersDons: rows.slice(0, 5).map(({ don, categorie }) => ({
      ...don,
      categorieLibelle: categorie?.libelle ?? null,
    })),
  };
}

// ── Catégories ─────────────────────────────────────────────────────────────────

export async function getCategories(cooperativeId: number, sens?: "effectue" | "recu") {
  const cond = [eq(categoriesDonsTable.cooperativeId, cooperativeId)];
  if (sens) cond.push(eq(categoriesDonsTable.sens, sens));
  return db
    .select()
    .from(categoriesDonsTable)
    .where(and(...cond))
    .orderBy(asc(categoriesDonsTable.libelle));
}

// ── Programmes ─────────────────────────────────────────────────────────────────

export async function listerProgrammes(cooperativeId: number) {
  return db
    .select()
    .from(programmeDonsTable)
    .where(eq(programmeDonsTable.cooperativeId, cooperativeId))
    .orderBy(desc(programmeDonsTable.createdAt));
}

export async function creerProgramme(cooperativeId: number, payload: {
  libelle: string;
  description?: string;
  budgetAlloueFcfa: number;
  dateDebut?: string;
  dateFin?: string;
}) {
  const [prog] = await db
    .insert(programmeDonsTable)
    .values({
      cooperativeId: cooperativeId,
      libelle: payload.libelle,
      description: payload.description ?? null,
      budgetAlloueFcfa: String(payload.budgetAlloueFcfa),
      dateDebut: payload.dateDebut ?? null,
      dateFin: payload.dateFin ?? null,
    })
    .returning();
  return prog;
}

export async function cloturerProgramme(cooperativeId: number, programmeId: number) {
  const [prog] = await db
    .update(programmeDonsTable)
    .set({ statut: "cloture" })
    .where(and(eq(programmeDonsTable.id, programmeId), eq(programmeDonsTable.cooperativeId, cooperativeId)))
    .returning();
  return prog;
}

// ── Rapport PDF ─────────────────────────────────────────────────────────────────

export async function generateRapportDonsPDF(cooperativeId: number, res: import("express").Response, campagneId?: number) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFDocument = require("pdfkit") as typeof import("pdfkit");
  const stats = await getStatsDons(cooperativeId, campagneId);
  const donsEffectues = (await listerDons(cooperativeId, { sens: "effectue", statut: "valide" }));
  const donsRecus = (await listerDons(cooperativeId, { sens: "recu", statut: "valide" }));
  const programmes = await listerProgrammes(cooperativeId);
  const annee = new Date().getFullYear();

  const doc = new PDFDocument({ margin: 40, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="rapport-dons-${annee}.pdf"`);
  doc.pipe(res);

  function titre(texte: string) {
    doc.fontSize(16).font("Helvetica-Bold").text(texte, { underline: true });
    doc.moveDown(0.5);
  }

  function sousTitre(texte: string) {
    doc.fontSize(12).font("Helvetica-Bold").text(texte);
    doc.moveDown(0.3);
  }

  function ligne(label: string, valeur: string) {
    doc.fontSize(10).font("Helvetica-Bold").text(`${label}: `, { continued: true });
    doc.font("Helvetica").text(valeur);
  }

  const fcfa = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FCFA";

  // ── Page 1 — Résumé ─────────────────────────────────────────────────────────
  doc.fontSize(20).font("Helvetica-Bold").text("RAPPORT DONS", { align: "center" });
  doc.fontSize(12).font("Helvetica").text(`Exercice ${annee}`, { align: "center" });
  doc.moveDown();

  titre("RÉSUMÉ GÉNÉRAL");
  ligne("Dons effectués", `${stats.donsEffectues.nb} dons · ${fcfa(stats.donsEffectues.total)}`);
  ligne("Dons reçus", `${stats.donsRecus.nb} dons · ${fcfa(stats.donsRecus.total)}`);
  ligne("Solde net (reçus – effectués)", fcfa(stats.soldeNet));
  doc.moveDown();

  if (stats.parCategorie.length > 0) {
    sousTitre("Répartition par catégorie");
    for (const cat of stats.parCategorie) {
      doc.fontSize(10).font("Helvetica").text(`  • ${cat.label} : ${fcfa(cat.montant)}`);
    }
    doc.moveDown();
  }

  // ── Page 2 — Dons effectués ─────────────────────────────────────────────────
  doc.addPage();
  titre("DONS EFFECTUÉS — Détail");
  for (const don of donsEffectues.slice(0, 30)) {
    const montant = don.forme === "especes"
      ? parseFloat(String(don.montantFcfa ?? 0))
      : parseFloat(String(don.valeurEstimeeFcfa ?? 0));
    const benef = don.beneficiaireNom ?? `Membre #${don.beneficiaireMembreId ?? "?"}`;
    doc.fontSize(9).font("Helvetica")
      .text(`${String(don.dateDon).slice(0, 10)} | ${don.reference ?? "—"} | ${benef} | ${don.categorieLibelle ?? "—"} | ${don.forme} | ${fcfa(montant)}`);
  }
  doc.moveDown();
  doc.fontSize(10).font("Helvetica-Bold").text(`TOTAL : ${fcfa(stats.donsEffectues.total)}`);

  // ── Page 3 — Dons reçus ─────────────────────────────────────────────────────
  doc.addPage();
  titre("DONS REÇUS — Détail");
  for (const don of donsRecus.slice(0, 30)) {
    const montant = don.forme === "especes"
      ? parseFloat(String(don.montantFcfa ?? 0))
      : parseFloat(String(don.valeurEstimeeFcfa ?? 0));
    doc.fontSize(9).font("Helvetica")
      .text(`${String(don.dateDon).slice(0, 10)} | ${don.reference ?? "—"} | ${don.donateurNom ?? "—"} | ${don.forme} | ${fcfa(montant)}`);
  }
  doc.moveDown();
  doc.fontSize(10).font("Helvetica-Bold").text(`TOTAL : ${fcfa(stats.donsRecus.total)}`);

  // ── Page 4 — Programmes ─────────────────────────────────────────────────────
  if (programmes.length > 0) {
    doc.addPage();
    titre("PROGRAMMES DE DONS");
    for (const prog of programmes) {
      const alloue = parseFloat(String(prog.budgetAlloueFcfa ?? 0));
      const utilise = parseFloat(String(prog.budgetUtiliseFcfa ?? 0));
      const restant = alloue - utilise;
      const pct = alloue > 0 ? Math.round((utilise / alloue) * 100) : 0;
      sousTitre(prog.libelle);
      ligne("Budget alloué", fcfa(alloue));
      ligne("Budget utilisé", `${fcfa(utilise)} (${pct}%)`);
      ligne("Budget restant", fcfa(restant));
      ligne("Statut", prog.statut);
      doc.moveDown(0.5);
    }
  }

  // ── Note de bas de page ─────────────────────────────────────────────────────
  doc.fontSize(8).font("Helvetica")
    .text(
      `Document préparé pour l'Assemblée Générale ${annee} — CoopDigital`,
      40, doc.page.height - 50,
      { align: "center" },
    );

  doc.end();
}

// ── PV de remise PDF ───────────────────────────────────────────────────────────

export async function generatePVRemisePDF(donId: number, res: import("express").Response) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const PDFDocument = require("pdfkit") as typeof import("pdfkit");
  const [donRow] = await db.select({ cooperativeId: donsTable.cooperativeId }).from(donsTable).where(eq(donsTable.id, donId)).limit(1);
  if (!donRow) throw new Error("Don introuvable");
  const don = await getDonDetail(donRow.cooperativeId, donId);
  if (!don) throw new Error("Don introuvable");

  const doc = new PDFDocument({ margin: 50, size: "A4" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="pv-remise-${don.reference ?? donId}.pdf"`);
  doc.pipe(res);

  const fcfa = (n: number) => new Intl.NumberFormat("fr-FR").format(n) + " FCFA";
  const montant = don.forme === "especes"
    ? parseFloat(String(don.montantFcfa ?? 0))
    : parseFloat(String(don.valeurEstimeeFcfa ?? 0));

  doc.fontSize(18).font("Helvetica-Bold")
    .text("PROCÈS-VERBAL DE REMISE DE DON", { align: "center" });
  doc.moveDown();

  doc.fontSize(11).font("Helvetica");
  doc.text(`Référence : ${don.reference ?? "—"}`);
  doc.text(`Date : ${String(don.dateDon).slice(0, 10)}`);
  doc.moveDown();

  if (don.sens === "effectue") {
    doc.font("Helvetica-Bold").text("BÉNÉFICIAIRE");
    doc.font("Helvetica")
      .text(`Nom : ${don.beneficiaireNom ?? "—"}`)
      .text(`Village/Localité : ${don.beneficiaireVillage ?? "—"}`)
      .text(`Contact : ${don.beneficiaireContact ?? "—"}`);
  } else {
    doc.font("Helvetica-Bold").text("DONATEUR");
    doc.font("Helvetica")
      .text(`Nom : ${don.donateurNom ?? "—"}`)
      .text(`Type : ${don.donateurType ?? "—"}`)
      .text(`Contact : ${don.donateurContact ?? "—"}`);
  }

  doc.moveDown();
  doc.font("Helvetica-Bold").text("OBJET DU DON");
  doc.font("Helvetica")
    .text(`Libellé : ${don.libelle}`)
    .text(`Forme : ${don.forme === "especes" ? "Don en espèces" : "Don en nature"}`)
    .text(`Catégorie : ${don.categorieLibelle ?? "—"}`);

  if (don.forme === "especes") {
    doc.text(`Montant : ${fcfa(montant)}`);
  } else {
    doc.text(`Valeur estimée : ${fcfa(montant)}`);
    if (don.lignesNature && don.lignesNature.length > 0) {
      doc.moveDown(0.5);
      doc.font("Helvetica-Bold").text("Détail des articles :");
      for (const l of don.lignesNature) {
        doc.font("Helvetica").text(
          `  • ${l.designation} : ${l.quantite} ${l.unite} × ${fcfa(parseFloat(String(l.valeurUnitaireFcfa)))} = ${fcfa(parseFloat(String(l.valeurTotaleFcfa)))}`,
        );
      }
    }
  }

  if (don.description) {
    doc.moveDown(0.5);
    doc.font("Helvetica-Bold").text("Description :");
    doc.font("Helvetica").text(don.description);
  }

  doc.moveDown(2);
  doc.font("Helvetica").text(
    "Fait à ________________, le _______________________",
    { align: "center" },
  );

  doc.moveDown(2);
  const signY = doc.y;
  doc.font("Helvetica-Bold")
    .text("Signature Président", 60, signY, { width: 200, align: "center" })
    .text("Signature Bénéficiaire", 330, signY, { width: 200, align: "center" });

  doc.moveTo(60, signY + 50).lineTo(260, signY + 50).stroke();
  doc.moveTo(330, signY + 50).lineTo(530, signY + 50).stroke();

  doc.end();
}
