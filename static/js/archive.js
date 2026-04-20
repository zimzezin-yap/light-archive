import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabase = createClient(
  'https://dszvstvicuoeirrdpfjq.supabase.co',
  'sb_publishable_FEFJpBSw0hi4qlRVlB8jmg_B9npCgCL'
)

const archiveMapElement = document.getElementById("archive-map");
const popupBackdrop = document.querySelector(".popup-backdrop");
const popupBox = document.querySelector(".pop-up-box");
const popupPicture = document.querySelector(".picture");
const popupButton = document.querySelector(".button");
const popupClose = document.querySelector(".close");
const popupPrev = document.querySelector(".arrow.left");
const popupNext = document.querySelector(".arrow.right");
const THEME_STORAGE_KEY = "light-archive-theme";
const buttonSounds = [new Audio("static/sound/1.wav"), new Audio("static/sound/2.wav")];

let currentTheme = getCurrentTheme();
let currentItem = null;
let archiveTileLayer = null;
let archiveMapInstance = null;
let archiveItems = [];
const archiveMarkers = [];
let nextButtonSoundIndex = 0;
async function loadArchiveItems() {
  const { data, error } = await supabase
    .from("archives")
    .select("*")
    .order("id", { ascending: true });

  console.log("archives data:", data);
  console.log("archives error:", error);

  if (error) {
    console.error("Failed to load archives:", error);
    return [];
  }

  return data.map((item) => ({
    id: item.id,
    lat: item.latitude,
    lng: item.longitude,
    dayImageSrc: item.day_image_url,
    nightImageSrc: item.night_image_url,
    imageAlt: "Archive image",
    buttonSrc: "static/source/day/3.svg",
    buttonAlt: "Toggle theme",
    title: item.day_image_url || item.night_image_url || "Archive item",
  }));
}

function getCurrentTheme() {
  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (savedTheme === "day" || savedTheme === "night") {
      return savedTheme;
    }
  } catch (error) {
    // Ignore storage failures and use the default theme.
  }

  return "day";
}

function swapThemeAssetPath(path, theme) {
  if (!path) {
    return path;
  }

  return path.replace(/\/(day|night)\//, `/${theme}/`);
}

function getCurrentImageSrc(item) {
  if (!item) {
    return "";
  }

  if (currentTheme === "night") {
    return item.nightImageSrc || item.dayImageSrc || "";
  }

  return item.dayImageSrc || item.nightImageSrc || "";
}

function applyArchiveTheme(theme) {
  document.body.classList.toggle("is-night", theme === "night");
}

function getProviderName(theme) {
  return theme === "night" ? "CartoDB.DarkMatter" : "CartoDB.Positron";
}

function getMarkerIcon(theme) {
  return L.icon({
    iconUrl: swapThemeAssetPath("static/source/day/10.svg", theme),
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
}

function persistTheme(theme) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    // Ignore storage failures and keep the UI responsive.
  }
}

function playNextButtonSound() {
  const sound = buttonSounds[nextButtonSoundIndex];

  nextButtonSoundIndex = (nextButtonSoundIndex + 1) % buttonSounds.length;
  sound.currentTime = 0;
  sound.play().catch(() => {
    // Ignore playback failures caused by browser autoplay restrictions.
  });
}

function getItemIndex(item) {
  return archiveItems.findIndex((archiveItem) => archiveItem.id === item.id);
}

function showItemAtIndex(index) {
  if (archiveItems.length === 0) {
    return;
  }

  const safeIndex = (index + archiveItems.length) % archiveItems.length;
  const nextItem = archiveItems[safeIndex];

  showPopup(nextItem);

  if (archiveMapInstance) {
    archiveMapInstance.panTo([nextItem.lat, nextItem.lng], {
      animate: true,
      duration: 0.6,
    });
  }
}

function showPopup(item) {
  if (!popupBox || !popupPicture || !popupButton || !popupBackdrop) {
    return;
  }

  currentItem = item;
  popupPicture.src = getCurrentImageSrc(item);
  popupPicture.alt = item.imageAlt;
  popupButton.src = swapThemeAssetPath(item.buttonSrc, currentTheme);
  popupButton.alt = item.buttonAlt;
  popupBackdrop.classList.remove("is-hidden");
  popupBox.classList.remove("is-hidden");
}

function hidePopup() {
  if (!popupBox || !popupBackdrop) {
    return;
  }

  popupBackdrop.classList.add("is-hidden");
  popupBox.classList.add("is-hidden");
}

if (popupClose) {
  popupClose.addEventListener("click", hidePopup);
}

if (popupBackdrop) {
  popupBackdrop.addEventListener("click", hidePopup);
}

if (popupPrev) {
  popupPrev.addEventListener("click", () => {
    if (!currentItem) {
      return;
    }

    showItemAtIndex(getItemIndex(currentItem) - 1);
  });
}

if (popupNext) {
  popupNext.addEventListener("click", () => {
    if (!currentItem) {
      return;
    }

    showItemAtIndex(getItemIndex(currentItem) + 1);
  });
}

if (popupButton) {
  popupButton.addEventListener("click", () => {
    playNextButtonSound();
    currentTheme = currentTheme === "day" ? "night" : "day";
    persistTheme(currentTheme);
    applyArchiveTheme(currentTheme);

    if (archiveMapInstance) {
      if (archiveTileLayer) {
        archiveMapInstance.removeLayer(archiveTileLayer);
      }

      archiveTileLayer = L.tileLayer
        .provider(getProviderName(currentTheme))
        .addTo(archiveMapInstance);

      const nextMarkerIcon = getMarkerIcon(currentTheme);
      archiveMarkers.forEach((marker) => {
        marker.setIcon(nextMarkerIcon);
      });
    }

    if (currentItem) {
      showPopup(currentItem);
    }
  });
}

async function initMap() {
  if (!archiveMapElement || !window.L) {
    return;
  }

  archiveItems = await loadArchiveItems();

  if (archiveItems.length === 0) {
    console.warn("No archive items found.");
    return;
  }

  const initialItem = archiveItems[0];

  archiveMapInstance = L.map("archive-map", {
    zoomControl: true,
    scrollWheelZoom: true,
  }).setView([initialItem.lat, initialItem.lng], 16);

  applyArchiveTheme(currentTheme);

  archiveTileLayer = L.tileLayer
    .provider(getProviderName(currentTheme))
    .addTo(archiveMapInstance);

  const markerBounds = [];
  const markerIcon = getMarkerIcon(currentTheme);

  archiveItems.forEach((item) => {
    const marker = L.marker([item.lat, item.lng], {
      icon: markerIcon,
    }).addTo(archiveMapInstance);

    archiveMarkers.push(marker);
    markerBounds.push([item.lat, item.lng]);

    marker.on("click", () => {
      showPopup(item);
    });
  });

  if (markerBounds.length > 1) {
    archiveMapInstance.fitBounds(markerBounds, {
      padding: [60, 60],
    });
  }
}

initMap();
