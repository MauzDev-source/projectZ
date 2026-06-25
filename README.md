# ProjectZ Website

A game-style ProjectZ website with:

- a public page for players to download the latest build
- an admin upload page for publishing new game builds
- stored build metadata, file size, SHA-256 hash, and download counts
- local hero art saved at `public/assets/projectz-hero.png`

## Run Locally

```bash
npm install
npm start
```

Open `http://localhost:3000`.

The local admin page is `http://localhost:3000/admin.html`.

For local development, the default admin key is:

```text
projectz-admin
```

## Production Setup

Set an admin key before deploying:

```bash
ADMIN_TOKEN=choose-a-long-secret-key
NODE_ENV=production
npm start
```

Optional settings:

```bash
PORT=3000
MAX_UPLOAD_MB=2048
PROJECTZ_STORAGE_DIR=/var/data/projectz
```

Uploaded builds are stored in `uploads/builds/`, and metadata is stored in `data/builds.json`.
On a cloud host, set `PROJECTZ_STORAGE_DIR` to a persistent disk or volume path so uploaded builds survive deploys and restarts.
