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
        container.innerHTML = '<div style="font-size:12px; color:#718096; padding:10px; text-align:center;">No recent EMS dispatch calls retrieved.</div>';
        return;
    }

    container.innerHTML = recentTen.map(call => {
        const rawAddress = call.address || call.location || call.incident_address || call.street_address || 'Unknown Address';
        const city = call.city ? `, ${call.city}` : '';
        const fullAddress = `${rawAddress}${city}`;
        
        const callType = call.type || call.incident_type_code || call.description || call.nature || 'EMS Call';
        
        // Extract Sector / Zone / Box designation (e.g., SE45, SE30, Sector 45)
        let rawSector = call.sector || call.zone || call.box_area || call.district || call.sub_station || '';
        
        // Regex fallback: Search address or call string if sector isn't in its own field
        if (!rawSector) {
            const sectorMatch = (fullAddress + ' ' + callType).match(/\b(SE\d{2,3}|SECTOR\s*\d{2,3}|BOX\s*\d{2,4})\b/i);
            if (sectorMatch) rawSector = sectorMatch[0];
        }

        // Format sector badge string (e.g., "45" -> "SE45")
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

        const escapedAddr = fullAddress.replace(/'/g, "\\'");

        return `
            <div class="er-card" style="margin-bottom: 6px; padding: 10px; background-color: #f8fafc; border-left: 4px solid #3182ce;">
                <div class="er-header-row">
                    <div class="er-title-area">
                        <strong style="color: #003366; font-size: 14px;">${callType}</strong>${sectorBadge}
                        <span style="display: block; font-size: 13px; color: #2d3748; margin-top: 3px;">${fullAddress}</span>
                        <span class="station-subtitle" style="display: block; font-size: 11px; color: #718096; margin-top: 2px;">
                            ${units ? 'Unit: ' + units + ' | ' : ''}${timeStr}
                        </span>
                    </div>
                    <button class="action-btn" style="padding: 6px 12px; font-size: 12px; flex-shrink: 0;" onclick="selectDispatchAddress('${escapedAddr}')">
                        Verify
                    </button>
                </div>
            </div>
        `;
    }).join('');
}
