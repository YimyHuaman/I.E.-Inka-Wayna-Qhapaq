// ==========================================
// CONFIGURACIÓN Y ESTADO GLOBAL
// ==========================================
const SHEET_CSV_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vS_n4nLxbksd_kcSnzLKMxVWrPWNpImmeBR11195rcE9eFeAkQ9QfPtpNSwVliE-ivrQGRu9Z_ZsNP4/pub?output=csv";

const URL_APPS_SCRIPT =
  "https://script.google.com/macros/s/AKfycbwTmtfnOATKv1d2TkbJSdvVeDk6jxem6ESkV-iNsZS2Omc1j9VXqBaKjGmUtrnbqxNp/exec";

let sitiosArqueologicos = {};
let map = null;
let markersLayer = {};
let activeSiteKey = null;
let currentImages = [];
let currentImageIndex = 0;
let autoSlideInterval = null;

// ==========================================
// 1. INICIALIZACIÓN DEL SISTEMA Y MAPA
// ==========================================
document.addEventListener("DOMContentLoaded", async function () {
  map = L.map("map", { zoomControl: false }).setView([-13.257, -72.263], 12);
  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  }).addTo(map);

  await loadGoogleSheetData();
});

// ==========================================
// 2. PROCESAMIENTO DE MULTIMEDIA Y GOOGLE DRIVE
// ==========================================
function formatImageUrl(url) {
  if (!url) return "";
  url = url.trim();

  // Soporte para formato personalizado drive://
  if (url.startsWith("drive://")) {
    const fileId = url.replace("drive://", "");
    return `https://lh3.googleusercontent.com/d/${fileId}=s1000`;
  }

  // Soporte para enlace web estándar de Google Drive de un archivo individual
  const match =
    url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return `https://lh3.googleusercontent.com/d/${match[1]}=s1000`;
  }

  return url;
}

// Función para procesar y adaptar enlaces de video (YouTube, Shorts, Drive)
// ============================================================
// FORMATEADOR UNIVERSAL DE VIDEOS (YouTube y Google Drive)
// ============================================================
function formatVideoUrl(url) {
  if (!url || typeof url !== "string") return "";
  let cleanUrl = url.trim();

  // 1. Si es un enlace de YouTube (formato clásico o recortado)
  if (cleanUrl.includes("youtube.com/watch?v=")) {
    let videoId = cleanUrl.split("v=")[1]?.split("&")[0];
    return `https://www.youtube.com/embed/${videoId}`;
  }
  if (cleanUrl.includes("youtu.be/")) {
    let videoId = cleanUrl.split("youtu.be/")[1]?.split("?")[0];
    return `https://www.youtube.com/embed/${videoId}`;
  }

  // 2. Si es un enlace de Google Drive
  if (cleanUrl.includes("drive.google.com")) {
    let match = cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      // Formato de descarga directa compatible con etiquetas de video HTML5
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }

  return cleanUrl;
}

// ==========================================
// 3. CARGADOR Y PROCESADOR DE GOOGLE SHEET
// ==========================================
async function loadGoogleSheetData() {
  try {
    const response = await fetch(SHEET_CSV_URL);
    const data = await response.text();
    const rows = parseCSV(data);

    sitiosArqueologicos = {};

    rows.forEach((row) => {
      if (!row.key && !row.id && !row.nombre) return;

      const uniqueKey = row.key
        ? row.key
        : row.nombre
          ? row.nombre.toLowerCase().replace(/[^a-z0-9]/g, "_")
          : Math.random().toString();

      // 1. Procesar FOTOS (Usa tu función formatImageUrl existente)
      let imagenesArray = [];
      if (row.fotos) {
        imagenesArray = row.fotos
          .split(",")
          .map((img) => formatImageUrl(img)) // <--- AQUí USA TU FUNCIÓN
          .filter((img) => img.length > 0);
      }
      if (imagenesArray.length === 0) {
        imagenesArray = [
          "https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?auto=format&fit=crop&w=800&q=80",
        ];
      }

      // 2. Procesar AUDIO (Usa tu función formatImageUrl porque los audios de Drive funcionan igual)
      let audioUrl = "";
      if (row.audio) {
        audioUrl = formatImageUrl(row.audio); // <--- AQUÍ USA TU FUNCIÓN PARA AUDIO
      }

      // 3. Procesar VIDEO (Usa tu función formatVideoUrl existente)
      let videoUrl = "";
      if (row.video) {
        videoUrl = formatVideoUrl(row.video); // <--- AQUÍ USA TU FUNCIÓN PARA VIDEO
      }

      sitiosArqueologicos[uniqueKey] = {
        id: row.id || "",
        tipo: row.tipo || "Sitio Arqueológico",
        nombre: row.nombre || "Lugar sin nombre",
        resumen: row.resumen || row.subtitulo || "",
        historia: row.historia || "Sin información histórica registrada.",
        descripcion: row.descripcion || "Sin descripción detallada.",
        ubicacion: row.ubicacion || "Valle de Huilloc, Cusco",
        horario: row.horario || "Lunes a Domingo: 8:00 AM - 5:00 PM",
        latitud: parseFloat(row.latitud) || -13.257,
        longitud: parseFloat(row.longitud) || -72.263,
        fotos: imagenesArray,
        audio: audioUrl, // URL de audio procesada
        video: videoUrl, // URL de video procesada
      };
    });

    renderApp();
  } catch (error) {
    console.error("Error al cargar y procesar el Google Sheet:", error);
    const badge = document.getElementById("counter-badge");
    if (badge) badge.textContent = "Error de carga";
  }
}

// ==========================================
// 4. LECTOR Y ANALIZADOR DE ARCHIVOS CSV
// ==========================================
function parseCSV(text) {
  let lines = text.split("\n");
  let result = [];
  if (lines.length === 0) return result;

  let headers = lines[0].split(",").map((h) =>
    h
      .trim()
      .replace(/^"(.*)"$/, "$1")
      .replace(/\r/g, ""),
  );

  for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;

    let currentline = [];
    let row = lines[i];
    let inQuotes = false;
    let entry = "";

    for (let j = 0; j < row.length; j++) {
      let char = row[j];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        currentline.push(
          entry
            .trim()
            .replace(/^"(.*)"$/, "$1")
            .replace(/\r/g, ""),
        );
        entry = "";
      } else {
        entry += char;
      }
    }
    currentline.push(
      entry
        .trim()
        .replace(/^"(.*)"$/, "$1")
        .replace(/\r/g, ""),
    );

    let obj = {};
    for (let j = 0; j < headers.length; j++) {
      obj[headers[j]] = currentline[j] || "";
    }
    result.push(obj);
  }
  return result;
}

// ==========================================
// FUNCIÓN AUXILIAR: PIN DE MAPA CON FOTO CIRCULAR
// ==========================================
function createPlaceIcon(imageUrl) {
  let photo =
    imageUrl && imageUrl.trim() !== "" ? imageUrl.trim() : "img/width_644.png";

  if (photo.includes("drive.google.com")) {
    let match = photo.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      photo = `https://drive.google.com/uc?export=view&id=${match[1]}`;
    }
  }

  return L.divIcon({
    className: "custom-image-marker",
    html: `
      <div style="
        position: relative; 
        width: 64px; 
        height: 80px; 
        display: flex; 
        flex-direction: column; 
        align-items: center;
        transition: transform 0.2s ease;
      ">
        
        <!-- Círculo con la foto más grande (60x60px) -->
        <div style="
          width: 60px;
          height: 60px;
          min-width: 60px;
          min-height: 60px;
          border-radius: 50%;
          border: 3px solid #78350f;
          overflow: hidden;
          box-shadow: 0 4px 8px rgba(0,0,0,0.4);
          background-color: white;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 2;
        ">
          <img src="${photo}" style="
            width: 100%;
            height: 100%;
            object-fit: cover;
          " alt="Lugar" onerror="this.onerror=null; this.src='img/width_644.png';">
        </div>

        <!-- Pin de ubicación en la parte inferior -->
        <div style="
          margin-top: -6px;
          z-index: 1;
          filter: drop-shadow(0 3px 3px rgba(0,0,0,0.35));
          display: flex;
          justify-content: center;
        ">
          <i class="ri-map-pin-fill" style="font-size: 32px; color: #78350f;"></i>
        </div>

      </div>
    `,
    iconSize: [64, 80],
    iconAnchor: [32, 80], // Ajustado al centro exacto de la punta del pin
    popupAnchor: [0, -75],
  });
}
// ==========================================
// 5. RENDERIZADO GENERAL DE LA INTERFAZ
// ==========================================
function renderApp() {
  const desktopLegend = document.getElementById("desktop-legend-list");
  const fullDirectory = document.getElementById("full-directory-grid");

  // Limpiar marcadores anteriores si existen
  Object.values(markersLayer).forEach((marker) => marker.remove());
  markersLayer = {};

  let count = 0;

  // Limpiar contenedores de manera independiente si existen en el HTML actual
  if (desktopLegend) desktopLegend.innerHTML = "";
  if (fullDirectory) fullDirectory.innerHTML = "";

  Object.keys(sitiosArqueologicos).forEach((key) => {
    const sitio = sitiosArqueologicos[key];
    count++;

    // Obtener la primera foto de manera segura con respaldo por defecto
    const fotoSitio =
      sitio.fotos && sitio.fotos.length > 0
        ? sitio.fotos[0]
        : "https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?auto=format&fit=crop&w=800&q=80";

    // 1. Crear y añadir marcador en el mapa
    if (!isNaN(sitio.latitud) && !isNaN(sitio.longitud)) {
      const customIcon = createPlaceIcon(fotoSitio);

      const marker = L.marker([sitio.latitud, sitio.longitud], {
        icon: customIcon,
      }).addTo(map);

      marker.on("click", () => {
        selectSite(key);
        if (window.innerWidth < 768) {
          showBottomSheet();
        } else {
          switchView("detail");
        }
      });
      markersLayer[key] = marker;
    }

    // 2. Elemento lista lateral (PC) - Solo si el contenedor existe
    if (desktopLegend) {
      const li = document.createElement("li");
      li.className =
        "flex items-center space-x-2 p-2 rounded-xl hover:bg-amber-50 cursor-pointer transition-colors border-b border-gray-50 legend-item";
      li.setAttribute("data-name", sitio.nombre.toLowerCase());
      li.innerHTML = `
        <span class="bg-amber-800 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shrink-0">${sitio.id || count}</span>
        <div class="truncate flex-1">
            <span class="font-bold text-gray-900 block truncate text-xs">${sitio.nombre}</span>
            <span class="text-[10px] text-gray-500">${sitio.tipo}</span>
        </div>
      `;
      li.onclick = () => {
        if (!isNaN(sitio.latitud))
          map.setView([sitio.latitud, sitio.longitud], 15);
        selectSite(key);
        if (window.innerWidth < 768) {
          showBottomSheet();
        }
      };
      desktopLegend.appendChild(li);
    }

    // 3. Tarjeta del directorio general (Vista Lista) - Solo si el contenedor existe
    if (fullDirectory) {
      const card = document.createElement("div");
      card.className =
        "bg-white p-3 rounded-2xl border border-amber-200/80 shadow-xs flex items-center space-x-3 cursor-pointer hover:border-amber-400 transition-all directory-card";
      card.setAttribute("data-name", sitio.nombre.toLowerCase());
      card.innerHTML = `
        <div class="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100 border border-amber-100">
            <img src="${fotoSitio}" class="w-full h-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?auto=format&fit=crop&w=800&q=80'">
        </div>
        <div class="flex-1 min-w-0">
            <span class="text-[9px] font-bold text-amber-800 uppercase bg-amber-50 px-1.5 py-0.5 rounded">${sitio.tipo}</span>
            <h4 class="text-xs font-bold text-gray-900 truncate mt-0.5">${sitio.nombre}</h4>
            <p class="text-[10px] text-gray-500 truncate">${sitio.resumen}</p>
        </div>
      `;
      card.onclick = () => {
        selectSite(key);
        switchView("map");
        if (!isNaN(sitio.latitud))
          map.setView([sitio.latitud, sitio.longitud], 15);
      };
      fullDirectory.appendChild(card);
    }
  });

  const badge = document.getElementById("counter-badge");
  if (badge) badge.textContent = `${count} Lugares`;
}

// ==========================================
// 6. SELECCIÓN DE LUGARES Y MULTIMEDIA (CORREGIDO)
// ==========================================
function selectSite(siteKey) {
  activeSiteKey = siteKey;
  const sitio = sitiosArqueologicos[siteKey];
  if (!sitio) return;

  // Asegurar que currentImages sea siempre un Array válido
  if (Array.isArray(sitio.fotos)) {
    currentImages = sitio.fotos;
  } else if (typeof sitio.fotos === "string" && sitio.fotos.trim() !== "") {
    currentImages = sitio.fotos.split(",").map((img) => img.trim());
  } else {
    currentImages = [];
  }

  currentImageIndex = 0;
  if (typeof setupGalleryScroll === "function") {
    setupGalleryScroll();
  }

  // Actualizar elementos tarjeta flotante móvil
  const sheetImg = document.getElementById("sheet-img");
  if (sheetImg) {
    sheetImg.src =
      currentImages.length > 0 && currentImages[0] !== ""
        ? currentImages[0]
        : "";
  }

  const sheetBadge = document.getElementById("sheet-badge");
  if (sheetBadge) sheetBadge.textContent = sitio.tipo || "Sitio";

  const sheetTitle = document.getElementById("sheet-title");
  if (sheetTitle) sheetTitle.textContent = sitio.nombre || "Sin nombre";

  const sheetSubtitle = document.getElementById("sheet-subtitle");
  if (sheetSubtitle) sheetSubtitle.textContent = sitio.resumen || "";

  const sheetSchedule = document.getElementById("sheet-schedule");
  if (sheetSchedule)
    sheetSchedule.textContent = sitio.horario || "Horario no especificado";

  // Actualizar vista de detalle institucional completa
  const dBadge = document.getElementById("detail-top-badge");
  if (dBadge) dBadge.textContent = sitio.nombre || "";

  const dTitle = document.getElementById("detail-title");
  if (dTitle) dTitle.textContent = sitio.nombre || "";

  const dSub = document.getElementById("detail-subtitle");
  if (dSub) dSub.textContent = sitio.tipo || "";

  const dLoc = document.getElementById("detail-location");
  if (dLoc) dLoc.textContent = sitio.ubicacion || "";

  const dSchedule = document.getElementById("detail-schedule");
  if (dSchedule)
    dSchedule.textContent = sitio.horario || "Horario no especificado";

  const dHist = document.getElementById("detail-history");
  if (dHist) dHist.textContent = sitio.historia || "Sin historia registrada.";

  const dDesc = document.getElementById("detail-descripcion");
  if (dDesc)
    dDesc.textContent = sitio.descripcion || "Sin descripción detallada.";

  // ==========================================
  // MANEJO DE AUDIO (Sincronizado con HTML y archivos locales)
  // ==========================================
  const audioWrapper = document.getElementById("media-container-audio");
  const audioTag = document.getElementById("detail-audio");

  if (audioWrapper && audioTag) {
    let rawAudio = sitio.audio ? sitio.audio.trim() : "";

    if (rawAudio !== "") {
      audioWrapper.classList.remove("hidden");
      let finalAudioUrl = "";

      // Si es un enlace web o Drive
      if (rawAudio.includes("http")) {
        finalAudioUrl = rawAudio;
        if (finalAudioUrl.includes("drive.google.com")) {
          let match = finalAudioUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            finalAudioUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
          }
        }
      } else {
        // Si es un archivo local, apunta a la carpeta "audio/"
        let fileName = rawAudio.split("/").pop();
        finalAudioUrl = `audio/${fileName}`;
      }

      audioTag.src = finalAudioUrl;
      audioTag.load();
    } else {
      audioWrapper.classList.add("hidden");
      audioTag.pause();
      audioTag.src = "";
    }
  }

  // ==========================================
  // MANEJO DE VIDEO (YouTube, Shorts, Drive y Locales)
  // ==========================================
  const videoWrapper = document.getElementById("media-container-video");
  const videoIframe = document.getElementById("detail-video-iframe");
  const videoTag = document.getElementById("detail-video-tag");
  const btnSound = document.getElementById("btn-toggle-sound");

  if (videoWrapper) {
    if (sitio.video && sitio.video.trim() !== "") {
      videoWrapper.classList.remove("hidden");
      const videoUrl = sitio.video.trim();

      // CASO 1: YouTube o Shorts
      if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
        let embedUrl = videoUrl;

        if (videoUrl.includes("shorts/")) {
          let id = videoUrl.split("shorts/")[1].split("?")[0];
          embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}`;
        } else if (videoUrl.includes("watch?v=")) {
          let id = videoUrl.split("watch?v=")[1].split("&")[0];
          embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}`;
        } else if (videoUrl.includes("youtu.be/")) {
          let id = videoUrl.split("youtu.be/")[1].split("?")[0];
          embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}`;
        }

        if (videoTag) {
          videoTag.classList.add("hidden");
          videoTag.pause();
          videoTag.src = "";
        }
        if (videoIframe) {
          videoIframe.classList.remove("hidden");
          videoIframe.src = embedUrl;
        }
        if (btnSound) btnSound.classList.add("hidden");
      }
      // CASO 2: Google Drive o archivos locales directos
      else {
        let directVideoUrl = videoUrl;

        if (directVideoUrl.includes("drive.google.com")) {
          let match = directVideoUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            directVideoUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
          }
        } else if (!directVideoUrl.includes("http")) {
          // Si no tiene http, asumimos archivo local en la carpeta "video/"
          let fileName = directVideoUrl.split("/").pop();
          directVideoUrl = `video/${fileName}`;
        }

        if (videoIframe) {
          videoIframe.classList.add("hidden");
          videoIframe.src = "";
        }
        if (videoTag) {
          videoTag.classList.remove("hidden");
          videoTag.src = directVideoUrl;
          videoTag.muted = true;
          videoTag.load();
          videoTag
            .play()
            .catch(() =>
              console.log(
                "Reproducción de video en espera de interacción manual",
              ),
            );
        }
        if (btnSound) btnSound.classList.remove("hidden");

        const soundIcon = document.getElementById("sound-icon");
        const soundText = document.getElementById("sound-text");
        if (soundIcon && soundText) {
          soundIcon.className = "ri-volume-mute-fill text-amber-400 text-sm";
          soundText.textContent = "Activar Audio del Video";
        }
      }
    } else {
      videoWrapper.classList.add("hidden");
      if (videoIframe) {
        videoIframe.src = "";
        videoIframe.classList.add("hidden");
      }
      if (videoTag) {
        videoTag.pause();
        videoTag.src = "";
        videoTag.classList.add("hidden");
      }
      if (btnSound) btnSound.classList.add("hidden");
    }
  }

  // Activar carrusel de imágenes si existe la función
  if (typeof startAutoSlide === "function") {
    startAutoSlide();
  }
}
// ==========================================
// 7. GESTIÓN DE MULTIMEDIA Y CARRUSEL DE FOTOS
// ==========================================

function formatMultimediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  let cleanUrl = url.trim();

  // Si es un enlace de Google Drive, lo convertimos a enlace de reproducción/descarga directa
  if (cleanUrl.includes("drive.google.com")) {
    let match = cleanUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      return `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }
  return cleanUrl;
}

function setupGalleryScroll() {
  const galleryScroll = document.getElementById("detail-gallery-scroll");
  const controls = document.getElementById("carousel-controls");
  if (!galleryScroll) return;

  galleryScroll.innerHTML = "";

  currentImages.forEach((imgUrl) => {
    const img = document.createElement("img");
    img.src = imgUrl;
    img.className = "w-full h-full object-cover shrink-0 snap-center";
    img.onerror = function () {
      this.src =
        "https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?auto=format&fit=crop&w=800&q=80";
    };
    galleryScroll.appendChild(img);
  });

  if (currentImages.length > 1 && controls) {
    controls.classList.remove("hidden");
    updateIndicators();
  } else if (controls) {
    controls.classList.add("hidden");
  }
}

function scrollGallery(direction) {
  const galleryScroll = document.getElementById("detail-gallery-scroll");
  if (!galleryScroll || currentImages.length === 0) return;
  const width = galleryScroll.clientWidth;

  if (direction === "next") {
    currentImageIndex = (currentImageIndex + 1) % currentImages.length;
  } else {
    currentImageIndex =
      (currentImageIndex - 1 + currentImages.length) % currentImages.length;
  }

  galleryScroll.scrollTo({
    left: width * currentImageIndex,
    behavior: "smooth",
  });
  updateIndicators();
}

function updateIndicators() {
  const indicators = document.getElementById("carousel-indicators");
  if (!indicators) return;
  indicators.innerHTML = "";
  currentImages.forEach((_, idx) => {
    const dot = document.createElement("span");
    dot.className = `h-2 rounded-full transition-all ${
      idx === currentImageIndex ? "w-6 bg-white" : "w-2 bg-white/50"
    }`;
    indicators.appendChild(dot);
  });
}

function startAutoSlide() {
  stopAutoSlide();
  if (currentImages.length > 1) {
    autoSlideInterval = setInterval(() => {
      scrollGallery("next");
    }, 5000);
  }
}

function stopAutoSlide() {
  if (autoSlideInterval) {
    clearInterval(autoSlideInterval);
    autoSlideInterval = null;
  }
}

function pauseAutoSlide() {
  stopAutoSlide();
}

function resumeAutoSlide() {
  startAutoSlide();
}

// ==========================================
// 7. CONTROL DE VISTAS Y MODALES
// ==========================================
function switchView(viewName) {
  if (typeof stopAutoSlide === "function") {
    stopAutoSlide();
  }

  const viewMap = document.getElementById("view-map");
  const viewList = document.getElementById("view-list");
  const viewDetail = document.getElementById("view-detail");

  if (viewMap) viewMap.classList.add("hidden");
  if (viewList) viewList.classList.add("hidden");
  if (viewDetail) viewDetail.classList.add("hidden");

  const btnMap = document.getElementById("btn-tab-map");
  const btnList = document.getElementById("btn-tab-list");

  // Clases actualizadas para que combinen perfectamente con tu barra marrón oscura
  const inactiveClasses = ["text-gray-200", "hover:text-amber-200"];
  const activeClasses = ["bg-amber-100", "text-amber-950", "shadow-xs"];

  if (btnMap) {
    btnMap.classList.remove(...activeClasses);
    btnMap.classList.add(...inactiveClasses);
  }
  if (btnList) {
    btnList.classList.remove(...activeClasses);
    btnList.classList.add(...inactiveClasses);
  }

  if (viewName === "map") {
    if (viewMap) viewMap.classList.remove("hidden");
    if (btnMap) {
      btnMap.classList.remove(...inactiveClasses);
      btnMap.classList.add(...activeClasses);
    }
    setTimeout(() => {
      if (typeof map !== "undefined" && map !== null) {
        map.invalidateSize();
      }
    }, 100);
  } else if (viewName === "list") {
    if (viewList) viewList.classList.remove("hidden");
    if (btnList) {
      btnList.classList.remove(...inactiveClasses);
      btnList.classList.add(...activeClasses);
    }
  } else if (viewName === "detail") {
    if (viewDetail) viewDetail.classList.remove("hidden");
    if (typeof startAutoSlide === "function") {
      startAutoSlide();
    }
  }
}

// ==========================================
// 8. CONTROLADORES DE PANELES, MODALES Y BOTTOM SHEET
// ==========================================

function showBottomSheet() {
  const sheet = document.getElementById("mobile-bottom-sheet");
  if (sheet) sheet.classList.remove("translate-y-full");
}

function closeBottomSheet() {
  const sheet = document.getElementById("mobile-bottom-sheet");
  if (sheet) sheet.classList.add("translate-y-full");
}

function openDetailView() {
  closeBottomSheet();
  switchView("detail");
}

// Funciones del Modal para Añadir Lugares
function openAddModal() {
  const modal = document.getElementById("modal-add-site");
  if (modal) modal.classList.remove("hidden");
}

function closeAddModal() {
  const modal = document.getElementById("modal-add-site");
  if (modal) modal.classList.add("hidden");
}

// ==========================================
// CONTROLADOR PARA AÑADIR NUEVOS SITIOS
// ==========================================
async function handleAddNewSite(event) {
  event.preventDefault();

  try {
    const totalRegistros = Object.keys(sitiosArqueologicos).length;
    const siguienteId = totalRegistros + 1;

    // Obtener valores de texto directamente de los inputs
    const fotosInputText = document.getElementById("input-fotos").value.trim();
    const audioInputText = document.getElementById("input-audio").value.trim();
    const videoInputText = document.getElementById("input-video").value.trim();

    // Separar las fotos por comas (,) y formatearlas
    let imagenesArray = [];
    if (fotosInputText) {
      imagenesArray = fotosInputText
        .split(",")
        .map((item) => formatImageUrl(item.trim()))
        .filter((item) => item !== "");
    }

    const latVal = parseFloat(document.getElementById("input-lat").value);
    const lngVal = parseFloat(document.getElementById("input-lng").value);

    // Validar coordenadas numéricas
    if (isNaN(latVal) || isNaN(lngVal)) {
      alert("Debes ingresar una latitud y longitud válidas.");
      return;
    }

    // Crear el objeto del nuevo sitio (CORREGIDO: usa formatVideoUrl para el video)
    const newSite = {
      id: siguienteId,
      tipo: document.getElementById("input-tipo").value.trim(),
      nombre: document.getElementById("input-nombre").value.trim(),
      resumen: document.getElementById("input-resumen").value.trim(),
      historia:
        document.getElementById("input-historia").value.trim() ||
        "Sin historia registrada.",
      descripcion:
        document.getElementById("input-descripcion").value.trim() ||
        "Sin descripción detallada.",
      ubicacion:
        document.getElementById("input-ubicacion").value.trim() ||
        "Huilloc, Cusco",
      latitud: latVal,
      longitud: lngVal,
      fotos: imagenesArray,
      audio: audioInputText ? formatImageUrl(audioInputText) : "",
      video: videoInputText ? formatVideoUrl(videoInputText) : "", // <--- CORREGIDO AQUÍ
    };

    if (typeof mostrarMensajeExito === "function") {
      mostrarMensajeExito("Enviando enlaces a Google Sheets...");
    }

    // Petición POST a Apps Script
    const response = await fetch(URL_APPS_SCRIPT, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: JSON.stringify(newSite),
    });

    const textoRespuesta = await response.text();

    if (!textoRespuesta || textoRespuesta.trim() === "") {
      throw new Error("Apps Script respondió vacío.");
    }

    let resultado;
    try {
      resultado = JSON.parse(textoRespuesta);
    } catch (error) {
      throw new Error(
        "Google devolvió algo que no es JSON:\n\n" +
          textoRespuesta.substring(0, 500),
      );
    }

    const esExitoso =
      resultado.status === "success" || resultado.result === "success";

    if (!esExitoso) {
      throw new Error(
        resultado.message ||
          resultado.error ||
          "Apps Script devolvió un error.",
      );
    }

    // Guardar en la memoria local de la aplicación
    const newKey = "local_" + Date.now();
    sitiosArqueologicos[newKey] = newSite;

    // Actualizar la interfaz de usuario
    renderApp();
    closeAddModal();
    document.getElementById("form-add-site").reset();

    selectSite(newKey);
    switchView("map");

    if (!isNaN(newSite.latitud) && !isNaN(newSite.longitud)) {
      map.setView([newSite.latitud, newSite.longitud], 16);
    }

    if (typeof mostrarMensajeExito === "function") {
      mostrarMensajeExito("¡Lugar guardado correctamente en Google Sheets!");
    }
  } catch (error) {
    console.error("Error detallado al guardar:", error);
    alert("Hubo un problema al guardar:\n\n" + error.message);
  }
}
// ==========================================
// FILTROS DE BÚSQUEDA PARA LEYENDA Y DIRECTORIO
// ==========================================

function filterLegendList(query) {
  const q = (query || "").toLowerCase().trim();
  document.querySelectorAll(".legend-item").forEach((item) => {
    const name = (item.getAttribute("data-name") || "").toLowerCase();
    item.style.display = name.includes(q) ? "flex" : "none";
  });
}

function filterFullList(query) {
  const q = (query || "").toLowerCase().trim();
  document.querySelectorAll(".directory-card").forEach((card) => {
    const name = (card.getAttribute("data-name") || "").toLowerCase();
    card.style.display = name.includes(q) ? "flex" : "none";
  });
}

// ==========================================
// 8. CONTROL DE SIDEBAR Y NOTIFICACIONES
// ==========================================

// ==========================================
// CONTROL DE SIDEBAR Y NOTIFICACIONES
// ==========================================

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar-legend");
  const toggleIcon = document.getElementById("sidebar-toggle-icon");
  const floatBtn = document.getElementById("btn-show-sidebar");

  if (!sidebar) return;

  // Verificamos si el panel está oculto revisando si contiene la clase 'hidden'
  const isHidden = sidebar.classList.contains("hidden");

  if (isHidden) {
    // ACCIÓN: MOSTRAR EL PANEL LATERAL Y OCULTAR EL BOTÓN FLOTANTE
    sidebar.classList.remove("hidden");
    sidebar.classList.add("flex");

    if (toggleIcon) toggleIcon.className = "ri-menu-fold-line text-sm";

    if (floatBtn) {
      floatBtn.classList.add("hidden");
      floatBtn.classList.remove("flex", "md:flex"); // Limpiamos los estados flex para forzar el ocultamiento
    }
  } else {
    // ACCIÓN: OCULTAR EL PANEL LATERAL Y MOSTRAR EL BOTÓN FLOTANTE
    sidebar.classList.remove("flex");
    sidebar.classList.add("hidden");

    if (toggleIcon) toggleIcon.className = "ri-menu-unfold-line text-sm";

    if (floatBtn) {
      floatBtn.classList.remove("hidden");
      floatBtn.classList.add("flex"); // Forzamos la visualización limpia del botón flotante
    }
  }

  // Refrescar Leaflet para que el mapa ocupe el nuevo espacio disponible
  setTimeout(() => {
    if (typeof map !== "undefined" && map !== null) {
      map.invalidateSize();
    }
  }, 200);
}
// ==========================================
// 9. MENSAJE DE ÉXITO FLOTANTE
// ==========================================
function mostrarMensajeExito(texto) {
  const alerta = document.createElement("div");
  alerta.className =
    "fixed bottom-5 right-5 " +
    "bg-amber-900 text-white text-xs " +
    "font-bold px-4 py-3 rounded-2xl " +
    "shadow-2xl z-50 flex items-center " +
    "space-x-2 animate-bounce";

  alerta.innerHTML = `
    <i class="ri-checkbox-circle-line text-base text-amber-300"></i>
    <span>${texto}</span>
  `;

  document.body.appendChild(alerta);

  setTimeout(() => {
    alerta.remove();
  }, 4000);
}

// Variable global para almacenar el video actual
let currentVideoUrl = "";

// Función para cargar Videos (Soporta YouTube, Shorts y Google Drive correctamente)
function loadVideo(videoUrl) {
  currentVideoUrl = videoUrl;
  const iframe = document.getElementById("detail-video-iframe");
  const videoTag = document.getElementById("detail-video-tag");
  const btnSound = document.getElementById("btn-toggle-sound");
  const videoWrapper = document.getElementById("media-container-video");

  if (!videoUrl || videoUrl.trim() === "") {
    if (videoWrapper) videoWrapper.classList.add("hidden");
    if (iframe) {
      iframe.src = "";
      iframe.classList.add("hidden");
    }
    if (videoTag) {
      videoTag.src = "";
      videoTag.classList.add("hidden");
      videoTag.pause();
    }
    if (btnSound) btnSound.classList.add("hidden");
    return;
  }

  if (videoWrapper) videoWrapper.classList.remove("hidden");

  // 1. CASO: YouTube o Shorts
  if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
    let embedUrl = videoUrl;

    if (videoUrl.includes("shorts/")) {
      let id = videoUrl.split("shorts/")[1].split("?")[0];
      embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}`;
    } else if (videoUrl.includes("watch?v=")) {
      let id = videoUrl.split("watch?v=")[1].split("&")[0];
      embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}`;
    } else if (videoUrl.includes("youtu.be/")) {
      let id = videoUrl.split("youtu.be/")[1].split("?")[0];
      embedUrl = `https://www.youtube.com/embed/${id}?autoplay=1&mute=1&loop=1&playlist=${id}`;
    }

    if (iframe) {
      iframe.src = embedUrl;
      iframe.classList.remove("hidden");
    }
    if (videoTag) {
      videoTag.classList.add("hidden");
      videoTag.pause();
      videoTag.src = "";
    }
    if (btnSound) btnSound.classList.add("hidden");
  }
  // 2. CASO: Google Drive (Video)
  else if (videoUrl.includes("drive.google.com")) {
    let directVideoUrl = videoUrl;
    let match = videoUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      directVideoUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }

    if (videoTag) {
      videoTag.src = directVideoUrl;
      videoTag.muted = true;
      videoTag.load();
      videoTag
        .play()
        .catch(() =>
          console.log("Reproducción de video en espera de interacción manual"),
        );
      videoTag.classList.remove("hidden");
    }
    if (iframe) {
      iframe.classList.add("hidden");
      iframe.src = "";
    }
    if (btnSound) btnSound.classList.remove("hidden");

    const soundIcon = document.getElementById("sound-icon");
    const soundText = document.getElementById("sound-text");
    if (soundIcon && soundText) {
      soundIcon.className = "ri-volume-mute-fill text-amber-400 text-sm";
      soundText.textContent = "Activar Audio del Video";
    }
  }
}

// Función para alternar el sonido del video de Google Drive
function toggleVideoMute() {
  const videoTag = document.getElementById("detail-video-tag");
  const soundIcon = document.getElementById("sound-icon");
  const soundText = document.getElementById("sound-text");

  if (!videoTag) return;

  videoTag.muted = !videoTag.muted;

  if (videoTag.muted) {
    if (soundIcon)
      soundIcon.className = "ri-volume-mute-fill text-amber-400 text-sm";
    if (soundText) soundText.textContent = "Activar Audio del Video";
  } else {
    if (soundIcon)
      soundIcon.className = "ri-volume-up-fill text-amber-400 text-sm";
    if (soundText) soundText.textContent = "Silenciar Video";
  }
}

// Función para cargar el Audio (Soporta Google Drive o enlaces directos)
function loadAudio(audioUrl) {
  const audioElement = document.getElementById("detail-audio");
  const audioWrapper = document.getElementById("media-container-audio");

  if (!audioElement || !audioWrapper) return;

  if (!audioUrl || audioUrl.trim() === "" || !audioUrl.includes("http")) {
    audioWrapper.classList.add("hidden");
    audioElement.src = "";
    audioElement.pause();
    return;
  }

  audioWrapper.classList.remove("hidden");
  let directAudioUrl = audioUrl.trim();

  if (directAudioUrl.includes("drive.google.com")) {
    let match = directAudioUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      directAudioUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }

  audioElement.src = directAudioUrl;
  audioElement.load();
}

function cargarMediosInteligentes(sitio) {
  // 1. Elementos del DOM basados en tu HTML
  const videoContainer = document.getElementById("media-container-video");
  const videoIframe = document.getElementById("detail-video-iframe");
  const videoTag = document.getElementById("detail-video-tag");
  const btnToggleSound = document.getElementById("btn-toggle-sound");

  const audioContainer = document.getElementById("media-container-audio");
  const audioTag = document.getElementById("detail-audio");

  // ==========================================
  // PROCESAMIENTO DE VIDEO (YouTube, Local o Drive)
  // ==========================================
  let rawVideo = sitio.video ? sitio.video.trim() : "";

  if (rawVideo === "") {
    // Si está vacío, ocultamos todo el contenedor de video
    videoContainer.classList.add("hidden");
    videoIframe.classList.add("hidden");
    videoTag.classList.add("hidden");
    if (btnToggleSound) btnToggleSound.classList.add("hidden");
  } else {
    videoContainer.classList.remove("hidden");

    // CASO A: Es un enlace de YouTube (Normal o Shorts)
    if (rawVideo.includes("youtube.com") || rawVideo.includes("youtu.be")) {
      let youtubeEmbedUrl = "";

      if (rawVideo.includes("shorts/")) {
        let parts = rawVideo.split("shorts/");
        let id = parts[1].split("?")[0];
        youtubeEmbedUrl = `https://www.youtube.com/embed/${id}`;
      } else if (rawVideo.includes("watch?v=")) {
        let parts = rawVideo.split("watch?v=");
        let id = parts[1].split("&")[0];
        youtubeEmbedUrl = `https://www.youtube.com/embed/${id}`;
      } else if (rawVideo.includes("youtu.be/")) {
        let parts = rawVideo.split("youtu.be/");
        let id = parts[1].split("?")[0];
        youtubeEmbedUrl = `https://www.youtube.com/embed/${id}`;
      }

      // Mostramos iframe de YouTube y ocultamos video local
      videoIframe.src = youtubeEmbedUrl;
      videoIframe.classList.remove("hidden");
      videoTag.classList.add("hidden");
      if (btnToggleSound) btnToggleSound.classList.add("hidden");
    }
    // CASO B: Es un archivo local (ej. relato1.mp4 o video/relato1.mp4)
    else {
      let fileName = rawVideo.split("/").pop(); // Extrae solo el nombre si escribieron "video/relato1.mp4"
      let localVideoSrc = `video/${fileName}`; // Apunta a tu carpeta "video"

      videoTag.src = localVideoSrc;
      videoTag.classList.remove("hidden");
      videoIframe.classList.add("hidden");
      if (btnToggleSound) btnToggleSound.classList.add("hidden");
      videoTag.load();
    }
  }

  // ==========================================
  // PROCESAMIENTO DE AUDIO (Local o Drive)
  // ==========================================
  let rawAudio = sitio.audio ? sitio.audio.trim() : "";

  if (rawAudio === "") {
    audioContainer.classList.add("hidden");
  } else {
    audioContainer.classList.remove("hidden");

    let audioFileName = rawAudio.split("/").pop(); // Extrae el nombre (ej. audio1.mp3)
    let localAudioSrc = `audio/${audioFileName}`; // Apunta a tu carpeta "audio"

    audioTag.src = localAudioSrc;
    audioTag.load();
  }
}
function irAlMapaOpcion() {
  const sitio = sitiosArqueologicos[activeSiteKey];
  if (!sitio) {
    alert("Por favor, selecciona un lugar primero.");
    return;
  }

  // Verifica si el objeto tiene coordenadas guardadas (ej. lat y lng)
  if (sitio.lat && sitio.lng) {
    // Abre la ruta usando latitud y longitud exactas desde la ubicación actual (api=1&destination=lat,lng)
    const url = `https://www.google.com/maps/dir/?api=1&destination=${sitio.lat},${sitio.lng}`;
    window.open(url, "_blank");
  } else if (sitio.ubicacion) {
    // Si no hay coordenadas, usa el texto de la ubicación registrada
    const destinoCodificado = encodeURIComponent(
      sitio.ubicacion + ", Ollantaytambo, Cusco",
    );
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destinoCodificado}`;
    window.open(url, "_blank");
  } else {
    alert(
      "Este sitio no cuenta con coordenadas o ubicación exacta registrada.",
    );
  }
}
