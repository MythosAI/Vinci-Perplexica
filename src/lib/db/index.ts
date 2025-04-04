import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import { Client } from 'pg';

const client = new Client({
  host: process.env.DB_HOST,       // or your DB host
  port: process.env.DB_PORT,              // default PostgreSQL port
  user: process.env.DB_USER,       // your PostgreSQL username
  password: process.env.DB_PWD,   // your PostgreSQL password
  database: process.env.DB_NAME, // your target database
  ssl: {
    rejectUnauthorized: false, // ⬅️ allow self-signed certs
  },
});
console.log('DB_HOST:', process.env.DB_PWD);

await client.connect();
console.log('1_OPENAI_API_KEY:', process.env.OPENAI_API_KEY);


const db = drizzle(client, {
  schema: schema,
});

export default db;
