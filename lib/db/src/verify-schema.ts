import pg from "pg";
import {
  loadSchemaCheckManifest,
  validateSchemaCheckManifest,
  verifySchemaObjects,
} from "./schema-check.js";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL est requis");
  process.exit(1);
}
const manifest = loadSchemaCheckManifest();
validateSchemaCheckManifest(manifest);

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();

try {
  await verifySchemaObjects(client, manifest);
} catch (error) {
  console.error(`❌ ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}