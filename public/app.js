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

function mediaUrl(mediaPath) {
  return `/uploads/${mediaPath}?token=${encodeURIComponent(token)}`;
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
const photoCameraBtn = document.getElementById("photo-camera-btn");
const photoGalleryBtn = document.getElementById("photo-gallery-btn");
const charCount = document.getElementById("char-count");
const photoPreview = document.getElementById("photo-preview");
const previewImg = document.getElementById("preview-img");
const formError = document.getElementById("form-error");
const submitBtn = document.getElementById("submit-btn");
const detailOverlay = document.getElementById("detail-overlay");
const detailClose = document.getElementById("detail-close");
const detailImg = document.getElementById("detail-img");
const detailImgContainer = document.getElementById("detail-img-container");
const magnifier = document.getElementById("magnifier");
const detailPhotoUpload = document.getElementById("detail-photo-upload");
const detailAddCameraBtn = document.getElementById("detail-add-camera-btn");
const detailAddGalleryBtn = document.getElementById("detail-add-gallery-btn");
const detailPhotoInput = document.getElementById("detail-photo-input");
const detailHeadline = document.getElementById("detail-headline");
const detailHeadlineInput = document.getElementById("detail-headline-input");
const detailDate = document.getElementById("detail-date");
const detailDateInput = document.getElementById("detail-date-input");
const detailDelete = document.getElementById("detail-delete");
const detailPrev = document.getElementById("detail-prev");
const detailNext = document.getElementById("detail-next");
const detailPhotoError = document.getElementById("detail-photo-error");
const detailPhotoActions = document.getElementById("detail-photo-actions");
const detailReplaceCameraBtn = document.getElementById("detail-replace-camera-btn");
const detailReplaceGalleryBtn = document.getElementById("detail-replace-gallery-btn");
const detailReplacePhotoInput = document.getElementById("detail-replace-photo-input");
const detailOnThisDay = document.getElementById("detail-onthisday");
const detailOnThisDayLabel = document.getElementById("detail-onthisday-label");
const detailVideo = document.getElementById("detail-video");
const detailVideoContainer = document.getElementById("detail-video-container");
const detailVideoUpload = document.getElementById("detail-video-upload");
const detailAddVideoBtn = document.getElementById("detail-add-video-btn");
const detailVideoInput = document.getElementById("detail-video-input");
const detailVideoActions = document.getElementById("detail-video-actions");
const detailReplaceVideoBtn = document.getElementById("detail-replace-video-btn");
const detailRemoveVideoBtn = document.getElementById("detail-remove-video-btn");
const detailReplaceVideoInput = document.getElementById("detail-replace-video-input");
const entryVideo = document.getElementById("entry-video");
const videoSelectBtn = document.getElementById("video-select-btn");
const videoPreview = document.getElementById("video-preview");
const previewVideo = document.getElementById("preview-video");
const userGreeting = document.getElementById("user-greeting");
const logoutBtn = document.getElementById("logout-btn");
const offlineBanner = document.getElementById("offline-banner");
const entriesOnlyCheckbox = document.getElementById("entries-only");
const entryCountEl = document.getElementById("entry-count");
const themeToggle = document.getElementById("theme-toggle");
const confirmOverlay = document.getElementById("confirm-overlay");
const confirmTitle = document.getElementById("confirm-title");
const confirmMessage = document.getElementById("confirm-message");
const confirmOk = document.getElementById("confirm-ok");
const confirmCancel = document.getElementById("confirm-cancel");

let currentDetailId = null;
let currentDetailDate = null;
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
    entryCountEl.hidden = true;
    return;
  }

  emptyState.hidden = true;
  grid.hidden = false;
  entryCountEl.textContent = entries.length === 1
    ? "1 entry"
    : `${entries.length} entries`;
  entryCountEl.hidden = false;

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
      const videoIndicator = entry.video
        ? `<div class="card-video-badge"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>`
        : "";
      card.innerHTML = `
        ${photoHtml}
        ${videoIndicator}
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
  entryVideo.value = "";
  cameraFile = null;
  entryPhoto.required = false;
  photoPreview.hidden = true;
  videoPreview.hidden = true;
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

// --- Camera Capture Modal ---

const cameraOverlay = document.getElementById("camera-overlay");
const cameraClose = document.getElementById("camera-close");
const cameraVideo = document.getElementById("camera-video");
const cameraCanvas = document.getElementById("camera-canvas");
const cameraPreviewImg = document.getElementById("camera-preview");
const cameraError = document.getElementById("camera-error");
const cameraCaptureBtn = document.getElementById("camera-capture-btn");
const cameraSwitchBtn = document.getElementById("camera-switch-btn");
const cameraRetakeBtn = document.getElementById("camera-retake-btn");
const cameraUseBtn = document.getElementById("camera-use-btn");
const cameraLiveControls = document.getElementById("camera-live-controls");
const cameraReviewControls = document.getElementById("camera-review-controls");

let cameraStream = null;
let cameraFacingMode = "environment"; // start with rear camera
let cameraCapturedBlob = null;
let cameraResolve = null; // promise resolve for the captured file

/**
 * Open the camera modal and return a Promise that resolves with a File
 * (the captured photo) or null if the user cancels.
 */
function openCamera() {
  return new Promise((resolve) => {
    cameraResolve = resolve;
    cameraCapturedBlob = null;
    cameraPreviewImg.hidden = true;
    cameraPreviewImg.src = "";
    cameraVideo.hidden = false;
    cameraError.hidden = true;
    cameraLiveControls.hidden = false;
    cameraReviewControls.hidden = true;
    cameraOverlay.hidden = false;
    startCameraStream();
  });
}

async function startCameraStream() {
  // Stop any existing stream
  stopCameraStream();

  try {
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: cameraFacingMode, width: { ideal: 1920 }, height: { ideal: 1440 } },
      audio: false,
    });
    cameraVideo.srcObject = cameraStream;
    cameraVideo.hidden = false;
    cameraError.hidden = true;
  } catch (err) {
    cameraVideo.hidden = true;
    cameraError.textContent = "Kamera konnte nicht gestartet werden. Bitte Berechtigung erteilen.";
    cameraError.hidden = false;
  }
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach((t) => t.stop());
    cameraStream = null;
  }
  cameraVideo.srcObject = null;
}

function closeCamera(result) {
  stopCameraStream();
  cameraOverlay.hidden = true;
  if (cameraResolve) {
    cameraResolve(result || null);
    cameraResolve = null;
  }
}

cameraCaptureBtn.addEventListener("click", () => {
  if (!cameraStream) return;
  const track = cameraStream.getVideoTracks()[0];
  const settings = track.getSettings();
  const w = settings.width || cameraVideo.videoWidth;
  const h = settings.height || cameraVideo.videoHeight;

  cameraCanvas.width = w;
  cameraCanvas.height = h;
  const ctx = cameraCanvas.getContext("2d");
  ctx.drawImage(cameraVideo, 0, 0, w, h);

  // Show preview
  const dataUrl = cameraCanvas.toDataURL("image/jpeg", 0.92);
  cameraPreviewImg.src = dataUrl;
  cameraPreviewImg.hidden = false;
  cameraVideo.hidden = true;
  cameraLiveControls.hidden = true;
  cameraReviewControls.hidden = false;

  // Convert to blob
  cameraCanvas.toBlob((blob) => {
    cameraCapturedBlob = blob;
  }, "image/jpeg", 0.92);
});

cameraSwitchBtn.addEventListener("click", () => {
  cameraFacingMode = cameraFacingMode === "environment" ? "user" : "environment";
  startCameraStream();
});

cameraRetakeBtn.addEventListener("click", () => {
  cameraCapturedBlob = null;
  cameraPreviewImg.hidden = true;
  cameraPreviewImg.src = "";
  cameraVideo.hidden = false;
  cameraLiveControls.hidden = false;
  cameraReviewControls.hidden = true;
  startCameraStream();
});

cameraUseBtn.addEventListener("click", () => {
  if (!cameraCapturedBlob) return;
  const file = new File([cameraCapturedBlob], "camera-photo.jpg", { type: "image/jpeg" });
  closeCamera(file);
});

cameraClose.addEventListener("click", () => closeCamera(null));
cameraOverlay.addEventListener("click", (e) => {
  if (e.target === cameraOverlay) closeCamera(null);
});

// Track camera-captured file separately for the Add modal
let cameraFile = null;

// Photo buttons — camera vs gallery (Add modal)
photoCameraBtn.addEventListener("click", async () => {
  const file = await openCamera();
  if (file) {
    cameraFile = file;
    entryPhoto.value = ""; // clear gallery selection
    const url = URL.createObjectURL(file);
    previewImg.src = url;
    photoPreview.hidden = false;
  }
});

photoGalleryBtn.addEventListener("click", () => {
  entryPhoto.click();
});

// Photo preview from gallery
entryPhoto.addEventListener("change", () => {
  const file = entryPhoto.files[0];
  if (file) {
    cameraFile = null; // clear camera selection
    const url = URL.createObjectURL(file);
    previewImg.src = url;
    photoPreview.hidden = false;
  } else {
    photoPreview.hidden = true;
  }
});

// Video select button (Add modal)
videoSelectBtn.addEventListener("click", () => {
  entryVideo.click();
});

entryVideo.addEventListener("change", () => {
  const file = entryVideo.files[0];
  if (file) {
    const url = URL.createObjectURL(file);
    previewVideo.src = url;
    videoPreview.hidden = false;
  } else {
    videoPreview.hidden = true;
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

  const photoFile = entryPhoto.files[0] || cameraFile;
  if (photoFile) {
    formData.append("photo", photoFile);
  }

  const videoFile = entryVideo.files[0];
  if (videoFile) {
    formData.append("video", videoFile);
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
  detailImgContainer.hidden = !entry.photo;
  magnifier.hidden = true;
  detailPhotoUpload.hidden = !!entry.photo;
  detailPhotoActions.hidden = !entry.photo;
  detailPhotoInput.value = "";
  detailReplacePhotoInput.value = "";
  detailPhotoError.hidden = true;

  // Video
  if (entry.video) {
    detailVideo.src = mediaUrl(entry.video);
    detailVideoContainer.hidden = false;
    detailVideoUpload.hidden = true;
    detailVideoActions.hidden = false;
  } else {
    detailVideo.src = "";
    detailVideo.pause();
    detailVideoContainer.hidden = true;
    detailVideoUpload.hidden = false;
    detailVideoActions.hidden = true;
  }
  detailVideoInput.value = "";
  detailReplaceVideoInput.value = "";

  currentDetailDate = entry.date;
  detailDate.textContent = formatDate(entry.date);
  detailDate.hidden = false;
  detailDateInput.hidden = true;
  detailHeadline.textContent = entry.headline;
  detailHeadline.hidden = false;
  detailHeadlineInput.hidden = true;
  detailOverlay.hidden = false;
  updateNavButtons();
  updateOnThisDayButton(entry.date);
}

function updateNavButtons() {
  const idx = currentEntries.findIndex((e) => e.id === currentDetailId);
  detailPrev.disabled = idx <= 0;
  detailNext.disabled = idx === -1 || idx >= currentEntries.length - 1;
}

function closeDetail() {
  detailOverlay.hidden = true;
  currentDetailId = null;
  detailVideo.pause();
  detailVideo.src = "";
}

detailClose.addEventListener("click", closeDetail);
detailOverlay.addEventListener("click", (e) => {
  if (e.target === detailOverlay) closeDetail();
});

detailPrev.addEventListener("click", () => navigateDetail(-1));
detailNext.addEventListener("click", () => navigateDetail(1));

// --- On This Day ---

function getOnThisDayEntries(currentDate) {
  // currentDate is "YYYY-MM-DD"
  const monthDay = currentDate.slice(5); // "MM-DD"
  return currentEntries.filter(
    (e) => e.date.slice(5) === monthDay && e.date !== currentDate
  ).sort((a, b) => b.date.localeCompare(a.date)); // newest first
}

function updateOnThisDayButton(currentDate) {
  const matches = getOnThisDayEntries(currentDate);
  if (matches.length === 0) {
    detailOnThisDay.hidden = true;
    return;
  }
  detailOnThisDay.hidden = false;
  const years = matches.map((e) => e.date.slice(0, 4));
  detailOnThisDayLabel.textContent = matches.length === 1
    ? `On This Day (${years[0]})`
    : `On This Day (${matches.length} years)`;
}

detailOnThisDay.addEventListener("click", () => {
  if (!currentDetailId) return;
  const current = currentEntries.find((e) => e.id === currentDetailId);
  if (!current) return;
  const matches = getOnThisDayEntries(current.date);
  if (matches.length === 0) return;
  // Find the next year to show: cycle through matches
  // If current entry is already one of the "on this day" entries,
  // find the next one in the cycle
  const allSameDay = [
    ...currentEntries.filter(
      (e) => e.date.slice(5) === current.date.slice(5)
    )
  ].sort((a, b) => b.date.localeCompare(a.date)); // newest first
  const currentIdx = allSameDay.findIndex((e) => e.id === currentDetailId);
  const nextIdx = (currentIdx + 1) % allSameDay.length;
  openDetail(allSameDay[nextIdx]);
});

// --- Magnifying Glass ---

const MAGNIFIER_SIZE = 150;  // matches CSS width/height
const ZOOM_LEVEL = 2.5;      // how much to zoom in

function updateMagnifier(clientX, clientY) {
  const rect = detailImg.getBoundingClientRect();

  // Cursor position relative to the image element
  const x = clientX - rect.left;
  const y = clientY - rect.top;

  // Bail if cursor is outside the image bounds
  if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
    magnifier.hidden = true;
    return;
  }

  magnifier.hidden = false;

  // Position the magnifier centered on the cursor (relative to container)
  const containerRect = detailImgContainer.getBoundingClientRect();
  magnifier.style.left = (clientX - containerRect.left) + "px";
  magnifier.style.top = (clientY - containerRect.top) + "px";

  // The image may be letterboxed (object-fit: contain), so we need
  // to find the actual rendered image area within the <img> element.
  const naturalW = detailImg.naturalWidth;
  const naturalH = detailImg.naturalHeight;

  if (!naturalW || !naturalH) return;

  const imgAspect = naturalW / naturalH;
  const elemAspect = rect.width / rect.height;

  let renderedW, renderedH, offsetX, offsetY;

  if (imgAspect > elemAspect) {
    // Image is wider — letterboxed top/bottom
    renderedW = rect.width;
    renderedH = rect.width / imgAspect;
    offsetX = 0;
    offsetY = (rect.height - renderedH) / 2;
  } else {
    // Image is taller — pillarboxed left/right
    renderedH = rect.height;
    renderedW = rect.height * imgAspect;
    offsetX = (rect.width - renderedW) / 2;
    offsetY = 0;
  }

  // Cursor position within the actual rendered image (0..1)
  const imgX = (x - offsetX) / renderedW;
  const imgY = (y - offsetY) / renderedH;

  // If cursor is in the letterbox/pillarbox area, hide magnifier
  if (imgX < 0 || imgX > 1 || imgY < 0 || imgY > 1) {
    magnifier.hidden = true;
    return;
  }

  // Background: the same image, scaled up by ZOOM_LEVEL
  const bgW = renderedW * ZOOM_LEVEL;
  const bgH = renderedH * ZOOM_LEVEL;

  // Background position: center the zoomed area on the cursor
  const bgX = -(imgX * bgW) + (MAGNIFIER_SIZE / 2);
  const bgY = -(imgY * bgH) + (MAGNIFIER_SIZE / 2);

  magnifier.style.backgroundImage = `url('${detailImg.src}')`;
  magnifier.style.backgroundSize = `${bgW}px ${bgH}px`;
  magnifier.style.backgroundPosition = `${bgX}px ${bgY}px`;
}

// Mouse events
detailImgContainer.addEventListener("mousemove", (e) => {
  updateMagnifier(e.clientX, e.clientY);
});

detailImgContainer.addEventListener("mouseleave", () => {
  magnifier.hidden = true;
});

// Touch events (long-press to activate, move to pan)
let touchActive = false;
let longPressTimer = null;

detailImgContainer.addEventListener("touchstart", (e) => {
  if (e.touches.length !== 1) return;
  const touch = e.touches[0];
  longPressTimer = setTimeout(() => {
    touchActive = true;
    updateMagnifier(touch.clientX, touch.clientY);
    e.preventDefault();
  }, 300);
}, { passive: false });

detailImgContainer.addEventListener("touchmove", (e) => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  if (!touchActive) return;
  e.preventDefault();
  const touch = e.touches[0];
  updateMagnifier(touch.clientX, touch.clientY);
}, { passive: false });

detailImgContainer.addEventListener("touchend", () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  touchActive = false;
  magnifier.hidden = true;
});

detailImgContainer.addEventListener("touchcancel", () => {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
  touchActive = false;
  magnifier.hidden = true;
});

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

// Photo upload in detail view (add) — camera or gallery
detailAddCameraBtn.addEventListener("click", async () => {
  const file = await openCamera();
  if (file && currentDetailId) {
    await uploadDetailPhoto(file);
  }
});

detailAddGalleryBtn.addEventListener("click", () => {
  detailPhotoInput.click();
});

detailPhotoInput.addEventListener("change", async () => {
  const file = detailPhotoInput.files[0];
  if (!file || !currentDetailId) return;
  await uploadDetailPhoto(file);
});

// Photo replace in detail view — camera or gallery
detailReplaceCameraBtn.addEventListener("click", async () => {
  const file = await openCamera();
  if (file && currentDetailId) {
    await uploadDetailPhoto(file);
  }
});

detailReplaceGalleryBtn.addEventListener("click", () => {
  detailReplacePhotoInput.click();
});

detailReplacePhotoInput.addEventListener("change", async () => {
  const file = detailReplacePhotoInput.files[0];
  if (!file || !currentDetailId) return;
  await uploadDetailPhoto(file);
});

async function uploadDetailPhoto(file) {
  detailPhotoError.hidden = true;

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
    detailImgContainer.hidden = false;
    detailPhotoUpload.hidden = true;
    detailPhotoActions.hidden = false;
    await render();
  } catch (err) {
    detailPhotoError.textContent = err.message;
    detailPhotoError.hidden = false;
  }
}

// Video upload in detail view (add)
detailAddVideoBtn.addEventListener("click", () => {
  detailVideoInput.click();
});

detailVideoInput.addEventListener("change", async () => {
  const file = detailVideoInput.files[0];
  if (!file || !currentDetailId) return;
  await uploadDetailVideo(file);
});

// Video replace in detail view
detailReplaceVideoBtn.addEventListener("click", () => {
  detailReplaceVideoInput.click();
});

detailReplaceVideoInput.addEventListener("change", async () => {
  const file = detailReplaceVideoInput.files[0];
  if (!file || !currentDetailId) return;
  await uploadDetailVideo(file);
});

// Video remove
detailRemoveVideoBtn.addEventListener("click", async () => {
  if (!currentDetailId) return;
  detailPhotoError.hidden = true;

  try {
    const formData = new FormData();
    formData.append("removeVideo", "true");

    const res = await fetch(`/api/entries/${currentDetailId}`, {
      method: "PUT",
      headers: authHeaders(),
      body: formData,
    });

    if (handleAuthError(res)) return;

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to remove video");
    }

    detailVideo.pause();
    detailVideo.src = "";
    detailVideoContainer.hidden = true;
    detailVideoUpload.hidden = false;
    detailVideoActions.hidden = true;
    await render();
  } catch (err) {
    detailPhotoError.textContent = err.message;
    detailPhotoError.hidden = false;
  }
});

async function uploadDetailVideo(file) {
  detailPhotoError.hidden = true;

  const formData = new FormData();
  formData.append("video", file);

  try {
    const res = await fetch(`/api/entries/${currentDetailId}`, {
      method: "PUT",
      headers: authHeaders(),
      body: formData,
    });

    if (handleAuthError(res)) return;

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || "Failed to upload video");
    }

    const updated = await res.json();
    detailVideo.src = mediaUrl(updated.video);
    detailVideoContainer.hidden = false;
    detailVideoUpload.hidden = true;
    detailVideoActions.hidden = false;
    await render();
  } catch (err) {
    detailPhotoError.textContent = err.message;
    detailPhotoError.hidden = false;
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

// Inline date editing
const detailDatePicker = flatpickr(detailDateInput, {
  dateFormat: "Y-m-d",
  disableMobile: true,
  onChange: async function (selectedDates, dateStr) {
    if (!dateStr || dateStr === currentDetailDate) {
      detailDateInput.hidden = true;
      detailDate.hidden = false;
      return;
    }
    const res = await updateEntry(currentDetailId, { date: dateStr });
    if (res.ok) {
      currentDetailDate = dateStr;
      detailDate.textContent = formatDate(dateStr);
      await render();
      updateOnThisDayButton(dateStr);
    } else {
      const err = await res.json();
      alert(err.error || "Could not change date");
    }
    detailDateInput.hidden = true;
    detailDate.hidden = false;
  },
  onClose: function () {
    detailDateInput.hidden = true;
    detailDate.hidden = false;
  },
});

detailDate.addEventListener("click", () => {
  detailDate.hidden = true;
  detailDateInput.hidden = false;
  detailDatePicker.setDate(currentDetailDate, false);
  detailDatePicker.open();
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
    if (detailDatePicker.isOpen) {
      detailDatePicker.close();
      return;
    }
    if (!cameraOverlay.hidden) closeCamera(null);
    else if (!detailOverlay.hidden) closeDetail();
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

// Initialize Flatpickr calendar
flatpickr("#entry-date", {
  dateFormat: "Y-m-d",
  maxDate: todayStr(),
  disableMobile: true,
});

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
