import { type Request, type Response } from "express";
import jwt from "jsonwebtoken";
import { eq, and } from "drizzle-orm";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type WebAuthnCredential,
} from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { db, usersTable, webauthnCredentialsTable, sessionsUtilisateursTable } from "@workspace/db";
import * as auditService from "../services/auditService";
import {
  setRegistrationChallenge,
  popRegistrationChallenge,
  setLoginChallenge,
  popLoginChallenge,
  getRpConfig,
} from "../services/webauthnService";

function extractIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

export async function getRegistrationOptions(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
    if (!user) { res.status(404).json({ erreur: "Utilisateur introuvable" }); return; }

    const existing = await db.select().from(webauthnCredentialsTable).where(eq(webauthnCredentialsTable.userId, userId));

    const { rpID, rpName } = getRpConfig(req);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userDisplayName: `${user.prenoms} ${user.nom}`,
      attestationType: "none",
      excludeCredentials: existing.map((c) => ({
        id: c.credentialId,
        transports: c.transports ? (JSON.parse(c.transports) as ("ble" | "internal" | "nfc" | "usb" | "cable" | "hybrid" | "smart-card")[]) : undefined,
      })),
      authenticatorSelection: {
        residentKey: "preferred",
        userVerification: "preferred",
        authenticatorAttachment: "platform",
      },
    });

    setRegistrationChallenge(userId, options.challenge);
    res.json(options);
  } catch (err) {
    req.log.error({ err }, "Erreur génération options WebAuthn (inscription)");
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({ erreur: `Erreur interne : ${detail}` });
  }
}

export async function verifyRegistration(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  const { response, nomAppareil } = req.body as { response?: RegistrationResponseJSON; nomAppareil?: string };
  if (!response) { res.status(400).json({ erreur: "Réponse d'inscription manquante" }); return; }

  const expectedChallenge = popRegistrationChallenge(userId);
  if (!expectedChallenge) { res.status(400).json({ erreur: "Session d'inscription expirée, veuillez réessayer" }); return; }

  try {
    const { rpID, origin } = getRpConfig(req);

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      res.status(400).json({ erreur: "Échec de la vérification de l'inscription" });
      return;
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    await db.insert(webauthnCredentialsTable).values({
      userId,
      credentialId: credential.id,
      publicKey: isoBase64URL.fromBuffer(credential.publicKey),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: credential.transports ? JSON.stringify(credential.transports) : null,
      nomAppareil: nomAppareil?.slice(0, 100) || "Appareil biométrique",
    });

    void auditService.logRaw({
      action: "WEBAUTHN_REGISTER",
      module: "auth",
      userId,
      userRole: req.user?.role,
      ip: extractIp(req),
      userAgent: req.headers["user-agent"]?.slice(0, 500),
      description: "Enregistrement d'un identifiant biométrique",
    });

    res.json({ message: "Authentification biométrique activée avec succès" });
  } catch (err) {
    req.log.error({ err }, "Erreur vérification WebAuthn (inscription)");
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({ erreur: `Erreur interne : ${detail}` });
  }
}

export async function getAuthenticationOptions(req: Request, res: Response): Promise<void> {
  const { email } = req.body as { email?: string };
  if (!email) { res.status(400).json({ erreur: "Email requis" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);

    // Réponse générique même si l'utilisateur n'existe pas ou n'a pas de credential, pour éviter l'énumération de comptes
    const { rpID } = getRpConfig(req);

    let allowCredentials: { id: string; transports?: ("ble" | "internal" | "nfc" | "usb" | "cable" | "hybrid" | "smart-card")[] }[] = [];
    if (user && user.actif) {
      const credentials = await db.select().from(webauthnCredentialsTable).where(eq(webauthnCredentialsTable.userId, user.id));
      allowCredentials = credentials.map((c) => ({
        id: c.credentialId,
        transports: c.transports ? (JSON.parse(c.transports) as ("ble" | "internal" | "nfc" | "usb" | "cable" | "hybrid" | "smart-card")[]) : undefined,
      }));
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: allowCredentials.length > 0 ? allowCredentials : undefined,
      userVerification: "preferred",
    });

    setLoginChallenge(email, options.challenge);
    res.json(options);
  } catch (err) {
    req.log.error({ err }, "Erreur génération options WebAuthn (connexion)");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

export async function verifyAuthentication(req: Request, res: Response): Promise<void> {
  const { email, response } = req.body as { email?: string; response?: AuthenticationResponseJSON };
  if (!email || !response) { res.status(400).json({ erreur: "Données invalides" }); return; }

  const secret = process.env["JWT_SECRET"];
  if (!secret) {
    req.log.error("JWT_SECRET non configuré");
    res.status(500).json({ erreur: "Erreur de configuration du serveur" });
    return;
  }

  const expectedChallenge = popLoginChallenge(email);
  if (!expectedChallenge) { res.status(400).json({ erreur: "Session de connexion expirée, veuillez réessayer" }); return; }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email)).limit(1);
    if (!user || !user.actif) { res.status(401).json({ erreur: "Authentification biométrique échouée" }); return; }

    const [storedCredential] = await db
      .select()
      .from(webauthnCredentialsTable)
      .where(and(eq(webauthnCredentialsTable.userId, user.id), eq(webauthnCredentialsTable.credentialId, response.id)));

    if (!storedCredential) { res.status(401).json({ erreur: "Identifiant biométrique inconnu" }); return; }

    const { rpID, origin } = getRpConfig(req);

    const credential: WebAuthnCredential = {
      id: storedCredential.credentialId,
      publicKey: isoBase64URL.toBuffer(storedCredential.publicKey),
      counter: storedCredential.counter,
      transports: storedCredential.transports
        ? (JSON.parse(storedCredential.transports) as ("ble" | "internal" | "nfc" | "usb" | "cable" | "hybrid" | "smart-card")[])
        : undefined,
    };

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential,
    });

    if (!verification.verified) {
      res.status(401).json({ erreur: "Authentification biométrique échouée" });
      return;
    }

    await db
      .update(webauthnCredentialsTable)
      .set({ counter: verification.authenticationInfo.newCounter, derniereUtilisation: new Date() })
      .where(eq(webauthnCredentialsTable.id, storedCredential.id));

    const payload = {
      id: user.id,
      role: user.role,
      cooperativeId: user.cooperativeId ?? null,
    };
    const token = jwt.sign(payload, secret, { expiresIn: "8h" });

    const ip = extractIp(req);
    const userAgent = req.headers["user-agent"]?.slice(0, 500);

    if (user.cooperativeId) {
      void db.insert(sessionsUtilisateursTable).values({
        cooperativeId: user.cooperativeId,
        userId: user.id,
        sessionToken: token.slice(-64),
        ipAddress: ip === "unknown" ? undefined : ip,
        userAgent,
        statut: "active",
      }).catch(() => {/* silencieux */});
    }

    void auditService.logRaw({
      action: "LOGIN",
      module: "auth",
      userId: user.id,
      userRole: user.role,
      ip,
      userAgent,
      description: `Connexion biométrique de ${user.nom} (${user.role})`,
    });

    res.json({
      token,
      utilisateur: {
        id: user.id,
        nom: user.nom,
        prenoms: user.prenoms,
        role: user.role,
        cooperativeId: user.cooperativeId ?? null,
        motDePasseTemporaire: user.motDePasseTemporaire ?? false,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Erreur vérification WebAuthn (connexion)");
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({ erreur: `Erreur interne : ${detail}` });
  }
}

export async function listCredentials(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  try {
    const credentials = await db
      .select({
        id: webauthnCredentialsTable.id,
        nomAppareil: webauthnCredentialsTable.nomAppareil,
        deviceType: webauthnCredentialsTable.deviceType,
        createdAt: webauthnCredentialsTable.createdAt,
        derniereUtilisation: webauthnCredentialsTable.derniereUtilisation,
      })
      .from(webauthnCredentialsTable)
      .where(eq(webauthnCredentialsTable.userId, userId));

    res.json({ credentials });
  } catch (err) {
    req.log.error({ err }, "Erreur listage des identifiants biométriques");
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({ erreur: `Erreur interne : ${detail}` });
  }
}

export async function deleteCredential(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  const credentialId = Number(req.params["id"]);
  if (!Number.isFinite(credentialId)) { res.status(400).json({ erreur: "Identifiant invalide" }); return; }

  try {
    const deleted = await db
      .delete(webauthnCredentialsTable)
      .where(and(eq(webauthnCredentialsTable.id, credentialId), eq(webauthnCredentialsTable.userId, userId)))
      .returning({ id: webauthnCredentialsTable.id });

    if (deleted.length === 0) { res.status(404).json({ erreur: "Identifiant introuvable" }); return; }

    void auditService.logRaw({
      action: "WEBAUTHN_DELETE",
      module: "auth",
      userId,
      userRole: req.user?.role,
      ip: extractIp(req),
      userAgent: req.headers["user-agent"]?.slice(0, 500),
      description: "Suppression d'un identifiant biométrique",
    });

    res.json({ message: "Identifiant biométrique supprimé" });
  } catch (err) {
    req.log.error({ err }, "Erreur suppression identifiant biométrique");
    const detail = err instanceof Error ? err.message : String(err);
    res.status(500).json({ erreur: `Erreur interne : ${detail}` });
  }
}
