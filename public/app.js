// --- Auth guard ---
const token = localStorage.getItem("token");
if (!token) {
  window.location.href = "/login.html";
}

function authHeaders() {
  return { Authorization: `Bearer ${token}` };
}

function photoUrl(photoPath) {
  return `/uploads/${photoPath}?token=${encodeURIComponent(token)}`;
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
const detailPhotoError = document.getElementById("detail-photo-error");
const detailPhotoActions = document.getElementById("detail-photo-actions");
const detailReplacePhotoBtn = document.getElementById("detail-replace-photo-btn");
const detailReplacePhotoInput = document.getElementById("detail-replace-photo-input");
const userGreeting = document.getElementById("user-greeting");
const logoutBtn = document.getElementById("logout-btn");
const offlineBanner = document.getElementById("offline-banner");
const entriesOnlyCheckbox = document.getElementById("entries-only");
const themeToggle = document.getElementById("theme-toggle");
const confirmOverlay = document.getElementById("confirm-overlay");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmOk = document.getElementById("confirm-ok");
const confirmCancel = document.getElementById("confirm-cancel");

let currentDetailId = null;
let currentEntries = [];
let currentCalendar = [];

// --- Theme ---

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  themeToggle.textContent = theme === "light" ? "\u263E" : "\u2600";
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) {
    metaTheme.content = theme === "light" ? "#f5f3ef" : "#0f0f0f";
  }
}

const savedTheme = localStorage.getItem("theme") || "dark";
applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const next = current === "dark" ? "light" : "dark";
  localStorage.setItem("theme", next);
  applyTheme(next);
});

// Restore filter preference
entriesOnlyCheckbox.checked = localStorage.getItem("entriesOnly") === "true";
entriesOnlyCheckbox.addEventListener("change", () => {
  localStorage.setItem("entriesOnly", entriesOnlyCheckbox.checked);
  render();
});

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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/**
 * Build a continuous date range (today → oldest entry), rendering
 * a card for every day. Days without entries get an empty placeholder.
 */
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

  // Build a lookup: date string → entry
  const entryByDate = {};
  for (const entry of entries) {
    entryByDate[entry.date] = entry;
  }

  // Date range: today down to one month past the oldest entry
  const today = new Date(todayStr() + "T00:00:00");
  const dates = entries.map((e) => e.date);
  const oldestEntry = new Date(dates[dates.length - 1] + "T00:00:00");
  const oldest = new Date(oldestEntry);
  oldest.setMonth(oldest.getMonth() - 1);

  const allCards = []; // { date, entry? } — used for detail nav
  const day = new Date(today);
  while (day >= oldest) {
    const dateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
    const entry = entryByDate[dateStr] || null;
    allCards.push({ date: dateStr, entry });
    day.setDate(day.getDate() - 1);
  }

  // Store for prev/next navigation (includes empty slots)
  currentCalendar = allCards;

  const visibleCards = entriesOnlyCheckbox.checked
    ? allCards.filter((c) => c.entry)
    : allCards;

  let currentMonth = null;

  visibleCards.forEach(({ date, entry }) => {
    // Insert month separator when the month changes
    const month = date.slice(0, 7); // "YYYY-MM"
    if (month !== currentMonth) {
      currentMonth = month;
      const d = new Date(date + "T00:00:00");
      const label = d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      const sep = document.createElement("div");
      sep.className = "month-separator";
      sep.innerHTML = `<span>${label}</span>`;
      grid.appendChild(sep);
    }

    const card = document.createElement("div");
    card.className = entry ? "card" : "card card-empty";
    card.dataset.date = date;

    if (entry) {
      card.dataset.id = entry.id;
      const photoHtml = entry.photo
        ? `<img src="${photoUrl(entry.photo)}" alt="${escapeHtml(entry.headline)}" loading="lazy" />`
        : `<div class="card-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg></div>`;
      card.innerHTML = `
        ${photoHtml}
        <div class="card-info">
          <div class="card-date">${formatDate(date)}</div>
          <div class="card-headline">${escapeHtml(entry.headline)}</div>
        </div>
      `;
      card.addEventListener("click", () => openDetail(entry));
    } else {
      card.innerHTML = `
        <div class="card-placeholder card-placeholder-empty">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
        <div class="card-info">
          <div class="card-date">${formatDate(date)}</div>
          <div class="card-headline card-headline-empty">No entry yet</div>
        </div>
      `;
      card.addEventListener("click", () => openAddModalForDate(date));
    }

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
  entryDate.max = todayStr();
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

function openAddModalForDate(dateStr) {
  openAddModal();
  entryDate.value = dateStr;
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
  detailImg.src = entry.photo ? photoUrl(entry.photo) : "";
  detailImg.alt = entry.headline;
  detailImg.hidden = !entry.photo;
  detailPhotoUpload.hidden = !!entry.photo;
  detailPhotoActions.hidden = !entry.photo;
  detailPhotoInput.value = "";
  detailReplacePhotoInput.value = "";
  detailPhotoError.hidden = true;
  detailReplacePhotoBtn.disabled = false;
  detailReplacePhotoBtn.textContent = "Replace Photo";
  detailAddPhotoBtn.disabled = false;
  detailAddPhotoBtn.textContent = "Add Photo";
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

// --- Confirm dialog ---

function showConfirm({ title, message, confirmLabel }) {
  return new Promise((resolve) => {
    confirmTitle.textContent = title || "Are you sure?";
    confirmMessage.textContent = message || "";
    confirmOk.textContent = confirmLabel || "Delete";
    confirmOverlay.hidden = false;

    function cleanup() {
      confirmOverlay.hidden = true;
      confirmOk.removeEventListener("click", onOk);
      confirmCancel.removeEventListener("click", onCancel);
      confirmOverlay.removeEventListener("click", onBackdrop);
      document.removeEventListener("keydown", onKey);
    }

    function onOk() { cleanup(); resolve(true); }
    function onCancel() { cleanup(); resolve(false); }
    function onBackdrop(e) { if (e.target === confirmOverlay) { cleanup(); resolve(false); } }
    function onKey(e) { if (e.key === "Escape") { cleanup(); resolve(false); } }

    confirmOk.addEventListener("click", onOk);
    confirmCancel.addEventListener("click", onCancel);
    confirmOverlay.addEventListener("click", onBackdrop);
    document.addEventListener("keydown", onKey);
  });
}

detailDelete.addEventListener("click", async () => {
  if (!currentDetailId) return;

  const confirmed = await showConfirm({
    title: "Delete entry",
    message: "This entry will be permanently deleted. This cannot be undone.",
    confirmLabel: "Delete",
  });
  if (!confirmed) return;

  await deleteEntry(currentDetailId);
  closeDetail();
  await render();
});

// Photo upload in detail view (add)
detailAddPhotoBtn.addEventListener("click", () => {
  detailPhotoInput.click();
});

detailPhotoInput.addEventListener("change", async () => {
  const file = detailPhotoInput.files[0];
  if (!file || !currentDetailId) return;
  await uploadDetailPhoto(file, detailAddPhotoBtn, "Add Photo");
});

// Photo replace in detail view
detailReplacePhotoBtn.addEventListener("click", () => {
  detailReplacePhotoInput.click();
});

detailReplacePhotoInput.addEventListener("change", async () => {
  const file = detailReplacePhotoInput.files[0];
  if (!file || !currentDetailId) return;
  await uploadDetailPhoto(file, detailReplacePhotoBtn, "Replace Photo");
});

async function uploadDetailPhoto(file, btn, label) {
  detailPhotoError.hidden = true;
  btn.disabled = true;
  btn.textContent = "Uploading...";

  const formData = new FormData();
  formData.append("photo", file);

  try {
    const res = await fetch(`/api/entries/${currentDetailId}`, {
      method: "PUT",
      headers: authHeaders(),
      body: formData,
    });

    if (handleAuthError(res)) return;

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to upload photo");
    }

    const updated = await res.json();
    detailImg.src = photoUrl(updated.photo);
    detailImg.hidden = false;
    detailPhotoUpload.hidden = true;
    detailPhotoActions.hidden = false;
    await render();
  } catch (err) {
    detailPhotoError.textContent = err.message;
    detailPhotoError.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

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

// --- Offline / Online ---

function updateOnlineStatus() {
  offlineBanner.hidden = navigator.onLine;
}

window.addEventListener("online", updateOnlineStatus);
window.addEventListener("offline", updateOnlineStatus);
updateOnlineStatus();

// --- Service Worker ---

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}
