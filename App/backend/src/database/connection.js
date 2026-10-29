import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ 
  path: path.resolve(__dirname, '../../../docker/.env'),
});

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  max: 10, // Maximum number of connections
  idleTimeoutMillis: 30000,     //Time after that an idle connection is deleted
});

pool.on("error", (err)=>{
    console.log("Error on Postgres:", err);
    process.exit(-1);
})

export default pool;