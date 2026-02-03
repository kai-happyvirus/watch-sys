export const up = async (pool) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      email VARCHAR(255) PRIMARY KEY,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  await pool.query(`
    CREATE TABLE IF NOT EXISTS incidents (
      id VARCHAR(500) PRIMARY KEY,
      provider VARCHAR(50) NOT NULL,
      source VARCHAR(100) NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      status VARCHAR(50) NOT NULL,
      severity VARCHAR(20) NOT NULL,
      link TEXT,
      published_at TIMESTAMP,
      first_seen_at TIMESTAMP DEFAULT NOW(),
      last_updated_at TIMESTAMP DEFAULT NOW()
    )
  `);
  
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_incidents_provider ON incidents(provider)
  `);
  
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_incidents_published_at ON incidents(published_at DESC)
  `);
  
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_incidents_severity ON incidents(severity)
  `);
  
  console.log('✓ Migration 001_initial_schema applied');
};

export const down = async (pool) => {
  await pool.query(`DROP INDEX IF EXISTS idx_incidents_severity`);
  await pool.query(`DROP INDEX IF EXISTS idx_incidents_published_at`);
  await pool.query(`DROP INDEX IF EXISTS idx_incidents_provider`);
  await pool.query(`DROP TABLE IF EXISTS incidents`);
  await pool.query(`DROP TABLE IF EXISTS subscribers`);
  
  console.log('✓ Migration 001_initial_schema rolled back');
};
