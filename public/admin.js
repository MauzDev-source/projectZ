const form = document.querySelector("#uploadForm");
const adminKey = document.querySelector("#adminKey");
const formStatus = document.querySelector("#formStatus");
const uploadProgress = document.querySelector("#uploadProgress");
const adminBuildGrid = document.querySelector("#adminBuildGrid");
const adminHint = document.querySelector("#adminHint");

adminKey.value = localStorage.getItem("projectzAdminKey") || "";

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

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function setStatus(message, tone = "") {
  formStatus.textContent = message;
  formStatus.dataset.tone = tone;
}

function buildCard(build) {
  return `
    <article class="build-card">
      <div>
        <p class="build-meta">${escapeHtml(build.channel)} / ${escapeHtml(build.platform)}</p>
        <h3>${escapeHtml(build.version)}</h3>
        <p>${build.notes ? escapeHtml(build.notes) : "No release notes yet."}</p>
      </div>
      <dl>
        <div><dt>Size</dt><dd>${formatBytes(build.size)}</dd></div>
        <div><dt>Date</dt><dd>${formatDate(build.createdAt)}</dd></div>
        <div><dt>Downloads</dt><dd>${build.downloadCount}</dd></div>
      </dl>
      <div class="card-actions">
        <a class="download-link" href="${build.downloadUrl}">
          <span class="action-icon" aria-hidden="true">↓</span>
          Download
        </a>
        <button class="delete-button" type="button" data-delete="${build.id}" title="Delete build">
          ×
        </button>
      </div>
    </article>
  `;
}

async function loadSiteInfo() {
  try {
    const response = await fetch("/api/site");
    const info = await response.json();

    if (!info.localDefaultAdminKey) {
      adminHint.textContent = info.adminReady
        ? "Use the ADMIN_TOKEN set on your server."
        : "Set ADMIN_TOKEN on the server before uploading builds.";
    }
  } catch {
    adminHint.textContent = "Could not read server upload settings.";
  }
}

async function loadBuilds() {
  const response = await fetch("/api/builds");
  const { builds } = await response.json();
  adminBuildGrid.innerHTML = builds.length
    ? builds.map(buildCard).join("")
    : '<article class="empty-state"><h3>No builds uploaded yet</h3><p>Publish one above to start the archive.</p></article>';
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  localStorage.setItem("projectzAdminKey", adminKey.value);
  setStatus("Uploading build...");
  uploadProgress.style.width = "0%";

  const xhr = new XMLHttpRequest();
  const data = new FormData(form);
  data.delete("adminKey");

  xhr.open("POST", "/api/admin/builds");
  xhr.setRequestHeader("x-admin-token", adminKey.value);

  xhr.upload.addEventListener("progress", (event) => {
    if (!event.lengthComputable) return;
    uploadProgress.style.width = `${Math.round((event.loaded / event.total) * 100)}%`;
  });

  xhr.addEventListener("load", async () => {
    let payload = {};
    try {
      payload = JSON.parse(xhr.responseText);
    } catch {
      payload = {};
    }

    if (xhr.status >= 200 && xhr.status < 300) {
      setStatus("Build published. The download page is updated.", "success");
      uploadProgress.style.width = "100%";
      form.reset();
      adminKey.value = localStorage.getItem("projectzAdminKey") || "";
      await loadBuilds();
      return;
    }

    setStatus(payload.error || "Upload failed.", "error");
  });

  xhr.addEventListener("error", () => {
    setStatus("Upload failed. Check the server and try again.", "error");
  });

  xhr.send(data);
});

adminBuildGrid.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-delete]");
  if (!button) return;

  const id = button.getAttribute("data-delete");
  button.disabled = true;

  const response = await fetch(`/api/admin/builds/${id}`, {
    method: "DELETE",
    headers: { "x-admin-token": adminKey.value }
  });

  if (response.ok) {
    await loadBuilds();
    setStatus("Build deleted.", "success");
    return;
  }

  const payload = await response.json().catch(() => ({}));
  setStatus(payload.error || "Could not delete build.", "error");
  button.disabled = false;
});

loadSiteInfo();
loadBuilds();

