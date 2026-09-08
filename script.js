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
// 3. DESCARGA Y MAPEO DE DATOS DESDE GOOGLE SHEETS
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

      let imagenesArray = [];
      if (row.fotos) {
        imagenesArray = row.fotos
          .split(",")
          .map((img) => formatImageUrl(img))
          .filter((img) => img.length > 0);
      }
      if (imagenesArray.length === 0) {
        imagenesArray = [
          "https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?auto=format&fit=crop&w=800&q=80",
        ];
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
        audio: row.audio ? formatImageUrl(row.audio.trim()) : "",
        video: row.video ? row.video.trim() : "",
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
// 5. RENDERIZADO GENERAL DE LA INTERFAZ
// ==========================================
// ==========================================
// 0. FUNCIÓN AUXILIAR: PIN ABAJO + FOTO CIRCULAR ARRIBA
// ==========================================
function createPlaceIcon(imageUrl) {
  const photo =
    imageUrl && imageUrl.trim() !== "" ? imageUrl : "img/width_644.png";

  return L.divIcon({
    className: "custom-image-marker",
    html: `
      <div style="position: relative; width: 48px; height: 64px; display: flex; flex-direction: column; align-items: center;">
        
        <!-- Círculo con la foto en la parte superior -->
        <div style="
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 3px solid #78350f;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0,0,0,0.4);
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
          " alt="Lugar">
        </div>

        <!-- Pin de ubicación en la parte inferior -->
        <div style="
          margin-top: -6px;
          z-index: 1;
          filter: drop-shadow(0 3px 3px rgba(0,0,0,0.35));
          display: flex;
          justify-content: center;
        ">
          <i class="ri-map-pin-fill" style="font-size: 28px; color: #78350f;"></i>
        </div>

      </div>
    `,
    iconSize: [48, 64],
    iconAnchor: [24, 64], // Ancla la punta exacta del pin en las coordenadas del mapa
    popupAnchor: [0, -60],
  });
}

// ==========================================
// 0. FUNCIÓN AUXILIAR: PIN ABAJO + FOTO CIRCULAR ARRIBA
// ==========================================
function createPlaceIcon(imageUrl) {
  const photo =
    imageUrl && imageUrl.trim() !== "" ? imageUrl : "img/width_644.png";

  return L.divIcon({
    className: "custom-image-marker",
    html: `
      <div style="position: relative; width: 48px; height: 64px; display: flex; flex-direction: column; align-items: center;">
        
        <!-- Círculo con la foto en la parte superior -->
        <div style="
          width: 42px;
          height: 42px;
          border-radius: 50%;
          border: 3px solid #78350f;
          overflow: hidden;
          box-shadow: 0 4px 6px rgba(0,0,0,0.4);
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
          " alt="Lugar">
        </div>

        <!-- Pin de ubicación en la parte inferior -->
        <div style="
          margin-top: -6px;
          z-index: 1;
          filter: drop-shadow(0 3px 3px rgba(0,0,0,0.35));
          display: flex;
          justify-content: center;
        ">
          <i class="ri-map-pin-fill" style="font-size: 28px; color: #78350f;"></i>
        </div>

      </div>
    `,
    iconSize: [48, 64],
    iconAnchor: [24, 64], // Ancla la punta exacta del pin en las coordenadas del mapa
    popupAnchor: [0, -60],
  });
}

// ==========================================
// 5. RENDERIZADO GENERAL DE LA INTERFAZ
// ==========================================
function renderApp() {
  const desktopLegend = document.getElementById("desktop-legend-list");
  const fullDirectory = document.getElementById("full-directory-grid");

  if (!desktopLegend || !fullDirectory) return;

  desktopLegend.innerHTML = "";
  fullDirectory.innerHTML = "";

  let count = 0;

  // Limpiar marcadores anteriores si existen
  Object.values(markersLayer).forEach((marker) => marker.remove());
  markersLayer = {};

  Object.keys(sitiosArqueologicos).forEach((key) => {
    const sitio = sitiosArqueologicos[key];
    count++;

    if (!isNaN(sitio.latitud) && !isNaN(sitio.longitud)) {
      // Obtenemos la primera foto del sitio para el marcador
      const fotoSitio =
        sitio.fotos && sitio.fotos.length > 0 ? sitio.fotos[0] : "";
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

    // Elemento lista lateral (PC)
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

    // Tarjeta del directorio general (Vista Lista)
    const card = document.createElement("div");
    card.className =
      "bg-white p-3 rounded-2xl border border-amber-200/80 shadow-xs flex items-center space-x-3 cursor-pointer hover:border-amber-400 transition-all directory-card";
    card.setAttribute("data-name", sitio.nombre.toLowerCase());
    card.innerHTML = `
            <div class="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-gray-100 border border-amber-100">
                <img src="${sitio.fotos[0]}" class="w-full h-full object-cover" onerror="this.src='https://images.unsplash.com/photo-1589182373726-e4f658ab50f0?auto=format&fit=crop&w=800&q=80'">
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
  setupGalleryScroll();

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

  // Manejo de Audio en Ficha Detalle
  const audioWrapper = document.getElementById("container-audio-wrapper");
  const audioTag = document.getElementById("detail-audio");
  if (audioWrapper && audioTag) {
    if (sitio.audio && sitio.audio.trim() !== "") {
      audioWrapper.classList.remove("hidden");
      audioTag.src =
        typeof formatMultimediaUrl === "function"
          ? formatMultimediaUrl(sitio.audio)
          : sitio.audio;
      audioTag.load();
    } else {
      audioWrapper.classList.add("hidden");
      audioTag.pause();
      audioTag.src = "";
    }
  }

  // Manejo de Video en Ficha Detalle (CORREGIDO)
  const videoWrapper = document.getElementById("container-video-wrapper");
  const videoIframe = document.getElementById("detail-video-iframe"); // Exclusivo para YouTube
  const videoTag = document.getElementById("detail-video-tag"); // Para Google Drive y archivos directos

  if (videoWrapper) {
    if (sitio.video && sitio.video.trim() !== "") {
      videoWrapper.classList.remove("hidden");
      const formattedVideoUrl =
        typeof formatVideoUrl === "function"
          ? formatVideoUrl(sitio.video)
          : sitio.video;

      // SOLO YOUTUBE usa <iframe>
      if (
        sitio.video.includes("youtube.com") ||
        sitio.video.includes("youtu.be")
      ) {
        if (videoTag) {
          videoTag.classList.add("hidden");
          videoTag.pause();
          videoTag.src = "";
        }
        if (videoIframe) {
          videoIframe.classList.remove("hidden");
          videoIframe.src = formattedVideoUrl;
        }
      }
      // GOOGLE DRIVE y archivos directos usan la etiqueta <video>
      else {
        if (videoIframe) {
          videoIframe.classList.add("hidden");
          videoIframe.src = "";
        }
        if (videoTag) {
          videoTag.classList.remove("hidden");
          videoTag.src = formattedVideoUrl;
          videoTag.load(); // Vital para que el navegador procese el video de Drive
        }
      }
    } else {
      videoWrapper.classList.add("hidden");
      if (videoIframe) videoIframe.src = "";
      if (videoTag) {
        videoTag.pause();
        videoTag.src = "";
      }
    }
  }

  // Comprobar si startAutoSlide existe antes de llamarla para evitar errores
  if (typeof startAutoSlide === "function") {
    startAutoSlide();
  }
}
function formatMultimediaUrl(url) {
  if (!url || typeof url !== "string") return "";
  let cleanUrl = url.trim();

  // Si es un enlace de Google Drive, lo convertimos a enlace de reproducción directa
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
    dot.className = `h-2 rounded-full transition-all ${idx === currentImageIndex ? "w-6 bg-white" : "w-2 bg-white/50"}`;
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

// ============================================================
// GUARDAR NUEVO SITIO (VERIFICADO Y CORREGIDO)
// ============================================================
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

    // Crear el objeto del nuevo sitio (con el video formateado correctamente igual que el audio)
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
      video: videoInputText ? formatImageUrl(videoInputText) : "",
    };

    mostrarMensajeExito("Enviando enlaces a Google Sheets...");

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

    mostrarMensajeExito(
      "¡Lugar guardado correctamente con sus enlaces de Drive!",
    );
  } catch (error) {
    console.error("Error detallado al guardar:", error);
    alert("Hubo un problema al guardar:\n\n" + error.message);
  }
}

// ==========================================
// 8. FILTROS Y TOGGLE SIDEBAR
// ==========================================
function filterLegendList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll(".legend-item").forEach((item) => {
    const name = item.getAttribute("data-name") || "";
    item.style.display = name.includes(q) ? "flex" : "none";
  });
}

function filterFullList(query) {
  const q = query.toLowerCase();
  document.querySelectorAll(".directory-card").forEach((card) => {
    const name = card.getAttribute("data-name") || "";
    card.style.display = name.includes(q) ? "flex" : "none";
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById("sidebar-legend");
  const toggleIcon = document.getElementById("sidebar-toggle-icon");
  const floatBtn = document.getElementById("btn-show-sidebar");

  if (!sidebar) return;

  const isHidden = sidebar.classList.contains("hidden");

  if (isHidden) {
    sidebar.classList.remove("hidden");
    sidebar.classList.add("flex");
    if (toggleIcon) toggleIcon.className = "ri-menu-fold-line text-sm";

    if (floatBtn) {
      floatBtn.classList.add("hidden");
      floatBtn.classList.remove("flex");
    }
  } else {
    sidebar.classList.remove("flex");
    sidebar.classList.add("hidden");
    if (toggleIcon) toggleIcon.className = "ri-menu-unfold-line text-sm";

    if (floatBtn) {
      floatBtn.classList.remove("hidden");
      floatBtn.classList.add("flex");
    }
  }

  setTimeout(() => {
    if (map) map.invalidateSize();
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

// ==========================================
// CONTROL DE PESTAÑAS MULTIMEDIA EN LA FICHA DE DETALLE
// ==========================================
function switchMediaType(type) {
  // Contenedores multimedia
  const containerFotos = document.getElementById("media-container-fotos");
  const containerVideo = document.getElementById("media-container-video");
  const containerAudio = document.getElementById("media-container-audio");

  // Botones de las pestañas
  const btnFotos = document.getElementById("btn-tab-fotos");
  const btnVideo = document.getElementById("btn-tab-video");
  const btnAudio = document.getElementById("btn-tab-audio");

  // Ocultar todos los contenedores y pausar reproducción si la hubiera
  if (containerFotos) containerFotos.classList.add("hidden");
  if (containerVideo) containerVideo.classList.add("hidden");
  if (containerAudio) containerAudio.classList.add("hidden");

  // Resetear estilos activos de los botones (darles apariencia inactiva)
  const inactiveClasses = "text-gray-600 hover:text-gray-900 bg-transparent";
  const activeClasses = "text-gray-900 bg-white shadow-xs";

  [btnFotos, btnVideo, btnAudio].forEach((btn) => {
    if (btn) {
      btn.className = btn.className.replace(activeClasses, inactiveClasses);
      if (!btn.className.includes("text-gray-600")) {
        btn.classList.add("text-gray-600");
      }
    }
  });

  // Mostrar el contenedor seleccionado y activar su botón correspondiente
  if (type === "fotos") {
    if (containerFotos) containerFotos.classList.remove("hidden");
    if (btnFotos) {
      btnFotos.classList.remove("text-gray-600", "hover:text-gray-900");
      btnFotos.classList.add("text-gray-900", "bg-white", "shadow-xs");
    }
  } else if (type === "video") {
    if (containerVideo) containerVideo.classList.remove("hidden");
    if (btnVideo) {
      btnVideo.classList.remove("text-gray-600", "hover:text-gray-900");
      btnVideo.classList.add("text-gray-900", "bg-white", "shadow-xs");
    }
  } else if (type === "audio") {
    if (containerAudio) containerAudio.classList.remove("hidden");
    if (btnAudio) {
      btnAudio.classList.remove("text-gray-600", "hover:text-gray-900");
      btnAudio.classList.add("text-gray-900", "bg-white", "shadow-xs");
    }
  }
}

// Variable global para almacenar el video actual
let currentVideoUrl = "";

// Función para cargar Videos (Soporta YouTube, Shorts y Google Drive correctamente)
function loadVideo(videoUrl) {
  currentVideoUrl = videoUrl;
  const iframe = document.getElementById("detail-video-iframe");
  const videoTag = document.getElementById("detail-video-tag");
  const btnSound = document.getElementById("btn-toggle-sound");

  if (!videoUrl || videoUrl.trim() === "") {
    iframe.src = "";
    iframe.classList.add("hidden");
    videoTag.src = "";
    videoTag.classList.add("hidden");
    btnSound.classList.add("hidden");
    return;
  }

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

    iframe.src = embedUrl;
    iframe.classList.remove("hidden");
    videoTag.classList.add("hidden");
    videoTag.pause();
    btnSound.classList.add("hidden");
  }
  // 2. CASO: Google Drive (Video)
  else if (videoUrl.includes("drive.google.com")) {
    let match = videoUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      videoTag.src = `https://drive.google.com/uc?export=download&id=${match[1]}`;
    } else {
      videoTag.src = videoUrl;
    }

    videoTag.muted = true;
    videoTag.load();
    videoTag
      .play()
      .catch((e) =>
        console.log("Reproducción de video en espera de interacción manual"),
      );

    videoTag.classList.remove("hidden");
    iframe.classList.add("hidden");
    iframe.src = "";
    btnSound.classList.remove("hidden"); // Muestra el botón para activar sonido en Drive

    const soundIcon = document.getElementById("sound-icon");
    const soundText = document.getElementById("sound-text");
    if (soundIcon && soundText) {
      soundIcon.className = "ri-volume-mute-fill text-amber-400 text-sm";
      soundText.textContent = "Activar Audio del Video";
    }
  }
}

// Función para cargar el Audio (Soporta Google Drive o enlaces directos de audio)
// Función para cargar el Audio (Soporta Google Drive o enlaces directos de audio)
function loadAudio(audioUrl) {
  const audioElement = document.getElementById("detail-audio");
  if (!audioElement) return;

  // Validar si el campo está vacío o es un texto simple como "audio01" sin enlace
  if (!audioUrl || audioUrl.trim() === "" || !audioUrl.includes("http")) {
    audioElement.src = "";
    console.warn("El campo de audio no contiene una URL válida:", audioUrl);
    return;
  }

  let directAudioUrl = audioUrl.trim();

  // Si el enlace de audio es de Google Drive, lo convertimos a enlace de descarga directa
  if (directAudioUrl.includes("drive.google.com")) {
    let match = directAudioUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      directAudioUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }

  audioElement.src = directAudioUrl;
  audioElement.load();
} // <-- ¡Cierre correcto de la función loadAudio!
