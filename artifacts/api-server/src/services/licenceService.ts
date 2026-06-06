import crypto from "node:crypto";
import cron from "node-cron";
import { db } from "@workspace/db";
import {
  licencesTable, plansAbonnementTable, historiqueLicencesTable,
  m15UsersTable, cooperativesTable, membresTable, usersTable,
} from "@workspace/db";
import { and, eq, desc, or, lte, isNotNull, ne } from "drizzle-orm";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { sendSMS } from "./smsService.js";
import { logger } from "../lib/logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LicenceCheck {
  valide: boolean;
  statut: string;
  joursRestants: number | null;
  messageInvalide: string | null;
  planNom?: string;
  nbMembresMax?: number | null;
  nbUsersMax?: number | null;
}

// ─── Cache in-memory 5 minutes ────────────────────────────────────────────────

interface CacheEntry { data: LicenceCheck; expiresAt: number }
const licenceCache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 5 * 60 * 1000;

function getCached(cooperativeId: number): LicenceCheck | null {
  const entry = licenceCache.get(cooperativeId);
  if (!entry || Date.now() > entry.expiresAt) {
    licenceCache.delete(cooperativeId);
    return null;
  }
  return entry.data;
}

function setCache(cooperativeId: number, data: LicenceCheck): void {
  licenceCache.set(cooperativeId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateCache(cooperativeId: number): void {
  licenceCache.delete(cooperativeId);
}

// ─── Génération clé de licence ────────────────────────────────────────────────

const CHARSET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function randomSegment(): string {
  return Array.from({ length: 4 }, () => {
    const byte = crypto.randomBytes(1)[0]!;
    return CHARSET[byte % CHARSET.length];
  }).join("");
}

async function isCleDispo(cle: string): Promise<boolean> {
  const [row] = await db
    .select({ id: licencesTable.id })
    .from(licencesTable)
    .where(eq(licencesTable.cleLicence, cle))
    .limit(1);
  return !row;
}

export async function genererCleLicence(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const cle = `M15-${randomSegment()}-${randomSegment()}-${randomSegment()}-${randomSegment()}`;
    if (await isCleDispo(cle)) return cle;
  }
  throw new Error("Impossible de générer une clé unique après 20 tentatives");
}

// ─── Vérification licence active (avec cache) ─────────────────────────────────

export async function verifierLicenceActive(cooperativeId: number): Promise<LicenceCheck> {
  const cached = getCached(cooperativeId);
  if (cached) return cached;

  const rows = await db
    .select({
      id: licencesTable.id,
      statut: licencesTable.statut,
      dateExpiration: licencesTable.dateExpiration,
      dateFinTrial: licencesTable.dateFinTrial,
      motifSuspension: licencesTable.motifSuspension,
      trialActif: licencesTable.trialActif,
      planNom: plansAbonnementTable.nom,
      nbMembresMax: plansAbonnementTable.nbMembresMax,
      nbUsersMax: plansAbonnementTable.nbUsersMax,
    })
    .from(licencesTable)
    .leftJoin(plansAbonnementTable, eq(licencesTable.planId, plansAbonnementTable.id))
    .where(eq(licencesTable.cooperativeId, cooperativeId))
    .orderBy(desc(licencesTable.createdAt))
    .limit(1);

  const licence = rows[0];

  if (!licence) {
    const result: LicenceCheck = {
      valide: false,
      statut: "inactive",
      joursRestants: null,
      messageInvalide: "Aucune licence configurée. Contactez M15 Tech : 0714174082",
    };
    setCache(cooperativeId, result);
    return result;
  }

  const today = new Date();
  const refDate = licence.trialActif && licence.dateFinTrial
    ? licence.dateFinTrial
    : licence.dateExpiration;

  let joursRestants: number | null = null;
  if (refDate) {
    joursRestants = Math.floor((new Date(refDate).getTime() - today.getTime()) / (24 * 3600 * 1000));
  }

  let valide = false;
  let messageInvalide: string | null = null;

  switch (licence.statut) {
    case "active":
      if (joursRestants !== null && joursRestants < 0) {
        messageInvalide = `Votre licence CoopDigital a expiré. Renouvelez sur m15tech.ci ou appelez le 0714174082`;
      } else {
        valide = true;
      }
      break;
    case "trial":
      if (joursRestants !== null && joursRestants < 0) {
        messageInvalide = "Votre période d'essai a expiré. Contactez M15 Tech : 0714174082";
      } else {
        valide = true;
      }
      break;
    case "suspendue":
      messageInvalide = `Votre accès CoopDigital est suspendu. Motif : ${licence.motifSuspension ?? "Non précisé"}. Contactez M15 Tech : 0714174082`;
      break;
    case "expiree":
      messageInvalide = `Votre licence CoopDigital a expiré. Renouvelez sur m15tech.ci ou appelez le 0714174082`;
      break;
    case "supprimee":
      messageInvalide = "Ce compte CoopDigital a été supprimé.";
      break;
    default:
      messageInvalide = "Licence non activée. Contactez M15 Tech : 0714174082";
  }

  const result: LicenceCheck = {
    valide,
    statut: licence.statut,
    joursRestants,
    messageInvalide,
    planNom: licence.planNom ?? undefined,
    nbMembresMax: licence.nbMembresMax,
    nbUsersMax: licence.nbUsersMax,
  };
  setCache(cooperativeId, result);
  return result;
}

// ─── Activation licence ───────────────────────────────────────────────────────

export async function activerLicence(cleLicence: string, cooperativeId: number, m15UserId?: number) {
  const [licence] = await db
    .select()
    .from(licencesTable)
    .where(and(
      eq(licencesTable.cleLicence, cleLicence),
      eq(licencesTable.statut, "inactive"),
    ))
    .limit(1);

  if (!licence) throw new Error("Clé de licence introuvable ou déjà utilisée");

  const [existante] = await db
    .select({ id: licencesTable.id })
    .from(licencesTable)
    .where(and(
      eq(licencesTable.cooperativeId, cooperativeId),
      or(eq(licencesTable.statut, "active"), eq(licencesTable.statut, "trial")),
    ))
    .limit(1);

  if (existante) throw new Error("Cette coopérative a déjà une licence active");

  const today = new Date();
  const dateExpiration = new Date(today);
  dateExpiration.setDate(dateExpiration.getDate() + licence.dureeAns * 365);

  const todayStr = today.toISOString().slice(0, 10);
  const expirationStr = dateExpiration.toISOString().slice(0, 10);

  await db.update(licencesTable)
    .set({
      cooperativeId,
      statut: "active",
      dateActivation: todayStr,
      dateExpiration: expirationStr,
      updatedAt: new Date(),
    })
    .where(eq(licencesTable.id, licence.id));

  await db.insert(historiqueLicencesTable).values({
    licenceId: licence.id,
    cooperativeId,
    action: "activation",
    ancienStatut: "inactive",
    nouveauStatut: "active",
    details: { dureeAns: licence.dureeAns, dateExpiration: expirationStr },
    effectuePar: m15UserId ?? null,
  });

  invalidateCache(cooperativeId);

  const [coop] = await db
    .select()
    .from(cooperativesTable)
    .where(eq(cooperativesTable.id, cooperativeId))
    .limit(1);

  const dateExp = dateExpiration.toLocaleDateString("fr-FR");
  await sendSMS("0714174082", `Licence CoopDigital activée pour ${coop?.nom ?? ""}. Valide jusqu'au ${dateExp}. M15 Tech`);

  return { licenceId: licence.id, dateExpiration: expirationStr };
}

// ─── Suspension coopérative ───────────────────────────────────────────────────

export async function suspendreCooperative(cooperativeId: number, motif: string, m15UserId: number) {
  const [licence] = await db
    .select()
    .from(licencesTable)
    .where(and(
      eq(licencesTable.cooperativeId, cooperativeId),
      or(eq(licencesTable.statut, "active"), eq(licencesTable.statut, "trial")),
    ))
    .orderBy(desc(licencesTable.createdAt))
    .limit(1);

  if (!licence) throw new Error("Aucune licence active trouvée pour cette coopérative");

  const ancienStatut = licence.statut;

  await db.update(licencesTable)
    .set({
      statut: "suspendue",
      motifSuspension: motif,
      dateSuspension: new Date(),
      suspenduPar: m15UserId,
      updatedAt: new Date(),
    })
    .where(eq(licencesTable.id, licence.id));

  await db.insert(historiqueLicencesTable).values({
    licenceId: licence.id,
    cooperativeId,
    action: "suspension",
    ancienStatut,
    nouveauStatut: "suspendue",
    details: { motif },
    effectuePar: m15UserId,
  });

  invalidateCache(cooperativeId);

  const directeurs = await db
    .select({ telephone: usersTable.telephone })
    .from(usersTable)
    .where(and(
      eq(usersTable.cooperativeId, cooperativeId),
      or(eq(usersTable.role, "pca"), eq(usersTable.role, "directeur")),
    ))
    .limit(3);

  const message = `Votre accès CoopDigital est suspendu. Motif : ${motif}. Contactez M15 Tech : 0714174082`;
  for (const u of directeurs) {
    if (u.telephone) await sendSMS(u.telephone, message);
  }
}

// ─── Réactivation coopérative ─────────────────────────────────────────────────

export async function reactiverCooperative(cooperativeId: number, m15UserId: number) {
  const [licence] = await db
    .select()
    .from(licencesTable)
    .where(and(
      eq(licencesTable.cooperativeId, cooperativeId),
      eq(licencesTable.statut, "suspendue"),
    ))
    .orderBy(desc(licencesTable.createdAt))
    .limit(1);

  if (!licence) throw new Error("Aucune licence suspendue trouvée");

  await db.update(licencesTable)
    .set({
      statut: "active",
      motifSuspension: null,
      dateSuspension: null,
      suspenduPar: null,
      updatedAt: new Date(),
    })
    .where(eq(licencesTable.id, licence.id));

  await db.insert(historiqueLicencesTable).values({
    licenceId: licence.id,
    cooperativeId,
    action: "reactivation",
    ancienStatut: "suspendue",
    nouveauStatut: "active",
    effectuePar: m15UserId,
  });

  invalidateCache(cooperativeId);

  const [president] = await db
    .select({ telephone: usersTable.telephone })
    .from(usersTable)
    .where(and(
      eq(usersTable.cooperativeId, cooperativeId),
      eq(usersTable.role, "pca"),
    ))
    .limit(1);

  if (president?.telephone) {
    await sendSMS(president.telephone, "Votre accès CoopDigital a été réactivé. M15 Tech");
  }
}

// ─── Renouvellement licence ───────────────────────────────────────────────────

export async function renouvelerLicence(
  licenceId: number,
  dureeAns: number,
  m15UserId: number,
  paiement?: { montant?: number; mode?: string; reference?: string }
) {
  const [licence] = await db
    .select()
    .from(licencesTable)
    .where(eq(licencesTable.id, licenceId))
    .limit(1);

  if (!licence) throw new Error("Licence introuvable");

  const today = new Date();
  const baseDate = licence.dateExpiration && new Date(licence.dateExpiration) > today
    ? new Date(licence.dateExpiration)
    : today;

  const newExpiration = new Date(baseDate);
  newExpiration.setDate(newExpiration.getDate() + dureeAns * 365);
  const expirationStr = newExpiration.toISOString().slice(0, 10);

  const ancienStatut = licence.statut;

  await db.update(licencesTable)
    .set({
      dureeAns,
      dateExpiration: expirationStr,
      statut: "active",
      dateDernierRenouvellement: today.toISOString().slice(0, 10),
      nbRenouvellements: (licence.nbRenouvellements ?? 0) + 1,
      ...(paiement?.montant !== undefined && { montantPayeFcfa: String(paiement.montant) }),
      ...(paiement?.mode && { modePaiement: paiement.mode }),
      ...(paiement?.reference && { referencePaiement: paiement.reference }),
      updatedAt: new Date(),
    })
    .where(eq(licencesTable.id, licenceId));

  await db.insert(historiqueLicencesTable).values({
    licenceId,
    cooperativeId: licence.cooperativeId,
    action: "renouvellement",
    ancienStatut,
    nouveauStatut: "active",
    details: { dureeAns, dateExpiration: expirationStr, paiement },
    effectuePar: m15UserId,
  });

  if (licence.cooperativeId) invalidateCache(licence.cooperativeId);

  return { dateExpiration: expirationStr };
}

// ─── Suppression coopérative ──────────────────────────────────────────────────

export async function supprimerCooperative(cooperativeId: number, motif: string, m15UserId: number) {
  const [licence] = await db
    .select()
    .from(licencesTable)
    .where(eq(licencesTable.cooperativeId, cooperativeId))
    .orderBy(desc(licencesTable.createdAt))
    .limit(1);

  if (!licence) throw new Error("Aucune licence trouvée pour cette coopérative");

  const ancienStatut = licence.statut;

  logger.info({ cooperativeId, motif, m15UserId }, "SUPPRESSION cooperative — archivage initié");

  await db.update(membresTable)
    .set({
      nom: "DONNEES_SUPPRIMEES",
      prenoms: "DONNEES_SUPPRIMEES",
      numeroCni: null,
      telephone: "SUPPRIME",
    })
    .where(eq(membresTable.cooperativeId, cooperativeId));

  await db.update(usersTable)
    .set({
      email: sql`CONCAT('supprime_', ${usersTable.id}, '@deleted.invalid')`,
      passwordHash: "DONNEES_SUPPRIMEES",
      nom: "DONNEES_SUPPRIMEES",
      prenoms: "DONNEES_SUPPRIMEES",
      telephone: null,
      actif: false,
    })
    .where(eq(usersTable.cooperativeId, cooperativeId));

  const dateSuppression = new Date();
  await db.update(licencesTable)
    .set({
      statut: "supprimee",
      motifSuppression: motif,
      dateSuppression,
      supprimePar: m15UserId,
      donneesArchivees: true,
      updatedAt: new Date(),
    })
    .where(eq(licencesTable.id, licence.id));

  await db.insert(historiqueLicencesTable).values({
    licenceId: licence.id,
    cooperativeId,
    action: "suppression",
    ancienStatut,
    nouveauStatut: "supprimee",
    details: { motif, dateSuppression: dateSuppression.toISOString() },
    effectuePar: m15UserId,
  });

  invalidateCache(cooperativeId);

  logger.warn({ cooperativeId, motif }, "Cooperative supprimée — données anonymisées");
}

// ─── Vérification expirations (CRON quotidien) ───────────────────────────────

export async function checkExpirations() {
  const licences = await db
    .select({
      id: licencesTable.id,
      cooperativeId: licencesTable.cooperativeId,
      dateExpiration: licencesTable.dateExpiration,
      statut: licencesTable.statut,
      renouvellementAuto: licencesTable.renouvellementAuto,
    })
    .from(licencesTable)
    .where(and(
      isNotNull(licencesTable.dateExpiration),
      ne(licencesTable.statut, "supprimee"),
      ne(licencesTable.statut, "resiliee"),
    ));

  const today = new Date();

  for (const licence of licences) {
    if (!licence.dateExpiration || !licence.cooperativeId) continue;

    const expDate = new Date(licence.dateExpiration);
    const joursRestants = Math.floor((expDate.getTime() - today.getTime()) / (24 * 3600 * 1000));

    const presidentRows = await db
      .select({ telephone: usersTable.telephone, nom: usersTable.nom })
      .from(usersTable)
      .where(and(
        eq(usersTable.cooperativeId, licence.cooperativeId),
        eq(usersTable.role, "pca"),
      ))
      .limit(1);

    const president = presidentRows[0];
    const tel = president?.telephone;

    if (licence.statut === "active") {
      if (joursRestants === 60 && tel) {
        await sendSMS(tel, `Votre licence CoopDigital expire dans 60 jours (${expDate.toLocaleDateString("fr-FR")}). Renouvelez sur m15tech.ci`);
      } else if (joursRestants === 30 && tel) {
        await sendSMS(tel, `⚠️ Votre licence CoopDigital expire dans 30 jours. Renouvelez maintenant sur m15tech.ci ou au 0714174082`);
      } else if (joursRestants === 15 && tel) {
        await sendSMS(tel, `🔴 URGENT — Votre licence CoopDigital expire dans 15 jours ! Renouvelez sur m15tech.ci ou appelez le 0714174082`);
      } else if (joursRestants > 0 && joursRestants <= 7 && tel) {
        await sendSMS(tel, `🔴 Votre licence CoopDigital expire dans ${joursRestants} jour(s) ! Renouvelez maintenant : 0714174082`);
      } else if (joursRestants <= 0) {
        await db.update(licencesTable)
          .set({ statut: "expiree", updatedAt: new Date() })
          .where(eq(licencesTable.id, licence.id));
        await db.insert(historiqueLicencesTable).values({
          licenceId: licence.id,
          cooperativeId: licence.cooperativeId,
          action: "expiration",
          ancienStatut: "active",
          nouveauStatut: "expiree",
          details: { dateExpiration: licence.dateExpiration },
        });
        invalidateCache(licence.cooperativeId);
        if (tel) await sendSMS(tel, `Votre licence CoopDigital a expiré le ${expDate.toLocaleDateString("fr-FR")}. Renouvelez sur m15tech.ci ou appelez le 0714174082`);
      }
    }

    if (licence.statut === "expiree" && joursRestants <= -30) {
      logger.warn({ cooperativeId: licence.cooperativeId }, "Licence expirée depuis J+30 — suppression auto initiée");
    }
  }
}

// ─── Login M15 Tech ───────────────────────────────────────────────────────────

import jwt from "jsonwebtoken";

export async function loginM15(email: string, motDePasse: string) {
  const secret = process.env["M15_JWT_SECRET"] ?? process.env["JWT_SECRET"];
  if (!secret) throw new Error("JWT_SECRET non configuré");

  const [user] = await db
    .select()
    .from(m15UsersTable)
    .where(and(eq(m15UsersTable.email, email), eq(m15UsersTable.actif, true)))
    .limit(1);

  if (!user) return null;

  const ok = await bcrypt.compare(motDePasse, user.passwordHash);
  if (!ok) return null;

  const payload = { id: user.id, email: user.email, role: user.role, type: "m15" };
  const token = jwt.sign(payload, secret, { expiresIn: "12h" });

  return {
    token,
    user: { id: user.id, nom: user.nom, email: user.email, role: user.role },
  };
}

// ─── Dashboard M15 ────────────────────────────────────────────────────────────

export async function getDashboardM15() {
  const [stats] = await db
    .select({
      totalActives: sql<number>`COUNT(*) FILTER (WHERE ${licencesTable.statut} = 'active')`,
      totalTrials: sql<number>`COUNT(*) FILTER (WHERE ${licencesTable.statut} = 'trial')`,
      totalSuspendues: sql<number>`COUNT(*) FILTER (WHERE ${licencesTable.statut} = 'suspendue')`,
      totalExpirees: sql<number>`COUNT(*) FILTER (WHERE ${licencesTable.statut} = 'expiree')`,
      revenus: sql<string>`COALESCE(SUM(${licencesTable.montantPayeFcfa}), 0)`,
    })
    .from(licencesTable);

  const [membresTotal] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(membresTable);

  const expirantBientot = await db
    .select({
      id: licencesTable.id,
      cooperativeId: licencesTable.cooperativeId,
      dateExpiration: licencesTable.dateExpiration,
      planNom: plansAbonnementTable.nom,
    })
    .from(licencesTable)
    .leftJoin(plansAbonnementTable, eq(licencesTable.planId, plansAbonnementTable.id))
    .where(and(
      eq(licencesTable.statut, "active"),
      isNotNull(licencesTable.dateExpiration),
      lte(licencesTable.dateExpiration, sql`CURRENT_DATE + INTERVAL '30 days'`),
    ))
    .orderBy(licencesTable.dateExpiration);

  return {
    actives: Number(stats?.totalActives ?? 0),
    trials: Number(stats?.totalTrials ?? 0),
    suspendues: Number(stats?.totalSuspendues ?? 0),
    expirees: Number(stats?.totalExpirees ?? 0),
    revenus: Number(stats?.revenus ?? 0),
    totalMembres: Number(membresTotal?.total ?? 0),
    expirantDans30j: expirantBientot.length,
    expirations: expirantBientot,
  };
}

// ─── Liste coopératives ───────────────────────────────────────────────────────

export async function getCooperativesM15() {
  const coops = await db
    .select({
      id: cooperativesTable.id,
      nom: cooperativesTable.nom,
      ville: cooperativesTable.ville,
      region: cooperativesTable.region,
      createdAt: cooperativesTable.createdAt,
    })
    .from(cooperativesTable)
    .orderBy(cooperativesTable.nom);

  const result = await Promise.all(coops.map(async (coop) => {
    const [licence] = await db
      .select({
        id: licencesTable.id,
        statut: licencesTable.statut,
        dateActivation: licencesTable.dateActivation,
        dateExpiration: licencesTable.dateExpiration,
        renouvellementAuto: licencesTable.renouvellementAuto,
        planNom: plansAbonnementTable.nom,
        dureeAns: licencesTable.dureeAns,
        cleLicence: licencesTable.cleLicence,
      })
      .from(licencesTable)
      .leftJoin(plansAbonnementTable, eq(licencesTable.planId, plansAbonnementTable.id))
      .where(eq(licencesTable.cooperativeId, coop.id))
      .orderBy(desc(licencesTable.createdAt))
      .limit(1);

    const today = new Date();
    const joursRestants = licence?.dateExpiration
      ? Math.floor((new Date(licence.dateExpiration).getTime() - today.getTime()) / (24 * 3600 * 1000))
      : null;

    const [nbMembres] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(membresTable)
      .where(eq(membresTable.cooperativeId, coop.id));

    return {
      ...coop,
      licence: licence ?? null,
      joursRestants,
      nbMembres: Number(nbMembres?.count ?? 0),
    };
  }));

  return result;
}

// ─── Détail coopérative ───────────────────────────────────────────────────────

export async function getCooperativeDetailM15(cooperativeId: number) {
  const [coop] = await db
    .select()
    .from(cooperativesTable)
    .where(eq(cooperativesTable.id, cooperativeId))
    .limit(1);

  if (!coop) return null;

  const licences = await db
    .select({
      id: licencesTable.id,
      cleLicence: licencesTable.cleLicence,
      statut: licencesTable.statut,
      dateActivation: licencesTable.dateActivation,
      dateExpiration: licencesTable.dateExpiration,
      dureeAns: licencesTable.dureeAns,
      renouvellementAuto: licencesTable.renouvellementAuto,
      nbRenouvellements: licencesTable.nbRenouvellements,
      montantPayeFcfa: licencesTable.montantPayeFcfa,
      planNom: plansAbonnementTable.nom,
    })
    .from(licencesTable)
    .leftJoin(plansAbonnementTable, eq(licencesTable.planId, plansAbonnementTable.id))
    .where(eq(licencesTable.cooperativeId, cooperativeId))
    .orderBy(desc(licencesTable.createdAt));

  const historique = await db
    .select({
      id: historiqueLicencesTable.id,
      action: historiqueLicencesTable.action,
      ancienStatut: historiqueLicencesTable.ancienStatut,
      nouveauStatut: historiqueLicencesTable.nouveauStatut,
      details: historiqueLicencesTable.details,
      createdAt: historiqueLicencesTable.createdAt,
      effectuePar: m15UsersTable.nom,
    })
    .from(historiqueLicencesTable)
    .leftJoin(m15UsersTable, eq(historiqueLicencesTable.effectuePar, m15UsersTable.id))
    .where(eq(historiqueLicencesTable.cooperativeId, cooperativeId))
    .orderBy(desc(historiqueLicencesTable.createdAt))
    .limit(50);

  const [nbMembres] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(membresTable)
    .where(eq(membresTable.cooperativeId, cooperativeId));

  const [nbUsers] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(usersTable)
    .where(eq(usersTable.cooperativeId, cooperativeId));

  const licenceCourante = licences[0] ?? null;
  const joursRestants = licenceCourante?.dateExpiration
    ? Math.floor((new Date(licenceCourante.dateExpiration).getTime() - new Date().getTime()) / (24 * 3600 * 1000))
    : null;

  return {
    cooperative: coop,
    licenceCourante,
    joursRestants,
    historique,
    stats: {
      nbMembres: Number(nbMembres?.count ?? 0),
      nbUsers: Number(nbUsers?.count ?? 0),
    },
  };
}

// ─── Créer coopérative ────────────────────────────────────────────────────────

export async function creerCooperativeM15(data: {
  nom: string;
  ville: string;
  region: string;
  telephone?: string;
  planId: number;
  dureeAns: number;
  renouvellementAuto?: boolean;
  trialActif?: boolean;
  dureeTrialJours?: number;
  montantPaye?: number;
  modePaiement?: string;
  referencePaiement?: string;
  notesInternes?: string;
  pcaNom: string;
  pcaPrenoms: string;
  pcaTelephone: string;
  pcaEmail?: string;
}, m15UserId: number) {
  const [plan] = await db
    .select()
    .from(plansAbonnementTable)
    .where(eq(plansAbonnementTable.id, data.planId))
    .limit(1);

  if (!plan) throw new Error("Plan introuvable");

  const [coop] = await db
    .insert(cooperativesTable)
    .values({ nom: data.nom, ville: data.ville, region: data.region })
    .returning();

  if (!coop) throw new Error("Erreur création coopérative");

  const motDePasse = `Coop${Math.random().toString(36).slice(2, 8).toUpperCase()}!`;
  const hash = await bcrypt.hash(motDePasse, 10);

  await db.insert(usersTable).values({
    cooperativeId: coop.id,
    nom: data.pcaNom,
    prenoms: data.pcaPrenoms,
    email: data.pcaEmail ?? `pca.${coop.id}@${data.nom.toLowerCase().replace(/\s+/g, "")}.ci`,
    telephone: data.pcaTelephone,
    passwordHash: hash,
    role: "pca",
    actif: true,
  });

  const cleLicence = await genererCleLicence();

  const today = new Date();
  let statut = "inactive";
  let dateActivation: string | undefined;
  let dateExpiration: string | undefined;
  let dateFinTrial: string | undefined;

  if (data.trialActif) {
    statut = "trial";
    const finTrial = new Date(today);
    finTrial.setDate(finTrial.getDate() + (data.dureeTrialJours ?? 30));
    dateFinTrial = finTrial.toISOString().slice(0, 10);
  } else if (data.montantPaye) {
    statut = "active";
    dateActivation = today.toISOString().slice(0, 10);
    const exp = new Date(today);
    exp.setDate(exp.getDate() + data.dureeAns * 365);
    dateExpiration = exp.toISOString().slice(0, 10);
  }

  const [licence] = await db.insert(licencesTable).values({
    cooperativeId: coop.id,
    planId: data.planId,
    cleLicence,
    dureeAns: data.dureeAns,
    statut,
    dateActivation: dateActivation ?? null,
    dateExpiration: dateExpiration ?? null,
    trialActif: data.trialActif ?? false,
    dureeTrialJours: data.dureeTrialJours ?? 30,
    dateFinTrial: dateFinTrial ?? null,
    renouvellementAuto: data.renouvellementAuto ?? false,
    montantPayeFcfa: data.montantPaye ? String(data.montantPaye) : null,
    modePaiement: data.modePaiement ?? null,
    referencePaiement: data.referencePaiement ?? null,
    notesInternes: data.notesInternes ?? null,
    creePar: m15UserId,
  }).returning();

  if (!licence) throw new Error("Erreur création licence");

  await db.insert(historiqueLicencesTable).values({
    licenceId: licence.id,
    cooperativeId: coop.id,
    action: statut === "active" ? "activation" : "creation",
    ancienStatut: null,
    nouveauStatut: statut,
    details: { planNom: plan.nom, dureeAns: data.dureeAns, cleLicence },
    effectuePar: m15UserId,
  });

  if (data.pcaTelephone) {
    await sendSMS(
      data.pcaTelephone,
      `Bienvenue sur CoopDigital ! ${data.nom}\nVotre clé de licence : ${cleLicence}\nEmail : ${data.pcaEmail ?? ""}\nMot de passe provisoire : ${motDePasse}\nM15 Tech — 0714174082`
    );
  }

  return {
    cooperative: coop,
    licence,
    cleLicence,
    dateExpiration: dateExpiration ?? null,
  };
}

// ─── Initialisation des CRONs ─────────────────────────────────────────────────

export function initLicenceCrons() {
  cron.schedule("0 9 * * *", async () => {
    logger.info("CRON checkExpirations démarré");
    try {
      await checkExpirations();
    } catch (err) {
      logger.error({ err }, "Erreur CRON checkExpirations");
    }
  }, { timezone: "Africa/Abidjan" });

  logger.info("Crons licences initialisés");
}
