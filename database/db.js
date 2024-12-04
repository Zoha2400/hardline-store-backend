import pkg from "pg";
const { Pool } = pkg;

export const pool = new Pool({
  user: process.env.POSTGRES_USER,
  host: "hardline_postgres",
  database: process.env.POSTGRES_DB,
  password: process.env.POSTGRES_PASSWORD,
  port: 5432,
  max: 1000,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  keepAlive: true,
  ssl: false,
});

pool.on("connect", (client) => {
  console.log("Client connected to the database");
});

pool.off("disconnect", () => {
  console.log("Client disconnected from the database");
});

pool.on("error", (err, client) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});
