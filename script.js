// script.js
document.addEventListener('DOMContentLoaded', function() {
    const ZOOM_MIN = 14;               // minimální zoom pro načtení povrchů
    const OVERPASS_ENDPOINT = 'https://overpass-api.de/api/interpreter';
    const MIN_REQUEST_INTERVAL = 2000;  // milisekundy mezi dotazy (ochrana API)

    // Barevná mapa povrchů
    const surfaceColors = {
        'asphalt': '#333333',
        'concrete': '#999999',
        'concrete:plates': '#aaaaaa',
        'paving_stones': '#ffaa00',
        'paving_stones:30': '#ffaa00',
        'dirt': '#8B4513',
        'ground': '#8B4513',
        'gravel': '#b87333',
        'sand': '#f4e9d9',
        'grass': '#7cfc00',
        'compacted': '#b8860b',
        'fine_gravel': '#b8860b',
        'unpaved': '#8B4513',
        'wood': '#deb887',
        'sett': '#ccaa88',
        'cobblestone': '#aa8866',
        'metal': '#c0c0c0',
        'plastic': '#ff00ff',
    };
    const defaultColor = '#ff00ff'; // magenta pro neznámé / ostatní

    function getSurfaceColor(surface) {
        if (!surface) return defaultColor;
        let s = surface.toLowerCase().split(';')[0].trim();
        return surfaceColors[s] || defaultColor;
    }

    // Inicializace mapy (Praha, centrum)
    const map = L.map('map').setView([50.087, 14.421], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    const surfaceLayer = L.layerGroup().addTo(map);

    // DOM elementy
    const autoLoadCheckbox = document.getElementById('autoLoad');
    const loadButton = document.getElementById('loadButton');
    const warningDiv = document.getElementById('warning');
    const loadingDiv = document.getElementById('loading');
    const errorDiv = document.getElementById('error');

    let isLoading = false;
    let lastRequestTime = 0;

    // Zobraz / skryj varování podle zoomu
    function checkZoomAndWarn() {
        const zoom = map.getZoom();
        if (zoom < ZOOM_MIN) {
            warningDiv.classList.remove('hidden');
        } else {
            warningDiv.classList.add('hidden');
        }
    }

    // Hlavní funkce pro stažení a vykreslení dat
    async function loadData() {
        const zoom = map.getZoom();
        if (zoom < ZOOM_MIN) {
            warningDiv.classList.remove('hidden');
            surfaceLayer.clearLayers();   // smaž stará data
            return;
        } else {
            warningDiv.classList.add('hidden');
        }

        // Rate limiting – omezíme frekvenci požadavků
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
            if (!response.ok) {
                throw new Error(`HTTP chyba ${response.status}`);
            }
            const data = await response.json();

            // Vyčistíme staré vrstvy
            surfaceLayer.clearLayers();

            const elements = data.elements || [];
            for (const el of elements) {
                if (el.type !== 'way' || !el.geometry) continue;

                const surface = el.tags?.surface;
                const color = getSurfaceColor(surface);
                const latlngs = el.geometry.map(p => [p.lat, p.lon]);

                L.polyline(latlngs, {
                    color: color,
                    weight: 4,
                    opacity: 0.8,
                    smoothFactor: 1
                }).addTo(surfaceLayer);
            }

            lastRequestTime = Date.now();
        } catch (err) {
            console.error('Chyba při načítání Overpass dat:', err);
            errorDiv.textContent = 'Chyba při načítání dat. Zkuste to prosím později.';
            errorDiv.classList.remove('hidden');
        } finally {
            isLoading = false;
            loadingDiv.classList.add('hidden');
        }
    }

    // Události mapy
    map.on('moveend', function() {
        checkZoomAndWarn();
        if (autoLoadCheckbox.checked) {
            loadData();
        }
    });

    // Manuální tlačítko
    loadButton.addEventListener('click', function() {
        loadData();
    });

    // Prvotní kontrola a načtení
    checkZoomAndWarn();
    if (autoLoadCheckbox.checked) {
        loadData();
    }
});