// --- Auth guard ---
const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "/login.html";
}

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

// Handle 401 responses globally — redirect to login
function handleAuthError(res) {
  if (res.status === 401) {
    localStorage.removeItem("token");
    localStorage.removeItem("userName");
    window.location.href = "/login.html";
    return true;
  }
  return false;
}

// --- DOM refs ---

const grid = document.getElementById("grid");
const emptyState = document.getElementById("empty-state");
const addBtn = document.getElementById("add-btn");
const modalOverlay = document.getElementById("modal-overlay");
const modalClose = document.getElementById("modal-close");
const modalTitle = document.getElementById("modal-title");
const entryForm = document.getElementById("entry-form");
const entryId = document.getElementById("entry-id");
const entryDate = document.getElementById("entry-date");
const entryHeadline = document.getElementById("entry-headline");
const entryPhoto = document.getElementById("entry-photo");
const charCount = document.getElementById("char-count");
const photoPreview = document.getElementById("photo-preview");
const previewImg = document.getElementById("preview-img");
const formError = document.getElementById("form-error");
const submitBtn = document.getElementById("submit-btn");
const detailOverlay = document.getElementById("detail-overlay");
const detailClose = document.getElementById("detail-close");
const detailImg = document.getElementById("detail-img");
const detailPhotoUpload = document.getElementById("detail-photo-upload");
const detailAddPhotoBtn = document.getElementById("detail-add-photo-btn");
const detailPhotoInput = document.getElementById("detail-photo-input");
const detailHeadline = document.getElementById("detail-headline");
const detailHeadlineInput = document.getElementById("detail-headline-input");
const detailDate = document.getElementById("detail-date");
const detailDelete = document.getElementById("detail-delete");
const detailPrev = document.getElementById("detail-prev");
const detailNext = document.getElementById("detail-next");
const userGreeting = document.getElementById("user-greeting");
const logoutBtn = document.getElementById("logout-btn");

let currentDetailId = null;
let currentEntries = [];

// --- User greeting & logout ---

const userName = localStorage.getItem("userName");
if (userName) {
  userGreeting.textContent = `Hi, ${userName}`;
}

logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("token");
  localStorage.removeItem("userName");
  window.location.href = "/login.html";
});

// --- Date helpers ---

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function todayStr() {
  const d = new Date();
  return d.toISOString().split("T")[0];
}

// --- API ---

async function fetchEntries() {
  const res = await fetch("/api/entries", {
    headers: authHeaders(),
  });
  if (handleAuthError(res)) return [];
  return res.json();
}

async function createEntry(formData) {
  const res = await fetch("/api/entries", {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  handleAuthError(res);
  return res;
}

async function deleteEntry(id) {
  const res = await fetch(`/api/entries/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  handleAuthError(res);
  return res;
}

async function updateEntry(id, data) {
  const res = await fetch(`/api/entries/${id}`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  handleAuthError(res);
  return res;
}

// --- Render ---

async function render() {
  const entries = await fetchEntries();
  currentEntries = entries;

  grid.innerHTML = "";

  if (entries.length === 0) {
    emptyState.hidden = false;
    grid.hidden = true;
    return;
  }

  emptyState.hidden = true;
  grid.hidden = false;

  entries.forEach((entry) => {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = entry.id;
    const photoHtml = entry.photo
      ? `<img src="/uploads/${entry.photo}" alt="${escapeHtml(entry.headline)}" loading="lazy" />`
      : `<div class="card-placeholder"></div>`;
    card.innerHTML = `
      ${photoHtml}
      <div class="card-info">
        <div class="card-date">${formatDate(entry.date)}</div>
        <div class="card-headline">${escapeHtml(entry.headline)}</div>
      </div>
    `;
    card.addEventListener("click", () => openDetail(entry));
    grid.appendChild(card);
  });
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// --- Add Modal ---

function openAddModal() {
  modalTitle.textContent = "Add a Day";
  entryId.value = "";
  entryDate.value = todayStr();
  entryHeadline.value = "";
  entryPhoto.value = "";
  entryPhoto.required = false;
  photoPreview.hidden = true;
  formError.hidden = true;
  charCount.textContent = "(0 / 300)";
  submitBtn.textContent = "Save";
  submitBtn.disabled = false;
  modalOverlay.hidden = false;
}

function closeAddModal() {
  modalOverlay.hidden = true;
}

addBtn.addEventListener("click", openAddModal);
modalClose.addEventListener("click", closeAddModal);
modalOverlay.addEventListener("click", (e) => {
  if (e.target === modalOverlay) closeAddModal();
});

// Character counter
entryHeadline.addEventListener("input", () => {
  const len = entryHeadline.value.length;
  charCount.textContent = `(${len} / 300)`;
});

// Photo preview
entryPhoto.addEventListener("change", () => {
  const file = entryPhoto.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    previewImg.src = url;
    photoPreview.hidden = false;
  } else {
    photoPreview.hidden = true;
  }
});

// Form submit
entryForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  formError.hidden = true;
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving...";

  const formData = new FormData();
  formData.append("date", entryDate.value);
  formData.append("headline", entryHeadline.value);

  if (entryPhoto.files[0]) {
    formData.append("photo", entryPhoto.files[0]);
  }

  try {
    const res = await createEntry(formData);
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to save entry");
    }
    closeAddModal();
    await render();
  } catch (err) {
    formError.textContent = err.message;
    formError.hidden = false;
    submitBtn.disabled = false;
    submitBtn.textContent = "Save";
  }
});

// --- Detail Modal ---

function openDetail(entry) {
  currentDetailId = entry.id;
  detailImg.src = entry.photo ? `/uploads/${entry.photo}` : "";
  detailImg.alt = entry.headline;
  detailImg.hidden = !entry.photo;
  detailPhotoUpload.hidden = !!entry.photo;
  detailPhotoInput.value = "";
  detailHeadline.textContent = entry.headline;
  detailHeadline.hidden = false;
  detailHeadlineInput.hidden = true;
  detailDate.textContent = formatDate(entry.date);
  detailOverlay.hidden = false;
  updateNavButtons();
}

function updateNavButtons() {
  const idx = currentEntries.findIndex((e) => e.id === currentDetailId);
  detailPrev.disabled = idx <= 0;
  detailNext.disabled = idx === -1 || idx >= currentEntries.length - 1;
}

function closeDetail() {
  detailOverlay.hidden = true;
  currentDetailId = null;
}

detailClose.addEventListener("click", closeDetail);
detailOverlay.addEventListener("click", (e) => {
  if (e.target === detailOverlay) closeDetail();
});

detailPrev.addEventListener("click", () => navigateDetail(-1));
detailNext.addEventListener("click", () => navigateDetail(1));

detailDelete.addEventListener("click", async () => {
  if (!currentDetailId) return;
  if (!confirm("Delete this entry? This cannot be undone.")) return;

  await deleteEntry(currentDetailId);
  closeDetail();
  await render();
});

// Photo upload in detail view
detailAddPhotoBtn.addEventListener("click", () => {
  detailPhotoInput.click();
});

detailPhotoInput.addEventListener("change", async () => {
  const file = detailPhotoInput.files[0];
  if (!file || !currentDetailId) return;

  const formData = new FormData();
  formData.append("photo", file);

  const res = await fetch(`/api/entries/${currentDetailId}`, {
    method: "PUT",
    headers: authHeaders(),
    body: formData,
  });

  if (handleAuthError(res)) return;

  if (res.ok) {
    const updated = await res.json();
    detailImg.src = `/uploads/${updated.photo}`;
    detailImg.hidden = false;
    detailPhotoUpload.hidden = true;
    await render();
  }
});

// Inline headline editing
detailHeadline.addEventListener("click", () => {
  detailHeadline.hidden = true;
  detailHeadlineInput.value = detailHeadline.textContent;
  detailHeadlineInput.hidden = false;
  detailHeadlineInput.focus();
  detailHeadlineInput.select();
});

async function saveHeadline() {
  const newHeadline = detailHeadlineInput.value.trim();
  if (!newHeadline || newHeadline === detailHeadline.textContent) {
    detailHeadlineInput.hidden = true;
    detailHeadline.hidden = false;
    return;
  }

  const res = await updateEntry(currentDetailId, { headline: newHeadline });
  if (res.ok) {
    detailHeadline.textContent = newHeadline;
  }
  detailHeadlineInput.hidden = true;
  detailHeadline.hidden = false;
  await render();
}

detailHeadlineInput.addEventListener("blur", saveHeadline);
detailHeadlineInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    detailHeadlineInput.blur();
  }
  if (e.key === "Escape") {
    detailHeadlineInput.value = detailHeadline.textContent;
    detailHeadlineInput.blur();
  }
});

// --- Keyboard ---

function navigateDetail(direction) {
  if (!currentDetailId || currentEntries.length === 0) return;
  const idx = currentEntries.findIndex((e) => e.id === currentDetailId);
  if (idx === -1) return;
  const nextIdx = idx + direction;
  if (nextIdx < 0 || nextIdx >= currentEntries.length) return;
  openDetail(currentEntries[nextIdx]);
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!detailOverlay.hidden) closeDetail();
    else if (!modalOverlay.hidden) closeAddModal();
    return;
  }

  if (document.activeElement === detailHeadlineInput) return;

  if (!detailOverlay.hidden) {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      navigateDetail(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      navigateDetail(1);
    }
  }
});

// --- Init ---

render();
