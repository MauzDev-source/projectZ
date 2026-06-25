const compression = require("compression");
const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const multer = require("multer");

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const publicDir = path.join(rootDir, "public");
const storageDir = process.env.PROJECTZ_STORAGE_DIR
  ? path.resolve(process.env.PROJECTZ_STORAGE_DIR)
  : rootDir;
const dataDir = process.env.PROJECTZ_DATA_DIR
  ? path.resolve(process.env.PROJECTZ_DATA_DIR)
  : path.join(storageDir, "data");
const uploadDir = process.env.PROJECTZ_UPLOAD_DIR
  ? path.resolve(process.env.PROJECTZ_UPLOAD_DIR)
  : path.join(storageDir, "uploads", "builds");
const buildsFile = path.join(dataDir, "builds.json");
const maxUploadMb = Number(process.env.MAX_UPLOAD_MB || 2048);
const maxUploadBytes = maxUploadMb * 1024 * 1024;
const isProduction = process.env.NODE_ENV === "production";
const adminToken = process.env.ADMIN_TOKEN || (isProduction ? "" : "projectz-admin");

const allowedExtensions = new Set([
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
  ".tgz",
  ".exe",
  ".msi",
  ".dmg",
  ".pkg",
  ".apk",
  ".ipa"
]);

app.use(compression());
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        formAction: ["'self'"],
        imgSrc: ["'self'", "data:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"]
      }
    }
  })
);
app.use(express.json());
app.use(express.static(publicDir, { extensions: ["html"], maxAge: "1h" }));

const storage = multer.diskStorage({
  destination: (_req, _file, done) => done(null, uploadDir),
  filename: (_req, file, done) => {
    const ext = path.extname(file.originalname).toLowerCase();
    done(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: maxUploadBytes },
  fileFilter: (_req, file, done) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!allowedExtensions.has(ext)) {
      const error = new Error(`Unsupported build type. Use ${Array.from(allowedExtensions).join(", ")}.`);
      error.status = 400;
      done(error);
      return;
    }
    done(null, true);
  }
});

async function ensureStorage() {
  await fsp.mkdir(dataDir, { recursive: true });
  await fsp.mkdir(uploadDir, { recursive: true });

  try {
    await fsp.access(buildsFile, fs.constants.F_OK);
  } catch {
    await fsp.writeFile(buildsFile, "[]\n", "utf8");
  }
}

async function readBuilds() {
  const raw = await fsp.readFile(buildsFile, "utf8");
  const builds = JSON.parse(raw);
  return Array.isArray(builds) ? builds : [];
}

async function writeBuilds(builds) {
  await fsp.writeFile(buildsFile, `${JSON.stringify(builds, null, 2)}\n`, "utf8");
}

function publicBuild(build) {
  return {
    id: build.id,
    version: build.version,
    platform: build.platform,
    channel: build.channel,
    notes: build.notes,
    originalName: build.originalName,
    size: build.size,
    sha256: build.sha256,
    createdAt: build.createdAt,
    downloadCount: build.downloadCount || 0,
    downloadUrl: `/download/${build.id}`
  };
}

function safeName(value, fallback) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return cleaned || fallback;
}

function requireAdmin(req, res, next) {
  if (!adminToken) {
    res.status(503).json({
      error: "Admin uploads are disabled until ADMIN_TOKEN is set on the server."
    });
    return;
  }

  const token = req.get("x-admin-token");
  if (token !== adminToken) {
    res.status(401).json({ error: "Invalid admin key." });
    return;
  }

  next();
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

app.get("/api/site", (_req, res) => {
  res.json({
    adminReady: Boolean(adminToken),
    localDefaultAdminKey: !isProduction && adminToken === "projectz-admin",
    maxUploadMb,
    allowedExtensions: Array.from(allowedExtensions)
  });
});

app.get("/api/builds", async (_req, res, next) => {
  try {
    const builds = await readBuilds();
    res.json({ builds: builds.map(publicBuild) });
  } catch (error) {
    next(error);
  }
});

app.get("/api/admin/status", requireAdmin, async (_req, res, next) => {
  try {
    const builds = await readBuilds();
    res.json({ ok: true, buildCount: builds.length, maxUploadMb });
  } catch (error) {
    next(error);
  }
});

app.post("/api/admin/builds", requireAdmin, upload.single("build"), async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: "Choose a ProjectZ build file to upload." });
      return;
    }

    const id = crypto.randomUUID();
    const ext = path.extname(req.file.originalname).toLowerCase();
    const storedName = `${id}${ext}`;
    const storedPath = path.join(uploadDir, storedName);

    await fsp.rename(req.file.path, storedPath);

    const build = {
      id,
      version: safeName(req.body.version, "Unversioned"),
      platform: safeName(req.body.platform, "Windows"),
      channel: safeName(req.body.channel, "Public"),
      notes: String(req.body.notes || "").trim().slice(0, 2000),
      originalName: safeName(req.file.originalname, `ProjectZ-${id}${ext}`),
      storedName,
      size: req.file.size,
      sha256: await hashFile(storedPath),
      createdAt: new Date().toISOString(),
      downloadCount: 0
    };

    const builds = await readBuilds();
    builds.unshift(build);
    await writeBuilds(builds);

    res.status(201).json({ build: publicBuild(build) });
  } catch (error) {
    if (req.file?.path) {
      await fsp.rm(req.file.path, { force: true }).catch(() => {});
    }
    next(error);
  }
});

app.delete("/api/admin/builds/:id", requireAdmin, async (req, res, next) => {
  try {
    const builds = await readBuilds();
    const index = builds.findIndex((build) => build.id === req.params.id);

    if (index === -1) {
      res.status(404).json({ error: "Build not found." });
      return;
    }

    const [build] = builds.splice(index, 1);
    await writeBuilds(builds);
    await fsp.rm(path.join(uploadDir, build.storedName), { force: true });
    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
});

app.get("/download/:id", async (req, res, next) => {
  try {
    const builds = await readBuilds();
    const index = builds.findIndex((build) => build.id === req.params.id);

    if (index === -1) {
      res.status(404).send("Build not found.");
      return;
    }

    const build = builds[index];
    const filePath = path.join(uploadDir, build.storedName);
    await fsp.access(filePath, fs.constants.R_OK);

    builds[index] = {
      ...build,
      downloadCount: (build.downloadCount || 0) + 1
    };
    await writeBuilds(builds);

    res.download(filePath, build.originalName);
  } catch (error) {
    next(error);
  }
});

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use((error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    res.status(400).json({ error: error.message });
    return;
  }

  const status = error.status || 500;
  const message = status >= 500 ? "Server error." : error.message;
  console.error(error);
  res.status(status).json({ error: message });
});

ensureStorage()
  .then(() => {
    app.listen(port, () => {
      console.log(`ProjectZ website running at http://localhost:${port}`);
      if (!isProduction && adminToken === "projectz-admin") {
        console.log("Local admin key: projectz-admin");
      }
    });
  })
  .catch((error) => {
    console.error("Failed to start ProjectZ website:", error);
    process.exit(1);
  });
