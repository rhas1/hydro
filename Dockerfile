# All-in-one image for running Hydro on a single machine (the laptop):
# FastAPI serves the API under /api and the built frontend at /.
# For Cloud Run + Firebase, backend/Dockerfile (API only) is used instead.

FROM node:24-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 STATIC_DIR=/app/static
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install -r requirements.txt

COPY backend/alembic.ini backend/entrypoint.sh ./
COPY backend/alembic ./alembic
COPY backend/app ./app
COPY --from=web /web/dist ./static

RUN useradd --system --uid 1001 hydro
USER hydro

EXPOSE 8000
CMD ["./entrypoint.sh"]
