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
const ARCHIVE_CHANGE_STORAGE_KEY = "light-archive-data-change";
const buttonSounds = [new Audio("static/sound/1.wav"), new Audio("static/sound/2.wav")];

let currentTheme = getCurrentTheme();
let currentItem = null;
let archiveTileLayer = null;
let archiveMapInstance = null;
let archiveMarkerClusterGroup = null;
let archiveItems = [];
const archiveMarkers = [];
let nextButtonSoundIndex = 0;
let isArchiveRefreshScheduled = false;

function refreshArchivePage() {
  if (isArchiveRefreshScheduled) return;
  isArchiveRefreshScheduled = true;
  window.setTimeout(() => window.location.reload(), 100);
}

window.addEventListener("storage", (event) => {
  if (event.key === ARCHIVE_CHANGE_STORAGE_KEY) {
    refreshArchivePage();
  }
});

supabase
  .channel("public-archives-changes")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "archives" },
    refreshArchivePage
  )
  .subscribe();

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

  const items = data.map((item) => ({
      id: item.id,
      lat: Number(item.latitude),
      lng: Number(item.longitude),
      dayImageSrc: item.day_image_url,
      nightImageSrc: item.night_image_url,
      imageAlt: "Archive image",
      buttonSrc: "static/source/day/3.svg",
      buttonAlt: "Toggle theme",
      title: item.day_image_url || item.night_image_url || "Archive item",
    }));

  return sortItemsByProximity(items);
}

function getGeographicDistance(a, b) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians(b.lng - a.lng);
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;

  return 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function sortItemsByProximity(items) {
  if (items.length < 2) return items;

  const remaining = items.slice(1);
  const sorted = [items[0]];

  while (remaining.length > 0) {
    const current = sorted[sorted.length - 1];
    let nearestIndex = 0;
    let nearestDistance = getGeographicDistance(current, remaining[0]);

    for (let index = 1; index < remaining.length; index += 1) {
      const distance = getGeographicDistance(current, remaining[index]);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    }

    sorted.push(remaining.splice(nearestIndex, 1)[0]);
  }

  return sorted;
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

function createArchiveTileLayer(theme) {
  const style = theme === "night" ? "dark" : "positron";

  return L.maplibreGL({
    style: `https://tiles.openfreemap.org/styles/${style}`,
    attribution:
      '<a href="https://openfreemap.org/">OpenFreeMap</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  });
}

function getMarkerIcon(theme) {
  return L.icon({
    iconUrl: swapThemeAssetPath("static/source/day/10.svg", theme),
    iconSize: [24, 36],
    iconAnchor: [12, 36],
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

function toggleArchiveTheme() {
    playNextButtonSound();
    currentTheme = currentTheme === "day" ? "night" : "day";
    persistTheme(currentTheme);
    applyArchiveTheme(currentTheme);

    if (archiveMapInstance) {
      if (archiveTileLayer) {
        archiveMapInstance.removeLayer(archiveTileLayer);
      }

      archiveTileLayer = createArchiveTileLayer(currentTheme).addTo(
        archiveMapInstance,
      );

      const nextMarkerIcon = getMarkerIcon(currentTheme);
      archiveMarkers.forEach((marker) => {
        marker.setIcon(nextMarkerIcon);
      });
    }

    if (currentItem) {
      showPopup(currentItem);
    }
}

function renderArchiveMarkers() {
  if (!archiveMapInstance || !archiveMarkerClusterGroup) return;

  archiveMarkerClusterGroup.clearLayers();
  archiveMarkers.length = 0;

  const groups = [];
  const zoom = archiveMapInstance.getZoom();

  archiveItems.forEach((item) => {
    const point = archiveMapInstance.project([item.lat, item.lng], zoom);
    const group = groups.find(
      (candidate) => point.distanceTo(candidate.point) <= 60,
    );

    if (group) {
      group.items.push(item);
      const count = group.items.length;
      group.point = L.point(
        (group.point.x * (count - 1) + point.x) / count,
        (group.point.y * (count - 1) + point.y) / count,
      );
    } else {
      groups.push({ items: [item], point });
    }
  });

  const markerIcon = getMarkerIcon(currentTheme);

  groups.forEach((group) => {
    if (group.items.length === 1) {
      const item = group.items[0];
      const marker = L.marker([item.lat, item.lng], {
        icon: markerIcon,
        pane: "archiveMarkerPane",
        zIndexOffset: 1000,
      }).on("click", () => showPopup(item));

      archiveMarkers.push(marker);
      archiveMarkerClusterGroup.addLayer(marker);
      return;
    }

    const center = archiveMapInstance.unproject(group.point, zoom);
    const cluster = L.marker(center, {
      pane: "archiveMarkerPane",
      zIndexOffset: 1000,
      icon: L.divIcon({
        className: "archive-marker-cluster",
        html: `<span>${group.items.length}</span>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      }),
    }).on("click", () => {
      const bounds = L.latLngBounds(
        group.items.map((item) => [item.lat, item.lng]),
      );
      if (bounds.getNorthEast().equals(bounds.getSouthWest())) {
        archiveMapInstance.setView(center, Math.min(zoom + 2, 19), {
          animate: true,
        });
      } else {
        archiveMapInstance.fitBounds(bounds, {
          padding: [80, 80],
          animate: true,
        });
      }
    });

    archiveMarkerClusterGroup.addLayer(cluster);
  });
}

if (popupButton) {
  popupButton.addEventListener("click", toggleArchiveTheme);
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

  archiveMapInstance.getPane("tilePane").style.zIndex = "200";
  archiveMapInstance.getPane("tooltipPane").style.zIndex = "700";
  archiveMapInstance.getPane("popupPane").style.zIndex = "750";
  archiveMapInstance.createPane("archiveMarkerPane");
  archiveMapInstance.getPane("archiveMarkerPane").style.zIndex = "1000";

  applyArchiveTheme(currentTheme);

  archiveTileLayer = createArchiveTileLayer(currentTheme).addTo(
    archiveMapInstance,
  );

  const markerBounds = [];
  archiveMarkerClusterGroup = L.layerGroup();
  archiveItems.forEach((item) => {
    markerBounds.push([item.lat, item.lng]);
  });

  archiveMarkerClusterGroup.addTo(archiveMapInstance);
  renderArchiveMarkers();
  archiveMapInstance.on("zoomend resize", renderArchiveMarkers);

  if (markerBounds.length > 1) {
    archiveMapInstance.fitBounds(markerBounds, {
      padding: [60, 60],
    });
  }
}

initMap();
