import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { fournisseursTable, membresTable } from "@workspace/db";
import { eq, and, or, ilike, desc } from "drizzle-orm";
import { sql } from "drizzle-orm";

const COOP_ID = 1;

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

  const fournisseurs = await db.query.fournisseursTable.findMany({
    where: and(
      eq(fournisseursTable.cooperativeId, COOP_ID),
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
    ),
    orderBy: [desc(fournisseursTable.createdAt)],
  });

  return res.json(fournisseurs);
}

export async function searchFournisseurs(req: Request, res: Response) {
  const { q } = req.query as { q?: string };
  if (!q || q.length < 2) return res.json([]);

  const results = await db.query.fournisseursTable.findMany({
    where: and(
      eq(fournisseursTable.cooperativeId, COOP_ID),
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
      eq(fournisseursTable.cooperativeId, COOP_ID)
    ),
  });

  if (!fournisseur) return res.status(404).json({ erreur: "Fournisseur introuvable" });
  return res.json(fournisseur);
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
  };

  if (!body.typeFournisseur || !body.nom) {
    return res.status(400).json({ erreur: "Données manquantes" });
  }
  if (body.typeFournisseur === "membre") {
    return res.status(400).json({ erreur: "Utiliser /depuis-membre pour les membres" });
  }

  const type = body.typeFournisseur as "pisteur" | "externe";
  const annee = new Date().getFullYear();
  const countRes = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fournisseursTable)
    .where(
      and(
        eq(fournisseursTable.cooperativeId, COOP_ID),
        eq(fournisseursTable.typeFournisseur, type)
      )
    );
  const seq = Number(countRes[0]?.count ?? 0) + 1;
  const code = genCode(type, annee, seq);

  const [fournisseur] = await db
    .insert(fournisseursTable)
    .values({
      cooperativeId: COOP_ID,
      typeFournisseur: type,
      code,
      nom: body.nom,
      prenoms: body.prenoms,
      sexe: body.sexe,
      telephone: body.telephone,
      section: body.section,
      nationalite: body.nationalite ?? "Ivoirienne",
      numeroCni: body.numeroCni,
      origine: body.origine,
      dateAdhesion: body.dateAdhesion,
      lieuNaissance: body.lieuNaissance,
    })
    .returning();

  return res.status(201).json(fournisseur);
}

export async function createFournisseurDepuisMembre(req: Request, res: Response) {
  const membreId = parseInt(String(req.params["id"] ?? "0"));

  const membre = await db.query.membresTable.findFirst({
    where: and(
      eq(membresTable.id, membreId),
      eq(membresTable.cooperativeId, COOP_ID)
    ),
  });
  if (!membre) return res.status(404).json({ erreur: "Membre introuvable" });

  const existant = await db.query.fournisseursTable.findFirst({
    where: and(
      eq(fournisseursTable.membreId, membreId),
      eq(fournisseursTable.cooperativeId, COOP_ID)
    ),
  });
  if (existant) return res.json(existant);

  const annee = new Date().getFullYear();
  const countRes = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(fournisseursTable)
    .where(
      and(
        eq(fournisseursTable.cooperativeId, COOP_ID),
        eq(fournisseursTable.typeFournisseur, "membre")
      )
    );
  const seq = Number(countRes[0]?.count ?? 0) + 1;
  const code = genCode("membre", annee, seq);

  const [fournisseur] = await db
    .insert(fournisseursTable)
    .values({
      cooperativeId: COOP_ID,
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
        eq(fournisseursTable.cooperativeId, COOP_ID)
      )
    )
    .returning();

  if (!updated) return res.status(404).json({ erreur: "Fournisseur introuvable" });
  return res.json(updated);
}

export async function getRapportTypeFournisseur(req: Request, res: Response) {
  const result = await db
    .select({
      typeFournisseur: fournisseursTable.typeFournisseur,
      count: sql<number>`COUNT(*)`,
    })
    .from(fournisseursTable)
    .where(
      and(
        eq(fournisseursTable.cooperativeId, COOP_ID),
        eq(fournisseursTable.actif, true)
      )
    )
    .groupBy(fournisseursTable.typeFournisseur);

  return res.json(result);
}
