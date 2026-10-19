import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase, getDb } from './database.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const port = Number(process.env.PORT || process.env.API_PORT) || 3002;
const frontendDirectory = path.resolve(__dirname, '..', 'dist');
const frontendIndex = path.join(frontendDirectory, 'index.html');

initializeDatabase();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

const normalizeCategoryName = (value) => String(value ?? '').trim();
const isValidCategoryName = (value) => typeof value === 'string'
  && value.trim().length >= 2
  && value.trim().length <= 50
  && !['undefined', 'null'].includes(value.trim().toLowerCase());

const safeCategoryName = (value) => isValidCategoryName(value) ? value.trim() : 'General';

const toProductResponse = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  price: Number(row.price),
  category: safeCategoryName(row.category_name),
  category_id: row.category_id,
  stock_quantity: row.stock_quantity,
  created_at: row.created_at,
  updated_at: row.updated_at,
});

const validateProductInput = (payload, isUpdate = false) => {
  const errors = [];

  if (!isUpdate || payload.name !== undefined) {
    if (typeof payload.name !== 'string' || payload.name.trim().length < 2 || payload.name.trim().length > 100) {
      errors.push('Product name must be between 2 and 100 characters.');
    }
  }

  if (!isUpdate || payload.description !== undefined) {
    if (payload.description != null && typeof payload.description !== 'string') {
      errors.push('Description must be a string when provided.');
    }
  }

  if (!isUpdate || payload.price !== undefined) {
    if (typeof payload.price !== 'number' || Number.isNaN(payload.price) || payload.price <= 0) {
      errors.push('Price must be a positive number.');
    }
  }

  if (!isUpdate || payload.category !== undefined) {
    if (!isValidCategoryName(payload.category)) {
      errors.push('Category must be a valid name between 2 and 50 characters.');
    }
  }

  if (!isUpdate || payload.stock_quantity !== undefined) {
    if (!Number.isInteger(payload.stock_quantity) || payload.stock_quantity < 0) {
      errors.push('Stock quantity must be a whole number greater than or equal to 0.');
    }
  }

  return errors;
};

const ensureCategory = (categoryName) => {
  const cleanedName = String(categoryName || '').trim();
  if (!isValidCategoryName(cleanedName)) {
    throw new Error('Category name must be a valid name between 2 and 50 characters.');
  }

  const existing = getDb().prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE').get(cleanedName);

  if (existing) {
    return existing.id;
  }

  const insertResult = getDb().prepare('INSERT INTO categories (name) VALUES (?)').run(cleanedName);
  return insertResult.lastInsertRowid;
};

const getProductWithCategory = (productId) => getDb().prepare(`
  SELECT p.*, c.name AS category_name
  FROM products p
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE p.id = ?
`).get(productId);

app.get('/api/health', (req, res) => {
  getDb().prepare('SELECT 1').get();
  res.json({ status: 'ok', database: 'connected', message: 'ShopEase API is running.' });
});

app.get('/api/categories', (req, res) => {
  const categories = getDb().prepare(`
    SELECT id, name, description
    FROM categories
    ORDER BY name COLLATE NOCASE
  `).all();
  res.json(categories.map((category) => ({
    ...category,
    name: safeCategoryName(category.name),
  })));
});

app.get('/api/products', (req, res) => {
  const { search = '', category = '' } = req.query;
  const query = `
    SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE (:search = '' OR lower(p.name) LIKE lower('%' || :search || '%') OR lower(COALESCE(p.description, '')) LIKE lower('%' || :search || '%'))
      AND (:category = '' OR lower(c.name) = lower(:category))
    ORDER BY p.updated_at DESC, p.id DESC
  `;

  const rows = getDb().prepare(query).all({
    search: String(search).trim(),
    category: String(category).trim(),
  });

  res.json(rows.map(toProductResponse));
});

app.get('/api/products/:id', (req, res) => {
  const productId = Number(req.params.id);

  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  const row = getProductWithCategory(productId);

  if (!row) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  return res.json(toProductResponse(row));
});

app.post('/api/products', (req, res) => {
  const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const errors = validateProductInput(payload);

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed.', details: errors });
  }

  const categoryName = normalizeCategoryName(payload.category);
  const price = Number(payload.price);
  const stockQuantity = Number(payload.stock_quantity);

  const database = getDb();
  let result;
  database.exec('BEGIN IMMEDIATE');
  try {
    const categoryId = ensureCategory(categoryName);
    result = database.prepare(`
      INSERT INTO products (name, description, price, category_id, stock_quantity)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      String(payload.name).trim(),
      payload.description == null ? '' : payload.description.trim(),
      price,
      categoryId,
      stockQuantity
    );
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  const created = getProductWithCategory(result.lastInsertRowid);

  return res.status(201).json({ message: 'Product created successfully.', product: toProductResponse(created) });
});

app.put('/api/products/:id', (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const errors = validateProductInput(payload, false);

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed.', details: errors });
  }

  const existing = getDb().prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const categoryName = normalizeCategoryName(payload.category);
  let categoryId;
  try {
    categoryId = ensureCategory(categoryName);
  } catch (error) {
    return res.status(400).json({ error: 'Validation failed.', details: [error.message] });
  }

  const description = payload.description == null ? existing.description : String(payload.description).trim();
  const name = String(payload.name).trim();
  const price = Number(payload.price);
  const stockQuantity = Number(payload.stock_quantity);

  getDb().prepare(`
    UPDATE products
    SET name = ?, description = ?, price = ?, category_id = ?, stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(name, description, price, categoryId, stockQuantity, productId);

  const updated = getProductWithCategory(productId);

  return res.json({ message: 'Product updated successfully.', product: toProductResponse(updated) });
});

app.patch('/api/products/:id', (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  const existing = getProductWithCategory(productId);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
  const merged = {
    name: payload.name ?? existing.name,
    description: payload.description ?? existing.description,
    price: payload.price ?? Number(existing.price),
    category: payload.category ?? existing.category_name,
    stock_quantity: payload.stock_quantity ?? existing.stock_quantity,
  };

  const categoryName = normalizeCategoryName(merged.category);
  const errors = validateProductInput(merged, true);

  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validation failed.', details: errors });
  }

  let categoryId;
  try {
    categoryId = ensureCategory(categoryName);
  } catch (error) {
    return res.status(400).json({ error: 'Validation failed.', details: [error.message] });
  }

  getDb().prepare(`
    UPDATE products
    SET name = ?, description = ?, price = ?, category_id = ?, stock_quantity = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    String(merged.name).trim(),
    merged.description == null ? '' : String(merged.description).trim(),
    Number(merged.price),
    categoryId,
    Number(merged.stock_quantity),
    productId
  );

  const updated = getProductWithCategory(productId);

  return res.json({ message: 'Product updated successfully.', product: toProductResponse(updated) });
});

app.delete('/api/products/:id', (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ error: 'Invalid product ID.' });
  }

  const existing = getDb().prepare('SELECT id FROM products WHERE id = ?').get(productId);
  if (!existing) {
    return res.status(404).json({ error: 'Product not found.' });
  }

  getDb().prepare('DELETE FROM products WHERE id = ?').run(productId);
  return res.json({ message: 'Product deleted successfully.', id: productId });
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

app.use(express.static(frontendDirectory));

app.get('*', (req, res, next) => {
  if (!fs.existsSync(frontendIndex)) {
    return res.status(404).json({ error: 'Route not found.' });
  }

  return res.sendFile(frontendIndex, (error) => {
    if (error) {
      next(error);
    }
  });
});

app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body must contain valid JSON.' });
  }

  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body exceeds the 1 MB limit.' });
  }

  if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(409).json({ error: 'The selected category does not exist.' });
  }

  if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'A category with that name already exists.' });
  }

  if (err.code && err.code.startsWith('SQLITE_CONSTRAINT')) {
    return res.status(400).json({ error: 'The request violates a database constraint.' });
  }

  if (err.status === 400) {
    return res.status(400).json({ error: 'Invalid request.' });
  }

  console.error('ShopEase request failed:', err);
  return res.status(500).json({ error: 'An unexpected server error occurred.' });
});

export default app;

const startServer = () => {
  app.listen(port, () => {
    console.log(`ShopEase API running on http://localhost:${port}`);
  });
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}
