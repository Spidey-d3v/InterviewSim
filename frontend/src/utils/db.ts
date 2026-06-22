import { Pool } from 'pg';

// Using the same database connection string from the root .env
const DATABASE_URL = process.env.DATABASE_URL?.replace('postgresql+psycopg', 'postgresql') 
  || 'postgresql://postgres:UnOM%40752@localhost:4321/lattice';

const pool = new Pool({
  connectionString: DATABASE_URL,
});

export default pool;
