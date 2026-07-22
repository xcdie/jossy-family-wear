# Jossy Sagide — Full-Stack Clothing Shop

A complete full-stack web shop for Jossy Sagide, Mbale's favourite family clothing store.

## What's included

| File | Purpose |
|---|---|
| `server.js` | Node.js backend — REST API + static file server |
| `public/index.html` | Full storefront (shop, cart, checkout) |
| `public/admin.html` | Admin panel (dashboard, orders, products) |
| `data/products.json` | Product catalogue |
| `data/orders.json` | Orders database (grows as orders come in) |

## How to run

1. Make sure **Node.js** is installed (any version 14+)
2. Open a terminal in this folder
3. Run:
   ```bash
   node server.js
   ```
4. Open your browser:
   - **Shop** → `http://localhost:3000`
   - **Admin** → `http://localhost:3000/admin`

No `npm install` needed — uses only Node's built-in modules.

## API Endpoints

### Products
| Method | URL | Description |
|---|---|---|
| GET | `/api/products` | All products |
| GET | `/api/products?category=Men` | Filter by category |
| GET | `/api/products/:id` | Single product |
| POST | `/api/products` | Add product (admin) |
| PUT | `/api/products/:id` | Update product (admin) |
| DELETE | `/api/products/:id` | Delete product (admin) |

### Orders
| Method | URL | Description |
|---|---|---|
| POST | `/api/orders` | Place a new order |
| GET | `/api/orders` | All orders (admin) |
| GET | `/api/orders?status=Pending` | Filter by status |
| PATCH | `/api/orders/:id` | Update order status |

### Stats
| Method | URL | Description |
|---|---|---|
| GET | `/api/stats` | Dashboard summary numbers |

## Editing products

Edit `data/products.json` directly, or use the Admin panel at `/admin`.

Each product:
```json
{
  "id": 1,
  "name": "Classic Polo Shirt",
  "price": 1200,
  "category": "Men",
  "badge": "Popular",
  "sizes": ["S", "M", "L", "XL"],
  "img": "https://...",
  "stock": 50
}
```
`category` must be `Men`, `Women`, or `Kids`.

## Payment

Orders are saved with status "Pending". The checkout collects the customer's name, phone number, and delivery address. You then call the customer to confirm and collect payment via M-Pesa or cash on delivery. The admin panel lets you update order status to Shipped / Delivered / Cancelled.

## Deploy online (optional)

To put this online, you can deploy to:
- **Railway.app** (free tier) — push to GitHub, connect repo
- **Render.com** — similar, free tier available
- **VPS** (e.g. DigitalOcean $4/month) — run `node server.js` with PM2

For production, replace the JSON file storage with a real database (SQLite or MongoDB).
