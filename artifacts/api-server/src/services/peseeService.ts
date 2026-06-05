import {
  db,
  balancesTable,
  configPeseeTable,
  verificationsBalanceTable,
  litigesPeseeTable,
  livraisonsTable,
  usersTable,
  membresTable,
} from "@workspace/db";
import { eq, and, lte, isNotNull, desc, avg, count, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const COOP_ID = 1;
const TAUX_HUMIDITE_STANDARD = 8; // 8 % d'humidité tolérée

// ─── Config pesée ─────────────────────────────────────────────────────────────

export async function getConfig(cooperativeId: number) {
  const [row] = await db
    .select()
    .from(configPeseeTable)
    .where(eq(configPeseeTable.cooperativeId, cooperativeId))
    .limit(1);
  // Valeurs par défaut si pas encore configuré
  return row ?? {
    id: null,
    cooperativeId,
    ecartMaxAutorisePct: "2",
    seuilDoublePeseeKg: "500",
    toleranceBalanceG: "500",
    frequenceVerificationJours: 90,
    updatedAt: new Date(),
  };
}

export async function upsertConfig(
  cooperativeId: number,
  data: { ecart_max_autorise_pct?: number; seuil_double_pesee_kg?: number; tolerance_balance_g?: number; frequence_verification_jours?: number },
) {
  const existing = await getConfig(cooperativeId);
  if (existing.id) {
    const [row] = await db
      .update(configPeseeTable)
      .set({
        ...(data.ecart_max_autorise_pct != null && { ecartMaxAutorisePct: String(data.ecart_max_autorise_pct) }),
        ...(data.seuil_double_pesee_kg != null && { seuilDoublePeseeKg: String(data.seuil_double_pesee_kg) }),
        ...(data.tolerance_balance_g != null && { toleranceBalanceG: String(data.tolerance_balance_g) }),
        ...(data.frequence_verification_jours != null && { frequenceVerificationJours: data.frequence_verification_jours }),
        updatedAt: new Date(),
      })
      .where(eq(configPeseeTable.cooperativeId, cooperativeId))
      .returning();
    return row;
  } else {
    const [row] = await db
      .insert(configPeseeTable)
      .values({
        cooperativeId,
        ecartMaxAutorisePct: data.ecart_max_autorise_pct != null ? String(data.ecart_max_autorise_pct) : "2",
        seuilDoublePeseeKg: data.seuil_double_pesee_kg != null ? String(data.seuil_double_pesee_kg) : "500",
        toleranceBalanceG: data.tolerance_balance_g != null ? String(data.tolerance_balance_g) : "500",
        frequenceVerificationJours: data.frequence_verification_jours ?? 90,
      })
      .returning();
    return row;
  }
}

// ─── Balances ─────────────────────────────────────────────────────────────────

export async function getBalances(cooperativeId: number) {
  return db
    .select()
    .from(balancesTable)
    .where(eq(balancesTable.cooperativeId, cooperativeId))
    .orderBy(balancesTable.site, balancesTable.marque);
}

export async function createBalance(
  cooperativeId: number,
  data: Omit<typeof balancesTable.$inferInsert, "id" | "cooperativeId" | "createdAt" | "updatedAt">,
) {
  const [row] = await db
    .insert(balancesTable)
    .values({ cooperativeId, ...data })
    .returning();
  return row;
}

export async function updateBalance(
  cooperativeId: number,
  id: number,
  data: Partial<typeof balancesTable.$inferInsert>,
) {
  const [row] = await db
    .update(balancesTable)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(balancesTable.id, id), eq(balancesTable.cooperativeId, cooperativeId)))
    .returning();
  return row ?? null;
}

export async function getBalancesAlertes(cooperativeId: number) {
  const today = new Date().toISOString().split("T")[0]!;
  return db
    .select()
    .from(balancesTable)
    .where(
      and(
        eq(balancesTable.cooperativeId, cooperativeId),
        lte(balancesTable.dateProchainVerification, today),
        isNotNull(balancesTable.dateProchainVerification),
      ),
    );
}

// ─── Vérifications balance ────────────────────────────────────────────────────

export async function getVerificationsBalance(balanceId: number) {
  return db
    .select()
    .from(verificationsBalanceTable)
    .where(eq(verificationsBalanceTable.balanceId, balanceId))
    .orderBy(desc(verificationsBalanceTable.dateVerification));
}

export async function createVerification(
  balanceId: number,
  data: {
    date_verification: string;
    verificateur?: string;
    resultat: string;
    ecart_mesure_g?: number;
    observations?: string;
    prochaine_verification?: string;
  },
) {
  const [verif] = await db
    .insert(verificationsBalanceTable)
    .values({
      balanceId,
      dateVerification: data.date_verification,
      verificateur: data.verificateur,
      resultat: data.resultat,
      ecartMesureG: data.ecart_mesure_g != null ? String(data.ecart_mesure_g) : null,
      observations: data.observations,
      prochaineVerification: data.prochaine_verification,
    })
    .returning();

  // Mettre à jour la balance avec la date de dernière vérif + prochaine
  await db
    .update(balancesTable)
    .set({
      dateDerniereVerification: data.date_verification,
      dateProchainVerification: data.prochaine_verification ?? null,
      updatedAt: new Date(),
    })
    .where(eq(balancesTable.id, balanceId));

  return verif;
}

// ─── Logique de validation pesée ──────────────────────────────────────────────

export type ResultatValidation = {
  doublePeseeRequise: boolean;
  bloquant: boolean;
  motifBlocage?: string;
  ecartKg: number;
  ecartPct: number;
  poidsRetenuKg: number;
  litigeCree: boolean;
  anomalies: Array<{ niveau: "CRITIQUE" | "ATTENTION"; message: string }>;
};

export async function validerPesee(
  cooperativeId: number,
  poids1ereKg: number,
  poids2emeKg: number | null,
  balanceId: number | null,
  config: Awaited<ReturnType<typeof getConfig>>,
): Promise<ResultatValidation> {
  const seuilDouble = Number(config.seuilDoublePeseeKg);
  const ecartMax = Number(config.ecartMaxAutorisePct);
  const anomalies: ResultatValidation["anomalies"] = [];
  let bloquant = false;
  let motifBlocage: string | undefined;
  let litigeCree = false;

  // Règle 1 — Double pesée obligatoire si poids > seuil
  const doublePeseeRequise = poids1ereKg > seuilDouble;
  if (doublePeseeRequise && poids2emeKg == null) {
    bloquant = true;
    motifBlocage = `Double pesée obligatoire pour un poids de ${poids1ereKg} kg (seuil : ${seuilDouble} kg)`;
  }

  // Calcul écart
  const ecartKg = poids2emeKg != null ? Math.abs(poids2emeKg - poids1ereKg) : 0;
  const ecartPct = poids1ereKg > 0 && poids2emeKg != null ? (ecartKg / poids1ereKg) * 100 : 0;

  // Règle 2 — Écart excessif
  if (poids2emeKg != null && ecartPct > ecartMax) {
    anomalies.push({
      niveau: "CRITIQUE",
      message: `Écart de pesée de ${ecartPct.toFixed(2)}% (${ecartKg.toFixed(3)} kg) dépasse le seuil de ${ecartMax}%`,
    });
    litigeCree = true;
  }

  // Règle 3 — Balance non vérifiée
  if (balanceId != null) {
    const [balance] = await db.select().from(balancesTable).where(eq(balancesTable.id, balanceId)).limit(1);
    if (balance?.dateProchainVerification) {
      const today = new Date().toISOString().split("T")[0]!;
      if (balance.dateProchainVerification < today) {
        anomalies.push({
          niveau: "ATTENTION",
          message: `Balance hors délai de vérification (prévu le ${balance.dateProchainVerification})`,
        });
      }
    }
  }

  // Règle 4 — Poids retenu
  const poidsRetenuKg = poids2emeKg != null
    ? (poids1ereKg + poids2emeKg) / 2
    : poids1ereKg;

  return {
    doublePeseeRequise,
    bloquant,
    motifBlocage,
    ecartKg,
    ecartPct,
    poidsRetenuKg,
    litigeCree,
    anomalies,
  };
}

export function calculerHumidite(
  poidsBrutKg: number,
  tauxHumiditePct: number,
): { retenueHumiditeKg: number; poidsSecKg: number } {
  const retenue = poidsBrutKg * Math.max(0, tauxHumiditePct - TAUX_HUMIDITE_STANDARD) / 100;
  return {
    retenueHumiditeKg: Math.round(retenue * 1000) / 1000,
    poidsSecKg: Math.round((poidsBrutKg - retenue) * 1000) / 1000,
  };
}

// ─── Valider double pesée d'une livraison existante ───────────────────────────

export async function validerDoublePeseeLivraison(
  cooperativeId: number,
  livraisonId: number,
  poids2emeKg: number,
  balanceId: number,
  peseurId: number | null,
) {
  const config = await getConfig(cooperativeId);
  const [livraison] = await db
    .select()
    .from(livraisonsTable)
    .where(eq(livraisonsTable.id, livraisonId))
    .limit(1);
  if (!livraison) return null;

  const poids1ere = Number(livraison.poidsBrut1erePeseeKg ?? livraison.poidsKg);
  const ecartKg = Math.abs(poids2emeKg - poids1ere);
  const ecartPct = poids1ere > 0 ? (ecartKg / poids1ere) * 100 : 0;
  const ecartMax = Number(config.ecartMaxAutorisePct);
  const litigeCree = ecartPct > ecartMax;
  const poidsRetenu = (poids1ere + poids2emeKg) / 2;

  const [updated] = await db
    .update(livraisonsTable)
    .set({
      poidsBrut2emePeseeKg: String(poids2emeKg),
      ecartPeseeKg: String(ecartKg),
      ecartPeseePct: String(ecartPct),
      poidsRetenuKg: String(poidsRetenu),
      balanceId,
      peseurId,
      doublePeseeEffectuee: true,
      litigePesee: litigeCree,
    })
    .where(eq(livraisonsTable.id, livraisonId))
    .returning();

  // Créer un litige si écart excessif
  if (litigeCree && livraison.membreId) {
    await db.insert(litigesPeseeTable).values({
      cooperativeId,
      livraisonId,
      membreId: livraison.membreId,
      dateLitige: new Date().toISOString().split("T")[0]!,
      poidsContesteKg: String(poids1ere),
      motif: `Écart de pesée de ${ecartPct.toFixed(2)}% (${ecartKg.toFixed(3)} kg) entre 1ère et 2ème pesée`,
    });
    logger.warn({ livraisonId, ecartPct }, "Litige de pesée créé automatiquement");
  }

  return { livraison: updated, ecart_pct: ecartPct, litige_cree: litigeCree };
}

// ─── Litiges ──────────────────────────────────────────────────────────────────

export async function getLitiges(cooperativeId: number) {
  return db
    .select()
    .from(litigesPeseeTable)
    .where(eq(litigesPeseeTable.cooperativeId, cooperativeId))
    .orderBy(desc(litigesPeseeTable.createdAt));
}

export async function createLitige(
  cooperativeId: number,
  data: {
    livraison_id: number; membre_id?: number; date_litige: string;
    poids_conteste_kg?: number; poids_revendique_membre_kg?: number; motif?: string;
  },
) {
  const [row] = await db
    .insert(litigesPeseeTable)
    .values({
      cooperativeId,
      livraisonId: data.livraison_id,
      membreId: data.membre_id,
      dateLitige: data.date_litige,
      poidsContesteKg: data.poids_conteste_kg != null ? String(data.poids_conteste_kg) : null,
      poidsRevendiqueMembre: data.poids_revendique_membre_kg != null ? String(data.poids_revendique_membre_kg) : null,
      motif: data.motif,
    })
    .returning();
  return row;
}

export async function resoudreLitige(
  cooperativeId: number,
  id: number,
  poidsFinalKg: number,
  decision: string,
  userId: number,
) {
  // Trouver le litige
  const [litige] = await db
    .select()
    .from(litigesPeseeTable)
    .where(and(eq(litigesPeseeTable.id, id), eq(litigesPeseeTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!litige) return null;

  // Mettre à jour le litige
  const [updated] = await db
    .update(litigesPeseeTable)
    .set({
      statut: "resolu",
      poidsFinalRetenuKg: String(poidsFinalKg),
      decision,
      resoluPar: userId,
      resoluLe: new Date(),
    })
    .where(eq(litigesPeseeTable.id, id))
    .returning();

  // Mettre à jour la livraison avec le poids final retenu
  await db
    .update(livraisonsTable)
    .set({ poidsRetenuKg: String(poidsFinalKg) })
    .where(eq(livraisonsTable.id, litige.livraisonId));

  return updated;
}

// ─── Statistiques ─────────────────────────────────────────────────────────────

export async function getStatistiques(cooperativeId: number) {
  const [stats] = await db
    .select({
      nb_pesees_total:  count(livraisonsTable.id),
      nb_double_pesees: count(sql`CASE WHEN ${livraisonsTable.doublePeseeEffectuee} THEN 1 END`),
      ecart_moyen_pct:  avg(livraisonsTable.ecartPeseePct),
      nb_litiges:       count(sql`CASE WHEN ${livraisonsTable.litigePesee} THEN 1 END`),
    })
    .from(livraisonsTable)
    .where(
      and(
        isNotNull(livraisonsTable.poidsBrut1erePeseeKg),
        // livraisons appartenant à cette coopérative (via agent_id ou coopérative)
      ),
    );

  const [statsLitiges] = await db
    .select({ nb_resolus: count(litigesPeseeTable.id) })
    .from(litigesPeseeTable)
    .where(and(eq(litigesPeseeTable.cooperativeId, cooperativeId), eq(litigesPeseeTable.statut, "resolu")));

  const agentEcarts = await db
    .select({
      agent_id:       livraisonsTable.agentId,
      ecart_moyen:    avg(livraisonsTable.ecartPeseePct),
      nb_anomalies:   count(sql`CASE WHEN ${livraisonsTable.litigePesee} THEN 1 END`),
    })
    .from(livraisonsTable)
    .where(isNotNull(livraisonsTable.ecartPeseePct))
    .groupBy(livraisonsTable.agentId)
    .orderBy(sql`avg(${livraisonsTable.ecartPeseePct}) DESC`)
    .limit(1);

  return {
    nb_pesees_total:    Number(stats?.nb_pesees_total ?? 0),
    nb_double_pesees:   Number(stats?.nb_double_pesees ?? 0),
    ecart_moyen_pct:    Number(stats?.ecart_moyen_pct ?? 0),
    nb_litiges:         Number(stats?.nb_litiges ?? 0),
    nb_litiges_resolus: Number(statsLitiges?.nb_resolus ?? 0),
    agent_plus_ecarts:  agentEcarts[0] ?? null,
    balance_plus_ecarts: null,
  };
}

export async function getRapportAgent(agentId: number) {
  const [agent] = await db.select().from(usersTable).where(eq(usersTable.id, agentId)).limit(1);

  const [stats] = await db
    .select({
      nb_pesees:    count(livraisonsTable.id),
      ecart_moyen:  avg(livraisonsTable.ecartPeseePct),
      nb_anomalies: count(sql`CASE WHEN ${livraisonsTable.litigePesee} THEN 1 END`),
    })
    .from(livraisonsTable)
    .where(and(eq(livraisonsTable.agentId, agentId), isNotNull(livraisonsTable.poidsBrut1erePeseeKg)));

  const litiges = await db
    .select({ nb: count() })
    .from(litigesPeseeTable)
    .where(eq(litigesPeseeTable.livraisonId,
      sql`(SELECT id FROM livraisons WHERE agent_id = ${agentId} LIMIT 1)`));

  return {
    agent_id:       agentId,
    nom:            agent ? `${agent.prenoms ?? ""} ${agent.nom ?? ""}`.trim() : null,
    nb_pesees:      Number(stats?.nb_pesees ?? 0),
    ecart_moyen_pct: Number(stats?.ecart_moyen ?? 0),
    nb_anomalies:   Number(stats?.nb_anomalies ?? 0),
    nb_litiges:     Number(litiges[0]?.nb ?? 0),
  };
}
