import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  "https://dszvstvicuoeirrdpfjq.supabase.co",
  "sb_publishable_FEFJpBSw0hi4qlRVlB8jmg_B9npCgCL"
);

const BUCKET_NAME = "image";
const ARCHIVE_CHANGE_STORAGE_KEY = "light-archive-data-change";

const loginSection = document.getElementById("login-section");
const adminSection = document.getElementById("admin-section");
const loginForm = document.getElementById("login-form");
const archiveForm = document.getElementById("archive-form");
const logoutButton = document.getElementById("logout-button");
const loginButton = document.getElementById("login-button");
const submitButton = document.getElementById("submit-button");
const message = document.getElementById("message");
const archiveList = document.getElementById("archive-list");
const archiveListStatus = document.getElementById("archive-list-status");
let archiveLoadRequestId = 0;

function showMessage(text, type) {
  message.textContent = text;
  message.className = `message is-${type}`;
}

function clearMessage() {
  message.textContent = "";
  message.className = "message";
}

function showLogin() {
  loginSection.classList.remove("is-hidden");
  adminSection.classList.add("is-hidden");
}

function showAdmin() {
  loginSection.classList.add("is-hidden");
  adminSection.classList.remove("is-hidden");
  loadArchives();
}

function createArchiveItem(item) {
  const listItem = document.createElement("li");
  listItem.className = "archive-item";

  [item.day_image_url, item.night_image_url].forEach((imageUrl, index) => {
    const image = document.createElement("img");
    image.src = imageUrl;
    image.alt = index === 0 ? "Day image" : "Night image";
    image.loading = "lazy";
    listItem.appendChild(image);
  });

  const coordinates = document.createElement("span");
  coordinates.className = "archive-coordinates";
  coordinates.textContent = `#${item.id} · ${item.latitude}, ${item.longitude}`;
  listItem.appendChild(coordinates);

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "delete-button";
  deleteButton.dataset.archiveId = item.id;
  deleteButton.dataset.dayImageUrl = item.day_image_url || "";
  deleteButton.dataset.nightImageUrl = item.night_image_url || "";
  deleteButton.textContent = "Delete";
  listItem.appendChild(deleteButton);

  return listItem;
}

async function loadArchives() {
  const requestId = ++archiveLoadRequestId;
  archiveListStatus.hidden = false;
  archiveListStatus.textContent = "Loading...";

  const { data, error } = await supabase
    .from("archives")
    .select("id, latitude, longitude, day_image_url, night_image_url")
    .order("id", { ascending: false });

  if (requestId !== archiveLoadRequestId) return;

  archiveList.replaceChildren();

  if (error) {
    archiveListStatus.textContent = `Failed to load: ${error.message}`;
    return;
  }

  if (!data.length) {
    archiveListStatus.textContent = "No saved archives.";
    return;
  }

  archiveListStatus.hidden = true;
  const uniqueItems = [...new Map(data.map((item) => [String(item.id), item])).values()];
  const fragment = document.createDocumentFragment();
  uniqueItems.forEach((item) => fragment.appendChild(createArchiveItem(item)));
  archiveList.appendChild(fragment);
}

function getStoragePath(publicUrl) {
  if (!publicUrl) return null;

  try {
    const url = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${BUCKET_NAME}/`;
    const markerIndex = url.pathname.indexOf(marker);
    return markerIndex === -1
      ? null
      : decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch (_error) {
    return null;
  }
}

async function deleteArchive(button) {
  const archiveId = button.dataset.archiveId;
  const confirmed = window.confirm(`Delete archive #${archiveId}? This cannot be undone.`);
  if (!confirmed) return;

  clearMessage();
  button.disabled = true;
  button.textContent = "Deleting...";

  const { error: deleteError } = await supabase
    .from("archives")
    .delete()
    .eq("id", archiveId);

  if (deleteError) {
    button.disabled = false;
    button.textContent = "Delete";
    showMessage(deleteError.message, "error");
    return;
  }

  const imagePaths = [button.dataset.dayImageUrl, button.dataset.nightImageUrl]
    .map(getStoragePath)
    .filter(Boolean);
  const { error: storageError } = imagePaths.length
    ? await supabase.storage.from(BUCKET_NAME).remove(imagePaths)
    : { error: null };

  try {
    window.localStorage.setItem(
      ARCHIVE_CHANGE_STORAGE_KEY,
      JSON.stringify({ action: "delete", id: archiveId, timestamp: Date.now() })
    );
  } catch (_error) {
    // The database deletion succeeded even if cross-tab notification is unavailable.
  }

  await loadArchives();
  showMessage(
    storageError
      ? `Archive deleted, but image cleanup failed: ${storageError.message}`
      : "Archive deleted successfully.",
    storageError ? "error" : "success"
  );
}

archiveList.addEventListener("click", (event) => {
  const button = event.target.closest(".delete-button");
  if (button) deleteArchive(button);
});

function getFileExtension(file) {
  const fileNameParts = file.name.split(".");
  return fileNameParts.length > 1 ? fileNameParts.pop() : "jpg";
}

function makeUniqueFileName(file, label) {
  const extension = getFileExtension(file);
  const uniqueId =
    window.crypto && window.crypto.randomUUID
      ? window.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `archives/${Date.now()}-${uniqueId}-${label}.${extension}`;
}

async function uploadImage(file, label) {
  const filePath = makeUniqueFileName(file, label);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw uploadError;
  }

  const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(filePath);
  return data.publicUrl;
}

async function checkSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    showMessage(error.message, "error");
    showLogin();
    return;
  }

  if (data.session) {
    showAdmin();
  } else {
    showLogin();
  }
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();
  loginButton.disabled = true;
  loginButton.textContent = "Logging in...";

  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    showMessage("Please enter your email and password.", "error");
    loginButton.disabled = false;
    loginButton.textContent = "Log in";
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  loginButton.disabled = false;
  loginButton.textContent = "Log in";

  if (error) {
    showMessage(error.message, "error");
    return;
  }

  loginForm.reset();
  showAdmin();
  showMessage("Logged in successfully.", "success");
});

logoutButton.addEventListener("click", async () => {
  clearMessage();
  const { error } = await supabase.auth.signOut();

  if (error) {
    showMessage(error.message, "error");
    return;
  }

  archiveForm.reset();
  showLogin();
  showMessage("Logged out.", "success");
});

archiveForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearMessage();

  const latitudeValue = document.getElementById("latitude").value.trim();
  const longitudeValue = document.getElementById("longitude").value.trim();
  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);
  const dayImage = document.getElementById("day-image").files[0];
  const nightImage = document.getElementById("night-image").files[0];

  if (
    !latitudeValue ||
    !longitudeValue ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    showMessage("Please enter valid latitude and longitude values.", "error");
    return;
  }

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    showMessage(
      "Latitude must be between -90 and 90. Longitude must be between -180 and 180.",
      "error"
    );
    return;
  }

  if (!dayImage || !nightImage) {
    showMessage("Please select both day and night images.", "error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = "Uploading...";

  try {
    const dayImageUrl = await uploadImage(dayImage, "day");
    const nightImageUrl = await uploadImage(nightImage, "night");

    const { error: insertError } = await supabase.from("archives").insert({
      latitude,
      longitude,
      day_image_url: dayImageUrl,
      night_image_url: nightImageUrl,
    });

    if (insertError) {
      throw insertError;
    }

    archiveForm.reset();
    showMessage("Archive item added successfully.", "success");
    try {
      window.localStorage.setItem(
        ARCHIVE_CHANGE_STORAGE_KEY,
        JSON.stringify({ action: "insert", timestamp: Date.now() })
      );
    } catch (_error) {
      // The archive was saved even if cross-tab notification is unavailable.
    }
    await loadArchives();
  } catch (error) {
    showMessage(error.message || "Upload failed. Please try again.", "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Upload archive";
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  if (session) {
    showAdmin();
  } else {
    showLogin();
  }
});

checkSession();
