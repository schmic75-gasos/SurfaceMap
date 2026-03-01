// script.js
document.addEventListener('DOMContentLoaded', function() {
    // ========== KONFIGURACE ==========
    const ZOOM_MIN = 14;
    const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
    const MIN_REQUEST_INTERVAL = 2000; // ms

    // ========== BAREVNÁ MAPA POVRCHŮ (rozšířená) ==========
    const surfaceColors = {
        // asfaltové
        'asphalt': '#2c3e50',
        'asphalt:lanes': '#34495e',
        'chipseal': '#3a4a5a',
        // betonové
        'concrete': '#7f8c8d',
        'concrete:lanes': '#95a5a6',
        'concrete:plates': '#b0bec5',
        // dlažba
        'paving_stones': '#f39c12',
        'paving_stones:30': '#f1c40f',
        'paving_stones:50': '#f39c12',
        'sett': '#d35400',
        'cobblestone': '#e67e22',
        'cobblestone:flattened': '#e67e22',
        'unhewn_cobblestone': '#d35400',
        // hlína / neupravené
        'dirt': '#8B4513',
        'ground': '#8B4513',
        'earth': '#8B4513',
        'mud': '#5d3a1a',
        // štěrk
        'gravel': '#b87333',
        'fine_gravel': '#cd7f4b',
        'pebblestone': '#bc8f4b',
        'compacted': '#b8860b',
        // dřevo
        'wood': '#27ae60',
        'woodchips': '#2ecc71',
        'bark': '#27ae60',
        // písek
        'sand': '#f4e9d9',
        // umělé povrchy
        'metal': '#7f8c8d',
        'plastic': '#9b59b6',
        'rubber': '#9b59b6',
        'tartan': '#e74c3c',   // atletický
        'artificial_turf': '#2ecc71',
        'acrylic': '#3498db',
        'decoturf': '#2980b9',
        'clay': '#c44536',      // antuka
        'tennis_clay': '#c44536',
        // travnaté
        'grass': '#7cfc00',
        'grass_paver': '#7cfc00',
        'gravel_turf': '#7cfc00',
        // ostatní / speciální
        'salt': '#ecf0f1',
        'snow': '#ffffff',
        'ice': '#a6dcef'
    };
    const defaultColor = '#9b59b6'; // fialová pro neznámé

    // ========== KATEGORIE PRO FILTRY ==========
    const categories = [
        { id: 'asfalt', label: 'Asfalt', color: '#2c3e50', surfaces: ['asphalt', 'asphalt:lanes', 'chipseal'] },
        { id: 'beton', label: 'Beton', color: '#7f8c8d', surfaces: ['concrete', 'concrete:lanes', 'concrete:plates'] },
        { id: 'dlazba', label: 'Dlažba', color: '#f39c12', surfaces: ['paving_stones', 'paving_stones:30', 'paving_stones:50', 'sett', 'cobblestone', 'cobblestone:flattened', 'unhewn_cobblestone'] },
        { id: 'hilna', label: 'Hlína / zemina', color: '#8B4513', surfaces: ['dirt', 'ground', 'earth', 'mud'] },
        { id: 'sterk', label: 'Štěrk', color: '#b87333', surfaces: ['gravel', 'fine_gravel', 'pebblestone', 'compacted'] },
        { id: 'drevo', label: 'Dřevo', color: '#27ae60', surfaces: ['wood', 'woodchips', 'bark'] },
        { id: 'kamen', label: 'Kámen', color: '#95a5a6', surfaces: ['stone', 'rock', 'granite'] }, // přidáno pár navíc
        { id: 'piasek', label: 'Písek', color: '#f4e9d9', surfaces: ['sand'] },
        { id: 'umele', label: 'Umělé', color: '#9b59b6', surfaces: ['plastic', 'rubber', 'tartan', 'artificial_turf', 'acrylic', 'decoturf', 'clay', 'tennis_clay'] },
        { id: 'travni', label: 'Travnaté', color: '#7cfc00', surfaces: ['grass', 'grass_paver', 'gravel_turf'] },
        { id: 'ostatni', label: 'Ostatní', color: '#9b59b6', surfaces: [] } // catch-all
    ];

    // pomocná funkce: zjistí kategorii podle surface
    function getCategoryId(surface) {
        if (!surface) return 'ostatni';
        const s = surface.toLowerCase().split(';')[0].trim();
        for (let cat of categories) {
            if (cat.surfaces.includes(s)) return cat.id;
        }
        return 'ostatni';
    }

    // ========== INICIALIZACE MAPY ==========
    const map = L.map('map').setView([50.087, 14.421], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const surfaceLayer = L.layerGroup().addTo(map);

    // ========== GLOBÁLNÍ PROMĚNNÉ ==========
    let allWays = [];              // všechny načtené cesty (geometrie + tagy)
    let isLoading = false;
    let lastRequestTime = 0;

    // ========== DOM ELEMENTY ==========
    const autoLoadCheckbox = document.getElementById('autoLoad');
    const loadButton = document.getElementById('loadButton');
    const warningDiv = document.getElementById('warning');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');
    const totalSpan = document.getElementById('totalWays');
    const visibleSpan = document.getElementById('visibleWays');
    const filtersContainer = document.getElementById('filtersContainer');
    const toggleFiltersBtn = document.getElementById('toggleFilters');
    const filtersPanel = document.getElementById('filtersPanel');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deselectAllBtn = document.getElementById('deselectAllBtn');

    // ========== FILTRY ==========
    let filterState = {}; // { categoryId: true/false }

    // Načtení stavu z localStorage
    function loadSettings() {
        try {
            const savedAuto = localStorage.getItem('surfacemap_autoLoad');
            if (savedAuto !== null) autoLoadCheckbox.checked = savedAuto === 'true';

            const savedFilters = localStorage.getItem('surfacemap_filters');
            if (savedFilters) {
                filterState = JSON.parse(savedFilters);
            } else {
                // default: všechny kategorie kromě "ostatní" možná? nebo všechny true
                categories.forEach(cat => filterState[cat.id] = true);
            }
        } catch (e) {
            console.warn('Chyba načtení localStorage', e);
            categories.forEach(cat => filterState[cat.id] = true);
        }
        renderFilterCheckboxes();
    }

    // Uložení stavu
    function saveSettings() {
        localStorage.setItem('surfacemap_autoLoad', autoLoadCheckbox.checked);
        localStorage.setItem('surfacemap_filters', JSON.stringify(filterState));
    }

    // Vytvoření checkboxů filtrů
    function renderFilterCheckboxes() {
        filtersContainer.innerHTML = '';
        categories.forEach(cat => {
            const div = document.createElement('div');
            const label = document.createElement('label');
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.value = cat.id;
            cb.checked = filterState[cat.id] || false;
            cb.addEventListener('change', (e) => {
                filterState[cat.id] = e.target.checked;
                saveSettings();
                renderWays(); // překreslíme podle nových filtrů
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(cat.label));
            // malá barevná tečka
            const dot = document.createElement('span');
            dot.className = 'color-dot';
            dot.style.backgroundColor = cat.color;
            dot.style.marginLeft = 'auto';
            label.appendChild(dot);
            div.appendChild(label);
            filtersContainer.appendChild(div);
        });
    }

    // ========== VYKRESLENÍ CEST PODLE FILTRŮ ==========
    function renderWays() {
        surfaceLayer.clearLayers();
        let visibleCount = 0;

        allWays.forEach(way => {
            const catId = getCategoryId(way.surface);
            if (!filterState[catId]) return; // filtr nepropustí

            visibleCount++;
            const color = surfaceColors[way.surface?.toLowerCase()] || defaultColor;

            // Vytvoření polyline
            const polyline = L.polyline(way.latlngs, {
                color: color,
                weight: 4,
                opacity: 0.8,
                smoothFactor: 1
            });

            // Popup s informacemi
            let popupText = `<b>Povrch:</b> ${way.surface || 'neznámý'}<br>`;
            popupText += `<b>Highway:</b> ${way.highway || 'neznámý'}<br>`;
            if (way.name) popupText += `<b>Název:</b> ${way.name}<br>`;
            if (way.length) popupText += `<b>Délka:</b> ${way.length.toFixed(0)} m<br>`;
            polyline.bindPopup(popupText);

            polyline.addTo(surfaceLayer);
        });

        totalSpan.textContent = allWays.length;
        visibleSpan.textContent = visibleCount;
    }

    // ========== STAŽENÍ DAT Z OVERPASS API ==========
    async function loadData() {
        const zoom = map.getZoom();
        if (zoom < ZOOM_MIN) {
            warningDiv.classList.remove('hidden');
            surfaceLayer.clearLayers();
            allWays = [];
            renderWays(); // aktualizuje počty
            return;
        } else {
            warningDiv.classList.add('hidden');
        }

        // Rate limiting
        const now = Date.now();
        if (now - lastRequestTime < MIN_REQUEST_INTERVAL && lastRequestTime !== 0) {
            console.log('Požadavek zablokován rate-limiting');
            return;
        }

        if (isLoading) return;
        isLoading = true;
        loadingDiv.classList.remove('hidden');
        errorDiv.classList.add('hidden');

        const bounds = map.getBounds();
        const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;
        const query = `[out:json];way[highway][surface](${bbox});out geom;`;
        const url = `${OVERPASS_ENDPOINT}?data=${encodeURIComponent(query)}`;

        try {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`HTTP chyba ${response.status}`);
            const data = await response.json();

            // Zpracujeme cesty
            const newWays = [];
            for (const el of data.elements || []) {
                if (el.type !== 'way' || !el.geometry) continue;

                const latlngs = el.geometry.map(p => [p.lat, p.lon]);
                // Výpočet délky (v metrech)
                let length = 0;
                for (let i = 0; i < latlngs.length - 1; i++) {
                    const p1 = L.latLng(latlngs[i]);
                    const p2 = L.latLng(latlngs[i+1]);
                    length += p1.distanceTo(p2);
                }

                newWays.push({
                    id: el.id,
                    surface: el.tags?.surface,
                    highway: el.tags?.highway,
                    name: el.tags?.name,
                    latlngs: latlngs,
                    length: length
                });
            }

            allWays = newWays;
            lastRequestTime = Date.now();
            renderWays();
        } catch (err) {
            console.error(err);
            errorDiv.textContent = 'Chyba při načítání dat. Zkuste to prosím později.';
            errorDiv.classList.remove('hidden');
        } finally {
            isLoading = false;
            loadingDiv.classList.add('hidden');
        }
    }

    // ========== OBSLUHA UDÁLOSTÍ ==========
    map.on('moveend', function() {
        if (autoLoadCheckbox.checked) {
            loadData();
        } else {
            // i když není auto, kontrolujeme zoom a varování
            if (map.getZoom() < ZOOM_MIN) warningDiv.classList.remove('hidden');
            else warningDiv.classList.add('hidden');
        }
    });

    loadButton.addEventListener('click', loadData);

    // Rozbalení/sbalení panelu filtrů
    toggleFiltersBtn.addEventListener('click', () => {
        filtersPanel.classList.toggle('hidden');
    });

    selectAllBtn.addEventListener('click', () => {
        categories.forEach(cat => filterState[cat.id] = true);
        renderFilterCheckboxes();
        saveSettings();
        renderWays();
    });

    deselectAllBtn.addEventListener('click', () => {
        categories.forEach(cat => filterState[cat.id] = false);
        renderFilterCheckboxes();
        saveSettings();
        renderWays();
    });

    autoLoadCheckbox.addEventListener('change', () => {
        saveSettings();
    });

    // ========== SPUŠTĚNÍ ==========
    loadSettings();
    // První načtení, pokud je auto zapnuté
    if (autoLoadCheckbox.checked) {
        setTimeout(() => loadData(), 300); // drobný odklad pro stabilitu mapy
    } else {
        // alespoň zkontrolujeme zoom
        if (map.getZoom() < ZOOM_MIN) warningDiv.classList.remove('hidden');
    }
});