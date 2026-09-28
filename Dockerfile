# Two stages: Node builds the React app, then a slim Python image serves it with the API.
# The final image contains the built files only, not Node or node_modules.

# ---- stage 1: build the web app ----
FROM node:22-alpine AS web
WORKDIR /build/frontend
# Install dependencies first, so this layer is cached until package-lock.json changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# vite.config.ts writes the build to ../app/static, i.e. /build/app/static
RUN npm run build

# ---- stage 2: the server ----
FROM python:3.11-slim

# Don't write .pyc files; flush logs immediately so `docker logs` is live.
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1

WORKDIR /srv

# Install dependencies first so Docker caches this layer when only app code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY scripts ./scripts
COPY --from=web /build/app/static ./app/static

# Run as a non-root user: a container escape then lands in an unprivileged account.
RUN useradd --create-home learnloop
USER learnloop

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
