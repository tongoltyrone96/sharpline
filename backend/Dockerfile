FROM python:3.11-slim

WORKDIR /app

ENV PYTHONPATH=/app

RUN pip install --no-cache-dir --upgrade pip

COPY pyproject.toml .
RUN pip install --no-cache-dir "."

COPY . .

# Run idempotent seed on every start (fills any newly-added teams like
# Parramatta Eels into the DB) then boot the API. Seed is safe to re-run.
CMD ["sh", "-c", "python scripts/seed.py && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
