import { type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable, sessionsUtilisateursTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";
import * as auditService from "../services/auditService";

export async function changerMotDePasse(req: Request, res: Response): Promise<void> {
  const userId = req.user?.id;
  if (!userId) { res.status(401).json({ erreur: "Non authentifié" }); return; }

  const { nouveauMotDePasse } = req.body as { nouveauMotDePasse?: string };
  if (!nouveauMotDePasse || nouveauMotDePasse.length < 8) {
    res.status(400).json({ erreur: "Le nouveau mot de passe doit contenir au moins 8 caractères" });
    return;
  }

  try {
    const hash = await bcrypt.hash(nouveauMotDePasse, 10);
    await db.update(usersTable)
      .set({ passwordHash: hash, motDePasseTemporaire: false })
      .where(eq(usersTable.id, userId));
    res.json({ message: "Mot de passe modifié avec succès" });
  } catch (err) {
    req.log.error({ err }, "Erreur changement mot de passe");
    res.status(500).json({ erreur: "Erreur interne" });
  }
}

function extractIp(req: Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0]!.trim();
  return req.socket.remoteAddress ?? "unknown";
}

export async function login(req: Request, res: Response): Promise<void> {
  const parse = LoginBody.safeParse(req.body);
  if (!parse.success) {
    res.status(400).json({ erreur: "Données invalides" });
    return;
  }

  const { email, motDePasse } = parse.data;
  const secret = process.env["JWT_SECRET"];

  if (!secret) {
    req.log.error("JWT_SECRET non configuré");
    res.status(500).json({ erreur: "Erreur de configuration du serveur" });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!user || !user.actif) {
      res.status(401).json({ erreur: "Email ou mot de passe incorrect" });
      return;
    }

    const motDePasseValide = await bcrypt.compare(motDePasse, user.passwordHash);
    if (!motDePasseValide) {
      res.status(401).json({ erreur: "Email ou mot de passe incorrect" });
      return;
    }

    const payload = {
      id: user.id,
      role: user.role,
      cooperativeId: user.cooperativeId ?? null,
    };

    const token = jwt.sign(payload, secret, { expiresIn: "8h" });

    const ip        = extractIp(req);
    const userAgent = req.headers["user-agent"]?.slice(0, 500);

    // Enregistrement de la session
    void db.insert(sessionsUtilisateursTable).values({
      cooperativeId: user.cooperativeId ?? 1,
      userId:        user.id,
      sessionToken:  token.slice(-64),
      ipAddress:     ip === "unknown" ? undefined : ip,
      userAgent,
      statut:        "active",
    }).catch(() => {/* silencieux */});

    // Audit LOGIN
    void auditService.logRaw({
      action:      "LOGIN",
      module:      "auth",
      userId:      user.id,
      userRole:    user.role,
      ip,
      userAgent,
      description: `Connexion de ${user.nom} (${user.role})`,
    });

    res.json({
      token,
      utilisateur: {
        id:                    user.id,
        nom:                   user.nom,
        prenoms:               user.prenoms,
        role:                  user.role,
        cooperativeId:         user.cooperativeId ?? null,
        motDePasseTemporaire:  user.motDePasseTemporaire ?? false,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Erreur lors de la connexion");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
