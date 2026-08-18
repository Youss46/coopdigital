import Anthropic from "@anthropic-ai/sdk";
import { db, anomaliesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "../lib/logger.js";
import { notifierParRole } from "./notificationService.js";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AnomalieIA {
  type: string;
  severite: "haute" | "moyenne" | "basse";
  ecritureId: number | null;
  explication: string;
}

// ─── Détection d'anomalies comptables par IA ─────────────────────────────────

export async function detecterAnomaliesComptables(cooperativeId: number): Promise<void> {
  try {
    const hier = new Date();
    hier.setDate(hier.getDate() - 1);
    const dateDebut = hier.toISOString().slice(0, 10);

    // ── Écritures des dernières 24h ──────────────────────────────────────────
    const ecrituresQ = await db.execute<{
      id: number; date_ecriture: string; libelle: string;
      compte_debit: string; compte_credit: string; montant_fcfa: string;
      type_ecriture: string; source: string; numero_piece: string | null;
    }>(sql`
      SELECT id, date_ecriture::text, libelle, compte_debit, compte_credit,
             montant_fcfa::text, type_ecriture, source, numero_piece
      FROM ecritures_comptables
      WHERE cooperative_id = ${cooperativeId}
        AND created_at >= NOW() - INTERVAL '24 hours'
      ORDER BY date_ecriture, id
    `);
    const ecritures = ecrituresQ.rows;

    if (ecritures.length === 0) {
      logger.info({ cooperativeId }, "Veille IA comptable : aucune écriture à analyser");
      return;
    }

    // ── Plan comptable complet avec libellés ─────────────────────────────────
    const planQ = await db.execute<{ numero_compte: string; libelle: string; classe: number | null }>(sql`
      SELECT numero_compte, libelle, classe
      FROM plan_comptable
      WHERE cooperative_id = ${cooperativeId} AND actif = true
      ORDER BY numero_compte
    `);
    const planMap = new Map(planQ.rows.map(p => [p.numero_compte, p.libelle]));
    const label = (num: string) => planMap.get(num) ? `${num} — ${planMap.get(num)}` : num;
    const tresorerie = planQ.rows.filter(p => p.classe === 5).map(p => `${p.numero_compte} — ${p.libelle}`).join(", ");

    // ── Statistiques 90j pour détecter les montants hors norme ──────────────
    const statsQ = await db.execute<{
      source: string; avg_montant: string; stddev_montant: string | null; nb: string;
    }>(sql`
      SELECT source,
             ROUND(AVG(montant_fcfa::numeric))::text       AS avg_montant,
             ROUND(STDDEV(montant_fcfa::numeric))::text    AS stddev_montant,
             COUNT(*)::text                                AS nb
      FROM ecritures_comptables
      WHERE cooperative_id = ${cooperativeId}
        AND date_ecriture >= (CURRENT_DATE - INTERVAL '90 days')
      GROUP BY source
    `);
    const statsCtx = statsQ.rows.map(r =>
      `${r.source}: moy=${Number(r.avg_montant).toLocaleString("fr-FR")} FCFA` +
      (r.stddev_montant ? `, σ=${Number(r.stddev_montant).toLocaleString("fr-FR")} FCFA` : "") +
      ` (${r.nb} écr./90j)`
    ).join("\n");

    // ── Appel Claude ─────────────────────────────────────────────────────────
    const anthropic = new Anthropic({ apiKey: process.env["ANTHROPIC_API_KEY"] });

    const system = `Tu es auditeur comptable expert SYSCOHADA spécialisé dans les coopératives agricoles en Côte d'Ivoire.
Tu analyses les écritures comptables pour détecter des anomalies réelles et actionnables.
Évite les faux positifs : une écriture manuelle n'est pas en soi une anomalie.
Une anomalie doit être concrète et justifiée par rapport aux données fournies.
Réponds UNIQUEMENT avec un tableau JSON valide. Si aucune anomalie, retourne [].`;

    const user = `# Veille comptable IA — Écritures du ${dateDebut}

## Contexte statistique (90 derniers jours)
${statsCtx || "Pas encore d'historique disponible."}

## Plan comptable — comptes de trésorerie (classe 5)
${tresorerie || "SYSCOHADA standard (521 Banque, 571 Caisse)"}

## Écritures à analyser (${ecritures.length})
${ecritures.map(e =>
  `ID=${e.id} | ${e.date_ecriture} | ${e.type_ecriture}/${e.source} | ` +
  `${Number(e.montant_fcfa).toLocaleString("fr-FR")} FCFA | ` +
  `Débit: ${label(e.compte_debit)} / Crédit: ${label(e.compte_credit)} | ` +
  `"${e.libelle}"${e.numero_piece ? ` | Pièce: ${e.numero_piece}` : ""}`
).join("\n")}

## Anomalies à détecter
1. **doublon** : même libellé sémantique + même montant + date ≤2j → probable double saisie
2. **montant_anormal** : montant > moy + 3×σ pour ce type de source selon statistiques fournies
3. **comptes_incoherents** : combinaison débit/crédit incohérente avec la logique SYSCOHADA (ex. charge créditée, produit débité sans contexte d'extourne)
4. **manuelle_suspecte** : source=manuel + libellé vague + montant élevé sans numéro de pièce
5. **extourne_irreguliere** : extourne suivie d'une re-saisie avec écart de montant significatif

Format JSON attendu (tableau de 0 à N anomalies) :
[{"type":"<type>","severite":"haute|moyenne|basse","ecritureId":<id ou null>,"explication":"<1-2 phrases précises>"}]`;

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system,
      messages: [{ role: "user", content: user }],
    });

    const text = response.content[0]?.type === "text" ? response.content[0].text.trim() : "[]";
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    let anomalies: AnomalieIA[] = [];
    try {
      anomalies = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
    } catch {
      logger.warn({ text, cooperativeId }, "Veille IA : erreur parse JSON réponse Claude");
      return;
    }

    if (anomalies.length === 0) {
      logger.info({ cooperativeId }, "Veille IA comptable : aucune anomalie détectée");
      return;
    }

    // ── Insérer dans la table anomalies (moduleSource = comptabilite_ia) ─────
    for (const a of anomalies) {
      await db.insert(anomaliesTable).values({
        cooperativeId,
        typeAnomalie:  a.type,
        niveauGravite: a.severite === "haute" ? "critique" : a.severite === "moyenne" ? "attention" : "info",
        moduleSource:  "comptabilite_ia",
        entiteId:      a.ecritureId ?? undefined,
        entiteType:    a.ecritureId ? "ecriture_comptable" : undefined,
        description:   a.explication,
        statut:        "nouvelle",
      });
    }

    // ── Notifier uniquement les comptables ───────────────────────────────────
    const hautes   = anomalies.filter(a => a.severite === "haute").length;
    const total    = anomalies.length;
    const pluriel  = total > 1;

    await notifierParRole(cooperativeId, ["comptable"], {
      type:         "anomalie_critique",
      gravite:      hautes > 0 ? "critique" : "attention",
      titre:        `Veille IA : ${total} anomalie${pluriel ? "s" : ""} comptable${pluriel ? "s" : ""} détectée${pluriel ? "s" : ""}`,
      message:      `${hautes > 0 ? `${hautes} anomalie${hautes > 1 ? "s" : ""} haute${hautes > 1 ? "s" : ""} — ` : ""}` +
                    `Analyse des écritures du ${dateDebut}. Consultez Comptabilité → Alertes IA.`,
      lien:         "/comptabilite",
      lienLibelle:  "Voir les alertes",
      sourceModule: "comptabilite",
    });

    logger.info({ cooperativeId, total, hautes }, "Veille IA comptable terminée");
  } catch (err) {
    logger.error({ err, cooperativeId }, "Erreur detecterAnomaliesComptables");
  }
}
