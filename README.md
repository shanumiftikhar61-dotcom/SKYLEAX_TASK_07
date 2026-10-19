# ShopEase

ShopEase is a small-business e-commerce dashboard for product management. It uses a persistent SQLite database, an Express API, and a React frontend so products can be created, listed, searched, filtered, edited, and deleted in a single workflow.

## Features

- SQLite database stored in `server/data/shop-ease.db` by default
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

- Node.js 22.5+ (required for the built-in `node:sqlite` module)
- npm

## Setup

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
npm.cmd install
```

## Run the app

Start both the backend and frontend together:

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
npm.cmd run dev
```

To run the backend on a specific port, set `API_PORT`; Vite uses the same value for its `/api` proxy:

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
$env:API_PORT = 3002
npm.cmd run dev
```

Then open:

- Frontend: use the Vite URL printed by `npm run dev` (normally http://localhost:5173; Vite selects the next available port if needed)
- API: http://localhost:3002/api/health

## Production build

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
npm.cmd run build
npm.cmd start
```

The Express server serves the built frontend from `dist` and the API from the same origin. Set `PORT` to the port supplied by the hosting platform; locally it defaults to 3002. Open the server URL printed at startup.

### Render deployment

Use these Render Web Service commands:

- Build command: `npm install && npm run build`
- Start command: `npm start`
- The server listens on Render's `PORT` environment variable.

The database path defaults to `server/data/shop-ease.db` and can be overridden with `SHOP_EASE_DB_PATH`. Render's service filesystem is not durable by default: data stored at the default path may be lost on redeploy or instance replacement. To retain SQLite data, attach a persistent disk and set `SHOP_EASE_DB_PATH` to a database file under that disk's mount path. SQLite on a single attached disk is not suitable for multiple service instances sharing the same database; use a managed database for horizontal scaling.

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

### GET `/api/health`
Checks API availability and database connectivity.

### GET `/api/categories`
Returns all categories.

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
npm.cmd test
npm.cmd run build
```

## Local persistence and restart behavior

Locally, the database is stored at `server/data/shop-ease.db` by default, so existing records remain available across ordinary app restarts. On hosted services, persistence depends on the storage backing `SHOP_EASE_DB_PATH`; an ephemeral filesystem does not guarantee database retention.

## Deployment guidance

The Express server can serve the built frontend and API from one Node.js service. For a separate Vercel/Netlify frontend, configure its `/api` requests to reach a separately hosted API (same-origin relative requests will otherwise target the frontend host).

Important deployment note: SQLite is local-file based, so a serverless frontend-only host cannot safely keep a true writable database unless the API is also deployed in a persistent environment. The backend must run on a Node host that can write to the database file.

## GitHub setup

The existing GitHub remote is already configured. Check the worktree and remote; do not initialize another repository or add a duplicate remote:

```powershell
cd "C:\Users\NJ\Documents\SKYLEAX_TASK_07"
git status
git remote -v
```

After reviewing the staged changes, commit and push only when ready:

```powershell
git add .gitignore README.md server/server.js
git diff --cached
git commit -m "Serve ShopEase frontend from Express"
git push origin main
```
