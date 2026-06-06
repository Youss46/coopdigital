import { db, programmesFormationTable, sessionsFormationTable, inscriptionsFormationTable, attestationsFormationTable, evaluationsFormationTable, membresTable } from "@workspace/db";
import { eq, and, inArray, sql, desc, not } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { sendBulkSMS } from "./smsService.js";
import PDFDocument from "pdfkit";
import { drawHeader, drawFooter } from "./pdfHeaderService.js";

const COOP_ID = 1;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

async function getCoopNom(): Promise<string> {
  const r = await db.execute<{ nom: string }>(sql`SELECT nom FROM cooperatives WHERE id = ${COOP_ID} LIMIT 1`);
  return r.rows[0]?.nom ?? "CoopDigital";
}

// ─── Programmes ───────────────────────────────────────────────────────────────

export async function listProgrammes() {
  return db
    .select()
    .from(programmesFormationTable)
    .where(eq(programmesFormationTable.cooperativeId, COOP_ID))
    .orderBy(desc(programmesFormationTable.createdAt));
}

export async function createProgramme(data: {
  titre: string;
  description?: string;
  thematiques?: string[];
  financeur?: string;
  budgetFcfa?: number;
  dateDebut?: string;
  dateFin?: string;
}) {
  const [row] = await db.insert(programmesFormationTable).values({
    cooperativeId: COOP_ID,
    titre: data.titre,
    description: data.description ?? null,
    thematiques: data.thematiques ?? [],
    financeur: data.financeur ?? null,
    budgetFcfa: data.budgetFcfa?.toString() ?? "0",
    dateDebut: data.dateDebut ?? null,
    dateFin: data.dateFin ?? null,
  }).returning();
  return row;
}

export async function updateProgramme(id: number, data: Partial<{
  titre: string; description: string; thematiques: string[];
  financeur: string; budgetFcfa: number; dateDebut: string; dateFin: string; statut: string;
}>) {
  const [row] = await db.update(programmesFormationTable)
    .set({
      ...(data.titre        !== undefined && { titre: data.titre }),
      ...(data.description  !== undefined && { description: data.description }),
      ...(data.thematiques  !== undefined && { thematiques: data.thematiques }),
      ...(data.financeur    !== undefined && { financeur: data.financeur }),
      ...(data.budgetFcfa   !== undefined && { budgetFcfa: data.budgetFcfa.toString() }),
      ...(data.dateDebut    !== undefined && { dateDebut: data.dateDebut }),
      ...(data.dateFin      !== undefined && { dateFin: data.dateFin }),
      ...(data.statut       !== undefined && { statut: data.statut }),
    })
    .where(and(eq(programmesFormationTable.id, id), eq(programmesFormationTable.cooperativeId, COOP_ID)))
    .returning();
  return row ?? null;
}

export async function deleteProgramme(id: number) {
  await db.delete(programmesFormationTable).where(
    and(eq(programmesFormationTable.id, id), eq(programmesFormationTable.cooperativeId, COOP_ID))
  );
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function listSessions(opts?: { statut?: string; programmeId?: number; upcoming?: boolean }) {
  const result = await db.execute<{
    id: number; cooperative_id: number; programme_id: number | null;
    programme_titre: string | null; titre: string; thematique: string | null;
    formateur: string | null; organisme_formateur: string | null; lieu: string | null;
    date_session: string; heure_debut: string | null; heure_fin: string | null;
    duree_heures: string | null; nb_places: number | null; cout_fcfa: string;
    statut: string; support_url: string | null; created_at: string;
    nb_inscrits: string; nb_presents: string;
  }>(sql`
    SELECT
      s.*,
      p.titre            AS programme_titre,
      s.date_session::text,
      s.heure_debut::text,
      s.heure_fin::text,
      COUNT(i.id)                                              AS nb_inscrits,
      COUNT(i.id) FILTER (WHERE i.statut = 'present')         AS nb_presents
    FROM sessions_formation s
    LEFT JOIN programmes_formation p ON p.id = s.programme_id
    LEFT JOIN inscriptions_formation i ON i.session_id = s.id
    WHERE s.cooperative_id = ${COOP_ID}
      ${opts?.statut      ? sql`AND s.statut = ${opts.statut}` : sql``}
      ${opts?.programmeId ? sql`AND s.programme_id = ${opts.programmeId}` : sql``}
      ${opts?.upcoming    ? sql`AND s.date_session >= CURRENT_DATE` : sql``}
    GROUP BY s.id, p.titre
    ORDER BY s.date_session DESC, s.heure_debut
  `);
  return result.rows;
}

export async function getSession(id: number) {
  const result = await db.execute<{
    id: number; titre: string; thematique: string | null; formateur: string | null;
    organisme_formateur: string | null; lieu: string | null; date_session: string;
    heure_debut: string | null; heure_fin: string | null; duree_heures: string | null;
    nb_places: number | null; cout_fcfa: string; statut: string;
    nb_inscrits: string; nb_presents: string; programme_id: number | null;
    programme_titre: string | null; cooperative_id: number;
  }>(sql`
    SELECT
      s.*,
      s.date_session::text,
      s.heure_debut::text,
      s.heure_fin::text,
      p.titre AS programme_titre,
      COUNT(i.id)                                              AS nb_inscrits,
      COUNT(i.id) FILTER (WHERE i.statut = 'present')         AS nb_presents
    FROM sessions_formation s
    LEFT JOIN programmes_formation p ON p.id = s.programme_id
    LEFT JOIN inscriptions_formation i ON i.session_id = s.id
    WHERE s.id = ${id} AND s.cooperative_id = ${COOP_ID}
    GROUP BY s.id, p.titre
  `);
  return result.rows[0] ?? null;
}

export async function createSession(data: {
  titre: string; programmeId?: number; campagneId?: number; thematique?: string;
  formateur?: string; organismeFormateur?: string; lieu?: string; dateSession: string;
  heureDebut?: string; heureFin?: string; dureeHeures?: number; nbPlaces?: number;
  coutFcfa?: number; supportUrl?: string;
}) {
  const [row] = await db.insert(sessionsFormationTable).values({
    cooperativeId: COOP_ID,
    titre: data.titre,
    programmeId: data.programmeId ?? null,
    campagneId: data.campagneId ?? null,
    thematique: data.thematique ?? null,
    formateur: data.formateur ?? null,
    organismeFormateur: data.organismeFormateur ?? null,
    lieu: data.lieu ?? null,
    dateSession: data.dateSession,
    heureDebut: data.heureDebut ?? null,
    heureFin: data.heureFin ?? null,
    dureeHeures: data.dureeHeures?.toString() ?? null,
    nbPlaces: data.nbPlaces ?? null,
    coutFcfa: data.coutFcfa?.toString() ?? "0",
    supportUrl: data.supportUrl ?? null,
  }).returning();
  return row;
}

export async function updateSession(id: number, data: Partial<{
  titre: string; thematique: string; formateur: string; organismeFormateur: string;
  lieu: string; dateSession: string; heureDebut: string; heureFin: string;
  dureeHeures: number; nbPlaces: number; coutFcfa: number; statut: string; supportUrl: string;
}>) {
  const [row] = await db.update(sessionsFormationTable).set({
    ...(data.titre              !== undefined && { titre: data.titre }),
    ...(data.thematique         !== undefined && { thematique: data.thematique }),
    ...(data.formateur          !== undefined && { formateur: data.formateur }),
    ...(data.organismeFormateur !== undefined && { organismeFormateur: data.organismeFormateur }),
    ...(data.lieu               !== undefined && { lieu: data.lieu }),
    ...(data.dateSession        !== undefined && { dateSession: data.dateSession }),
    ...(data.heureDebut         !== undefined && { heureDebut: data.heureDebut }),
    ...(data.heureFin           !== undefined && { heureFin: data.heureFin }),
    ...(data.dureeHeures        !== undefined && { dureeHeures: data.dureeHeures.toString() }),
    ...(data.nbPlaces           !== undefined && { nbPlaces: data.nbPlaces }),
    ...(data.coutFcfa           !== undefined && { coutFcfa: data.coutFcfa.toString() }),
    ...(data.statut             !== undefined && { statut: data.statut }),
    ...(data.supportUrl         !== undefined && { supportUrl: data.supportUrl }),
    updatedAt: new Date(),
  }).where(and(eq(sessionsFormationTable.id, id), eq(sessionsFormationTable.cooperativeId, COOP_ID)))
    .returning();
  return row ?? null;
}

// ─── Inscriptions ─────────────────────────────────────────────────────────────

export async function inscrireMembres(
  sessionId: number,
  opts: { membreIds?: number[]; zone?: string; section?: string; tous?: boolean }
): Promise<{ inscrits: number; dejaInscrits: number }> {
  // Résoudre la liste de membres
  let membreIds: number[] = opts.membreIds ?? [];

  if (opts.tous || opts.zone || opts.section) {
    const rows = await db.execute<{ id: number }>(sql`
      SELECT id FROM membres
      WHERE cooperative_id = ${COOP_ID} AND statut = 'actif'
        ${opts.zone    ? sql`AND village = ANY(SELECT nom FROM zones_collecte WHERE nom = ${opts.zone} AND cooperative_id = ${COOP_ID})` : sql``}
        ${opts.section ? sql`AND section = ${opts.section}` : sql``}
    `);
    membreIds = rows.rows.map((r) => r.id);
  }

  if (membreIds.length === 0) return { inscrits: 0, dejaInscrits: 0 };

  // Doublons existants
  const existing = await db.select({ membreId: inscriptionsFormationTable.membreId })
    .from(inscriptionsFormationTable)
    .where(
      and(
        eq(inscriptionsFormationTable.sessionId, sessionId),
        inArray(inscriptionsFormationTable.membreId, membreIds)
      )
    );
  const existingSet = new Set(existing.map((r) => r.membreId));
  const nouveaux = membreIds.filter((id) => !existingSet.has(id));

  if (nouveaux.length > 0) {
    await db.insert(inscriptionsFormationTable).values(
      nouveaux.map((membreId) => ({ sessionId, membreId }))
    );
  }

  return { inscrits: nouveaux.length, dejaInscrits: existingSet.size };
}

export async function getInscrits(sessionId: number) {
  const result = await db.execute<{
    id: number; membre_id: number; nom: string; prenoms: string | null;
    telephone: string; village: string | null; section: string | null;
    statut: string; sms_convocation_envoye: boolean; sms_rappel_envoye: boolean;
    date_inscription: string;
  }>(sql`
    SELECT
      i.id, i.membre_id, m.nom, m.prenoms, m.telephone, m.village, m.section,
      i.statut, i.sms_convocation_envoye, i.sms_rappel_envoye,
      i.date_inscription
    FROM inscriptions_formation i
    JOIN membres m ON m.id = i.membre_id
    WHERE i.session_id = ${sessionId}
    ORDER BY m.nom
  `);
  return result.rows;
}

export async function desinscrireMembre(sessionId: number, membreId: number) {
  await db.delete(inscriptionsFormationTable).where(
    and(eq(inscriptionsFormationTable.sessionId, sessionId), eq(inscriptionsFormationTable.membreId, membreId))
  );
}

// ─── Présences ────────────────────────────────────────────────────────────────

export async function enregistrerPresences(
  sessionId: number,
  presences: Array<{ membreId: number; statut: string }>
) {
  for (const p of presences) {
    await db.update(inscriptionsFormationTable)
      .set({ statut: p.statut })
      .where(and(
        eq(inscriptionsFormationTable.sessionId, sessionId),
        eq(inscriptionsFormationTable.membreId, p.membreId)
      ));
  }
  return { updated: presences.length };
}

// ─── SMS Convocations ─────────────────────────────────────────────────────────

export async function envoyerConvocations(sessionId: number) {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session introuvable");

  const coopNom = await getCoopNom();
  const inscrits = await getInscrits(sessionId);
  const aEnvoyer = inscrits.filter((i) => !i.sms_convocation_envoye && i.telephone);

  if (aEnvoyer.length === 0) return { envoyes: 0, echecs: 0 };

  const dateStr  = fmtDate(session.date_session);
  const heure    = (session.heure_debut ?? "07:00").slice(0, 5);
  const lieu     = session.lieu ?? "lieu à confirmer";
  const message  = `Bonjour, vous êtes convoqué(e) à la formation "${session.titre}" le ${dateStr} à ${heure} au ${lieu}. Coopérative ${coopNom}.`;

  const tels = aEnvoyer.map((i) => i.telephone);
  const result = await sendBulkSMS(tels, message);

  // Marquer envoyé
  const ids = aEnvoyer.map((i) => i.membre_id);
  if (ids.length > 0) {
    await db.execute(sql`
      UPDATE inscriptions_formation
      SET sms_convocation_envoye = true
      WHERE session_id = ${sessionId} AND membre_id = ANY(${sql.raw(`ARRAY[${ids.join(",")}]::int[]`)})
    `);
  }

  logger.info({ sessionId, envoyes: result.envoyes }, "Convocations SMS envoyées");
  return result;
}

export async function envoyerRappels(sessionId: number) {
  const session = await getSession(sessionId);
  if (!session) throw new Error("Session introuvable");

  const inscrits = await getInscrits(sessionId);
  const aEnvoyer = inscrits.filter((i) => !i.sms_rappel_envoye && i.telephone);

  if (aEnvoyer.length === 0) return { envoyes: 0, echecs: 0 };

  const heure   = (session.heure_debut ?? "07:00").slice(0, 5);
  const lieu    = session.lieu ?? "lieu à confirmer";
  const message = `Rappel : formation "${session.titre}" demain à ${heure} au ${lieu}. À demain !`;

  const tels = aEnvoyer.map((i) => i.telephone);
  const result = await sendBulkSMS(tels, message);

  const ids = aEnvoyer.map((i) => i.membre_id);
  if (ids.length > 0) {
    await db.execute(sql`
      UPDATE inscriptions_formation
      SET sms_rappel_envoye = true
      WHERE session_id = ${sessionId} AND membre_id = ANY(${sql.raw(`ARRAY[${ids.join(",")}]::int[]`)})
    `);
  }

  logger.info({ sessionId, envoyes: result.envoyes }, "Rappels SMS envoyés");
  return result;
}

// ─── Attestations ─────────────────────────────────────────────────────────────

export async function genererAttestations(sessionId: number): Promise<{ generees: number; dejaExistantes: number }> {
  // Membres présents
  const presents = await db.execute<{ membre_id: number }>(sql`
    SELECT membre_id FROM inscriptions_formation
    WHERE session_id = ${sessionId} AND statut = 'present'
  `);

  if (presents.rows.length === 0) return { generees: 0, dejaExistantes: 0 };

  const annee = new Date().getFullYear();
  let generees = 0;
  let dejaExistantes = 0;

  for (const row of presents.rows) {
    const existing = await db.select({ id: attestationsFormationTable.id })
      .from(attestationsFormationTable)
      .where(and(
        eq(attestationsFormationTable.sessionId, sessionId),
        eq(attestationsFormationTable.membreId, row.membre_id)
      ))
      .limit(1);

    if (existing.length > 0) {
      dejaExistantes++;
      continue;
    }

    const numero = `ATT-${annee}-${sessionId}-${row.membre_id}`;
    const pdfUrl = `/api/formations/sessions/${sessionId}/attestation/${row.membre_id}`;

    await db.insert(attestationsFormationTable).values({
      sessionId,
      membreId: row.membre_id,
      numeroAttestation: numero,
      dateEmission: new Date().toISOString().slice(0, 10),
      pdfUrl,
    });
    generees++;
  }

  logger.info({ sessionId, generees }, "Attestations générées");
  return { generees, dejaExistantes };
}

export async function listAttestations(opts?: { sessionId?: number; membreId?: number; search?: string }) {
  const result = await db.execute<{
    id: number; session_id: number; membre_id: number; numero_attestation: string;
    date_emission: string; pdf_url: string | null; session_titre: string;
    session_date: string; thematique: string | null; membre_nom: string; membre_prenoms: string | null;
  }>(sql`
    SELECT
      a.id, a.session_id, a.membre_id, a.numero_attestation,
      a.date_emission::text, a.pdf_url,
      s.titre  AS session_titre,
      s.date_session::text AS session_date,
      s.thematique,
      m.nom    AS membre_nom,
      m.prenoms AS membre_prenoms
    FROM attestations_formation a
    JOIN sessions_formation s ON s.id = a.session_id
    JOIN membres m ON m.id = a.membre_id
    WHERE s.cooperative_id = ${COOP_ID}
      ${opts?.sessionId ? sql`AND a.session_id = ${opts.sessionId}` : sql``}
      ${opts?.membreId  ? sql`AND a.membre_id  = ${opts.membreId}`  : sql``}
      ${opts?.search    ? sql`AND (m.nom ILIKE ${'%' + opts.search + '%'} OR a.numero_attestation ILIKE ${'%' + opts.search + '%'})` : sql``}
    ORDER BY a.created_at DESC
  `);
  return result.rows;
}

// ─── Génération PDF attestation ────────────────────────────────────────────────

export async function genererPdfAttestation(sessionId: number, membreId: number): Promise<Buffer> {
  // Récupérer les données
  const sessionRes = await db.execute<{
    titre: string; thematique: string | null; formateur: string | null;
    organisme_formateur: string | null; lieu: string | null;
    date_session: string; heure_debut: string | null; heure_fin: string | null;
    duree_heures: string | null;
  }>(sql`SELECT titre, thematique, formateur, organisme_formateur, lieu, date_session::text, heure_debut::text, heure_fin::text, duree_heures FROM sessions_formation WHERE id = ${sessionId} AND cooperative_id = ${COOP_ID} LIMIT 1`);
  const session = sessionRes.rows[0];
  if (!session) throw new Error("Session introuvable");

  const membreRes = await db.execute<{ nom: string; prenoms: string | null; numero_cni: string | null }>(
    sql`SELECT nom, prenoms, numero_cni FROM membres WHERE id = ${membreId} LIMIT 1`
  );
  const membre = membreRes.rows[0];
  if (!membre) throw new Error("Membre introuvable");

  const attestRes = await db.execute<{ numero_attestation: string; date_emission: string }>(
    sql`SELECT numero_attestation, date_emission::text FROM attestations_formation WHERE session_id = ${sessionId} AND membre_id = ${membreId} LIMIT 1`
  );
  const attest = attestRes.rows[0];

  const numeroAttestation = attest?.numero_attestation ?? `ATT-${new Date().getFullYear()}-${sessionId}-${membreId}`;
  const dateEmission = attest?.date_emission ?? new Date().toISOString().slice(0, 10);

  // Générer le PDF
  const doc = new PDFDocument({ margin: 50, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  await drawHeader(doc, COOP_ID, {
    titre_document: "ATTESTATION\nDE PARTICIPATION",
    reference: numeroAttestation,
  });

  const margin = 50;
  const pageW  = doc.page.width;
  const cW     = pageW - margin * 2;

  // Titre central
  doc.moveDown(1.5)
    .font("Helvetica-Bold").fontSize(20)
    .fillColor("#1a4731")
    .text("ATTESTATION DE PARTICIPATION", margin, doc.y, { width: cW, align: "center" });

  // Ligne décorative
  doc.moveDown(0.5)
    .moveTo(margin + 60, doc.y).lineTo(pageW - margin - 60, doc.y)
    .strokeColor("#1a4731").lineWidth(2).stroke();

  doc.moveDown(1.2).font("Helvetica").fontSize(12).fillColor("#333333");

  // Corps de l'attestation
  const nomComplet = [membre.prenoms, membre.nom].filter(Boolean).join(" ");
  doc.text("La Direction de la Coopérative certifie que :", margin, doc.y, { width: cW, align: "center" });

  doc.moveDown(1)
    .font("Helvetica-Bold").fontSize(16).fillColor("#1a4731")
    .text(nomComplet.toUpperCase(), margin, doc.y, { width: cW, align: "center" });

  if (membre.numero_cni) {
    doc.moveDown(0.3).font("Helvetica").fontSize(10).fillColor("#666666")
      .text(`CNI : ${membre.numero_cni}`, margin, doc.y, { width: cW, align: "center" });
  }

  doc.moveDown(1).font("Helvetica").fontSize(12).fillColor("#333333")
    .text("a participé à la formation :", margin, doc.y, { width: cW, align: "center" });

  doc.moveDown(0.8).font("Helvetica-Bold").fontSize(14).fillColor("#1a4731")
    .text(`"${session.titre}"`, margin, doc.y, { width: cW, align: "center" });

  if (session.thematique) {
    doc.moveDown(0.4).font("Helvetica-Oblique").fontSize(11).fillColor("#555555")
      .text(`Thématique : ${session.thematique}`, margin, doc.y, { width: cW, align: "center" });
  }

  // Détails de la session
  doc.moveDown(1.5);
  const details: Array<[string, string]> = [
    ["Date", fmtDate(session.date_session)],
  ];
  if (session.duree_heures) details.push(["Durée", `${session.duree_heures} heure(s)`]);
  if (session.lieu)          details.push(["Lieu", session.lieu]);
  if (session.formateur)     details.push(["Formateur", session.formateur]);
  if (session.organisme_formateur) details.push(["Organisme", session.organisme_formateur]);

  const boxX = margin + 40;
  const boxW = cW - 80;
  const boxY = doc.y;
  doc.save()
    .rect(boxX, boxY, boxW, details.length * 20 + 20)
    .fillColor("#f8f9fa").fill()
    .restore();

  details.forEach(([label, val], i) => {
    const y = boxY + 10 + i * 20;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#444444")
      .text(`${label} :`, boxX + 10, y, { width: 90, lineBreak: false });
    doc.font("Helvetica").fontSize(10).fillColor("#222222")
      .text(val, boxX + 105, y, { width: boxW - 115, lineBreak: false });
  });

  doc.y = boxY + details.length * 20 + 30;

  // Zone signature
  doc.moveDown(2);
  const sigY = doc.y;
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333")
    .text("Le Directeur / La Direction", margin + 20, sigY, { width: 180, align: "center" });
  doc.moveTo(margin + 20, sigY + 60).lineTo(margin + 200, sigY + 60)
    .strokeColor("#888888").lineWidth(0.5).stroke();
  doc.font("Helvetica").fontSize(8).fillColor("#888888")
    .text("Signature et cachet", margin + 20, sigY + 64, { width: 180, align: "center" });

  // Numéro et date
  doc.font("Helvetica").fontSize(8).fillColor("#aaaaaa")
    .text(`N° ${numeroAttestation} — Émise le ${fmtDate(dateEmission)}`, margin, sigY + 64, { width: cW, align: "right" });

  // Footers
  const pageRange = doc.bufferedPageRange();
  for (let i = 0; i < pageRange.count; i++) {
    doc.switchToPage(pageRange.start + i);
    await drawFooter(doc, COOP_ID, i + 1, pageRange.count);
  }

  doc.end();
  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// ─── Stats membre ─────────────────────────────────────────────────────────────

export async function getStatsMembre(membreId: number) {
  const result = await db.execute<{
    nb_formations: string;
    heures_totales: string;
    thematiques: string[];
  }>(sql`
    SELECT
      COUNT(DISTINCT i.session_id)          AS nb_formations,
      COALESCE(SUM(s.duree_heures), 0)      AS heures_totales,
      ARRAY_AGG(DISTINCT s.thematique)
        FILTER (WHERE s.thematique IS NOT NULL) AS thematiques
    FROM inscriptions_formation i
    JOIN sessions_formation s ON s.id = i.session_id
    WHERE i.membre_id = ${membreId}
      AND i.statut IN ('inscrit','present')
  `);

  const formations = await db.execute<{
    session_id: number; titre: string; thematique: string | null;
    date_session: string; duree_heures: string | null; statut: string;
    numero_attestation: string | null; pdf_url: string | null;
  }>(sql`
    SELECT
      s.id AS session_id, s.titre, s.thematique, s.date_session::text,
      s.duree_heures, i.statut,
      a.numero_attestation, a.pdf_url
    FROM inscriptions_formation i
    JOIN sessions_formation s ON s.id = i.session_id
    LEFT JOIN attestations_formation a ON a.session_id = i.session_id AND a.membre_id = i.membre_id
    WHERE i.membre_id = ${membreId}
    ORDER BY s.date_session DESC
  `);

  const s = result.rows[0];
  return {
    nbFormations: parseInt(s?.nb_formations ?? "0"),
    heuresTotales: parseFloat(s?.heures_totales ?? "0"),
    thematiques: (s?.thematiques ?? []).filter(Boolean),
    formations: formations.rows,
  };
}

// ─── Stats globales ───────────────────────────────────────────────────────────

export async function getStats() {
  const result = await db.execute<{
    nb_sessions: string; nb_beneficiaires: string;
    heures_dispensees: string; nb_attestations: string;
  }>(sql`
    SELECT
      COUNT(DISTINCT s.id)                               AS nb_sessions,
      COUNT(DISTINCT i.membre_id)                        AS nb_beneficiaires,
      COALESCE(SUM(s.duree_heures), 0)                   AS heures_dispensees,
      (SELECT COUNT(*) FROM attestations_formation a
       JOIN sessions_formation ss ON ss.id = a.session_id
       WHERE ss.cooperative_id = ${COOP_ID})             AS nb_attestations
    FROM sessions_formation s
    LEFT JOIN inscriptions_formation i ON i.session_id = s.id
    WHERE s.cooperative_id = ${COOP_ID}
  `);

  const totalMembres = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*) AS total FROM membres WHERE cooperative_id = ${COOP_ID} AND statut = 'actif'
  `);
  const totalM = parseInt(totalMembres.rows[0]?.total ?? "0");

  const thematiques = await db.execute<{ thematique: string; nb: string }>(sql`
    SELECT thematique, COUNT(*) AS nb
    FROM sessions_formation
    WHERE cooperative_id = ${COOP_ID} AND thematique IS NOT NULL
    GROUP BY thematique ORDER BY nb DESC
  `);

  const topMembres = await db.execute<{ membre_nom: string; nb: string; heures: string }>(sql`
    SELECT m.nom AS membre_nom, COUNT(i.session_id) AS nb,
           COALESCE(SUM(s.duree_heures), 0) AS heures
    FROM inscriptions_formation i
    JOIN membres m ON m.id = i.membre_id
    JOIN sessions_formation s ON s.id = i.session_id
    WHERE s.cooperative_id = ${COOP_ID} AND i.statut IN ('inscrit','present')
    GROUP BY m.nom ORDER BY nb DESC LIMIT 10
  `);

  const s = result.rows[0];
  const nbBenef = parseInt(s?.nb_beneficiaires ?? "0");
  return {
    nbSessions:      parseInt(s?.nb_sessions ?? "0"),
    nbBeneficiaires: nbBenef,
    heuresDispensees: parseFloat(s?.heures_dispensees ?? "0"),
    nbAttestations:  parseInt(s?.nb_attestations ?? "0"),
    tauxCouverture:  totalM > 0 ? Math.round((nbBenef / totalM) * 100) : 0,
    parThematique:   thematiques.rows,
    topMembres:      topMembres.rows,
  };
}
