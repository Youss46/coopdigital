import { type Request, type Response } from "express";

import { db, membresTable, livraisonsTable, campagnesTable, fournisseursTable, usersTable } from "@workspace/db";
import { eq, and, or, ilike, sql, desc, notInArray, asc } from "drizzle-orm";
import { CreateMembreBody, UpdateMembreBody } from "@workspace/api-zod";
import { computeCodeMembre } from "../services/portailService";
import { generateListeMembres } from "../services/pdfService";
import { sendSMS } from "../services/smsService.js";

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

export async function listMembres(req: Request, res: Response): Promise<void> {
  const cooperativeId = req.user?.cooperativeId;
  if (!cooperativeId) { res.status(401).json({ erreur: "Coopérative non associée au compte" }); return; }

  try {
    const page = Math.max(1, parseInt(String(req.query["page"] ?? "1")));
    const limit = Math.min(100, Math.max(1, parseInt(String(req.query["limit"] ?? "20"))));
    const search = String(req.query["search"] ?? "").trim();
    const statut = req.query["statut"] as string | undefined;
    const delegueId = req.query["delegueId"] ? parseInt(String(req.query["delegueId"])) : undefined;
    const rattachementType = req.query["rattachementType"] as string | undefined;
    const offset = (page - 1) * limit;

    const userRole = req.user?.role;
    const userId = req.user?.id;

    const conditions = [eq(membresTable.cooperativeId, cooperativeId)];

    // RÈGLE 3 — Visibilité : délégué ne voit que ses membres
    if (userRole === "delegue" && userId) {
      conditions.push(eq(membresTable.delegueId, userId));
    } else {
      // Direction : filtres optionnels
      if (delegueId) conditions.push(eq(membresTable.delegueId, delegueId));
      if (rattachementType === "delegue" || rattachementType === "base_centrale") {
        conditions.push(eq(membresTable.rattachementType, rattachementType));
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
    const bodyRattachement = data.rattachementType;
    const bodyDelegueId = data.delegueId;

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
        sexe: data.sexe ?? null,
        photoUrl: data.photoUrl ?? null,
        parcelleLat: data.parcelleLat ?? null,
        parcelleLng: data.parcelleLng ?? null,
        delegueId: delegueIdFinal,
        rattachementType: rattachementTypeFinal,
        zoneType: zoneTypeFinal,
        zoneNom: zoneNomFinal,
        creeParDelegue,
      })
      .returning();

    void autoCreateFournisseurMembre(cooperativeId, membre);

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

    const [membre] = await db
      .update(membresTable)
      .set({ ...parse.data, updatedAt: new Date() })
      .where(and(eq(membresTable.id, id), eq(membresTable.cooperativeId, cooperativeId)))
      .returning();

    if (!membre) {
      res.status(404).json({ erreur: "Membre introuvable" });
      return;
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

  // RÈGLE 4 — Seuls pca et directeur peuvent transférer
  if (userRole !== "pca" && userRole !== "directeur") {
    res.status(403).json({ erreur: "Seuls le PCA et le Directeur peuvent modifier le rattachement" });
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

    // ── Notifications SMS ─────────────────────────────────────────────────
    const membreNom = `${ancien.nom} ${ancien.prenoms}`;

    // Notifier l'ancien délégué s'il change
    if (ancien.delegueId && ancien.delegueId !== newDelegueId) {
      const [ancienDelegue] = await db
        .select({ telephone: usersTable.telephone })
        .from(usersTable)
        .where(eq(usersTable.id, ancien.delegueId))
        .limit(1);
      if (ancienDelegue?.telephone) {
        const msg = rattachementType === "base_centrale"
          ? `Le membre ${membreNom} a été transféré vers la base centrale.`
          : `Le membre ${membreNom} a été transféré vers un autre délégué.`;
        void sendSMS(ancienDelegue.telephone, msg).catch(() => {});
      }
    }

    // Notifier le nouveau délégué
    if (newDelegueId && newDelegueId !== ancien.delegueId) {
      const [nouveauDelegue] = await db
        .select({ telephone: usersTable.telephone })
        .from(usersTable)
        .where(eq(usersTable.id, newDelegueId))
        .limit(1);
      if (nouveauDelegue?.telephone) {
        void sendSMS(nouveauDelegue.telephone, `Le membre ${membreNom} vous a été rattaché. M15 Tech`).catch(() => {});
      }
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
