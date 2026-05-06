// Agriflow Digital Twin — realistic terrain + durian trees (no top circles)
(function () {
    if (typeof THREE === 'undefined') {
        const el = document.getElementById('twinLoading');
        if (el) el.innerHTML = '<span style="color:#dc2626">⚠ Three.js failed to load</span>';
        return;
    }

    const canvas = document.getElementById('threeCanvas');
    const wrap = canvas?.parentElement;
    if (!canvas || !wrap) return;

    // ---------- Renderer ----------
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;

    // ---------- Scene ----------
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xbfe2f5);
    scene.fog = new THREE.Fog(0xbfe2f5, 90, 220);

    // ---------- Camera ----------
    const camera = new THREE.PerspectiveCamera(45, 16 / 9, 0.1, 500);
    camera.position.set(55, 42, 70);

    // ---------- Controls ----------
    const controls = new THREE.OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 30;
    controls.maxDistance = 150;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.target.set(0, 4, 0);

    // ---------- Lights (toned down) ----------
    scene.add(new THREE.HemisphereLight(0xfff5e0, 0x4a6b3a, 0.35));
    const sun = new THREE.DirectionalLight(0xfff1d4, 0.75);
    sun.position.set(50, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    scene.add(sun);
    scene.add(new THREE.AmbientLight(0xffffff, 0.18));

    // Slight tone-mapping for richer colors
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;

    // ---------- Terrain (displaced plane with hills) ----------
    function makeTerrain() {
        const size = 220, seg = 120;
        const geo = new THREE.PlaneGeometry(size, size, seg, seg);
        geo.rotateX(-Math.PI / 2);
        const pos = geo.attributes.position;
        // Multi-octave noise-like displacement
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), z = pos.getZ(i);
            const d = Math.sqrt(x * x + z * z);
            let h = 0;
            h += Math.sin(x * 0.05) * Math.cos(z * 0.05) * 2.2;
            h += Math.sin(x * 0.13 + 1.7) * Math.cos(z * 0.11) * 1.1;
            h += Math.sin(x * 0.25) * Math.cos(z * 0.27) * 0.45;
            // Raise far ring (background hills)
            if (d > 70) h += (d - 70) * 0.18;
            // Flatten center where zones sit
            const flatten = Math.max(0, 1 - d / 35);
            h *= 1 - flatten * 0.85;
            pos.setY(i, h);
        }
        geo.computeVertexNormals();

        // Vertex colors — grass / dirt / rock by elevation
        const colors = new Float32Array(pos.count * 3);
        const cGrass = new THREE.Color(0x6fa84a);
        const cGrass2 = new THREE.Color(0x8bbf5e);
        const cDirt = new THREE.Color(0x8a6a44);
        const cRock = new THREE.Color(0x9a9486);
        for (let i = 0; i < pos.count; i++) {
            const y = pos.getY(i);
            let c;
            if (y < 0.4) c = cGrass.clone().lerp(cGrass2, Math.random() * 0.6);
            else if (y < 2.5) c = cGrass2.clone().lerp(cDirt, (y - 0.4) / 2.1 * 0.6);
            else c = cDirt.clone().lerp(cRock, Math.min(1, (y - 2.5) / 4));
            // Slight per-vertex variation
            const j = (Math.random() - 0.5) * 0.08;
            colors[i * 3] = Math.max(0, Math.min(1, c.r + j));
            colors[i * 3 + 1] = Math.max(0, Math.min(1, c.g + j));
            colors[i * 3 + 2] = Math.max(0, Math.min(1, c.b + j));
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true, roughness: 0.95, metalness: 0.0, flatShading: false
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.receiveShadow = true;
        return mesh;
    }
    scene.add(makeTerrain());

    // ---------- Realistic Durian Tree (no top circle) ----------
    function makeTree(scale = 1) {
        const tree = new THREE.Group();

        // Trunk — tapered cylinder with bark color
        const trunkH = 4.2 * scale;
        const trunkGeo = new THREE.CylinderGeometry(0.18 * scale, 0.32 * scale, trunkH, 10);
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 0.95 });
        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = trunkH / 2;
        trunk.castShadow = true;
        tree.add(trunk);

        // Canopy — multiple irregular foliage clusters (icosahedron, not smooth sphere)
        const foliageMat1 = new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.9, flatShading: true });
        const foliageMat2 = new THREE.MeshStandardMaterial({ color: 0x3d8a35, roughness: 0.9, flatShading: true });
        const foliageMat3 = new THREE.MeshStandardMaterial({ color: 0x4ea043, roughness: 0.9, flatShading: true });
        const mats = [foliageMat1, foliageMat2, foliageMat3];

        const clusters = [
            { x: 0, y: trunkH + 0.6, z: 0, r: 1.6, m: 1 },
            { x: 0.9, y: trunkH + 0.2, z: 0.2, r: 1.2, m: 0 },
            { x: -0.8, y: trunkH + 0.4, z: 0.4, r: 1.3, m: 2 },
            { x: 0.2, y: trunkH + 1.2, z: -0.7, r: 1.1, m: 1 },
            { x: -0.3, y: trunkH + 1.6, z: 0.5, r: 0.95, m: 2 },
            { x: 0.5, y: trunkH + 0.9, z: 0.9, r: 1.0, m: 0 }
        ];
        clusters.forEach(c => {
            const geo = new THREE.IcosahedronGeometry(c.r * scale, 1);
            // Distort vertices slightly for organic look
            const p = geo.attributes.position;
            for (let i = 0; i < p.count; i++) {
                const v = new THREE.Vector3(p.getX(i), p.getY(i), p.getZ(i));
                v.multiplyScalar(1 + (Math.random() - 0.5) * 0.18);
                p.setXYZ(i, v.x, v.y, v.z);
            }
            geo.computeVertexNormals();
            const m = new THREE.Mesh(geo, mats[c.m]);
            m.position.set(c.x * scale, c.y, c.z * scale);
            m.castShadow = true;
            tree.add(m);
        });

        return tree;
    }

    // ---------- Sensor Node ----------
    function makeSensorNode(color = 0x16a34a) {
        const g = new THREE.Group();
        const stickGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.2, 8);
        const stickMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.6, roughness: 0.4 });
        const stick = new THREE.Mesh(stickGeo, stickMat);
        stick.position.y = 0.6;
        g.add(stick);

        const bulbGeo = new THREE.SphereGeometry(0.18, 16, 16);
        const bulbMat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.8 });
        const bulb = new THREE.Mesh(bulbGeo, bulbMat);
        bulb.position.y = 1.3;
        g.add(bulb);

        const ringGeo = new THREE.RingGeometry(0.25, 0.32, 24);
        const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 1.3;
        g.add(ring);

        g.userData = { bulb, ring, t: Math.random() * Math.PI * 2 };
        return g;
    }

    // ---------- Zone Label Sprite ----------
    function makeLabel(text, color = '#16a34a') {
        const c = document.createElement('canvas');
        c.width = 512; c.height = 128;
        const ctx = c.getContext('2d');
        ctx.fillStyle = 'rgba(15,23,42,0.85)';
        ctx.beginPath();
        const r = 24, w = 480, h = 100, x = 16, y = 14;
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.fill();
        ctx.fillStyle = color;
        ctx.font = 'bold 44px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 256, 64);
        const tex = new THREE.CanvasTexture(c);
        const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sp = new THREE.Sprite(mat);
        sp.scale.set(10, 2.5, 1);
        return sp;
    }

    // ---------- Zone (raised plot with trees + sensors) ----------
    const zoneObjects = {};
    function makeZone(opts) {
        const g = new THREE.Group();
        g.position.set(opts.x, 0, opts.z);

        // Zone pad — slightly raised soil patch
        const padGeo = new THREE.CylinderGeometry(opts.radius, opts.radius + 0.6, 0.5, 32);
        const padMat = new THREE.MeshStandardMaterial({ color: 0x7ba24a, roughness: 0.95 });
        const pad = new THREE.Mesh(padGeo, padMat);
        pad.position.y = opts.elevation;
        pad.receiveShadow = true;
        g.add(pad);

        // Edge ring
        const ringGeo = new THREE.RingGeometry(opts.radius + 0.4, opts.radius + 0.8, 48);
        const ringMat = new THREE.MeshBasicMaterial({ color: opts.accent, side: THREE.DoubleSide, transparent: true, opacity: 0.7 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = opts.elevation + 0.27;
        g.add(ring);

        // Trees — exact count, placed on a poisson-ish grid inside the pad
        const treesGroup = new THREE.Group();
        const targetCount = Math.min(15, opts.treeCount || 9);
        const placed = [];
        const minDist = 1.8;       // minimum spacing between trees
        const maxR = opts.radius - 1.4;
        let attempts = 0;
        while (placed.length < targetCount && attempts < 400) {
            attempts++;
            // Sample inside disc
            const a = Math.random() * Math.PI * 2;
            const r = Math.sqrt(Math.random()) * maxR;
            const tx = Math.cos(a) * r;
            const tz = Math.sin(a) * r;
            // Reject if too close to an existing tree or sensor corner
            let ok = true;
            for (const p of placed) {
                if (Math.hypot(p[0] - tx, p[1] - tz) < minDist) { ok = false; break; }
            }
            if (!ok) continue;
            placed.push([tx, tz]);
            const tree = makeTree(0.85 + Math.random() * 0.3);
            tree.position.set(tx, opts.elevation + 0.25, tz);
            tree.rotation.y = Math.random() * Math.PI * 2;
            treesGroup.add(tree);
        }
        g.add(treesGroup);
        // 4 sensor nodes around the zone
        const sensors = [];    
        const sensorPositions = [
            [opts.radius * 0.55, opts.radius * 0.55],
            [-opts.radius * 0.55, opts.radius * 0.55],
            [opts.radius * 0.55, -opts.radius * 0.55],
            [-opts.radius * 0.55, -opts.radius * 0.55]
        ];
        sensorPositions.forEach(([sx, sz]) => {
            const s = makeSensorNode(opts.accent);
            s.position.set(sx, opts.elevation + 0.25, sz);
            g.add(s);
            sensors.push(s);
        });

        // Hit area for clicks
        const hitGeo = new THREE.CylinderGeometry(opts.radius, opts.radius, 8, 32);
        const hitMat = new THREE.MeshBasicMaterial({ visible: false });
        const hit = new THREE.Mesh(hitGeo, hitMat);
        hit.position.y = opts.elevation + 4;
        hit.userData.zoneId = opts.id;
        g.add(hit);

        // Label sprite
        const label = makeLabel(opts.label, '#a7f3d0');
        label.position.set(0, opts.elevation + 9, 0);
        g.add(label);

        scene.add(g);
        zoneObjects[opts.id] = { group: g, sensors, hit };
        return g;
    }

    makeZone({ id: 'high', x: -14, z: -6, radius: 9, elevation: 2.2, accent: 0x16a34a, label: 'High Zone', treeCount: 9 });
    makeZone({ id: 'low', x: 14, z: 6, radius: 10, elevation: 0.5, accent: 0x0f766e, label: 'Low Zone', treeCount: 15 });


    // ---------- Gateway Tower ----------
    function makeGateway() {
        const g = new THREE.Group();
        const base = new THREE.Mesh(
            new THREE.CylinderGeometry(0.8, 1.0, 0.4, 16),
            new THREE.MeshStandardMaterial({ color: 0x334155 })
        );
        base.position.y = 0.2;
        g.add(base);

        const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.12, 0.12, 6, 12),
            new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.7, roughness: 0.4 })
        );
        pole.position.y = 3.2;
        g.add(pole);

        const box = new THREE.Mesh(
            new THREE.BoxGeometry(0.9, 0.6, 0.5),
            new THREE.MeshStandardMaterial({ color: 0x1e293b })
        );
        box.position.y = 4.4;
        g.add(box);

        const antenna = new THREE.Mesh(
            new THREE.CylinderGeometry(0.04, 0.04, 1.6, 8),
            new THREE.MeshStandardMaterial({ color: 0x94a3b8 })
        );
        antenna.position.y = 6.5;
        g.add(antenna);

        const blink = new THREE.Mesh(
            new THREE.SphereGeometry(0.1, 12, 12),
            new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 1 })
        );
        blink.position.y = 7.4;
        g.add(blink);

        // Signal rings
        const rings = [];
        for (let i = 0; i < 3; i++) {
            const rg = new THREE.RingGeometry(0.5, 0.55, 32);
            const rm = new THREE.MeshBasicMaterial({ color: 0x16a34a, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
            const r = new THREE.Mesh(rg, rm);
            r.rotation.x = -Math.PI / 2;
            r.position.y = 4.5;
            r.userData.phase = i / 3;
            g.add(r);
            rings.push(r);
        }

        g.position.set(0, 1.5, 12);
        g.userData = { blink, rings };
        scene.add(g);
        return g;
    }
    const gateway = makeGateway();

    // ---------- Click handling ----------
    const ray = new THREE.Raycaster();
    const mouse = new THREE.Vector2();
    canvas.addEventListener('click', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        ray.setFromCamera(mouse, camera);
        const hits = ray.intersectObjects(Object.values(zoneObjects).map(z => z.hit));
        if (hits.length && typeof window.openZonePanel === 'function') {
            window.openZonePanel(hits[0].object.userData.zoneId);
        }
    });

    // ---------- Resize ----------
    function resize() {
        const w = wrap.clientWidth, h = wrap.clientHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);
    resize();

    // ---------- Hide loading ----------
    setTimeout(() => {
        const el = document.getElementById('twinLoading');
        if (el) el.classList.add('hidden');
    }, 300);

    // ---------- Animate ----------
    const clock = new THREE.Clock();
    function tick() {
        const dt = clock.getDelta();
        const t = clock.getElapsedTime();

        // Sensor pulses
        Object.values(zoneObjects).forEach(z => {
            z.sensors.forEach(s => {
                s.userData.t += dt * 2;
                const k = (Math.sin(s.userData.t) + 1) / 2;
                s.userData.bulb.material.emissiveIntensity = 0.5 + k * 0.8;
                const sc = 1 + k * 0.6;
                s.userData.ring.scale.set(sc, sc, sc);
                s.userData.ring.material.opacity = 0.6 * (1 - k);
            });
        });

        // Gateway rings
        gateway.userData.rings.forEach((r, i) => {
            const p = ((t * 0.6) + r.userData.phase) % 1;
            const sc = 0.5 + p * 6;
            r.scale.set(sc, sc, 1);
            r.material.opacity = 0.6 * (1 - p);
        });
        gateway.userData.blink.material.emissiveIntensity = 0.5 + Math.abs(Math.sin(t * 3)) * 1.5;

        controls.update();
        renderer.render(scene, camera);
        requestAnimationFrame(tick);
    }
    tick();
})();
