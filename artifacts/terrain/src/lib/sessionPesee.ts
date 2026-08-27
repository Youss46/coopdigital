import type { Fournisseur, SessionDetail } from "./types";

/** La tare métier est fixée à 1 kg par sac déclaré. */
export function tareFromNombreSacs(nombreSacs: string): string {
  const sacs = Number.parseInt(nombreSacs, 10);
  return Number.isFinite(sacs) && sacs >= 0 ? String(sacs) : "0";
}

type SessionIdentity = Pick<
  SessionDetail,
  "membreId" | "numeroSession" | "membreNom" | "membrePrenoms"
>;

/** Le membre affiché doit toujours provenir du détail de la session active. */
export function getFournisseurForSession(session: SessionIdentity): Fournisseur | null {
  if (session.membreId == null) return null;

  return {
    id: session.membreId,
    code: session.numeroSession,
    nom: session.membreNom ?? "",
    prenoms: session.membrePrenoms ?? "",
    telephone: "",
    section: null,
    village: null,
    typeMembre: "membre",
    avanceEnCours: 0,
    intrantsDus: 0,
    derniereLivraison: null,
  };
}

/** Une réception d'un membre délégué ne peut pas être pesée sans membre associé. */
export function isIncompleteMemberDelegateSession(
  session: Pick<SessionDetail, "operation" | "membreId"> | null,
): boolean {
  return session?.operation === "reception_membre_delegue" && session.membreId == null;
}