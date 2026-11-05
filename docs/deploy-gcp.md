# Deploying Hydro to Google Cloud

When you outgrow the laptop, Hydro moves to:

- **Cloud SQL for PostgreSQL**, which holds the data.
- **Cloud Run** service `hydro-api`, which runs the FastAPI backend built from `backend/Dockerfile`.
- **Firebase Hosting**, which serves the built frontend and forwards `/api/**` to Cloud Run.

Because Firebase forwards `/api/**`, the browser sees a single origin. You don't need to configure CORS, and the frontend code stays the same.

The commands below use these shell variables. Set them first:

```sh
PROJECT_ID=your-gcp-project-id
REGION=us-central1          # pick the region closest to you, e.g. asia-south1, europe-west2
DB_PASSWORD=$(openssl rand -hex 16)
```

## 1. Project setup

```sh
gcloud config set project $PROJECT_ID
gcloud services enable run.googleapis.com sqladmin.googleapis.com \
  artifactregistry.googleapis.com cloudbuild.googleapis.com secretmanager.googleapis.com
```

## 2. Cloud SQL

```sh
gcloud sql instances create hydro-db \
  --database-version=POSTGRES_17 --edition=ENTERPRISE --tier=db-f1-micro \
  --region=$REGION --storage-auto-increase --backup-start-time=20:00

gcloud sql databases create hydro --instance=hydro-db
gcloud sql users create hydro --instance=hydro-db --password="$DB_PASSWORD"
```

`db-f1-micro` is the cheapest tier and is fine for a small shop. You can resize it later without changing any code.

## 3. Secrets

Cloud Run connects to Cloud SQL through a Unix socket, so the database URL uses `host=/cloudsql/...`:

```sh
CONNECTION_NAME=$(gcloud sql instances describe hydro-db --format='value(connectionName)')

printf '%s' "postgresql+psycopg://hydro:$DB_PASSWORD@/hydro?host=/cloudsql/$CONNECTION_NAME" \
  | gcloud secrets create hydro-database-url --data-file=-
openssl rand -hex 32 | tr -d '\n' | gcloud secrets create hydro-secret-key --data-file=-

# Let the Cloud Run runtime account read secrets and connect to Cloud SQL
PROJECT_NUMBER=$(gcloud projects describe $PROJECT_ID --format='value(projectNumber)')
SA=$PROJECT_NUMBER-compute@developer.gserviceaccount.com
gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$SA --role=roles/secretmanager.secretAccessor
gcloud projects add-iam-policy-binding $PROJECT_ID --member=serviceAccount:$SA --role=roles/cloudsql.client
```

## 4. Deploy the API to Cloud Run

Run this from the repository root:

```sh
gcloud run deploy hydro-api \
  --source backend \
  --region $REGION \
  --allow-unauthenticated \
  --add-cloudsql-instances $CONNECTION_NAME \
  --set-secrets DATABASE_URL=hydro-database-url:latest,SECRET_KEY=hydro-secret-key:latest \
  --set-env-vars ENVIRONMENT=production \
  --min-instances 0 --max-instances 2
```

- `--allow-unauthenticated` lets Firebase Hosting reach the service. Hydro still requires a login for every API call except `/api/health`.
- Migrations run when the container starts. With `--max-instances` kept small, that's safe. If you scale up later, set `RUN_MIGRATIONS=0` on the service and run `alembic upgrade head` as a [Cloud Run job](https://cloud.google.com/run/docs/create-jobs) before each deploy.
- **If you are starting with an empty database**, give the first deploy an admin account by adding `INITIAL_ADMIN_EMAIL=you@example.com,INITIAL_ADMIN_PASSWORD=...` to `--set-env-vars`. After you sign in, remove both with `gcloud run services update hydro-api --region $REGION --remove-env-vars INITIAL_ADMIN_EMAIL,INITIAL_ADMIN_PASSWORD`. If you are moving existing data (step 6), skip this, because your users come with the data.

## 5. Deploy the frontend to Firebase Hosting

1. Add Firebase to the same GCP project, either in the [Firebase console](https://console.firebase.google.com/) or with `firebase projects:addfirebase $PROJECT_ID`.
2. Set your project ID in `.firebaserc`.
3. In `firebase.json`, set the `region` of the `/api/**` rewrite to your `$REGION`.

Then build and deploy:

```sh
npm install -g firebase-tools
firebase login

cd frontend && npm ci && npm run build && cd ..
firebase deploy --only hosting
```

Firebase prints the site URL (`https://<project>.web.app`). You can add your own domain under **Hosting → Add custom domain**.

`firebase.json` also sends the same security headers as the laptop setup, including a Content-Security-Policy that only allows same-origin requests. If you ever point the frontend at a different API origin with `VITE_API_BASE_URL`, add that origin to `connect-src` there. The interactive API docs may not load through the Firebase domain because of that policy; open them on the Cloud Run URL instead (`https://hydro-api-….run.app/api/docs`).

The API already sends `Cache-Control: no-store`, so Firebase's CDN never caches data. Hashed assets under `/assets/` are cached for a year, and `index.html` is always revalidated, so a new deploy takes effect immediately.

## 6. Move your data from the laptop

1. Take a final backup on the laptop with `scripts/backup.sh`, and stop selling until the move is done.
2. Restore it into Cloud SQL through the [Cloud SQL Auth Proxy](https://cloud.google.com/sql/docs/postgres/connect-auth-proxy):

   ```sh
   cloud-sql-proxy $CONNECTION_NAME --port 6543 &
   PGPASSWORD="$DB_PASSWORD" pg_restore -h 127.0.0.1 -p 6543 -U hydro -d hydro \
     --clean --if-exists --no-owner --no-privileges backups/hydro-<timestamp>.dump
   ```
   Use a `pg_restore` from PostgreSQL 17 or newer. If you don't have one installed, run it inside the laptop's database container with `docker compose exec -T db pg_restore ... < file`, using `-h host.docker.internal` to reach the proxy.

3. Redeploy or restart `hydro-api`. Migrations bring the schema up to date, and all your users, items, sales and invoice numbers carry over.

## Running the whole thing on Cloud Run instead

The root `Dockerfile` builds a single image that serves both the frontend and the API. You can deploy that to Cloud Run on its own (`gcloud run deploy hydro --source .`, with the same flags as step 4) and skip Firebase entirely. Firebase is still the better long-term setup, because it serves the frontend from a CDN and lets the API scale to zero.
