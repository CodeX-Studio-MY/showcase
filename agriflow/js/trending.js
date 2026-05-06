let mainChart, miniTemp, miniMoist, miniEc, miniTension;
let currentRange = 24;
let currentZone = 'both';
const enabled = { temp: true, moisture: true, ec: true, ph: false, tension: false };

const COLORS = {
    high: { temp: '#dc2626', moisture: '#16a34a', ec: '#9333ea', ph: '#db2777', tension: '#ea580c' },
    low: { temp: '#f97316', moisture: '#0f766e', ec: '#7c3aed', ph: '#e11d48', tension: '#b45309' }
};
const UNITS = { temp: '°C', moisture: '%', ec: 'mS/cm', ph: '', tension: 'kPa' };
const LABELS = { temp: 'Temp', moisture: 'Moisture', ec: 'EC', ph: 'pH', tension: 'Tension' };

function expandHistory(range, base) {
    // For 7d/30d ranges, synthesize by tiling+detrending
    if (range === 24) return base;
    const days = range;
    const out = [];
    const interval = days * 24 * 60 * 60 * 1000 / base.length;
    const now = Date.now();
    for (let i = 0; i < base.length; i++) {
        const ts = now - (base.length - i) * interval;
        const seasonal = Math.sin(i / base.length * Math.PI * 4) * 1.5;
        out.push({
            ts,
            high: {
                temp: base[i].high.temp + seasonal,
                moisture: Math.max(35, Math.min(80, base[i].high.moisture + seasonal * 0.5)),
                ec: base[i].high.ec + seasonal * 0.05,
                ph: base[i].high.ph + seasonal * 0.02,
                tension: Math.max(10, base[i].high.tension + seasonal * 1.5)
            },
            low: {
                temp: base[i].low.temp + seasonal,
                moisture: Math.max(35, Math.min(80, base[i].low.moisture + seasonal * 0.4)),
                ec: base[i].low.ec + seasonal * 0.05,
                ph: base[i].low.ph + seasonal * 0.02,
                tension: Math.max(10, base[i].low.tension + seasonal * 1.3)
            }
        });
    }
    return out;
}

function buildDatasets(history) {
    const ds = [];
    const zones = currentZone === 'both' ? ['high', 'low'] : [currentZone];
    ['temp', 'moisture', 'ec', 'ph', 'tension'].forEach(metric => {
        if (!enabled[metric]) return;
        zones.forEach(z => {
            ds.push({
                label: `${z === 'high' ? 'High' : 'Low'} · ${LABELS[metric]}${UNITS[metric] ? ' (' + UNITS[metric] + ')' : ''}`,
                data: history.map(p => ({ x: p.ts, y: p[z][metric] })),
                borderColor: COLORS[z][metric],
                backgroundColor: COLORS[z][metric] + '20',
                tension: 0.3,
                borderWidth: 2,
                pointRadius: 0,
                yAxisID: ['ec', 'ph'].includes(metric) ? 'y2' : 'y1'
            });
        });
    });
    return ds;
}

function fmtTime(ts, range) {
    const d = new Date(ts);
    if (range === 24) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderMain() {
    const snap = AgriflowData.snapshot();
    const hist = expandHistory(currentRange, snap.history);
    const datasets = buildDatasets(hist);

    if (!mainChart) {
        const ctx = document.getElementById('mainChart').getContext('2d');
        mainChart = new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true, maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
                    tooltip: { callbacks: { title: (items) => fmtTime(items[0].parsed.x, currentRange) } }
                },
                scales: {
                    x: { type: 'linear', ticks: { callback: (v) => fmtTime(v, currentRange), maxTicksLimit: 8, font: { size: 10 } }, grid: { color: '#f1f5f9' } },
                    y1: { position: 'left', grid: { color: '#f1f5f9' }, title: { display: true, text: 'Temp °C / Moisture % / Tension kPa', font: { size: 10 } } },
                    y2: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: 'EC (mS/cm) / pH', font: { size: 10 } } }
                }
            }
        });
    } else {
        mainChart.data.datasets = datasets;
        mainChart.update('none');
    }

    renderMiniCharts(hist);
}

function statsOf(arr) {
    const min = Math.min(...arr).toFixed(1);
    const max = Math.max(...arr).toFixed(1);
    const avg = (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1);
    return { min, max, avg };
}

function makeMini(canvasId, hist, metric) {
    const datasets = ['high', 'low'].map(z => ({
        label: z === 'high' ? 'High' : 'Low',
        data: hist.map(p => ({ x: p.ts, y: p[z][metric] })),
        borderColor: COLORS[z][metric],
        backgroundColor: COLORS[z][metric] + '15',
        fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: 0
    }));
    const ctx = document.getElementById(canvasId).getContext('2d');
    return new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
            scales: {
                x: { type: 'linear', display: false },
                y: { grid: { color: '#f1f5f9' }, ticks: { font: { size: 10 } } }
            }
        }
    });
}

function renderMiniCharts(hist) {
    if (miniTemp) { miniTemp.destroy(); miniMoist.destroy(); miniEc.destroy(); miniTension.destroy(); }
    miniTemp = makeMini('miniTemp', hist, 'temp');
    miniMoist = makeMini('miniMoist', hist, 'moisture');
    miniEc = makeMini('miniEc', hist, 'ec');
    miniTension = makeMini('miniTension', hist, 'tension');

    const allTemps = hist.flatMap(p => [p.high.temp, p.low.temp]);
    const allMoist = hist.flatMap(p => [p.high.moisture, p.low.moisture]);
    const allEc = hist.flatMap(p => [p.high.ec, p.low.ec]);
    const allTen = hist.flatMap(p => [p.high.tension, p.low.tension]);

    const t = statsOf(allTemps), m = statsOf(allMoist), e = statsOf(allEc), n = statsOf(allTen);
    document.getElementById('tempMin').textContent = t.min + '°C'; document.getElementById('tempAvg').textContent = t.avg + '°C'; document.getElementById('tempMax').textContent = t.max + '°C';
    document.getElementById('moistMin').textContent = m.min + '%'; document.getElementById('moistAvg').textContent = m.avg + '%'; document.getElementById('moistMax').textContent = m.max + '%';
    document.getElementById('ecMin').textContent = e.min; document.getElementById('ecAvg').textContent = e.avg; document.getElementById('ecMax').textContent = e.max;
    document.getElementById('tenMin').textContent = n.min + 'kPa'; document.getElementById('tenAvg').textContent = n.avg + 'kPa'; document.getElementById('tenMax').textContent = n.max + 'kPa';
}

// Wire filters
document.getElementById('zoneFilter').addEventListener('change', (e) => { currentZone = e.target.value; renderMain(); });
document.querySelectorAll('[data-metric]').forEach(cb => {
    cb.addEventListener('change', () => { enabled[cb.dataset.metric] = cb.checked; renderMain(); });
});
document.querySelectorAll('.rangeBtn').forEach(btn => {
    btn.addEventListener('click', () => {
        currentRange = parseInt(btn.dataset.range);
        document.querySelectorAll('.rangeBtn').forEach(b => {
            b.classList.remove('bg-green-600', 'text-white');
            b.classList.add('border', 'border-slate-300');
        });
        btn.classList.remove('border', 'border-slate-300');
        btn.classList.add('bg-green-600', 'text-white');
        renderMain();
    });
});

// Initial render + reactive updates (only on snapshot intervals to avoid jitter)
renderMain();
let lastUpdate = 0;
AgriflowData.subscribe(() => {
    if (Date.now() - lastUpdate > 8000) { lastUpdate = Date.now(); renderMain(); }
});
