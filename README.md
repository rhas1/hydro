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
| Today | Docker Compose on one Windows laptop, reached from phones over Tailscale |
| Later | Cloud Run (API) + Cloud SQL + Firebase Hosting (frontend). See [docs/deploy-gcp.md](docs/deploy-gcp.md) |

The frontend always calls the API at `/api/...` on its own origin, so you don't need CORS in any setup:
- **Laptop**: one container serves both the API and the built frontend.
- **Development**: Vite proxies `/api` to the backend.
- **GCP**: Firebase Hosting rewrites `/api/**` to the Cloud Run service.

## Run it on the shop laptop (Windows)

### 1. Install

- [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/). It runs on WSL 2; let the installer set that up and restart if it asks. Docker Desktop is free for small businesses (under 250 employees and US$10M revenue).
- [Git for Windows](https://git-scm.com/download/win), to download Hydro and fetch updates.

### 2. Download Hydro and create its settings

In PowerShell:

```powershell
cd $HOME
git clone https://github.com/rhas1/hydro.git
cd hydro
powershell -ExecutionPolicy Bypass -File scripts\new-env.ps1
```

`new-env.ps1` asks for the first admin's email, name and password, generates strong random secrets for everything else, and writes them to `.env`. Keep `.env` private: it holds the keys to your data.

### 3. Start it

```powershell
docker compose up -d --build
```

The first build takes a few minutes. Then open http://localhost:8000 and sign in as the admin you just set up:
1. Go to **Settings** and enter your business name, address, currency, time zone and tax rate. These appear on every invoice.
2. Go to **Users** and add accounts for staff.
3. Once you've signed in, open `.env` (`notepad .env`) and delete the `INITIAL_ADMIN_PASSWORD` line. It's only used when the database has no users yet.

To update to a newer version later:

```powershell
git pull
docker compose up -d --build
```

Database migrations run automatically every time the app starts.

### Keep it running

- **Start Docker with Windows.** In Docker Desktop, open **Settings → General** and turn on *Start Docker Desktop when you sign in to your computer*. Both containers use `restart: unless-stopped`, so they come back when Docker starts, and the app restarts by itself if it ever crashes.
- **Restarts need a sign-in.** Docker Desktop only starts once someone signs in to Windows, so after a restart (Windows Update, for example) Hydro stays offline until you sign in. To make it come back on its own, turn on automatic sign-in with Microsoft's [Autologon](https://learn.microsoft.com/sysinternals/downloads/autologon) tool. Only do this if the laptop is kept somewhere secure.
- **Never sleep on power.** Go to **Settings → System → Power & battery** and, under *Screen, sleep & hibernate timeouts*, set sleep when plugged in to **Never**. If you keep the lid closed, also go to **Control Panel → Power Options → Choose what closing the lid does** and set *When plugged in* to **Do nothing**.
- **Control update restarts.** Go to **Settings → Windows Update → Advanced options → Active hours** and cover your trading hours, so update restarts happen while the shop is closed.

### Use it from your phone (Tailscale)

1. Install [Tailscale](https://tailscale.com/download) on the laptop and on the phone, and sign in to the same account on both.
2. On the laptop, open the Tailscale icon in the system tray and turn on **Preferences → Run unattended**, so it stays connected even when nobody is signed in.
3. In PowerShell on the laptop, publish Hydro to your tailnet over HTTPS:
   ```powershell
   tailscale serve --bg 8000
   ```
   It prints an address like `https://shop-laptop.tailxxxx.ts.net`. The first time, Tailscale may ask you to turn on HTTPS certificates for the tailnet. Accept.
4. On the phone, with Tailscale connected, open that address and add it to the home screen.

The app only listens on `127.0.0.1`, so it can't be reached from the shop's Wi‑Fi, only through Tailscale. `tailscale serve` also gives you HTTPS, which the phone's **Share** button for invoice PDFs needs. To serve plain HTTP on the Tailscale IP instead, set `HYDRO_BIND=0.0.0.0` in `.env`. This also exposes it on your local network.

### Backups

Everything lives in a Docker volume on the laptop. In PowerShell, from the `hydro` folder:

```powershell
# Back up to backups\hydro-<timestamp>.dump and also copy it to OneDrive (keeps the newest 30 in each)
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 -CopyTo "$env:OneDrive\Hydro backups"

# Replace ALL data with a backup (asks you to type 'restore' first)
powershell -ExecutionPolicy Bypass -File scripts\restore.ps1 backups\hydro-20260101-210000.dump
```

`-CopyTo` is optional, but use it. A laptop is a single point of failure, and a copy in OneDrive (or Google Drive, or a USB stick) is what saves you if it's lost or broken. These backup files are also how you'll move your data to Cloud SQL later.

To back up every day, set it up in **Task Scheduler**:
1. Choose **Create Basic Task…**, name it `Hydro backup`, and pick **Daily** at a time the shop is closed but the laptop is on (e.g. 9:00 PM).
2. For the action, pick **Start a program**. Set *Program* to `powershell.exe` and *Add arguments* to the following, with your own paths:
   ```
   -NoProfile -ExecutionPolicy Bypass -File "C:\Users\<you>\hydro\scripts\backup.ps1" -CopyTo "C:\Users\<you>\OneDrive\Hydro backups"
   ```
3. Finish. The task runs while you're signed in, which Docker Desktop needs anyway. Every now and then, check that new files are appearing in the OneDrive folder.

### Admin commands

```powershell
docker compose exec app python -m app.cli reset-password someone@example.com
docker compose exec app python -m app.cli create-admin you@example.com "Your Name"
```

### On a Mac or Linux instead

The steps are the same, apart from these:
- **Docker:** on a Mac, [Colima](https://github.com/abiosoft/colima) is a free, command-line-only alternative to Docker Desktop. Install it with `brew install colima docker docker-compose docker-buildx`, add `"cliPluginsExtraDirs": ["/opt/homebrew/lib/docker/cli-plugins"]` to `~/.docker/config.json`, then run `colima start`. Run `brew services start colima` to start it at login.
- **Settings:** `cp .env.example .env` and fill it in. Generate the secrets with `openssl rand -hex 32`.
- **Backups:** `scripts/backup.sh` and `scripts/restore.sh <file>`. To run the backup daily, schedule it with `crontab -e`:
  `0 21 * * * /full/path/to/hydro/scripts/backup.sh >> /full/path/to/hydro/backups/backup.log 2>&1`

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

- **`SECRET_KEY` signs every login.** Use a long random value (`scripts\new-env.ps1` generates one; on Mac/Linux, `openssl rand -hex 32`) and keep `.env` private. In production the app refuses to start without a 32+ character key. In development, if it's unset, a random key is generated on each start, so sign-ins don't survive restarts.
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

**Browser tests (Playwright)** click through the real app in Chrome, plus Android Chrome and iPhone Safari sizes for the phone layout. They cover:
- signing in, and what each role can see and do
- inventory, stock and categories
- the point of sale's stock and whole-number rules
- invoices, PDFs and voids
- settings and users
- staying signed in when the connection drops

Any browser console error fails a test. The tests start their own copy of Hydro in Docker (project `hydro-e2e`, ports 8100 and 5499) and delete it afterwards, so they never touch a real installation's data. Docker must be running:

```sh
cd e2e
npm install
npx playwright install chromium webkit   # first time only
npm test                                 # about a minute
npm run report                           # open the HTML report (screenshots and traces of any failures)
```

Set `E2E_KEEP=1` to leave the test copy running afterwards at http://localhost:8100.

**Schema changes**: edit `backend/app/models.py`, then run `.venv/bin/alembic revision --autogenerate -m "what changed"`. Review the generated file in `backend/alembic/versions/` and commit it.

## Layout

```
hydro/
├── backend/            FastAPI app (app/), migrations (alembic/), tests, Cloud Run Dockerfile
├── frontend/           Vite + React app; public/ holds the icon set and PWA manifest
├── scripts/            new-env.ps1, backup.ps1, restore.ps1 (Windows); backup.sh, restore.sh (Mac/Linux)
├── docs/deploy-gcp.md  moving to Cloud Run + Cloud SQL + Firebase Hosting
├── e2e/                Playwright browser tests (start their own Hydro in Docker)
├── Dockerfile          all-in-one image (frontend + API) used by docker-compose
├── docker-compose.yml  laptop deployment
└── firebase.json       Firebase Hosting config with the /api → Cloud Run rewrite
```
