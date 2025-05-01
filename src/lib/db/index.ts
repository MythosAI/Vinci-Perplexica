import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { Client } from 'pg';

const client = new Client({
  host: process.env.DB_HOST,       // or your DB host
  port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : undefined,
  user: process.env.DB_USER,       // your PostgreSQL username
  password: process.env.DB_PWD,   // your PostgreSQL password
  database: process.env.DB_NAME, // your target database
  ssl: {
    rejectUnauthorized: false, // ⬅️ allow self-signed certs
  },
});

await client.connect();

const db = drizzle(client, {
  schema: schema,
});

export default db;
