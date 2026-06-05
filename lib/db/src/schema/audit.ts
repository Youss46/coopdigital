import { pgTable, bigserial, serial, integer, varchar, jsonb, text, inet, timestamp, index } from "drizzle-orm/pg-core";

export const auditTrailTable = pgTable(
  "audit_trail",
  {
    id:              bigserial("id", { mode: "number" }).primaryKey(),
    cooperativeId:   integer("cooperative_id"),
    userId:          integer("user_id"),
    userNom:         varchar("user_nom", { length: 255 }),
    userRole:        varchar("user_role", { length: 100 }),
    userIp:          varchar("user_ip", { length: 100 }),
    userAgent:       varchar("user_agent", { length: 500 }),
    action:          varchar("action", { length: 50 }).notNull(),
    module:          varchar("module", { length: 100 }).notNull(),
    entiteType:      varchar("entite_type", { length: 100 }),
    entiteId:        integer("entite_id"),
    valeursAvant:    jsonb("valeurs_avant"),
    valeursApres:    jsonb("valeurs_apres"),
    champsModifies:  text("champs_modifies").array(),
    description:     varchar("description", { length: 500 }),
    ipAddress:       inet("ip_address"),
    sessionId:       varchar("session_id", { length: 255 }),
    campagneId:      integer("campagne_id"),
    createdAt:       timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("idx_audit_cooperative").on(t.cooperativeId),
    index("idx_audit_user").on(t.userId),
    index("idx_audit_module").on(t.module),
    index("idx_audit_entite").on(t.entiteType, t.entiteId),
    index("idx_audit_date").on(t.createdAt),
    index("idx_audit_action").on(t.action),
  ],
);

export const sessionsUtilisateursTable = pgTable(
  "sessions_utilisateurs",
  {
    id:               serial("id").primaryKey(),
    cooperativeId:    integer("cooperative_id"),
    userId:           integer("user_id").notNull(),
    sessionToken:     varchar("session_token", { length: 255 }).notNull().unique(),
    ipAddress:        inet("ip_address"),
    userAgent:        varchar("user_agent", { length: 500 }),
    dateConnexion:    timestamp("date_connexion").notNull().defaultNow(),
    dateDeconnexion:  timestamp("date_deconnexion"),
    dureeSessionMin:  integer("duree_session_min"),
    nbActions:        integer("nb_actions").notNull().default(0),
    statut:           varchar("statut", { length: 20 }).notNull().default("active"),
  },
  (t) => [
    index("idx_sessions_user").on(t.userId),
    index("idx_sessions_coop").on(t.cooperativeId),
    index("idx_sessions_token").on(t.sessionToken),
    index("idx_sessions_date").on(t.dateConnexion),
  ],
);
