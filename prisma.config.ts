import "dotenv/config";
import { defineConfig } from "prisma/config";

// The datasource (url + directUrl) is declared in prisma/schema.prisma.
// Removing the datasource block here lets Prisma use the schema's directUrl
// for schema operations (db push / migrate) and the pooler url for queries.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    // In this Prisma version the seed command lives under `migrations` and is a
    // plain string — there is no top-level `seed` key.
    seed: "npx tsx prisma/seed.ts",
  },
});
