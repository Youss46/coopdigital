import { type Request, type Response } from "express";
import { db } from "@workspace/db";
import { systemBannerTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export async function getSystemBannerHandler(_req: Request, res: Response): Promise<void> {
  try {
    const [banner] = await db.select().from(systemBannerTable).limit(1);
    res.json({ actif: banner?.actif ?? false, message: banner?.message ?? null });
  } catch (err) {
    res.json({ actif: false, message: null });
  }
}

export async function updateSystemBannerHandler(req: Request, res: Response): Promise<void> {
  const { actif, message } = req.body as { actif: boolean; message: string | null };
  try {
    const [existing] = await db.select().from(systemBannerTable).limit(1);
    if (existing) {
      await db.update(systemBannerTable)
        .set({ actif: !!actif, message: message ?? null, updatedAt: new Date() })
        .where(eq(systemBannerTable.id, existing.id));
    } else {
      await db.insert(systemBannerTable).values({ actif: !!actif, message: message ?? null });
    }
    res.json({ ok: true });
  } catch (err) {
    req.log.error({ err }, "Erreur mise à jour bannière système");
    res.status(500).json({ erreur: "Erreur serveur" });
  }
}
