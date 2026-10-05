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
                        <button class="nav-link-btn" onclick="openNav(${hosp.lat},${hosp.lng})">MAP Nav</button>
                    </div>
                </div>
                <div id="
