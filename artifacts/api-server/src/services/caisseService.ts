import { db, caissesTable, sessionsCaisseTable, mouvementsCaisseTable, ecrituresComptablesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import PDFDocument from "pdfkit";
import { drawHeader, drawFooter } from "./pdfHeaderService.js";

const COOP_ID = 1;

// ─── Mapping motif → comptes OHADA ────────────────────────────────────────────
// Entrée caisse : Débit 571 / Crédit [compte]
// Sortie caisse : Débit [compte] / Crédit 571

interface CompteMapping { debit: string; credit: string }

function comptesForMouvement(type: string, motif: string): CompteMapping {
  if (type === "entree") {
    const credits: Record<string, string> = {
      don:            "74",
      retrait_banque: "521",
      remboursement:  "162",
      autre:          "44",
    };
    return { debit: "571", credit: credits[motif] ?? "44" };
  }
  // sortie
  const debits: Record<string, string> = {
    paiement_producteur:  "401",
    avance:               "271",
    achat_intrants:       "382",
    frais_fonctionnement: "625",
    depot_banque:         "521",
    remboursement:        "162",
    autre:                "628",
  };
  return { debit: debits[motif] ?? "628", credit: "571" };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function today(): string { return new Date().toISOString().slice(0, 10); }

async function getCaisse(id: number) {
  const rows = await db.select().from(caissesTable).where(eq(caissesTable.id, id)).limit(1);
  return rows[0] ?? null;
}

async function getSession(id: number) {
  const rows = await db.select().from(sessionsCaisseTable).where(eq(sessionsCaisseTable.id, id)).limit(1);
  return rows[0] ?? null;
}

async function getCoopNom(): Promise<string> {
  const r = await db.execute<{ nom: string }>(sql`SELECT nom FROM cooperatives WHERE id = ${COOP_ID} LIMIT 1`);
  return r.rows[0]?.nom ?? "CoopDigital";
}

// ─── CRUD Caisses ─────────────────────────────────────────────────────────────

export async function listCaisses() {
  const result = await db.execute<{
    id: number; nom: string; responsable_id: number | null; responsable_nom: string | null;
    solde_actuel_fcfa: string; fond_caisse_minimum_fcfa: string; actif: boolean;
    session_id: number | null; session_statut: string | null; heure_ouverture: string | null;
    solde_ouverture_fcfa: string | null;
  }>(sql`
    SELECT
      c.id, c.nom, c.responsable_id, c.solde_actuel_fcfa, c.fond_caisse_minimum_fcfa, c.actif,
      u.nom AS responsable_nom,
      s.id  AS session_id, s.statut AS session_statut,
      s.heure_ouverture::text, s.solde_ouverture_fcfa
    FROM caisses c
    LEFT JOIN users u ON u.id = c.responsable_id
    LEFT JOIN sessions_caisse s
      ON s.caisse_id = c.id AND s.date_session = CURRENT_DATE AND s.statut = 'ouverte'
    WHERE c.cooperative_id = ${COOP_ID} AND c.actif = true
    ORDER BY c.nom
  `);
  return result.rows;
}

export async function creerCaisse(data: {
  nom: string; responsableId?: number;
  soldeinitial?: number; fondMinimum?: number;
}) {
  const [row] = await db.insert(caissesTable).values({
    cooperativeId: COOP_ID,
    nom: data.nom,
    responsableId: data.responsableId ?? null,
    soldeActuelFcfa: (data.soldeinitial ?? 0).toString(),
    fondCaisseMinimumFcfa: (data.fondMinimum ?? 0).toString(),
  }).returning();
  return row;
}

export async function updateCaisse(id: number, data: Partial<{
  nom: string; responsableId: number; fondMinimum: number; actif: boolean;
}>) {
  const [row] = await db.update(caissesTable).set({
    ...(data.nom           !== undefined && { nom: data.nom }),
    ...(data.responsableId !== undefined && { responsableId: data.responsableId }),
    ...(data.fondMinimum   !== undefined && { fondCaisseMinimumFcfa: data.fondMinimum.toString() }),
    ...(data.actif         !== undefined && { actif: data.actif }),
  }).where(and(eq(caissesTable.id, id), eq(caissesTable.cooperativeId, COOP_ID))).returning();
  return row ?? null;
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function getSessionActive(caisseId: number) {
  const result = await db.execute<{
    id: number; caisse_id: number; date_session: string; statut: string;
    solde_ouverture_fcfa: string; ouvert_par: number | null;
    heure_ouverture: string; nb_mouvements: string;
  }>(sql`
    SELECT
      s.*,
      s.date_session::text,
      s.heure_ouverture::text,
      COUNT(m.id) AS nb_mouvements
    FROM sessions_caisse s
    LEFT JOIN mouvements_caisse m ON m.session_id = s.id
    WHERE s.caisse_id = ${caisseId}
      AND s.date_session = CURRENT_DATE
      AND s.statut = 'ouverte'
      AND s.cooperative_id = ${COOP_ID}
    GROUP BY s.id
    LIMIT 1
  `);
  return result.rows[0] ?? null;
}

export async function ouvrirSession(caisseId: number, userId: number) {
  // Vérifier pas de session ouverte ce jour
  const existing = await getSessionActive(caisseId);
  if (existing) throw new Error("Une session est déjà ouverte pour cette caisse aujourd'hui");

  const caisse = await getCaisse(caisseId);
  if (!caisse) throw new Error("Caisse introuvable");

  const [session] = await db.insert(sessionsCaisseTable).values({
    caisseId,
    cooperativeId: COOP_ID,
    dateSession: today(),
    ouvertPar: userId,
    soldeOuvertureFcfa: caisse.soldeActuelFcfa,
    statut: "ouverte",
  }).returning();

  logger.info({ caisseId, sessionId: session?.id }, "Session caisse ouverte");
  return session;
}

// ─── Mouvements ───────────────────────────────────────────────────────────────

export interface MouvementInput {
  type: "entree" | "sortie";
  motif: string;
  montantFcfa: number;
  libelle?: string;
  referenceOperation?: string;
  userId?: number;
}

export async function enregistrerMouvement(
  caisseId: number,
  data: MouvementInput
): Promise<{
  mouvement: typeof mouvementsCaisseTable.$inferSelect;
  alerte?: string;
  soldeActuel: number;
}> {
  // Trouver la session ouverte
  const session = await getSessionActive(caisseId);
  if (!session) throw new Error("Aucune session ouverte pour cette caisse. Ouvrez d'abord une session.");

  const caisse = await getCaisse(caisseId);
  if (!caisse) throw new Error("Caisse introuvable");

  const soldeActuel = parseFloat(caisse.soldeActuelFcfa as string);
  const montant     = Math.round(data.montantFcfa);

  if (data.type === "sortie" && soldeActuel - montant < 0) {
    throw new Error(`Solde insuffisant en caisse. Disponible : ${soldeActuel.toLocaleString("fr-FR")} FCFA`);
  }

  const nouveauSolde = data.type === "entree"
    ? soldeActuel + montant
    : soldeActuel - montant;

  // Insérer le mouvement dans une transaction
  const [mouvement] = await db.insert(mouvementsCaisseTable).values({
    caisseId,
    sessionId: session.id,
    cooperativeId: COOP_ID,
    type: data.type,
    motif: data.motif,
    montantFcfa: montant.toString(),
    libelle: data.libelle ?? null,
    referenceOperation: data.referenceOperation ?? null,
    soldeApresFcfa: nouveauSolde.toString(),
    enregistrePar: data.userId ?? null,
  }).returning();

  // Mettre à jour le solde de la caisse
  await db.update(caissesTable)
    .set({ soldeActuelFcfa: nouveauSolde.toString() })
    .where(eq(caissesTable.id, caisseId));

  // Écriture comptable — insertion directe (source "caisse" hors enum SourceEcriture)
  try {
    const comptes = comptesForMouvement(data.type, data.motif);
    const exercice = new Date().getFullYear();
    await db.insert(ecrituresComptablesTable).values({
      cooperativeId: COOP_ID,
      dateEcriture:  today(),
      libelle:       data.libelle ?? `Caisse — ${data.motif}`,
      compteDebit:   comptes.debit,
      compteCredit:  comptes.credit,
      montantFcfa:   montant,
      source:        "manuel" as "livraison" | "vente" | "avance" | "paiement" | "manuel" | "encaissement" | "salaire" | "stock",
      sourceId:      mouvement?.id ?? null,
      exercice,
    });
  } catch (err) {
    logger.warn({ err }, "Écriture comptable caisse non enregistrée");
  }

  // Alerte fond minimum
  const fondMin = parseFloat(caisse.fondCaisseMinimumFcfa as string);
  let alerte: string | undefined;
  if (fondMin > 0 && nouveauSolde < fondMin) {
    alerte = `⚠️ Solde caisse sous le fond minimum (${fondMin.toLocaleString("fr-FR")} FCFA)`;
    logger.warn({ caisseId, nouveauSolde, fondMin }, "Caisse sous fond minimum");
  }

  return { mouvement: mouvement!, alerte, soldeActuel: nouveauSolde };
}

// ─── Fermeture session ────────────────────────────────────────────────────────

export async function fermerSession(
  caisseId: number,
  soldeReel: number,
  userId: number,
  observations?: string
) {
  const session = await getSessionActive(caisseId);
  if (!session) throw new Error("Aucune session ouverte pour cette caisse");

  // Calculer le solde théorique depuis les mouvements
  const mouvResult = await db.execute<{ total_entrees: string; total_sorties: string }>(sql`
    SELECT
      COALESCE(SUM(montant_fcfa) FILTER (WHERE type = 'entree'), 0) AS total_entrees,
      COALESCE(SUM(montant_fcfa) FILTER (WHERE type = 'sortie'), 0) AS total_sorties
    FROM mouvements_caisse
    WHERE session_id = ${session.id}
  `);
  const m = mouvResult.rows[0]!;
  const totalEntrees = parseFloat(m.total_entrees);
  const totalSorties = parseFloat(m.total_sorties);
  const soldeOuverture = parseFloat(session.solde_ouverture_fcfa);
  const soldeTheorique = soldeOuverture + totalEntrees - totalSorties;

  const ecart = soldeReel - soldeTheorique;

  // Fermer la session
  await db.update(sessionsCaisseTable).set({
    statut: "fermee",
    soldeFermetureTheoriqueFcfa: soldeTheorique.toString(),
    soldeFermetureReelFcfa: soldeReel.toString(),
    fermePar: userId,
    heureFermeture: new Date(),
    observations: observations ?? null,
  }).where(eq(sessionsCaisseTable.id, session.id));

  // Mettre à jour solde caisse avec le solde réel
  await db.update(caissesTable)
    .set({ soldeActuelFcfa: soldeReel.toString() })
    .where(eq(caissesTable.id, caisseId));

  // Alerte écart
  if (Math.abs(ecart) > 0) {
    const dateStr = new Date().toLocaleDateString("fr-FR");
    const msg = `Écart caisse ${dateStr} : ${ecart.toLocaleString("fr-FR")} FCFA. Théorique : ${soldeTheorique.toLocaleString("fr-FR")} | Réel : ${soldeReel.toLocaleString("fr-FR")}`;
    logger.warn({ sessionId: session.id, ecart, soldeTheorique, soldeReel }, "Écart caisse à la clôture");
    // Notification directeur (via le système de notification existant si dispo)
  }

  logger.info({ sessionId: session.id, ecart }, "Session caisse fermée");
  return { sessionId: session.id, soldeTheorique, soldeReel, ecart };
}

// ─── Journal de caisse ────────────────────────────────────────────────────────

export async function getJournal(caisseId: number, opts?: { dateDebut?: string; dateFin?: string }) {
  const dateD = opts?.dateDebut ?? today();
  const dateF = opts?.dateFin   ?? today();

  const result = await db.execute<{
    id: number; type: string; motif: string; montant_fcfa: string;
    libelle: string | null; reference_operation: string | null;
    solde_apres_fcfa: string | null; created_at: string;
    enregistre_par_nom: string | null; session_id: number;
    session_statut: string; date_session: string;
  }>(sql`
    SELECT
      m.id, m.type, m.motif, m.montant_fcfa,
      m.libelle, m.reference_operation, m.solde_apres_fcfa,
      m.created_at::text, m.session_id,
      u.nom AS enregistre_par_nom,
      s.statut AS session_statut, s.date_session::text
    FROM mouvements_caisse m
    JOIN sessions_caisse s ON s.id = m.session_id
    LEFT JOIN users u ON u.id = m.enregistre_par
    WHERE m.caisse_id = ${caisseId}
      AND s.date_session BETWEEN ${dateD} AND ${dateF}
      AND m.cooperative_id = ${COOP_ID}
    ORDER BY m.created_at
  `);

  const mvts = result.rows;
  const totalEntrees = mvts.filter(m => m.type === "entree").reduce((s, m) => s + parseFloat(m.montant_fcfa), 0);
  const totalSorties = mvts.filter(m => m.type === "sortie").reduce((s, m) => s + parseFloat(m.montant_fcfa), 0);

  return { mouvements: mvts, totalEntrees, totalSorties };
}

// ─── Soldes temps réel ────────────────────────────────────────────────────────

export async function getSoldes() {
  return listCaisses();
}

// ─── Alertes ──────────────────────────────────────────────────────────────────

export async function getAlertes() {
  const caisses = await listCaisses();
  return caisses.filter((c) => {
    const solde = parseFloat(c.solde_actuel_fcfa);
    const min   = parseFloat(c.fond_caisse_minimum_fcfa);
    return min > 0 && solde < min;
  });
}

// ─── Historique sessions ──────────────────────────────────────────────────────

export async function listSessions(caisseId: number, opts?: { dateDebut?: string; dateFin?: string }) {
  const result = await db.execute<{
    id: number; date_session: string; statut: string;
    solde_ouverture_fcfa: string; solde_fermeture_theorique_fcfa: string | null;
    solde_fermeture_reel_fcfa: string | null; ecart_fcfa: string | null;
    heure_ouverture: string; heure_fermeture: string | null;
    ouvert_par_nom: string | null; ferme_par_nom: string | null;
    nb_mouvements: string;
  }>(sql`
    SELECT
      s.id, s.date_session::text, s.statut,
      s.solde_ouverture_fcfa, s.solde_fermeture_theorique_fcfa,
      s.solde_fermeture_reel_fcfa, s.ecart_fcfa,
      s.heure_ouverture::text, s.heure_fermeture::text,
      u1.nom AS ouvert_par_nom, u2.nom AS ferme_par_nom,
      COUNT(m.id) AS nb_mouvements
    FROM sessions_caisse s
    LEFT JOIN users u1 ON u1.id = s.ouvert_par
    LEFT JOIN users u2 ON u2.id = s.ferme_par
    LEFT JOIN mouvements_caisse m ON m.session_id = s.id
    WHERE s.caisse_id = ${caisseId} AND s.cooperative_id = ${COOP_ID}
      ${opts?.dateDebut ? sql`AND s.date_session >= ${opts.dateDebut}` : sql``}
      ${opts?.dateFin   ? sql`AND s.date_session <= ${opts.dateFin}`   : sql``}
    GROUP BY s.id, u1.nom, u2.nom
    ORDER BY s.date_session DESC
  `);
  return result.rows;
}

// ─── Transfert caisse → banque ────────────────────────────────────────────────

export async function transfertVersBanque(
  caisseId: number,
  montant: number,
  userId: number,
  libelle?: string
) {
  const result = await enregistrerMouvement(caisseId, {
    type: "sortie",
    motif: "depot_banque",
    montantFcfa: montant,
    libelle: libelle ?? "Dépôt en banque",
    userId,
  });
  return result;
}

// ─── Rapport PDF journalier ───────────────────────────────────────────────────

export async function genererRapportPdf(caisseId: number, dateSession?: string): Promise<Buffer> {
  const dateStr = dateSession ?? today();
  const caisse = await getCaisse(caisseId);
  if (!caisse) throw new Error("Caisse introuvable");

  const journal = await getJournal(caisseId, { dateDebut: dateStr, dateFin: dateStr });
  const coopNom = await getCoopNom();

  // Infos session
  const sessionResult = await db.execute<{
    id: number; statut: string; solde_ouverture_fcfa: string;
    solde_fermeture_theorique_fcfa: string | null; solde_fermeture_reel_fcfa: string | null;
    ecart_fcfa: string | null; heure_ouverture: string; heure_fermeture: string | null;
    ouvert_par_nom: string | null; ferme_par_nom: string | null;
  }>(sql`
    SELECT s.id, s.statut, s.solde_ouverture_fcfa,
      s.solde_fermeture_theorique_fcfa, s.solde_fermeture_reel_fcfa, s.ecart_fcfa,
      s.heure_ouverture::text, s.heure_fermeture::text,
      u1.nom AS ouvert_par_nom, u2.nom AS ferme_par_nom
    FROM sessions_caisse s
    LEFT JOIN users u1 ON u1.id = s.ouvert_par
    LEFT JOIN users u2 ON u2.id = s.ferme_par
    WHERE s.caisse_id = ${caisseId} AND s.date_session = ${dateStr}
    LIMIT 1
  `);
  const session = sessionResult.rows[0];

  const FCFA = (n: number | string) =>
    new Intl.NumberFormat("fr-FR").format(typeof n === "string" ? parseFloat(n) || 0 : n) + " FCFA";

  const doc = new PDFDocument({ margin: 45, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  await drawHeader(doc, COOP_ID, {
    titre_document: "RAPPORT DE CAISSE",
    reference: dateStr,
    hauteur_reservee: 90,
  });

  const margin = 45;
  const pageW  = doc.page.width;
  const cW     = pageW - margin * 2;

  // ── Infos caisse
  doc.moveDown(0.3)
    .font("Helvetica-Bold").fontSize(13).fillColor("#1a4731")
    .text(caisse.nom, margin, doc.y, { width: cW });
  doc.font("Helvetica").fontSize(9).fillColor("#555555")
    .text(`Date : ${new Date(dateStr + "T00:00:00").toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}`, margin, doc.y, { width: cW });

  if (session) {
    const lignes = [
      [`Ouverture`, `${session.heure_ouverture?.slice(11, 16) ?? "—"} par ${session.ouvert_par_nom ?? "—"}`],
      [`Solde ouverture`, FCFA(session.solde_ouverture_fcfa)],
    ];
    if (session.statut === "fermee") {
      if (session.heure_fermeture) lignes.push([`Fermeture`, session.heure_fermeture.slice(11, 16) + ` par ${session.ferme_par_nom ?? "—"}`]);
      if (session.solde_fermeture_theorique_fcfa) lignes.push([`Solde théorique`, FCFA(session.solde_fermeture_theorique_fcfa)]);
      if (session.solde_fermeture_reel_fcfa) lignes.push([`Solde réel`, FCFA(session.solde_fermeture_reel_fcfa)]);
      const ecart = parseFloat(session.ecart_fcfa ?? "0");
      if (ecart !== 0) lignes.push([`Écart`, FCFA(ecart)]);
    }

    doc.moveDown(0.5);
    const boxY = doc.y;
    doc.save().rect(margin, boxY, cW, lignes.length * 16 + 12).fillColor("#f8f9fa").fill().restore();
    lignes.forEach(([label, val], i) => {
      doc.font("Helvetica-Bold").fontSize(8).fillColor("#444444")
        .text(`${label} :`, margin + 8, boxY + 6 + i * 16, { width: 100, lineBreak: false });
      doc.font("Helvetica").fontSize(8).fillColor("#222222")
        .text(val, margin + 110, boxY + 6 + i * 16, { width: cW - 118, lineBreak: false });
    });
    doc.y = boxY + lignes.length * 16 + 16;
  }

  // ── Résumé
  doc.moveDown(0.5);
  const resY = doc.y;
  const colW = cW / 3;
  [
    { label: "Total Entrées", val: FCFA(journal.totalEntrees), color: "#166534" },
    { label: "Total Sorties", val: FCFA(journal.totalSorties), color: "#991b1b" },
    { label: "Solde Actuel", val: FCFA(parseFloat(caisse.soldeActuelFcfa as string)), color: "#1a4731" },
  ].forEach(({ label, val, color }, i) => {
    const x = margin + i * colW;
    doc.save().rect(x, resY, colW - 4, 36).fillColor(color).fill().restore();
    doc.font("Helvetica").fontSize(7).fillColor("#ffffff")
      .text(label, x + 4, resY + 5, { width: colW - 12, align: "center", lineBreak: false });
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#ffffff")
      .text(val, x + 4, resY + 16, { width: colW - 12, align: "center", lineBreak: false });
  });
  doc.y = resY + 44;

  // ── Tableau des mouvements
  doc.moveDown(0.5);
  const headers = ["Heure", "Type", "Motif", "Libellé", "Montant", "Solde"];
  const colWidths = [42, 32, 75, 140, 68, 72];
  const tableX = margin;
  let tableY = doc.y;

  // En-tête tableau
  doc.save().rect(tableX, tableY, cW, 16).fillColor("#1a4731").fill().restore();
  let cx = tableX + 3;
  headers.forEach((h, i) => {
    doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff")
      .text(h, cx, tableY + 4, { width: colWidths[i]! - 4, lineBreak: false });
    cx += colWidths[i]!;
  });
  tableY += 16;

  // Lignes
  if (journal.mouvements.length === 0) {
    doc.font("Helvetica-Oblique").fontSize(8).fillColor("#888888")
      .text("Aucun mouvement enregistré pour cette session.", tableX + 4, tableY + 6);
    tableY += 22;
  } else {
    journal.mouvements.forEach((m, idx) => {
      if (tableY > doc.page.height - 80) {
        doc.addPage();
        tableY = 60;
      }
      const bg = idx % 2 === 0 ? "#ffffff" : "#f9fafb";
      doc.save().rect(tableX, tableY, cW, 14).fillColor(bg).fill().restore();
      const entree = m.type === "entree";
      const cols = [
        m.created_at?.slice(11, 16) ?? "—",
        entree ? "Entrée" : "Sortie",
        m.motif.replace(/_/g, " "),
        m.libelle ?? "—",
        FCFA(m.montant_fcfa),
        m.solde_apres_fcfa ? FCFA(m.solde_apres_fcfa) : "—",
      ];
      cx = tableX + 3;
      cols.forEach((v, i) => {
        const color = i === 1 ? (entree ? "#166534" : "#991b1b") : "#222222";
        doc.font(i === 1 ? "Helvetica-Bold" : "Helvetica")
          .fontSize(7).fillColor(color)
          .text(String(v).slice(0, i === 3 ? 45 : 30), cx, tableY + 3, { width: colWidths[i]! - 4, lineBreak: false });
        cx += colWidths[i]!;
      });
      // Bordure inférieure
      doc.moveTo(tableX, tableY + 14).lineTo(tableX + cW, tableY + 14).strokeColor("#e5e7eb").lineWidth(0.4).stroke();
      tableY += 14;
    });
  }
  doc.y = tableY + 10;

  // Footers
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    await drawFooter(doc, COOP_ID, i + 1, range.count);
  }

  doc.end();
  return new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
}
