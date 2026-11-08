# API-only image, used for Cloud Run (the frontend lives on Firebase Hosting).
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /app

COPY requirements.txt .
RUN pip install -r requirements.txt

COPY alembic.ini entrypoint.sh ./
COPY alembic ./alembic
COPY app ./app

# Strip Windows (CRLF) line endings in case the script was edited on Windows,
# and run it through sh so it doesn't need the executable bit.
RUN sed -i 's/\r$//' entrypoint.sh && useradd --system --uid 1001 hydro
USER hydro

EXPOSE 8000
CMD ["sh", "./entrypoint.sh"]
