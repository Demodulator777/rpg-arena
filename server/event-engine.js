const { simulateRound, buildCombatFighter, DUNGEON_MONSTER_POOL, DUNGEON_MINI_BOSS_POOL, buildRegularMonsterForFloor, buildMiniBossForFloor } = require('./routes');

// Trial of the Arcane — deterministic dungeon-style event floor.
// Every player sees the IDENTICAL 10-room floor (fixed seed): each room
// holds 1 mini-boss + 2 mobs at fixed scaling, and the last room is a free
// "special event boss" (no token cost). Combat uses the fixed 4 champion
// trial party (server/trial-engine.js), so monster power is tuned ~1.6x
// rather than the old 5x that was balanced for a geared player character.

const EVENT_ATTEMPT_LIMIT = 10;
const EVENT_BASE_FLOOR = 5;      // monster stat reference floor before the power multiplier
const EVENT_POWER_MULT = 1.6;
const EVENT_ROOM_COUNT = 10;     // rooms; the boss is the last one
const EVENT_BOSS_INDEX = EVENT_ROOM_COUNT - 1;

function findPoolItem(pool, needle) {
    return pool.find(m => m.id === needle || m.name === needle) || null;
}

// Apply the event power multiplier to a monster stat block.
function scaleMonster(m) {
    return {
        ...m,
        hp: Math.round(Number(m.hp || 0) * EVENT_POWER_MULT),
        atk: Math.round(Number(m.atk || 0) * EVENT_POWER_MULT),
        def: Math.round(Number(m.def || 0) * EVENT_POWER_MULT),
    };
}

// Deterministic monster selection for a room (pure index math — identical for everyone).
function buildEventRoomMonsters(roomIndex) {
    const regularPool = (DUNGEON_MONSTER_POOL || []).filter(m => !m.isMiniBoss);
    const miniPool = DUNGEON_MINI_BOSS_POOL || [];
    const mbTemplate = findPoolItem(miniPool, miniPool[roomIndex % miniPool.length]?.id);
    const m1Template = findPoolItem(regularPool, regularPool[roomIndex % regularPool.length]?.id);
    const m2Template = findPoolItem(regularPool, regularPool[(roomIndex * 2 + 1) % regularPool.length]?.id);

    const monsters = [];
    if (mbTemplate) {
        const mb = buildMiniBossForFloor(mbTemplate.id, EVENT_BASE_FLOOR);
        if (mb) monsters.push({ ...scaleMonster(mb), isMiniBoss: true });
    }
    const m1 = m1Template ? buildRegularMonsterForFloor(m1Template.id, EVENT_BASE_FLOOR) : null;
    if (m1) monsters.push({ ...scaleMonster(m1), isMiniBoss: false });
    const m2 = m2Template ? buildRegularMonsterForFloor(m2Template.id, EVENT_BASE_FLOOR) : null;
    if (m2 && m2.id !== m1?.id) monsters.push({ ...scaleMonster(m2), isMiniBoss: false });

    return monsters.map(m => ({
        ...m,
        currentHp: m.hp,
        maxHp: m.hp,
        lastKilled: null,
        stolenItems: [],
        tokenCost: 0,
        steal: !!m.steal,
    }));
}

function buildEventBoss() {
    return {
        id: 'event_boss_arcane',
        name: 'Arcane Sovereign',
        icon: '👁️',
        image: '/images/boss/sovereign.jpg',
        // Trial-tuned: the boss is NOT scaled by POWER_MULT. The fixed 4-champion
        // trial party (Pyra/Frost/Vorn/Aria) beats ~2.6k HP with freeze + guard +
        // heals; any more and a solo heavy hitter can't outlast it.
        hp: 2600,
        maxHp: 2600,
        currentHp: 2600,
        atk: 130,
        def: 70,
        steal: false,
        isBoss: true,
        isMiniBoss: false,
        tokenCost: 0,
        lastKilled: null,
        stolenItems: [],
        lore: 'A demigod of the Arcane, warped by its long imprisonment in the realm between worlds. The Trial\'s final guardian — defeat it to claim the leaderboard crown.',
    };
}

// Deterministic straight floor: rooms 0..9 in order, each connected to its neighbors.
// Room 0 is the entrance, room 9 is the boss room.
function generateEventFloor() {
    const rooms = [];
    for (let idx = 0; idx < EVENT_ROOM_COUNT; idx++) {
        const isStart = idx === 0;
        const isBoss = idx === EVENT_BOSS_INDEX;
        const connections = [];
        if (idx > 0) connections.push(idx - 1);
        if (idx < EVENT_ROOM_COUNT - 1) connections.push(idx + 1);
        rooms.push({
            id: idx,
            gridIdx: idx,
            x: idx,
            y: 0,
            isBoss,
            isStart,
            isMiniBoss: false,
            isArea: false,
            connections,
            type: isBoss ? 'boss' : isStart ? 'start' : 'corridor',
            monsters: isStart || isBoss ? [] : buildEventRoomMonsters(idx),
            looted: false,
            visual: null,
        });
    }
    rooms[EVENT_BOSS_INDEX].monsters = [buildEventBoss()];
    return rooms;
}

let _cachedFloor = null;
function getEventFloor() {
    if (!_cachedFloor) _cachedFloor = generateEventFloor();
    return _cachedFloor;
}

function getSizedEventFloor() {
    return getEventFloor().slice();
}

// Dedicated fighter builder for event (5x stats)
async function buildEventFighter(db, char, isPlayer) {
    const f = await buildCombatFighter(db, char);
    if (!isPlayer) {
        f.str *= 5; f.def *= 5; f.agi *= 5; f.mag *= 5; f.vit *= 5; f.hp *= 5; f.hp_max *= 5;
    }
    return f;
}

module.exports = {
    generateEventFloor,
    getEventFloor,
    getSizedEventFloor,
    buildEventFighter,
    buildEventBoss,
    buildEventRoomMonsters,
    EVENT_ATTEMPT_LIMIT,
    EVENT_ROOM_COUNT,
    EVENT_BOSS_INDEX,
};