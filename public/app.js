const buildGrid = document.querySelector("#buildGrid");
const latestDownload = document.querySelector("#latestDownload");
const latestStrip = document.querySelector("#latestStrip");

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function buildCard(build) {
  const notes = build.notes ? `<p>${escapeHtml(build.notes)}</p>` : "<p>No release notes yet.</p>";
  return `
    <article class="build-card">
      <div>
        <p class="build-meta">${escapeHtml(build.channel)} / ${escapeHtml(build.platform)}</p>
        <h3>${escapeHtml(build.version)}</h3>
        ${notes}
      </div>
      <dl>
        <div><dt>Size</dt><dd>${formatBytes(build.size)}</dd></div>
        <div><dt>Date</dt><dd>${formatDate(build.createdAt)}</dd></div>
        <div><dt>Downloads</dt><dd>${build.downloadCount}</dd></div>
      </dl>
      <a class="download-link" href="${build.downloadUrl}">
        <span class="action-icon" aria-hidden="true">↓</span>
        Download
      </a>
    </article>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function loadBuilds() {
  try {
    const response = await fetch("/api/builds");
    const { builds } = await response.json();

    if (!builds.length) return;

    const latest = builds[0];
    latestDownload.href = latest.downloadUrl;
    latestDownload.classList.remove("is-disabled");
    latestDownload.removeAttribute("aria-disabled");
    latestStrip.innerHTML = `
      <span class="status-dot"></span>
      Latest: ${escapeHtml(latest.version)} / ${escapeHtml(latest.platform)} / ${formatBytes(latest.size)}
    `;

    buildGrid.innerHTML = builds.map(buildCard).join("");
  } catch {
    latestStrip.innerHTML = '<span class="status-dot is-offline"></span> Could not load builds';
  }
}

loadBuilds();

