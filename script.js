// script.js
document.addEventListener('DOMContentLoaded', function() {
    // ========== KONFIGURACE ==========
    const ZOOM_MIN = 14;
    const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
    const MIN_REQUEST_INTERVAL = 2000; // ms
    const NO_SURFACE_COLOR = '#e67e22'; // oranžová pro cesty bez povrchu

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
        'tartan': '#e74c3c',
        'artificial_turf': '#2ecc71',
        'acrylic': '#3498db',
        'decoturf': '#2980b9',
        'clay': '#c44536',
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
        { id: 'kamen', label: 'Kámen', color: '#95a5a6', surfaces: ['stone', 'rock', 'granite'] },
        { id: 'piasek', label: 'Písek', color: '#f4e9d9', surfaces: ['sand'] },
        { id: 'umele', label: 'Umělé', color: '#9b59b6', surfaces: ['plastic', 'rubber', 'tartan', 'artificial_turf', 'acrylic', 'decoturf', 'clay', 'tennis_clay'] },
        { id: 'travni', label: 'Travnaté', color: '#7cfc00', surfaces: ['grass', 'grass_paver', 'gravel_turf'] },
        { id: 'bez', label: 'Bez povrchu', color: NO_SURFACE_COLOR, surfaces: [] }, // speciální kategorie
        { id: 'ostatni', label: 'Ostatní', color: '#9b59b6', surfaces: [] }
    ];

    // pomocná funkce: zjistí kategorii podle surface
    function getCategoryId(surface) {
        if (!surface || surface === '') return 'bez'; // cesty bez surface tagu
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
    let categoryStats = {};        // statistiky pro legendu

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
    const legendToggle = document.getElementById('legendToggle');
    const legendContent = document.getElementById('legendContent');
    const osmLink = document.getElementById('osmLink');

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
                renderWays();
                updateLegendHighlights();
            });
            label.appendChild(cb);
            label.appendChild(document.createTextNode(cat.label));
            // malá barevná tečka
            const dot = document.createElement('span');
            dot.className = 'color-dot';
            dot.style.backgroundColor = cat.id === 'bez' ? NO_SURFACE_COLOR : cat.color;
            dot.style.marginLeft = 'auto';
            if (cat.id === 'bez') {
                dot.classList.add('no-surface');
                dot.style.width = '14px';
                dot.style.height = '14px';
            }
            label.appendChild(dot);
            div.appendChild(label);
            filtersContainer.appendChild(div);
        });
    }

    // ========== VYKRESLENÍ CEST PODLE FILTRŮ ==========
    function renderWays() {
        surfaceLayer.clearLayers();
        let visibleCount = 0;

        // Reset statistik
        categoryStats = {};
        categories.forEach(cat => categoryStats[cat.id] = 0);

        allWays.forEach(way => {
            const catId = getCategoryId(way.surface);
            categoryStats[catId] = (categoryStats[catId] || 0) + 1;

            if (!filterState[catId]) return; // filtr nepropustí

            visibleCount++;
            
            // Získání barvy - speciální styl pro cesty bez povrchu
            let color, dashArray, weight, opacity;
            
            if (!way.surface || way.surface === '') {
                // Cesta bez surface tagu - čárkovaná oranžová čára
                color = NO_SURFACE_COLOR;
                dashArray = '8, 6';
                weight = 4;
                opacity = 0.7;
            } else {
                color = surfaceColors[way.surface?.toLowerCase()] || defaultColor;
                dashArray = null;
                weight = 4;
                opacity = 0.8;
            }

            // Vytvoření polyline
            const polyline = L.polyline(way.latlngs, {
                color: color,
                weight: weight,
                opacity: opacity,
                smoothFactor: 1,
                dashArray: dashArray
            });

            // Popup s informacemi
            let popupText = `<b>Povrch:</b> ${way.surface || '<span style="color:#e67e22;">⚠️ bez surface tagu</span>'}<br>`;
            popupText += `<b>Highway:</b> ${way.highway || 'neznámý'}<br>`;
            if (way.name) popupText += `<b>Název:</b> ${way.name}<br>`;
            if (way.length) popupText += `<b>Délka:</b> ${way.length.toFixed(0)} m<br>`;
            
            // Odkaz na OSM
            popupText += `<hr style="margin:8px 0;opacity:0.3">`;
            popupText += `<a href="https://www.openstreetmap.org/way/${way.id}" target="_blank">🔗 Zobrazit v OSM</a>`;
            
            polyline.bindPopup(popupText);

            polyline.addTo(surfaceLayer);
        });

        totalSpan.textContent = allWays.length;
        visibleSpan.textContent = visibleCount;
        
        // Aktualizace statistik v legendě
        updateLegendCounts();
    }

    // ========== AKTUALIZACE POČTŮ V LEGENDĚ ==========
    function updateLegendCounts() {
        categories.forEach(cat => {
            const countEl = document.getElementById(`count-${cat.id}`);
            if (countEl) {
                countEl.textContent = categoryStats[cat.id] || 0;
            }
        });
    }

    // ========== ZVÝRAZNĚNÍ AKTIVNÍCH FILTRŮ V LEGENDĚ ==========
    function updateLegendHighlights() {
        const legendItems = document.querySelectorAll('.legend-item');
        legendItems.forEach(item => {
            const category = item.getAttribute('data-category');
            if (category && filterState[category]) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });
    }

    // ========== INTERAKTIVNÍ LEGENDA ==========
    function setupLegend() {
        // Přepínání rozbalení legendy
        legendToggle.addEventListener('click', () => {
            legendContent.classList.toggle('collapsed');
            const arrow = legendToggle.querySelector('.legend-arrow');
            arrow.textContent = legendContent.classList.contains('collapsed') ? '▶' : '▼';
        });

        // Kliknutí na položku legendy - přepnutí filtru
        const legendItems = document.querySelectorAll('.legend-item');
        legendItems.forEach(item => {
            item.addEventListener('click', () => {
                const category = item.getAttribute('data-category');
                if (category && filterState.hasOwnProperty(category)) {
                    filterState[category] = !filterState[category];
                    saveSettings();
                    renderFilterCheckboxes();
                    renderWays();
                    updateLegendHighlights();
                }
            });
        });
    }

    // ========== ODKAZ NA OSM ==========
    function updateOsmLink() {
        const center = map.getCenter();
        const url = `https://www.openstreetmap.org/?map=${map.getZoom()}/${center.lat.toFixed(5)}/${center.lng.toFixed(5)}`;
        osmLink.href = url;
    }

    // ========== STAŽENÍ DAT Z OVERPASS API ==========
    async function loadData() {
        const zoom = map.getZoom();
        if (zoom < ZOOM_MIN) {
            warningDiv.classList.remove('hidden');
            surfaceLayer.clearLayers();
            allWays = [];
            renderWays();
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
        
        // Upravený dotaz - stahuje i cesty bez surface tagu
        const query = `[out:json];way[highway](${bbox});out geom;`;
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
                    surface: el.tags?.surface || '', // prázdný string pro cesty bez surface
                    highway: el.tags?.highway,
                    name: el.tags?.name,
                    latlngs: latlngs,
                    length: length
                });
            }

            allWays = newWays;
            lastRequestTime = Date.now();
            renderWays();
            updateOsmLink();
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
            if (map.getZoom() < ZOOM_MIN) warningDiv.classList.remove('hidden');
            else warningDiv.classList.add('hidden');
        }
        updateOsmLink();
    });

    map.on('zoomend', function() {
        if (autoLoadCheckbox.checked) {
            loadData();
        } else {
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
        updateLegendHighlights();
    });

    deselectAllBtn.addEventListener('click', () => {
        categories.forEach(cat => filterState[cat.id] = false);
        renderFilterCheckboxes();
        saveSettings();
        renderWays();
        updateLegendHighlights();
    });

    autoLoadCheckbox.addEventListener('change', () => {
        saveSettings();
    });

    // ========== SPUŠTĚNÍ ==========
    loadSettings();
    setupLegend();
    updateLegendHighlights();
    
    if (autoLoadCheckbox.checked) {
        setTimeout(() => loadData(), 300);
    } else {
        if (map.getZoom() < ZOOM_MIN) warningDiv.classList.remove('hidden');
    }
});
