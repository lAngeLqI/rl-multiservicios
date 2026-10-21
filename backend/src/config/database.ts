import { Pool } from 'pg';

// 🔥 URL puesta directamente para evitar problemas con el archivo .env
const pool = new Pool({
    connectionString: 'postgresql://postgres.ioxgnsuscomqjgfslwoa:RlApp2024Segura@aws-0-us-east-1.pooler.supabase.com:6543/postgres'
});

export default pool;