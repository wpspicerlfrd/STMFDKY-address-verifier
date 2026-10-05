// Google Apps Script Secure Proxy URL
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyzgar0fBEo35BdTn1UxGCGVWcYgC5jKbY9iRgnHVjI9usWlzYsqM8XZeMQQntEWN6Ojw/exec';

window.sharedFoodNotes = {};
window.sharedHospitalNotes = {};

// DOM Elements
let inputEl, clearBtn, verifyBtn, statusDiv, mapWrapper, historyContainer, historyList;

let map;
let marker;
let boundaryPolygon;
let boundaryBounds;
let geocoder;
let autocomplete;
let searchHistory = [];
let userLocation = null;
let currentEatsCategory = 'all';
let currentSearchedAddress = '';
let dispatchIntervalTimer = null;

// St. Matthews Fire & EMS Station Coordinates
const stmfdStations = [
    { unit: "146", lat: 38.2520, lng: -85.6441 },
    { unit: "147", lat: 38.2818, lng: -85.6322 },
    { unit: "148", lat: 38.2611, lng: -85.5898 },
    { unit: "149", lat: 38.2785, lng: -85.5841 }
];

document.addEventListener("DOMContentLoaded", () => {
    inputEl = document.getElementById('addressInput');
    clearBtn = document.getElementById('clearBtn');
    verifyBtn = document.getElementById('verifyBtn');
    statusDiv = document.getElementById('status');
    mapWrapper = document.getElementById('mapWrapper');
    historyContainer = document.getElementById('historyContainer');
    historyList = document.getElementById('historyList');

    if (inputEl) {
        inputEl.addEventListener('focus', function() { if (this.value) resetForm(); });
        inputEl.addEventListener('input', function() { clearBtn.style.display = this.value ? 'block' : 'none'; });
        inputEl.addEventListener('keydown', e => { if (e.key === 'Enter') verifyAddress(); });
    }

    // Set up QR Code and Share links dynamically
    const currentAppUrl = window.location.href.split('?')[0];
    const appUrlTextEl = document.getElementById('appUrlText');
    const qrCodeImgEl = document.getElementById('qrCodeImg');
    const smsShareBtnEl = document.getElementById('smsShareBtn');

    if (appUrlTextEl) appUrlTextEl.innerText = currentAppUrl;
    if (qrCodeImgEl) qrCodeImgEl.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(currentAppUrl)}`;
    if (smsShareBtnEl) smsShareBtnEl.href = `sms:?body=${encodeURIComponent("Check out the STMFD SMART EMS App: " + currentAppUrl)}`;

    // Startup Execution
    getUserGeolocation();
    renderRoutingHospitals();
    loadGoogleMaps();
    loadSharedNotes();
    startDispatchAutoPolling();
});

// Helper Functions
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function setNearestUnitDefault(fallbackLatLng) {
    const unitSelect = document.getElementById('unitSelect');
    if (!unitSelect) return;

    let referenceLat = userLocation ? userLocation.lat : null;
    let referenceLng = userLocation ? userLocation.lng : null;

    if (referenceLat === null && fallbackLatLng) {
        referenceLat = typeof fallbackLatLng.lat === 'function' ? fallbackLatLng.lat() : fallbackLatLng.lat;
        referenceLng = typeof fallbackLatLng.lng === 'function' ? fallbackLatLng.lng() : fallbackLatLng.lng;
    }

    if (referenceLat === null || referenceLng === null) return;

    let nearestUnit = "146";
    let shortestDistance = Infinity;

    stmfdStations.forEach(st => {
        const dist = calculateDistance(referenceLat, referenceLng, st.lat, st.lng);
        if (dist < shortestDistance) {
            shortestDistance = dist;
            nearestUnit = st.unit;
        }
    });

    unitSelect.value = nearestUnit;
}

function getUserGeolocation() {
    const locStatus = document.getElementById('locationStatus');
    const routingLocStatus = document.getElementById('routingLocationStatus');
    
    const updateStatusText = (html) => {
        if (locStatus) locStatus.innerHTML = html;
        if (routingLocStatus) routingLocStatus.innerHTML = html;
    };

    if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
                updateStatusText(`<span>📍 Distance sorted from current GPS position</span>`);
                evaluateDestination();
                renderRoutingHospitals();
            },
            (error) => {
                userLocation = { lat: 38.2520, lng: -85.6441 };
                updateStatusText(`<span>📍 GPS unavailable. Distance sorted from St. Matthews St. 46</span>`);
                evaluateDestination();
                renderRoutingHospitals();
            },
            { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
        );
    } else {
        userLocation = { lat: 38.2520, lng: -85.6441 };
        updateStatusText(`<span>📍 Distance sorted from St. Matthews St. 46</span>`);
        evaluateDestination();
        renderRoutingHospitals();
    }
}

function renderRoutingHospitals() {
    const jeffersonGrid = document.getElementById('jeffersonErGrid');
    const outsideGrid = document.getElementById('outsideErGrid');
    if (!jeffersonGrid || !outsideGrid) return;

    let sortedHospitals = masterHospitals.map(hosp => {
        let dist = userLocation ? calculateDistance(userLocation.lat, userLocation.lng, hosp.lat, hosp.lng) : null;
        return { ...hosp, distance: dist };
    });

    if (userLocation) sortedHospitals.sort((a, b) => a.distance - b.distance);

    const jeffersonList = sortedHospitals.filter(h => h.region === 'jefferson');
    const outsideList = sortedHospitals.filter(h => h.region === 'outside');

    const createCardHtml = (hosp) => {
        let cardClass = "er-card";
        if (hosp.type === "peds") cardClass += " peds";
        if (hosp.type === "split") cardClass += " split-peds";
        
        const distText = hosp.distance !== null ? `<span class="dist-tag">(${hosp.distance.toFixed(1)} mi)</span>` : '';
        const existingNote = (window.sharedHospitalNotes && window.sharedHospitalNotes[hosp.id]) || '';
        const noteIndicator = existingNote ? ' 📝' : '';

        return `
            <div class="${cardClass}">
                <div class="er-header-row">
                    <div class="er-title-area">
                        <span>${hosp.name}${distText}${noteIndicator}</span>
                    </div>
                    <div style="display: flex; gap: 6px; flex-shrink: 0;">
                        <button class="note-toggle-btn" onclick="toggleHospitalNotes('hosp-${hosp.id}')">📝 Notes</button>
                        <button class="nav-link-btn" onclick="openNav(${hosp.lat}, ${hosp.lng})">MAP Nav</button>
                    </div>
                </div>
                <div id="hosp-notes-hosp-${hosp.id}" class="notes-section">
                    <input type="text" id="hosp-note-input-hosp-${hosp.id}" value="${existingNote}" placeholder="Add shared crew note (e.g. ambulance entrance tips)...">
                    <button class="web-link-btn" onclick="saveHospitalNote('${hosp.id}', document.getElementById('hosp-note-input-hosp-${hosp.id}').value)">💾 Save Note to Cloud</button>
                </div>
            </div>
        `;
    };

    jeffersonGrid.innerHTML = jeffersonList.map(createCardHtml).join('');
    outsideGrid.innerHTML = outsideList.map(createCardHtml).join('');
}

function updateEmergencyOptions() {
    const cat = document.getElementById('patientCategory').value;
    const select = document.getElementById('conditionSelect');
    select.innerHTML = '';

    const list = cat === 'adult' ? adultConditions : pedConditions;
    list.forEach(item => {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.innerText = item.title;
        select.appendChild(opt);
    });

    evaluateDestination();
}

function evaluateDestination() {
    const cat = document.getElementById('patientCategory').value;
    const condId = document.getElementById('conditionSelect').value;
    const list = cat === 'adult' ? adultConditions : pedConditions;
    const selected = list.find(x => x.id === condId);

    const resultPanel = document.getElementById('guidelineResult');
    if (!selected) {
        resultPanel.classList.remove('active');
        return;
    }

    resultPanel.classList.add('active');
    document.getElementById('resultCategory').innerText = cat === 'adult' ? 'Adult Emergency Category' : 'Pediatric Emergency Category';
    document.getElementById('resultTitle').innerText = selected.title;
    document.getElementById('resultDef').innerText = selected.def;

    const noteEl = document.getElementById('protocolNote');
    if (selected.note) {
        noteEl.style.display = 'block';
        noteEl.innerText = selected.note;
    } else {
        noteEl.style.display = 'none';
    }

    let capableList = selected.hospitalIds.map(id => {
        const hosp = masterHospitals.find(h => h.id === id);
        let dist = (hosp && userLocation) ? calculateDistance(userLocation.lat, userLocation.lng, hosp.lat, hosp.lng) : null;
        return { ...hosp, distance: dist };
    }).filter(h => h.name);

    if (userLocation) capableList.sort((a, b) => a.distance - b.distance);

    const hospContainer = document.getElementById('capableHospitals');
    hospContainer.innerHTML = '';
    
    capableList.forEach(hosp => {
        let cardClass = "er-card";
        if (hosp.type === "peds") cardClass += " peds";
        if (hosp.type === "split") cardClass += " split-peds";
        
        const distText = hosp.distance !== null ? `<span class="dist-tag">(${hosp.distance.toFixed(1)} mi)</span>` : '';
        const existingNote = (window.sharedHospitalNotes && window.sharedHospitalNotes[hosp.id]) || '';
        const noteIndicator = existingNote ? ' 📝' : '';

        const card = document.createElement('div');
        card.className = cardClass;
        card.innerHTML = `
            <div class="er-header-row">
                <div class="er-title-area">
                    <span>${hosp.name}${distText}${noteIndicator}</span>
                </div>
                <div style="display: flex; gap: 6px; flex-shrink: 0;">
                    <button class="note-toggle-btn" onclick="toggleHospitalNotes('triage-${hosp.id}')">📝 Notes</button>
                    <button class="nav-link-btn" onclick="openNav(${hosp.lat}, ${hosp.lng})">MAP Nav</button>
                </div>
            </div>
            <div id="hosp-notes-triage-${hosp.id}" class="notes-section">
                <input type="text" id="hosp-note-input-triage-${hosp.id}" value="${existingNote}" placeholder="Add shared crew note (e.g. ambulance entrance tips)...">
                <button class="web-link-btn" onclick="saveHospitalNote('${hosp.id}', document.getElementById('hosp-note-input-triage-${hosp.id}').value)">💾 Save Note to Cloud</button>
            </div>
        `;
        hospContainer.appendChild(card);
    });
}

// FirstDue Real-Time Dispatch Pulling
async function fetchRecentDispatches() {
    const statusEl = document.getElementById('dispatchRefreshStatus');
    if (statusEl) statusEl.innerText = 'Syncing...';

    try {
        const response = await fetch(`${GAS_WEB_APP_URL}?action=get_dispatches`, { redirect: 'follow' });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();

        if (data.status === 'error' || data.error) {
            console.error('FirstDue Proxy Error:', data.message || data.error);
            if (statusEl) statusEl.innerText = 'Sync error';
            return;
        }

        renderDispatchList(data);
        if (statusEl) statusEl.innerText = `Updated: ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}`;
    } catch (err) {
        console.error('Failed to pull FirstDue dispatches:', err);
        if (statusEl) statusEl.innerText = 'Sync error';
    }
}

function renderDispatchList(data) {
    const container = document.getElementById('recentDispatchesList');
    if (!container) return;

    let calls = [];
    if (Array.isArray(data)) {
        calls = data;
    } else if (typeof data === 'object' && data !== null) {
        calls = data.calls || data.dispatches || data.data || data.incidents || data.events || [];
    }

    const recentTen = calls.slice(0, 10);

    if (recentTen.length === 0) {
        container.innerHTML = '<div style="font-size:12px; color:#718096; padding:10px; text-align:center;">No recent dispatch calls retrieved.</div>';
        return;
    }

    container.innerHTML = recentTen.map(call => {
        const rawAddress = call.address || call.location || call.incident_address || call.street_address || 'Unknown Address';
        const city = call.city ? `, ${call.city}` : '';
        const fullAddress = `${rawAddress}${city}`;
        
        const callType = call.type || call.incident_type_code || call.description || call.nature || 'EMS Call';
        
        // Extract Sector/Box Area designation from payload fields or address regex
        let rawSector = call.sector || call.zone || call.box_area || call.district || '';
        if (!rawSector) {
            const sectorMatch = (fullAddress + ' ' + callType).match(/\b(SE\d{2,3}|SECTOR\s*\d{2,3}|BOX\s*\d{2,4})\b/i);
            if (sectorMatch) rawSector = sectorMatch[0];
        }

        let sectorBadge = '';
        if (rawSector) {
            let cleanSec = rawSector.toString().trim().toUpperCase();
            if (!cleanSec.startsWith('SE')) {
                cleanSec = 'SE' + cleanSec.replace(/[^0-9]/g, '');
            }
            sectorBadge = `<span style="background-color: #003366; color: #ffffff; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 4px; margin-left: 6px;">${cleanSec}</span>`;
        }

        const units = Array.isArray(call.unit_codes) && call.unit_codes.length > 0 
            ? call.unit_codes.join(', ') 
            : (call.unit || call.assigned_units || '');

        const timeStr = call.created_at || call.dispatch_time ? 
            new Date(call.created_at || call.dispatch_time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '';

        // Safe extraction of Lat/Lng coordinates from raw FirstDue payload
        const rawLat = parseFloat(call.latitude || call.lat || (call.location && call.location.lat));
        const rawLng = parseFloat(call.longitude || call.lng || call.lon || (call.location && call.location.lng));
        const hasCoords = !isNaN(rawLat) && !isNaN(rawLng);

        // Verification button action: Uses exact Lat/Long pin if present, or falls back to address geocoding
        const clickHandler = hasCoords 
            ? `verifyDispatchCoords(${rawLat}, ${rawLng}, '${fullAddress.replace(/'/g, "\\'")}')`
            : `selectDispatchAddress('${fullAddress.replace(/'/g, "\\'")}')`;

        const locationTag = hasCoords ? `<span style="color:#2b6cb0; font-size:11px; font-weight:600; margin-left:4px;">📍 GPS Pin</span>` : '';

        return `
            <div class="er-card" style="margin-bottom: 6px; padding: 10px; background-color: #f8fafc; border-left: 4px solid #3182ce;">
                <div class="er-header-row">
                    <div class="er-title-area">
                        <strong style="color: #003366; font-size: 14px;">${callType}</strong>${sectorBadge}${locationTag}
                        <span style="display: block; font-size: 13px; color: #2d3748; margin-top: 3px;">${fullAddress}</span>
                        <span class="station-subtitle" style="display: block; font-size: 11px; color: #718096; margin-top: 2px;">
                            ${units ? 'Unit: ' + units + ' | ' : ''}${timeStr}
                        </span>
                    </div>
                    <button class="action-btn" style="padding: 6px 12px; font-size: 12px; flex-shrink: 0;" onclick="${clickHandler}">
                        Verify
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

// Maps direct Lat/Lng points straight onto the district map
function verifyDispatchCoords(lat, lng, fallbackLabel) {
    if (typeof google !== 'undefined' && google.maps && map) {
        const latLng = new google.maps.LatLng(lat, lng);
        map.setCenter(latLng);
        map.setZoom(16);
        handleMapClick(latLng);
    } else {
        selectDispatchAddress(fallbackLabel);
    }
}

function selectDispatchAddress(address) {
    if (inputEl) {
        inputEl.value = address;
        clearBtn.style.display = 'block';
        verifyAddress();
    }
}

function startDispatchAutoPolling() {
    fetchRecentDispatches();
    if (dispatchIntervalTimer) clearInterval(dispatchIntervalTimer);
    dispatchIntervalTimer = setInterval(fetchRecentDispatches, 60000);
}

// Shift Eats Functions
function pickRandomRestaurant() {
    const resultCard = document.getElementById('randomResult');
    const nameEl = document.getElementById('randomName');
    const noteEl = document.getElementById('randomNote');
    const navBtn = document.getElementById('randomNavBtn');
    const googleBtn = document.getElementById('randomGoogleBtn');
    const webBtn = document.getElementById('randomWebBtn');

    resultCard.style.display = 'block';
    nameEl.innerText = 'Spinning... 🎲';
    noteEl.style.display = 'none';
    noteEl.innerText = '';

    let counter = 0;
    const interval = setInterval(() => {
        const tempIdx = Math.floor(Math.random() * restaurantList.length);
        nameEl.innerText = restaurantList[tempIdx];
        counter++;
        if (counter > 12) {
            clearInterval(interval);
            const finalIdx = Math.floor(Math.random() * restaurantList.length);
            const picked = restaurantList[finalIdx];
            nameEl.innerText = picked;
            
            const noteText = window.sharedFoodNotes && window.sharedFoodNotes[picked];
            if (noteText) {
                noteEl.style.display = 'block';
                noteEl.innerText = '📝 Note: ' + noteText;
            } else {
                noteEl.style.display = 'none';
            }

            navBtn.onclick = () => openNavAddress(picked + ', Louisville, KY');
            googleBtn.onclick = () => openWebSearch(picked + ' Louisville KY');
            webBtn.onclick = () => openWebSearch(picked + ' Louisville KY order menu');
        }
    }, 80);
}

function setCategoryFilter(cat, btnEl) {
    currentEatsCategory = cat;
    document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
    if (btnEl) btnEl.classList.add('active');
    filterRestaurants();
}

function filterRestaurants() {
    const grid = document.getElementById('restaurantGrid');
    const searchInputEl = document.getElementById('eatsSearchInput');
    const totalCountEl = document.getElementById('totalCount');
    if (totalCountEl) totalCountEl.innerText = restaurantList.length;

    if (!grid || !searchInputEl) return;
    
    const query = (searchInputEl.value || '').toLowerCase();

    const categoryKeywords = {
        'pizza': ['pizza', 'bearnos', 'boombozz', 'diorio', 'jet', 'papa json', 'pizzaville', 'redbrick', 'coals', 'blaze', 'saints', 'impellizzeri', 'craft house'],
        'mexican': ['mexican', 'taco', 'nopal', 'tarasco', 'condado', 'aztecas', 'cocina', 'tres amigos', 'limón', 'limon', 'bandido', 'chuy', 'felipe', 'las maria', 'salsarita', 'qdoba', 'chipotle', 'mariachi', 'guanajuato'],
        'bbq': ['barbeque', 'bbq', 'momma', 'city barbeque', 'mission bbq', 'charcoal', 'pickles & bbq', 'kupbop'],
        'burgers': ['burger', 'smashburger', 'white castle', 'wendy', 'mcdonald', 'five guys', 'red robin', 'cousins', 'drake', 'jack in the box', 'jaggers', 'charleys'],
        'asian': ['thai', 'asahi', 'china', 'ginza', 'jade palace', 'lemongrass', 'nam nam', 'oriental house', 'p.f. chang', 'panda express', 'pho', 'sakura', 'simply thai', 'tokyo', 'togo sushi', 'wasabi', 'bahn thai', 'jasmin', 'hiko-A-mon', 'choi', 'ruby thai'],
        'breakfast': ['cafe', 'coffee', 'bagel', 'biscuit belly', 'bruegger', 'con huevos', 'dunkin', 'first watch', 'heine', 'highland morning', 'ihop', 'wild eggs', 'waffle house', 'cinnaholic', 'donut', 'plehn', 'bakery', 'eats', 'paris baguette', 'north lime', 'starving artists', 'bamboo', 'cinnabon', 'nothing bundt', 'sunergos', 'graeter', 'comfy cow', 'deli', 'fruit', 'blossom', 'elderberry', 'half-peach', 'crumbl', 'panaderia', 'tortilleria', 'supermercado', 'carniceria', 'baskin-robbins']
    };

    const filtered = restaurantList.filter(name => {
        const lowerName = name.toLowerCase();
        const matchesQuery = lowerName.includes(query);
        if (!matchesQuery) return false;
        if (currentEatsCategory === 'all') return true;
        const keywords = categoryKeywords[currentEatsCategory] || [];
        return keywords.some(kw => lowerName.includes(kw));
    });

    if (filtered.length === 0) {
        grid.innerHTML = `<div style="color: #718096; text-align: center; padding: 15px; grid-column: 1 / -1;">No matching places found. Try another search!</div>`;
        return;
    }

    grid.innerHTML = filtered.map(name => {
        const safeName = name.replace(/[^a-zA-Z0-9]/g, '_');
        const existingNote = (window.sharedFoodNotes && window.sharedFoodNotes[name]) || '';
        const noteIndicator = existingNote ? ' 📝' : '';
        
        return `
            <div class="er-card">
                <div class="er-header-row">
                    <div class="er-title-area">
                        <span>${name}${noteIndicator}</span>
                    </div>
                    <div style="display: flex; gap: 4px; flex-shrink: 0;">
                        <button class="note-toggle-btn" onclick="toggleFoodNotes('${safeName}')">📝 Notes</button>
                        <button class="google-link-btn" onclick="openWebSearch('${name.replace(/'/g, "\\'")}, Louisville KY')">🔍 Google</button>
                        <button class="nav-link-btn" onclick="openNavAddress('${name.replace(/'/g, "\\'")}, Louisville, KY')">MAP Nav</button>
                    </div>
                </div>
                <div id="food-notes-${safeName}" class="notes-section">
                    <input type="text" id="food-note-input-${safeName}" value="${existingNote}" placeholder="Add shared crew note (e.g. fast delivery, parking tip)...">
                    <button class="web-link-btn" onclick="saveFoodNote('${name.replace(/'/g, "\\'")}', document.getElementById('food-note-input-${safeName}').value)">💾 Save Note to Cloud</button>
                </div>
            </div>
        `;
    }).join('');
}

// Cloud Syncing
async function loadSharedNotes() {
    try {
        const response = await fetch(GAS_WEB_APP_URL);
        const data = await response.json();
        window.sharedFoodNotes = (data.record && data.record.notes) || data.notes || {};
        window.sharedHospitalNotes = (data.record && data.record.hospitalNotes) || data.hospitalNotes || {};
        filterRestaurants();
        renderRoutingHospitals();
    } catch (err) {
        console.error('Failed to load shared notes', err);
    }
}

async function saveFoodNote(restaurantName, noteText) {
    if (!window.sharedFoodNotes) window.sharedFoodNotes = {};
    window.sharedFoodNotes[restaurantName] = noteText;

    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ 
                notes: window.sharedFoodNotes, 
                hospitalNotes: window.sharedHospitalNotes 
            })
        });
        
        if (response.ok) alert('Food note saved to cloud!');
    } catch (err) {
        console.error('Failed to save food note', err);
    }
}

async function saveHospitalNote(hospId, noteText) {
    if (!window.sharedHospitalNotes) window.sharedHospitalNotes = {};
    window.sharedHospitalNotes[hospId] = noteText;

    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({ 
                notes: window
