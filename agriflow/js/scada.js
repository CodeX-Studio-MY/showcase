/* Agriflow SCADA — Canvas2D rendering, faithful to the real plant components.
   All shapes are drawn in code (no images required). */

const canvas = document.getElementById('scadaCanvas');
const ctx = canvas.getContext('2d');
const popover = document.getElementById('scadaPopover');

// Logical scene size — we render at this size and let CSS scale the canvas.
const W = 1280, H = 620;
let DPR = Math.min(window.devicePixelRatio || 1, 2);

function resizeCanvas() {
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * DPR;
    canvas.height = rect.height * DPR;
}
new ResizeObserver(resizeCanvas).observe(canvas.parentElement);
resizeCanvas();

// ---------- State ----------
let snap = AgriflowData.snapshot();
let anim = 0;
const hotspots = []; // {x,y,w,h, kind, label}

AgriflowData.subscribe(s => { snap = s; syncControls(); syncStrip(); });

function syncControls() {
    document.getElementById('pumpToggle').checked = snap.scada.pumpOn;
    document.getElementById('pumpLabel').textContent = snap.scada.pumpOn ? 'ON' : 'OFF';
    document.getElementById('pumpLabel').className = 'text-2xl font-bold ' + (snap.scada.pumpOn ? 'text-green-600' : 'text-slate-400');
    document.getElementById('irrigToggle').checked = snap.scada.irrigationLine ?? false;
    document.getElementById('fertToggle').checked = snap.scada.fertigationMode;
    document.getElementById('valveHighToggle').checked = snap.scada.valves.high;
    document.getElementById('valveLowToggle').checked = snap.scada.valves.low;
    document.getElementById('valveHighLabel').textContent = snap.scada.valves.high ? 'Open' : 'Closed';
    document.getElementById('valveLowLabel').textContent = snap.scada.valves.low ? 'Open' : 'Closed';
    document.getElementById('irrigStatusTxt').textContent = (snap.scada.irrigationLine ?? false) ? 'Open' : 'Closed';
    document.getElementById('fertStatusTxt').textContent = snap.scada.fertigationMode ? 'Open' : 'Closed';

    const t = Math.round(snap.scada.tankLevel);
    document.getElementById('tankLevelTxt').textContent = t;
    document.getElementById('tankBar').style.width = t + '%';

    document.getElementById('pressureVal').textContent = snap.scada.pressure.toFixed(1);
    document.getElementById('pressureFill').setAttribute('stroke-dashoffset', 125.6 * (1 - snap.scada.pressure / 5));
    document.getElementById('flowVal').textContent = Math.round(snap.scada.flowRate);
    document.getElementById('flowFill').setAttribute('stroke-dashoffset', 125.6 * (1 - snap.scada.flowRate / 40));
}

function syncStrip() {
    const map = [
        ['stripPump', snap.scada.pumpOn, 'stripPumpTxt'],
        ['stripIrrig', !!snap.scada.irrigationLine, 'stripIrrigTxt'],
        ['stripFert', snap.scada.fertigationMode, 'stripFertTxt'],
        ['stripDosatron', snap.scada.fertigationMode && snap.scada.pumpOn, 'stripDosatronTxt']
    ];
    map.forEach(([id, on, txtId]) => {
        const el = document.getElementById(id);
        el.classList.toggle('on', on);
        el.classList.toggle('off', !on);
        document.getElementById(txtId).textContent = on ? 'ON' : 'OFF';
    });
    document.getElementById('stripClock').textContent = new Date().toLocaleTimeString();
}

// Add irrigationLine to data-simulator state via API
if (snap.scada.irrigationLine === undefined) {
    // Default: derived from any zone valve being open
    AgriflowData.setIrrigationLine = function (on) {
        snap.scada.irrigationLine = !!on;
        localStorage.setItem('agriflow_scada_state', JSON.stringify(snap.scada));
    };
}

// ---------- Drawing helpers ----------
function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

function labelBox(x, y, w, h, text, opts = {}) {
    ctx.save();
    ctx.fillStyle = opts.bg || 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = opts.border || '#cbd5e1';
    ctx.lineWidth = 1;
    roundRect(x, y, w, h, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = opts.color || '#1e293b';
    ctx.font = 'bold ' + (opts.size || 12) + 'px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.restore();
}

function statusBox(x, y, w, h, text, on) {
    ctx.save();
    ctx.fillStyle = on ? 'rgba(16,185,129,0.18)' : 'rgba(239,68,68,0.15)';
    ctx.strokeStyle = on ? '#10b981' : '#ef4444';
    ctx.lineWidth = 1;
    roundRect(x, y, w, h, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = on ? '#15803d' : '#b91c1c';
    ctx.font = 'bold 10px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x + w / 2, y + h / 2);
    ctx.restore();
}

// ---------- Pipeline (with shadow + animated flow dashes) ----------
function drawPipeline(points, active, strokeWidth = 12) {
    // Outer (dark) pipe
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = strokeWidth + 2;
    ctx.beginPath();
    ctx.moveTo(points[0] + 3, points[1] + 3);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i] + 3, points[i + 1] + 3);
    ctx.stroke();

    // Body
    ctx.strokeStyle = '#374151'; ctx.lineWidth = strokeWidth;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.stroke();

    // Inner highlight
    ctx.strokeStyle = '#9ca3af'; ctx.lineWidth = strokeWidth - 4;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.stroke();

    // Animated water flow
    if (active) {
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = Math.max(2, strokeWidth - 8);
        ctx.setLineDash([20, 10]);
        ctx.lineDashOffset = -anim * 2;
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(points[0], points[1]);
        for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
        ctx.stroke();
        ctx.setLineDash([]); ctx.globalAlpha = 1;
    }
    ctx.restore();
}

// ---------- Water Tank ----------
function drawWaterTank(x, y, level) {
    const w = 110, h = 160;
    ctx.save();
    // Title
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Water Storage Tank', x + w / 2, y - 12);

    // Tank body
    ctx.fillStyle = 'rgba(219,234,254,0.5)';
    ctx.strokeStyle = '#1e40af';
    ctx.lineWidth = 4;
    roundRect(x, y, w, h, 8);
    ctx.fill(); ctx.stroke();

    // Water fill
    const fillH = (level / 100) * (h - 4);
    ctx.save();
    roundRect(x + 2, y + 2, w - 4, h - 4, 6);
    ctx.clip();
    // Gradient water
    const grad = ctx.createLinearGradient(0, y + h - fillH, 0, y + h);
    grad.addColorStop(0, '#60a5fa');
    grad.addColorStop(1, '#1d4ed8');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + h - fillH, w, fillH);

    // Wavy surface
    ctx.fillStyle = 'rgba(147,197,253,0.7)';
    ctx.beginPath();
    const surfaceY = y + h - fillH;
    ctx.moveTo(x, surfaceY);
    for (let i = 0; i <= w; i += 6) {
        ctx.lineTo(x + i, surfaceY + Math.sin((i + anim * 4) * 0.2) * 2);
    }
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Level indicators (tick marks)
    ctx.strokeStyle = 'rgba(255,255,255,0.6)';
    ctx.lineWidth = 1.5;
    [25, 50, 75].forEach(p => {
        const ty = y + h - (p / 100) * h;
        ctx.beginPath(); ctx.moveTo(x + 6, ty); ctx.lineTo(x + 16, ty); ctx.stroke();
    });

    // Level reading
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1;
    roundRect(x + 25, y + 70, 60, 28, 5);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 14px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(level.toFixed(0) + '%', x + 55, y + 84);

    // Outlet
    ctx.fillStyle = '#374151';
    ctx.fillRect(x + w, y + h - 12, 12, 8);
    ctx.beginPath(); ctx.arc(x + w + 12, y + h - 8, 6, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    hotspots.push({ x, y, w: w + 24, h, kind: 'tank' });
}

// ---------- Centrifugal Pump ----------
function drawPump(cx, cy, active) {
    ctx.save();
    ctx.translate(cx, cy);

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
    roundRect(-75, -85, 150, 22, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1f2937';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CENTRIFUGAL PUMP', 0, -74);

    // Motor housing on top
    ctx.fillStyle = '#4b5563';
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2;
    roundRect(-15, -55, 30, 25, 4);
    ctx.fill(); ctx.stroke();
    // Cooling fins
    ctx.fillStyle = '#6b7280';
    for (let i = 0; i < 5; i++) {
        roundRect(-12 + i * 6, -52, 2, 18, 1);
        ctx.fill();
    }

    // Pump base shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath(); ctx.arc(5, 5, 45, 0, Math.PI * 2); ctx.fill();

    // Base platform
    ctx.fillStyle = '#4b5563';
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 45, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Main housing (green if active, red if off)
    ctx.fillStyle = active ? '#059669' : '#dc2626';
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Inner highlight
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath(); ctx.arc(0, 0, 35, 0, Math.PI * 2); ctx.fill();

    // Pump chamber ring
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, 28, 0, Math.PI * 2); ctx.stroke();

    // Rotating impeller
    ctx.save();
    if (active) ctx.rotate((anim * 12 * Math.PI) / 180);
    ctx.strokeStyle = '#fff'; ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(24, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, -24); ctx.lineTo(0, 24); ctx.stroke();
    ctx.lineWidth = 4; ctx.globalAlpha = 0.9;
    ctx.beginPath(); ctx.moveTo(-17, -17); ctx.lineTo(17, 17); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-17, 17); ctx.lineTo(17, -17); ctx.stroke();
    ctx.globalAlpha = 1;
    // Blade tips
    ctx.fillStyle = '#fff';
    [[24, 0], [-24, 0], [0, 24], [0, -24]].forEach(([px, py]) => {
        ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2); ctx.fill();
    });
    ctx.restore();

    // Center hub
    ctx.fillStyle = '#1f2937';
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

    // Inlet/outlet flanges
    ctx.fillStyle = '#6b7280';
    roundRect(-50, -8, 15, 16, 2); ctx.fill();
    roundRect(35, -8, 15, 16, 2); ctx.fill();
    ctx.fillStyle = '#374151';
    roundRect(-48, -6, 11, 12, 2); ctx.fill();
    roundRect(37, -6, 11, 12, 2); ctx.fill();

    // Pressure gauge (top-left)
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(-25, -25, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Needle
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const needleAngle = (active ? anim * 0.1 : 0) + Math.PI;
    ctx.beginPath();
    ctx.moveTo(-25, -25);
    ctx.lineTo(-25 + Math.cos(needleAngle) * 7, -25 + Math.sin(needleAngle) * 7);
    ctx.stroke();
    ctx.fillStyle = '#374151';
    ctx.beginPath(); ctx.arc(-25, -25, 2, 0, Math.PI * 2); ctx.fill();

    // Status indicator (top-right)
    ctx.fillStyle = active ? '#10b981' : '#ef4444';
    ctx.globalAlpha = active ? 0.8 + Math.sin(anim * 0.2) * 0.2 : 0.5;
    ctx.beginPath(); ctx.arc(25, -25, 7, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(25, -25, 3, 0, Math.PI * 2); ctx.fill();

    // Flow direction arrows when active
    if (active) {
        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        [[-55, -48], [48, 55]].forEach(([x1, x2]) => {
            ctx.beginPath(); ctx.moveTo(x1, 0); ctx.lineTo(x2, 0); ctx.stroke();
            const dir = x2 > x1 ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(x2 + 4 * dir, -3); ctx.lineTo(x2, 0); ctx.lineTo(x2 + 4 * dir, 3);
            ctx.stroke();
        });
    }

    // Status box below
    ctx.restore();
    statusBox(cx - 35, cy + 60, 70, 18, active ? 'RUNNING' : 'STOPPED', active);

    hotspots.push({ x: cx - 50, y: cy - 60, w: 100, h: 130, kind: 'pump', label: 'Centrifugal Pump' });
}

// ---------- Valve (SCADA-style with rotating handle) ----------
function drawValve(cx, cy, open, label, statusValue) {
    ctx.save();
    ctx.translate(cx, cy);

    // Label background
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
    roundRect(-60, -68, 120, 20, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, -58);

    // Valve body (two flanges + central housing)
    // Side flanges
    ctx.fillStyle = '#6b7280';
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1.5;
    roundRect(-30, -10, 10, 20, 2); ctx.fill(); ctx.stroke();
    roundRect(20, -10, 10, 20, 2); ctx.fill(); ctx.stroke();

    // Main body
    ctx.fillStyle = open ? '#0ea5e9' : '#94a3b8';
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 2;
    roundRect(-22, -14, 44, 28, 6); ctx.fill(); ctx.stroke();

    // Inner gradient highlight
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(-20, -12, 40, 8, 4); ctx.fill();

    // Stem (vertical)
    ctx.fillStyle = '#475569';
    ctx.fillRect(-2, -28, 4, 18);

    // Handle (rotates 90° based on open/closed)
    ctx.save();
    ctx.translate(0, -28);
    ctx.rotate(open ? 0 : Math.PI / 2);
    // Handle bar
    ctx.fillStyle = open ? '#16a34a' : '#dc2626';
    ctx.strokeStyle = '#1f2937'; ctx.lineWidth = 1.5;
    roundRect(-18, -3, 36, 6, 3); ctx.fill(); ctx.stroke();
    // End knobs
    ctx.beginPath(); ctx.arc(-18, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(18, 0, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();

    // Center hub
    ctx.fillStyle = '#1f2937';
    ctx.beginPath(); ctx.arc(0, -28, 3, 0, Math.PI * 2); ctx.fill();

    // Direction indicator inside body when open
    if (open) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-12, 0); ctx.lineTo(12, 0);
        ctx.moveTo(8, -3); ctx.lineTo(12, 0); ctx.lineTo(8, 3);
        ctx.stroke();
    } else {
        // X-mark when closed
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-7, -7); ctx.lineTo(7, 7);
        ctx.moveTo(-7, 7); ctx.lineTo(7, -7);
        ctx.stroke();
    }

    ctx.restore();

    // Status box below
    const txt = open ? 'OPEN' + (statusValue ? ' — ' + statusValue : '') : 'CLOSED' + (statusValue ? ' — ' + statusValue : '');
    statusBox(cx - 50, cy + 22, 100, 18, txt, open);

    hotspots.push({ x: cx - 35, y: cy - 35, w: 70, h: 75, kind: 'valve', label });
}

// ---------- Dosatron (with side injection chamber) ----------
function drawDosatron(cx, cy, active) {
    ctx.save();
    ctx.translate(cx, cy);

    // Label
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
    roundRect(-50, -68, 100, 20, 4);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Dosatron', 0, -58);

    const pulse = active ? 0.75 + Math.sin(anim * 0.15) * 0.2 : 0.7;
    ctx.globalAlpha = pulse;

    // The Dosatron in your React code is rotated 90° so liquid flows horizontally
    // through the main body. We replicate that orientation here.
    // Inlet flange (left)
    ctx.fillStyle = '#64748b';
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
    ctx.fillRect(-45, -8, 10, 16); ctx.strokeRect(-45, -8, 10, 16);

    // Main horizontal body
    ctx.fillStyle = active ? '#3b82f6' : '#94a3b8';
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2;
    roundRect(-35, -15, 70, 30, 5);
    ctx.fill(); ctx.stroke();

    // Top "head" (the dome cap of a Dosatron)
    ctx.fillStyle = active ? '#1d4ed8' : '#64748b';
    roundRect(-12, -28, 24, 16, 3); ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(0, -28, 12, 5, 0, 0, Math.PI * 2);
    ctx.fillStyle = active ? '#2563eb' : '#475569';
    ctx.fill(); ctx.stroke();

    // Outlet flange (right)
    ctx.fillStyle = '#64748b';
    ctx.fillRect(35, -8, 10, 16); ctx.strokeRect(35, -8, 10, 16);

    // Side injection chamber (the additive tank) — orange when active
    ctx.fillStyle = active ? '#fb923c' : '#d1d5db';
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.5;
    roundRect(-8, 18, 16, 26, 3); ctx.fill(); ctx.stroke();
    // Connecting tube to body
    ctx.fillStyle = '#64748b';
    ctx.fillRect(-3, 12, 6, 8); ctx.strokeRect(-3, 12, 6, 8);

    // Liquid level inside chamber (animates when active)
    if (active) {
        ctx.fillStyle = '#fdba74';
        const liqH = 16 + Math.sin(anim * 0.2) * 2;
        ctx.fillRect(-6, 44 - liqH, 12, liqH);
    }

    // Control dial on body
    ctx.fillStyle = '#f8fafc';
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(15, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // Dial indicator
    ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 2; ctx.lineCap = 'round';
    const dialAngle = active ? Math.PI * 1.75 + anim * 0.05 : Math.PI * 1.75;
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(15 + Math.cos(dialAngle) * 4, 0 + Math.sin(dialAngle) * 4);
    ctx.stroke();

    // Brand stripe
    ctx.fillStyle = active ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.3)';
    ctx.fillRect(-30, -3, 40, 2);

    ctx.globalAlpha = 1;

    // Injection-rate badge when active
    if (active) {
        ctx.fillStyle = 'rgba(16,185,129,0.2)';
        ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1;
        roundRect(-30, 50, 60, 14, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#15803d';
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('NPK 12-12-17 · 2.5%', 0, 57);
    }

    ctx.restore();

    hotspots.push({ x: cx - 50, y: cy - 30, w: 100, h: 90, kind: 'dosatron', label: 'Dosatron Injector' });
}

// ---------- Irrigation Zone (trees, sprinklers, water droplets) ----------
function drawIrrigationZone(x, y, zoneKey, active) {
    const w = 220, h = 160;
    const meta = snap.meta[zoneKey];
    const moisture = snap.live[zoneKey].moisture;

    ctx.save();
    // Sky background
    const sky = ctx.createLinearGradient(0, y, 0, y + h);
    sky.addColorStop(0, '#e0f2fe'); sky.addColorStop(1, '#bae6fd');
    ctx.fillStyle = sky;
    roundRect(x, y, w, h, 12); ctx.fill();

    // Boundary
    ctx.strokeStyle = active ? '#22c55e' : '#9ca3af';
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 5]);
    roundRect(x, y, w, h, 12); ctx.stroke();
    ctx.setLineDash([]);

    // Soil
    const soil = ctx.createLinearGradient(0, y + h - 36, 0, y + h - 4);
    soil.addColorStop(0, '#a78bfa'); soil.addColorStop(1, '#6d28d9');
    ctx.fillStyle = soil; ctx.globalAlpha = 0.7;
    roundRect(x + 4, y + h - 36, w - 8, 32, 6); ctx.fill();
    ctx.globalAlpha = 1;

    // Grass strip
    const grass = ctx.createLinearGradient(0, y + h - 44, 0, y + h - 30);
    grass.addColorStop(0, '#bbf7d0'); grass.addColorStop(1, '#22c55e');
    ctx.fillStyle = grass; ctx.globalAlpha = 0.85;
    roundRect(x + 4, y + h - 44, w - 8, 12, 5); ctx.fill();
    ctx.globalAlpha = 1;

    // Trees
    const treeXs = [x + 35, x + 75, x + 115, x + 155, x + 195];
    treeXs.forEach((tx, i) => {
        // Trunk
        ctx.fillStyle = '#92400e';
        roundRect(tx - 3, y + h - 65, 6, 22, 3); ctx.fill();
        // Crown
        ctx.fillStyle = '#16a34a'; ctx.globalAlpha = 0.85;
        ctx.beginPath(); ctx.arc(tx, y + h - 75, 14, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#22c55e'; ctx.globalAlpha = 0.95;
        ctx.beginPath(); ctx.arc(tx, y + h - 80, 10, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;

        // Water droplets when active
        if (active) {
            for (let d = 0; d < 3; d++) {
                const dropX = tx + Math.sin(anim * 0.2 + d + i) * 8;
                const dropY = y + h - 60 + Math.abs(Math.sin(anim * 0.15 + d + i)) * 12;
                ctx.fillStyle = '#3b82f6';
                ctx.globalAlpha = 0.7 + Math.sin(anim * 0.1 + d) * 0.2;
                ctx.beginPath(); ctx.arc(dropX, dropY, 2.5, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
        }
    });

    // Sprinklers (3 per zone)
    const sprinklerXs = [x + 55, x + 115, x + 175];
    sprinklerXs.forEach((sx, i) => {
        // Body
        ctx.fillStyle = '#475569'; ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(sx, y + 36, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillRect(sx - 1.5, y + 36, 3, 8);

        // Spray pattern when active
        if (active) {
            for (let s = 0; s < 8; s++) {
                const angle = (s * 45 + anim * 2) * Math.PI / 180;
                const len = 22 + Math.sin(anim * 0.5 + s) * 3;
                ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
                ctx.globalAlpha = 0.7 + Math.sin(anim * 0.1 + s) * 0.2;
                ctx.beginPath();
                ctx.moveTo(sx, y + 36);
                ctx.lineTo(sx + Math.cos(angle) * len, y + 36 + Math.sin(angle) * len * 0.5);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
        }
    });

    // Header info bar
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
    roundRect(x + 8, y + 8, w - 16, 24, 5); ctx.fill(); ctx.stroke();
    ctx.fillStyle = active ? '#15803d' : '#64748b';
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${meta.name} — ${active ? '💧 IRRIGATING' : '⏸ STANDBY'}`, x + 14, y + 20);

    // Moisture indicator
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`${Math.round(moisture)}%`, x + w - 14, y + 20);

    // Species + tree count footer
    ctx.fillStyle = 'rgba(15,23,42,0.75)';
    ctx.font = '10px Inter, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${meta.species} · ${meta.soilType} · ${meta.slope}° slope`, x + w / 2, y + h - 6);

    ctx.restore();

    hotspots.push({ x, y, w, h, kind: 'zone', label: meta.name, zoneKey });
}

// ---------- Junction node ----------
function drawJunction(x, y) {
    ctx.fillStyle = '#1f2937';
    ctx.strokeStyle = '#374151'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

// ---------- Main render ----------
function render() {
    // Reset hotspots
    hotspots.length = 0;

    // Scale to actual canvas pixel size
    const scaleX = canvas.width / W;
    const scaleY = canvas.height / H;
    const s = Math.min(scaleX, scaleY);
    ctx.save();
    ctx.setTransform(s, 0, 0, s, (canvas.width - W * s) / 2, (canvas.height - H * s) / 2);

    // Background grid (very subtle)
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    for (let gx = 0; gx < W; gx += 40) {
        ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = 0; gy < H; gy += 40) {
        ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // Compute flow states
    const pumpOn = snap.scada.pumpOn;
    const irrigOn = snap.scada.irrigationLine ?? false;
    const fertOn = snap.scada.fertigationMode;
    const lineActive = irrigOn || fertOn;
    const highValve = snap.scada.valves.high;
    const lowValve = snap.scada.valves.low;
    const dosatronActive = pumpOn && fertOn;

    // ----- Pipelines (drawn first, components on top) -----
    // Tank → Pump (always shown; flowing if pump on)
    drawPipeline([170, 240, 270, 240], pumpOn, 14);
    // Pump → Split node
    drawPipeline([370, 240, 480, 240], pumpOn, 14);
    // Split up → Irrigation valve
    drawPipeline([480, 240, 480, 140, 540, 140], pumpOn, 12);
    // Split down → Fertigation valve
    drawPipeline([480, 240, 480, 360, 540, 360], pumpOn, 12);
    // Irrigation valve → upper junction
    drawPipeline([600, 140, 760, 140, 760, 240], pumpOn && irrigOn, 12);
    // Fertigation valve → Dosatron inlet
    drawPipeline([600, 360, 640, 360], pumpOn && fertOn, 12);
    // Dosatron outlet → join junction
    drawPipeline([720, 360, 760, 360, 760, 240], dosatronActive, 12);
    // Join junction → distribution junction
    drawPipeline([760, 240, 870, 240], pumpOn && lineActive, 14);
    // Up to High Zone valve
    drawPipeline([870, 240, 870, 130, 970, 130], pumpOn && lineActive, 12);
    // Down to Low Zone valve
    drawPipeline([870, 240, 870, 460, 970, 460], pumpOn && lineActive, 12);
    // High valve → High zone
    drawPipeline([1030, 130, 1110, 130], pumpOn && lineActive && highValve, 10);
    // Low valve → Low zone
    drawPipeline([1030, 460, 1110, 460], pumpOn && lineActive && lowValve, 10);

    // Junctions
    drawJunction(480, 240);
    drawJunction(760, 240);
    drawJunction(870, 240);

    // ----- Components -----
    drawWaterTank(50, 80, snap.scada.tankLevel);
    drawPump(320, 240, pumpOn);
    drawValve(570, 140, irrigOn, 'Irrigation', null);
    drawValve(570, 360, fertOn, 'Fertigation', null);
    drawDosatron(670, 360, dosatronActive);
    drawValve(1000, 130, highValve, 'High Zone Valve', `${Math.round(snap.live.high.moisture)}%`);
    drawValve(1000, 460, lowValve, 'Low Zone Valve', `${Math.round(snap.live.low.moisture)}%`);
    drawIrrigationZone(1110, 50, 'high', pumpOn && lineActive && highValve);
    drawIrrigationZone(1110, 380, 'low', pumpOn && lineActive && lowValve);

    ctx.restore();

    // Update strip clock continuously
    document.getElementById('stripClock').textContent = new Date().toLocaleTimeString();

    anim = (anim + 1) % 10000;
    requestAnimationFrame(render);
}

requestAnimationFrame(render);

// ---------- Click handling on canvas ----------
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width * W;
    const cy = (e.clientY - rect.top) / rect.height * H;

    // Find topmost hotspot
    for (let i = hotspots.length - 1; i >= 0; i--) {
        const h = hotspots[i];
        if (cx >= h.x && cx <= h.x + h.w && cy >= h.y && cy <= h.y + h.h) {
            showPopover(e.clientX, e.clientY, h);
            return;
        }
    }
    hidePopover();
});

canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.clientX - rect.left) / rect.width * W;
    const cy = (e.clientY - rect.top) / rect.height * H;
    let hover = false;
    for (const h of hotspots) {
        if (cx >= h.x && cx <= h.x + h.w && cy >= h.y && cy <= h.y + h.h) { hover = true; break; }
    }
    canvas.style.cursor = hover ? 'pointer' : 'default';
});

// ---------- Popover ----------
function showPopover(clientX, clientY, hotspot) {
    let html = '';
    if (hotspot.kind === 'pump') {
        html = `
      <div class="font-bold text-slate-900 mb-2">Centrifugal Pump</div>
      <div class="text-xs text-slate-500 mb-3">5 HP · 4" outlet · 3-phase</div>
      <div class="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div class="bg-slate-50 p-2 rounded"><div class="text-slate-500">Pressure</div><div class="font-bold">${snap.scada.pressure.toFixed(1)} bar</div></div>
        <div class="bg-slate-50 p-2 rounded"><div class="text-slate-500">Flow</div><div class="font-bold">${Math.round(snap.scada.flowRate)} L/min</div></div>
      </div>
      <button onclick="AgriflowData.setPump(${!snap.scada.pumpOn}); hidePopover(); showToast('Pump ${!snap.scada.pumpOn ? 'started' : 'stopped'}')"
        class="w-full ${snap.scada.pumpOn ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} text-white font-semibold py-2 rounded">
        ${snap.scada.pumpOn ? 'Stop Pump' : 'Start Pump'}
      </button>`;
    } else if (hotspot.kind === 'valve') {
        let target, current;
        if (hotspot.label === 'Irrigation') { target = 'irrig'; current = snap.scada.irrigationLine; }
        else if (hotspot.label === 'Fertigation') { target = 'fert'; current = snap.scada.fertigationMode; }
        else if (hotspot.label.includes('High')) { target = 'high'; current = snap.scada.valves.high; }
        else { target = 'low'; current = snap.scada.valves.low; }

        html = `
      <div class="font-bold text-slate-900 mb-2">${hotspot.label}</div>
      <div class="text-xs text-slate-500 mb-3">Solenoid valve · DN50</div>
      <div class="flex items-center justify-between mb-3 text-xs">
        <span class="text-slate-500">Current state</span>
        <span class="px-2 py-0.5 rounded font-semibold ${current ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}">${current ? 'OPEN' : 'CLOSED'}</span>
      </div>
      <button onclick="overrideValve('${target}', ${!current})"
        class="w-full ${current ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'} text-white font-semibold py-2 rounded">
        Override → ${current ? 'CLOSE' : 'OPEN'}
      </button>`;
    } else if (hotspot.kind === 'dosatron') {
        html = `
      <div class="font-bold text-slate-900 mb-2">Dosatron Injector</div>
      <div class="text-xs text-slate-500 mb-3">Water-powered fertilizer injector · D25RE2</div>
      <div class="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div class="bg-slate-50 p-2 rounded"><div class="text-slate-500">Status</div><div class="font-bold ${dosatronActive ? 'text-green-600' : 'text-slate-400'}">${dosatronActive ? 'INJECTING' : 'IDLE'}</div></div>
        <div class="bg-slate-50 p-2 rounded"><div class="text-slate-500">Rate</div><div class="font-bold">2.5%</div></div>
      </div>
      <div class="text-xs text-slate-600 bg-amber-50 p-2 rounded">Active when fertigation line is open and pump is running.</div>`;
    } else if (hotspot.kind === 'zone') {
        const m = snap.meta[hotspot.zoneKey], v = snap.live[hotspot.zoneKey];
        html = `
      <div class="font-bold text-slate-900 mb-1">${m.name}</div>
      <div class="text-xs text-teal-700 mb-3">${m.species} · ${m.treeAge} yr · ${m.soilType}</div>
      <div class="grid grid-cols-2 gap-2 text-xs">
        <div class="bg-slate-50 p-2 rounded"><div class="text-slate-500">Moisture</div><div class="font-bold">${v.moisture.toFixed(0)}%</div></div>
        <div class="bg-slate-50 p-2 rounded"><div class="text-slate-500">Temp</div><div class="font-bold">${v.temp.toFixed(1)}°C</div></div>
        <div class="bg-slate-50 p-2 rounded"><div class="text-slate-500">EC</div><div class="font-bold">${v.ec.toFixed(2)}</div></div>
        <div class="bg-slate-50 p-2 rounded"><div class="text-slate-500">pH</div><div class="font-bold">${v.ph.toFixed(2)}</div></div>
      </div>`;
    } else if (hotspot.kind === 'tank') {
        html = `
      <div class="font-bold text-slate-900 mb-2">Water Storage Tank</div>
      <div class="text-xs text-slate-500 mb-3">Capacity: 5,000 L</div>
      <div class="bg-slate-50 p-2 rounded text-xs mb-3">
        <div class="text-slate-500">Current Level</div>
        <div class="font-bold text-blue-600 text-lg">${snap.scada.tankLevel.toFixed(1)}%</div>
      </div>
      <button onclick="AgriflowData.refillTank(); hidePopover(); showToast('Tank refilled to 100%')"
        class="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 rounded">Refill Tank</button>`;
    }

    popover.innerHTML = html;
    popover.classList.add('open');
    // Position
    const rect = popover.getBoundingClientRect();
    let px = clientX + 12;
    let py = clientY + 12;
    if (px + 280 > window.innerWidth) px = clientX - 280 - 12;
    if (py + 200 > window.innerHeight) py = clientY - 200 - 12;
    popover.style.left = px + 'px';
    popover.style.top = py + 'px';
}

function hidePopover() { popover.classList.remove('open'); }
window.hidePopover = hidePopover;

// Override valve helper (used by popover)
window.overrideValve = function (target, on) {
    if (target === 'irrig') {
        snap.scada.irrigationLine = !!on;
        localStorage.setItem('agriflow_scada_state', JSON.stringify(snap.scada));
        AgriflowData.setValve('high', snap.scada.valves.high); // trigger notify
    } else if (target === 'fert') {
        AgriflowData.setFertigation(!!on);
    } else if (target === 'high' || target === 'low') {
        AgriflowData.setValve(target, !!on);
    }
    hidePopover();
    showToast('Override applied');
};

// Close popover when clicking outside
document.addEventListener('click', (e) => {
    if (!popover.contains(e.target) && e.target !== canvas) hidePopover();
});

// ---------- Right-panel control wiring ----------
document.getElementById('pumpToggle').addEventListener('change', e => {
    AgriflowData.setPump(e.target.checked);
    showToast(`Pump ${e.target.checked ? 'started' : 'stopped'}`);
});
document.getElementById('irrigToggle').addEventListener('change', e => {
    snap.scada.irrigationLine = e.target.checked;
    localStorage.setItem('agriflow_scada_state', JSON.stringify(snap.scada));
    syncStrip();
    showToast(`Irrigation line ${e.target.checked ? 'opened' : 'closed'}`);
});
document.getElementById('fertToggle').addEventListener('change', e => {
    AgriflowData.setFertigation(e.target.checked);
    showToast(`Fertigation line ${e.target.checked ? 'opened' : 'closed'}`, 'warn');
});
document.getElementById('valveHighToggle').addEventListener('change', e => {
    AgriflowData.setValve('high', e.target.checked);
    showToast(`High Zone valve ${e.target.checked ? 'opened' : 'closed'}`);
});
document.getElementById('valveLowToggle').addEventListener('change', e => {
    AgriflowData.setValve('low', e.target.checked);
    showToast(`Low Zone valve ${e.target.checked ? 'opened' : 'closed'}`);
});
document.getElementById('emergencyStop').addEventListener('click', () => {
    AgriflowData.emergencyStop();
    snap.scada.irrigationLine = false;
    localStorage.setItem('agriflow_scada_state', JSON.stringify(snap.scada));
    showToast('EMERGENCY STOP triggered — all valves closed, pump off', 'error');
});
