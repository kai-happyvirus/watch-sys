import pg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Create migrations tracking table
async function initMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMP DEFAULT NOW()
    )
  `);
}

// Get list of applied migrations
async function getAppliedMigrations() {
  const result = await pool.query(
    'SELECT name FROM schema_migrations ORDER BY id'
  );
  return result.rows.map(row => row.name);
}

// Get all migration files
async function getMigrationFiles() {
  const migrationsDir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.js'))
    .sort();
  return files;
}

// Run pending migrations
async function runMigrations() {
  try {
    await initMigrationsTable();
    
    const appliedMigrations = await getAppliedMigrations();
    const migrationFiles = await getMigrationFiles();
    
    const pendingMigrations = migrationFiles.filter(
      file => !appliedMigrations.includes(file)
    );
    
    if (pendingMigrations.length === 0) {
      console.log('✓ No pending migrations');
      return;
    }
    
    console.log(`📦 Running ${pendingMigrations.length} pending migration(s)...\n`);
    
    for (const file of pendingMigrations) {
      const migrationPath = path.join(__dirname, 'migrations', file);
      const migration = await import(migrationPath);
      
      console.log(`⏳ Applying ${file}...`);
      await migration.up(pool);
      
      await pool.query(
        'INSERT INTO schema_migrations (name) VALUES ($1)',
        [file]
      );
    }
    
    console.log('\n✅ All migrations applied successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Rollback last migration
async function rollbackMigration() {
  try {
    await initMigrationsTable();
    
    const result = await pool.query(
      'SELECT name FROM schema_migrations ORDER BY id DESC LIMIT 1'
    );
    
    if (result.rows.length === 0) {
      console.log('✓ No migrations to rollback');
      return;
    }
    
    const lastMigration = result.rows[0].name;
    const migrationPath = path.join(__dirname, 'migrations', lastMigration);
    const migration = await import(migrationPath);
    
    console.log(`⏳ Rolling back ${lastMigration}...`);
    await migration.down(pool);
    
    await pool.query(
      'DELETE FROM schema_migrations WHERE name = $1',
      [lastMigration]
    );
    
    console.log('✅ Rollback successful');
  } catch (error) {
    console.error('❌ Rollback failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Show migration status
async function showStatus() {
  try {
    await initMigrationsTable();
    
    const appliedMigrations = await getAppliedMigrations();
    const migrationFiles = await getMigrationFiles();
    
    console.log('\n📋 Migration Status:\n');
    
    for (const file of migrationFiles) {
      const status = appliedMigrations.includes(file) ? '✓ Applied' : '✗ Pending';
      console.log(`${status}  ${file}`);
    }
    
    console.log('');
  } catch (error) {
    console.error('❌ Failed to show status:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// CLI
const command = process.argv[2];

switch (command) {
  case 'up':
    runMigrations();
    break;
  case 'down':
    rollbackMigration();
    break;
  case 'status':
    showStatus();
    break;
  default:
    console.log(`
Usage:
  npm run migrate up      - Run pending migrations
  npm run migrate down    - Rollback last migration
  npm run migrate status  - Show migration status
    `);
    process.exit(1);
}
