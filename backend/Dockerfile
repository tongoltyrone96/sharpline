FROM python:3.11-slim

WORKDIR /app

ENV PYTHONPATH=/app

RUN pip install --no-cache-dir --upgrade pip

COPY pyproject.toml .
RUN pip install --no-cache-dir "."

COPY . .

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
