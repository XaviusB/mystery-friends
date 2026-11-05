import mysql from 'mysql2/promise';

export function createPool() {
  return mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'mystery',
    password: process.env.DB_PASSWORD || 'mystery',
    database: process.env.DB_NAME || 'mystery_friends',
    connectionLimit: 10,
    charset: 'utf8mb4',
  });
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS event_groups (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    admin_token CHAR(44) NOT NULL UNIQUE,
    join_token CHAR(22) NOT NULL UNIQUE,
    drawn TINYINT(1) NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  ) CHARACTER SET utf8mb4`,
  `CREATE TABLE IF NOT EXISTS participants (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    name VARCHAR(100) NOT NULL,
    token CHAR(22) NOT NULL UNIQUE,
    target_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (group_id) REFERENCES event_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (target_id) REFERENCES participants(id) ON DELETE SET NULL
  ) CHARACTER SET utf8mb4`,
  `CREATE TABLE IF NOT EXISTS exclusions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    group_id INT NOT NULL,
    a_id INT NOT NULL,
    b_id INT NOT NULL,
    UNIQUE KEY uniq_pair (a_id, b_id),
    FOREIGN KEY (group_id) REFERENCES event_groups(id) ON DELETE CASCADE,
    FOREIGN KEY (a_id) REFERENCES participants(id) ON DELETE CASCADE,
    FOREIGN KEY (b_id) REFERENCES participants(id) ON DELETE CASCADE
  ) CHARACTER SET utf8mb4`,
];

export async function initSchema(pool, retries = 30) {
  for (let i = 0; ; i++) {
    try {
      for (const sql of SCHEMA) await pool.query(sql);
      // Migration: admin_token was CHAR(22) before admin links became 44 chars long.
      await pool.query('ALTER TABLE event_groups MODIFY admin_token CHAR(44) NOT NULL');
      return;
    } catch (err) {
      if (i >= retries) throw err;
      console.log(`Waiting for database (${err.code || err.message})...`);
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
}
