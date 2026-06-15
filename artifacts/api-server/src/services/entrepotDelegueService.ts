import { db } from "@workspace/db";
import {
  entrepotsDeleguesTable,
  entrepotsMouvementsTable,
  transfertsStockTable,
  usersTable,
  campagnesTable,
  entrepotsTable,
  mouvementsStockTable,
} from "@workspace/db";
import { and, eq, desc, sql, count, sum } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { creerNotification, notifierParRole } from "./notificationService.js";

function toNum(v: unknown): number {
  return Number(v ?? 0);
}

// ─── Numéro de transfert auto ───────────────────────────────────────────────

async function genererNumeroTransfert(cooperativeId: number): Promise<string> {
  const annee = new Date().getFullYear();
  const [row] = await db
    .select({ nb: count() })
    .from(transfertsStockTable)
    .where(eq(transfertsStockTable.cooperativeId, cooperativeId));
  const seq = (Number(row?.nb ?? 0) + 1).toString().padStart(4, "0");
  return `TRF-${annee}-${seq}`;
}

// ─── Entrepôts ───────────────────────────────────────────────────────────────

export async function listEntrepots(cooperativeId: number) {
  const rows = await db
    .select({
      id:            entrepotsDeleguesTable.id,
      nom:           entrepotsDeleguesTable.nom,
      zoneNom:       entrepotsDeleguesTable.zoneNom,
      zoneType:      entrepotsDeleguesTable.zoneType,
      capaciteMaxKg: entrepotsDeleguesTable.capaciteMaxKg,
      seuilAlerteKg: entrepotsDeleguesTable.seuilAlerteKg,
      stockActuelKg: entrepotsDeleguesTable.stockActuelKg,
      stockMisAJourLe: entrepotsDeleguesTable.stockMisAJourLe,
      adresse:       entrepotsDeleguesTable.adresse,
      gpsLat:        entrepotsDeleguesTable.gpsLat,
      gpsLng:        entrepotsDeleguesTable.gpsLng,
      actif:         entrepotsDeleguesTable.actif,
      createdAt:     entrepotsDeleguesTable.createdAt,
      delegueId:     entrepotsDeleguesTable.delegueId,
      delegueNom:    usersTable.nom,
      deleguePrenoms: usersTable.prenoms,
      capaciteSacs:  entrepotsDeleguesTable.capaciteSacs,
      nombreSacsTotal: sql<number>`(
        SELECT COALESCE(SUM(l.nombre_sacs), 0)::integer
        FROM entrepot_mouvements em
        JOIN livraisons l ON l.id = em.livraison_id
        WHERE em.entrepot_id = entrepots_delegues.id
          AND em.type_mouvement = 'entree'
          AND em.livraison_id IS NOT NULL
      )`,
    })
    .from(entrepotsDeleguesTable)
    .leftJoin(usersTable, eq(usersTable.id, entrepotsDeleguesTable.delegueId))
    .where(eq(entrepotsDeleguesTable.cooperativeId, cooperativeId))
    .orderBy(entrepotsDeleguesTable.nom);

  return rows;
}

export async function listDeleguesCooperative(cooperativeId: number) {
  return db
    .select({
      id:       usersTable.id,
      nom:      usersTable.nom,
      prenoms:  usersTable.prenoms,
      telephone: usersTable.telephone,
      zoneNom: usersTable.zoneNom,
    })
    .from(usersTable)
    .where(
      and(
        eq(usersTable.cooperativeId, cooperativeId),
        eq(usersTable.role, "delegue"),
        eq(usersTable.actif, true),
      ),
    )
    .orderBy(usersTable.nom);
}

export async function getEntrepotDuDelegue(delegueId: number, cooperativeId: number) {
  const [row] = await db
    .select()
    .from(entrepotsDeleguesTable)
    .where(
      and(
        eq(entrepotsDeleguesTable.delegueId, delegueId),
        eq(entrepotsDeleguesTable.cooperativeId, cooperativeId),
        eq(entrepotsDeleguesTable.actif, true),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function creerEntrepot(
  cooperativeId: number,
  data: {
    delegueId: number;
    nom: string;
    zoneNom?: string;
    zoneType?: string;
    capaciteMaxKg?: number;
    seuilAlerteKg?: number;
    capaciteSacs?: number;
    adresse?: string;
    gpsLat?: number;
    gpsLng?: number;
  },
) {
  const [created] = await db
    .insert(entrepotsDeleguesTable)
    .values({
      delegueId: data.delegueId,
      nom: data.nom,
      cooperativeId,
      stockActuelKg: "0",
      actif: true,
      zoneNom: data.zoneNom ?? undefined,
      zoneType: data.zoneType ?? undefined,
      capaciteMaxKg: data.capaciteMaxKg != null ? String(data.capaciteMaxKg) : undefined,
      seuilAlerteKg: data.seuilAlerteKg != null ? String(data.seuilAlerteKg) : undefined,
      ...(data.capaciteSacs != null ? { capaciteSacs: data.capaciteSacs } : {}),
      adresse: data.adresse ?? undefined,
      gpsLat: data.gpsLat != null ? String(data.gpsLat) : undefined,
      gpsLng: data.gpsLng != null ? String(data.gpsLng) : undefined,
    })
    .returning();
  return created!;
}

export async function modifierEntrepot(
  entrepotId: number,
  cooperativeId: number,
  data: Partial<{
    nom: string;
    zoneNom: string;
    zoneType: string;
    capaciteMaxKg: number;
    seuilAlerteKg: number;
    capaciteSacs: number;
    adresse: string;
    gpsLat: number;
    gpsLng: number;
    actif: boolean;
  }>,
) {
  type EntrepotUpdate = typeof entrepotsDeleguesTable.$inferInsert;
  const payload: Partial<EntrepotUpdate> & { updatedAt: Date } = { updatedAt: new Date() };
  if (data.nom !== undefined) payload.nom = data.nom;
  if (data.zoneNom !== undefined) payload.zoneNom = data.zoneNom;
  if (data.zoneType !== undefined) payload.zoneType = data.zoneType;
  if (data.capaciteMaxKg !== undefined) payload.capaciteMaxKg = String(data.capaciteMaxKg);
  if (data.seuilAlerteKg !== undefined) payload.seuilAlerteKg = String(data.seuilAlerteKg);
  if (data.capaciteSacs !== undefined) payload.capaciteSacs = data.capaciteSacs;
  if (data.adresse !== undefined) payload.adresse = data.adresse;
  if (data.gpsLat !== undefined) payload.gpsLat = String(data.gpsLat);
  if (data.gpsLng !== undefined) payload.gpsLng = String(data.gpsLng);
  if (data.actif !== undefined) payload.actif = data.actif;

  const [updated] = await db
    .update(entrepotsDeleguesTable)
    .set(payload)
    .where(
      and(
        eq(entrepotsDeleguesTable.id, entrepotId),
        eq(entrepotsDeleguesTable.cooperativeId, cooperativeId),
      ),
    )
    .returning();
  return updated;
}

// ─── Ajustement manuel ───────────────────────────────────────────────────────

export async function ajusterStock(
  entrepotId: number,
  cooperativeId: number,
  par: number,
  opts: {
    type: "entree" | "sortie";
    motif: "ajustement" | "perte";
    poidsKg: number;
    notes?: string;
  },
) {
  const [entrepot] = await db
    .select({ id: entrepotsDeleguesTable.id })
    .from(entrepotsDeleguesTable)
    .where(
      and(
        eq(entrepotsDeleguesTable.id, entrepotId),
        eq(entrepotsDeleguesTable.cooperativeId, cooperativeId),
      ),
    )
    .limit(1);
  if (!entrepot) throw new Error("Entrepôt non trouvé");
  return enregistrerMouvement(entrepotId, opts.type, opts.motif, opts.poidsKg, par, {
    notes: opts.notes,
  });
}

// ─── Mouvements ──────────────────────────────────────────────────────────────

export async function getMouvements(
  entrepotId: number,
  cooperativeId: number,
  opts: { limit?: number; offset?: number } = {},
) {
  const entrepot = await db
    .select({ id: entrepotsDeleguesTable.id })
    .from(entrepotsDeleguesTable)
    .where(
      and(
        eq(entrepotsDeleguesTable.id, entrepotId),
        eq(entrepotsDeleguesTable.cooperativeId, cooperativeId),
      ),
    )
    .limit(1);
  if (!entrepot.length) throw new Error("Entrepôt non trouvé");

  return db
    .select({
      id:             entrepotsMouvementsTable.id,
      typeMouvement:  entrepotsMouvementsTable.typeMouvement,
      motif:          entrepotsMouvementsTable.motif,
      poidsKg:        entrepotsMouvementsTable.poidsKg,
      stockAvantKg:   entrepotsMouvementsTable.stockAvantKg,
      stockApresKg:   entrepotsMouvementsTable.stockApresKg,
      livraisonId:    entrepotsMouvementsTable.livraisonId,
      transfertId:    entrepotsMouvementsTable.transfertId,
      dateMouvement:  entrepotsMouvementsTable.dateMouvement,
      notes:          entrepotsMouvementsTable.notes,
      enregistreParNom: usersTable.nom,
    })
    .from(entrepotsMouvementsTable)
    .leftJoin(usersTable, eq(usersTable.id, entrepotsMouvementsTable.enregistrePar))
    .where(eq(entrepotsMouvementsTable.entrepotId, entrepotId))
    .orderBy(desc(entrepotsMouvementsTable.dateMouvement))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);
}

export async function getMouvementsDelegue(
  delegueId: number,
  cooperativeId: number,
  opts: { limit?: number; offset?: number } = {},
) {
  const entrepot = await getEntrepotDuDelegue(delegueId, cooperativeId);
  if (!entrepot) return [];
  return getMouvements(entrepot.id, cooperativeId, opts);
}

async function enregistrerMouvement(
  entrepotId: number,
  type: "entree" | "sortie",
  motif: "livraison_membre" | "transfert_central" | "ajustement" | "perte",
  poidsKg: number,
  par: number,
  extra: { livraisonId?: number; transfertId?: number; notes?: string } = {},
) {
  const [entrepot] = await db
    .select({ stockActuelKg: entrepotsDeleguesTable.stockActuelKg })
    .from(entrepotsDeleguesTable)
    .where(eq(entrepotsDeleguesTable.id, entrepotId))
    .limit(1);
  if (!entrepot) throw new Error("Entrepôt introuvable");

  const avant = toNum(entrepot.stockActuelKg);
  const apres = type === "entree" ? avant + poidsKg : avant - poidsKg;
  if (apres < 0) throw new Error("Stock insuffisant dans l'entrepôt");

  await db
    .update(entrepotsDeleguesTable)
    .set({ stockActuelKg: String(apres), stockMisAJourLe: new Date(), updatedAt: new Date() })
    .where(eq(entrepotsDeleguesTable.id, entrepotId));

  const [mouv] = await db
    .insert(entrepotsMouvementsTable)
    .values({
      entrepotId,
      typeMouvement: type,
      motif,
      poidsKg: String(poidsKg),
      stockAvantKg: String(avant),
      stockApresKg: String(apres),
      enregistrePar: par,
      livraisonId: extra.livraisonId ?? null,
      transfertId: extra.transfertId ?? null,
      notes: extra.notes,
    })
    .returning();

  return { mouvement: mouv!, stockApres: apres };
}

// ─── Alertes stock ───────────────────────────────────────────────────────────

async function verifierAlerteStock(entrepotId: number, cooperativeId: number) {
  const [e] = await db
    .select()
    .from(entrepotsDeleguesTable)
    .where(eq(entrepotsDeleguesTable.id, entrepotId))
    .limit(1);
  if (!e) return;
  const stock = toNum(e.stockActuelKg);
  const seuil = toNum(e.seuilAlerteKg);
  const capacite = toNum(e.capaciteMaxKg);
  if (!seuil || stock <= seuil) return;

  const pct = capacite > 0 ? Math.round((stock / capacite) * 100) : 0;
  const poidsStr = `${stock.toLocaleString("fr-FR")} kg`;

  await creerNotification(cooperativeId, {
    type: "stock_faible",
    titre: `⚠️ Entrepôt ${e.nom} à ${pct}% de capacité`,
    message: `Stock actuel : ${poidsStr}. Un transfert vers le magasin central est recommandé.`,
    lien: "/entrepots",
    lienLibelle: "Voir les entrepôts",
    gravite: "attention",
    sourceModule: "entrepots",
    sourceId: entrepotId,
  }, e.delegueId);

  await notifierParRole(cooperativeId, ["directeur", "pca"], {
    type: "stock_faible",
    titre: `⚠️ Entrepôt ${e.nom} (${e.zoneNom ?? "zone inconnue"}) à ${pct}%`,
    message: `Stock : ${poidsStr} / capacité : ${toNum(e.capaciteMaxKg).toLocaleString("fr-FR")} kg`,
    lien: "/entrepots",
    lienLibelle: "Voir les entrepôts",
    gravite: "attention",
    sourceModule: "entrepots",
    sourceId: entrepotId,
  });
}

// ─── Transferts ──────────────────────────────────────────────────────────────

export async function listTransferts(
  cooperativeId: number,
  opts: { statut?: string; limit?: number; offset?: number } = {},
) {
  const rows = await db
    .select({
      id:               transfertsStockTable.id,
      numeroTransfert:  transfertsStockTable.numeroTransfert,
      statut:           transfertsStockTable.statut,
      poidsDepart_kg:   transfertsStockTable.poidsDepart_kg,
      poidsArrivee_kg:  transfertsStockTable.poidsArrivee_kg,
      ecartKg:          transfertsStockTable.ecartKg,
      motifEcart:       transfertsStockTable.motifEcart,
      dateDepart:       transfertsStockTable.dateDepart,
      dateArrivee:      transfertsStockTable.dateArrivee,
      datePrevue:       transfertsStockTable.datePrevue,
      typeVehicule:     transfertsStockTable.typeVehicule,
      immatriculation:  transfertsStockTable.immatriculation,
      nomChauffeur:     transfertsStockTable.nomChauffeur,
      telephoneChauffeur: transfertsStockTable.telephoneChauffeur,
      notes:            transfertsStockTable.notes,
      createdAt:        transfertsStockTable.createdAt,
      entrepotId:       entrepotsDeleguesTable.id,
      entrepotNom:      entrepotsDeleguesTable.nom,
      zoneNom:          entrepotsDeleguesTable.zoneNom,
      delegueId:        usersTable.id,
      delegueNom:       usersTable.nom,
      deleguePrenoms:   usersTable.prenoms,
    })
    .from(transfertsStockTable)
    .leftJoin(entrepotsDeleguesTable, eq(entrepotsDeleguesTable.id, transfertsStockTable.entrepotSourceId))
    .leftJoin(usersTable, eq(usersTable.id, transfertsStockTable.delegueId))
    .where(eq(transfertsStockTable.cooperativeId, cooperativeId))
    .orderBy(desc(transfertsStockTable.createdAt))
    .limit(opts.limit ?? 50)
    .offset(opts.offset ?? 0);

  return rows;
}

export async function listTransfertsDelegue(
  delegueId: number,
  cooperativeId: number,
) {
  return db
    .select()
    .from(transfertsStockTable)
    .where(
      and(
        eq(transfertsStockTable.delegueId, delegueId),
        eq(transfertsStockTable.cooperativeId, cooperativeId),
      ),
    )
    .orderBy(desc(transfertsStockTable.createdAt));
}

export async function creerTransfert(
  delegueId: number,
  cooperativeId: number,
  data: {
    entrepotId: number;
    poidsKg: number;
    typeVehicule?: string;
    immatriculation?: string;
    nomChauffeur?: string;
    telephoneChauffeur?: string;
    transporteur?: string;
    datePrevue?: Date;
    campagneId?: number;
    notes?: string;
  },
) {
  const entrepot = await getEntrepotDuDelegue(delegueId, cooperativeId);
  if (!entrepot) throw new Error("Aucun entrepôt trouvé pour ce délégué");
  if (entrepot.id !== data.entrepotId) throw new Error("Cet entrepôt ne vous appartient pas");

  const stock = toNum(entrepot.stockActuelKg);
  if (stock < data.poidsKg) {
    throw new Error(`Stock insuffisant — disponible : ${stock.toLocaleString("fr-FR")} kg`);
  }

  const numero = await genererNumeroTransfert(cooperativeId);

  const [transfert] = await db
    .insert(transfertsStockTable)
    .values({
      numeroTransfert: numero,
      entrepotSourceId: data.entrepotId,
      delegueId,
      cooperativeId,
      campagneId: data.campagneId ?? null,
      poidsDepart_kg: String(data.poidsKg),
      typeVehicule: data.typeVehicule ?? null,
      immatriculation: data.immatriculation ?? null,
      nomChauffeur: data.nomChauffeur ?? null,
      telephoneChauffeur: data.telephoneChauffeur ?? null,
      transporteur: data.transporteur ?? null,
      datePrevue: data.datePrevue ?? null,
      notes: data.notes ?? null,
      statut: "planifie",
    })
    .returning();

  const [delegue] = await db
    .select({ nom: usersTable.nom, prenoms: usersTable.prenoms })
    .from(usersTable)
    .where(eq(usersTable.id, delegueId))
    .limit(1);
  const nomDelegue = `${delegue?.nom ?? ""} ${delegue?.prenoms ?? ""}`.trim();

  await notifierParRole(cooperativeId, ["directeur", "pca"], {
    type: "transfert_planifie",
    titre: `📦 Transfert planifié — ${numero}`,
    message: `${nomDelegue} a planifié un transfert de ${data.poidsKg.toLocaleString("fr-FR")} kg depuis ${entrepot.nom}.`,
    lien: "/entrepots",
    lienLibelle: "Voir les transferts",
    gravite: "info",
    sourceModule: "entrepots",
    sourceId: transfert!.id,
  });

  logger.info({ transfertId: transfert!.id, numero, delegueId, poidsKg: data.poidsKg }, "Transfert planifié");
  return transfert!;
}

export async function confirmerDepart(
  transfertId: number,
  cooperativeId: number,
  delegueId: number,
  data: { poidsDepart_kg: number; immatriculation?: string; nomChauffeur?: string },
) {
  const [t] = await db
    .select()
    .from(transfertsStockTable)
    .where(
      and(
        eq(transfertsStockTable.id, transfertId),
        eq(transfertsStockTable.cooperativeId, cooperativeId),
        eq(transfertsStockTable.delegueId, delegueId),
      ),
    )
    .limit(1);
  if (!t) throw new Error("Transfert introuvable");
  if (t.statut !== "planifie") throw new Error("Ce transfert n'est pas en statut planifié");

  const { mouvement } = await enregistrerMouvement(
    t.entrepotSourceId,
    "sortie",
    "transfert_central",
    data.poidsDepart_kg,
    delegueId,
    { transfertId, notes: `Départ transfert ${t.numeroTransfert}` },
  );

  const [updated] = await db
    .update(transfertsStockTable)
    .set({
      statut: "en_cours",
      poidsDepart_kg: String(data.poidsDepart_kg),
      dateDepart: new Date(),
      immatriculation: data.immatriculation ?? t.immatriculation,
      nomChauffeur: data.nomChauffeur ?? t.nomChauffeur,
      updatedAt: new Date(),
    })
    .where(eq(transfertsStockTable.id, transfertId))
    .returning();

  logger.info({ transfertId, mouvId: mouvement.id }, "Départ transfert confirmé");
  return updated!;
}

export async function confirmerArrivee(
  transfertId: number,
  cooperativeId: number,
  confirmeParId: number,
  data: { poidsArrivee_kg: number; motifEcart?: string; notes?: string },
) {
  const [t] = await db
    .select()
    .from(transfertsStockTable)
    .where(
      and(
        eq(transfertsStockTable.id, transfertId),
        eq(transfertsStockTable.cooperativeId, cooperativeId),
      ),
    )
    .limit(1);
  if (!t) throw new Error("Transfert introuvable");
  if (t.statut !== "en_cours") throw new Error("Ce transfert n'est pas en transit");

  const poidsDepart = toNum(t.poidsDepart_kg);
  const ecartKg = poidsDepart - data.poidsArrivee_kg;
  const pctEcart = poidsDepart > 0 ? Math.abs(ecartKg / poidsDepart) * 100 : 0;
  const estLitige = pctEcart > 0.5;
  const statutFinal = estLitige ? "litige" : "confirme";

  const [updated] = await db
    .update(transfertsStockTable)
    .set({
      statut: statutFinal,
      poidsArrivee_kg: String(data.poidsArrivee_kg),
      ecartKg: String(ecartKg),
      motifEcart: (data.motifEcart as typeof t.motifEcart) ?? null,
      dateArrivee: new Date(),
      confirmePar: confirmeParId,
      confirme_le: new Date(),
      notes: data.notes ?? t.notes,
      updatedAt: new Date(),
    })
    .where(eq(transfertsStockTable.id, transfertId))
    .returning();

  if (estLitige) {
    await notifierParRole(cooperativeId, ["directeur", "pca"], {
      type: "transfert_litige",
      titre: `🔴 Écart transfert ${t.numeroTransfert}`,
      message: `Départ : ${poidsDepart.toLocaleString("fr-FR")} kg — Arrivée : ${data.poidsArrivee_kg.toLocaleString("fr-FR")} kg — Écart : ${Math.abs(ecartKg).toLocaleString("fr-FR")} kg (${pctEcart.toFixed(1)}%)`,
      lien: "/entrepots",
      lienLibelle: "Voir les transferts",
      gravite: "critique",
      sourceModule: "entrepots",
      sourceId: transfertId,
    });
  } else {
    // ── Entrée automatique dans le stock de l'entrepôt central ───────────────
    try {
      const [entrepotCentral] = await db
        .select({ id: entrepotsTable.id })
        .from(entrepotsTable)
        .where(eq(entrepotsTable.cooperativeId, cooperativeId))
        .orderBy(entrepotsTable.id)
        .limit(1);

      if (entrepotCentral) {
        await db.insert(mouvementsStockTable).values({
          entrepotId: entrepotCentral.id,
          type: "entree",
          poidsKg: String(data.poidsArrivee_kg),
          motif: `Transfert ${t.numeroTransfert} — réception depuis entrepôt délégué`,
          agentId: confirmeParId,
        });
        logger.info(
          { transfertId, entrepotCentralId: entrepotCentral.id, poidsArrivee_kg: data.poidsArrivee_kg },
          "Entrée automatique créée dans l'entrepôt central",
        );
      } else {
        logger.warn({ cooperativeId, transfertId }, "Aucun entrepôt central trouvé — entrée stock ignorée");
      }
    } catch (err) {
      logger.error({ err, transfertId }, "Erreur création entrée automatique stock central (non bloquant)");
    }

    await creerNotification(cooperativeId, {
      type: "transfert_confirme",
      titre: `✅ Transfert ${t.numeroTransfert} confirmé`,
      message: `${data.poidsArrivee_kg.toLocaleString("fr-FR")} kg reçus au magasin central.`,
      lien: "/entrepots",
      lienLibelle: "Voir les transferts",
      gravite: "info",
      sourceModule: "entrepots",
      sourceId: transfertId,
    }, t.delegueId);
  }

  logger.info({ transfertId, statutFinal, ecartKg, pctEcart }, "Arrivée transfert confirmée");
  return updated!;
}

export async function signalerLitige(
  transfertId: number,
  cooperativeId: number,
  par: number,
  motifEcart: string,
  notes: string,
) {
  const [updated] = await db
    .update(transfertsStockTable)
    .set({
      statut: "litige",
      motifEcart: motifEcart as typeof transfertsStockTable.$inferSelect.motifEcart,
      notes,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(transfertsStockTable.id, transfertId),
        eq(transfertsStockTable.cooperativeId, cooperativeId),
      ),
    )
    .returning();

  return updated;
}

// ─── Stats consolidées (direction) ──────────────────────────────────────────

export async function getStatsConsolideesDirection(cooperativeId: number) {
  const entrepots = await listEntrepots(cooperativeId);

  const totalEntrepots = entrepots.reduce(
    (acc, e) => acc + toNum(e.stockActuelKg),
    0,
  );

  const [enCours] = await db
    .select({ nb: count() })
    .from(transfertsStockTable)
    .where(
      and(
        eq(transfertsStockTable.cooperativeId, cooperativeId),
        sql`${transfertsStockTable.statut} IN ('planifie','en_cours')`,
      ),
    );

  const alertes = entrepots.filter((e) => {
    const seuil = toNum(e.seuilAlerteKg);
    return seuil > 0 && toNum(e.stockActuelKg) > seuil;
  });

  return {
    entrepots,
    stockTotalEntrepotsKg: totalEntrepots,
    transfertsEnCours: Number(enCours?.nb ?? 0),
    alertesCapacite: alertes.length,
  };
}

// ─── Transfert initié par l'admin (direction) ────────────────────────────────

/**
 * Crée un transfert côté admin et confirme immédiatement le départ
 * en une seule opération atomique.
 * Statut final : "en_cours" (prêt pour confirmation d'arrivée).
 */
export async function creerTransfertAdmin(
  entrepotId: number,
  cooperativeId: number,
  adminId: number,
  data: {
    poidsKg: number;
    typeVehicule?: string;
    immatriculation?: string;
    nomChauffeur?: string;
    telephoneChauffeur?: string;
    transporteur?: string;
    datePrevue?: Date;
    campagneId?: number;
    notes?: string;
  },
) {
  const [entrepot] = await db
    .select()
    .from(entrepotsDeleguesTable)
    .where(
      and(
        eq(entrepotsDeleguesTable.id, entrepotId),
        eq(entrepotsDeleguesTable.cooperativeId, cooperativeId),
        eq(entrepotsDeleguesTable.actif, true),
      ),
    )
    .limit(1);
  if (!entrepot) throw new Error("Entrepôt introuvable ou inactif");

  const stock = toNum(entrepot.stockActuelKg);
  if (stock <= 0) throw new Error("Stock vide — aucun transfert possible");
  if (data.poidsKg > stock) {
    throw new Error(`Stock insuffisant — disponible : ${stock.toLocaleString("fr-FR")} kg`);
  }

  const numero = await genererNumeroTransfert(cooperativeId);

  // 1. Créer le transfert
  const [transfert] = await db
    .insert(transfertsStockTable)
    .values({
      numeroTransfert: numero,
      entrepotSourceId: entrepotId,
      delegueId: entrepot.delegueId,
      cooperativeId,
      campagneId: data.campagneId ?? null,
      poidsDepart_kg: String(data.poidsKg),
      typeVehicule: data.typeVehicule ?? null,
      immatriculation: data.immatriculation ?? null,
      nomChauffeur: data.nomChauffeur ?? null,
      telephoneChauffeur: data.telephoneChauffeur ?? null,
      transporteur: data.transporteur ?? null,
      datePrevue: data.datePrevue ?? null,
      notes: data.notes ?? null,
      statut: "planifie",
    })
    .returning();

  // 2. Confirmer immédiatement le départ (mouvement sortie + statut en_cours)
  const { mouvement } = await enregistrerMouvement(
    entrepotId,
    "sortie",
    "transfert_central",
    data.poidsKg,
    adminId,
    { transfertId: transfert!.id, notes: `Départ transfert ${numero} (admin)` },
  );

  const [updated] = await db
    .update(transfertsStockTable)
    .set({
      statut: "en_cours",
      dateDepart: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(transfertsStockTable.id, transfert!.id))
    .returning();

  await notifierParRole(cooperativeId, ["directeur", "pca"], {
    type: "transfert_planifie",
    titre: `🚛 Transfert en transit — ${numero}`,
    message: `${data.poidsKg.toLocaleString("fr-FR")} kg expédiés depuis ${entrepot.nom} vers le magasin central.`,
    lien: "/entrepots",
    lienLibelle: "Voir les transferts",
    gravite: "info",
    sourceModule: "entrepots",
    sourceId: transfert!.id,
  });

  logger.info({ transfertId: transfert!.id, numero, adminId, entrepotId, poidsKg: data.poidsKg, mouvId: mouvement.id }, "Transfert admin créé + départ confirmé");
  return updated!;
}

// ─── Entrée stock suite à livraison membre ───────────────────────────────────

/**
 * Point d'entrée unique pour les deux chemins de création de livraison
 * (terrain et desktop). Lookup l'entrepôt du délégué ; si inexistant, no-op silencieux.
 * Toujours appeler en fire-and-forget (void) pour ne pas bloquer la transaction principale.
 */
export async function entrerStockSiDelegue(
  agentId: number | null | undefined,
  cooperativeId: number,
  poidsNetKg: number,
  livraisonId: number,
) {
  if (!agentId) return;
  try {
    const entrepot = await getEntrepotDuDelegue(agentId, cooperativeId);
    if (!entrepot) return;
    await entrerStockLivraison(entrepot.id, cooperativeId, poidsNetKg, livraisonId, agentId);
  } catch (err) {
    logger.warn({ err, agentId, livraisonId }, "entrerStockSiDelegue — stock entrepôt non mis à jour (non bloquant)");
  }
}

export async function entrerStockLivraison(
  entrepotId: number,
  cooperativeId: number,
  poidsKg: number,
  livraisonId: number,
  par: number,
) {
  const entrepot = await db
    .select({ id: entrepotsDeleguesTable.id, cooperativeId: entrepotsDeleguesTable.cooperativeId })
    .from(entrepotsDeleguesTable)
    .where(
      and(
        eq(entrepotsDeleguesTable.id, entrepotId),
        eq(entrepotsDeleguesTable.cooperativeId, cooperativeId),
      ),
    )
    .limit(1);
  if (!entrepot.length) throw new Error("Entrepôt non trouvé");

  const { mouvement, stockApres } = await enregistrerMouvement(
    entrepotId,
    "entree",
    "livraison_membre",
    poidsKg,
    par,
    { livraisonId, notes: `Livraison #${livraisonId}` },
  );

  await verifierAlerteStock(entrepotId, cooperativeId);
  return { mouvement, stockApres };
}
