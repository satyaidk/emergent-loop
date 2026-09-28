FROM python:3.11-slim

# Don't write .pyc files; flush logs immediately so `docker logs` is live.
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

WORKDIR /srv

# Install dependencies first so Docker caches this layer when only app code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scripts ./scripts

# Run as a non-root user: a container escape then lands in an unprivileged account.
RUN useradd --create-home learnloop
USER learnloop

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
