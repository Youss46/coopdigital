import { type Request, type Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { LoginBody } from "@workspace/api-zod";

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

    res.json({
      token,
      utilisateur: {
        id: user.id,
        nom: user.nom,
        prenoms: user.prenoms,
        role: user.role,
        cooperativeId: user.cooperativeId ?? null,
      },
    });
  } catch (err) {
    req.log.error({ err }, "Erreur lors de la connexion");
    res.status(500).json({ erreur: "Erreur interne du serveur" });
  }
}
