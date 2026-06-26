import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { fournisseursTable, membresTable, livraisonsTable } from "@workspace/db";
import { eq, and, or, ilike, desc, sql } from "drizzle-orm";

class TenantError extends Error {
  readonly status = 401;
  readonly erreur = "Coopérative non associée au compte";
  constructor() { super("TENANT_REQUIRED"); }
}

const coopId = (req: import("express").Request): number => {
  const id = req.user?.cooperativeId;
  if (!id) throw new TenantError();
  return id;
};

function genCode(type: "membre" | "pisteur" | "externe", annee: number, seq: number) {
  const prefix = { membre: "MBR", pisteur: "PST", externe: "EXT" }[type];
  return `${prefix}-${annee}-${String(seq).padStart(4, "0")}`;
}

export async function listFournisseurs(req: Request, res: Response) {
  const { type, section, q } = req.query as {
    type?: string;
    section?: string;
    q?: string;
  };

  const cid = coopId(req);

  const rows = await db
    .select({
      id:                    fournisseursTable.id,
      cooperativeId:         fournisseursTable.cooperativeId,
      typeFournisseur:       fournisseursTable.typeFournisseur,
      membreId:              fournisseursTable.membreId,
      code:                  fournisseursTable.code,
      nom:                   fournisseursTable.nom,
      prenoms:               fournisseursTable.prenoms,
      sexe:                  fournisseursTable.sexe,
      telephone:             fournisseursTable.telephone,
      section:               fournisseursTable.section,
      nationalite:           fournisseursTable.nationalite,
      numeroCni:             fournisseursTable.numeroCni,
      origine:               fournisseursTable.origine,
      dateAdhesion:          fournisseursTable.dateAdhesion,
      lieuNaissance:         fournisseursTable.lieuNaissance,
      photoUrl:              fournisseursTable.photoUrl,
      statutAgrement:        fournisseursTable.statutAgrement,
      dateAgrement:          fournisseursTable.dateAgrement,
      dateExpirationAgrement: fournisseursTable.dateExpirationAgrement,
      actif:                 fournisseursTable.actif,
      createdAt:             fournisseursTable.createdAt,
      updatedAt:             fournisseursTable.updatedAt,
      nbLivraisons:  sql<number>`count(${livraisonsTable.id})::int`,
      tonnageTotal:  sql<number>`coalesce(sum(${livraisonsTable.poidsKg}::numeric), 0)::float`,
      derniereLivraison: sql<string | null>`max(${livraisonsTable.dateLivraison})`,
    })
    .from(fournisseursTable)
    .leftJoin(
      livraisonsTable,
      and(
        eq(livraisonsTable.membreId, fournisseursTable.membreId!),
        sql`${fournisseursTable.membreId} is not null`
      )
    )
    .where(
      and(
        eq(fournisseursTable.cooperativeId, cid),
        eq(fournisseursTable.actif, true),
        type ? eq(fournisseursTable.typeFournisseur, type as "membre" | "pisteur" | "externe") : undefined,
        section ? eq(fournisseursTable.section, section) : undefined,
        q
          ? or(
              ilike(fournisseursTable.nom, `%${q}%`),
              ilike(fournisseursTable.prenoms, `%${q}%`),
              ilike(fournisseursTable.code, `%${q}%`),
              ilike(fournisseursTable.telephone, `%${q}%`)
            )
          : undefined
      )
    )
    .groupBy(fournisseursTable.id)
    .orderBy(desc(fournisseursTable.createdAt));

  return res.json(rows);
}

export async function searchFournisseurs(req: Request, res: Response) {
  const { q } = req.query as { q?: string };
  if (!q || q.length < 2) return res.json([]);

  const results = await db.query.fournisseursTable.findMany({
    where: and(
      eq(fournisseursTable.cooperativeId, coopId(req)),
      eq(fournisseursTable.actif, true),
      or(
        ilike(fournisseursTable.nom, `%${q}%`),
        ilike(fournisseursTable.prenoms, `%${q}%`),
        ilike(fournisseursTable.code, `%${q}%`),
        ilike(fournisseursTable.telephone, `%${q}%`)
      )
    ),
    limit: 10,
  });

  return res.json(results);
}

export async function getFournisseurById(req: Request, res: Response) {
  const id = parseInt(String(req.params["id"] ?? "0"));

  const fournisseur = await db.query.fournisseursTable.findFirst({
    where: and(
      eq(fournisseursTable.id, id),
      eq(fournisseursTable.cooperativeId, coopId(req))
    ),
  });

  if (!fournisseur) return res.status(404).json({ erreur: "Fournisseur introuvable" });

  const livraisons = fournisseur.membreId
    ? await db.query.livraisonsTable.findMany({
        where: eq(livraisonsTable.membreId, fournisseur.membreId),
        orderBy: [desc(livraisonsTable.dateLivraison)],
        limit: 20,
      })
    : [];

  return res.json({ ...fournisseur, livraisons });
}

export async function createFournisseur(req: Request, res: Response) {
  const body = req.body as {
    typeFournisseur: string;
    nom: string;
    prenoms?: string;
    sexe?: string;
    telephone?: string;
    section?: string;
    nationalite?: string;
    numeroCni?: string;
    origine?: string;
    dateAdhesion?: string;
    lieuNaissance?: string;
    dateAgrement?: string;
    dateExpirationAgrement?: string;
  };

  if (!body.typeFournisseur || !body.nom?.trim()) {
    return res.status(400).json({ erreur: "Données manquantes (nom et type requis)" });
  }
  if (body.typeFournisseur === "membre") {
    return res.status(400).json({ erreur: "Utiliser /depuis-membre pour les membres" });
  }
  if (!["pisteur", "externe"].includes(body.typeFournisseur)) {
    return res.status(400).json({ erreur: `Type fournisseur invalide : ${body.typeFournisseur}` });
  }

  try {
    const cid  = coopId(req);
    const type = body.typeFournisseur as "pisteur" | "externe";
    const annee = new Date().getFullYear();

    const countRes = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(fournisseursTable)
      .where(and(
        eq(fournisseursTable.cooperativeId, cid),
        eq(fournisseursTable.typeFournisseur, type),
      ));
    const seq  = Number(countRes[0]?.count ?? 0) + 1;
    const code = genCode(type, annee, seq);

    // Convertit une date ISO string en "YYYY-MM-DD" pour Drizzle mode:"string"
    const toDate = (v?: string): string | undefined => {
      if (!v) return undefined;
      const d = new Date(v);
      if (isNaN(d.getTime())) return undefined;
      return d.toISOString().slice(0, 10);
    };

    const [fournisseur] = await db
      .insert(fournisseursTable)
      .values({
        cooperativeId: cid,
        typeFournisseur: type,
        code,
        nom: body.nom.trim(),
        prenoms: body.prenoms?.trim() || undefined,
        sexe: body.sexe || undefined,
        telephone: body.telephone?.trim() || undefined,
        section: body.section?.trim() || undefined,
        nationalite: body.nationalite ?? "Ivoirienne",
        numeroCni: body.numeroCni?.trim() || undefined,
        origine: body.origine?.trim() || undefined,
        dateAdhesion: toDate(body.dateAdhesion),
        lieuNaissance: body.lieuNaissance?.trim() || undefined,
        statutAgrement: type === "pisteur" ? "agree" : undefined,
        dateAgrement: toDate(body.dateAgrement),
        dateExpirationAgrement: toDate(body.dateExpirationAgrement),
      })
      .returning();

    return res.status(201).json(fournisseur);
  } catch (err) {
    req.log.error({ err }, "Erreur createFournisseur");
    // Drizzle wraps the PG error in err.cause — prefer that detail
    type PgLike = { detail?: string; message?: string };
    const cause = (err as { cause?: PgLike })?.cause;
    const msg =
      cause?.detail ??
      cause?.message ??
      (err as PgLike)?.detail ??
      (err as Error)?.message ??
      "Erreur interne";
    return res.status(500).json({ erreur: msg });
  }
}

export async function createFournisseurDepuisMembre(req: Request, res: Response) {
  const membreId = parseInt(String(req.params["id"] ?? "0"));

  const membre = await db.query.membresTable.findFirst({
    where: and(
      eq(membresTable.id, membreId),
      eq(membresTable.cooperativeId, coopId(req))
    ),
  });
  if (!membre) return res.status(404).json({ erreur: "Membre introuvable" });

  const existant = await db.query.fournisseursTable.findFirst({
    where: and(
      eq(fournisseursTable.membreId, membreId),
      eq(fournisseursTable.cooperativeId, coopId(req))
    ),
  });
  if (existant) return res.json(existant);

  const annee = new Date().getFullYear();
  const countRes = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fournisseursTable)
    .where(
      and(
        eq(fournisseursTable.cooperativeId, coopId(req)),
        eq(fournisseursTable.typeFournisseur, "membre")
      )
    );
  const seq = Number(countRes[0]?.count ?? 0) + 1;
  const code = genCode("membre", annee, seq);

  const [fournisseur] = await db
    .insert(fournisseursTable)
    .values({
      cooperativeId: coopId(req),
      typeFournisseur: "membre",
      membreId,
      code,
      nom: membre.nom,
      prenoms: membre.prenoms,
      telephone: membre.telephone,
      section: membre.section ?? undefined,
      nationalite: membre.nationalite ?? "Ivoirienne",
      dateAdhesion: membre.dateAdhesion,
      lieuNaissance: membre.lieuNaissance ?? undefined,
    })
    .returning();

  return res.status(201).json(fournisseur);
}

export async function updateFournisseur(req: Request, res: Response) {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const body = req.body as {
    nom?: string;
    prenoms?: string;
    sexe?: string;
    telephone?: string;
    section?: string;
    nationalite?: string;
    numeroCni?: string;
    origine?: string;
    actif?: boolean;
  };

  const [updated] = await db
    .update(fournisseursTable)
    .set({
      ...(body.nom !== undefined ? { nom: body.nom } : {}),
      ...(body.prenoms !== undefined ? { prenoms: body.prenoms } : {}),
      ...(body.sexe !== undefined ? { sexe: body.sexe } : {}),
      ...(body.telephone !== undefined ? { telephone: body.telephone } : {}),
      ...(body.section !== undefined ? { section: body.section } : {}),
      ...(body.nationalite !== undefined ? { nationalite: body.nationalite } : {}),
      ...(body.numeroCni !== undefined ? { numeroCni: body.numeroCni } : {}),
      ...(body.origine !== undefined ? { origine: body.origine } : {}),
      ...(body.actif !== undefined ? { actif: body.actif } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fournisseursTable.id, id),
        eq(fournisseursTable.cooperativeId, coopId(req))
      )
    )
    .returning();

  if (!updated) return res.status(404).json({ erreur: "Fournisseur introuvable" });
  return res.json(updated);
}

export async function updateAgrement(req: Request, res: Response) {
  const id = parseInt(String(req.params["id"] ?? "0"));
  const body = req.body as {
    statutAgrement: "agree" | "suspendu" | "expire";
    dateAgrement?: string;
    dateExpirationAgrement?: string;
  };

  if (!["agree", "suspendu", "expire"].includes(body.statutAgrement)) {
    return res.status(400).json({ erreur: "Statut agrément invalide" });
  }

  const [updated] = await db
    .update(fournisseursTable)
    .set({
      statutAgrement: body.statutAgrement,
      ...(body.dateAgrement !== undefined ? { dateAgrement: body.dateAgrement } : {}),
      ...(body.dateExpirationAgrement !== undefined ? { dateExpirationAgrement: body.dateExpirationAgrement } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(fournisseursTable.id, id),
        eq(fournisseursTable.cooperativeId, coopId(req)),
        eq(fournisseursTable.typeFournisseur, "pisteur")
      )
    )
    .returning();

  if (!updated) return res.status(404).json({ erreur: "Pisteur introuvable" });
  return res.json(updated);
}

export async function getRapportTypeFournisseur(req: Request, res: Response) {
  const cid = coopId(req);

  const result = await db
    .select({
      typeFournisseur: fournisseursTable.typeFournisseur,
      count: sql<number>`COUNT(${fournisseursTable.id})::int`,
      tonnageTotal: sql<number>`coalesce(sum(${livraisonsTable.poidsKg}::numeric), 0)::float`,
    })
    .from(fournisseursTable)
    .leftJoin(
      livraisonsTable,
      and(
        eq(livraisonsTable.membreId, fournisseursTable.membreId!),
        sql`${fournisseursTable.membreId} is not null`
      )
    )
    .where(
      and(
        eq(fournisseursTable.cooperativeId, cid),
        eq(fournisseursTable.actif, true)
      )
    )
    .groupBy(fournisseursTable.typeFournisseur);

  return res.json(result);
}
