import { db, campagnesTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";

export class CampagneFermeeError extends Error {
  readonly status = 409;
  readonly erreur: string;
  constructor(message = "Cette campagne est clôturée. Aucune modification n'est possible.") {
    super(message);
    this.name = "CampagneFermeeError";
    this.erreur = message;
  }
}

export async function assertCampagneOuverte(cooperativeId: number, campagneId: number): Promise<void> {
  const [camp] = await db
    .select({ statut: campagnesTable.statut })
    .from(campagnesTable)
    .where(and(eq(campagnesTable.id, campagneId), eq(campagnesTable.cooperativeId, cooperativeId)))
    .limit(1);
  if (!camp) throw new CampagneFermeeError("Campagne introuvable.");
  if (camp.statut === "fermee") throw new CampagneFermeeError();
}

export async function assertCampagneActiveExiste(cooperativeId: number): Promise<void> {
  const [camp] = await db
    .select({ id: campagnesTable.id })
    .from(campagnesTable)
    .where(and(eq(campagnesTable.cooperativeId, cooperativeId), eq(campagnesTable.statut, "ouverte")))
    .limit(1);
  if (!camp) throw new CampagneFermeeError("Aucune campagne active. Veuillez ouvrir une campagne.");
}
