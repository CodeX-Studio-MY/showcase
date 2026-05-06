import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const canvas = document.getElementById('threeCanvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xc7e7f7);
scene.fog = new THREE.Fog(0xc7e7f7, 60, 140);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 500);
camera.position.set(28, 22, 32);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 18;
controls.maxDistance = 70;
controls.maxPolarAngle = Math.PI * 0.48;
controls.target.set(0, 2, 0);

// Lights
scene.add(new THREE.AmbientLight(0xffffff, 0.55));
const sun = new THREE.DirectionalLight(0xffffff, 0.95);
sun.position.set(20, 30, 18);
sun.castShadow = true;
scene.add(sun);
const hemi = new THREE.HemisphereLight(0x99ccff, 0x4a7c3a, 0.4);
scene.add(hemi);

// Ground (skirt)
const skirt = new THREE.Mesh(
    new THREE.CircleGeometry(80, 48),
    new THREE.MeshStandardMaterial({ color: 0x9bcb7a, roughness: 0.95 })
);
skirt.rotation.x = -Math.PI / 2;
skirt.position.y = -0.05;
scene.add(skirt);

// ---------- Zones ----------
const zones = {};

function makeZone(key, x, elevation, color, name) {
    const group = new THREE.Group();
    group.position.set(x, 0, 0);

    // Plateau / pad
    const pad = new THREE.Mesh(
        new THREE.BoxGeometry(18, elevation + 0.5, 22),
        new THREE.MeshStandardMaterial({ color, roughness: 0.9 })
    );
    pad.position.y = (elevation + 0.5) / 2 - 0.5;
    group.add(pad);

    // Soft slope edge
    const edge = new THREE.Mesh(
        new THREE.BoxGeometry(18.4, 0.2, 22.4),
        new THREE.MeshStandardMaterial({ color: 0x6b8e4e, roughness: 1 })
    );
    edge.position.y = elevation;
    group.add(edge);

    // Trees
    const treeGrid = [
        [-6, -7], [-2, -7], [2, -7], [6, -7],
        [-6, 0], [6, 0],
        [-6, 7], [-2, 7], [2, 7], [6, 7]
    ];
    treeGrid.forEach((p) => {
        const tree = makeTree();
        tree.position.set(p[0], elevation + 0.2, p[1]);
        group.add(tree);
    });

    // Sensor nodes (4)
    const nodePos = [[-5, -3], [3, -2], [-3, 3], [5, 4]];
    const nodes = [];
    nodePos.forEach((p) => {
        const node = makeSensorNode();
        node.position.set(p[0], elevation + 0.6, p[1]);
        group.add(node);
        nodes.push(node);
    });

    // Invisible click target spanning the whole zone
    const hit = new THREE.Mesh(
        new THREE.BoxGeometry(18, elevation + 1.5, 22),
        new THREE.MeshBasicMaterial({ visible: false })
    );
    hit.position.y = (elevation + 1.5) / 2 - 0.5;
    hit.userData.zoneKey = key;
    group.add(hit);

    // Label sprite
    const label = makeLabelSprite(name);
    label.position.set(0, elevation + 8, 0);
    group.add(label);

    scene.add(group);
    zones[key] = { group, nodes, hit, label };
}

function makeTree() {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.18, 0.25, 1.4, 8),
        new THREE.MeshStandardMaterial({ color: 0x6b3f1f })
    );
    trunk.position.y = 0.7;
    t.add(trunk);
    // Canopy: cone + sphere combo
    const canopy = new THREE.Mesh(
        new THREE.ConeGeometry(1.1, 2.2, 12),
        new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.85 })
    );
    canopy.position.y = 2.4;
    t.add(canopy);
    const top = new THREE.Mesh(
        new THREE.SphereGeometry(0.7, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x388e3c })
    );
    top.position.y = 3.3;
    t.add(top);
    return t;
}

function makeSensorNode() {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6),
        new THREE.MeshStandardMaterial({ color: 0x334155 })
    );
    stick.position.y = 0.3;
    g.add(stick);
    const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 12, 10),
        new THREE.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x06b6d4, emissiveIntensity: 1.2 })
    );
    bulb.position.y = 0.7;
    g.add(bulb);
    // Pulsating ring
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.25, 0.35, 24),
        new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    g.add(ring);
    g.userData.bulb = bulb; g.userData.ring = ring;
    return g;
}

function makeLabelSprite(text) {
    const c = document.createElement('canvas');
    c.width = 512; c.height = 128;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(15,23,42,0.85)';
    roundRect(ctx, 16, 16, 480, 96, 20); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 42px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 64);
    const tex = new THREE.CanvasTexture(c);
    tex.needsUpdate = true;
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sp = new THREE.Sprite(mat);
    sp.scale.set(8, 2, 1);
    return sp;
}
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

makeZone('high', -12, 2.8, 0x4a8a3a, 'High Zone — Musang King');
makeZone('low', 12, 0.3, 0x6ba85a, 'Low Zone — Black Thorn');

// ---------- Gateway tower ----------
const tower = new THREE.Group();
const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.4, 0.5, 4.5, 10),
    new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6, roughness: 0.4 })
);
base.position.y = 2.25;
tower.add(base);
const box = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.9, 0.8),
    new THREE.MeshStandardMaterial({ color: 0x16a34a })
);
box.position.y = 4.8;
tower.add(box);
const antenna = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.04, 1.6, 6),
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1 })
);
antenna.position.y = 6.0;
tower.add(antenna);
// Blinking top
const blink = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 10, 8),
    new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1 })
);
blink.position.y = 6.9;
tower.add(blink);

// LoRaWAN signal rings
const signalRings = [];
for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(
        new THREE.RingGeometry(1.2, 1.3, 32),
        new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.5, side: THREE.DoubleSide })
    );
    r.rotation.x = -Math.PI / 2;
    r.position.y = 4.8;
    r.userData.phase = i / 3;
    tower.add(r);
    signalRings.push(r);
}

const towerLabel = makeLabelSprite('LoRaWAN Gateway');
towerLabel.position.y = 8.2;
towerLabel.scale.set(6, 1.5, 1);
tower.add(towerLabel);

scene.add(tower);

// ---------- Click handling ----------
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const targets = [zones.high.hit, zones.low.hit];
    const hits = raycaster.intersectObjects(targets, false);
    if (hits.length) {
        const key = hits[0].object.userData.zoneKey;
        window.openZonePanel(key);
    }
});

// Hover cursor feedback
canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const hits = raycaster.intersectObjects([zones.high.hit, zones.low.hit], false);
    canvas.style.cursor = hits.length ? 'pointer' : 'grab';
});

// ---------- Resize ----------
function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(canvas);
resize();

// ---------- Animation loop ----------
const clock = new THREE.Clock();
function loop() {
    const t = clock.getElapsedTime();
    // Pulse sensor nodes
    Object.values(zones).forEach(z => {
        z.nodes.forEach((n, i) => {
            const phase = (t + i * 0.3) % 1.6 / 1.6;
            n.userData.bulb.material.emissiveIntensity = 0.6 + Math.sin(phase * Math.PI * 2) * 0.6;
            n.userData.ring.scale.setScalar(1 + phase * 1.5);
            n.userData.ring.material.opacity = 0.7 * (1 - phase);
        });
    });
    // Signal rings expand
    signalRings.forEach((r) => {
        const phase = (t * 0.6 + r.userData.phase) % 1;
        r.scale.setScalar(1 + phase * 4);
        r.material.opacity = 0.5 * (1 - phase);
    });
    // Blink
    blink.material.emissiveIntensity = 0.5 + Math.sin(t * 4) * 0.5;

    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
}
loop();
