import { db, programmesFormationTable, sessionsFormationTable, inscriptionsFormationTable, attestationsFormationTable, evaluationsFormationTable, membresTable, portailNotificationsTable } from "@workspace/db";
import { eq, and, inArray, sql, desc, not } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import PDFDocument from "pdfkit";
import { drawHeader, drawFooter } from "./pdfHeaderService.js";
import { getConfig } from "./configService.js";



// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
}

async function getCoopNom(cooperativeId: number): Promise<string> {
  const r = await db.execute<{ nom: string }>(sql`SELECT nom FROM cooperatives WHERE id = ${cooperativeId} LIMIT 1`);
  return r.rows[0]?.nom ?? "CoopDigital";
}

// ─── Programmes ───────────────────────────────────────────────────────────────

export async function listProgrammes(cooperativeId: number) {
  return db
    .select()
    .from(programmesFormationTable)
    .where(eq(programmesFormationTable.cooperativeId, cooperativeId))
    .orderBy(desc(programmesFormationTable.createdAt));
}

export async function createProgramme(cooperativeId: number, data: {
  titre: string;
  description?: string;
  thematiques?: string[];
  financeur?: string;
  budgetFcfa?: number;
  dateDebut?: string;
  dateFin?: string;
}) {
  const [row] = await db.insert(programmesFormationTable).values({
    cooperativeId: cooperativeId,
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

export async function updateProgramme(cooperativeId: number, id: number, data: Partial<{
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
    .where(and(eq(programmesFormationTable.id, id), eq(programmesFormationTable.cooperativeId, cooperativeId)))
    .returning();
  return row ?? null;
}

export async function deleteProgramme(cooperativeId: number, id: number) {
  await db.delete(programmesFormationTable).where(
    and(eq(programmesFormationTable.id, id), eq(programmesFormationTable.cooperativeId, cooperativeId))
  );
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function listSessions(cooperativeId: number, opts?: { statut?: string; programmeId?: number; upcoming?: boolean }) {
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
    WHERE s.cooperative_id = ${cooperativeId}
      ${opts?.statut      ? sql`AND s.statut = ${opts.statut}` : sql``}
      ${opts?.programmeId ? sql`AND s.programme_id = ${opts.programmeId}` : sql``}
      ${opts?.upcoming    ? sql`AND s.date_session >= CURRENT_DATE` : sql``}
    GROUP BY s.id, p.titre
    ORDER BY s.date_session DESC, s.heure_debut
  `);
  return result.rows;
}

export async function getSession(cooperativeId: number, id: number) {
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
    WHERE s.id = ${id} AND s.cooperative_id = ${cooperativeId}
    GROUP BY s.id, p.titre
  `);
  return result.rows[0] ?? null;
}

export async function createSession(cooperativeId: number, data: {
  titre: string; programmeId?: number; campagneId?: number; thematique?: string;
  formateur?: string; organismeFormateur?: string; lieu?: string; dateSession: string;
  heureDebut?: string; heureFin?: string; dureeHeures?: number; nbPlaces?: number;
  coutFcfa?: number; supportUrl?: string;
}) {
  const [row] = await db.insert(sessionsFormationTable).values({
    cooperativeId: cooperativeId,
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

export async function updateSession(cooperativeId: number, id: number, data: Partial<{
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
  }).where(and(eq(sessionsFormationTable.id, id), eq(sessionsFormationTable.cooperativeId, cooperativeId)))
    .returning();
  return row ?? null;
}

// ─── Inscriptions ─────────────────────────────────────────────────────────────

export async function inscrireMembres(
  cooperativeId: number,
  sessionId: number,
  opts: { membreIds?: number[]; zone?: string; section?: string; tous?: boolean }
): Promise<{ inscrits: number; dejaInscrits: number }> {
  // Résoudre la liste de membres
  let membreIds: number[] = opts.membreIds ?? [];

  if (opts.tous || opts.zone || opts.section) {
    const rows = await db.execute<{ id: number }>(sql`
      SELECT id FROM membres
      WHERE cooperative_id = ${cooperativeId} AND statut = 'actif'
        ${opts.zone    ? sql`AND village = ANY(SELECT nom FROM zones_collecte WHERE nom = ${opts.zone} AND cooperative_id = ${cooperativeId})` : sql``}
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

  if (nouveaux.length === 0) return { inscrits: 0, dejaInscrits: existingSet.size };

  // ── Vérification capacité (nb_places) ────────────────────────────────────
  const [sess] = await db.select({ nbPlaces: sessionsFormationTable.nbPlaces })
    .from(sessionsFormationTable)
    .where(eq(sessionsFormationTable.id, sessionId))
    .limit(1);

  if (sess?.nbPlaces != null) {
    const [countRow] = await db.execute<{ count: string }>(sql`
      SELECT COUNT(*)::text AS count FROM inscriptions_formation WHERE session_id = ${sessionId}
    `).then((r) => r.rows);
    const totalActuels = parseInt(countRow?.count ?? "0", 10);
    const placesDisponibles = sess.nbPlaces - totalActuels;

    if (placesDisponibles <= 0) {
      throw Object.assign(
        new Error("Session complète — aucune place disponible"),
        { code: "CAPACITE_DEPASSEE", disponibles: 0 }
      );
    }
    if (nouveaux.length > placesDisponibles) {
      nouveaux.splice(placesDisponibles);
    }
  }

  await db.insert(inscriptionsFormationTable).values(
    nouveaux.map((membreId) => ({ sessionId, membreId }))
  );

  return { inscrits: nouveaux.length, dejaInscrits: existingSet.size };
}

export async function getInscrits(cooperativeId: number, sessionId: number, delegueId?: number) {
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
      ${delegueId !== undefined ? sql`AND m.delegue_id = ${delegueId}` : sql``}
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

async function creerNotifsPortailFormation(
  cooperativeId: number,
  membreIds: number[],
  titre: string,
  message: string,
): Promise<void> {
  if (membreIds.length === 0) return;
  const rows = membreIds.map((membreId) => ({
    membreId,
    cooperativeId,
    type: "formation",
    titre,
    message,
    lien: "/",
  }));
  await db.insert(portailNotificationsTable).values(rows).onConflictDoNothing();
}

export async function envoyerConvocations(cooperativeId: number, sessionId: number) {
  const session = await getSession(cooperativeId, sessionId);
  if (!session) throw new Error("Session introuvable");

  const inscrits = await getInscrits(cooperativeId, sessionId);
  const dateStr  = fmtDate(session.date_session);
  const heure    = (session.heure_debut ?? "07:00").slice(0, 5);
  const lieu     = session.lieu ?? "lieu à confirmer";
  const tousIds  = inscrits.map((i) => i.membre_id);

  // ── Notification in-app portail ───────────────────────────────────────────
  if (tousIds.length > 0) {
    await creerNotifsPortailFormation(
      cooperativeId,
      tousIds,
      "Convocation — Formation",
      `Vous êtes convoqué(e) à la formation « ${session.titre} » le ${dateStr} à ${heure} — ${lieu}.`,
    ).catch((err) => logger.warn({ err }, "Notif portail convocation ignorée"));
  }

  // ── Push web : inscrits avec souscription portail ─────────────────────────
  if (tousIds.length > 0) {
    const { envoyerPushGroupePortail } = await import("./pushService.js");
    envoyerPushGroupePortail(tousIds, {
      title: "📚 Convocation — Formation",
      body:  `"${session.titre}" · le ${dateStr} à ${heure} — ${lieu}`,
      url:   "/",
    }).catch((err) => logger.warn({ err }, "Push portail convocation ignoré"));
  }

  logger.info({ sessionId, total: tousIds.length }, "Convocations envoyées");
  return { envoyes: tousIds.length, echecs: 0, total: tousIds.length };
}

export async function envoyerRappels(cooperativeId: number, sessionId: number) {
  const session = await getSession(cooperativeId, sessionId);
  if (!session) throw new Error("Session introuvable");

  const inscrits = await getInscrits(cooperativeId, sessionId);
  const heure    = (session.heure_debut ?? "07:00").slice(0, 5);
  const lieu     = session.lieu ?? "lieu à confirmer";
  const tousIds  = inscrits.map((i) => i.membre_id);

  // ── Notification in-app portail ───────────────────────────────────────────
  if (tousIds.length > 0) {
    await creerNotifsPortailFormation(
      cooperativeId,
      tousIds,
      "Rappel — Formation demain",
      `Rappel : la formation « ${session.titre} » a lieu demain à ${heure} — ${lieu}.`,
    ).catch((err) => logger.warn({ err }, "Notif portail rappel ignorée"));
  }

  // ── Push web : inscrits avec souscription portail ─────────────────────────
  if (tousIds.length > 0) {
    const { envoyerPushGroupePortail } = await import("./pushService.js");
    envoyerPushGroupePortail(tousIds, {
      title: "🔔 Rappel — Formation demain",
      body:  `"${session.titre}" · demain à ${heure} — ${lieu}`,
      url:   "/",
    }).catch((err) => logger.warn({ err }, "Push portail rappel ignoré"));
  }

  logger.info({ sessionId, total: tousIds.length }, "Rappels envoyés");
  return { envoyes: tousIds.length, echecs: 0, total: tousIds.length };
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

export async function listAttestations(cooperativeId: number, opts?: { sessionId?: number; membreId?: number; search?: string; delegueId?: number }) {
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
    WHERE s.cooperative_id = ${cooperativeId}
      ${opts?.sessionId  ? sql`AND a.session_id  = ${opts.sessionId}` : sql``}
      ${opts?.membreId   ? sql`AND a.membre_id   = ${opts.membreId}`  : sql``}
      ${opts?.delegueId  ? sql`AND m.delegue_id  = ${opts.delegueId}` : sql``}
      ${opts?.search     ? sql`AND (m.nom ILIKE ${'%' + opts.search + '%'} OR a.numero_attestation ILIKE ${'%' + opts.search + '%'})` : sql``}
    ORDER BY a.created_at DESC
  `);
  return result.rows;
}

// ─── Génération PDF attestation ────────────────────────────────────────────────

const THEMATIQUES_MAP: Record<string, string> = {
  bonnes_pratiques:   "Bonnes pratiques agricoles",
  qualite_cacao:      "Qualité du cacao",
  eudr:               "EUDR / Certification",
  gestion_financiere: "Gestion financière",
  sante_securite:     "Santé & sécurité",
  agroforesterie:     "Agroforesterie",
  certification:      "Certification",
  numerique:          "Numérique",
};

function lightenHex(hex: string, factor = 0.91): string {
  try {
    const h = hex.replace("#", "");
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const l = (c: number) => Math.min(255, Math.round(c + (255 - c) * factor));
    return `#${[l(r), l(g), l(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  } catch {
    return "#f0f7f3";
  }
}

export async function genererPdfAttestation(cooperativeId: number, sessionId: number, membreId: number): Promise<Buffer> {
  // ─── Données ────────────────────────────────────────────────────────────────
  const [sessionRes, membreRes, attestRes, coopConfig] = await Promise.all([
    db.execute<{
      titre: string; thematique: string | null; formateur: string | null;
      organisme_formateur: string | null; lieu: string | null;
      date_session: string; duree_heures: string | null;
    }>(sql`SELECT titre, thematique, formateur, organisme_formateur, lieu, date_session::text, duree_heures
           FROM sessions_formation WHERE id = ${sessionId} AND cooperative_id = ${cooperativeId} LIMIT 1`),
    db.execute<{ nom: string; prenoms: string | null; numero_cni: string | null }>(
      sql`SELECT nom, prenoms, numero_cni FROM membres WHERE id = ${membreId} LIMIT 1`,
    ),
    db.execute<{ numero_attestation: string; date_emission: string }>(
      sql`SELECT numero_attestation, date_emission::text FROM attestations_formation
          WHERE session_id = ${sessionId} AND membre_id = ${membreId} LIMIT 1`,
    ),
    getConfig(cooperativeId),
  ]);

  const session = sessionRes.rows[0];
  if (!session) throw new Error("Session introuvable");
  const membre = membreRes.rows[0];
  if (!membre) throw new Error("Membre introuvable");
  const attest = attestRes.rows[0];

  const numeroAttestation = attest?.numero_attestation ?? `ATT-${new Date().getFullYear()}-${sessionId}-${membreId}`;
  const dateEmission      = attest?.date_emission ?? new Date().toISOString().slice(0, 10);
  const couleur           = coopConfig?.couleurPrimaire || "#1a4731";
  const couleurLight      = lightenHex(couleur, 0.91);
  const thematiqueLabel   = session.thematique
    ? (THEMATIQUES_MAP[session.thematique] ?? session.thematique)
    : null;
  const nomComplet = [membre.prenoms, membre.nom].filter(Boolean).join(" ").toUpperCase();

  // ─── Document ───────────────────────────────────────────────────────────────
  const doc    = new PDFDocument({ margin: 40, size: "A4", bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));

  await drawHeader(doc, cooperativeId, {
    titre_document: "ATTESTATION\nDE PARTICIPATION",
    reference: numeroAttestation,
  });

  const margin = 40;
  const pageW  = doc.page.width;   // 595.28
  const pageH  = doc.page.height;  // 841.89
  const cW     = pageW - margin * 2;

  // ── Cadre double décoratif ──────────────────────────────────────────────────
  const fL = margin - 10;
  const fR = pageW - margin + 10;
  const fT = 100;
  const fB = pageH - 48;

  doc.save().rect(fL, fT, fR - fL, fB - fT).strokeColor(couleur).lineWidth(1.5).stroke().restore();
  doc.save().rect(fL + 5, fT + 5, fR - fL - 10, fB - fT - 10).strokeColor(couleur).lineWidth(0.4).stroke().restore();

  // Ornements carrés aux 4 coins
  ([
    [fL + 5, fT + 5], [fR - 13, fT + 5],
    [fL + 5, fB - 13], [fR - 13, fB - 13],
  ] as [number, number][]).forEach(([cx, cy]) => {
    doc.save().rect(cx, cy, 8, 8).fillColor(couleur).fill().restore();
  });

  // ── Bannière "ATTESTATION DE PARTICIPATION" ─────────────────────────────────
  const banY = fT + 10;
  const banH = 40;
  doc.save().rect(fL + 10, banY, fR - fL - 20, banH).fillColor(couleur).fill().restore();
  doc.font("Helvetica-Bold").fontSize(15.5).fillColor("#ffffff")
    .text("ATTESTATION  DE  PARTICIPATION", fL + 10, banY + 13, {
      width: fR - fL - 20, align: "center", lineBreak: false,
    });

  // ── Corps ───────────────────────────────────────────────────────────────────
  let y = banY + banH + 20;

  doc.font("Helvetica").fontSize(11).fillColor("#555555")
    .text("La Direction de la Coopérative certifie que :", margin, y, { width: cW, align: "center" });
  y += 26;

  // Filet fin avant nom
  doc.save().moveTo(margin + 70, y).lineTo(pageW - margin - 70, y)
    .strokeColor(couleur).lineWidth(0.5).stroke().restore();
  y += 10;

  // Nom du membre
  doc.font("Helvetica-Bold").fontSize(21).fillColor(couleur)
    .text(nomComplet, margin, y, { width: cW, align: "center" });
  y += 30;

  if (membre.numero_cni) {
    doc.font("Helvetica").fontSize(9).fillColor("#888888")
      .text(`N° CNI : ${membre.numero_cni}`, margin, y, { width: cW, align: "center" });
    y += 16;
  }

  // Filet fin après nom
  doc.save().moveTo(margin + 70, y + 2).lineTo(pageW - margin - 70, y + 2)
    .strokeColor(couleur).lineWidth(0.5).stroke().restore();
  y += 18;

  doc.font("Helvetica").fontSize(11).fillColor("#555555")
    .text("a participé avec succès à la formation :", margin, y, { width: cW, align: "center" });
  y += 26;

  // Titre de la formation
  doc.font("Helvetica-Bold").fontSize(14).fillColor("#1a1a1a")
    .text(`« ${session.titre} »`, margin, y, { width: cW, align: "center" });
  y += 22;

  if (thematiqueLabel) {
    doc.font("Helvetica-Oblique").fontSize(10).fillColor("#666666")
      .text(`Thématique : ${thematiqueLabel}`, margin, y, { width: cW, align: "center" });
    y += 16;
  }

  y += 16;

  // ── Tableau des détails ─────────────────────────────────────────────────────
  const details: Array<[string, string]> = [["Date", fmtDate(session.date_session)]];
  if (session.duree_heures)        details.push(["Durée", `${session.duree_heures} heure(s)`]);
  if (session.lieu)                details.push(["Lieu", session.lieu]);
  if (session.formateur)           details.push(["Formateur", session.formateur]);
  if (session.organisme_formateur) details.push(["Organisme", session.organisme_formateur]);

  const tblX  = margin + 30;
  const tblW  = cW - 60;
  const rowH  = 22;
  const labW  = 90;
  const tblH  = details.length * rowH + 16;

  // Fond clair + barre d'accent gauche
  doc.save().rect(tblX, y, tblW, tblH).fillColor(couleurLight).fill().restore();
  doc.save().rect(tblX, y, 3, tblH).fillColor(couleur).fill().restore();

  details.forEach(([label, val], i) => {
    const ry = y + 8 + i * rowH;
    if (i > 0) {
      doc.save().moveTo(tblX + 10, ry - 1).lineTo(tblX + tblW - 10, ry - 1)
        .strokeColor("#dddddd").lineWidth(0.3).stroke().restore();
    }
    doc.font("Helvetica-Bold").fontSize(9.5).fillColor(couleur)
      .text(label, tblX + 12, ry, { width: labW, lineBreak: false });
    doc.font("Helvetica").fontSize(9.5).fillColor("#222222")
      .text(val, tblX + labW + 16, ry, { width: tblW - labW - 26, lineBreak: false });
  });

  y += tblH + 32;

  // ── Zone signature ──────────────────────────────────────────────────────────
  const sigW   = 190;
  const sigX   = margin + 10;
  const sigLineY = y + 50;

  doc.font("Helvetica-Bold").fontSize(10).fillColor("#333333")
    .text("Le Directeur / La Direction", sigX, y, { width: sigW, align: "center" });

  doc.save().moveTo(sigX, sigLineY).lineTo(sigX + sigW, sigLineY)
    .strokeColor("#bbbbbb").lineWidth(0.5).stroke().restore();
  doc.font("Helvetica").fontSize(8).fillColor("#aaaaaa")
    .text("Signature et cachet", sigX, sigLineY + 5, { width: sigW, align: "center" });

  // Référence (droite)
  doc.font("Helvetica").fontSize(8).fillColor("#888888")
    .text(`N° ${numeroAttestation}`, margin, sigLineY + 5, { width: cW, align: "right" });
  doc.font("Helvetica-Oblique").fontSize(7.5).fillColor("#aaaaaa")
    .text(`Émise le ${fmtDate(dateEmission)}`, margin, sigLineY + 17, { width: cW, align: "right" });

  // ── Footers ─────────────────────────────────────────────────────────────────
  const pageRange = doc.bufferedPageRange();
  for (let i = 0; i < pageRange.count; i++) {
    doc.switchToPage(pageRange.start + i);
    await drawFooter(doc, cooperativeId, i + 1, pageRange.count);
  }
  doc.flushPages();

  doc.end();
  return new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

// ─── Stats membre ─────────────────────────────────────────────────────────────

export async function getStatsMembre(cooperativeId: number, membreId: number) {
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

export async function getStats(cooperativeId: number) {
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
       WHERE ss.cooperative_id = ${cooperativeId})             AS nb_attestations
    FROM sessions_formation s
    LEFT JOIN inscriptions_formation i ON i.session_id = s.id
    WHERE s.cooperative_id = ${cooperativeId}
  `);

  const totalMembres = await db.execute<{ total: string }>(sql`
    SELECT COUNT(*) AS total FROM membres WHERE cooperative_id = ${cooperativeId} AND statut = 'actif'
  `);
  const totalM = parseInt(totalMembres.rows[0]?.total ?? "0");

  const thematiques = await db.execute<{ thematique: string; nb: string }>(sql`
    SELECT thematique, COUNT(*) AS nb
    FROM sessions_formation
    WHERE cooperative_id = ${cooperativeId} AND thematique IS NOT NULL
    GROUP BY thematique ORDER BY nb DESC
  `);

  const topMembres = await db.execute<{ membre_nom: string; nb: string; heures: string }>(sql`
    SELECT m.nom AS membre_nom, COUNT(i.session_id) AS nb,
           COALESCE(SUM(s.duree_heures), 0) AS heures
    FROM inscriptions_formation i
    JOIN membres m ON m.id = i.membre_id
    JOIN sessions_formation s ON s.id = i.session_id
    WHERE s.cooperative_id = ${cooperativeId} AND i.statut IN ('inscrit','present')
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
