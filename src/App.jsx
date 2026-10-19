import { useEffect, useMemo, useState } from 'react';

const emptyForm = {
  name: '',
  description: '',
  category: '',
  price: '',
  stock_quantity: '',
};

const formatCurrency = (value) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(Number(value || 0));

async function readApiResponse(response) {
  const data = await response.json();
  if (!response.ok) {
    const message = data.details?.join(' ') || data.error || 'The request could not be completed.';
    throw new Error(message);
  }
  return data;
}

export default function App() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [apiConnected, setApiConnected] = useState(null);

  const loadInventory = async () => {
    setLoading(true);
    setError('');
    try {
      const [healthResponse, productResponse, categoryResponse] = await Promise.all([
        fetch('/api/health'),
        fetch('/api/products'),
        fetch('/api/categories'),
      ]);
      await readApiResponse(healthResponse);
      const [productList, categoryList] = await Promise.all([
        readApiResponse(productResponse),
        readApiResponse(categoryResponse),
      ]);
      setProducts(productList);
      setCategories(categoryList);
      setApiConnected(true);
    } catch (err) {
      setApiConnected(false);
      setError(err.message || 'Unable to connect to the ShopEase API.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const visibleProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    return products.filter((product) => {
      const matchesSearch = !normalizedSearch
        || product.name.toLowerCase().includes(normalizedSearch)
        || (product.description || '').toLowerCase().includes(normalizedSearch);
      const matchesCategory = !selectedCategory || String(product.category_id) === selectedCategory;
      return matchesSearch && matchesCategory;
    });
  }, [products, search, selectedCategory]);

  const stats = useMemo(() => ({
    totalProducts: products.length,
    totalStock: products.reduce((total, product) => total + Number(product.stock_quantity), 0),
    inventoryValue: products.reduce(
      (total, product) => total + Number(product.price) * Number(product.stock_quantity),
      0
    ),
  }), [products]);

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim(),
        category: form.category,
        price: Number(form.price),
        stock_quantity: Number(form.stock_quantity),
      };
      const response = await fetch(editingId ? `/api/products/${editingId}` : '/api/products', {
        method: editingId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      await readApiResponse(response);
      setSuccess(editingId ? 'Product updated successfully.' : 'Product added successfully.');
      resetForm();
      await loadInventory();
    } catch (err) {
      setError(err.message || 'Unable to save the product.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleEdit = (product) => {
    setEditingId(product.id);
    setForm({
      name: product.name,
      description: product.description || '',
      category: product.category,
      price: String(product.price),
      stock_quantity: String(product.stock_quantity),
    });
    setError('');
    setSuccess('');
    document.getElementById('product-form-title')?.scrollIntoView({ block: 'start' });
  };

  const handleDelete = async (product) => {
    if (!window.confirm(`Delete "${product.name}"? This action cannot be undone.`)) {
      return;
    }

    setError('');
    setSuccess('');
    try {
      const response = await fetch(`/api/products/${product.id}`, { method: 'DELETE' });
      await readApiResponse(response);
      setSuccess(`${product.name} was deleted.`);
      if (editingId === product.id) {
        resetForm();
      }
      await loadInventory();
    } catch (err) {
      setError(err.message || 'Unable to delete the product.');
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#overview" aria-label="ShopEase home">
          <span className="brand-mark" aria-hidden="true">S</span>
          <span>ShopEase</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <a className="nav-link active" href="#overview">Overview</a>
          <a className="nav-link" href="#inventory">Products</a>
        </nav>
        <div className={`connection-status ${apiConnected === false ? 'disconnected' : ''}`} role="status">
          <span className="status-dot" />
          {apiConnected === null ? 'Connecting' : apiConnected ? 'API connected' : 'API unavailable'}
        </div>
      </header>

      <main>
        <section className="page-heading" id="overview">
          <div>
            <p className="eyebrow">Inventory management</p>
            <h1>Good business starts with a clear view.</h1>
            <p className="page-description">Keep track of your products, stock and inventory value.</p>
          </div>
          <a className="button primary heading-action" href="#product-form-title">Add a product <span aria-hidden="true">+</span></a>
        </section>

        <section className="stats-grid" aria-label="Inventory summary">
          <article className="stat-card">
            <div className="stat-label"><span className="stat-icon blue" aria-hidden="true">▦</span>Products</div>
            <strong>{stats.totalProducts}</strong>
            <span className="stat-note">Across your catalog</span>
          </article>
          <article className="stat-card">
            <div className="stat-label"><span className="stat-icon green" aria-hidden="true">+</span>Units in stock</div>
            <strong>{stats.totalStock.toLocaleString('en-US')}</strong>
            <span className="stat-note">Available inventory</span>
          </article>
          <article className="stat-card">
            <div className="stat-label"><span className="stat-icon amber" aria-hidden="true">$</span>Inventory value</div>
            <strong>{formatCurrency(stats.inventoryValue)}</strong>
            <span className="stat-note">Based on current stock</span>
          </article>
          <article className="stat-card">
            <div className="stat-label"><span className="stat-icon violet" aria-hidden="true">C</span>Categories</div>
            <strong>{categories.length}</strong>
            <span className="stat-note">Product groups</span>
          </article>
        </section>

        {(error || success) && (
          <div className={`flash-message ${error ? 'error' : 'success'}`} role={error ? 'alert' : 'status'}>
            <span>{error || success}</span>
            {error && !apiConnected && (
              <button type="button" className="text-button" onClick={loadInventory}>Try again</button>
            )}
          </div>
        )}

        <div className="content-grid">
          <section className="panel form-panel" aria-labelledby="product-form-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">{editingId ? 'Update catalog' : 'Catalog management'}</p>
                <h2 id="product-form-title">{editingId ? 'Edit product' : 'Add a product'}</h2>
              </div>
              {editingId && <span className="editing-indicator">Editing</span>}
            </div>
            <form onSubmit={handleSubmit} className="product-form">
              <label htmlFor="product-name">Product name</label>
              <input
                id="product-name"
                name="name"
                value={form.name}
                onChange={handleInputChange}
                placeholder="e.g. Ceramic travel mug"
                minLength="2"
                maxLength="100"
                required
              />

              <label htmlFor="product-description">Description <span className="optional">(optional)</span></label>
              <textarea
                id="product-description"
                name="description"
                value={form.description}
                onChange={handleInputChange}
                placeholder="A short description of this product"
                maxLength="500"
                rows="3"
              />

              <label htmlFor="product-category">Category</label>
              <select
                id="product-category"
                name="category"
                value={form.category}
                onChange={handleInputChange}
                required
              >
                <option value="">Choose a category</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.name}>{category.name}</option>
                ))}
              </select>

              <div className="two-column">
                <div className="field-group">
                  <label htmlFor="product-price">Price</label>
                  <div className="input-with-prefix">
                    <span aria-hidden="true">$</span>
                    <input
                      id="product-price"
                      name="price"
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={form.price}
                      onChange={handleInputChange}
                      placeholder="0.00"
                      required
                    />
                  </div>
                </div>
                <div className="field-group">
                  <label htmlFor="product-stock">Stock quantity</label>
                  <input
                    id="product-stock"
                    name="stock_quantity"
                    type="number"
                    min="0"
                    step="1"
                    value={form.stock_quantity}
                    onChange={handleInputChange}
                    placeholder="0"
                    required
                  />
                </div>
              </div>

              <div className="button-row">
                <button type="submit" className="button primary submit-button" disabled={submitting || !apiConnected}>
                  {submitting ? 'Saving...' : editingId ? 'Save changes' : 'Add product'}
                </button>
                {editingId && (
                  <button type="button" className="button secondary" onClick={resetForm}>
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="panel inventory-panel" id="inventory" aria-labelledby="inventory-title">
            <div className="inventory-heading">
              <div>
                <p className="eyebrow">Your catalog</p>
                <h2 id="inventory-title">Products <span className="result-count">{visibleProducts.length}</span></h2>
              </div>
              <span className="updated-note">Saved to your inventory</span>
            </div>
            <div className="toolbar">
              <label className="search-control" htmlFor="product-search">
                <span className="search-icon" aria-hidden="true" />
                <input
                  id="product-search"
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search products"
                />
              </label>
              <label className="filter-control" htmlFor="category-filter">
                <span className="sr-only">Filter by category</span>
                <select id="category-filter" value={selectedCategory} onChange={(event) => setSelectedCategory(event.target.value)}>
                  <option value="">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </label>
            </div>

            {loading ? (
              <div className="empty-state"><span className="loading-indicator" /> Loading your inventory…</div>
            ) : visibleProducts.length === 0 ? (
              <div className="empty-state">
                <strong>{products.length === 0 ? 'Your catalog is ready for its first product.' : 'No products match these filters.'}</strong>
                <span>{products.length === 0 ? 'Add a product to start tracking your inventory.' : 'Try a different search or category.'}</span>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="product-table">
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Category</th>
                      <th scope="col">Price</th>
                      <th scope="col">In stock</th>
                      <th scope="col"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleProducts.map((product) => (
                      <tr key={product.id}>
                        <td>
                          <span className="product-name">{product.name}</span>
                          <span className="product-description">{product.description || 'No description'}</span>
                        </td>
                        <td><span className="category-tag">{product.category}</span></td>
                        <td className="price-cell">{formatCurrency(product.price)}</td>
                        <td>
                          <span className={`stock-status ${product.stock_quantity === 0 ? 'out-of-stock' : product.stock_quantity < 5 ? 'low-stock' : ''}`}>
                            <span className="stock-dot" />
                            {product.stock_quantity === 0 ? 'Out of stock' : `${product.stock_quantity} units`}
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button type="button" className="action-button" onClick={() => handleEdit(product)}>Edit</button>
                            <button type="button" className="action-button delete-action" onClick={() => handleDelete(product)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </main>
      <footer className="footer">
        <span>ShopEase | Product inventory management</span>
        <span>Simple tools for a well-run shop.</span>
      </footer>
    </div>
  );
}
