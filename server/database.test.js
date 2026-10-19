import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import request from 'supertest';

const testDirectory = mkdtempSync(path.join(tmpdir(), 'shopease-test-'));
process.env.SHOP_EASE_DB_PATH = path.join(testDirectory, 'shop-ease-test.db');
process.env.NODE_ENV = 'test';

const [{ default: app }, databaseModule] = await Promise.all([
  import('./server.js'),
  import('./database.js'),
]);
const { getDb, getDatabasePath, initializeDatabase } = databaseModule;

const productInput = {
  name: 'Portable Blender',
  description: 'Compact kitchen helper.',
  category: 'Kitchen',
  price: 39.99,
  stock_quantity: 10,
};

after(() => {
  getDb().close();
  rmSync(testDirectory, { recursive: true, force: true });
});

test('initializes related SQLite tables with persistent, constrained seed data', () => {
  const database = getDb();
  const tables = database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table'
  `).all().map(({ name }) => name);
  const categories = database.prepare('SELECT * FROM categories').all();
  const products = database.prepare('SELECT * FROM products').all();
  const foreignKeys = database.prepare('PRAGMA foreign_key_list(products)').all();

  assert.ok(tables.includes('categories'));
  assert.ok(tables.includes('products'));
  assert.ok(categories.some((category) => category.description));
  assert.equal(products.length, 4);
  assert.equal(foreignKeys[0].table, 'categories');
  assert.equal(foreignKeys[0].from, 'category_id');
  assert.equal(database.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);

  initializeDatabase();
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM products').get().count, 4);
  assert.equal(database.prepare('SELECT COUNT(*) AS count FROM categories').get().count, 5);
  assert.ok(database.prepare(`
    SELECT COUNT(*) AS count FROM categories
    WHERE trim(name) = '' OR lower(trim(name)) IN ('undefined', 'null')
  `).get().count === 0);

  const invalidCategory = database.prepare("INSERT INTO categories (name) VALUES ('undefined')").run();
  const legacyProduct = database.prepare(`
    INSERT INTO products (name, price, category_id, stock_quantity)
    VALUES ('Legacy uncategorized item', 5, ?, 1)
  `).run(invalidCategory.lastInsertRowid);
  const importedEarbuds = database.prepare(`
    INSERT INTO products (name, price, category_id, stock_quantity)
    VALUES ('Wireless Earbuds', 55, ?, 15)
  `).run(invalidCategory.lastInsertRowid);
  initializeDatabase();
  assert.equal(database.prepare(`
    SELECT COUNT(*) AS count FROM categories
    WHERE lower(trim(name)) = 'undefined'
  `).get().count, 0);
  assert.equal(database.prepare(`
    SELECT c.name AS category
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.name = 'Legacy uncategorized item'
  `).get().category, 'General');
  assert.equal(database.prepare(`
    SELECT c.name AS category
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.name = 'Wireless Earbuds'
  `).get().category, 'Electronics');
  database.prepare('DELETE FROM products WHERE id IN (?, ?)').run(
    legacyProduct.lastInsertRowid,
    importedEarbuds.lastInsertRowid
  );

  const reopened = new DatabaseSync(getDatabasePath(), { readOnly: true });
  assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM products').get().count, 4);
  reopened.close();
});

test('health endpoint checks database connectivity and categories are retrievable', async () => {
  const health = await request(app).get('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(health.body, {
    status: 'ok',
    database: 'connected',
    message: 'ShopEase API is running.',
  });

  const categories = await request(app).get('/api/categories');
  assert.equal(categories.status, 200);
  assert.ok(categories.body.some((category) => category.name === 'Electronics'));
  assert.ok(categories.body.every((category) => Number.isInteger(category.id)));
  assert.ok(categories.body.every((category) => category.name.trim() && !['undefined', 'null'].includes(category.name.toLowerCase())));
});

test('GET /api/products returns joined category details and filters', async () => {
  const response = await request(app).get('/api/products');
  assert.equal(response.status, 200);
  assert.equal(response.body.length, 4);
  assert.ok(response.body.every((product) => product.category && product.category_id));

  const filtered = await request(app).get('/api/products?category=Electronics');
  assert.equal(filtered.status, 200);
  assert.deepEqual(filtered.body.map((product) => product.name), ['Wireless Earbuds']);

  const searched = await request(app).get('/api/products?search=notebook');
  assert.deepEqual(searched.body.map((product) => product.name), ['Daily Notebook Set']);
});

test('POST creates a persisted product with a valid category relationship', async () => {
  const response = await request(app).post('/api/products').send(productInput);

  assert.equal(response.status, 201);
  assert.equal(response.body.product.name, productInput.name);
  assert.equal(response.body.product.category, productInput.category);

  const saved = getDb().prepare(`
    SELECT p.name, c.name AS category
    FROM products p JOIN categories c ON c.id = p.category_id
    WHERE p.id = ?
  `).get(response.body.product.id);
  assert.deepEqual(saved, { name: productInput.name, category: productInput.category });

  const duplicateName = await request(app).post('/api/products').send({
    ...productInput,
    name: 'Another Kitchen Product',
    category: 'kItChEn',
  });
  assert.equal(duplicateName.status, 201);
  assert.equal(duplicateName.body.product.category_id, response.body.product.category_id);
});

test('POST rejects missing and invalid product fields and malformed JSON', async () => {
  const missing = await request(app).post('/api/products').send({});
  assert.equal(missing.status, 400);
  assert.match(missing.body.error, /validation failed/i);
  assert.ok(missing.body.details.length >= 4);

  const invalid = await request(app).post('/api/products').send({
    ...productInput,
    name: 'A',
    price: -1,
    stock_quantity: 1.5,
  });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.details.some((detail) => /price/i.test(detail)));

  const invalidCategory = await request(app).post('/api/products').send({
    ...productInput,
    category: 'undefined',
  });
  assert.equal(invalidCategory.status, 400);

  const malformed = await request(app)
    .post('/api/products')
    .set('Content-Type', 'application/json')
    .send('{"name":');
  assert.equal(malformed.status, 400);
  assert.match(malformed.body.error, /valid JSON/i);
});

test('GET /api/products/:id returns records and appropriate not-found responses', async () => {
  const created = await request(app).post('/api/products').send(productInput);
  const found = await request(app).get(`/api/products/${created.body.product.id}`);
  assert.equal(found.status, 200);
  assert.equal(found.body.name, productInput.name);

  const missing = await request(app).get('/api/products/999999');
  assert.equal(missing.status, 404);
  assert.match(missing.body.error, /not found/i);

  const invalidId = await request(app).get('/api/products/not-an-id');
  assert.equal(invalidId.status, 400);
});

test('PUT replaces product fields and PATCH validates partial changes', async () => {
  const created = await request(app).post('/api/products').send(productInput);
  const id = created.body.product.id;
  const updated = await request(app).put(`/api/products/${id}`).send({
    name: 'Portable Blender Pro',
    description: 'Updated compact kitchen helper.',
    category: 'Kitchen',
    price: 49.5,
    stock_quantity: 12,
  });

  assert.equal(updated.status, 200);
  assert.equal(updated.body.product.name, 'Portable Blender Pro');
  assert.equal(updated.body.product.stock_quantity, 12);

  const patched = await request(app).patch(`/api/products/${id}`).send({ stock_quantity: 0 });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.product.stock_quantity, 0);

  const invalidPatch = await request(app).patch(`/api/products/${id}`).send({ price: 0 });
  assert.equal(invalidPatch.status, 400);

  const missingPut = await request(app).put('/api/products/999999').send(productInput);
  assert.equal(missingPut.status, 404);
  const missingPatch = await request(app).patch('/api/products/999999').send({ name: 'Missing' });
  assert.equal(missingPatch.status, 404);
});

test('DELETE removes products and reports nonexistent IDs', async () => {
  const created = await request(app).post('/api/products').send(productInput);
  const id = created.body.product.id;
  const deleted = await request(app).delete(`/api/products/${id}`);

  assert.equal(deleted.status, 200);
  assert.equal(getDb().prepare('SELECT id FROM products WHERE id = ?').get(id), undefined);

  const missing = await request(app).delete(`/api/products/${id}`);
  assert.equal(missing.status, 404);
});

test('SQLite rejects duplicate category names and invalid foreign keys and CHECK values', () => {
  const database = getDb();
  assert.throws(
    () => database.prepare('INSERT INTO categories (name) VALUES (?)').run('kitchen'),
    /constraint/i
  );
  assert.throws(
    () => database.prepare(`
      INSERT INTO products (name, price, category_id, stock_quantity)
      VALUES ('Invalid FK', 1, 999999, 0)
    `).run(),
    /constraint/i
  );
  assert.throws(
    () => database.prepare(`
      INSERT INTO products (name, price, category_id, stock_quantity)
      VALUES ('Invalid price', -1, 1, 0)
    `).run(),
    /constraint/i
  );
});
