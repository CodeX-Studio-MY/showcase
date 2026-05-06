const $ = (id) => document.getElementById(id);

const flowIds = ['flowTankPump', 'flowPumpSplit', 'flowJoin', 'flowTrunk'];
const irrigFlow = ['flowIrrig'];
const fertFlow = ['flowFert'];

function setFlow(el, on, color) {
    if (!el) return;
    el.classList.toggle('off', !on);
    if (color) el.setAttribute('stroke', color);
}

function render(s) {
    // Pump
    $('pumpToggle').checked = s.scada.pumpOn;
    $('pumpLabel').textContent = s.scada.pumpOn ? 'ON' : 'OFF';
    $('pumpLabel').className = 'text-2xl font-bold ' + (s.scada.pumpOn ? 'text-green-600' : 'text-slate-400');
    $('pumpStatusText').textContent = s.scada.pumpOn ? 'ON' : 'OFF';
    $('impeller').classList.toggle('on', s.scada.pumpOn);

    // Fertigation
    $('fertToggle').checked = s.scada.fertigationMode;

    // Valves
    $('valveHighToggle').checked = s.scada.valves.high;
    $('valveLowToggle').checked = s.scada.valves.low;
    $('valveHighLabel').textContent = s.scada.valves.high ? 'Open' : 'Closed';
    $('valveLowLabel').textContent = s.scada.valves.low ? 'Open' : 'Closed';
    $('valveHigh').classList.toggle('closed', !s.scada.valves.high);
    $('valveLow').classList.toggle('closed', !s.scada.valves.low);

    // Tank
    const tank = Math.round(s.scada.tankLevel);
    $('tankLevelTxt').textContent = tank;
    $('tankPct').textContent = tank + '%';
    $('tankBar').style.width = tank + '%';
    $('tankWater').setAttribute('y', 123 + (174 * (1 - tank / 100)));
    $('tankWater').setAttribute('height', 174 * (tank / 100));

    // Pressure gauge (0–5 bar)
    const pPct = s.scada.pressure / 5;
    $('pressureVal').textContent = s.scada.pressure.toFixed(1);
    $('pressureFill').setAttribute('stroke-dashoffset', 125.6 * (1 - pPct));

    // Flow gauge (0–40)
    const fPct = s.scada.flowRate / 40;
    $('flowVal').textContent = Math.round(s.scada.flowRate);
    $('flowFill').setAttribute('stroke-dashoffset', 125.6 * (1 - fPct));

    // Pipe flow animations
    const pumping = s.scada.pumpOn;
    const activeColor = s.scada.fertigationMode ? '#f59e0b' : '#3b82f6';
    flowIds.forEach(id => setFlow($(id), pumping, activeColor));
    setFlow($('flowIrrig'), pumping && !s.scada.fertigationMode, '#3b82f6');
    setFlow($('flowFert'), pumping && s.scada.fertigationMode, '#f59e0b');
    setFlow($('flowToHigh'), pumping && s.scada.valves.high, activeColor);
    setFlow($('flowToLow'), pumping && s.scada.valves.low, activeColor);
    setFlow($('flowHighOut'), pumping && s.scada.valves.high, activeColor);
    setFlow($('flowLowOut'), pumping && s.scada.valves.low, activeColor);

    // Zone moisture display
    $('highMoist').textContent = Math.round(s.live.high.moisture) + '%';
    $('lowMoist').textContent = Math.round(s.live.low.moisture) + '%';
}

AgriflowData.subscribe(render);

// Wire controls
$('pumpToggle').addEventListener('change', e => {
    AgriflowData.setPump(e.target.checked);
    showToast(`Pump ${e.target.checked ? 'started' : 'stopped'}`);
});
$('valveHighToggle').addEventListener('change', e => {
    AgriflowData.setValve('high', e.target.checked);
    showToast(`High Zone valve ${e.target.checked ? 'opened' : 'closed'}`);
});
$('valveLowToggle').addEventListener('change', e => {
    AgriflowData.setValve('low', e.target.checked);
    showToast(`Low Zone valve ${e.target.checked ? 'opened' : 'closed'}`);
});
$('fertToggle').addEventListener('change', e => {
    AgriflowData.setFertigation(e.target.checked);
    showToast(`Fertigation mode ${e.target.checked ? 'enabled' : 'disabled'}`, 'warn');
});
$('emergencyStop').addEventListener('click', () => {
    AgriflowData.emergencyStop();
    showToast('EMERGENCY STOP triggered — all valves closed, pump off', 'error');
});
