import pkg from 'pg';
const { Pool } = pkg;

export const pool = new Pool({
    user: process.env.POSTGRES_USER,
    host: 'hardline_postgres',
    database: process.env.POSTGRES_DB,
    password: process.env.POSTGRES_PASSWORD,
    port: 5432,
});


