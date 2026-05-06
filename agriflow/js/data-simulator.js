/* Agriflow Live Data Simulator
   - Live IoT data updated every 2.5s via smooth random walks
   - Persists pump/valve/fertigation state in localStorage
   - Generates 24h of historical data on first load (in-memory)
*/
(function () {
  const STATE_KEY = 'agriflow_scada_state';

  // ---------- Helpers ----------
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function rand(lo, hi) { return lo + Math.random() * (hi - lo); }
  function walk(v, lo, hi, step) {
    const next = v + (Math.random() - 0.5) * step;
    return clamp(next, lo, hi);
  }

  // ---------- Static metadata ----------
  const META = {
    high: {
      key: 'high',
      name: 'High Zone',
      species: 'Musang King',
      treeAge: 5,
      soilType: 'Loamy',
      slope: 15,
      color: '#16a34a'
    },
    low: {
      key: 'low',
      name: 'Low Zone',
      species: 'Black Thorn',
      treeAge: 7,
      soilType: 'Clay',
      slope: 3,
      color: '#0f766e'
    }
  };

  // ---------- Live values (initial) ----------
  const live = {
    high: { temp: 28.5, moisture: 62, ec: 1.4, ph: 6.4, tension: 22 },
        low: { temp: 29.7, moisture: 55, ec: 1.6, ph: 6.7, tension: 30 }
    };

    // ---------- SCADA state (persisted) ----------
    const defaultState = {
        pumpOn: false,
        fertigationMode: false,
        irrigationLine: false,            // NEW: separate irrigation line valve
        valves: { high: false, low: false },
        pressure: 0,
        flowRate: 0,
        tankLevel: 78,
        waterUsedToday: 1247
    };
  let scada = (() => {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (!raw) return { ...defaultState };
      return { ...defaultState, ...JSON.parse(raw) };
    } catch { return { ...defaultState }; }
  })();

  function persistState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(scada));
  }

  // ---------- Gateway info ----------
  const gateway = {
    id: 'LRWN-GW-AGF-001',
    status: 'online',
    signal: 92,
    uptimeStart: Date.now() - (47 * 86400 + 12 * 3600) * 1000,
    firmware: 'v2.4.1',
    frequency: 'AS923 (Asia)',
    sensorsConnected: 8,
    sensorsTotal: 8,
    lastHeartbeat: Date.now()
  };

  // ---------- Sensors ----------
  const sensors = [
    { id: 'AGF-S-101', zone: 'High Zone', type: 'Temperature',  battery: 87, rssi: -71, fw: 'v1.3.0', status: 'online' },
    { id: 'AGF-S-102', zone: 'High Zone', type: 'Moisture',     battery: 92, rssi: -68, fw: 'v1.3.0', status: 'online' },
    { id: 'AGF-S-103', zone: 'High Zone', type: 'EC / pH',      battery: 64, rssi: -82, fw: 'v1.2.8', status: 'online' },
    { id: 'AGF-S-104', zone: 'High Zone', type: 'Soil Tension', battery: 78, rssi: -75, fw: 'v1.3.0', status: 'online' },
    { id: 'AGF-S-201', zone: 'Low Zone',  type: 'Temperature',  battery: 81, rssi: -69, fw: 'v1.3.0', status: 'online' },
    { id: 'AGF-S-202', zone: 'Low Zone',  type: 'Moisture',     battery: 23, rssi: -91, fw: 'v1.2.8', status: 'warning' },
    { id: 'AGF-S-203', zone: 'Low Zone',  type: 'EC / pH',      battery: 89, rssi: -73, fw: 'v1.3.0', status: 'online' },
    { id: 'AGF-S-204', zone: 'Low Zone',  type: 'Soil Tension', battery: 70, rssi: -78, fw: 'v1.3.0', status: 'online' }
  ];

  // ---------- AI Recommendations ----------
  function buildRecommendations() {
    const recs = [];
    const now = new Date();
    const fmt = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (live.high.moisture > 65) {
      recs.push({
        time: fmt(now),
        zone: 'High Zone (Musang King)',
        action: 'Skip irrigation cycle',
        reasoning: `Soil moisture optimal at ${live.high.moisture.toFixed(0)}%, rain expected in 6h.`,
        kind: 'skip'
      });
    } else {
      recs.push({
        time: fmt(now),
        zone: 'High Zone (Musang King)',
        action: 'Irrigate in 2 hours (45 min)',
        reasoning: `Moisture trending below threshold (${live.high.moisture.toFixed(0)}%). Loamy soil drains faster on slope.`,
        kind: 'irrigate'
      });
    }

    if (live.low.tension > 35) {
      recs.push({
        time: fmt(new Date(now.getTime() - 12 * 60000)),
        zone: 'Low Zone (Black Thorn)',
        action: 'Fertigation recommended tomorrow 6:30 AM',
        reasoning: `Soil tension elevated (${live.low.tension.toFixed(0)} kPa). Apply NPK 12-12-17 with irrigation.`,
        kind: 'fertigate'
      });
    } else {
      recs.push({
        time: fmt(new Date(now.getTime() - 12 * 60000)),
        zone: 'Low Zone (Black Thorn)',
        action: 'Irrigate at 5:00 PM (30 min)',
        reasoning: `Clay soil retains water — short cycle sufficient. EC ${live.low.ec.toFixed(2)} mS/cm in range.`,
        kind: 'irrigate'
      });
    }

    recs.push({
      time: fmt(new Date(now.getTime() - 38 * 60000)),
      zone: 'System',
      action: 'Water savings forecast: 32% this week',
      reasoning: 'AI schedule outperforms fixed schedule by 873 L/week based on current weather + soil readings.',
      kind: 'info'
    });

    return recs;
  }

  // ---------- Historical data (24h, 5-min) ----------
  function generateHistory() {
    const points = [];
    const now = Date.now();
    const interval = 5 * 60 * 1000;
    const count = (24 * 60) / 5;

    let h = { temp: 27, moisture: 64, ec: 1.4, ph: 6.4, tension: 22 };
    let l = { temp: 28, moisture: 56, ec: 1.6, ph: 6.7, tension: 30 };

    for (let i = count; i >= 0; i--) {
      const ts = now - i * interval;
      const hourOfDay = new Date(ts).getHours() + new Date(ts).getMinutes() / 60;
      // Diurnal pattern: temperature peaks ~14:00
      const tempCurve = Math.sin((hourOfDay - 6) / 24 * Math.PI * 2) * 3.5;
      // Moisture lowers slightly during the day
      const moistCurve = -Math.sin((hourOfDay - 6) / 24 * Math.PI * 2) * 4;

      h.temp = clamp(27 + tempCurve + (Math.random() - 0.5) * 0.4, 24, 34);
      l.temp = clamp(28.5 + tempCurve + (Math.random() - 0.5) * 0.5, 24, 34);
      h.moisture = clamp(64 + moistCurve + (Math.random() - 0.5) * 1.5, 35, 80);
      l.moisture = clamp(56 + moistCurve * 0.7 + (Math.random() - 0.5) * 1.2, 35, 80);
      h.ec = clamp(h.ec + (Math.random() - 0.5) * 0.04, 0.8, 2.5);
      l.ec = clamp(l.ec + (Math.random() - 0.5) * 0.04, 0.8, 2.5);
      h.ph = clamp(h.ph + (Math.random() - 0.5) * 0.03, 5.5, 7.2);
      l.ph = clamp(l.ph + (Math.random() - 0.5) * 0.03, 5.5, 7.2);
      h.tension = clamp(h.tension + (Math.random() - 0.5) * 1.2, 10, 60);
      l.tension = clamp(l.tension + (Math.random() - 0.5) * 1.0, 10, 60);

      // Simulate irrigation events (moisture spikes at 7am and 5pm)
      const minute = new Date(ts).getMinutes();
      const hr = new Date(ts).getHours();
      if ((hr === 7 && minute < 5) || (hr === 17 && minute < 5)) {
        h.moisture = clamp(h.moisture + 8, 35, 80);
        l.moisture = clamp(l.moisture + 6, 35, 80);
      }

      points.push({
        ts,
        high: { ...h },
        low: { ...l }
      });
    }
    return points;
  }
  const history = generateHistory();

  // ---------- Subscribers ----------
  const subscribers = new Set();

  function tick() {
    // Smooth random walk
    live.high.temp     = walk(live.high.temp,     24, 34, 0.25);
    live.high.moisture = walk(live.high.moisture, 35, 80, 0.6);
    live.high.ec       = walk(live.high.ec,       0.8, 2.5, 0.04);
    live.high.ph       = walk(live.high.ph,       5.5, 7.2, 0.02);
    live.high.tension  = walk(live.high.tension,  10, 60, 0.7);

    live.low.temp      = walk(live.low.temp,      24, 34, 0.25);
    live.low.moisture  = walk(live.low.moisture,  35, 80, 0.5);
    live.low.ec        = walk(live.low.ec,        0.8, 2.5, 0.04);
    live.low.ph        = walk(live.low.ph,        5.5, 7.2, 0.02);
    live.low.tension   = walk(live.low.tension,   10, 60, 0.6);

    // Gateway/sensor signals
    gateway.signal = clamp(gateway.signal + (Math.random() - 0.5) * 1.2, 80, 98);
    gateway.lastHeartbeat = Date.now();
    sensors.forEach(s => {
      s.rssi = clamp(s.rssi + (Math.random() - 0.5) * 1.2, -95, -60);
    });

      // SCADA dynamics
      if (scada.pumpOn) {
          scada.pressure = clamp(scada.pressure + (Math.random() - 0.3) * 0.15, 2.2, 4.5);
          scada.flowRate = clamp(scada.flowRate + (Math.random() - 0.3) * 1.5, 18, 36);
          scada.tankLevel = clamp(scada.tankLevel - 0.08, 0, 100);
          scada.waterUsedToday += scada.flowRate * (2.5 / 60);
          // Water reaches a zone only if pump is on AND a line is open AND that zone valve is open
          const lineOpen = scada.irrigationLine || scada.fertigationMode;
          if (lineOpen && scada.valves.high) live.high.moisture = clamp(live.high.moisture + 0.4, 35, 92);
          if (lineOpen && scada.valves.low) live.low.moisture = clamp(live.low.moisture + 0.35, 35, 92);
      } else {
          scada.pressure = clamp(scada.pressure - 0.4, 0, 5);
          scada.flowRate = clamp(scada.flowRate - 4, 0, 60);
      }
    persistState();

    notify();
  }

  function notify() {
    const snapshot = getSnapshot();
    subscribers.forEach(cb => { try { cb(snapshot); } catch (e) { console.error(e); } });
  }

  function getSnapshot() {
    return {
      meta: META,
      live: JSON.parse(JSON.stringify(live)),
      scada: JSON.parse(JSON.stringify(scada)),
      gateway: { ...gateway },
      sensors: JSON.parse(JSON.stringify(sensors)),
      history,
      recommendations: buildRecommendations()
    };
  }

  // ---------- Public API ----------
  window.AgriflowData = {
    subscribe(cb) { subscribers.add(cb); cb(getSnapshot()); return () => subscribers.delete(cb); },
    snapshot: getSnapshot,
    setPump(on) { scada.pumpOn = !!on; if (!on) { scada.flowRate = 0; scada.pressure = 0; } persistState(); notify(); },
    setValve(zone, open) { scada.valves[zone] = !!open; persistState(); notify(); },
    setFertigation(on) { scada.fertigationMode = !!on; persistState(); notify(); },
    refillTank() { scada.tankLevel = 100; persistState(); notify(); },
    emergencyStop() {
      scada.pumpOn = false;
      scada.valves.high = false;
      scada.valves.low = false;
      scada.flowRate = 0;
      scada.pressure = 0;
      persistState();
      notify();
    }
  };

  // Kick off
  setInterval(tick, 2500);
  // Initial notify already triggered on subscribe
})();
