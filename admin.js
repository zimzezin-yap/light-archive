import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabase = createClient(
  "https://dszvstvicuoeirrdpfjq.supabase.co",
  "sb_publishable_FEFJpBSw0hi4qlRVlB8jmg_B9npCgCL"
);

const BUCKET_NAME = "image";

const loginSection = document.getElementById("login-section");
const adminSection = document.getElementById("admin-section");
const loginForm = document.getElementById("login-form");
const archiveForm = document.getElementById("archive-form");
const logoutButton = document.getElementById("logout-button");
const loginButton = document.getElementById("login-button");
const submitButton = document.getElementById("submit-button");
const message = document.getElementById("message");

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
}

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
