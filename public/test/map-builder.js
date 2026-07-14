const GRID = 20;
const WORLD_SIZE = 5000;

let currentTool = 'select';
let mapData = {
    name: '',
    level: 1,
    playerStart: { x: 2500, y: 2500 },
    walls: [],
    chests: [],
    monsterSpawns: [],
    exit: null
};
let selectedItem = null;
let items = []; // DOM elements for selection tracking
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let dragItem = null;
let dragOffX = 0, dragOffY = 0;
let rubberBand = null;

// Grid snap
function snap(v) { return Math.round(v / GRID) * GRID; }

// DOM refs
const gameWorld = document.getElementById('game-world');
const mapBg = document.getElementById('map-bg');
const statusEl = document.getElementById('status');
const infoPos = document.getElementById('info-pos');
const infoItems = document.getElementById('info-items');
const levelInput = document.getElementById('level-input');
const nameInput = document.getElementById('name-input');
const propsPanel = document.getElementById('props-panel');

// Grid overlay
function buildGrid() {
    for (let x = 0; x < WORLD_SIZE; x += GRID) {
        const el = document.createElement('div');
        el.className = 'grid-line';
        el.style.cssText = `left:${x}px;top:0;width:1px;height:100%;`;
        mapBg.appendChild(el);
    }
    for (let y = 0; y < WORLD_SIZE; y += GRID) {
        const el = document.createElement('div');
        el.className = 'grid-line';
        el.style.cssText = `left:0;top:${y}px;width:100%;height:1px;`;
        mapBg.appendChild(el);
    }
}
buildGrid();

// Tool selection
function setTool(tool) {
    currentTool = tool;
    deselectAll();
    document.querySelectorAll('#toolbar button[data-tool]').forEach(b =>
        b.classList.toggle('active', b.dataset.tool === tool));
    document.getElementById('info-tool').textContent = `Tool: ${tool.charAt(0).toUpperCase() + tool.slice(1)}`;
    gameWorld.style.cursor = tool === 'select' ? 'default' : 'crosshair';
    propsPanel.style.display = 'none';
}

document.querySelectorAll('#toolbar button[data-tool]').forEach(btn =>
    btn.addEventListener('click', () => setTool(btn.dataset.tool)));

// Selection
function deselectAll() {
    document.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    selectedItem = null;
    propsPanel.style.display = 'none';
}

function selectItem(el, data) {
    deselectAll();
    el.classList.add('selected');
    selectedItem = { el, data };
    showProps(data);
}

// Property panel
function showProps(data) {
    propsPanel.style.display = 'flex';
    propsPanel.innerHTML = '';
    if (data.type === 'wall') {
        addProp('X', data.x, v => { data.x = snap(v); renderItem(data); });
        addProp('Y', data.y, v => { data.y = snap(v); renderItem(data); });
        addProp('Width', data.width, v => { data.width = Math.max(GRID, snap(v)); renderItem(data); });
        addProp('Height', data.height, v => { data.height = Math.max(GRID, snap(v)); renderItem(data); });
    } else if (data.type === 'chest') {
        addProp('X', data.x, v => { data.x = snap(v); renderItem(data); });
        addProp('Y', data.y, v => { data.y = snap(v); renderItem(data); });
    } else if (data.type === 'monster') {
        addProp('X', data.x, v => { data.x = snap(v); renderItem(data); });
        addProp('Y', data.y, v => { data.y = snap(v); renderItem(data); });
        addProp('Count', data.count, v => { data.count = Math.max(1, Math.floor(Number(v) || 1)); renderItem(data); });
    } else if (data.type === 'exit') {
        addProp('X', data.x, v => { data.x = snap(v); renderItem(data); });
        addProp('Y', data.y, v => { data.y = snap(v); renderItem(data); });
        addProp('Target Level', data.targetLevel, v => { data.targetLevel = Math.floor(Number(v) || 1); });
    } else if (data.type === 'start') {
        addProp('X', data.x, v => { data.x = snap(v); renderItem(data); });
        addProp('Y', data.y, v => { data.y = snap(v); renderItem(data); });
    }
}

function addProp(label, value, onChange) {
    const lbl = document.createElement('label');
    lbl.textContent = label;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.value = value;
    inp.addEventListener('input', () => onChange(inp.value));
    propsPanel.appendChild(lbl);
    propsPanel.appendChild(inp);
}

// Render helpers
function renderItem(data) {
    let el;
    if (data.type === 'wall') {
        el = document.querySelector(`.wall[data-id="${data._id}"]`);
        if (el) {
            el.style.cssText = `left:${data.x}px;top:${data.y}px;width:${data.width}px;height:${data.height}px;`;
        }
    } else if (data.type === 'chest') {
        el = document.querySelector(`.chest[data-id="${data._id}"]`);
        if (el) el.style.cssText = `left:${data.x}px;top:${data.y}px;`;
    } else if (data.type === 'monster') {
        el = document.querySelector(`.monster-spawn[data-id="${data._id}"]`);
        if (el) {
            el.style.cssText = `left:${data.x - 15}px;top:${data.y - 15}px;`;
            el.textContent = data.count;
        }
    } else if (data.type === 'exit') {
        el = document.querySelector(`.exit[data-id="${data._id}"]`);
        if (el) el.style.cssText = `left:${data.x - 20}px;top:${data.y - 20}px;`;
    } else if (data.type === 'start') {
        el = document.querySelector('.player-start');
        if (el) el.style.cssText = `left:${data.x - 15}px;top:${data.y - 15}px;`;
    }
    updateInfo();
}

// Create DOM element for a data item
function createItemElement(data) {
    let el;
    if (data.type === 'wall') {
        el = document.createElement('div');
        el.className = 'wall';
        el.dataset.id = data._id;
        el.style.cssText = `left:${data.x}px;top:${data.y}px;width:${data.width}px;height:${data.height}px;`;
        gameWorld.appendChild(el);
    } else if (data.type === 'chest') {
        el = document.createElement('div');
        el.className = 'chest';
        el.dataset.id = data._id;
        el.style.cssText = `left:${data.x}px;top:${data.y}px;`;
        gameWorld.appendChild(el);
    } else if (data.type === 'monster') {
        el = document.createElement('div');
        el.className = 'monster-spawn';
        el.dataset.id = data._id;
        el.style.cssText = `left:${data.x - 15}px;top:${data.y - 15}px;`;
        el.textContent = data.count;
        gameWorld.appendChild(el);
    } else if (data.type === 'exit') {
        el = document.createElement('div');
        el.className = 'exit';
        el.dataset.id = data._id;
        el.style.cssText = `left:${data.x - 20}px;top:${data.y - 20}px;`;
        el.textContent = '→';
        gameWorld.appendChild(el);
    } else if (data.type === 'start') {
        el = document.querySelector('.player-start');
        if (!el) {
            el = document.createElement('div');
            el.className = 'player-start';
            el.textContent = 'S';
            gameWorld.appendChild(el);
        }
        el.style.cssText = `left:${data.x - 15}px;top:${data.y - 15}px;`;
    }
    if (el) {
        el.addEventListener('mousedown', e => {
            if (currentTool !== 'select') return;
            e.stopPropagation();
            selectItem(el, data);
            isDragging = true;
            dragItem = { el, data };
            const rect = gameWorld.getBoundingClientRect();
            const scale = rect.width / WORLD_SIZE;
            dragOffX = (e.clientX - rect.left) / scale - data.x;
            dragOffY = (e.clientY - rect.top) / scale - data.y;
        });
    }
    return el;
}

// Add item to map data + DOM
let nextId = 1;

function addItem(data) {
    data._id = nextId++;
    if (data.type === 'wall') mapData.walls.push(data);
    else if (data.type === 'chest') mapData.chests.push(data);
    else if (data.type === 'monster') mapData.monsterSpawns.push(data);
    else if (data.type === 'exit') mapData.exit = data;
    else if (data.type === 'start') mapData.playerStart = data;
    createItemElement(data);
    updateInfo();
    return data;
}

// Remove item
function removeItem(data) {
    if (data.type === 'wall') mapData.walls = mapData.walls.filter(w => w !== data);
    else if (data.type === 'chest') mapData.chests = mapData.chests.filter(c => c !== data);
    else if (data.type === 'monster') mapData.monsterSpawns = mapData.monsterSpawns.filter(m => m !== data);
    else if (data.type === 'exit') { mapData.exit = null; }
    else if (data.type === 'start') { mapData.playerStart = { x: 2500, y: 2500 }; }
    const el = document.querySelector(`[data-id="${data._id}"]`) || document.querySelector('.player-start');
    if (el) el.remove();
    deselectAll();
    updateInfo();
    if (data.type === 'start') {
        createItemElement(mapData.playerStart);
    }
}

// Convert mouse/pointer coords to world coords
function clientToWorld(clientX, clientY) {
    const rect = gameWorld.getBoundingClientRect();
    const scale = rect.width / WORLD_SIZE;
    return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale
    };
}

// Click handler
gameWorld.addEventListener('mousedown', e => {
    if (currentTool === 'select') return;
    const pos = clientToWorld(e.clientX, e.clientY);
    const sx = snap(pos.x);
    const sy = snap(pos.y);

    if (currentTool === 'wall') {
        // Start rubber band
        isDragging = true;
        dragStartX = sx;
        dragStartY = sy;
        rubberBand = document.createElement('div');
        rubberBand.className = 'rubber-band';
        rubberBand.style.cssText = `left:${sx}px;top:${sy}px;width:0;height:0;`;
        gameWorld.appendChild(rubberBand);
    } else if (currentTool === 'chest') {
        addItem({ type: 'chest', x: sx, y: sy });
    } else if (currentTool === 'monster') {
        addItem({ type: 'monster', x: sx, y: sy, count: 3 });
    } else if (currentTool === 'exit') {
        if (mapData.exit) removeItem(mapData.exit);
        addItem({ type: 'exit', x: sx, y: sy, targetLevel: 2 });
    } else if (currentTool === 'start') {
        if (mapData.playerStart) removeItem(mapData.playerStart);
        addItem({ type: 'start', x: sx, y: sy });
    }
});

gameWorld.addEventListener('mousemove', e => {
    const pos = clientToWorld(e.clientX, e.clientY);
    infoPos.textContent = `X: ${Math.round(pos.x)} Y: ${Math.round(pos.y)}  Grid: ${snap(pos.x)}, ${snap(pos.y)}`;

    if (isDragging && rubberBand) {
        const sx = snap(pos.x);
        const sy = snap(pos.y);
        const x = Math.min(dragStartX, sx);
        const y = Math.min(dragStartY, sy);
        const w = Math.max(GRID, Math.abs(sx - dragStartX));
        const h = Math.max(GRID, Math.abs(sy - dragStartY));
        rubberBand.style.cssText = `left:${x}px;top:${y}px;width:${w}px;height:${h}px;`;
    }

    if (isDragging && dragItem) {
        const nx = snap(pos.x - dragOffX);
        const ny = snap(pos.y - dragOffY);
        dragItem.data.x = Math.max(0, Math.min(WORLD_SIZE, nx));
        dragItem.data.y = Math.max(0, Math.min(WORLD_SIZE, ny));
        renderItem(dragItem.data);
        if (selectedItem && selectedItem.data === dragItem.data) showProps(dragItem.data);
    }
});

gameWorld.addEventListener('mouseup', e => {
    if (rubberBand) {
        const pos = clientToWorld(e.clientX, e.clientY);
        const sx = snap(pos.x);
        const sy = snap(pos.y);
        const x = Math.min(dragStartX, sx);
        const y = Math.min(dragStartY, sy);
        const w = Math.max(GRID, Math.abs(sx - dragStartX));
        const h = Math.max(GRID, Math.abs(sy - dragStartY));
        if (w >= GRID && h >= GRID) {
            addItem({ type: 'wall', x, y, width: w, height: h });
        }
        rubberBand.remove();
        rubberBand = null;
    }
    isDragging = false;
    dragItem = null;
});

// Keyboard
document.addEventListener('keydown', e => {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedItem) {
            removeItem(selectedItem.data);
            e.preventDefault();
        }
    }
    if (e.key === '1') setTool('select');
    if (e.key === '2') setTool('wall');
    if (e.key === '3') setTool('chest');
    if (e.key === '4') setTool('monster');
    if (e.key === '5') setTool('exit');
    if (e.key === '6') setTool('start');
});

function updateInfo() {
    infoItems.textContent = `Walls: ${mapData.walls.length} | Chests: ${mapData.chests.length} | Monsters: ${mapData.monsterSpawns.length}`;
}

function setStatus(msg) {
    statusEl.textContent = msg;
}

// Camera
function centerCamera() {
    const scale = Math.min(window.innerWidth / 800, window.innerHeight / 900);
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    gameWorld.style.transform = `translate(${cx}px, ${cy}px) scale(${scale}) translate(${-WORLD_SIZE / 2}px, ${-WORLD_SIZE / 2}px)`;
}

window.addEventListener('resize', centerCamera);
centerCamera();

// Save / Load / New
document.getElementById('btn-new').addEventListener('click', () => {
    if (!confirm('Clear the map? Unsaved changes will be lost.')) return;
    clearAll();
    mapData = {
        name: '',
        level: Number(levelInput.value) || 1,
        playerStart: { x: 2500, y: 2500 },
        walls: [],
        chests: [],
        monsterSpawns: [],
        exit: null
    };
    addItem({ type: 'start', x: mapData.playerStart.x, y: mapData.playerStart.y });
    setStatus('New map');
});

document.getElementById('btn-save').addEventListener('click', async () => {
    mapData.name = nameInput.value;
    mapData.level = Number(levelInput.value) || 1;
    const payload = {
        level: mapData.level,
        name: mapData.name,
        data: {
            playerStart: mapData.playerStart,
            walls: mapData.walls.map(w => ({ x: w.x, y: w.y, width: w.width, height: w.height })),
            chests: mapData.chests.map(c => ({ x: c.x, y: c.y })),
            monsterSpawns: mapData.monsterSpawns.map(m => ({ x: m.x, y: m.y, count: m.count })),
            exit: mapData.exit ? { x: mapData.exit.x, y: mapData.exit.y, targetLevel: mapData.exit.targetLevel } : null
        }
    };
    setStatus('Saving...');
    try {
        const res = await fetch('/maps', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error((await res.json()).error);
        setStatus('Saved!');
        setTimeout(() => setStatus('Ready'), 2000);
    } catch (e) {
        setStatus('Error: ' + e.message);
    }
});

document.getElementById('btn-load').addEventListener('click', async () => {
    const level = Number(levelInput.value) || 1;
    setStatus('Loading...');
    try {
        const res = await fetch(`/maps/${level}`);
        if (res.status === 404) {
            setStatus('Map not found — create a new one');
            return;
        }
        if (!res.ok) throw new Error((await res.json()).error);
        const row = await res.json();
        const d = row.data;
        clearAll();
        mapData = {
            name: row.name || '',
            level: row.level,
            playerStart: d.playerStart || { x: 2500, y: 2500 },
            walls: [],
            chests: [],
            monsterSpawns: [],
            exit: null
        };
        if (d.walls) d.walls.forEach(w => addItem({ type: 'wall', x: w.x, y: w.y, width: w.width, height: w.height }));
        if (d.chests) d.chests.forEach(c => addItem({ type: 'chest', x: c.x, y: c.y }));
        if (d.monsterSpawns) d.monsterSpawns.forEach(m => addItem({ type: 'monster', x: m.x, y: m.y, count: m.count }));
        if (d.exit) addItem({ type: 'exit', x: d.exit.x, y: d.exit.y, targetLevel: d.exit.targetLevel });
        addItem({ type: 'start', x: mapData.playerStart.x, y: mapData.playerStart.y });
        nameInput.value = mapData.name;
        levelInput.value = mapData.level;
        setStatus('Loaded level ' + level);
    } catch (e) {
        setStatus('Error: ' + e.message);
    }
});

function clearAll() {
    document.querySelectorAll('.wall, .chest, .monster-spawn, .exit').forEach(el => el.remove());
    const ps = document.querySelector('.player-start');
    if (ps) ps.remove();
    deselectAll();
    mapData = { walls: [], chests: [], monsterSpawns: [], exit: null, playerStart: { x: 2500, y: 2500 } };
}

// Initial: show player start marker
addItem({ type: 'start', x: mapData.playerStart.x, y: mapData.playerStart.y });
setStatus('Ready — start building!');
