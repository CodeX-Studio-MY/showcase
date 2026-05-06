/* Schedule view: 15-minute rows, planned vs actual overlay */

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOUR_START = 5;   // 5:00 AM
const HOUR_END = 20;  // 8:00 PM
const ROW_MINUTES = 15;
const ROW_HEIGHT_PX = 24; // each 15-min row is 24px tall
const TOTAL_ROWS = ((HOUR_END - HOUR_START) * 60) / ROW_MINUTES;

// Build the week starting Monday
function getWeekStart() {
    const today = new Date();
    const dow = (today.getDay() + 6) % 7; // 0 = Mon
    const start = new Date(today);
    start.setHours(0, 0, 0, 0);
    start.setDate(today.getDate() - dow);
    return start;
}
const WEEK_START = getWeekStart();
const TODAY_DOW = (new Date().getDay() + 6) % 7;
const NOW = new Date();

// ---------- Synthetic data ----------
// Each event has: dayIdx, plannedStart (decimal hours), plannedDuration (mins),
//                 actualStart (decimal hours, or null if upcoming),
//                 actualDuration (mins, or null), zone, ai, type
// "actualStart === null" means the event is in the future (only planned shown)
function buildEvents() {
    // Base AI plan
    const plan = [
        [0, 6.5, 45, 'high', true, 'Irrigation'],
        [0, 17, 30, 'low', true, 'Irrigation'],
        [1, 7, 40, 'high', true, 'Irrigation'],
        [1, 17.5, 25, 'low', false, 'Irrigation'],
        [2, 6.5, 50, 'low', true, 'Fertigation'],
        [2, 16, 35, 'high', true, 'Irrigation'],
        [3, 7, 45, 'high', true, 'Irrigation'],
        [3, 17, 30, 'low', true, 'Irrigation'],
        [4, 6.5, 40, 'high', false, 'Irrigation'],
        [4, 18, 30, 'low', true, 'Irrigation'],
        [5, 8, 60, 'high', true, 'Fertigation'],
        [5, 17, 30, 'low', true, 'Irrigation'],
        [6, 7, 35, 'high', true, 'Irrigation'],
        [6, 17.5, 25, 'low', true, 'Irrigation']
    ];

    // For each planned event, decide if there's an actual record yet.
    // Past events → always have actual (with small drift). Today's past events too.
    // Future events → no actual.
    return plan.map(([day, start, dur, zone, ai, type], i) => {
        const eventDate = new Date(WEEK_START);
        eventDate.setDate(WEEK_START.getDate() + day);
        const eventStartMs = eventDate.getTime() + start * 3600 * 1000;
        const eventEndMs = eventStartMs + dur * 60 * 1000;
        const isPast = eventEndMs < NOW.getTime();
        const isOngoing = eventStartMs <= NOW.getTime() && eventEndMs > NOW.getTime();

        let actualStart = null, actualDuration = null, actualType = type, deviated = false;

        if (isPast || isOngoing) {
            // Seeded pseudo-random drift
            const driftMin = ((i * 13 + day * 7) % 18) - 9; // -9..+8 minutes
            const durDrift = ((i * 7 + day * 3) % 16) - 8;  // -8..+7 minutes
            actualStart = start + driftMin / 60;
            actualDuration = Math.max(10, dur + durDrift);
            // Mark deviation if drift > 10 minutes
            deviated = Math.abs(driftMin) > 10 || Math.abs(durDrift) > 10;

            // Occasionally mark one as "missed" (no actual)
            if (i === 8) { // Friday morning skipped due to rain
                actualStart = null;
                actualDuration = null;
            }

            // For ongoing event, cap actual duration to elapsed
            if (isOngoing) {
                const elapsedMin = (NOW.getTime() - eventStartMs) / 60000;
                actualDuration = Math.max(5, elapsedMin);
                deviated = false;
            }
        }

        return {
            id: i,
            day, plannedStart: start, plannedDuration: dur,
            actualStart, actualDuration,
            zone, ai, type: actualType,
            deviated,
            missed: (isPast && actualStart === null),
            ongoing: isOngoing,
            future: !isPast && !isOngoing
        };
    });
}

const EVENTS = buildEvents();

// ---------- Render header (day labels with date) ----------
function buildCalendarHeader() {
    const head = document.getElementById('calHead');
    let html = `<div class="cal-head">Time</div>`;
    for (let d = 0; d < 7; d++) {
        const date = new Date(WEEK_START);
        date.setDate(WEEK_START.getDate() + d);
        const isToday = d === TODAY_DOW;
        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        html += `<div class="cal-head ${isToday ? 'today' : ''}">${DAY_NAMES[d]}<span class="cal-head-date">${dateStr}</span></div>`;
    }
    head.innerHTML = html;
}

// ---------- Render calendar body ----------
function buildCalendar() {
    const cal = document.getElementById('calendar');
    // Build time column
    let timeColHtml = '';
    for (let r = 0; r < TOTAL_ROWS; r++) {
        const totalMin = HOUR_START * 60 + r * ROW_MINUTES;
        const hr = Math.floor(totalMin / 60);
        const mn = totalMin % 60;
        const isHourMark = mn === 0;
        const label = isHourMark
            ? `${String(hr).padStart(2, '0')}:00`
            : (mn === 30 ? `:30` : '');
        timeColHtml += `<div class="cal-time ${isHourMark ? 'hour-mark' : ''}">${label}</div>`;
    }

    // Build day columns
    const dayColsHtml = [];
    for (let d = 0; d < 7; d++) {
        const dayHeight = TOTAL_ROWS * ROW_HEIGHT_PX;
        let colHtml = `<div class="cal-day" style="height:${dayHeight}px">`;

        // Add hour separator lines
        for (let r = 0; r <= TOTAL_ROWS; r++) {
            const totalMin = HOUR_START * 60 + r * ROW_MINUTES;
            const isHour = totalMin % 60 === 0;
            colHtml += `<div class="row-line ${isHour ? 'hour' : ''}" style="top:${r * ROW_HEIGHT_PX}px"></div>`;
        }

        // "Now" indicator on today
        if (d === TODAY_DOW) {
            const nowH = NOW.getHours() + NOW.getMinutes() / 60;
            if (nowH >= HOUR_START && nowH <= HOUR_END) {
                const nowTop = (nowH - HOUR_START) * 60 / ROW_MINUTES * ROW_HEIGHT_PX;
                colHtml += `<div style="position:absolute;left:0;right:0;top:${nowTop}px;height:2px;background:#ef4444;z-index:6;box-shadow:0 0 6px rgba(239,68,68,0.5)">
          <div style="position:absolute;left:-4px;top:-4px;width:10px;height:10px;border-radius:50%;background:#ef4444"></div>
          <div style="position:absolute;right:4px;top:-14px;font-size:10px;color:#dc2626;font-weight:700;background:#fff;padding:1px 4px;border-radius:3px">NOW</div>
        </div>`;
            }
        }

        // Add event blocks for this day
        EVENTS.filter(e => e.day === d).forEach(ev => {
            // Planned block (always rendered)
            const planTop = (ev.plannedStart - HOUR_START) * 60 / ROW_MINUTES * ROW_HEIGHT_PX;
            const planHeight = ev.plannedDuration / ROW_MINUTES * ROW_HEIGHT_PX;
            const isFuture = ev.future;
            const vol = Math.round(ev.plannedDuration * 4.5);

            const tipPlanned = `${ev.zone === 'high' ? 'High' : 'Low'} Zone · ${ev.type} · Planned ${formatHr(ev.plannedStart)} for ${ev.plannedDuration} min (${vol} L)`;
            colHtml += `<div class="event-block planned ${ev.zone} ${isFuture ? 'future' : ''}"
                       style="top:${planTop}px; height:${planHeight}px"
                       title="${tipPlanned}"
                       onclick="showEventDetail(${ev.id}, 'planned')">
        ${ev.plannedDuration}m ${ev.ai ? '<span class="ai-badge">✨</span>' : ''}
        <div style="font-weight:500;font-size:9px;opacity:0.85">${formatHr(ev.plannedStart)}</div>
      </div>`;

            // Actual block (if exists)
            if (ev.actualStart !== null) {
                const actTop = (ev.actualStart - HOUR_START) * 60 / ROW_MINUTES * ROW_HEIGHT_PX;
                const actHeight = ev.actualDuration / ROW_MINUTES * ROW_HEIGHT_PX;
                const actVol = Math.round(ev.actualDuration * 4.5);
                const tipActual = `${ev.zone === 'high' ? 'High' : 'Low'} Zone · ${ev.type} · Actual ${formatHr(ev.actualStart)} for ${ev.actualDuration.toFixed(0)} min (${actVol} L)${ev.deviated ? ' — DEVIATED' : ''}`;
                colHtml += `<div class="event-block actual ${ev.zone} ${ev.deviated ? 'deviated' : ''}"
                         style="top:${actTop}px; height:${actHeight}px"
                         title="${tipActual}"
                         onclick="showEventDetail(${ev.id}, 'actual')">
          ${Math.round(ev.actualDuration)}m
          <div style="font-weight:500;font-size:9px;opacity:0.85">${formatHr(ev.actualStart)}</div>
        </div>`;
            } else if (ev.missed) {
                // Missed indicator inside the planned block area
                colHtml += `<div class="event-block actual ${ev.zone}"
                         style="top:${planTop}px; height:${planHeight}px; background:#fee2e2; color:#991b1b; border-left-color:#dc2626; opacity:0.85"
                         title="${ev.zone === 'high' ? 'High' : 'Low'} Zone · MISSED — skipped due to rain forecast"
                         onclick="showEventDetail(${ev.id}, 'missed')">
          ⊘ MISSED
        </div>`;
            }
        });

        colHtml += '</div>';
        dayColsHtml.push(colHtml);
    }

    cal.innerHTML = `<div>${timeColHtml}</div>${dayColsHtml.join('')}`;
}

function formatHr(decimalHr) {
    const h = Math.floor(decimalHr);
    const m = Math.round((decimalHr - h) * 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ---------- Event detail toast ----------
function showEventDetail(id, kind) {
    const ev = EVENTS.find(e => e.id === id);
    if (!ev) return;
    const zone = ev.zone === 'high' ? 'High Zone (Musang King)' : 'Low Zone (Black Thorn)';
    if (kind === 'planned') {
        showToast(`📋 Planned · ${zone} · ${formatHr(ev.plannedStart)} for ${ev.plannedDuration} min · ${ev.type}`);
    } else if (kind === 'actual') {
        const drift = ((ev.actualStart - ev.plannedStart) * 60).toFixed(0);
        const durDrift = (ev.actualDuration - ev.plannedDuration).toFixed(0);
        const driftMsg = ev.deviated
            ? ` · Drift: ${drift > 0 ? '+' : ''}${drift}min start, ${durDrift > 0 ? '+' : ''}${durDrift}min duration`
            : ' · On schedule';
        showToast(`✅ Actual · ${zone} · ${formatHr(ev.actualStart)} for ${Math.round(ev.actualDuration)} min${driftMsg}`,
            ev.deviated ? 'warn' : 'success');
    } else if (kind === 'missed') {
        showToast(`⊘ Missed · ${zone} · Skipped — rain detected by AI`, 'warn');
    }
}
window.showEventDetail = showEventDetail;

// ---------- Schedule list table ----------
let currentFilter = 'all';

function buildEventTable() {
    const today = new Date();
    let rows = EVENTS.slice().sort((a, b) => a.day - b.day || a.plannedStart - b.plannedStart);

    if (currentFilter === 'planned') {
        rows = rows.filter(e => e.future || e.actualStart === null);
    } else if (currentFilter === 'actual') {
        rows = rows.filter(e => e.actualStart !== null);
    } else if (currentFilter === 'deviated') {
        rows = rows.filter(e => e.deviated || e.missed);
    }

    const html = rows.map(ev => {
        const date = new Date(WEEK_START); date.setDate(WEEK_START.getDate() + ev.day);
        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });
        const vol = Math.round(ev.plannedDuration * 4.5);
        const zoneName = ev.zone === 'high' ? 'High Zone' : 'Low Zone';
        const zoneColor = ev.zone === 'high' ? 'text-green-700' : 'text-teal-700';

        let statusBadge;
        if (ev.future) {
            statusBadge = '<span class="text-xs font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full">⏱ Scheduled</span>';
        } else if (ev.ongoing) {
            statusBadge = '<span class="text-xs font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full"><span class="pulse-dot"></span> Running</span>';
        } else if (ev.missed) {
            statusBadge = '<span class="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">⊘ Missed</span>';
        } else if (ev.deviated) {
            statusBadge = '<span class="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">⚠ Deviated</span>';
        } else {
            statusBadge = '<span class="text-xs font-semibold text-green-700 bg-green-100 px-2 py-0.5 rounded-full">✓ On Plan</span>';
        }

        const actualTimeCell = ev.actualStart !== null
            ? formatHr(ev.actualStart) + (ev.deviated ? ` <span class="text-amber-600">(${((ev.actualStart - ev.plannedStart) * 60).toFixed(0)}m drift)</span>` : '')
            : (ev.future ? '<span class="text-slate-400">—</span>' : '<span class="text-red-500">missed</span>');

        return `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-3 font-medium ${zoneColor}">${zoneName}</td>
        <td class="px-4 py-3">${dateStr}</td>
        <td class="px-4 py-3 font-mono">${formatHr(ev.plannedStart)}</td>
        <td class="px-4 py-3 font-mono">${actualTimeCell}</td>
        <td class="px-4 py-3">${ev.plannedDuration} min${ev.actualStart !== null ? ` <span class="text-slate-400 text-xs">/ ${Math.round(ev.actualDuration)}m actual</span>` : ''}</td>
        <td class="px-4 py-3">${vol} L</td>
        <td class="px-4 py-3">${ev.type}</td>
        <td class="px-4 py-3">${ev.ai ? '<span class="text-amber-600 font-semibold">✨ AI</span>' : '<span class="text-slate-500">Manual</span>'}</td>
        <td class="px-4 py-3">${statusBadge}</td>
        <td class="px-4 py-3"><div class="flex gap-1 text-xs">
          <button onclick="showToast('Edit event')" class="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50">Edit</button>
          <button onclick="showToast('Event cancelled','warn')" class="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50 text-red-600">Cancel</button>
        </div></td>
      </tr>`;
    }).join('');
    document.getElementById('eventTable').innerHTML = html || '<tr><td colspan="10" class="text-center text-slate-400 py-8 text-sm italic">No events match this filter</td></tr>';
}

function setFilter(f) {
    currentFilter = f;
    ['filterAll', 'filterPlanned', 'filterActual', 'filterDeviated'].forEach(id => {
        const el = document.getElementById(id);
        const isActive = id === ('filter' + f.charAt(0).toUpperCase() + f.slice(1));
        el.className = 'px-3 py-1 rounded-full font-semibold ' +
            (isActive ? 'bg-green-600 text-white' : 'bg-white border border-slate-300 text-slate-600');
    });
    buildEventTable();
}
['all', 'planned', 'actual', 'deviated'].forEach(f => {
    document.getElementById('filter' + f.charAt(0).toUpperCase() + f.slice(1))
        .addEventListener('click', () => setFilter(f));
});

// ---------- Adherence calculation ----------
function calculateAdherence() {
    const completed = EVENTS.filter(e => e.actualStart !== null);
    if (!completed.length) return 100;
    const onPlan = completed.filter(e => !e.deviated).length;
    const total = completed.length + EVENTS.filter(e => e.missed).length;
    return Math.round((onPlan / total) * 100);
}
document.getElementById('adherenceVal').textContent = calculateAdherence() + '%';

// ---------- Modal ----------
function openModal() { document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); }
window.openModal = openModal; window.closeModal = closeModal;

// ---------- Initial render ----------
buildCalendarHeader();
buildCalendar();
buildEventTable();
