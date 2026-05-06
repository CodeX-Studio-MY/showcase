const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];

// Synthetic events: [day, hourStart, durationMins, zone, ai, type]
const EVENTS = [
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

function buildCalendar() {
    const cal = document.getElementById('calendar');
    let html = '<div class="cal-head"></div>';
    DAYS.forEach(d => html += `<div class="cal-head">${d}</div>`);

    HOURS.forEach((h, hourIdx) => {
        html += `<div class="cal-time">${h}:00</div>`;
        DAYS.forEach((_, dayIdx) => {
            // Find events that start in this hour cell
            const cellEvents = EVENTS.filter(e => e[0] === dayIdx && Math.floor(e[1]) === h);
            let cellHtml = '';
            cellEvents.forEach(e => {
                const [_, start, dur, zone, ai, type] = e;
                const offsetMin = (start - h) * 60;
                const top = (offsetMin / 60) * 36;
                const height = Math.max(20, (dur / 60) * 36);
                const vol = Math.round(dur * 4.5);
                cellHtml += `<div class="event-block event-${zone}" style="top:${top}px; height:${height}px"
                      onclick="showToast('${zone === 'high' ? 'High' : 'Low'} Zone · ${type} · ${dur}min · ${vol}L')"
                      title="${type} · ${dur} min · ~${vol} L">
                      ${dur}m${ai ? ' <span class="ai-badge">✨</span>' : ''}
                    </div>`;
            });
            html += `<div class="cal-cell">${cellHtml}</div>`;
        });
    });
    cal.innerHTML = html;
}

function buildEventTable() {
    const today = new Date();
    const rows = EVENTS.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]).map(e => {
        const [day, start, dur, zone, ai, type] = e;
        const date = new Date(today); date.setDate(today.getDate() + day);
        const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
        const hh = Math.floor(start), mm = Math.round((start - hh) * 60);
        const time = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
        const vol = Math.round(dur * 4.5);
        const zoneName = zone === 'high' ? 'High Zone' : 'Low Zone';
        const zoneColor = zone === 'high' ? 'text-green-700' : 'text-teal-700';
        return `
      <tr class="hover:bg-slate-50">
        <td class="px-4 py-3 font-medium ${zoneColor}">${zoneName}</td>
        <td class="px-4 py-3">${dateStr}</td>
        <td class="px-4 py-3">${time}</td>
        <td class="px-4 py-3">${dur} min</td>
        <td class="px-4 py-3">${vol} L</td>
        <td class="px-4 py-3">${type}</td>
        <td class="px-4 py-3">${ai ? '<span class="text-amber-600 font-semibold">✨ AI</span>' : '<span class="text-slate-500">Manual</span>'}</td>
        <td class="px-4 py-3"><div class="flex gap-1 text-xs">
          <button onclick="showToast('Edit event')" class="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50">Edit</button>
          <button onclick="showToast('Event cancelled','warn')" class="px-2 py-1 border border-slate-200 rounded hover:bg-slate-50 text-red-600">Cancel</button>
        </div></td>
      </tr>`;
    }).join('');
    document.getElementById('eventTable').innerHTML = rows;
}

function openModal() { document.getElementById('modal').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal').classList.add('hidden'); }
window.openModal = openModal; window.closeModal = closeModal;

buildCalendar();
buildEventTable();
