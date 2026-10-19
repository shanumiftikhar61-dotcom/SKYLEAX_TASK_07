import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const dbPath = process.env.SHOP_EASE_DB_PATH || path.join(__dirname, 'data', 'shop-ease.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const normalizeSqliteRow = (value) => {
  if (value === null || value === undefined) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(normalizeSqliteRow);
  }

  if (typeof value === 'object' && Object.getPrototypeOf(value) === null) {
    return Object.fromEntries(Object.entries(value));
  }

  return value;
};

const db = new Proxy(new DatabaseSync(dbPath), {
  get(target, property, receiver) {
    const value = Reflect.get(target, property, receiver);

    if (typeof value !== 'function') {
      return value;
    }

    if (property === 'prepare') {
      return (...args) => {
        const statement = Reflect.apply(target.prepare, target, args);
        return new Proxy(statement, {
          get(statementTarget, statementProperty, statementReceiver) {
            const statementValue = Reflect.get(statementTarget, statementProperty, statementReceiver);
            if (typeof statementValue !== 'function') {
              return statementValue;
            }

            if (statementProperty === 'get') {
              return (...callArgs) => normalizeSqliteRow(Reflect.apply(statementValue, statementTarget, callArgs));
            }

            if (statementProperty === 'all') {
              return (...callArgs) => {
                const rows = Reflect.apply(statementValue, statementTarget, callArgs);
                return Array.isArray(rows) ? rows.map(normalizeSqliteRow) : rows;
              };
            }

            return (...callArgs) => Reflect.apply(statementValue, statementTarget, callArgs);
          },
        });
      };
    }

    return (...args) => Reflect.apply(value, target, args);
  },
});

db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL COLLATE NOCASE UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL CHECK(price >= 0),
    category_id INTEGER NOT NULL,
    stock_quantity INTEGER NOT NULL CHECK(stock_quantity >= 0),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
  );
`);

const categoryColumns = db.prepare('PRAGMA table_info(categories)').all();
if (!categoryColumns.some((column) => column.name === 'description')) {
  db.exec("ALTER TABLE categories ADD COLUMN description TEXT NOT NULL DEFAULT ''");
}

const duplicateCategoryGroups = db.prepare(`
  SELECT lower(name) AS normalized_name, MIN(id) AS keep_id
  FROM categories
  GROUP BY lower(name)
  HAVING COUNT(*) > 1
`).all();

for (const group of duplicateCategoryGroups) {
  const duplicates = db.prepare(`
    SELECT id FROM categories
    WHERE lower(name) = ? AND id != ?
  `).all(group.normalized_name, group.keep_id);

  for (const duplicate of duplicates) {
    db.prepare('UPDATE products SET category_id = ? WHERE category_id = ?').run(group.keep_id, duplicate.id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(duplicate.id);
  }
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_categories_name_nocase
    ON categories(name COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_products_category_id
    ON products(category_id);
  CREATE INDEX IF NOT EXISTS idx_products_name_nocase
    ON products(name COLLATE NOCASE);
`);

export function initializeDatabase() {
  const seedCategories = [
    ['Electronics', 'Devices and everyday accessories.'],
    ['Home & Living', 'Useful pieces for comfortable spaces.'],
    ['Office Supplies', 'Tools for productive workdays.'],
    ['Food & Beverage', 'Pantry staples and refreshments.'],
    ['General', 'Products without a dedicated category.'],
  ];

  const seedProducts = [
    ['Classic Coffee Beans', 'Premium whole-bean coffee for daily brewing.', 18.5, 'Food & Beverage', 42],
    ['Classic Desk Lamp', 'Minimal, adjustable lighting for workspaces.', 32, 'Home & Living', 12],
    ['Daily Notebook Set', 'A pack of durable notebooks for everyday planning.', 14.75, 'Office Supplies', 28],
    ['Wireless Earbuds', 'Compact Bluetooth earbuds with a charging case.', 59.99, 'Electronics', 16],
  ];

  db.exec('BEGIN IMMEDIATE');
  try {
    const insertCategory = db.prepare(`
      INSERT OR IGNORE INTO categories (name, description)
      VALUES (?, ?)
    `);
    for (const category of seedCategories) {
      insertCategory.run(...category);
    }

    const generalCategory = db.prepare(`
      SELECT id FROM categories WHERE lower(trim(name)) = 'general'
    `).get();
    const electronicsCategory = db.prepare(`
      SELECT id FROM categories WHERE lower(trim(name)) = 'electronics'
    `).get();
    const invalidCategories = db.prepare(`
      SELECT id FROM categories
      WHERE trim(name) = '' OR lower(trim(name)) IN ('undefined', 'null')
    `).all();
    for (const category of invalidCategories) {
      db.prepare(`
        UPDATE products SET category_id = ?
        WHERE category_id = ? AND lower(trim(name)) = 'wireless earbuds'
      `).run(electronicsCategory.id, category.id);
      db.prepare(`
        UPDATE products SET category_id = ?
        WHERE category_id = ? AND lower(trim(name)) != 'wireless earbuds'
      `).run(generalCategory.id, category.id);
      db.prepare('DELETE FROM categories WHERE id = ?').run(category.id);
    }

    const { count } = db.prepare('SELECT COUNT(*) AS count FROM products').get();
    if (count === 0) {
      const categoryIds = new Map(
        db.prepare('SELECT id, name FROM categories').all().map(({ id, name }) => [name.toLowerCase(), id])
      );
      const insertProduct = db.prepare(`
        INSERT INTO products (name, description, price, category_id, stock_quantity)
        VALUES (?, ?, ?, ?, ?)
      `);

      for (const [name, description, price, category, stockQuantity] of seedProducts) {
        insertProduct.run(name, description, price, categoryIds.get(category.toLowerCase()), stockQuantity);
      }
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function getDb() {
  return db;
}

export function getDatabasePath() {
  return dbPath;
}
