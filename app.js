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
                notes: window.sharedFoodNotes, 
                hospitalNotes: window.sharedHospitalNotes 
            })
        });
        
        if (response.ok) {
            alert('Hospital note saved and shared with the crew!');
            renderRoutingHospitals();
            if (document.getElementById('guidelinesTab').classList.contains('active')) {
                evaluateDestination();
            }
        }
    } catch (err) {
        console.error('Failed to save hospital note', err);
    }
}

async function logCanceledRun() {
    const selectedUnit = document.getElementById('unitSelect').value;
    const logBtn = document.getElementById('logRunBtn');

    if (!currentSearchedAddress) {
        alert('No valid location selected to log.');
        return;
    }

    logBtn.disabled = true;
    logBtn.innerText = '⏳ Logging run...';

    const timestamp = new Date().toLocaleString("en-US", { timeZone: "America/Kentucky/Louisville" });

    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: 'POST',
            redirect: 'follow',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'log_run',
                timestamp: timestamp,
                unit: selectedUnit,
                address: currentSearchedAddress
            })
        });

        const result = await response.json();
        if (result.status === 'success') {
            alert(`Canceled run logged successfully for Medic ${selectedUnit}!`);
            document.getElementById('logRunContainer').style.display = 'none';
        } else {
            alert('Error logging run: ' + (result.message || 'Unknown error'));
        }
    } catch (err) {
        console.error('Failed to log canceled run', err);
    } finally {logBtn.disabled = false;
        logBtn.innerText = '📋 Log Canceled Run to Cloud Sheet';
    }
}

function toggleFoodNotes(id) {
    const panel = document.getElementById(`food-notes-${id}`);
    if (panel) panel.classList.toggle('active');
}

function toggleHospitalNotes(compoundId) {
    const panel = document.getElementById(`hosp-notes-${compoundId}`);
    if (panel) panel.classList.toggle('active');
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW registration failed: ', err));
    });
}

function copyAppUrl() {
    const currentAppUrl = window.location.href.split('?')[0];
    navigator.clipboard.writeText(currentAppUrl).then(() => {
        alert('App link copied to clipboard!');
    });
}

function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    const tabIndices = {
        'verifier': 0,
        'protocols': 1,
        'guidelines': 2,
        'routing': 3,
        'home': 4,
        'eats': 5,
        'share': 6
    };

    if (tabIndices[tab] !== undefined) {
        document.querySelectorAll('.tab-btn')[tabIndices[tab]].classList.add('active');
    }
    
    const tabEl = document.getElementById(tab + 'Tab');
    if (tabEl) tabEl.classList.add('active');

    if (tab === 'verifier') {
        if (!userLocation) getUserGeolocation();
        if (map && boundaryBounds) map.fitBounds(boundaryBounds);
    } else if (tab === 'guidelines') {
        if (!userLocation) getUserGeolocation();
        updateEmergencyOptions();
    } else if (tab === 'routing') {
        if (!userLocation) getUserGeolocation();
        renderRoutingHospitals();
    } else if (tab === 'eats') {
        loadSharedNotes();
    }
}

function resetForm() {
    if (inputEl) inputEl.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    if (statusDiv) {
        statusDiv.className = '';
        statusDiv.style.display = 'none';
        statusDiv.innerHTML = '';
    }
    const logContainer = document.getElementById('logRunContainer');
    if (logContainer) logContainer.style.display = 'none';
    if (marker) { marker.setMap(null); marker = null; }
    if (map && boundaryBounds) map.fitBounds(boundaryBounds);
}

function addHistoryEntry(address, statusClass, badgeText) {
    searchHistory = searchHistory.filter(item => item.address.toLowerCase() !== address.toLowerCase());
    searchHistory.unshift({ address, statusClass, badgeText });
    if (searchHistory.length > 10) searchHistory.pop();
    renderHistory();
}

function renderHistory() {
    if (!historyContainer || !historyList) return;
    if (searchHistory.length === 0) {
        historyContainer.style.display = 'none';
        historyList.innerHTML = '';
        return;
    }
    if (document.getElementById('verifierTab').classList.contains('active')) {
        historyContainer.style.display = 'block';
    }
    historyList.innerHTML = searchHistory.map(item => `
        <li class="history-item">
            <span class="history-address" title="${item.address}">${item.address}</span>
            <span class="badge ${item.statusClass}">${item.badgeText}</span>
        </li>
    `).join('');
}

function clearHistory() {
    searchHistory = [];
    renderHistory();
}

function openNav(lat, lng) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    let navUrl = isIOS ? `maps://maps.apple.com/?daddr=${lat},${lng}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`;
    window.open(navUrl, '_blank');
}

function openNavAddress(address) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || 
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const encodedAddress = encodeURIComponent(address);
    let navUrl = isIOS ? `maps://maps.apple.com/?daddr=${encodedAddress}&dirflg=d` : `https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}&travelmode=driving`;
    window.open(navUrl, '_blank');
}

function openWebSearch(query) {
    window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, '_blank');
}

function loadGoogleMaps() {
    const script = document.createElement("script");
    script.src = "https://maps.googleapis.com/maps/api/js?key=AIzaSyBCnFOrSS9cHJjJOKQ8Nsp0unHZs_IsYu0&libraries=geometry,places&callback=initMap&loading=async";
    script.async = true;
    script.defer = true;
    document.head.appendChild(script);
}

window.initMap = function() {
    map = new google.maps.Map(document.getElementById('map'), {
        zoom: 12,
        center: { lat: 38.2500, lng: -85.6500 },
        disableDefaultUI: true,
        zoomControl: true,
        gestureHandling: 'greedy'
    });

    geocoder = new google.maps.Geocoder();

    const louisvilleBounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(38.0000, -85.9500),
        new google.maps.LatLng(38.4500, -85.3500)
    );

    autocomplete = new google.maps.places.Autocomplete(inputEl, {
        bounds: louisvilleBounds,
        strictBounds: false,
        componentRestrictions: { country: 'us' },
        fields: ['formatted_address', 'geometry']
    });

    autocomplete.addListener('place_changed', function() {
        const place = autocomplete.getPlace();
        if (place && place.formatted_address) {
            inputEl.value = place.formatted_address;
            clearBtn.style.display = 'block';
            verifyAddress();
        }
    });

    map.data.addGeoJson(geojsonData);
    map.data.setStyle(function(feature) {
        return {
            fillColor: feature.getProperty('fill') || '#0000FF',
            fillOpacity: feature.getProperty('fill-opacity') || 0.25,
            strokeColor: feature.getProperty('stroke') || '#0000FF',
            strokeWeight: feature.getProperty('stroke-width') || 2,
            strokeOpacity: feature.getProperty('stroke-opacity') || 1
        };
    });

    const ring = geojsonData.features[0].geometry.coordinates[0];
    const path = ring.map(coord => ({ lat: coord[1], lng: coord[0] }));
    boundaryPolygon = new google.maps.Polygon({ paths: path });

    boundaryBounds = new google.maps.LatLngBounds();
    path.forEach(pt => boundaryBounds.extend(pt));
    map.fitBounds(boundaryBounds);

    map.addListener('click', function(e) { handleMapClick(e.latLng); });
    map.data.addListener('click', function(e) { handleMapClick(e.latLng); });
};

function handleMapClick(latLng) {
    const logContainer = document.getElementById('logRunContainer');
    if (logContainer) logContainer.style.display = 'none';

    if (marker) marker.setMap(null);
    marker = new google.maps.Marker({
        position: latLng,
        map: map,
        animation: google.maps.Animation.DROP,
        title: "Selected Location"
    });

    statusDiv.className = 'loading';
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '📍 Reverse-geocoding dropped pin...';

    geocoder.geocode({ location: latLng }, function(results, status) {
        let displayAddress = '';

        if (status === 'OK' && results[0]) {
            displayAddress = results[0].formatted_address;
        } else {
            displayAddress = `Coordinates: ${latLng.lat().toFixed(5)}, ${latLng.lng().toFixed(5)}`;
        }

        inputEl.value = displayAddress;
        clearBtn.style.display = 'block';
        currentSearchedAddress = displayAddress;

        const isInside = google.maps.geometry.poly.containsLocation(latLng, boundaryPolygon);
        const dirBtnHtml = `<br><button class="dir-btn-inline" onclick="openNav(${latLng.lat()}, ${latLng.lng()})">MAP Get Directions to Dropped Pin</button>`;

        if (isInside) {
            statusDiv.className = 'inside';
            statusDiv.style.display = 'block';
            statusDiv.innerHTML = `✅ IN DISTRICT: Dropped pin (${displayAddress}) is WITHIN the STMFDKY service area.${dirBtnHtml}`;
            addHistoryEntry(displayAddress, 'in-district', 'In District');
        } else {
            statusDiv.className = 'outside';
            statusDiv.style.display = 'block';
            statusDiv.innerHTML = `❌ OUT OF DISTRICT: Dropped pin (${displayAddress}) is OUTSIDE the STMFDKY service area.${dirBtnHtml}`;
            addHistoryEntry(displayAddress, 'out-district', 'Out of District');
            
            setNearestUnitDefault(latLng);
            if (logContainer) logContainer.style.display = 'block';
        }
    });
}

function verifyAddress() {
    const address = inputEl.value.trim();
    const logContainer = document.getElementById('logRunContainer');
    if (logContainer) logContainer.style.display = 'none';

    if (!address) {
        statusDiv.className = 'outside';
        statusDiv.style.display = 'block';
        statusDiv.innerHTML = '⚠️ Please enter an address to verify.';
        return;
    }

    verifyBtn.disabled = true;
    statusDiv.className = 'loading';
    statusDiv.style.display = 'block';
    statusDiv.innerHTML = '🔍 Checking address...';

    const searchAddress = address.toLowerCase().includes('ky') || address.toLowerCase().includes('kentucky') 
        ? address 
        : `${address}, Louisville, KY`;

    geocoder.geocode({ address: searchAddress }, function(results, status) {
        verifyBtn.disabled = false;

        if (status === 'OK' && results[0]) {
            const location = results[0].geometry.location;
            const formattedAddress = results[0].formatted_address;
            currentSearchedAddress = formattedAddress;
            const isInside = google.maps.geometry.poly.containsLocation(location, boundaryPolygon);

            const dirBtnHtml = `<br><button class="dir-btn-inline" onclick="openNav(${location.lat()}, ${location.lng()})">MAP Get Directions to Address</button>`;

            if (isInside) {
                statusDiv.className = 'inside';
                statusDiv.style.display = 'block';
                statusDiv.innerHTML = '✅ IN DISTRICT: Address is WITHIN the STMFDKY service area.' + dirBtnHtml;
                addHistoryEntry(formattedAddress, 'in-district', 'In District');
            } else {
                statusDiv.className = 'outside';
                statusDiv.style.display = 'block';
                statusDiv.innerHTML = '❌ OUT OF DISTRICT: Address is OUTSIDE the STMFDKY service area.' + dirBtnHtml;
                addHistoryEntry(formattedAddress, 'out-district', 'Out of District');
                
                setNearestUnitDefault(location);
                if (logContainer) logContainer.style.display = 'block';
            }

            if (marker) marker.setMap(null);
            marker = new google.maps.Marker({ position: location, map: map, title: address });
            map.setCenter(location);
            map.setZoom(15);
        } else {
            statusDiv.className = 'outside';
            statusDiv.style.display = 'block';
            statusDiv.innerHTML = '❌ Address not found. Check spelling or street number.';
            addHistoryEntry(address, 'not-found', 'Not Found');
        }
    });
}
