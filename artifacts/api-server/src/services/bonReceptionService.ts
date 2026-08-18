/**
 * Service — Bons de réception membres délégués de localités.
 *
 * Le magasinier crée un bon le jour J quand le membre arrive avec son cacao.
 * Il renseigne le véhicule (flotte coop ou externe) et les frais avancés par
 * la coopérative (carburant, autres charges) qui seront déduits du net membre.
 *
 * Statuts : en_attente_pesee → en_pesee → terminee | annulee
 */

import { db } from "@workspace/db";
import {
  bonsReceptionMembresDeleguesTable,
  membresTable,
  usersTable,
  vehiculesTable,
  chauffeursTable,
} from "@workspace/db";
import { and, eq, inArray, desc } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { notifierParRole } from "./notificationService.js";

function toNum(v: unknown): number { return Number(v ?? 0); }

// ─── Création ─────────────────────────────────────────────────────────────────

export async function creerBonReception(
  cooperativeId: number,
  magasinierId: number,
  data: {
    membreDelegueId: number;
    poidsDeclaraKg?: number | null;
    nombreSacsDeclares?: number | null;
    typeTransport: "cooperatif" | "externe";
    // coopératif
    vehiculeId?: number | null;
    chauffeurId?: number | null;
    // externe
    typeVehicule?: string | null;
    immatriculation?: string | null;
    nomChauffeur?: string | null;
    telephoneChauffeur?: string | null;
    // frais
    fraisCarburantFcfa?: number;
    autresChargesFcfa?: number;
    autresChargesLibelle?: string | null;
    notes?: string | null;
  }
) {
  // Vérifier que le membre appartient à la coop et est bien délégué de localités
  const [membre] = await db
    .select({ id: membresTable.id, nom: membresTable.nom, prenoms: membresTable.prenoms, categorieMembre: membresTable.categorieMembre })
    .from(membresTable)
    .where(and(
      eq(membresTable.id, data.membreDelegueId),
      eq(membresTable.cooperativeId, cooperativeId),
    ))
    .limit(1);

  if (!membre) throw new Error("Membre introuvable dans cette coopérative");
  if (membre.categorieMembre !== "délégué de localités") {
    throw new Error("Ce membre n'est pas catégorisé comme délégué de localités");
  }

  const [bon] = await db
    .insert(bonsReceptionMembresDeleguesTable)
    .values({
      cooperativeId,
      membreDelegueId: data.membreDelegueId,
      magasinierId,
      statut: "en_attente_pesee",
      poidsDeclaraKg: data.poidsDeclaraKg != null ? String(data.poidsDeclaraKg) : null,
      nombreSacsDeclares: data.nombreSacsDeclares ?? null,
      typeTransport: data.typeTransport,
      vehiculeId: data.vehiculeId ?? null,
      chauffeurId: data.chauffeurId ?? null,
      typeVehicule: data.typeVehicule ?? null,
      immatriculation: data.immatriculation ?? null,
      nomChauffeur: data.nomChauffeur ?? null,
      telephoneChauffeur: data.telephoneChauffeur ?? null,
      fraisCarburantFcfa: data.fraisCarburantFcfa ?? 0,
      autresChargesFcfa: data.autresChargesFcfa ?? 0,
      autresChargesLibelle: data.autresChargesLibelle ?? null,
      notes: data.notes ?? null,
    })
    .returning();

  if (!bon) throw new Error("Erreur lors de la création du bon");

  const nomMembre = `${membre.prenoms ?? ""} ${membre.nom}`.trim();

  // Notifier les peseurs centraux
  void notifierParRole(cooperativeId, ["peseur" as never], {
    titre: "Nouveau cacao à peser",
    message: `${nomMembre} (délégué de localités) est arrivé. Bon de réception #${bon.id} créé.`,
    gravite: "info" as never,
    type: "COLLECTE" as never,
  }).catch((err) =>
    logger.warn({ err }, "Erreur notification peseur bon réception")
  );

  logger.info({ bonId: bon.id, membreDelegueId: data.membreDelegueId, cooperativeId }, "Bon de réception créé");
  return bon;
}

// ─── Listing ──────────────────────────────────────────────────────────────────

export async function listerBonsReception(
  cooperativeId: number,
  opts?: { statuts?: string[] }
) {
  const statuts = opts?.statuts ?? ["en_attente_pesee", "en_pesee", "terminee"];

  const rows = await db
    .select({
      bon:           bonsReceptionMembresDeleguesTable,
      membreNom:     membresTable.nom,
      membrePrenoms: membresTable.prenoms,
      membreTel:     membresTable.telephone,
      membreSection: membresTable.section,
      magasinierNom: usersTable.nom,
    })
    .from(bonsReceptionMembresDeleguesTable)
    .leftJoin(membresTable,  eq(membresTable.id,  bonsReceptionMembresDeleguesTable.membreDelegueId))
    .leftJoin(usersTable,    eq(usersTable.id,    bonsReceptionMembresDeleguesTable.magasinierId))
    .where(and(
      eq(bonsReceptionMembresDeleguesTable.cooperativeId, cooperativeId),
      inArray(bonsReceptionMembresDeleguesTable.statut, statuts),
    ))
    .orderBy(desc(bonsReceptionMembresDeleguesTable.createdAt));

  return rows.map(r => ({
    ...r.bon,
    fraisCarburantFcfa: toNum(r.bon.fraisCarburantFcfa),
    autresChargesFcfa:  toNum(r.bon.autresChargesFcfa),
    poidsDeclaraKg:     r.bon.poidsDeclaraKg != null ? toNum(r.bon.poidsDeclaraKg) : null,
    membreNom:          r.membreNom,
    membrePrenoms:      r.membrePrenoms,
    membreTel:          r.membreTel,
    membreSection:      r.membreSection,
    magasinierNom:      r.magasinierNom,
  }));
}

// ─── Détail ───────────────────────────────────────────────────────────────────

export async function getBonReceptionDetail(id: number, cooperativeId: number) {
  const [row] = await db
    .select({
      bon:                bonsReceptionMembresDeleguesTable,
      membreNom:          membresTable.nom,
      membrePrenoms:      membresTable.prenoms,
      membreTel:          membresTable.telephone,
      membreSection:      membresTable.section,
      vehiculeImmat:      vehiculesTable.immatriculation,
      vehiculeMarque:     vehiculesTable.marque,
      vehiculeModele:     vehiculesTable.modele,
      chauffeurNom:       chauffeursTable.nom,
      chauffeurPrenoms:   chauffeursTable.prenoms,
      chauffeurTel:       chauffeursTable.telephone,
    })
    .from(bonsReceptionMembresDeleguesTable)
    .leftJoin(membresTable,    eq(membresTable.id,    bonsReceptionMembresDeleguesTable.membreDelegueId))
    .leftJoin(vehiculesTable,  eq(vehiculesTable.id,  bonsReceptionMembresDeleguesTable.vehiculeId))
    .leftJoin(chauffeursTable, eq(chauffeursTable.id, bonsReceptionMembresDeleguesTable.chauffeurId))
    .where(and(
      eq(bonsReceptionMembresDeleguesTable.id, id),
      eq(bonsReceptionMembresDeleguesTable.cooperativeId, cooperativeId),
    ))
    .limit(1);

  if (!row) return null;

  return {
    ...row.bon,
    fraisCarburantFcfa: toNum(row.bon.fraisCarburantFcfa),
    autresChargesFcfa:  toNum(row.bon.autresChargesFcfa),
    poidsDeclaraKg:     row.bon.poidsDeclaraKg != null ? toNum(row.bon.poidsDeclaraKg) : null,
    membreNom:          row.membreNom,
    membrePrenoms:      row.membrePrenoms,
    membreTel:          row.membreTel,
    membreSection:      row.membreSection,
    // Véhicule coop (si typeTransport === "cooperatif")
    vehiculeImmat:      row.vehiculeImmat,
    vehiculeMarque:     row.vehiculeMarque,
    vehiculeModele:     row.vehiculeModele,
    chauffeurNom:       row.chauffeurNom,
    chauffeurPrenoms:   row.chauffeurPrenoms,
    chauffeurTel:       row.chauffeurTel,
  };
}

// ─── Annulation ───────────────────────────────────────────────────────────────

export async function annulerBonReception(id: number, cooperativeId: number) {
  const [bon] = await db
    .select({ statut: bonsReceptionMembresDeleguesTable.statut })
    .from(bonsReceptionMembresDeleguesTable)
    .where(and(
      eq(bonsReceptionMembresDeleguesTable.id, id),
      eq(bonsReceptionMembresDeleguesTable.cooperativeId, cooperativeId),
    ))
    .limit(1);

  if (!bon) throw new Error("Bon introuvable");
  if (bon.statut === "en_pesee") throw new Error("Impossible d'annuler un bon dont la pesée est en cours");
  if (bon.statut === "terminee") throw new Error("Le bon est déjà terminé");

  await db
    .update(bonsReceptionMembresDeleguesTable)
    .set({ statut: "annulee", updatedAt: new Date() })
    .where(eq(bonsReceptionMembresDeleguesTable.id, id));
}

// ─── Liaison session (appelé par peseeSessionService) ─────────────────────────

export async function lierSessionAuBon(bonId: number, sessionId: number) {
  await db
    .update(bonsReceptionMembresDeleguesTable)
    .set({ statut: "en_pesee", sessionPeseeId: sessionId, updatedAt: new Date() })
    .where(eq(bonsReceptionMembresDeleguesTable.id, bonId));
}

export async function terminerBon(bonId: number) {
  await db
    .update(bonsReceptionMembresDeleguesTable)
    .set({ statut: "terminee", updatedAt: new Date() })
    .where(eq(bonsReceptionMembresDeleguesTable.id, bonId));
}
