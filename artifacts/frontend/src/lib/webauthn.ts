import {
  startRegistration,
  startAuthentication,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";

const BASE = import.meta.env.VITE_API_URL ?? "";
const tok = () => localStorage.getItem("coop_token") ?? "";

export interface BiometricCredential {
  id: number;
  nomAppareil: string | null;
  deviceType: string | null;
  createdAt: string;
  derniereUtilisation: string | null;
}

class WebAuthnError extends Error {}

async function parseErreur(r: Response): Promise<string> {
  try {
    const d = (await r.json()) as { erreur?: string };
    return d.erreur ?? "Une erreur est survenue";
  } catch {
    return "Une erreur est survenue";
  }
}

export function biometrieDisponible(): boolean {
  return browserSupportsWebAuthn();
}

export async function authentificateurPlateformeDisponible(): Promise<boolean> {
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export async function enregistrerBiometrie(nomAppareil?: string): Promise<void> {
  const optionsRes = await fetch(`${BASE}/api/auth/webauthn/register/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
  });
  if (!optionsRes.ok) throw new WebAuthnError(await parseErreur(optionsRes));
  const options = await optionsRes.json();

  const attestation = await startRegistration({ optionsJSON: options });

  const verifyRes = await fetch(`${BASE}/api/auth/webauthn/register/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok()}` },
    body: JSON.stringify({ response: attestation, nomAppareil }),
  });
  if (!verifyRes.ok) throw new WebAuthnError(await parseErreur(verifyRes));
}

export interface ConnexionBiometriqueResult {
  token: string;
  utilisateur: {
    id: number;
    nom: string;
    prenoms: string;
    role: string;
    cooperativeId: number | null;
    motDePasseTemporaire: boolean;
  };
}

export async function connexionBiometrique(email: string): Promise<ConnexionBiometriqueResult> {
  const optionsRes = await fetch(`${BASE}/api/auth/webauthn/login/options`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!optionsRes.ok) throw new WebAuthnError(await parseErreur(optionsRes));
  const options = await optionsRes.json();

  const assertion = await startAuthentication({ optionsJSON: options });

  const verifyRes = await fetch(`${BASE}/api/auth/webauthn/login/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, response: assertion }),
  });
  if (!verifyRes.ok) throw new WebAuthnError(await parseErreur(verifyRes));
  return (await verifyRes.json()) as ConnexionBiometriqueResult;
}

export async function listerCredentialsBiometriques(): Promise<BiometricCredential[]> {
  const r = await fetch(`${BASE}/api/auth/webauthn/credentials`, {
    headers: { Authorization: `Bearer ${tok()}` },
  });
  if (!r.ok) throw new WebAuthnError(await parseErreur(r));
  const d = (await r.json()) as { credentials: BiometricCredential[] };
  return d.credentials;
}

export async function supprimerCredentialBiometrique(id: number): Promise<void> {
  const r = await fetch(`${BASE}/api/auth/webauthn/credentials/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${tok()}` },
  });
  if (!r.ok) throw new WebAuthnError(await parseErreur(r));
}
