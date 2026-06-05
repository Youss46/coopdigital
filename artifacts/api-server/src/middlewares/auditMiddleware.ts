import { type Request, type Response, type NextFunction, type RequestHandler } from "express";
import * as auditService from "../services/auditService";

export type AuditAction = auditService.AuditAction;

/**
 * Middleware d'audit automatique.
 * Capture le corps de la requête et la réponse, puis enregistre l'audit.
 * Ne bloque jamais l'opération métier en cas d'erreur.
 */
export function auditMiddleware(
  module: string,
  action?: AuditAction,
  opts?: {
    entiteIdParam?: string;   // ex: "id" pour req.params.id
    entiteType?: string;
    getDescription?: (req: Request, statusCode: number) => string;
  },
): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const requestBody = req.body ? { ...req.body } : undefined;

    // Supprimer les mots de passe du log
    if (requestBody?.motDePasse) delete requestBody.motDePasse;
    if (requestBody?.password)   delete requestBody.password;

    // Déterminer l'action depuis la méthode HTTP si non précisée
    const resolvedAction: AuditAction = action ?? (
      req.method === "POST"   ? "CREATE" :
      req.method === "PUT"    ? "UPDATE" :
      req.method === "PATCH"  ? "UPDATE" :
      req.method === "DELETE" ? "DELETE" : "UPDATE"
    );

    let responseBody: unknown;

    // Intercepte res.json pour capturer la réponse
    const originalJson = res.json.bind(res);
    res.json = function (body: unknown) {
      responseBody = body;
      return originalJson(body);
    };

    // Log après envoi de la réponse
    res.on("finish", () => {
      const statusCode = res.statusCode;
      if (statusCode >= 200 && statusCode < 300) {
        const entiteId = opts?.entiteIdParam
          ? parseInt(String(req.params[opts.entiteIdParam] ?? "0")) || undefined
          : undefined;

        const description = opts?.getDescription
          ? opts.getDescription(req, statusCode)
          : undefined;

        const valeursApres =
          resolvedAction === "DELETE" ? undefined :
          responseBody && typeof responseBody === "object" ? (responseBody as Record<string, unknown>) :
          requestBody;

        void auditService.log(req, {
          action:      resolvedAction,
          module,
          entiteType:  opts?.entiteType,
          entiteId,
          valeursAvant: resolvedAction === "CREATE" ? null : requestBody,
          valeursApres,
          description,
        });
      }
    });

    next();
  };
}
