import { defineConfig } from 'drizzle-kit';

function createDbUrl(): string {
  const {
    DB_USER,
    DB_PWD,
    DB_HOST,
    DB_PORT,
    DB_NAME,
  } = process.env;

  if (!DB_USER || !DB_PWD || !DB_HOST || !DB_PORT || !DB_NAME) {
    throw new Error('Missing one or more required database environment variables');
  }

  return `postgres://${DB_USER}:${DB_PWD}@${DB_HOST}:${DB_PORT}/${DB_NAME}`;
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/lib/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: createDbUrl(),
  },
});
