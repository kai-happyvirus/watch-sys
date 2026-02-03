# Database Migrations

## Usage

```bash
# Run pending migrations
npm --prefix server run migrate up

# Rollback last migration
npm --prefix server run migrate down

# Check migration status
npm --prefix server run migrate status
```

## Creating a New Migration

1. Create a new file in this directory: `00X_description.js`
2. Export `up` and `down` functions:

```javascript
export const up = async (pool) => {
  // Apply changes
  await pool.query(`
    ALTER TABLE incidents ADD COLUMN new_field VARCHAR(100)
  `);
  console.log('✓ Migration 00X_description applied');
};

export const down = async (pool) => {
  // Revert changes
  await pool.query(`
    ALTER TABLE incidents DROP COLUMN new_field
  `);
  console.log('✓ Migration 00X_description rolled back');
};
```

## Examples

### Add a column
```javascript
export const up = async (pool) => {
  await pool.query(`
    ALTER TABLE incidents ADD COLUMN priority INTEGER DEFAULT 0
  `);
};

export const down = async (pool) => {
  await pool.query(`
    ALTER TABLE incidents DROP COLUMN priority
  `);
};
```

### Create an index
```javascript
export const up = async (pool) => {
  await pool.query(`
    CREATE INDEX idx_incidents_status ON incidents(status)
  `);
};

export const down = async (pool) => {
  await pool.query(`
    DROP INDEX idx_incidents_status
  `);
};
```

### Modify a column
```javascript
export const up = async (pool) => {
  await pool.query(`
    ALTER TABLE incidents ALTER COLUMN summary TYPE VARCHAR(1000)
  `);
};

export const down = async (pool) => {
  await pool.query(`
    ALTER TABLE incidents ALTER COLUMN summary TYPE TEXT
  `);
};
```

## Migration Naming Convention

- Use sequential numbers: `001_`, `002_`, `003_`
- Use descriptive names: `add_priority_field`, `create_notifications_table`
- Use underscores for spaces
- Always include both `up` and `down` functions
