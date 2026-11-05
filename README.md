# Hydro

Inventory and invoicing for a small business. Add any kind of stock, sell from what's available, and issue invoices (on screen, printable, or as a PDF to share from your phone).

- **Inventory**: any item type. Each item has a unit (pcs, kg, litre, hour…), free-form attributes (brand, size, colour, expiry, serial no.…), optional SKU/barcode, cost and selling price, and a reorder level. Services (delivery, labour) can skip stock tracking. Categories are managed as a list: you can add, rename or delete them, and renaming updates every item in the category. Each category is set to whole numbers (pcs, boxes) or fractions allowed (kg, litres), and every sale and stock change follows that setting. Uncategorised items allow fractions.
- **Stock in/out**: receive stock, adjust it (damage, recount), and see a full history of every movement.
- **Point of sale**: search or scan items, build a cart, add customer details, discounts and tax, then complete the sale. Stock is checked and deducted in the same transaction, so two people can't sell the last unit twice.
- **Invoices**: numbered automatically (e.g. `INV-00042`). You can view, print, download a PDF, or share from your phone. If you void a sale, the invoice is kept and marked VOID, and its stock goes back.
- **Users and roles**: admin, manager and sales roles (see below).
- **Responsive**: sidebar layout on desktop; bottom tabs and a one-handed checkout on phones. You can install it to the home screen like an app.

## Stack

| | |
|---|---|
| Frontend | Vite, React 19, TypeScript, Tailwind CSS 4, TanStack Query (`frontend/`) |
| Backend | FastAPI, SQLAlchemy 2, Alembic, JWT auth, fpdf2 for PDFs (`backend/`) |
| Database | PostgreSQL 17, which is compatible with Cloud SQL |
| Today | Docker Compose on one laptop, reached from phones over Tailscale |
| Later | Cloud Run (API) + Cloud SQL + Firebase Hosting (frontend). See [docs/deploy-gcp.md](docs/deploy-gcp.md) |

The frontend always calls the API at `/api/...` on its own origin, so you don't need CORS in any setup:
- **Laptop**: one container serves both the API and the built frontend.
- **Development**: Vite proxies `/api` to the backend.
- **GCP**: Firebase Hosting rewrites `/api/**` to the Cloud Run service.

## Run it on the laptop

You need [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or another Docker engine with Compose).

```sh
cd hydro
cp .env.example .env        # fill in POSTGRES_PASSWORD, SECRET_KEY, INITIAL_ADMIN_*
docker compose up -d --build
```

Open http://localhost:8000 and sign in with `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD`. Then:
1. Go to **Settings** and enter your business name, address, currency, time zone and tax rate. These appear on every invoice.
2. Go to **Users** and add accounts for staff.
3. Once you've signed in, you can delete `INITIAL_ADMIN_PASSWORD` from `.env`. It's only used when the database has no users yet.

Database migrations run automatically every time the app starts. To update to a newer version of the code, run `docker compose up -d --build` again.

### Keep it running

- In Docker Desktop, open **Settings → General** and turn on *Start Docker Desktop when you sign in*. Both containers use `restart: unless-stopped`, so they come back after a reboot.
- Stop the laptop sleeping while it's plugged in. On macOS: **System Settings → Battery → Options → Prevent automatic sleeping on power adapter when the display is off**.

### Use it from your phone (Tailscale)

1. Install [Tailscale](https://tailscale.com/download) on the laptop and on the phone, and sign in to the same tailnet on both.
2. On the laptop, publish Hydro to your tailnet over HTTPS:
   ```sh
   tailscale serve --bg 8000
   ```
   It prints an address like `https://my-laptop.tailxxxx.ts.net`. The first time, Tailscale may ask you to turn on HTTPS certificates for the tailnet. Accept.
3. On the phone, with Tailscale connected, open that address and use **Add to Home Screen**.

The app container only listens on `127.0.0.1`, so it isn't reachable from your home Wi‑Fi, only through Tailscale. `tailscale serve` also gives you HTTPS, which the phone's **Share** button for invoice PDFs needs. To serve plain HTTP on the Tailscale IP instead, set `HYDRO_BIND=0.0.0.0` in `.env`. This also exposes it on your home network.

### Backups

Everything lives in the `pgdata` Docker volume on the laptop. Back it up:

```sh
scripts/backup.sh                    # writes backups/hydro-<timestamp>.dump, keeps the newest 30
scripts/restore.sh backups/hydro-….dump   # replaces all data (asks first)
```

To back up daily, schedule it with `crontab -e`:

```
0 21 * * * /full/path/to/hydro/scripts/backup.sh >> /full/path/to/hydro/backups/backup.log 2>&1
```

Copy the `backups/` folder somewhere off the laptop (cloud drive, USB) regularly. A laptop is a single point of failure. These dump files are also how you'll move your data to Cloud SQL later.

### Admin commands

```sh
docker compose exec app python -m app.cli reset-password someone@example.com
docker compose exec app python -m app.cli create-admin you@example.com "Your Name"
```

## Roles

| Permission | Sales | Manager | Admin |
|---|:-:|:-:|:-:|
| View inventory and make sales | ✓ | ✓ | ✓ |
| See cost prices | | ✓ | ✓ |
| Add/edit items and categories, receive and adjust stock | | ✓ | ✓ |
| Change prices, give discounts, change tax at checkout | | ✓ | ✓ |
| See everyone's sales (otherwise only your own) | | ✓ | ✓ |
| Void sales | | ✓ | ✓ |
| Manage users and business settings | | | ✓ |

Permissions are defined in one place: `ROLE_PERMISSIONS` in [backend/app/permissions.py](backend/app/permissions.py). The API enforces them, and the UI hides what each user can't use.

## Security notes

- **`SECRET_KEY` signs every login.** Use a long random value (`openssl rand -hex 32`) and keep `.env` private. In production the app refuses to start without a 32+ character key. In development, if it's unset, a random key is generated on each start, so sign-ins don't survive restarts.
- **Changing or resetting a password signs that user out on every other device.** To lock someone out immediately, disable them on the Users page.
- **Ten wrong passwords for one account block sign-in to it for 15 minutes.**
- **The frontend is served with a strict Content-Security-Policy** and other browser security headers. Login tokens are kept in the browser's local storage, and the CSP is the main defence for them.
- **Backups contain everything,** including password hashes. Store them somewhere private.

## Development

```sh
# Database only (needs a filled-in .env, as above)
docker compose up -d db

# API: http://localhost:8000, interactive docs at /api/docs
cd backend
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cp .env.example .env              # put your POSTGRES_PASSWORD in DATABASE_URL
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload

# Frontend: http://localhost:5173 (also reachable from your phone on the LAN/tailnet)
cd frontend
npm install
npm run dev
```

**Tests** run against a real Postgres database. They drop and recreate everything in it, so give them their own database:

```sh
docker compose exec db createdb -U hydro hydro_test
cd backend
TEST_DATABASE_URL=postgresql+psycopg://hydro:<POSTGRES_PASSWORD>@localhost:5432/hydro_test .venv/bin/pytest
```

**Schema changes**: edit `backend/app/models.py`, then run `.venv/bin/alembic revision --autogenerate -m "what changed"`. Review the generated file in `backend/alembic/versions/` and commit it.

## Layout

```
hydro/
├── backend/            FastAPI app (app/), migrations (alembic/), tests, Cloud Run Dockerfile
├── frontend/           Vite + React app; public/ holds the icon set and PWA manifest
├── scripts/            backup.sh, restore.sh
├── docs/deploy-gcp.md  moving to Cloud Run + Cloud SQL + Firebase Hosting
├── Dockerfile          all-in-one image (frontend + API) used by docker-compose
├── docker-compose.yml  laptop deployment
└── firebase.json       Firebase Hosting config with the /api → Cloud Run rewrite
```
