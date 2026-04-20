const connections = [
  {
    arrow: ".click-arrow",
    source: ".click-box",
    target: ".button-image",
    getStartPoint(sourceRect) {
      return {
        x: sourceRect.right,
        y: sourceRect.top + sourceRect.height * 0.6,
      };
    },
    getTargetPoint(targetRect) {
      return {
        x: targetRect.left + targetRect.width * -0.05,
        y: targetRect.top + targetRect.height * 0.2,
      };
    },
  },
  {
    arrow: ".light-arrow",
    source: ".light-box",
    target: "h1",
    getStartPoint(sourceRect) {
      return {
        x: sourceRect.left,
        y: sourceRect.top + sourceRect.height * 0.3,
      };
    },
    getTargetPoint(targetRect) {
      return {
        x: targetRect.right,
        y: targetRect.top + targetRect.height * 1,
      };
    },
  },
];

const themeToggleImage = document.querySelector(".button-image");
const themeSwapTargets = [".click-image", ".light-image", ".button-image"];
const THEME_STORAGE_KEY = "light-archive-theme";
const buttonSounds = [new Audio("static/sound/1.wav"), new Audio("static/sound/2.wav")];
let nextButtonSoundIndex = 0;

function playNextButtonSound() {
  const sound = buttonSounds[nextButtonSoundIndex];

  nextButtonSoundIndex = (nextButtonSoundIndex + 1) % buttonSounds.length;
  sound.currentTime = 0;
  sound.play().catch(() => {
    // Ignore playback failures caused by browser autoplay restrictions.
  });
}

function swapThemeAssetPath(path, theme) {
  if (!path) {
    return path;
  }

  return path.replace(/\/(day|night)\//, `/${theme}/`);
}

function applyTheme(theme) {
  document.body.classList.toggle("is-night", theme === "night");

  themeSwapTargets.forEach((selector) => {
    const image = document.querySelector(selector);

    if (!image) {
      return;
    }

    image.src = swapThemeAssetPath(image.src, theme);
  });

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch (error) {
    // Ignore storage failures and keep the UI responsive.
  }

  updateArrows();
}

if (themeToggleImage) {
  let currentTheme = "day";

  try {
    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (savedTheme === "day" || savedTheme === "night") {
      currentTheme = savedTheme;
    }
  } catch (error) {
    // Ignore storage failures and fall back to the default theme.
  }

  applyTheme(currentTheme);

  themeToggleImage.addEventListener("click", () => {
    playNextButtonSound();
    currentTheme = currentTheme === "day" ? "night" : "day";
    applyTheme(currentTheme);
  });
}

function updateArrow(connection) {
  const arrow = document.querySelector(connection.arrow);
  const source = document.querySelector(connection.source);
  const target = document.querySelector(connection.target);

  if (!arrow || !source || !target) {
    return;
  }

  const sourceRect = source.getBoundingClientRect();
  const targetRect = target.getBoundingClientRect();
  const start = connection.getStartPoint(sourceRect);
  const end = connection.getTargetPoint(targetRect);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  const distance = Math.max(24, Math.hypot(dx, dy) - 11);
  const localX = start.x - sourceRect.left;
  const localY = start.y - sourceRect.top;

  arrow.style.setProperty("--arrow-x", `${localX}px`);
  arrow.style.setProperty("--arrow-y", `${localY}px`);
  arrow.style.setProperty("--arrow-angle", `${angle}deg`);
  arrow.style.setProperty("--arrow-length", `${distance}px`);
}

function updateArrows() {
  connections.forEach(updateArrow);
}

window.addEventListener("load", updateArrows);
window.addEventListener("resize", updateArrows);

if ("ResizeObserver" in window) {
  const resizeObserver = new ResizeObserver(updateArrows);

  document.querySelectorAll(".click-box, .light-box, .button-image, h1").forEach((element) => {
    resizeObserver.observe(element);
  });
}
