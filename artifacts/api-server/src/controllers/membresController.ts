import { type Request, type Response } from "express";

import { db, membresTable, livraisonsTable, campagnesTable, fournisseursTable, usersTable } from "@workspace/db";
import { eq, and, or, ilike, sql, desc, notInArray, asc } from "drizzle-orm";
import { CreateMembreBody, UpdateMembreBody } from "@workspace/api-zod";
import { computeCodeMembre } from "../services/portailService";
import { generateListeMembres } from "../services/pdfService";
import { creerNotification, notifierParRole } from "../services/notificationService.js";

function genCodeFournisseur(seq: number, annee: number) {
  return `MBR-${annee}-${String(seq).padStart(4, "0")}`;
}

async function autoCreateFournisseurMembre(
  cooperativeId: number,
  membre: { id: number; nom: string; prenoms: string | null; telephone: string; section?: string | null; nationalite?: string | null; dateAdhesion: string; lieuNaissance?: string | null },
) {
  try {
    const existing = await db.query.fournisseursTable.findFirst({
      where: and(eq(fournisseursTable.membreId, membre.id), eq(fournisseursTable.cooperativeId, cooperativeId)),
    });
    if (existing) return;

    const [countRow] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(fournisseursTable)
      .where(and(eq(fournisseursTable.cooperativeId, cooperativeId), eq(fournisseursTable.typeFournisseur, "membre")));
    const seq = Number(countRow?.count ?? 0) + 1;
    const code = genCodeFournisseur(seq, new Date().getFullYear());

    await db.insert(fournisseursTable).values({
      cooperativeId,
      typeFournisseur: "membre",
      membreId: membre.id,
      code,
      nom: membre.nom,
      prenoms: membre.prenoms,
      telephone: membre.telephone,
      section: membre.section ?? undefined,
      nationalite: membre.nationalite ?? "Ivoirienne",
      dateAdhesion: membre.dateAdhesion,
      lieuNaissance: membre.lieuNaissance ?? undefined,
    });
  } catch {
    // Non bloquant — la création du membre est déjà confirmée
  }
}

function enrichMembre<T extends { id: number; dateAdhesion: string }>(m: T) {
  return { ...m, codeMembre: computeCodeMembre(m.id, m.dateAdhesion) };
}

// ── Délégués disponibles ──────────────────────────────────────────────────────

export async function listDeleguesPourMembres(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée" }); return; }

  try {
    const delegues = await db
      .select({
        id: usersTable.id,
        nom: usersTable.nom,
        prenoms: usersTable.prenoms,
        telephone: usersTable.telephone,
        zoneType: usersTable.zoneType,
        zoneNom: usersTable.zoneNom,
        section: usersTable.section,
      })
      .from(usersTable)
      .where(and(eq(usersTable.cooperativeId, cooperativeId), eq(usersTable.role, "delegue")))
      .orderBy(asc(usersTable.nom));

    res.json(delegues);
  } catch (err) {
    req.log.error({ err }, "Erreur listDeleguesPourMembres");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Liste membres ─────────────────────────────────────────────────────────────

export function computeCompletudIdentite(m: Record<string, unknown>): number {
  const champs = [
    !!m["nom"] && String(m["nom"]).trim() !== "",
    !!m["prenoms"] && String(m["prenoms"]).trim() !== "",
    !!m["telephone"] && String(m["telephone"]).trim() !== "",
    !!m["village"] && String(m["village"]).trim() !== "",
    !!m["date_naissance"] || !!m["dateNaissance"],
    !!m["sexe"] && String(m["sexe"]).trim() !== "",
    !!m["numero_cni"] || !!m["numeroCni"],
    !!m["date_adhesion"] || !!m["dateAdhesion"],
    !!m["type_fournisseur"] || !!m["typeFournisseur"],
    (m["nbre_parts_souscrites"] !== undefined
      ? Number(m["nbre_parts_souscrites"]) > 0
      : Number(m["nbrePartsSouscrites"] ?? 0) > 0),
  ];
  return Math.round((champs.filter(Boolean).length / 10) * 100);
}

export function computeCompletudEudr(m: Record<string, unknown>): number {
  const champs = [
    !!m["gps_parcelles"] || !!m["gpsParcelles"],
    !!m["superficie_totale"] || !!m["superficieTotale"],
    !!m["nombre_parcelles"] || !!m["nombreParcelles"],
  ];
  return Math.round((champs.filter(Boolean).length / 3) * 100);
}

export function computeCompletude(m: Record<string, unknown>): number {
  return computeCompletudIdentite(m);
}

export async function listMembres(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  try {
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "20"))));
    const search = String(req.query["search"] ?? "").trim();
    const statut = req.query["statut"] as string | undefined;
    const statutMembre = req.query["statut_membre"] as string | undefined;
    const delegueId = req.query["delegueId"] ? parseInt(String(req.query["delegueId"])) : undefined;
    const rattachementType = req.query["rattachementType"] as string | undefined;
    const vue = req.query["vue"] as string | undefined;
    const sansGps = req.query["sans_gps"] === "1";
    const offset = (page - 1) * limit;

    const userRole = req.user?.role;
    const userId = req.user?.id;

    const conditions = [eq(membresTable.cooperativeId, cooperativeId)];

    if (userRole === "delegue" && userId) {
      if (vue === "demandes") {
        // Onglet "Mes demandes" : demandes soumises par ce délégué (en_attente + rejetés)
        conditions.push(eq(membresTable.demandeParDelegueId, userId));
        conditions.push(sql`${membresTable.statutMembre} IN ('en_attente', 'rejete')`);
      } else {
        // Onglet "Mes membres" : actifs rattachés à ce délégué seulement
        conditions.push(eq(membresTable.delegueId, userId));
        conditions.push(eq(membresTable.statutMembre, "actif"));
      }
    } else if (userRole === "agent_terrain" && userId) {
      // Agent terrain : seulement les membres de ses missions
      conditions.push(
        sql`${membresTable.id} IN (
          SELECT mm.membre_id FROM missions_membres mm
          JOIN missions_terrain mt ON mt.id = mm.mission_id
          WHERE mt.agent_id = ${userId}
        )`
      );
    } else {
      // Direction / RT / comptable / auditeur : filtres libres
      if (delegueId) conditions.push(eq(membresTable.delegueId, delegueId));
      if (rattachementType === "delegue" || rattachementType === "base_centrale") {
        conditions.push(eq(membresTable.rattachementType, rattachementType));
      }
      const validStatutsMembre = ["en_attente", "actif", "rejete", "suspendu", "archive"];
      if (statutMembre && validStatutsMembre.includes(statutMembre)) {
        conditions.push(eq(membresTable.statutMembre, statutMembre));
      }
      if (sansGps) {
        conditions.push(sql`${membresTable.gpsParcelles} IS NULL`);
      }
    }

    if (statut === "actif" || statut === "inactif") conditions.push(eq(membresTable.statut, statut));
    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        or(
          ilike(membresTable.nom, pattern),
          ilike(membresTable.prenoms, pattern),
          ilike(membresTable.telephone, pattern),
          sql`coalesce(${membresTable.village}, '') ilike ${pattern}`,
        )!,
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const [membres, [{ count }]] = await Promise.all([
      db.select().from(membresTable).where(where).orderBy(desc(membresTable.createdAt)).limit(limit).offset(offset),
      db.select({ count: sql<number>`count(*)::int` }).from(membresTable).where(where),
    ]);

    res.json({ membres: membres.map(enrichMembre), total: count, page, limit });
  } catch (err) {
    req.log.error({ err }, "Erreur listMembres");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Fiche membre ──────────────────────────────────────────────────────────────

export async function getMembreById(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const userRole = req.user?.role;
    const userId = req.user?.id;

    const [membre] = await db.select().from(membresTable)
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!membre) { res.status(404).json({ erreur: "Membre introuvable" }); return; }

    // RÈGLE 3 — Délégué ne peut voir que ses membres
    if (userRole === "delegue" && userId && membre.delegueId !== userId) {
      res.status(403).json({ erreur: "Ce membre n'est pas dans votre zone" });
      return;
    }

    // Enrichir avec info délégué si rattaché
    let delegueInfo: { nom: string; prenoms: string; telephone: string | null; zoneNom: string | null } | null = null;
    if (membre.delegueId) {
      const [delegue] = await db.select({
        nom: usersTable.nom,
        prenoms: usersTable.prenoms,
        telephone: usersTable.telephone,
        zoneNom: usersTable.zoneNom,
      }).from(usersTable).where(eq(usersTable.id, membre.delegueId)).limit(1);
      if (delegue) delegueInfo = delegue;
    }

    res.json({ ...enrichMembre(membre), delegueInfo });
  } catch (err) {
    req.log.error({ err }, "Erreur getMembreById");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Création membre ───────────────────────────────────────────────────────────

export async function createMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userRole = req.user?.role;
  const userId = req.user?.id;

  if (!cooperativeId) {
    res.status(403).json({ erreur: "Coopérative non associée à ce compte" });
    return;
  }

  const parse = CreateMembreBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides", details: parse.error.issues });
    return;
  }

  const data = { ...parse.data, cooperativeId };

  if (!data.superficieHa || parseFloat(String(data.superficieHa)) <= 0) {
    res.status(400).json({ erreur: "La superficie doit être supérieure à 0" });
    return;
  }

  // ── RÈGLE 2 — Rattachement automatique selon rôle ────────────────────────
  let delegueIdFinal: number | null = null;
  let rattachementTypeFinal = "delegue";
  let zoneTypeFinal: string | null = null;
  let zoneNomFinal: string | null = null;
  let creeParDelegue = false;

  if (userRole === "delegue" && userId) {
    // RÈGLE 1 — Délégué : toujours dans sa zone, rattachement à lui-même
    const [delegueInfo] = await db
      .select({ zoneType: usersTable.zoneType, zoneNom: usersTable.zoneNom })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    delegueIdFinal = userId;
    rattachementTypeFinal = "delegue";
    zoneTypeFinal = delegueInfo?.zoneType ?? null;
    zoneNomFinal = delegueInfo?.zoneNom ?? null;
    creeParDelegue = true;
  } else {
    // pca / directeur : utilise les valeurs du body
    const rawBody = req.body as Record<string, unknown>;
    const bodyRattachement = rawBody["rattachementType"] as string | undefined;
    const bodyDelegueId = rawBody["delegueId"] ? Number(rawBody["delegueId"]) : undefined;

    if (bodyRattachement === "base_centrale") {
      rattachementTypeFinal = "base_centrale";
      delegueIdFinal = null;
    } else if (bodyDelegueId) {
      const [delegueInfo] = await db
        .select({
          id: usersTable.id,
          zoneType: usersTable.zoneType,
          zoneNom: usersTable.zoneNom,
          cooperativeId: usersTable.cooperativeId,
          role: usersTable.role,
        })
        .from(usersTable)
        .where(eq(usersTable.id, bodyDelegueId))
        .limit(1);

      if (!delegueInfo || delegueInfo.cooperativeId !== cooperativeId || delegueInfo.role !== "delegue") {
        res.status(400).json({ erreur: "Délégué invalide ou hors coopérative" });
        return;
      }

      delegueIdFinal = bodyDelegueId;
      rattachementTypeFinal = "delegue";
      zoneTypeFinal = delegueInfo.zoneType ?? null;
      zoneNomFinal = delegueInfo.zoneNom ?? null;
    }
    // Sinon : pas de rattachement défini (sera assigné plus tard)
  }

  try {
    const [existing] = await db
      .select()
      .from(membresTable)
      .where(and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.telephone, data.telephone)))
      .limit(1);

    if (existing) {
      res.status(400).json({ erreur: "Ce numéro de téléphone est déjà utilisé dans cette coopérative" });
      return;
    }

    // ── RÈGLE 2/3 — Workflow selon rôle ────────────────────────────────────────
    const directRoles = ["pca", "directeur", "responsable_tracabilite"];
    let statutMembreFinal: string;
    let validePar: number | null = null;
    let dateValidationFinal: Date | null = null;
    let demandeParDelegueId: number | null = null;

    if (userRole === "delegue" && userId) {
      statutMembreFinal = "en_attente";
      demandeParDelegueId = userId;
    } else if (userRole && directRoles.includes(userRole)) {
      statutMembreFinal = "actif";
      validePar = userId ?? null;
      dateValidationFinal = new Date();
    } else {
      statutMembreFinal = "actif";
    }

    const body = req.body as Record<string, unknown>;

    const [membre] = await db
      .insert(membresTable)
      .values({
        cooperativeId,
        nom: data.nom,
        prenoms: data.prenoms,
        telephone: data.telephone,
        superficieHa: String(data.superficieHa),
        dateAdhesion: data.dateAdhesion ?? new Date().toISOString().split("T")[0]!,
        statut: data.statut ?? "actif",
        village: data.village ?? null,
        groupement: data.groupement ?? null,
        numeroCni: data.numeroCni ?? null,
        carteProducteur: (body["carteProducteur"] ?? null) as string | null,
        sexe: (data.sexe ?? body["sexe"] ?? null) as string | null,
        dateNaissance: (body["dateNaissance"] ?? null) as string | null,
        photoUrl: data.photoUrl ?? null,
        parcelleLat: data.parcelleLat ?? null,
        parcelleLng: data.parcelleLng ?? null,
        typeFournisseur: (body["typeFournisseur"] ?? null) as string | null,
        section: (body["section"] ?? null) as string | null,
        nbrePartsSouscrites: Number(body["nbrePartsSouscrites"] ?? 0),
        valeurNominalePartFcfa: Number(body["valeurNominalePartFcfa"] ?? 0),
        delegueId: delegueIdFinal,
        rattachementType: rattachementTypeFinal,
        zoneType: zoneTypeFinal,
        zoneNom: zoneNomFinal,
        creeParDelegue,
        // Workflow
        statutMembre: statutMembreFinal,
        creePar: userRole ?? "system",
        demandeParDelegueId,
        validePar,
        dateValidation: dateValidationFinal,
        // Parcelles enrichies
        telephoneSecondaire: (body["telephoneSecondaire"] ?? null) as string | null,
        nombreParcelles: body["nombreParcelles"] ? Number(body["nombreParcelles"]) : null,
        superficieTotale: (body["superficieTotale"] ?? null) as string | null,
        gpsParcelles: (body["gpsParcelles"] ?? null) as unknown,
        culturePrincipale: (body["culturePrincipale"] ?? null) as string | null,
        certification: (body["certification"] ?? null) as string | null,
        documentsJoints: (body["documentsJoints"] ?? null) as unknown,
      })
      .returning();

    // ── Calculer completude_identite + completude_eudr après insertion ──────
    {
      const row: Record<string, unknown> = {
        nom: membre.nom,
        prenoms: membre.prenoms,
        telephone: membre.telephone,
        village: membre.village,
        dateNaissance: membre.dateNaissance,
        sexe: membre.sexe,
        numeroCni: membre.numeroCni,
        dateAdhesion: membre.dateAdhesion,
        typeFournisseur: membre.typeFournisseur,
        nbrePartsSouscrites: membre.nbrePartsSouscrites,
        gpsParcelles: membre.gpsParcelles,
        superficieTotale: membre.superficieTotale,
        nombreParcelles: membre.nombreParcelles,
      };
      const ci = computeCompletudIdentite(row);
      const ce = computeCompletudEudr(row);
      const se = ce === 100 ? "conforme" : "non_conforme";
      const mgr = membre.statutMembre === "actif" && ce < 100;
      await db.update(membresTable)
        .set({ completudeIdentite: ci, completudeEudr: ce, statutEudr: se, missionGpsRequise: mgr, completudeFiche: ci })
        .where(eq(membresTable.id, membre.id));
      membre.completudeIdentite = ci;
      membre.completudeEudr = ce;
      membre.statutEudr = se;
      membre.missionGpsRequise = mgr;
      membre.completudeFiche = ci;
    }

    // Auto-création fournisseur uniquement pour membres actifs directs
    if (statutMembreFinal === "actif") {
      void autoCreateFournisseurMembre(cooperativeId, membre);
    }

    // Notification RT si demande délégué
    if (statutMembreFinal === "en_attente" && userId) {
      try {
        const [delegueInfo] = await db
          .select({ nom: usersTable.nom, prenoms: usersTable.prenoms, zoneNom: usersTable.zoneNom })
          .from(usersTable)
          .where(eq(usersTable.id, userId))
          .limit(1);
        void notifierParRole(cooperativeId, ["responsable_tracabilite", "pca", "directeur"], {
          type:         "demande_membre",
          titre:        "Nouvelle demande de membre",
          message:      `${delegueInfo?.prenoms ?? ""} ${delegueInfo?.nom ?? ""} (Zone ${delegueInfo?.zoneNom ?? "—"}) a soumis une demande pour ${membre.prenoms} ${membre.nom}.`,
          lien:         "/membres?statut_membre=en_attente",
          lienLibelle:  "Valider la demande",
          gravite:      "attention",
          sourceModule: "membres",
          sourceId:     membre.id,
        });
      } catch { /* non bloquant */ }
    }

    res.status(201).json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur createMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Mise à jour membre ────────────────────────────────────────────────────────

export async function updateMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userRole = req.user?.role;
  const userId = req.user?.id;

  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  const parse = UpdateMembreBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides" });
    return;
  }

  try {
    const id = parseInt(String(req.params["id"] ?? "0"));

    // RÈGLE 3 — Délégué ne peut modifier que ses membres
    if (userRole === "delegue" && userId) {
      const [membreCheck] = await db
        .select({ delegueId: membresTable.delegueId })
        .from(membresTable)
        .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
        .limit(1);

      if (!membreCheck) { res.status(404).json({ erreur: "Membre introuvable" }); return; }
      if (membreCheck.delegueId !== userId) {
        res.status(403).json({ erreur: "Ce membre n'est pas dans votre zone" });
        return;
      }
    }

    const body = req.body as Record<string, unknown>;

    // Champs supplémentaires lus directement depuis req.body (non couverts par les anciennes versions du schéma Zod)
    const extraFields: Record<string, unknown> = {};
    if (body["dateNaissance"] !== undefined)    extraFields["dateNaissance"]     = body["dateNaissance"] as string | null;
    if (body["dateAdhesion"] !== undefined)     extraFields["dateAdhesion"]      = body["dateAdhesion"] as string | null;
    if (body["typeFournisseur"] !== undefined)  extraFields["typeFournisseur"]   = body["typeFournisseur"] as string | null;
    if (body["nbrePartsSouscrites"] !== undefined) extraFields["nbrePartsSouscrites"] = Number(body["nbrePartsSouscrites"]);
    if (body["superficieTotale"] !== undefined) extraFields["superficieTotale"]  = String(body["superficieTotale"]);
    if (body["nombreParcelles"] !== undefined)  extraFields["nombreParcelles"]   = Number(body["nombreParcelles"]);
    if (body["carteProducteur"] !== undefined)  extraFields["carteProducteur"]   = (body["carteProducteur"] as string | null) ?? null;

    // dateAdhesion dans parse.data est un Date (zod.coerce.date) — exclure et laisser extraFields gérer
    const { dateAdhesion: _da, dateNaissance: _dn, typeFournisseur: _tf, nbrePartsSouscrites: _np, ...restParseData } = parse.data as Record<string, unknown>;
    void _da; void _dn; void _tf; void _np;

    const [membre] = await db
      .update(membresTable)
      .set({ ...restParseData, ...extraFields, updatedAt: new Date() })
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .returning();

    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }

    // Recalcul completude après mise à jour
    {
      const row: Record<string, unknown> = {
        nom: membre.nom, prenoms: membre.prenoms, telephone: membre.telephone,
        village: membre.village, dateNaissance: membre.dateNaissance, sexe: membre.sexe,
        numeroCni: membre.numeroCni, dateAdhesion: membre.dateAdhesion,
        typeFournisseur: membre.typeFournisseur, nbrePartsSouscrites: membre.nbrePartsSouscrites,
        gpsParcelles: membre.gpsParcelles, superficieTotale: membre.superficieTotale,
        nombreParcelles: membre.nombreParcelles,
      };
      const ci = computeCompletudIdentite(row);
      const ce = computeCompletudEudr(row);
      const se = ce === 100 ? "conforme" : "non_conforme";
      const mgr = membre.statutMembre === "actif" && ce < 100;
      await db.update(membresTable)
        .set({ completudeIdentite: ci, completudeEudr: ce, statutEudr: se, missionGpsRequise: mgr, completudeFiche: ci })
        .where(eq(membresTable.id, membre.id));
      membre.completudeIdentite = ci;
      membre.completudeEudr = ce;
      membre.statutEudr = se;
      membre.missionGpsRequise = mgr;
      membre.completudeFiche = ci;
    }

    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur updateMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Transfert de rattachement ─────────────────────────────────────────────────

export async function transfererRattachement(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userRole = req.user?.role;

  if (!cooperativeId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  // RÈGLE 4 — Seuls pca, directeur et responsable_tracabilite peuvent transférer
  if (userRole !== "pca" && userRole !== "directeur" && userRole !== "responsable_tracabilite") {
    res.status(403).json({ erreur: "Vous n'avez pas la permission de modifier le rattachement" });
    return;
  }

  const id = parseInt(String(req.params["id"] ?? "0"));
  const { rattachementType, delegueId, motif } = req.body as {
    rattachementType: string;
    delegueId?: number | null;
    motif?: string;
  };

  if (!["delegue", "base_centrale"].includes(rattachementType)) {
    res.status(400).json({ erreur: "rattachementType invalide (delegue | base_centrale)" });
    return;
  }

  if (rattachementType === "delegue" && !delegueId) {
    res.status(400).json({ erreur: "delegueId obligatoire pour le rattachement de type 'delegue'" });
    return;
  }

  try {
    const [ancien] = await db
      .select()
      .from(membresTable)
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!ancien) { res.status(404).json({ erreur: "Membre introuvable" }); return; }

    let newDelegueId: number | null = null;
    let newZoneType: string | null = null;
    let newZoneNom: string | null = null;

    if (rattachementType === "delegue" && delegueId) {
      const [delegue] = await db
        .select({ id: usersTable.id, zoneType: usersTable.zoneType, zoneNom: usersTable.zoneNom, telephone: usersTable.telephone, cooperativeId: usersTable.cooperativeId, role: usersTable.role })
        .from(usersTable)
        .where(eq(usersTable.id, delegueId))
        .limit(1);

      if (!delegue || delegue.cooperativeId !== cooperativeId || delegue.role !== "delegue") {
        res.status(404).json({ erreur: "Délégué introuvable ou hors coopérative" });
        return;
      }
      newDelegueId = delegueId;
      newZoneType = delegue.zoneType ?? null;
      newZoneNom = delegue.zoneNom ?? null;
    }

    const [updated] = await db
      .update(membresTable)
      .set({ rattachementType, delegueId: newDelegueId, zoneType: newZoneType, zoneNom: newZoneNom, updatedAt: new Date() })
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .returning();

    // ── Notifications ─────────────────────────────────────────────────────
    const membreNom = `${ancien.nom} ${ancien.prenoms}`;

    // Notifier l'ancien délégué s'il change
    if (ancien.delegueId && ancien.delegueId !== newDelegueId) {
      const msg = rattachementType === "base_centrale"
        ? `Le membre ${membreNom} a été transféré vers la base centrale.`
        : `Le membre ${membreNom} a été transféré vers un autre délégué.`;
      void creerNotification(cooperativeId, [ancien.delegueId], {
        type:         "rattachement_change",
        titre:        "Membre transféré",
        message:      msg,
        lien:         "/membres",
        lienLibelle:  "Voir mes membres",
        gravite:      "info",
        sourceModule: "membres",
        sourceId:     id,
      });
    }

    // Notifier le nouveau délégué
    if (newDelegueId && newDelegueId !== ancien.delegueId) {
      void creerNotification(cooperativeId, [newDelegueId], {
        type:         "rattachement_change",
        titre:        "Nouveau membre rattaché",
        message:      `Le membre ${membreNom} vous a été rattaché.`,
        lien:         `/membres/${id}`,
        lienLibelle:  "Voir la fiche",
        gravite:      "info",
        sourceModule: "membres",
        sourceId:     id,
      });
    }

    req.log.info({ membreId: id, rattachementType, newDelegueId, motif }, "Rattachement membre modifié");
    res.json(enrichMembre(updated));
  } catch (err) {
    req.log.error({ err }, "Erreur transfererRattachement");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── QR code ───────────────────────────────────────────────────────────────────

export async function getMembreByQr(req: Request, res: Response): Promise<void> {
  try {
    const token = String(req.params["token"] ?? "");
    const [membre] = await db.select().from(membresTable).where(eq(membresTable.qrCodeToken, token)).limit(1);
    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur getMembreByQr");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Historique membre ─────────────────────────────────────────────────────────

export async function getMembreHistorique(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const { avancesTable, livraisonsTable, paiementsTable } = await import("@workspace/db");
    const [membreCheck] = await db.select({ id: membresTable.id }).from(membresTable)
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId))).limit(1);
    if (!membreCheck) { res.status(404).json({ erreur: "Membre introuvable" }); return; }

    const [livraisons, avances, paiements] = await Promise.all([
      db.select().from(livraisonsTable).where(eq(livraisonsTable.membreId, id)).orderBy(desc(livraisonsTable.dateLivraison)),
      db.select().from(avancesTable).where(eq(avancesTable.membreId, id)).orderBy(desc(avancesTable.dateOctroi)),
      db.select().from(paiementsTable).where(eq(paiementsTable.membreId, id)).orderBy(desc(paiementsTable.createdAt)),
    ]);

    res.json({ livraisons, avances, paiements });
  } catch (err) {
    req.log.error({ err }, "Erreur getMembreHistorique");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Export PDF ────────────────────────────────────────────────────────────────

export async function exportMembresPdf(req: Request, res: Response): Promise<void> {
  try {
    const statutFilter = req.query["statut"] as string | undefined;
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

    const conditions = [eq(membresTable.cooperativeId, cooperativeId)];
    if (statutFilter === "actif" || statutFilter === "inactif") {
      conditions.push(eq(membresTable.statut, statutFilter));
    }

    const membres = await db
      .select()
      .from(membresTable)
      .where(and(...conditions))
      .orderBy(asc(membresTable.nom));

    const buf = await generateListeMembres(membres, statutFilter, cooperativeId);
    const filename = `membres-${statutFilter ?? "tous"}-${new Date().toISOString().slice(0, 10)}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", String(buf.length));
    res.end(buf);
  } catch (err) {
    req.log.error({ err }, "Erreur exportMembresPdf");
    if (!res.headersSent) res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Statut membre ─────────────────────────────────────────────────────────────

export async function modifierStatutMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  try {
    const id = parseInt(String(req.params["id"] ?? "0"));
    const { statut } = req.body as { statut: string };
    if (statut !== "actif" && statut !== "inactif") {
      res.status(400).json({ erreur: "Statut invalide (actif ou inactif attendu)" });
      return;
    }
    const [membre] = await db
      .update(membresTable)
      .set({ statut })
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .returning();
    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
    }
    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur modifierStatutMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Désactivation sans campagne ───────────────────────────────────────────────

export async function desactiverMembresSansCampagne(req: Request, res: Response): Promise<void> {
  try {
    const campagneId = parseInt(String(req.params["id"] ?? "0"));
    const cooperativeId = req.user?.cooperativeId;
    if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

    const campagne = await db.query.campagnesTable.findFirst({
      where: and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, cooperativeId)),
    });
    if (!campagne) {
      res.status(404).json({ erreur: "Campagne introuvable" });
      return;
    }

    const livraisons = await db
      .selectDistinct({ membreId: livraisonsTable.membreId })
      .from(livraisonsTable)
      .where(eq(livraisonsTable.campagneId, campagneId));

    const membresAvecLivraison = livraisons.map((l) => l.membreId).filter((id): id is number => id !== null);

    let desactivesCount = 0;
    const baseWhere = and(eq(membresTable.cooperativeId, cooperativeId), eq(membresTable.statut, "actif"));

    if (membresAvecLivraison.length > 0) {
      const updated = await db
        .update(membresTable)
        .set({ statut: "inactif" })
        .where(and(baseWhere, notInArray(membresTable.id, membresAvecLivraison)))
        .returning({ id: membresTable.id });
      desactivesCount = updated.length;
    } else {
      const updated = await db
        .update(membresTable)
        .set({ statut: "inactif" })
        .where(baseWhere)
        .returning({ id: membresTable.id });
      desactivesCount = updated.length;
    }

    res.json({ desactivesCount, campagneId });
  } catch (err) {
    req.log.error({ err }, "Erreur desactiverMembresSansCampagne");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ── Validation workflow membre ─────────────────────────────────────────────────

export async function validerMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const id = parseInt(String(req.params["id"] ?? "0"));

  try {
    const [existing] = await db
      .select()
      .from(membresTable)
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!existing) { res.status(404).json({ erreur: "Membre introuvable" }); return; }
    if (existing.statutMembre !== "en_attente") {
      res.status(400).json({ erreur: "Ce membre n'est pas en attente de validation" });
      return;
    }

    const row = existing as unknown as Record<string, unknown>;
    const completudeIdentite = computeCompletudIdentite(row);
    const completudeEudr = computeCompletudEudr(row);

    if (completudeIdentite < 100) {
      res.status(400).json({
        erreur: `Fiche identité incomplète (${completudeIdentite}%). Complétez les 10 champs du Groupe A.`,
        completudeIdentite,
        completudeEudr,
      });
      return;
    }

    const missionGpsRequise = completudeEudr < 100;
    const statutEudr = completudeEudr === 100 ? "conforme" : "non_conforme";

    const [membre] = await db
      .update(membresTable)
      .set({
        statutMembre: "actif",
        validePar: userId,
        dateValidation: new Date(),
        completudeFiche: completudeIdentite,
        completudeIdentite,
        completudeEudr,
        statutEudr,
        missionGpsRequise,
        updatedAt: new Date(),
      })
      .where(eq(membresTable.id, id))
      .returning();

    void autoCreateFournisseurMembre(cooperativeId, membre);

    if (existing.demandeParDelegueId) {
      void creerNotification(cooperativeId, [existing.demandeParDelegueId], {
        type:         "membre_valide",
        titre:        "Demande de membre validée ✓",
        message:      `${membre.prenoms} ${membre.nom} est maintenant actif dans CoopDigital.`,
        lien:         `/membres/${membre.id}`,
        lienLibelle:  "Voir la fiche",
        gravite:      "info",
        sourceModule: "membres",
        sourceId:     membre.id,
      });
    }

    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur validerMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

export async function rejeterMembre(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  const userId = req.user?.id;
  if (!cooperativeId || !userId) { res.status(401).json({ erreur: "Non autorisé" }); return; }

  const id = parseInt(String(req.params["id"] ?? "0"));
  const { motif } = req.body as { motif?: string };

  if (!motif || motif.trim() === "") {
    res.status(400).json({ erreur: "Le motif de rejet est obligatoire" });
    return;
  }

  try {
    const [existing] = await db
      .select()
      .from(membresTable)
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!existing) { res.status(404).json({ erreur: "Membre introuvable" }); return; }

    const [membre] = await db
      .update(membresTable)
      .set({ statutMembre: "rejete", motifRejet: motif, updatedAt: new Date() })
      .where(eq(membresTable.id, id))
      .returning();

    if (existing.demandeParDelegueId) {
      void creerNotification(cooperativeId, [existing.demandeParDelegueId], {
        type:         "membre_rejete",
        titre:        "Demande de membre rejetée",
        message:      `La demande pour ${membre.prenoms} ${membre.nom} a été rejetée. Motif : ${motif}.`,
        lien:         `/membres/${membre.id}`,
        lienLibelle:  "Corriger la fiche",
        gravite:      "attention",
        sourceModule: "membres",
        sourceId:     membre.id,
      });
    }

    res.json(enrichMembre(membre));
  } catch (err) {
    req.log.error({ err }, "Erreur rejeterMembre");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── GET /membres/cartes — liste des cartes membres ───────────────────────────

export async function getCartesMembres(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non identifiée" }); return; }

  try {
    const rows = await db
      .select({
        id: membresTable.id,
        nom: membresTable.nom,
        prenoms: membresTable.prenoms,
        telephone: membresTable.telephone,
        village: membresTable.village,
        dateAdhesion: membresTable.dateAdhesion,
        statut: membresTable.statut,
        photoUrl: membresTable.photoUrl,
        carteStatut: membresTable.carteStatut,
        carteNumero: membresTable.carteNumero,
        carteGenereLe: membresTable.carteGenereLe,
        carteSuspendueLe: membresTable.carteSuspendueLe,
      })
      .from(membresTable)
      .where(eq(membresTable.cooperativeId, cooperativeId))
      .orderBy(asc(membresTable.nom), asc(membresTable.prenoms));

    res.json(rows);
  } catch (err) {
    req.log.error({ err }, "Erreur getCartesMembres");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── GET /membres/:id/carte-pdf — télécharger la carte PDF ───────────────────

export async function getMembreCartePdf(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non identifiée" }); return; }

  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

  try {
    const [membre] = await db.select()
      .from(membresTable)
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!membre) { res.status(404).json({ erreur: "Membre introuvable" }); return; }
    if (membre.carteStatut === "suspendue") { res.status(403).json({ erreur: "Carte suspendue" }); return; }

    const { generateCarteMembre } = await import("../services/portailService");
    const pdf = await generateCarteMembre(id);
    const code = `MBR-${new Date(membre.dateAdhesion).getFullYear()}-${String(membre.id).padStart(4, "0")}`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="carte-${code}.pdf"`);
    res.send(pdf);
  } catch (err) {
    req.log.error({ err }, "Erreur getMembreCartePdf");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}

// ─── PATCH /membres/:id/carte-statut — suspendre/activer ────────────────────

export async function updateCarteStatut(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(403).json({ erreur: "Coopérative non identifiée" }); return; }

  const id = parseInt(String(req.params["id"] ?? ""), 10);
  if (isNaN(id)) { res.status(400).json({ erreur: "ID invalide" }); return; }

  const { action, motif } = req.body as { action?: string; motif?: string };
  if (action !== "suspendre" && action !== "activer") {
    res.status(400).json({ erreur: "action doit être 'suspendre' ou 'activer'" });
    return;
  }
  if (action === "suspendre" && !motif?.trim()) {
    res.status(400).json({ erreur: "Motif requis pour suspension" });
    return;
  }

  try {
    const [membre] = await db.select()
      .from(membresTable)
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .limit(1);

    if (!membre) { res.status(404).json({ erreur: "Membre introuvable" }); return; }

    const updates =
      action === "suspendre"
        ? { carteStatut: "suspendue" as const, carteSuspendueLe: new Date() }
        : { carteStatut: (membre.carteGenereLe ? "active" : "non_emise") as "active" | "non_emise", carteSuspendueLe: null };

    await db.update(membresTable).set(updates).where(eq(membresTable.id, id));

    res.json({ ok: true, carteStatut: updates.carteStatut });
  } catch (err) {
    req.log.error({ err }, "Erreur updateCarteStatut");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
