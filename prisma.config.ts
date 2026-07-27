import "dotenv/config";
import { defineConfig } from "prisma/config";

// The datasource (url + directUrl) is declared in prisma/schema.prisma.
// Removing the datasource block here lets Prisma use the schema's directUrl
// for schema operations (db push / migrate) and the pooler url for queries.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  seed: {
    run: "npx tsx prisma/seed.ts",
  },
});
