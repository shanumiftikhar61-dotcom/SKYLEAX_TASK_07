# ShopEase

ShopEase is a small-business e-commerce dashboard for product management. It uses a persistent SQLite database, an Express API, and a React frontend so products can be created, listed, searched, filtered, edited, and deleted in a single workflow.

## Features

- Persistent SQLite database file stored in `server/data/shop-ease.db`
- Database initialization with categories and products tables
- REST API for CRUD operations
- Input validation on both backend and frontend
- Search and category filters
- Product cards with add, edit, and delete actions
- Dashboard summary cards
- Node.js test suite for CRUD and validation flows

## Project structure

- `server/` — Express API and SQLite database logic
- `src/` — React frontend UI and styles
- `index.html` — app entry
- `vite.config.js` — Vite frontend config
- `server/data/` — persistent database folder

## Prerequisites

- Node.js 18+ or 20+
- npm

## Setup

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
npm install
```

## Run the app

Start both the backend and frontend together:

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
npm run dev
```

To run the backend on a specific port, set `API_PORT`; Vite uses the same value for its `/api` proxy:

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
$env:API_PORT = 3002
npm run dev
```

Then open:

- Frontend: use the Vite URL printed by `npm run dev` (normally http://localhost:5173; Vite selects the next available port if needed)
- API: http://localhost:3002/api/health

## Production build

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
npm run build
```

Start only the server:

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
npm start
```

To run the API on a specific port, use:

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
$env:API_PORT = 3002
npm start
```

## Database details

The application creates and uses a SQLite database file at:

`server/data/shop-ease.db`

Tables created automatically:

- `categories`
  - `id`
  - `name`
  - `created_at`
  - `updated_at`
- `products`
  - `id`
  - `name`
  - `description`
  - `price`
  - `category_id`
  - `stock_quantity`
  - `created_at`
  - `updated_at`

## API endpoints

### GET `/api/products`
Returns all products, optionally filtered by `search` and `category` query params.

### GET `/api/products/:id`
Returns one product by ID.

### POST `/api/products`
Creates a product.

Example body:

```json
{
  "name": "Office Chair",
  "description": "Comfortable ergonomic chair.",
  "category": "Furniture",
  "price": 149.99,
  "stock_quantity": 8
}
```

### PUT `/api/products/:id`
Updates the entire product.

### PATCH `/api/products/:id`
Updates only supplied fields.

### DELETE `/api/products/:id`
Deletes a product by ID.

## Validation rules

- Product name: 2-100 characters
- Description: optional string
- Price: must be greater than 0
- Category: 2-50 characters
- Stock quantity: integer greater than or equal to 0

## Testing

Run the automated CRUD and validation tests:

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
$env:NODE_ENV = "test"
node --test server/*.test.js
```

## Persistence and restart behavior

The database remains available after restarts because it is stored on disk in `server/data/shop-ease.db`. Existing records are preserved between app restarts.

## Deployment guidance

To deploy the frontend and backend, host the backend as a Node.js app and keep the SQLite database file on a persistent volume or durable storage. For a Vercel/Netlify frontend, build the React app and serve the generated static files; keep the API on a host such as Render, Railway, or a VPS with the `server/data` directory backed by persistent storage.

Important deployment note: SQLite is local-file based, so a serverless frontend-only host cannot safely keep a true writable database unless the API is also deployed in a persistent environment. The backend must run on a Node host that can write to the database file.

## GitHub setup

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
git init
git add .
git commit -m "Initial ShopEase release"
```

Then create a remote repository on GitHub and push with:

```powershell
git branch -M main
git remote add origin <your-github-repo-url>
git push -u origin main
```
