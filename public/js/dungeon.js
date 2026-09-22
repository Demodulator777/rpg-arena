// ============================================================
//  dungeon.js  –  Mid-Evil: Battle Arena Dungeon System
//  Requires: global `state` object,
//  `api(method, path, body)` from app.js, `showTab(tab)` helper
// ============================================================

(function (global) {
  'use strict';

  // ── Translation helper (PT when app is in PT mode, else EN) ──────────────
  const _pt = (ptText, enText) =>
    (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG === 'pt') ? ptText : enText;

  // ── Combat log translator: server sends battle-log lines in EN; convert to PT ──
  function _ptCombat(text) {
    if (!text || (typeof CURRENT_LANG !== 'undefined' && CURRENT_LANG !== 'pt')) return text;
    const exact = {
      '💨 You attempt to flee...': '💨 Você tenta fugir...',
      '✅ Escape successful.': '✅ Fuga bem-sucedida.',
      '✅ Escape successful. You can leave now, or keep fighting.': '✅ Fuga bem-sucedida. Você pode sair agora, ou continuar lutando.',
      '⚠️ Escape failed! The enemies strike!': '⚠️ Fuga falhou! Os inimigos atacam!',
      '⚠️ Escape failed! The Crawler strikes!': '⚠️ Fuga falhou! O Devorador ataca!',
      'The Crawler is already on you!': 'O Devorador já está em cima de você!',
      'The Crawler drops from the dark and pins your escape route!': 'O Devorador surge das sombras e bloqueia sua rota de fuga!',
      '⚠️ Boss battle begins!': '⚠️ A batalha do chefe começa!',
      'Enemies close in...': 'Os inimigos se aproximam...',
      '🏆 Against all odds, you bring down The Crawler!': '🏆 Contra todas as probabilidades, você derruba o Devorador!'
    };
    if (exact[text]) return exact[text];

    let m = text.match(/^✅ (.+) defeated!$/);
    if (m) return `✅ ${m[1]} derrotado!`;

    m = text.match(/^(💥 )?(.+) hits you for (\d+)!$/);
    if (m) return `${m[1] || ''}${m[2]} acerta você com ${m[3]}!`;

    m = text.match(/^You strike (.+) for (\d+) damage!$/);
    if (m) return `Você ataca ${m[1]} causando ${m[2]} de dano!`;

    m = text.match(/^🛡️ You take (\d+) damage\.$/);
    if (m) return `🛡️ Você sofre ${m[1]} de dano.`;

    m = text.match(/^(⚔️|💥|⚡) (Strike|Burst|Ultimate)( \[(PERFECT!|GOOD|MISS)\])? → (.+) for (\d+) damage!$/);
    if (m) {
      const atkPt = { 'Strike': 'Ataque', 'Burst': 'Rajada', 'Ultimate': 'Supremo' }[m[2]];
      const zonePt = { 'PERFECT!': ' [PERFEITO!]', 'GOOD': ' [BOM]', 'MISS': ' [ERROU]' }[m[4]] || '';
      return `${m[1]} ${atkPt}${zonePt} → ${m[5]} por ${m[6]} de dano!`;
    }

    m = text.match(/^🔥 (.+) enrages as a HP bar shatters!$/);
    if (m) return `🔥 ${m[1]} fica enfurecido ao quebrar uma barra de PV!`;

    m = text.match(/^💢 (.+) uses SPECIAL ATTACK for (\d+)!$/);
    if (m) return `💢 ${m[1]} usa ATAQUE ESPECIAL causando ${m[2]}!`;

    // ── Trial of the Arcane battle log (server/trial-engine.js + event-routes) ──
    const trialExact = {
      'The Trial begins!': 'O Trial começa!',
      '⚔️ Final Blow! Center the strike to multiply this battle\'s points!': '⚔️ Golpe Final! Acerte o centro para multiplicar os pontos desta batalha!',
      'Invalid champion.': 'Campeão inválido.',
      'Unknown ability.': 'Habilidade desconhecida.',
      'Ability not implemented.': 'Habilidade não implementada.'
    };
    if (trialExact[text]) return trialExact[text];

    // Battle Focus result lines (trial-engine resolveTrialRound)
    m = text.match(/^(🌟|💤) Battle Focus ×([\d.]+) — damage and score (boosted|reduced) for this battle(!|\.)$/);
    if (m) return `${m[1]} Foco de Batalha ×${m[2]} — dano e pontuação ${m[3] === 'boosted' ? 'amplificados' : 'reduzidos'} nesta batalha${m[4]}`;

    m = text.match(/^🌟 Final Blow ×([\d.]+) — \+(\d+) bonus battle points!$/);
    if (m) return `🌟 Golpe Final ×${m[1]} — +${m[2]} pontos de batalha de bônus!`;

    m = text.match(/^🌟 Final Blow ×([\d.]+) — (\d+) battle points lost\.$/);
    if (m) return `🌟 Golpe Final ×${m[1]} — ${m[2]} pontos de batalha perdidos.`;

    // Elemental combo points (Vaporize! / Shatter! / Thermal Shock!)
    const comboLabelPT = { 'Vaporize!': 'Vaporizar!', 'Shatter!': 'Estilhaçar!', 'Thermal Shock!': 'Choque Térmico!' };
    m = text.match(/^🔀 (.+?) \+(\d+) pts(?: \((.+)\))?!$/);
    if (m) return `🔀 ${comboLabelPT[m[1]] || m[1]} +${m[2]} pts${m[3] ? ` (${m[3]})` : ''}!`;

    // Champion attacks: "🔥 Pyra Fireball → Goblin for 40 damage!" (+ status suffixes)
    const abilityNamePT = {
      'Fireball': 'Bola de Fogo', 'Inferno': 'Inferno', 'Arc Bolt': 'Raio Arcano',
      'Frost Strike': 'Golpe Gélido', 'Smite': 'Castigo', 'Deep Freeze': 'Congelamento Profundo',
      'Blizzard': 'Nevasca', 'Shield Bash': 'Golpe de Escudo'
    };
    const suffixPT = (s) => s
      .replace('& BURN (2 rounds)!', 'e QUEIMADURA (2 rodadas)!')
      .replace('& FREEZE (2 rounds)!', 'e CONGELAMENTO (2 rodadas)!')
      .replace('& BURN!', 'e QUEIMADURA!')
      .replace('& FREEZE (6s)!', 'e CONGELAMENTO (6s)!')
      .replace('& FREEZE!', 'e CONGELAMENTO!');
    m = text.match(/^(.+?) (.+?) (Fireball|Inferno|Arc Bolt|Frost Strike|Smite|Deep Freeze|Blizzard|Shield Bash) → (.+?) for (\d+) damage(!| & BURN \(2 rounds\)!| & FREEZE \(2 rounds\)!| & BURN!| & FREEZE \(6s\)!| & FREEZE!| \(\+120 shield\)!)$/);
    if (m) {
      const tailPT = (m[6] === ' (+120 shield)!' ? ' (+120 de escudo)!' : suffixPT(m[6]));
      return `${m[1]} ${m[2]} ${abilityNamePT[m[3]]} → ${m[4]} causando ${m[5]} de dano${tailPT}`;
    }

    m = text.match(/^🌟 Radiant channel → (.+?) for (\d+) damage!$/);
    if (m) return `🌟 Canal Radiante → ${m[1]} causando ${m[2]} de dano!`;

    m = text.match(/^✨ (.+) revived with (\d+) HP!$/);
    if (m) return `✨ ${m[1]} reviveu com ${m[2]} de PV!`;

    m = text.match(/^✨ (.+) restored to (\d+) HP\.$/);
    if (m) return `✨ ${m[1]} está com ${m[2]} de PV.`;

    m = text.match(/^(.+) is down and cannot act\.$/);
    if (m) return `${m[1]} está caído e não pode agir.`;

    m = text.match(/^(.+) already acted this turn\.$/);
    if (m) return `${m[1]} já agiu neste turno.`;

    m = text.match(/^(.+) holds back this round\.$/);
    if (m) return `${m[1]} aguarda esta rodada.`;

    m = text.match(/^Not enough energy \(needs (\d+)\)\.$/);
    if (m) return `Energia insuficiente (precisa de ${m[1]}).`;

    m = text.match(/^(.+?)'s (.+?) is recharging \((\d+)s left\)\.$/);
    if (m) return `O ${m[2]} de ${m[1]} está recarregando (${m[3]}s restantes).`;

    m = text.match(/^(.+?)'s (.+?) is still recharging \((\d+) actions? left\)\.$/);
    if (m) return `O ${m[2]} de ${m[1]} ainda está recarregando (${m[3]} ${m[3] > 1 ? 'ações restantes' : 'ação restante'}).`;

    m = text.match(/^⛨ (.+) guards — 50% less damage for 9s\.$/);
    if (m) return `⛨ ${m[1]} protege-se — 50% menos dano por 9s.`;

    m = text.match(/^⛨ (.+) guards — 50% less damage this round\.$/);
    if (m) return `⛨ ${m[1]} protege-se — 50% menos dano nesta rodada.`;

    m = text.match(/^📯 (.+) roars — party \+35% damage for 9s!$/);
    if (m) return `📯 ${m[1]} ruge — grupo +35% de dano por 9s!`;

    m = text.match(/^📯 (.+) roars — party \+35% damage for 3 rounds!$/);
    if (m) return `📯 ${m[1]} ruge — grupo +35% de dano por 3 rodadas!`;

    m = text.match(/^🧊 (.+) thawed out!$/);
    if (m) return `🧊 ${m[1]} descongelou!`;

    m = text.match(/^☠️ (.+) is down!$/);
    if (m) return `☠️ ${m[1]} caiu!`;

    m = text.match(/^(.+?)'s ultimate needs a full energy bar\.$/);
    if (m) return `O ultimate de ${m[1]} precisa da barra cheia.`;

    m = text.match(/^🔥 (.+) burns for (\d+) damage\.$/);
    if (m) return `🔥 ${m[1]} queima com ${m[2]} de dano.`;

    m = text.match(/^🧊 (.+) is frozen and cannot strike!$/);
    if (m) return `🧊 ${m[1]} está congelado e não pode atacar!`;

    m = text.match(/^💥 (.+) strikes (.+) for (\d+) damage!$/);
    if (m) return `💥 ${m[1]} golpeia ${m[2]} causando ${m[3]} de dano!`;

    m = text.match(/^💀 (.+) was defeated!$/);
    if (m) return `💀 ${m[1]} foi derrotado!`;

    return text;
  }

  // ── API Wrapper (uses your existing api function) ──────────────────────────
  const apiFetch = global.api || (async () => {
    console.error('[Dungeon] api not available!');
    return { success: false, error: 'api not available' };
  });

  // ── Constants ──────────────────────────────────────────────
  const MP_PER_TOKEN      = 20;
  const TOKENS_PER_RUN    = 50;
  const MONSTER_RESPAWN_H = 48;
  const TRAVEL_BASE_MS    = 200;
  const TRAVEL_DISCOVERED_MS = 200;
  const RUN_ESCAPE_CHANCE = 0.75;
  const ROOMS_PER_FLOOR   = 100;
  const DIR_IMGS = { up: 'uparrow.png', down: 'downarrow.png', left: 'leftarrow.png', right: 'rightarrow.png' };

  // ── Dungeon Visuals ─────────────────────────────────────────
  const DUNGEON_VISUALS = {
    start: {
      image: '/images/dungeon/entrance.jpg',
      description: _pt("Você está na entrada de uma torre escura e ameaçadora. Runas antigas pulsam com luz fraca nas pedras desgastadas.", "You stand at the entrance of a dark, foreboding tower. Ancient runes pulse with faint light on the weathered stones.")
    },
    corridor: {
      image: '/images/dungeon/corridor.jpg',
      description: _pt("Um corredor estreito se estende diante de você. Tochas oscilam nas paredes, projetando sombras dançantes.", "A narrow passage stretches before you. Torches flicker on the walls, casting dancing shadows.")
    },
    area: {
      image: '/images/dungeon/stairs.jpg',
      description: _pt("Uma câmara aberta onde múltiplos caminhos convergem. Arcos de pedra levam em várias direções.", "An open chamber where multiple paths converge. Stone arches lead in several directions.")
    },
    treasure: {
      image: '/images/dungeon/treasure.jpg',
      description: _pt("Um reflexo de ouro chama sua atenção! Um baú ornamentado está no centro desta câmara.", "A glint of gold catches your eye! An ornate chest sits in the center of this chamber.")
    },
    miniboss: {
      image: '/images/dungeon/boss-chamber.jpg',
      description: _pt("Um guardião poderoso bloqueia esta passagem. Derrote-o para prosseguir.", "A powerful guardian blocks this passage. Defeat it to proceed.")
    },
    boss: {
      image: '/images/dungeon/boss-chamber.jpg',
      description: _pt("O ar fica pesado. Grandes colunas se erguem até o teto. Esta é a sala do trono do mestre do andar.", "The air grows heavy. Grand pillars rise to the ceiling. This is the throne room of the floor's master.")
    }
  };

  // ── Adventurer's Guild ─────────────────────────────────────────
const GUILD_EXCHANGES = [
  { id: 'exchange_gold', name: _pt('Trocar Ouro da Masmorra', 'Exchange Dungeon Gold'), icon: '💰',
    cost: { dungeonGold: 100 }, reward: { gold: 80, reputation: 1 },
    desc: _pt('Converta 100 de ouro da masmorra em 80 de ouro real + 1 ponto de reputação', 'Convert 100 dungeon gold into 80 real gold + 1 reputation point'), minRep: 0 },
  { id: 'buy_elem_common', name: _pt('Comprar Elemento Comum', 'Buy Common Element'), icon: '🔥',
    cost: { dungeonGold: 40 }, reward: { elemTier: 'common' },
    desc: _pt('Compre 1 material elemental comum aleatório (3 XP)', 'Purchase 1 random common elemental material (3 XP)'), minRep: 0 },
  { id: 'buy_elem_uncommon', name: _pt('Comprar Elemento Incomum', 'Buy Uncommon Element'), icon: '💧',
    cost: { dungeonGold: 100 }, reward: { elemTier: 'uncommon' },
    desc: _pt('Compre 1 material elemental incomum aleatório (8 XP)', 'Purchase 1 random uncommon elemental material (8 XP)'), minRep: 10 },
  { id: 'buy_elem_rare', name: _pt('Comprar Elemento Raro', 'Buy Rare Element'), icon: '⚡',
    cost: { dungeonGold: 180 }, reward: { elemTier: 'rare' },
    desc: _pt('Compre 1 material elemental raro aleatório (15 XP)', 'Purchase 1 random rare elemental material (15 XP)'), minRep: 50 },
  { id: 'buy_elem_epic', name: _pt('Comprar Elemento Épico', 'Buy Epic Element'), icon: '🌪️',
    cost: { dungeonGold: 300 }, reward: { elemTier: 'epic' },
    desc: _pt('Compre 1 material elemental épico aleatório (25 XP)', 'Purchase 1 random epic elemental material (25 XP)'), minRep: 200 },
  { id: 'buy_elem_legendary', name: _pt('Comprar Elemento Lendário', 'Buy Legendary Element'), icon: '👑',
    cost: { dungeonGold: 500 }, reward: { elemTier: 'legendary' },
    desc: _pt('Compre 1 material elemental lendário aleatório (45 XP)', 'Purchase 1 random legendary elemental material (45 XP)'), minRep: 500 },
  { id: 'swap_elem_common', name: _pt('Trocar Elementos Comuns', 'Swap Common Elements'), icon: '🔄',
    cost: { tier_common: 2 }, reward: { elemTier: 'common' },
    desc: _pt('Troque 2 materiais elementais comuns por 1 comum aleatório', 'Trade 2 common elemental materials for 1 random common'), minRep: 0 },
  { id: 'swap_elem_uncommon', name: _pt('Trocar Elementos Incomuns', 'Swap Uncommon Elements'), icon: '🔄',
    cost: { tier_uncommon: 2 }, reward: { elemTier: 'uncommon' },
    desc: _pt('Troque 2 materiais elementais incomuns por 1 incomum aleatório', 'Trade 2 uncommon elemental materials for 1 random uncommon'), minRep: 10 },
  { id: 'swap_elem_rare', name: _pt('Trocar Elementos Raros', 'Swap Rare Elements'), icon: '🔄',
    cost: { tier_rare: 2 }, reward: { elemTier: 'rare' },
    desc: _pt('Troque 2 materiais elementais raros por 1 raro aleatório', 'Trade 2 rare elemental materials for 1 random rare'), minRep: 50 },
  { id: 'swap_elem_epic', name: _pt('Trocar Elementos Épicos', 'Swap Epic Elements'), icon: '🔄',
    cost: { tier_epic: 2 }, reward: { elemTier: 'epic' },
    desc: _pt('Troque 2 materiais elementais épicos por 1 épico aleatório', 'Trade 2 epic elemental materials for 1 random epic'), minRep: 200 },
  { id: 'swap_elem_legendary', name: _pt('Trocar Elementos Lendários', 'Swap Legendary Elements'), icon: '🔄',
    cost: { tier_legendary: 2 }, reward: { elemTier: 'legendary' },
    desc: _pt('Troque 2 materiais elementais lendários por 1 lendário aleatório', 'Trade 2 legendary elemental materials for 1 random legendary'), minRep: 500 },
];

const ELEM_TIER_INFO = {
  common: { name: 'Common', xp: 3, cost: 40, elements: ['pyro', 'water', 'electro', 'wind'] },
  uncommon: { name: 'Uncommon', xp: 8, cost: 100, elements: ['pyro', 'water', 'electro', 'wind'] },
  rare: { name: 'Rare', xp: 15, cost: 180, elements: ['pyro', 'water', 'electro', 'wind'] },
  epic: { name: 'Epic', xp: 25, cost: 300, elements: ['pyro', 'water', 'electro', 'wind'] },
  legendary: { name: 'Legendary', xp: 45, cost: 500, elements: ['pyro', 'water', 'electro', 'wind'] },
};

const ELEM_TIER_ITEMS = {
  common: ['dgn_pyro_cinder', 'dgn_water_droplet', 'dgn_electro_spark', 'dgn_wind_feather'],
  uncommon: ['dgn_pyro_ember', 'dgn_water_crystal', 'dgn_electro_shard', 'dgn_wind_whisper'],
  rare: ['dgn_pyro_core', 'dgn_water_core', 'dgn_electro_core', 'dgn_wind_core'],
  epic: ['dgn_pyro_essence', 'dgn_water_essence', 'dgn_electro_essence', 'dgn_wind_essence'],
  legendary: ['dgn_pyro_primordial', 'dgn_water_primordial', 'dgn_electro_primordial', 'dgn_wind_primordial'],
};

// Guild reputation levels
const GUILD_RANKS = [
  { rank: 0, name: 'Novice', reputationNeeded: 0, discount: 0 },
  { rank: 1, name: 'Apprentice', reputationNeeded: 10, discount: 5 },
  { rank: 2, name: 'Journeyman', reputationNeeded: 50, discount: 10 },
  { rank: 3, name: 'Expert', reputationNeeded: 200, discount: 15 },
  { rank: 4, name: 'Master', reputationNeeded: 500, discount: 20 },
  { rank: 5, name: 'Grand Master', reputationNeeded: 1000, discount: 25 },
];

const _guildRankName = (name) => _pt({
  Novice: 'Novato', Apprentice: 'Aprendiz', Journeyman: 'Jornaleiro',
  Expert: 'Especialista', Master: 'Mestre', 'Grand Master': 'Grão-Mestre'
}[name] || name, name);

// Add to state
// Add to D object:
// guildReputation: 0,

  // ── Infinite Floor Tower ─────────────────────────────────
  const DUNGEON = { id:'tower', name:'The Endless Tower', icon:'🗼', desc:'An infinite tower of darkness. Clear each floor to ascend.' };

  const FLOOR_THEMES = [
    { theme:'#7c3aed', themeGlow:'rgba(124,58,237,0.35)', name:'Crypt Depths'    },
    { theme:'#dc2626', themeGlow:'rgba(220,38,38,0.35)',  name:'Volcanic Halls'  },
    { theme:'#1e3a5f', themeGlow:'rgba(30,58,95,0.4)',    name:'Abyssal Void'    },
    { theme:'#065f46', themeGlow:'rgba(6,95,70,0.4)',     name:'Cursed Jungle'   },
    { theme:'#92400e', themeGlow:'rgba(146,64,14,0.4)',   name:'Celestial Ruins' },
  ];

  // ── Mini-Boss Pool ──────────────────────────────────────────
const MINI_BOSS_POOL = [
    { name:'Shadow Stalker', icon:'🐺', baseHp:400, baseAtk:55, baseDef:25, tokenCost:5,  minFloor:5,  image:'/images/dungeon/monsters/shadow_stalker.jpg', lore:'The Shadow Stalker is a tough dog-like creature that attacks from the shadows.' },
    { name:'Crystal Golem',  icon:'💎', baseHp:600, baseAtk:40, baseDef:45, tokenCost:6,  minFloor:15, image:'/images/dungeon/monsters/crystal_golem.jpg', lore:'Crystal Golems are Hard as Diamond and hit with the force of the mountain.' },
    { name:'Flame Revenant', icon:'🔥', baseHp:350, baseAtk:70, baseDef:20, tokenCost:7,  minFloor:20, image:'/images/dungeon/monsters/flame_revenant.jpg', lore:'Flame Revenants are the burning echoes of fallen pyromancers, wreathed in unquenchable fire that hungers for living kindling.' },
    { name:'Frost Wyrmling', icon:'❄️', baseHp:450, baseAtk:60, baseDef:30, tokenCost:8,  minFloor:25, image:'/images/dungeon/monsters/frost_wyrmling.jpg', lore:'Frost Wyrmlings are juvenile dragons born in the deepest caverns, where the cold itself whispers ancient draconic secrets.' },
    { name:'Void Stalker',   icon:'🌑', baseHp:500, baseAtk:75, baseDef:28, tokenCost:9,  minFloor:30, image:'/images/dungeon/monsters/void_stalker.jpg', lore:'Void Stalkers are hunters from the space between worlds, phasing in and out of reality to corner their prey.' },
    { name:'Doom Knight',    icon:'⚔️', baseHp:700, baseAtk:65, baseDef:50, tokenCost:10, minFloor:35, image:'/images/dungeon/monsters/doom_knight.jpg', lore:'Doom Knights are oath-bound to a forgotten god of war, their armor fused to flesh in an eternal pact of slaughter.' },
];

const CRAWLER_BASE = {
    id: 'the_crawler',
    name: 'The Crawler',
    icon: '🕷️',
    image: '/images/dungeon/monsters/crawler.jpg',
};

function getMiniBossForFloor(floor) {
    const available = MINI_BOSS_POOL.filter(m => m.minFloor <= floor);
    if (available.length === 0) return null;
    const miniBoss = available[rand(0, available.length - 1)];
    const scale = 1
        + Math.max(0, floor - miniBoss.minFloor) * 0.12
        + Math.max(0, floor - 1) * 0.035;
    
    return {
        name: miniBoss.name,
        icon: miniBoss.icon,
        image: miniBoss.image,
        hp: Math.round(miniBoss.baseHp * scale * 2),
        atk: Math.round(miniBoss.baseAtk * scale),
        def: Math.round(miniBoss.baseDef * scale * 2),
        tokenCost: 0,
        isMiniBoss: true,
        currentHp: Math.round(miniBoss.baseHp * scale * 2),
        maxHp: Math.round(miniBoss.baseHp * scale * 2),
        lastKilled: null,
        stolenItems: [],
        lore: miniBoss.lore,
    };
}

function rebalanceMiniBossMonster(monster, floor) {
    if (!monster || !monster.isMiniBoss) return monster;
    if (Number(monster.rebalanceVersion || 0) >= 1) return monster;

    const template = MINI_BOSS_POOL.find(entry =>
        entry.name === monster.name ||
        String(entry.name || '').toLowerCase().replace(/[^\w]+/g, '_') === monster.id
    );
    if (!template) {
        if (!monster.image) return hydrateMonsterImage({ ...monster, rebalanceVersion: 1 });
        return { ...monster, rebalanceVersion: 1 };
    }

    const safeFloor = Math.max(1, Number(floor) || 1);
    const scale = 1
        + Math.max(0, safeFloor - template.minFloor) * 0.12
        + Math.max(0, safeFloor - 1) * 0.035;

    const newMaxHp = Math.round(template.baseHp * scale * 2);
    const newDef = Math.round(template.baseDef * scale * 2);
    const newAtk = Math.round(template.baseAtk * scale);
    const previousMax = Math.max(1, Number(monster.maxHp || monster.hp || newMaxHp));
    const hpRatio = Math.max(0, Math.min(1, Number(monster.currentHp ?? previousMax) / previousMax));
    const nextCurrentHp = monster.lastKilled ? 0 : Math.max(1, Math.round(newMaxHp * hpRatio));

    return {
        ...monster,
        image: monster.image || template.image,
        atk: newAtk,
        def: newDef,
        hp: newMaxHp,
        maxHp: newMaxHp,
        currentHp: nextCurrentHp,
        tokenCost: 0,
        rebalanceVersion: 1,
    };
}

function normalizeMiniBossRooms(rooms, floor) {
    if (!Array.isArray(rooms)) return [];
    return rooms.map(room => {
        if (!Array.isArray(room.monsters) || !room.monsters.length) return room;
        const now = Date.now();
        const respawnMs = MONSTER_RESPAWN_H * 3600000;
        const monsters = room.monsters.map(monster => {
            // If a monster was killed long ago, treat it as respawned so it doesn't render at 0 HP.
            // (Some older saved states keep lastKilled/currentHp=0 even after the respawn window.)
            let lastKilled = monster?.lastKilled ?? null;
            if (typeof lastKilled === 'number' && lastKilled > 0 && lastKilled < 1000000000000) {
                // seconds -> ms
                lastKilled = lastKilled * 1000;
            }
            const hydrated = hydrateMonsterImage(monster || {});
            if (typeof lastKilled === 'number' && lastKilled > 0 && (now - lastKilled) >= respawnMs) {
                const maxHp = Number(monster?.maxHp || monster?.hp || 1);
                return rebalanceMiniBossMonster({
                    ...hydrated,
                    lastKilled: null,
                    maxHp,
                    currentHp: Math.max(1, maxHp),
                }, floor);
            }
            return rebalanceMiniBossMonster(hydrated, floor);
        });
        return { ...room, monsters };
    });
}

function hydrateMonsterImage(monster) {
    // Fix old image paths (miniboss*.jpg → monsters/*.jpg)
    const oldPath = monster.image && /\/images\/dungeon\/miniboss\d*\.jpg/i.test(monster.image);
    if (!monster.image || oldPath) {
        const id = monster.id || (monster.name || '').toLowerCase().replace(/[^\w]+/g, '_');
        const byName = (m) => (m.name || '').toLowerCase().replace(/[^\w]+/g, '_');
        const found = MONSTER_POOL.find(m => m.id === id)
            || MONSTER_POOL.find(m => byName(m) === id)
            || MINI_BOSS_POOL.find(m => byName(m) === id)
            || BOSS_POOL.find(m => byName(m) === id)
            || CRAWLER_BASE && byName(CRAWLER_BASE) === id && CRAWLER_BASE;
        if (found && found.image) return { ...monster, image: found.image };
    }
    return monster;
}

function normalizeRoomMonsters(rooms, floor) {
    if (!Array.isArray(rooms)) return [];
    const now = Date.now();
    const respawnMs = MONSTER_RESPAWN_H * 3600000;
    return rooms.map(room => {
        if (!room || !Array.isArray(room.monsters) || room.monsters.length === 0) return room;
        const monsters = room.monsters.map(monster => {
            if (!monster) return monster;

            let lastKilled = monster.lastKilled ?? null;
            if (typeof lastKilled === 'number' && lastKilled > 0 && lastKilled < 1000000000000) {
                // seconds -> ms
                lastKilled = lastKilled * 1000;
            }

            const maxHp = Number(monster.maxHp ?? monster.hp ?? 1);
            const currentHp = Number(monster.currentHp ?? maxHp);
            const hydrated = hydrateMonsterImage(monster);

            // If the respawn window elapsed, treat as alive again.
            if (typeof lastKilled === 'number' && lastKilled > 0 && (now - lastKilled) >= respawnMs) {
                return rebalanceMiniBossMonster({
                    ...hydrated,
                    lastKilled: null,
                    maxHp,
                    currentHp: Math.max(1, maxHp),
                }, floor);
            }

            // Guard against older saved states: monsters with 0 HP but no lastKilled would appear "alive".
            if (!lastKilled && currentHp <= 0) {
                return rebalanceMiniBossMonster({
                    ...hydrated,
                    lastKilled: now,
                    maxHp,
                    currentHp: 0,
                }, floor);
            }

            return rebalanceMiniBossMonster({ ...hydrated, lastKilled }, floor);
        });
        return { ...room, monsters };
    });
}

function getCrawlerForFloor(floor) {
    const boss = getBossForFloor(floor);
    // The Crawler is meant to be an "oh no" encounter: stronger than the floor boss.
    // Per balance: 2x HP and 2x DEF (relative to previous crawler tuning).
    const hpMult = 2.9 * 2;
    const defMult = 2.5 * 2;
    return {
        id: CRAWLER_BASE.id,
        name: CRAWLER_BASE.name,
        icon: CRAWLER_BASE.icon,
        image: CRAWLER_BASE.image,
        hp: Math.round(boss.hp * hpMult),
        atk: Math.round(boss.atk * 2.7),
        def: Math.round(boss.def * defMult),
        steal: false,
        isCrawler: true,
        lore: 'The Crawler is Doom manifest. A being of endless growth, it mimics the strength of its next meal to provide entertainment. Nothing escapes its hunt.',
        currentHp: Math.round(boss.hp * hpMult),
        maxHp: Math.round(boss.hp * hpMult),
        lastKilled: null,
        stolenItems: [],
    };
}

  const MONSTER_POOL = [
    { id:'skeleton',    name:'Skeleton Warrior', icon:'💀', image:'/images/dungeon/monsters/skeleton.jpg', hp:80,  atk:12, def:5,  steal:true,  minFloor:1,  lore:'Skeleton Warriors are basic dungeon fodder. Easy to put down, hard to keep down.' },
    { id:'ghost',       name:'Wailing Ghost',    icon:'👻', image:'/images/dungeon/monsters/ghost.jpg', hp:60,  atk:18, def:2,  steal:false, minFloor:1,  lore:'Wailing Ghosts are psychic entities, attacking the mind instead of the body.' },
    { id:'zombie',      name:'Rotting Zombie',   icon:'🧟', image:'/images/dungeon/monsters/zombie.jpg', hp:120, atk:8,  def:8,  steal:true,  minFloor:1,  lore:'Rotting Zombies are the direct refusal of the dungeon to waste perfectly good corrupted adventurers. Fight the remains of those before you!' },
    { id:'lich',        name:'Lich Apprentice',  icon:'🧙', image:'/images/dungeon/monsters/lich.jpg', hp:70,  atk:22, def:3,  steal:false, minFloor:3,  lore:'The Lich apprentice is weak but threatens with the power of the unholy arcane arts.' },
    { id:'fire_imp',    name:'Fire Imp',         icon:'😈', image:'/images/dungeon/monsters/fire_imp.jpg', hp:90,  atk:20, def:6,  steal:false, minFloor:3,  lore:'Fire Imps are infernal manifestations of demonic influence. Holy water is highly recommended.' },
    { id:'lava_golem',  name:'Lava Golem',       icon:'🗿', image:'/images/dungeon/monsters/lava_golem.jpg', hp:180, atk:14, def:22, steal:false, minFloor:5,  lore:'Lava Golems are Magma given form. Cooling them exposes just how brittle a foundation they have.' },
    { id:'salamander',  name:'Fire Salamander',  icon:'🦎', image:'/images/dungeon/monsters/salamander.jpg', hp:110, atk:25, def:8,  steal:true,  minFloor:5,  lore:'Fire Salamanders exist in the underground around lava pools. Peaceful until disturbed.' },
    { id:'pyromancer',  name:'Pyromancer Shade', icon:'🔥', image:'/images/dungeon/monsters/pyromancer.jpg', hp:85,  atk:32, def:4,  steal:false, minFloor:7,  lore:'Pyromancer Shade is an after image of a long forgotten pyromancer from history. The stories forget, the powers do not.' },
    { id:'void_wraith', name:'Void Wraith',      icon:'🌑', image:'/images/dungeon/monsters/void_wraith.jpg', hp:130, atk:38, def:10, steal:true,  minFloor:8,  lore:'Void Wraiths are weak beings that exist on the after images of mana. Even a slight scent of mana will cause them to swarm.' },
    { id:'abyssal_eye', name:'Abyssal Eye',      icon:'👁️', image:'/images/dungeon/monsters/abyssal_eye.jpg', hp:100, atk:45, def:5,  steal:false, minFloor:10, lore:'Abyssal Eye is a manifestation of local corruption exposing reality to the watchful eye of the Abyss.' },
    { id:'shadow_lord', name:'Shadow Lord',      icon:'🕷️', image:'/images/dungeon/monsters/shadow_lord.jpg', hp:200, atk:30, def:28, steal:true,  minFloor:12, lore:'Shadow Lords are weak imitations of what lurks in the darkness. Intangible made corporeal.' },
    { id:'void_titan',  name:'Void Titan',       icon:'💠', image:'/images/dungeon/monsters/void_titan.jpg', hp:250, atk:42, def:35, steal:true,  minFloor:15, lore:'Void Titans are gigantic void touched titans from the netherrealm. Caution is advised.' },
    { id:'dread_knight',name:'Dread Knight',     icon:'⚔️', image:'/images/dungeon/monsters/dread_knight.jpg', hp:300, atk:50, def:40, steal:true,  minFloor:20, lore:'Dread Knights are fear incarnate. Survivors are often mentally broken from the experience.' },
    { id:'elder_lich',  name:'Elder Lich',       icon:'💜', image:'/images/dungeon/monsters/elder_lich.jpg', hp:220, atk:60, def:20, steal:false, minFloor:25, lore:'Elder Lich is a long dead Mage that forsook life and turned to undeath in their greed.' },
    { id:'shadow_stalker', name:'Shadow Stalker', icon:'🐺', image:'/images/dungeon/monsters/shadow_stalker.jpg', hp:400, atk:55, def:25, steal:true, minFloor:10, isMiniBoss: true, tokenCost: 5, lore:'The Shadow Stalker is a tough dog-like creature that attacks from the shadows.' },
    { id:'crystal_golem', name:'Crystal Golem', icon:'💎', image:'/images/dungeon/monsters/crystal_golem.jpg', hp:600, atk:40, def:45, steal:false, minFloor:15, isMiniBoss: true, tokenCost: 6, lore:'Crystal Golems are Hard as Diamond and hit with the force of the mountain.' },
    { id:'flame_revenant', name:'Flame Revenant', icon:'🔥', image:'/images/dungeon/monsters/flame_revenant.jpg', hp:350, atk:70, def:20, steal:false, minFloor:20, isMiniBoss: true, tokenCost: 7, lore:'Flame Revenants are the burning echoes of fallen pyromancers, wreathed in unquenchable fire that hungers for living kindling.' },
    { id:'frost_wyrmling', name:'Frost Wyrmling', icon:'❄️', image:'/images/dungeon/monsters/frost_wyrmling.jpg', hp:450, atk:60, def:30, steal:true, minFloor:25, isMiniBoss: true, tokenCost: 8, lore:'Frost Wyrmlings are juvenile dragons born in the deepest caverns, where the cold itself whispers ancient draconic secrets.' },
    { id:'void_stalker', name:'Void Stalker', icon:'🌑', image:'/images/dungeon/monsters/void_stalker.jpg', hp:500, atk:75, def:28, steal:true, minFloor:30, isMiniBoss: true, tokenCost: 9, lore:'Void Stalkers are hunters from the space between worlds, phasing in and out of reality to corner their prey.' },
    { id:'doom_knight', name:'Doom Knight', icon:'⚔️', image:'/images/dungeon/monsters/doom_knight.jpg', hp:700, atk:65, def:50, steal:true, minFloor:35, isMiniBoss: true, tokenCost: 10, lore:'Doom Knights are oath-bound to a forgotten god of war, their armor fused to flesh in an eternal pact of slaughter.' },
  ];

const BOSS_POOL = [
    { name:'Death Knight Malachar', icon:'⚔️💀', image:'/images/boss/malachar.jpg', baseHp:600,  baseAtk:45, baseDef:20, steal:true,  lore:'The Death Knight is the remnant of a forgotten warrior bound in undeath to oppose all who enter his final abode.' },
    { name:'Ignarath the Eternal',  icon:'🌋🔥', image:'/images/boss/ignarath.jpg',  baseHp:700,  baseAtk:55, baseDef:25, steal:false, lore:'Ignarath is a fusion of demonic and necrotic energy warped to resemble a human abomination. Win quickly or be forever lost to corruption\'s touch.' },
    { name:'Nyxaroth the Devourer', icon:'🌑👁️', image:'/images/boss/nyxaroth.jpg',  baseHp:800,  baseAtk:65, baseDef:30, steal:true,  lore:'Nyxaroth is a mindless predator of unequal quickness and fury. Few survive to whisper tales of the calamity that follows her wake.' },
    { name:'Vizorax the Unholy',    icon:'👹🔥', image:'/images/boss/vizorax.jpg',    baseHp:850,  baseAtk:60, baseDef:35, steal:true,  lore:'Vizorax the Unholy, a Demon from the depths who adds a piece of each defeated opponent to his living armor. Said to be so magically potent reality bends to his whims.' },
    { name:'The Hollow King',       icon:'👑💀', image:'/images/boss/hollowking.jpg', baseHp:900,  baseAtk:70, baseDef:35, steal:true,  lore:'The Hollow King is a monarch of a fallen kingdom, his crown fused to a skull that still commands legions of the damned.' },
    { name:'Voidborn Colossus',     icon:'💠🌑', image:'/images/boss/voidborn.jpg',   baseHp:1000, baseAtk:80, baseDef:40, steal:false, lore:'Voidborn Colossi are living fortresses of compressed void matter, each step cracking the fabric of reality.' },
    { name:'The Undying Empress',   icon:'👸🔥', image:'/images/boss/empress.jpg',    baseHp:1100, baseAtk:90, baseDef:45, steal:true,  lore:'The Undying Empress is rumored to have sacrificed an entire civilization to fuel her immortality, pure speculation as none exist to bear witness to the truths of her existence.' },
    { name:'Abyssal Sovereign',     icon:'🌊💀', image:'/images/boss/sovereign.jpg',  baseHp:1200, baseAtk:95, baseDef:50, steal:true,  lore:'An abomination that crawled out of the void, the Abyssal Sovereign desecrates reality with his presence as he seeks to consume all to fuel his existence.' },
];
  const ROMAN = ['','II','III','IV','V','VI','VII','VIII','IX','X'];

function getBossForFloor(floor) {
    const idx  = (floor - 1) % BOSS_POOL.length;
    const tier = Math.floor((floor - 1) / BOSS_POOL.length);
    const b    = BOSS_POOL[idx];
    const scale = 1 + (floor - 1) * 0.18 + tier * 0.5;
    
    // Calculate gems with cap at 15
    let gemMin = Math.max(1, floor);
    let gemMax = Math.max(2, floor * 2);
    // Cap both at 15 maximum
    gemMin = Math.min(15, gemMin);
    gemMax = Math.min(15, gemMax);
    
    return {
        name:  b.name + (tier > 0 ? ' ' + (ROMAN[Math.min(tier, ROMAN.length-1)] || 'X+') : ''),
        icon:  b.icon,
        image: b.image,
        hp:    Math.round(b.baseHp  * scale),
        atk:   Math.round(b.baseAtk * scale),
        def:   Math.round(b.baseDef * scale),
        steal: b.steal,
        lore:  b.lore,
        loot: {
            gold:        [100 + floor * 30,  300 + floor * 80],
            gems:        [gemMin, gemMax],  // Now capped at 15
            premiumDays: floor <= 5 ? [5,10] : floor <= 15 ? [7,14] : [10,30],
            itemRarity:  floor <= 5 ? 'rare' : floor <= 15 ? 'epic' : 'legendary',
        },
    };
}
  
  function getFloorTheme(floor) {
    return FLOOR_THEMES[Math.floor((floor - 1) / 10) % FLOOR_THEMES.length];
  }
  
  function getMonstersForFloor(floor) {
    return MONSTER_POOL.filter(m => m.minFloor <= floor).map(m => ({
      ...m,
      hp:  Math.round(m.hp  + floor * 8),
      atk: Math.round(m.atk + floor * 2.5),
      def: Math.round(m.def + floor * 1.2),
    }));
  }
  
  // getDungeonDef: returns live computed def for current floor
  function getDungeonDef(id) {
    if (id === 'tower' || !id) {
      if (D && D.floor) {
        const floor = D.floor || 1;
        const t = getFloorTheme(floor);
        return { 
          id: 'tower', 
          name: DUNGEON.name, 
          icon: DUNGEON.icon, 
          theme: t.theme, 
          themeGlow: t.themeGlow, 
          themeName: t.name, 
          monsters: getMonstersForFloor(floor), 
          boss: getBossForFloor(floor) 
        };
      }
      return DUNGEON;
    }
    if (id === 'event') {
      return { 
        id: 'event', 
        name: _pt('Provação do Arcano', 'Trial of the Arcane'),
        icon: '🔮', 
        theme: '#6b21a8', 
        themeGlow: '#a855f7', 
        themeName: 'Arcane', 
        monsters: Array.isArray(D.rooms) ? D.rooms.flatMap(r => Array.isArray(r.monsters) ? r.monsters : []) : [],
        boss: D.rooms && D.rooms[D.eventRoomIndex ?? -1] && D.rooms[D.eventRoomIndex].isBoss
          ? (D.rooms[D.eventRoomIndex].monsters && D.rooms[D.eventRoomIndex].monsters[0]) || DUNGEON.boss
          : DUNGEON.boss,
      };
    }
    return DUNGEON;
  }

  // ── State ──────────────────────────────────────────────────
let D = {
  tokens: 0,
  activeDungeon: null,
  dungeonGold: 0,
  floor: 1,
  highestFloor: 1,
  rooms: [],
  playerPos: 0,
  exploredRooms: new Set(),
  floorRunId: null,
  crawler: null,
  combat: null,
  bossDefeated: false,
  travelTimer: null,
  isTraveling: false,
  dungeonLog: [],
  savedProgress: {},
  dungeonInventory: [],  // Make sure this exists
  blacksmithUnlocked: false,
  guildReputation: 0,    // Add this
  lockRefreshInterval: null,
  _combatActive: false,
  eventMode: false,     // Trial of the Arcane — dungeon pipeline running the event floor
  eventRun: null,       // active event run { room_index, score, kills, bosses, total_dmg }
  _eventStarted: false, // true once the player clicks "Begin" (timer counting)
  _eventStartTime: 0,   // epoch ms the current event run started (from server run.start_time)
  _eventTimerInterval: null,
  _eventFinishing: false,
  _eventRunCompleted: false,
};

// Release lock when leaving tab (tower only; event mode doesn't acquire the tower lock).
window.addEventListener('beforeunload', () => {
  if (D.activeDungeon && !D.eventMode) {
    navigator.sendBeacon('/game/dungeon/lock-release');
  }
});

// Also release on visibility change (mobile)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden' && D.activeDungeon && !D.eventMode) {
    navigator.sendBeacon('/game/dungeon/lock-release');
  }
});

  // ── Helpers ────────────────────────────────────────────────
  function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
  function chance(p)      { return Math.random() < p; }
  function elapsed(ts, hours) { return (Date.now() - ts) >= hours * 3600000; }

  function getChar() {
    return (typeof character !== 'undefined' && character) ? character : null;
  }

  function log(msg, cls='') {
    D.dungeonLog.unshift({ msg, cls, ts: Date.now() });
    if (D.dungeonLog.length > 60) D.dungeonLog.pop();
    renderLog();
  }

  function saveState() {
    // Never persist event-mode state to localStorage — it must not clobber tower progress.
    if (D.eventMode) return;
    try { localStorage.setItem('dungeon_state', JSON.stringify(D)); } catch(e) {}
  }

  function loadState() {
    // Never let a persisted tower snapshot overwrite an active event run.
    if (D.eventMode) return;
    try {
      const raw = localStorage.getItem('dungeon_state');
      if (raw) {
        const parsed = JSON.parse(raw);
        parsed.exploredRooms = new Set(parsed.exploredRooms || []);
        parsed.crawler = parsed.crawler || null;
        parsed.floorRunId = parsed.floorRunId || null;
        const loadedRooms = parsed.rooms || [];
        const loadedFloor = parsed.floor || 1;
        parsed.rooms = normalizeRoomMonsters(normalizeMiniBossRooms(loadedRooms, loadedFloor), loadedFloor);
        D = { ...D, ...parsed };
      }
    } catch(e) {}
  }

  function createFloorRunId() {
    return `floor_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

async function refreshCharacter() {
  try {
    const updatedChar = await apiFetch('GET', '/game/character');
    if (updatedChar) {
      if (typeof character !== 'undefined') {
        Object.assign(character, updatedChar);
      }
      if (typeof window.character !== 'undefined') {
        window.character = updatedChar;
      }
      if (typeof renderTopBar === 'function') renderTopBar();
      if (typeof renderCharacter === 'function') renderCharacter();
    }
    
    // Also refresh dungeon gold display
    const goldRes = await apiFetch('GET', '/game/dungeon/gold');
    if (goldRes && goldRes.success) {
      const goldEl = document.getElementById('dungeon-gold-count');
      if (goldEl) goldEl.textContent = goldRes.dungeonGold;
    }
  } catch(e) {
    console.error('Failed to refresh character:', e);
  }
}

  async function loadDungeonDataFromDB() {
  try {
    const response = await apiFetch('GET', '/game/dungeon/data');
    if (response && response.conflict) {
      log(`${CURRENT_LANG === 'pt' ? '⚠️ A masmorra já está ativa em outro dispositivo. Feche-a lá primeiro.' : '⚠️ Dungeon already active on another device. Please close it there first.'}`, 'log-danger');
      setTimeout(() => renderDungeonList(), 2000);
      return false;
    }
    if (response && response.success) {
      D.tokens = response.tokens || 0;
      D.floor = response.floor || 1;
      D.highestFloor = response.highestFloor || 1;
      D.bossDefeated = !!response.bossDefeated;
      
      if (response.progress) {
        // Edge case: if activeDungeon is null (death/exit path), we still want resume to work.
        const key = response.progress.activeDungeon || 'tower';
        const progressFloor = response.progress.floor || 1;
        const rooms = normalizeRoomMonsters(
          normalizeMiniBossRooms(response.progress.rooms || [], progressFloor),
          progressFloor
        );
        if (rooms && rooms.length) {
          D.savedProgress[key] = {
            floor: response.progress.floor,
            pos: response.progress.playerPos,
            rooms,
            explored: response.progress.exploredRooms,
            combat: response.progress.combat,
            crawler: response.progress.crawler || null,
            floorRunId: response.progress.floorRunId || null,
            bossDefeated: !!response.progress.bossDefeated
          };
        }
      }
      
      updateTokenDisplay();
      
      // Also load dungeon gold
      const goldRes = await apiFetch('GET', '/game/dungeon/gold');
      if (goldRes && goldRes.success) {
        D.dungeonGold = goldRes.dungeonGold || 0;
        const goldEl = document.getElementById('dungeon-gold-count');
        if (goldEl) goldEl.textContent = goldRes.dungeonGold;
      }
      
      return true;
    }
  } catch (e) {
    console.error('Failed to load dungeon data from DB:', e);
    loadState();
  }
  return false;
}

  async function saveTokensToDB() {
    try {
      await apiFetch('POST', '/game/dungeon/tokens', { tokens: D.tokens });
      saveState();
    } catch (e) {
      console.error('Failed to save tokens to DB:', e);
    }
  }

  async function saveProgressToDB() {
    // Never persist event-mode state — the event must stay isolated from tower progress.
    if (D.eventMode) return;
    try {
      await apiFetch('POST', '/game/dungeon/progress', {
        floor: D.floor,
        highestFloor: D.highestFloor || D.floor,
        // Persist the *current runtime* dungeon state so rooms don't come back empty on resume.
        progress: {
          rooms: D.rooms || [],
          playerPos: D.playerPos || 0,
          exploredRooms: [...(D.exploredRooms || [])],
          crawler: D.crawler || null,
          floorRunId: D.floorRunId || null,
          bossDefeated: !!D.bossDefeated
        },
        activeDungeon: D.activeDungeon,
        combat: D.combat
      });
    } catch (e) {
      console.error('Failed to save progress to DB:', e);
    }
  }

  async function spendTokens(amount) {
    if (D.tokens >= amount) {
      D.tokens -= amount;
      updateTokenDisplay();
      await saveTokensToDB();
      return true;
    }
    return false;
  }

  // ── Token Economy ──────────────────────────────────────────
  function addTokensFromMP(mpSpent) {
    apiFetch('POST', '/game/dungeon/mp-spent', { mpSpent })
      .then(response => {
        if (response && response.totalTokens !== undefined) {
          D.tokens = response.totalTokens;
          updateTokenDisplay();
          saveState();
          log(`${_pt(`⚗️ Ganhou ${response.tokensEarned} Token de Permissão de Chefe${response.tokensEarned > 1 ? 's' : ''} pelo MP gasto.`, `⚗️ Gained ${response.tokensEarned} Boss Clearance Token${response.tokensEarned > 1 ? 's' : ''} from MP spent.`)}`, 'log-token');
        }
      })
      .catch(e => console.error('Failed to process MP:', e));
    
    return Math.floor(mpSpent / MP_PER_TOKEN);
  }
  
  global.dungeonAddTokens = addTokensFromMP;

  function updateTokenDisplay() {
    const el = document.getElementById('dungeon-token-count');
    if (el) el.textContent = D.tokens;
  }

// ── Map Generation ─────────────────────────────────────────
  function generateFloor(dungeonId, floor) {
    const rooms = [];
    const gridW = 24, gridH = 24;
    const total = gridW * gridH;

    const used = new Array(total).fill(false);
    const chosen = [];
    const depthMap = {};
    const edgeMap = {};
    const startIdx = gridH * gridW - gridW; // Start at bottom-center
    const stack = [startIdx];

    chosen.push(startIdx);
    used[startIdx] = true;
    depthMap[startIdx] = 0;
    edgeMap[startIdx] = new Set();

    // First pass: Create main branching structure with DFS
    while (chosen.length < ROOMS_PER_FLOOR * 0.7 && stack.length > 0) {
      const current = stack[stack.length - 1];
      const cx = current % gridW;
      const cy = Math.floor(current / gridW);
      const neighbors = [];

      if (cx > 0 && !used[cy * gridW + (cx - 1)]) neighbors.push(cy * gridW + (cx - 1));
      if (cx < gridW - 1 && !used[cy * gridW + (cx + 1)]) neighbors.push(cy * gridW + (cx + 1));
      if (cy > 0 && !used[(cy - 1) * gridW + cx]) neighbors.push((cy - 1) * gridW + cx);
      if (cy < gridH - 1 && !used[(cy + 1) * gridW + cx]) neighbors.push((cy + 1) * gridW + cx);

      if (!neighbors.length) {
        stack.pop();
        continue;
      }

      const pick = neighbors[rand(0, neighbors.length - 1)];
      used[pick] = true;
      chosen.push(pick);
      depthMap[pick] = (depthMap[current] || 0) + 1;
      edgeMap[pick] = edgeMap[pick] || new Set();
      edgeMap[current] = edgeMap[current] || new Set();
      edgeMap[current].add(pick);
      edgeMap[pick].add(current);
      stack.push(pick);
    }

    // Second pass: Create open areas (rooms with 3-4 connections)
    // These are wider zones where trails converge
    const areaCount = Math.floor(ROOMS_PER_FLOOR * 0.15);
    for (let a = 0; a < areaCount; a++) {
      // Pick a random existing room to expand around
      const anchorIdx = chosen[rand(1, chosen.length - 1)];
      const ax = anchorIdx % gridW;
      const ay = Math.floor(anchorIdx / gridW);
      
      // Try to add 2-3 new connections from this area
      const directions = [
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 }
      ];
      const shuffledDirs = directions.sort(() => Math.random() - 0.5);
      let addedFromArea = 0;
      
      for (const dir of shuffledDirs) {
        if (addedFromArea >= 2) break;
        const nx = ax + dir.dx;
        const ny = ay + dir.dy;
        if (nx < 0 || nx >= gridW || ny < 0 || ny >= gridH) continue;
        const nIdx = ny * gridW + nx;
        if (!used[nIdx]) {
          used[nIdx] = true;
          chosen.push(nIdx);
          depthMap[nIdx] = (depthMap[anchorIdx] || 0) + 1;
          edgeMap[nIdx] = new Set();
          edgeMap[anchorIdx] = edgeMap[anchorIdx] || new Set();
          edgeMap[anchorIdx].add(nIdx);
          edgeMap[nIdx].add(anchorIdx);
          addedFromArea++;
        } else {
          // Connect to existing room for cross-link
          if (!edgeMap[anchorIdx].has(nIdx) && nIdx !== anchorIdx) {
            edgeMap[anchorIdx].add(nIdx);
            edgeMap[nIdx].add(anchorIdx);
          }
        }
      }
    }

    // Third pass: Add cross-links between nearby parallel paths
    // This makes adjacent rooms connectable even if not directly on same trail
    for (let i = 0; i < chosen.length; i++) {
      const idx = chosen[i];
      const x = idx % gridW;
      const y = Math.floor(idx / gridW);
      
      // Check orthogonal neighbors - if both exist and aren't connected, add cross-link
      // This creates shortcuts between parallel trails
      if (x > 0) {
        const leftIdx = y * gridW + (x - 1);
        if (used[leftIdx] && !edgeMap[idx].has(leftIdx)) {
          // 25% chance to cross-link adjacent rooms
          if (Math.random() < 0.25) {
            edgeMap[idx].add(leftIdx);
            edgeMap[leftIdx].add(idx);
          }
        }
      }
      if (y > 0) {
        const aboveIdx = (y - 1) * gridW + x;
        if (used[aboveIdx] && !edgeMap[idx].has(aboveIdx)) {
          if (Math.random() < 0.25) {
            edgeMap[idx].add(aboveIdx);
            edgeMap[aboveIdx].add(idx);
          }
        }
      }
    }

    // Fill remaining rooms to reach target count
    while (chosen.length < ROOMS_PER_FLOOR && stack.length > 0) {
      const current = stack[stack.length - 1];
      const cx = current % gridW;
      const cy = Math.floor(current / gridW);
      const neighbors = [];

      if (cx > 0 && !used[cy * gridW + (cx - 1)]) neighbors.push(cy * gridW + (cx - 1));
      if (cx < gridW - 1 && !used[cy * gridW + (cx + 1)]) neighbors.push(cy * gridW + (cx + 1));
      if (cy > 0 && !used[(cy - 1) * gridW + cx]) neighbors.push((cy - 1) * gridW + cx);
      if (cy < gridH - 1 && !used[(cy + 1) * gridW + cx]) neighbors.push((cy + 1) * gridW + cx);

      if (!neighbors.length) {
        stack.pop();
        continue;
      }

      const pick = neighbors[rand(0, neighbors.length - 1)];
      used[pick] = true;
      chosen.push(pick);
      depthMap[pick] = (depthMap[current] || 0) + 1;
      edgeMap[pick] = edgeMap[pick] || new Set();
      edgeMap[current] = edgeMap[current] || new Set();
      edgeMap[current].add(pick);
      edgeMap[pick].add(current);
      stack.push(pick);
    }

    const start = chosen[0];
    let farthest = chosen[0], maxDepth = 0;
    for (const c of chosen) {
      const d = depthMap[c] || 0;
      if (d > maxDepth) {
        maxDepth = d;
        farthest = c;
      }
    }

    const dungeonDef = getDungeonDef(dungeonId);
    const availableMonsters = dungeonDef?.monsters || [];

    const roomIndexByGrid = {};
    for (let i = 0; i < chosen.length; i++) {
      roomIndexByGrid[chosen[i]] = i;
    }

    for (let i = 0; i < chosen.length; i++) {
      const idx = chosen[i];
      const x = idx % gridW, y = Math.floor(idx / gridW);
      const isBoss = (idx === farthest);
      const isStart = (i === 0);
      
      const connectionCount = (edgeMap[idx] || new Set()).size;
      const isArea = connectionCount >= 3;
      const miniBossTemplate = getMiniBossForFloor(floor);
      const isMiniBoss = !isStart && !isBoss && !!miniBossTemplate && Math.random() < 0.10;

      const connections = [...(edgeMap[idx] || [])]
        .map(gridNeighbor => roomIndexByGrid[gridNeighbor])
        .filter(conn => Number.isInteger(conn) && conn !== i);

      // Determine how many monsters based on floor (every 10 floors adds 1 more enemy)
      let monsterCount = 1;
      if (floor >= 30) monsterCount = 4;
      else if (floor >= 20) monsterCount = 3;
      else if (floor >= 10) monsterCount = 2;
      else monsterCount = 1;

      let monsters = [];
      
      // ONLY spawn monsters in non-start, non-boss rooms
      if (!isStart && !isBoss) {
        if (isMiniBoss) {
          const miniBossDef = miniBossTemplate;
          if (miniBossDef) {
            monsters = [{
              id: miniBossDef.id || miniBossDef.name.toLowerCase().replace(/[^\w]+/g, '_'),
              name: miniBossDef.name,
              icon: miniBossDef.icon,
              image: miniBossDef.image,
              hp: miniBossDef.hp,
              atk: miniBossDef.atk,
              def: miniBossDef.def,
              steal: miniBossDef.steal || false,
              isMiniBoss: true,
              tokenCost: miniBossDef.tokenCost || 0,
              currentHp: miniBossDef.currentHp || miniBossDef.hp,
              maxHp: miniBossDef.maxHp || miniBossDef.hp,
              lastKilled: null,
              stolenItems: [],
            }];
          }
        } else if (availableMonsters.length > 0) {
          const spawnChance = Math.random();
          if (spawnChance < 0.7) {  // 70% chance for any monster
            monsters = [];
            const actualCount = Math.min(monsterCount, 4);
            for (let m = 0; m < actualCount; m++) {
              const monsterDef = availableMonsters[rand(0, availableMonsters.length - 1)];
              if (monsterDef) {
                const isMB = monsterDef.isMiniBoss === true;
                const scaledHp = Math.floor(monsterDef.hp + (Math.pow(floor, 1.3) * (isMB ? 15 : 12)));
                const scaledAtk = Math.floor(monsterDef.atk + (Math.pow(floor, 1.2) * (isMB ? 4 : 3)));
                const scaledDef = Math.floor(monsterDef.def + (Math.pow(floor, 1.1) * (isMB ? 2 : 1.5)));
                
                monsters.push({
                  id: monsterDef.id,
                  name: monsterDef.name,
                  icon: monsterDef.icon,
                  image: monsterDef.image,
                  hp: scaledHp,
                  atk: scaledAtk,
                  def: scaledDef,
                  steal: monsterDef.steal || false,
                  isMiniBoss: isMB,
                  tokenCost: monsterDef.tokenCost || 0,
                  currentHp: scaledHp,
                  maxHp: scaledHp,
                  lastKilled: null,
                  stolenItems: [],
                });
              }
            }
          }
        }
      }

      // Determine room type and visual
      let roomType = isBoss ? 'boss' : isStart ? 'start' : (isMiniBoss ? 'miniboss' : (isArea ? 'area' : (Math.random() < 0.15 ? 'treasure' : 'corridor')));
      let visualData = null;
      if (roomType === 'boss') visualData = DUNGEON_VISUALS.boss;
      else if (roomType === 'start') visualData = DUNGEON_VISUALS.start;
      else if (roomType === 'miniboss') visualData = DUNGEON_VISUALS.miniboss;
      else if (roomType === 'area') visualData = DUNGEON_VISUALS.area;
      else if (roomType === 'treasure') visualData = DUNGEON_VISUALS.treasure;
      else visualData = DUNGEON_VISUALS.corridor;
      
      // Ensure visualData is always set
      if (!visualData) visualData = DUNGEON_VISUALS.corridor;

      rooms.push({
        id: i,
        gridIdx: idx,
        x, y,
        isBoss,
        isMiniBoss: isMiniBoss || false,
        isStart,
        isArea,
        connections,
        monsters: monsters,
        looted: false,
        type: roomType,
        visual: visualData
      });
    }

    return rooms;
  }

  function spawnCrawlerForCurrentFloor() {
    if (!Array.isArray(D.rooms) || D.rooms.length === 0) return null;
    const eligibleRooms = D.rooms.filter(room => !room.isStart && !room.isBoss);
    if (!eligibleRooms.length) return null;
    const spawnRoom = eligibleRooms[rand(0, eligibleRooms.length - 1)];
    const monster = getCrawlerForFloor(D.floor || 1);
    return {
      roomIdx: spawnRoom.id,
      monster,
      active: true,
      encountered: false,
      chaseTurnsLeft: 0,
      defeated: false,
    };
  }

  function ensureCrawlerState() {
    if (D.eventMode) { D.crawler = null; return; }
    if (!D.activeDungeon || !Array.isArray(D.rooms) || D.rooms.length === 0) return;
    if (D.crawler && typeof D.crawler.roomIdx === 'number' && D.crawler.monster) return;
    D.crawler = spawnCrawlerForCurrentFloor();
  }

  function getCrawlerRoom() {
    if (!D.crawler || D.crawler.defeated || !D.crawler.active) return null;
    return D.rooms[D.crawler.roomIdx] || null;
  }

  function buildRoomPath(startIdx, targetIdx) {
    if (startIdx === targetIdx) return [startIdx];
    const visited = new Set([startIdx]);
    const queue = [[startIdx]];
    while (queue.length) {
      const path = queue.shift();
      const roomIdx = path[path.length - 1];
      const room = D.rooms[roomIdx];
      if (!room) continue;
      for (const nextIdx of room.connections || []) {
        if (visited.has(nextIdx)) continue;
        const nextPath = [...path, nextIdx];
        if (nextIdx === targetIdx) return nextPath;
        visited.add(nextIdx);
        queue.push(nextPath);
      }
    }
    return [];
  }

  function logCrawlerPresence() {
    if (!D.crawler || D.crawler.defeated || !D.crawler.active) return;
    const path = buildRoomPath(D.playerPos, D.crawler.roomIdx);
    if (path.length === 2) {
      log(`${_pt('🕷️ Você ouve um farfalhar logo além da próxima câmara...', '🕷️ You hear skittering just beyond the next chamber...')}`, 'log-danger');
    } else if (path.length === 3) {
      log(`${_pt('🕷️ A pedra sob seus pés treme por um momento. Algo enorme está se movendo por perto.', '🕷️ The stone beneath your feet trembles for a moment. Something huge is moving nearby.')}`, 'log-warning');
    }
  }

  function startCrawlerEncounter(source = 'encounter') {
  ensureCrawlerState();
  if (!D.crawler || D.crawler.defeated || !D.crawler.monster) return false;

    // Prevent crawler combat at 0 HP (otherwise player can get stuck and/or server rejects later).
    const c0 = getChar();
    const hp0 = Number(c0?.hp_current ?? c0?.hp ?? c0?.hp_max ?? 0);
    if (Number.isFinite(hp0) && hp0 <= 0) {
      const msg = _pt('Você está com 0 de HP. Saia da masmorra para se recuperar antes de lutar novamente.', 'You are at 0 HP. Leave the dungeon to recover before fighting again.');
      if (typeof openGameDialog === 'function') {
        openGameDialog({ title: _pt('Sem HP', 'Out of HP'), message: msg, confirmLabel: 'OK', showCancel: false }).catch(() => {});
      } else {
        alert(msg);
      }
      return false;
    }

    // Achievement tracking
    apiFetch('POST', '/game/dungeon/crawler-event', { event: 'encounter' }).catch(() => {});
    D.crawler.roomIdx = D.playerPos;
    D.crawler.active = true;
    if (!D.crawler.encountered) {
      D.crawler.encountered = true;
      D.crawler.chaseTurnsLeft = 3;
    }
    D.combat = {
      roomIdx: D.playerPos,
      monsters: [{
        ...D.crawler.monster,
        currentHp: D.crawler.monster.currentHp || D.crawler.monster.maxHp,
        maxHp: D.crawler.monster.maxHp || D.crawler.monster.hp,
      }],
      currentMonsterIndex: 0,
      // Server will provide the authoritative intro line; avoid duplicating it client-side.
      roundLog: [],
      isCrawler: true,
      serverAuth: true,
      resolving: true,
      combatId: null,
      turnNonce: 0,
    };
    log(`${_pt('🕷️ O Devorador caiu sobre você! Fugir pode ser sua única chance.', '🕷️ The Crawler is upon you! Running may be your only chance.')}`, 'log-danger');
    saveState();
    saveProgressToDB();
    renderCombatPanel();

    // Server-authoritative crawler combat session (prevents client-side manipulation).
    apiFetch('POST', '/game/dungeon/crawler-combat/start', { floor: D.floor, roomIndex: D.playerPos })
      .then(res => {
        if (!D.combat || !D.combat.isCrawler) return;
        if (!res || !res.success) throw new Error(res?.error || 'Failed to start crawler combat.');
        D.combat.combatId = res.combatId;
        D.combat.turnNonce = Number(res.turnNonce || 0);
        if (res.monster) {
          D.combat.monsters = [{
            ...D.combat.monsters[0],
            ...res.monster,
            currentHp: res.monster.currentHp ?? res.monster.hp ?? D.combat.monsters[0].currentHp,
            maxHp: res.monster.maxHp ?? res.monster.hp ?? D.combat.monsters[0].maxHp,
          }];
          if (D.crawler && D.crawler.monster) {
            D.crawler.monster.currentHp = D.combat.monsters[0].currentHp;
            D.crawler.monster.maxHp = D.combat.monsters[0].maxHp;
          }
        }
        if (Array.isArray(res.log) && res.log.length) {
          D.combat.roundLog.push(...res.log);
        }
        D.combat.resolving = false;
        saveState();
        saveProgressToDB();
        renderCombatPanel();
      })
      .catch(err => {
        console.error('Failed to start crawler combat:', err);
        if (D.combat && D.combat.isCrawler) {
          D.combat.resolving = false;
          D.combat.roundLog.push({ actor: 'monster', text: '⚠️ Server combat unavailable. Try reconnecting.' });
          renderCombatPanel();
        }
      });
    return true;
  }

  function moveCrawlerAfterPlayerMove() {
    ensureCrawlerState();
    if (!D.crawler || D.crawler.defeated || !D.crawler.active || D.combat) return false;

    if (D.crawler.roomIdx === D.playerPos) {
      return startCrawlerEncounter(D.crawler.encountered ? 'chase' : 'encounter');
    }

    let nextRoomIdx = D.crawler.roomIdx;
    if (D.crawler.encountered && D.crawler.chaseTurnsLeft > 0) {
      const chasePath = buildRoomPath(D.crawler.roomIdx, D.playerPos);
      if (chasePath.length > 1) nextRoomIdx = chasePath[1];
      D.crawler.chaseTurnsLeft -= 1;
      if (D.crawler.chaseTurnsLeft <= 0 && nextRoomIdx !== D.playerPos) {
        D.crawler.encountered = false;
        D.crawler.chaseTurnsLeft = 0;
        log(`${_pt('🕷️ O farfalhar desaparece. O Devorador perde seu rastro... por enquanto.', '🕷️ The skittering fades. The Crawler loses your trail... for now.')}`, 'log-warning');
      }
    } else {
      const currentRoom = D.rooms[D.crawler.roomIdx];
      const options = (currentRoom?.connections || []).filter(idx => idx !== D.playerPos);
      if (options.length) nextRoomIdx = options[rand(0, options.length - 1)];
    }

    D.crawler.roomIdx = nextRoomIdx;
    D.crawler.active = true;
    D.crawler.monster.currentHp = Math.max(1, D.crawler.monster.currentHp || D.crawler.monster.maxHp || D.crawler.monster.hp);

    if (D.crawler.roomIdx === D.playerPos) {
      return startCrawlerEncounter('chase');
    }

    saveState();
    saveProgressToDB();
    logCrawlerPresence();
    return false;
  }

  // ── Combat Engine ──────────────────────────────────────────
function calcPlayerStats() {
  const c = getChar();
  if (!c) return { atk: 10, def: 5, hp: 100, maxHp: 100 };
  
  // Sum equipment + wp_stats bonuses
  const eq = c.equipped || {};
  const eqBonuses = { strength:0, defense:0, agility:0, magic:0, dmg_min:0, dmg_max:0, armor:0, pyro_dmg:0, water_dmg:0, wind_dmg:0, electro_dmg:0, pyro_resist:0, water_resist:0, wind_resist:0, electro_resist:0 };
  Object.values(eq).forEach(item => {
    if (!item) return;
    ['strength','defense','agility','magic','dmg_min','dmg_max','armor','pyro_dmg','water_dmg','wind_dmg','electro_dmg','pyro_resist','water_resist','wind_resist','electro_resist'].forEach(k => {
      if (item.stats?.[k]) eqBonuses[k] += Number(item.stats[k]);
      if (item.wp_stats?.[k]) eqBonuses[k] += Number(item.wp_stats[k]);
    });
  });

  const strength = (c.strength || 10) + eqBonuses.strength;
  const defense  = (c.defense || 5)  + eqBonuses.defense;
  const agility  = (c.agility || 10) + eqBonuses.agility;
  const magic    = (c.magic || 10)   + eqBonuses.magic;
  let atk = 0;
  let def = 0;

  switch(c.class) {
    case 'mage':
      atk = magic * 2.2 + strength * 0.2;
      def = defense * 0.4 + magic * 0.2;
      break;
    case 'rogue': {
      const hasShield = eq.shield && eq.shield.rogueOffhand !== true;
      const noShieldAgi = !hasShield ? Math.floor(agility * 0.05) : 0;
      atk = agility * 1.7 + strength * 0.5;
      def = defense * 0.5 + (agility + noShieldAgi) * 0.3;
      break;
    }
    case 'paladin':
      atk = strength * 1.2 + magic * 1.0;
      def = defense * 1.2 + magic * 0.3;
      break;
    default: // warrior
      atk = strength * 2 + agility * 0.5;
      def = defense + strength * 0.3;
  }

  const weaponDmg = Math.floor((eqBonuses.dmg_min + eqBonuses.dmg_max) / 2);
  atk += weaponDmg;
  def += eqBonuses.armor + (c.armor_value || 0);
  
  const hp = Number(c.hp_current ?? c.hp ?? 100);
  const maxHp = Number(c.hp_max ?? 100);
  
  return { 
    atk: Math.floor(atk), 
    def: Math.floor(def), 
    hp: Number.isFinite(hp) ? hp : 100,
    maxHp: Number.isFinite(maxHp) ? maxHp : 100
  };
}

function updateDungeonGoldDisplay() {
  const el = document.getElementById('dungeon-gold-count');
  if (el) {
    el.textContent = D.dungeonGold || 0;
    apiFetch('GET', '/game/dungeon/gold').then(res => {
      if (res && res.success) {
        D.dungeonGold = res.dungeonGold || 0;
        el.textContent = res.dungeonGold;
      }
    }).catch(() => {});
  }
}

function enterDungeon(dungeonId) {
    const def = getDungeonDef(dungeonId);
    if (!def) return;

    // Try to acquire lock first
    apiFetch('POST', '/game/dungeon/lock-acquire')
        .then(res => {
            if (res.locked || res.error) {
                alert(_pt('⚠️ A masmorra já está ativa em outro dispositivo.\nFeche-a lá primeiro.', '⚠️ Dungeon is already active on another device.\nPlease close it there first.'));
                return;
            }
            // Lock acquired - now verify and enter
            startDungeonEnter(dungeonId);
            startLockRefresh();
        })
        .catch(e => {
            console.error('Failed to acquire lock:', e);
            alert(_pt('⚠️ Falha ao entrar na masmorra. Tente novamente.', '⚠️ Failed to enter dungeon. Please try again.'));
        });
}

  // Prefetch server-authoritative combat state as soon as you enter a room with enemies.
  // This makes the "Fight" button feel instant even on higher latency connections.
  function prefetchCombatForRoom(roomIdx) {
    if (D.combat) return;
    const room = D.rooms?.[roomIdx];
    if (!room || !Array.isArray(room.monsters) || room.monsters.length === 0) return;
    const anyAlive = room.monsters.some(m => !m.lastKilled || elapsed(Number(m.lastKilled), MONSTER_RESPAWN_H));
    if (!anyAlive) return;

    const key = `${D.floor}:${roomIdx}:${String(D.floorRunId || '')}`;
    if (D._combatPrefetch && D._combatPrefetch.key === key) return;

    D._combatPrefetch = {
      key,
      res: null,
      promise: apiFetch('POST', D.eventMode ? '/event/combat/start' : '/game/dungeon/combat/start', D.eventMode ? { roomIndex: roomIdx } : { floor: D.floor, roomIndex: roomIdx, kind: 'room', floorRunId: D.floorRunId })
        .then(res => {
          if (D._combatPrefetch && D._combatPrefetch.key === key) D._combatPrefetch.res = res;
          return res;
        })
        .catch(() => null),
    };
  }

function startLockRefresh() {
    D.lockRefreshInterval = setInterval(() => {
        apiFetch('POST', '/game/dungeon/lock-refresh').catch(() => {});
    }, 15000);
}

function stopLockRefresh() {
    if (D.lockRefreshInterval) {
        clearInterval(D.lockRefreshInterval);
        D.lockRefreshInterval = null;
    }
    apiFetch('POST', '/game/dungeon/lock-release').catch(() => {});
}

function startDungeonEnter(dungeonId) {
    // Verify lock is held before proceeding
    if (!D.hasLock) {
        // No lock - need to acquire first
        apiFetch('POST', '/game/dungeon/lock-acquire')
            .then(res => {
                if (res.locked || res.error) {
                    alert(_pt('⚠️ A masmorra já está ativa em outro dispositivo.', '⚠️ Dungeon is already active on another device.'));
                    return;
                }
                D.hasLock = true;
                proceedStartDungeon(dungeonId);
            })
            .catch(e => {
                console.error('Lock verification failed:', e);
                alert(_pt('⚠️ Falha ao verificar o bloqueio.', '⚠️ Failed to verify lock.'));
            });
        return;
    }
    
    proceedStartDungeon(dungeonId);
}

function proceedStartDungeon(dungeonId) {
    fetchElemental();
    if (D.savedProgress['tower']) {
        const s = D.savedProgress[dungeonId];
        D.activeDungeon = 'tower';
        global.__dungeonActive = true;
        D.floor = s.floor;
        D.rooms = normalizeRoomMonsters(normalizeMiniBossRooms(s.rooms || [], s.floor || 1), s.floor || 1);
        D.playerPos = s.pos;
        D.exploredRooms = new Set(s.explored);
        D.crawler = s.crawler || null;
        D.floorRunId = s.floorRunId || createFloorRunId();
        D.bossDefeated = !!s.bossDefeated;

        // Defensive: if saved rooms were generated with a different floor (or older rules),
        // the floor number and the monster counts can desync (e.g. 2 enemies on floor 3).
        // In that case, regenerate the floor for the current floor to restore consistency.
        const expectedMaxEnemies = (floor) => {
            const f = Math.max(1, Number(floor) || 1);
            if (f >= 30) return 4;
            if (f >= 20) return 3;
            if (f >= 10) return 2;
            return 1;
        };
        const expMax = expectedMaxEnemies(D.floor);
        const hasInvalidCounts = Array.isArray(D.rooms) && D.rooms.some(r => {
            if (!r || r.isStart || r.isBoss || r.isMiniBoss || r.type === 'miniboss') return false;
            const ms = Array.isArray(r.monsters) ? r.monsters : [];
            return ms.length > expMax;
        });
        if (hasInvalidCounts) {
            const savedCrawler = D.crawler;
            D.rooms = normalizeMiniBossRooms(generateFloor('tower', D.floor), D.floor);
            D.playerPos = D.rooms.findIndex(r => r.isStart);
            D.exploredRooms = new Set([D.playerPos]);
            // Preserve saved crawler state so closing/reopening doesn't erase its position or chase progress
            D.crawler = savedCrawler && savedCrawler.monster ? savedCrawler : spawnCrawlerForCurrentFloor();
            D.floorRunId = createFloorRunId();
            saveState();
            saveProgressToDB();
        }
        
        if (!D.rooms || D.rooms.length === 0) {
            const savedCrawler = D.crawler;
            D.rooms = normalizeMiniBossRooms(generateFloor('tower', D.floor), D.floor);
            D.playerPos = D.rooms.findIndex(r => r.isStart);
            D.exploredRooms = new Set([D.playerPos]);
            D.crawler = savedCrawler && savedCrawler.monster ? savedCrawler : spawnCrawlerForCurrentFloor();
            D.floorRunId = createFloorRunId();
            saveState();
            saveProgressToDB();
        }
        ensureCrawlerState();
        
        log(`${_pt(`🔮 Retomando Andar ${D.floor}...`, `🔮 Resuming Floor ${D.floor}...`)}`, 'log-enter');
        renderDungeonView();
        return;
    }

    // ── Fresh run — start from the player's current floor (loaded from DB) ──
    D.activeDungeon = 'tower';
    global.__dungeonActive = true;
    const startFloor = D.floor || 1;  // already set by loadDungeonDataFromDB
    D.rooms = normalizeRoomMonsters(normalizeMiniBossRooms(generateFloor('tower', startFloor), startFloor), startFloor);
    
    if (!D.rooms || D.rooms.length === 0) {
        log(_pt('Falha ao gerar a masmorra. Tente novamente.', 'Failed to generate dungeon. Please try again.'), 'log-danger');
        return;
    }
    
    D.playerPos = D.rooms.findIndex(r => r.isStart);
    if (D.playerPos === -1) D.playerPos = 0;
    
    D.exploredRooms = new Set([D.playerPos]);
    D.crawler = spawnCrawlerForCurrentFloor();
    D.floorRunId = createFloorRunId();
    D.dungeonLog = [];
    saveState();
    saveProgressToDB();

    log(`${_pt(`⚔️ Entrou na Torre Infinita – Andar ${startFloor}`, `⚔️ Entered The Endless Tower – Floor ${startFloor}`)}`, 'log-enter');
    renderDungeonView();
}

function travelToRoom(targetIdx) {
    if (D.isTraveling || D.combat) return;
    const current = D.rooms[D.playerPos];
    if (!current.connections.includes(targetIdx)) return;
    
    const target = D.rooms[targetIdx];
    const hasAliveMonsters = current.monsters && current.monsters.some(m =>
        !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)
    );
    const hasEvaded = current.monstersEvaded === true;
    const canLeaveWithoutFight = current.isMiniBoss || current.type === 'miniboss';
    
    if (hasAliveMonsters && !hasEvaded && !canLeaveWithoutFight) {
        log(`${_pt(`⚠️ Você deve derrotar ou fugir dos ${current.monsters.length} inimigos nesta sala antes de sair!`, `⚠️ You must defeat or escape from the ${current.monsters.length} enemies in this room before leaving!`)}`, 'log-danger');
        return;
    }
    
    if (current.monstersEvaded) {
        current.monstersEvaded = false;
    }

    const targetAlreadyExplored = D.exploredRooms.has(targetIdx);
    const bar = document.getElementById('dungeon-travel-bar');
    const finishTravel = () => {
        D.playerPos = targetIdx;
        D.exploredRooms.add(targetIdx);
        D.isTraveling = false;
        D.travelTimer = null;
        saveState();
        saveProgressToDB();

        if (bar) {
            bar.style.transition = 'none';
            bar.style.width = '0%';
        }

        const destLabel = _pt(
          target.isBoss ? '⚠️ SALA DO CHEFE' : target.type === 'treasure' ? '💰 Sala do Tesouro' : `Sala ${targetIdx+1}`,
          target.isBoss ? '⚠️ BOSS ROOM' : target.type === 'treasure' ? '💰 Treasure Room' : `Room ${targetIdx+1}`
        );
        log(`📍 ${_pt('Chegou a ', 'Arrived at ')}${destLabel}`, 'log-arrive');

        if (target.type === 'treasure' && !target.looted) {
            target.looted = true;
            apiFetch('POST', '/game/dungeon/treasure-loot', { floor: D.floor, roomIndex: targetIdx, floorRunId: D.floorRunId })
                .then(res => {
                    if (!res || !res.success) throw new Error(res?.error || 'Treasure loot failed.');
                    if (Array.isArray(res.granted) && res.granted.length) {
                        for (const it of res.granted) {
                            if (it.type === 'dungeon_gold') log(`${_pt(`💰 +${it.amount} ouro de masmorra`, `💰 +${it.amount} dungeon gold`)}`, 'log-loot');
                            else log(`${_pt(`🎁 Tesouro encontrado: ${it.name || it.id || it.type}`, `🎁 Loot found: ${it.name || it.id || it.type}`)}`, 'log-loot');
                        }
                        updateDungeonGoldDisplay();
                    } else if (res.alreadyLooted) {
                        log(`${_pt('⚠️ Este tesouro já foi coletado — nenhum saque obtido.', '⚠️ This treasure was already collected — no loot gained.')}`, 'log-warning');
                    } else {
                        log(`${_pt('🕳️ O baú está vazio...', '🕳️ The chest is empty...')}`, 'log-loot');
                    }
                })
                .catch(e => {
                    console.error('Failed to collect treasure loot:', e);
                    log(`${_pt('⚠️ Não foi possível coletar o tesouro.', '⚠️ Could not collect treasure loot.')}`, 'log-warning');
                });
        }
        if (!moveCrawlerAfterPlayerMove()) {
            renderDungeonView();
        }
    };

    if (targetAlreadyExplored) {
        finishTravel();
        return;
    }

    D.isTraveling = true;
    updateTravelBtn(targetIdx, true);
    log(`${_pt(`🚶 Viajando para a Sala ${targetIdx + 1}...`, `🚶 Traveling to Room ${targetIdx + 1}...`)}`, 'log-travel');

    const travelMs = TRAVEL_BASE_MS;
    if (bar) {
        bar.style.transition = `width ${travelMs}ms linear`;
        bar.style.width = '100%';
    }

    D.travelTimer = setTimeout(finishTravel, travelMs);
}
function initiateFight(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room || !room.monsters || room.monsters.length === 0) return;
    startCombat(roomIdx);
}

function startCombat(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room || !room.monsters || room.monsters.length === 0) return;

    // Prevent entering combat at 0 HP (otherwise the UI can get stuck "connecting" and server will reject anyway).
    // The Trial of the Arcane uses a fixed trial party with its own HP — the player character's HP is irrelevant.
    if (!D.eventMode) {
        const c0 = getChar();
        const hp0 = Number(c0?.hp_current ?? c0?.hp ?? c0?.hp_max ?? 0);
        if (Number.isFinite(hp0) && hp0 <= 0) {
            const msg = _pt('Você está com 0 de HP. Saia da masmorra para se recuperar antes de lutar novamente.', 'You are at 0 HP. Leave the dungeon to recover before fighting again.');
            if (typeof openGameDialog === 'function') {
                openGameDialog({ title: _pt('Sem HP', 'Out of HP'), message: msg, confirmLabel: 'OK', showCancel: false }).catch(() => {});
            } else {
                alert(msg);
            }
            return;
        }
    }

    // Check if already cleared (server-side protection)
    // Hardening: invalid persisted timestamps (string/boolean/etc.) should not soft-lock combat.
    if (room.monstersCleared && (!Number.isFinite(Number(room.monstersCleared)) || Number(room.monstersCleared) <= 0)) room.monstersCleared = null;
    room.monsters.forEach(m => { if (m && m.lastKilled && (!Number.isFinite(Number(m.lastKilled)) || Number(m.lastKilled) <= 0)) m.lastKilled = null; });
    if (room.monstersCleared) {
        // Cooldown is aligned with MONSTER_RESPAWN_H. After respawn, allow clearing again.
        if (!elapsed(Number(room.monstersCleared), MONSTER_RESPAWN_H)) {
            const hoursLeft = (MONSTER_RESPAWN_H - (Date.now() - Number(room.monstersCleared)) / 3600000).toFixed(1);
            log(`${_pt(`💤 Saque em recarga (${hoursLeft}h) — você ainda pode lutar.`, `💤 Loot on cooldown (${hoursLeft}h) — you can still fight.`)}`, 'log-info');
            // Cooldown should only block loot, not combat itself.
        }
        // Only clear the flag when cooldown elapsed; otherwise keep it so we still know loot is gated.
        if (elapsed(Number(room.monstersCleared), MONSTER_RESPAWN_H)) room.monstersCleared = null;
    }

    // Check if any monsters are alive
    const anyAlive = room.monsters.some(m => !m.lastKilled || elapsed(Number(m.lastKilled), MONSTER_RESPAWN_H));
    if (!anyAlive) {
        const hoursLeft = (MONSTER_RESPAWN_H - (Date.now() - Number(room.monsters[0].lastKilled)) / 3600000).toFixed(1);
        log(`${_pt(`💤 Monstros renascem em ${hoursLeft}h`, `💤 Monsters respawn in ${hoursLeft}h`)}`, 'log-info');
        return;
    }

    // Server-authoritative combat: don't show client-computed monster stats (they may differ).
    const clientStartId = `combat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    D.combat = {
        roomIdx,
        monsters: [],
        currentMonsterIndex: 0,
        // hp_current can be 0; don't fall back to 100.
        playerHpBefore: Number(getChar()?.hp_current ?? getChar()?.hp ?? 100),
        roundLog: [],
        serverAuth: !D.eventMode,    // event/trial uses its own /event/combat/act endpoint
        isTrial: !!D.eventMode,
        resolving: true,
        combatId: null,
        turnNonce: 0,
        clientStartId,
        manaPoints: 0,
        manaCap: 100,
        attackType: 'regular',
        // Trial party fields (populated from /event/combat/start response)
        party: [],
        trialActiveChar: 0,
        trialFocusMult: null,
        _focusSent: false,
        round: 1,
    };
    renderCombatPanel();
    // If the player scrolled the page before entering combat, scroll the tab content to the bottom
    // so the combat overlay sits flush with the viewport bottom.
    try {
      const scrollContainer = document.querySelector('.tab-content-area') || document.documentElement;
      scrollContainer.scrollTo({ top: scrollContainer.scrollHeight, left: 0, behavior: 'instant' });
    } catch(e) { try { (document.querySelector('.tab-content-area') || document.documentElement).scrollTop = 99999; } catch(_) {} }

    // Some users can have a stale character snapshot (e.g., hp_current from a previous tab/session).
    // Refresh in the background so the HP bar stabilizes quickly without delaying combat start.
    Promise.resolve(refreshCharacter?.())
        .catch(() => {})
        .finally(() => {
            if (!D.combat || D.combat.clientStartId !== clientStartId) return;
            D.combat.playerHpBefore = Number(getChar()?.hp_current ?? getChar()?.hp ?? D.combat.playerHpBefore ?? 100);
            renderCombatPanel();
        });

    // Wait for any pending room-exit to complete before starting new combat, otherwise
    // the race can create a session that gets immediately ended by the in-flight exit query.
    const exitGuard = Promise.resolve(D._exitingRoom).then(() => { D._exitingRoom = null; });

    const preKey = `${D.floor}:${roomIdx}:${String(D.floorRunId || '')}`;
    const startPromise = exitGuard.then(() => {
        return (D._combatPrefetch && D._combatPrefetch.key === preKey)
            ? (D._combatPrefetch.res ? Promise.resolve(D._combatPrefetch.res) : (D._combatPrefetch.promise || Promise.resolve(null)))
            : apiFetch('POST', D.eventMode ? '/event/combat/start' : '/game/dungeon/combat/start', D.eventMode ? { roomIndex: roomIdx } : { floor: D.floor, roomIndex: roomIdx, kind: 'room', floorRunId: D.floorRunId });
    });

    startPromise
        .then(res => {
            if (!D.combat || D.combat.roomIdx !== roomIdx) return;
            if (!res || !res.success) throw new Error(res?.error || 'Failed to start combat.');
            if (res?.debug) console.debug('[dungeon combat start]', res.debug);
            D.combat.combatId = res.combatId;
            D.combat.turnNonce = Number(res.turnNonce || 0);
            if (Array.isArray(res.monsters) && res.monsters.length) {
                D.combat.monsters = res.monsters.map(m => ({
                    ...m,
                    currentHp: m.currentHp ?? m.hp ?? m.maxHp,
                    maxHp: m.maxHp ?? m.hp ?? m.currentHp,
                }));
                D.combat.currentMonsterIndex = Number(res.currentMonsterIndex || 0);
            }
            if (Array.isArray(res.party) && res.party.length) {
                D.combat.isTrial = true;
                D.combat.party = res.party;
                D.combat.trialActiveChar = Math.min(0, res.party.length - 1);
            }
            if (typeof res.manaPoints === 'number') D.combat.manaPoints = res.manaPoints;
            if (typeof res.manaCap === 'number') D.combat.manaCap = res.manaCap;
            if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
            D.combat.resolving = false;
            if (D.combat.isTrial) {
                // Battle Focus: the battle's FIRST skill check, rolled once at combat
                // start. Its linear score becomes the damage + score multiplier for the
                // WHOLE battle (sent with the first action, banked server-side).
                D.combat.trialFocusMult = null;
                D.combat._focusSent = false;
                setTimeout(rollTrialFocusCheck, 600);
                // Real-time combat starts ticking the moment the session exists.
                startTrialHeartbeat();
            }
            saveState();
            // Best-effort: sync progress + fresh character snapshot after combat has started.
            saveProgressToDB();
            Promise.resolve(refreshCharacter?.()).catch(() => {});
            renderCombatPanel();
        })
        .catch(err => {
            console.error('Failed to start server combat:', err);
            if (D.combat && D.combat.roomIdx === roomIdx) {
                D.combat.resolving = false;
          D.combat.roundLog.push({ actor: 'monster', text: _pt('⚠️ Combate do servidor indisponível. Tente reconectar.', '⚠️ Server combat unavailable. Try reconnecting.') });
                renderCombatPanel();
            }
        });
}

function fightRound() {
    if (!D.combat) return;
    D.combat._lastAttackType = D.combat.attackType || 'regular';

    const atkType = D.combat.attackType || 'regular';

    // Don't attempt burst/ultimate without enough mana
    const manaNeeded = atkType === 'ultimate' ? 100 : atkType === 'burst' ? 60 : 0;
    if (manaNeeded > 0 && (D.combat.manaPoints ?? 0) < manaNeeded) {
        D.combat.attackType = 'regular';
        D.combat.roundLog.push({ actor: 'player', text: _pt('⚠️ Mana insuficiente — voltou para ataque normal.', '⚠️ Not enough mana — switched to regular attack.') });
        D.combat._skillCheckDone = false;
        renderCombatPanel();
        return;
    }

    // Burst/Ultimate trigger skill check before the round
    if ((atkType === 'burst' || atkType === 'ultimate') && !D.combat._skillCheckDone) {
      showSkillCheck(atkType, (mult) => {
        console.log('[SKILL_CHECK] Got multiplier:', mult, 'from attack:', atkType);
        D.combat.skillCheckMult = mult;
        D.combat._skillCheckDone = true;
        fightRound();
      });
      return;
    }

    if (D.combat.serverAuth) {
        // Crawler has its own endpoints for now.
        if (D.combat.isCrawler) {
        if (D.combat.resolving) return;
        if (!D.combat.combatId) {
            D.combat.roundLog.push({ actor: 'player', text: '...' });
            renderCombatPanel();
            return;
        }
        D.combat.resolving = true;
        renderCombatPanel();
        apiFetch('POST', '/game/dungeon/crawler-combat/act', { combatId: D.combat.combatId, action: 'fight', turnNonce: D.combat.turnNonce })
            .then(res => {
                if (!D.combat || !D.combat.isCrawler) return;
                if (!res || !res.success) throw new Error(res?.error || 'Crawler action failed.');
                D.combat.turnNonce = Number(res.turnNonce || (D.combat.turnNonce + 1));
                if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
                if (res.monster) {
                    const m = { ...D.combat.monsters[0], ...res.monster };
                    m.currentHp = Number(res.monster.currentHp ?? m.currentHp ?? m.maxHp ?? m.hp);
                    m.maxHp = Number(res.monster.maxHp ?? m.maxHp ?? m.hp);
                    D.combat.monsters = [m];
                    if (D.crawler && D.crawler.monster) {
                        D.crawler.monster.currentHp = m.currentHp;
                        D.crawler.monster.maxHp = m.maxHp;
                    }
                }
                const c = getChar();
                if (c && res.player && typeof res.player.hp === 'number') {
                    const serverMaxHp = Number(res.player.maxHp || 0) || 0;
                    if (serverMaxHp > 0 && (!Number.isFinite(Number(c.hp_max)) || Number(c.hp_max) < serverMaxHp)) {
                        // Keep client snapshot in sync with server-computed "true" max HP (gear/set bonuses).
                        c.hp_max = serverMaxHp;
                    }
                    const maxHp = serverMaxHp > 0 ? serverMaxHp : (Number(c.hp_max || 0) || 0);
                    const nextHp = Number(res.player.hp);
                    if (maxHp > 0 && (nextHp < 0 || nextHp > maxHp)) {
                        console.warn('[dungeon] Ignoring invalid server HP', { nextHp, maxHp, serverMaxHp });
                    } else {
                        c.hp_current = res.player.hp;
                        c.hp = res.player.hp;
                        if (typeof renderTopBar === 'function') renderTopBar();
                    }
                }
                if (res.ended && res.outcome === 'player_dead') {
                    D.combat.resolving = false;
                    onPlayerDeath();
                    return;
                }
                if (res.ended && res.outcome === 'crawler_defeated') {
                    // Keep existing client handling (marks crawler defeated + UI), but battle math already validated server-side.
                    D.combat.resolving = false;
                    onCrawlerDefeated();
                    return;
                }
                D.combat.resolving = false;
                saveState();
                saveProgressToDB();
                renderCombatPanel();
                triggerCombatAnimations();
            })
            .catch(err => {
                console.error('Crawler fight action failed:', err);
                if (D.combat && D.combat.isCrawler) {
                    D.combat.resolving = false;
                    D.combat.roundLog.push({ actor: 'monster', text: `⚠️ ${String(err.message || err)}` });
                    renderCombatPanel();
                    triggerCombatAnimations();
                }
            });
        return;
        }

        // Regular room + boss combat uses unified endpoint.
        if (D.combat.resolving) return;
        if (!D.combat.combatId) {
            D.combat.roundLog.push({ actor: 'monster', text: _pt('⚠️ Ainda conectando ao combate do servidor...', '⚠️ Still connecting to server combat...') });
            renderCombatPanel();
            triggerCombatAnimations();
            return;
        }
        D.combat.resolving = true;
        renderCombatPanel();
        const skillCheckMult = D.combat.skillCheckMult ?? 1;
        console.log('[SKILL_CHECK] Sending skillCheckMult:', skillCheckMult, 'attackType:', D.combat.attackType);
        apiFetch('POST', '/game/dungeon/combat/act', { combatId: D.combat.combatId, action: 'fight', turnNonce: D.combat.turnNonce, currentMonsterIndex: D.combat.currentMonsterIndex, attackType: D.combat.attackType || 'regular', skillCheckMult })
            .then(res => {
                // Save pre-update monster card state for animation targeting
                const oldOverlay = document.getElementById('dungeon-overlay');
                const oldMside = oldOverlay?.querySelector('.monster-side');
                const oldMc = oldMside?.querySelector('.monster-combat-card');
                if (oldMc && D.combat) {
                    const r = oldMc.getBoundingClientRect();
                    const oldIdx = D.combat.currentMonsterIndex;
                    D.combat._prevMonsterRect = { left: r.left, top: r.top, width: r.width, height: r.height };
                    D.combat._prevMonsterName = D.combat.monsters?.[oldIdx]?.name;
                    D.combat._prevMonsterIdx = oldIdx;
                }
                D.combat._skillCheckDone = false;
                D.combat.skillCheckMult = undefined;
                if (!D.combat) return;
                if (!res || !res.success) throw new Error(res?.error || 'Combat action failed.');
                if (res?.debug) console.debug('[dungeon combat act]', res.debug);
                D.combat.turnNonce = Number(res.turnNonce || (D.combat.turnNonce + 1));
                if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
                if (Array.isArray(res.monsters) && res.monsters.length) {
                    D.combat.monsters = res.monsters.map(m => ({
                        ...m,
                        currentHp: m.currentHp ?? m.hp ?? m.maxHp,
                        maxHp: m.maxHp ?? m.hp ?? m.currentHp,
                    }));
                    D.combat.currentMonsterIndex = Number(res.currentMonsterIndex || 0);
                }
                if (res.player && typeof res.player.hp === 'number') {
                    const c = getChar();
                    if (c) {
                        // Safety: don't apply obviously bogus HP from transient server bugs.
                        const serverMaxHp = Number(res.player.maxHp || 0) || 0;
                        if (serverMaxHp > 0 && (!Number.isFinite(Number(c.hp_max)) || Number(c.hp_max) < serverMaxHp)) {
                            c.hp_max = serverMaxHp;
                        }
                        const maxHp = serverMaxHp > 0 ? serverMaxHp : (Number(c.hp_max || 0) || 0);
                        const nextHp = Number(res.player.hp);
                        if (maxHp > 0 && (nextHp < 0 || nextHp > maxHp)) {
                            console.warn('[dungeon] Ignoring invalid server HP', { nextHp, maxHp, serverMaxHp });
                        } else {
                        c.hp_current = res.player.hp;
                        c.hp = res.player.hp;
                        if (typeof renderTopBar === 'function') renderTopBar();
                        }
                    }
                }
                // Update mana state from server response
                if (typeof res.manaPoints === 'number') D.combat.manaPoints = res.manaPoints;
                if (typeof res.manaCap === 'number') D.combat.manaCap = res.manaCap;

                // Auto-reset attack type if not enough mana for it
                if (D.combat.attackType === 'ultimate' && (D.combat.manaPoints ?? 0) < 100) D.combat.attackType = 'regular';
                else if (D.combat.attackType === 'burst' && (D.combat.manaPoints ?? 0) < 60) D.combat.attackType = 'regular';

                if (res.ended && res.outcome === 'player_dead') {
                    D.combat.resolving = false;
                    onPlayerDeath();
                    return;
                }

                if (res.ended && res.outcome === 'room_cleared') {
                    // Loot is granted server-side; we just refresh UI.
                    const room = D.rooms && D.rooms[D.combat.roomIdx];
                    if (room && Array.isArray(room.monsters)) {
                        room.monsters.forEach(m => { m.lastKilled = Date.now(); m.currentHp = 0; });
                        room.monstersEvaded = false;
                        room.monstersCleared = Date.now();
                    }

                    // Trial of the Arcane — update live run stats from the server.
                    if (D.eventMode && res.eventStats) {
                        const st = res.eventStats;
                        D.eventRun = {
                            room_index: Number(st.room_index || 0),
                            score: Number(st.score || 0),
                            kills: Number(st.kills || 0),
                            bosses: Number(st.bosses || 0),
                            total_dmg: Number(st.total_dmg || 0),
                        };
                        log(`${_pt(`⭐ +${st.points} pontos do evento`, `⭐ Event +${st.points} points`)}`, 'log-loot');
                        updateEventScoreDisplay();
                    }

                    if (Array.isArray(res.lootGranted) && res.lootGranted.length) {
                        for (const it of res.lootGranted) {
                            if (it.type === 'dungeon_gold') log(`${_pt(`💰 +${it.amount} ouro de masmorra`, `💰 +${it.amount} dungeon gold`)}`, 'log-loot');
                            else log(`${_pt(`🎁 Tesouro concedido: ${it.name || it.id || it.type}`, `🎁 Loot granted: ${it.name || it.id || it.type}`)}`, 'log-loot');
                        }
                    } else if (res.cleared) {
                        log(`${_pt('⚠️ Sala já limpa — nenhum saque obtido.', '⚠️ Room already cleared — no loot gained.')}`, 'log-warning');
                    }
                    if (room && room.id && !D.eventMode) {
                        apiFetch('POST', '/game/dungeon/release-room', { roomId: room.id, cleared: true }).catch(() => {});
                    }
                    // Play final round animations then clean up
                    D.combat.resolving = false;
                    saveTargetRectForAnim();
                    // Ensure at least one monster has HP > 0 so the card renders for the death animation
                    if (D.combat && D.combat.monsters && D.combat.monsters.length > 0) {
                        const anyAlive = D.combat.monsters.some(m => m.currentHp > 0);
                        if (!anyAlive) D.combat.monsters[D.combat.monsters.length - 1].currentHp = 1;
                    }
                    renderCombatPanel();
                    // Set D.combat.monsters HP to 0 AFTER rendering (so monster card shows)
                    // but BEFORE triggerCombatAnimations (so dead monsters aren't counter-attackers)
                    if (D.combat && Array.isArray(D.combat.monsters)) {
                        D.combat.monsters.forEach(m => { m.currentHp = 0; });
                    }
                    triggerCombatAnimations();
                    // Dissolve the fallen monster card after the hit
                    setTimeout(() => {
                        const card = document.querySelector('.monster-combat-card');
                        if (card) {
                            pixelDissolveCard(card);
                        } else if (D.combat._prevMonsterRect) {
                            const r = D.combat._prevMonsterRect;
                            spawnFallbackParticles(r.left + r.width / 2, r.top + r.height / 2, 24);
                        }
                    }, 600);
                    setTimeout(() => {
                        D.combat = null;
                        saveState();
                        saveProgressToDB();
                        refreshCharacter();
                        renderDungeonView();
                    }, 2200);
                    return;
                }

                if (res.ended && res.outcome === 'event_complete') {
                    D._eventRunCompleted = true;
                    // Trial of the Arcane final boss defeated — free fight, no tokens spent.
                    if (res.eventStats) {
                        D.eventRun = {
                            room_index: Number(res.eventStats.room_index || 100),
                            score: Number(res.eventStats.score || 0),
                            kills: Number(res.eventStats.kills || 0),
                            bosses: Number(res.eventStats.bosses || 0),
                            total_dmg: Number(res.eventStats.total_dmg || 0),
                        };
                        updateEventScoreDisplay();
                    }
                    log(`${_pt('👁️ O Soberano Arcano foi derrotado! O Trial está completo!', '👁️ The Arcane Sovereign has fallen! The Trial is complete!')}`, 'log-boss');
                    D.combat.resolving = false;
                    saveTargetRectForAnim();
                    if (D.combat && D.combat.monsters && D.combat.monsters.length > 0) {
                        const anyAlive = D.combat.monsters.some(m => m.currentHp > 0);
                        if (!anyAlive) D.combat.monsters[D.combat.monsters.length - 1].currentHp = 1;
                    }
                    renderCombatPanel();
                    if (D.combat && Array.isArray(D.combat.monsters)) {
                        D.combat.monsters.forEach(m => { m.currentHp = 0; });
                    }
                    triggerCombatAnimations();
                    setTimeout(() => {
                        const card = document.querySelector('.monster-combat-card');
                        if (card) {
                            pixelDissolveCard(card);
                        } else if (D.combat && D.combat._prevMonsterRect) {
                            const r = D.combat._prevMonsterRect;
                            spawnFallbackParticles(r.left + r.width / 2, r.top + r.height / 2, 24);
                        }
                    }, 600);
                    setTimeout(() => {
                        D.combat = null;
                        finishEventRun(true);
                    }, 2200);
                    return;
                }

                if (res.ended && res.outcome === 'boss_defeated') {
                    const loot = res.bossLoot;
                    const boss = D.combat.monsters?.[0] || { name: 'Boss', icon: '⚠️' };
                    const nextFloor = D.floor + 1;
                    if (loot) {
                        log(`${_pt(`🏆 ANDAR ${D.floor} LIMPO! ${boss.name} derrotado!`, `🏆 FLOOR ${D.floor} CLEARED! ${boss.name} vanquished!`)}`, 'log-boss');
                        log(`${_pt(`💰 Saque: ${loot.gold} ouro | 💎 ${loot.gems} gemas | ✨ ${loot.premium?.name || 'Premium'}`, `💰 Loot: ${loot.gold} gold | 💎 ${loot.gems} gems | ✨ ${loot.premium?.name || 'Premium'}`)}`, 'log-success');
                        log(`${_pt('⬇️ As escadas para o próximo andar se abriram.', '⬇️ Stairs to the next floor have opened.')}`, 'log-success');
                    }
                    if (typeof res.tokens === 'number') {
                        D.tokens = res.tokens;
                        updateTokenDisplay();
                    }

                    // The floor does NOT advance on kill. The boss is permanently defeated and
                    // the floor descends only when the player takes the stairs (descendFloor).
                    D.bossDefeated = true;
                    D.combat.resolving = false;
                    saveTargetRectForAnim();
                    // Ensure at least one monster has HP > 0 so the card renders for the death animation
                    if (D.combat && D.combat.monsters && D.combat.monsters.length > 0) {
                        const anyAlive = D.combat.monsters.some(m => m.currentHp > 0);
                        if (!anyAlive) D.combat.monsters[D.combat.monsters.length - 1].currentHp = 1;
                    }
                    renderCombatPanel();
                    // Set D.combat.monsters HP to 0 AFTER rendering (so monster card shows)
                    // but BEFORE triggerCombatAnimations (so dead monsters aren't counter-attackers)
                    if (D.combat && Array.isArray(D.combat.monsters)) {
                        D.combat.monsters.forEach(m => { m.currentHp = 0; });
                    }
                    triggerCombatAnimations();
                    // Dissolve the defeated boss card after the hit
                    setTimeout(() => {
                        const card = document.querySelector('.monster-combat-card');
                        if (card) {
                            pixelDissolveCard(card);
                        } else if (D.combat && D.combat._prevMonsterRect) {
                            const r = D.combat._prevMonsterRect;
                            spawnFallbackParticles(r.left + r.width / 2, r.top + r.height / 2, 24);
                        }
                    }, 600);
                    // Show the victory modal only AFTER the death animation has cleared.
                    setTimeout(() => {
                        D.combat = null;
                        saveState();
                        saveProgressToDB();
                        refreshCharacter();
                        if (loot) showBossVictoryModal(boss, loot, nextFloor);
                        else renderDungeonView();
                    }, 2500);
                    return;
                }

                D.combat.resolving = false;
                saveState();
                saveProgressToDB();

                // --- Mid-combat monster death handling ---
                // Server returns `currentMonsterIndex` pointing to the same monster we attacked,
                // even when it dies — so detect death by HP, not index comparison.
                const regPrevIdx = D.combat._prevMonsterIdx;
                const regMonsterJustDied = (
                    regPrevIdx != null &&
                    D.combat.monsters[regPrevIdx]?.currentHp <= 0 &&
                    D.combat.monsters.some(m => m.currentHp > 0)
                );

                if (regMonsterJustDied) {
                    const regNextIdx = D.combat.monsters.findIndex(m => m.currentHp > 0);
                    const regOldRect = D.combat._prevMonsterRect;
                    const regOldCard = document.querySelector('.monster-combat-card');
                    const regOldHtml = regOldCard ? regOldCard.outerHTML : null;

                    // 1) Player lunge
                    const regPCard = document.querySelector('.combat-fighters > .fighter-card:first-child');
                    if (regPCard) {
                        const regAtk = D.combat._lastAttackType || 'regular';
                        if (regAtk === 'ultimate') {
                            regPCard.classList.add('combat-anim-player-ultimate');
                            const cp = document.querySelector('.dungeon-combat-panel');
                            if (cp) { cp.classList.add('combat-anim-screen-shake'); setTimeout(() => cp.classList.remove('combat-anim-screen-shake'), 400); }
                            setTimeout(() => regPCard.classList.remove('combat-anim-player-ultimate'), 1000);
                        } else if (regAtk === 'burst') {
                            regPCard.classList.add('combat-anim-player-burst');
                            setTimeout(() => regPCard.classList.remove('combat-anim-player-burst'), 800);
                        } else {
                            regPCard.classList.add('combat-anim-player-lunge');
                            setTimeout(() => regPCard.classList.remove('combat-anim-player-lunge'), 600);
                        }
                    }

                    // 2) Damage float at old monster position (t=400ms)
                    const regLastPlayerLog = D.combat.roundLog.slice().reverse().find(e => e.actor === 'player');
                    const regDmg = regLastPlayerLog
                        ? (regLastPlayerLog.text.match(/(\d+)\s*damage/i) || regLastPlayerLog.text.match(/for\s+(\d+)/i) || regLastPlayerLog.text.match(/(\d+)!/))
                        : null;
                    const regPlayerDmgVal = regDmg ? parseInt(regDmg[1]) : null;
                    const regAtkType = D.combat._lastAttackType || 'regular';
                    if (regPlayerDmgVal != null && regOldRect) {
                        setTimeout(() => {
                            const el = document.createElement('div');
                            let cls = 'combat-damage-float';
                            if (regAtkType === 'ultimate') cls += ' ultimate';
                            else if (regAtkType === 'burst') cls += ' burst';
                            el.className = cls;
                            el.textContent = `-${regPlayerDmgVal}`;
                            el.style.cssText = `position:fixed;left:${regOldRect.left + regOldRect.width/2 - 30}px;top:${regOldRect.top + 20}px;z-index:500000`;
                            document.body.appendChild(el);
                            setTimeout(() => el.remove(), 900);
                        }, 400);
                    }

                    // 3) Dissolve old card (t=600ms)
                    setTimeout(() => {
                        const pr = D.combat._prevMonsterRect;
                        if (regOldCard && regOldCard.parentNode) {
                            pixelDissolveCard(regOldCard);
                        } else if (pr && regOldHtml) {
                            const ghost = document.createElement('div');
                            ghost.style.cssText = `position:fixed;left:${pr.left}px;top:${pr.top}px;width:${pr.width}px;height:${pr.height}px;z-index:500000;pointer-events:none;overflow:hidden`;
                            ghost.innerHTML = regOldHtml;
                            document.body.appendChild(ghost);
                            pixelDissolveCard(ghost);
                        } else if (pr) {
                            spawnFallbackParticles(pr.left + pr.width/2, pr.top + pr.height/2, 24);
                        }
                    }, 600);

                    // 4) After dissolve, swap to next monster + play counter-attacks (t=1800ms)
                    const regPreRoundLen = D.combat.roundLog.length - (Array.isArray(res.log) ? res.log.length : 0);
                    const regPlayerCount = (Array.isArray(res.log) ? res.log : []).filter(e => e.actor === 'player').length;
                    const regLastPlayerLogIdx = regPreRoundLen + regPlayerCount - 1;

                    setTimeout(() => {
                        if (!D.combat) return;
                        D.combat.currentMonsterIndex = regNextIdx;
                        renderCombatPanel();
                        D.combat._lastAnimatedLogIdx = regLastPlayerLogIdx;
                        triggerCombatAnimations();
                    }, 1800);
                } else {
                    renderCombatPanel();
                    triggerCombatAnimations();
                }
            })
            .catch(err => {
                console.error('Server combat action failed:', err);
                if (D.combat) {
                    D.combat._skillCheckDone = false;
                    D.combat.resolving = false;
                    D.combat.roundLog.push({ actor: 'monster', text: `⚠️ ${String(err.message || err)}` });
                    renderCombatPanel();
                    triggerCombatAnimations();
                }
            });
        return;
    }

  function onCrawlerDefeated() {
    if (!D.crawler) return;
    D.crawler.defeated = true;
    D.crawler.active = false;
    D.crawler.encountered = false;
    D.crawler.chaseTurnsLeft = 0;
    D.crawler.monster.currentHp = 0;
    log(`${_pt('🏆 Contra todas as probabilidades, você derruba o Devorador!', '🏆 Against all odds, you bring down The Crawler!')}`, 'log-boss');
    apiFetch('POST', '/game/dungeon/crawler-event', { event: 'defeat' }).catch(() => {});
    D.combat = null;
    D._combatPrefetch = null;
    saveState();
    saveProgressToDB();
    renderDungeonView();
  }
}

// Release whichever lock a submit took: real actions park on `resolving` (the
// next click waits for the action's own response so state can't interleave),
// heartbeats park on `_heartbeatBusy` (the 1s clock tick must never gate a click).
function unlockTrialSubmit(isHeartbeat) {
    if (!D.combat) return;
    if (isHeartbeat) D.combat._heartbeatBusy = false;
    else D.combat.resolving = false;
}

function submitTrial(actions, endTurn, skillCheckMult, closing, isRetry) {
    // skillCheckMult is now ONLY the closing "Final Blow" check multiplier; the
    // battle-start Battle Focus roll rides along on the first action (see below).
    // endTurn is accepted (and ignored) for call-site compatibility — real-time
    // combat has no turns; the server clock ticks via the heartbeat.
    if (!D.combat || !D.combat.isTrial) return;
    if (!D.combat.combatId) {
        D.combat.roundLog.push({ actor: 'monster', text: _pt('⚠️ Ainda conectando ao combate do servidor...', '⚠️ Still connecting to server combat...') });
        renderCombatPanel();
        return;
    }
    if (!Array.isArray(actions)) actions = [];

    // The FIRST submit of the battle carries the Battle Focus roll (linear 1.0 at
    // dead-center → 0 at the rim). The server banks it once — clamped to 0.5–1.5× —
    // and applies it to all party damage and live score gains for the whole battle.
    let focusMult;
    if (!D.combat._focusSent) {
        D.combat._focusSent = true;
        focusMult = (typeof D.combat.trialFocusMult === 'number')
            ? D.combat.trialFocusMult
            : 0.75; // check somehow never ran → mild default, never a free 1.5×
        D.combat._focusMultSent = focusMult; // banked for a 409 retry (stale submit never applied)
    } else if (typeof D.combat._focusMultSent === 'number') {
        focusMult = D.combat._focusMultSent;
    }

    // In real-time combat a pure heartbeat must NOT block the buttons: it parks
    // on _heartbeatBusy instead of `resolving`, so the 1-second clock tick can
    // never swallow a click that lands while it is in flight. Cooldowns — not
    // request locks — gate how often each ability may fire.
    const isHeartbeat = !closing && (!Array.isArray(actions) || actions.length === 0);
    if (isHeartbeat) {
        if (D.combat._heartbeatBusy) return;
        D.combat._heartbeatBusy = true;
    } else {
        if (D.combat.resolving) return;
        D.combat.resolving = true;
    }
    D.combat._lastAttackType = 'regular';
    if (!isHeartbeat) {
        renderCombatPanel();
        // Snapshot the fighter cards BEFORE this action re-renders the panel. If a
        // previous action already stashed pending deaths (killing blow → Final Blow
        // skill check), keep THAT stash — it describes the moment before death; the
        // panel hasn't re-rendered since, so its rects are still exact.
        D.combat._deathPrev = D.combat._pendingDeathShatters || captureTrialCardSnapshots();
    }

    // Server-clock sync: send the client's now + the delta since the previous
    // tick so the battle advances ONLY by real elapsed time, even across tabs.
    const nowMs = Date.now();
    const dtMs = D.combat._lastTickSent ? Math.max(0, nowMs - D.combat._lastTickSent) : 0;
    D.combat._lastTickSent = nowMs;

    apiFetch('POST', '/event/combat/act', {
        combatId: D.combat.combatId,
        turnNonce: D.combat.turnNonce,
        actions,
        now: nowMs,
        dtMs,
        ...(focusMult !== undefined ? { focusMult } : {}),
        ...(typeof skillCheckMult === 'number' && Number.isFinite(skillCheckMult) ? { skillCheckMult } : {}),
        ...(closing ? { closing: true } : {}),
    })
        .then(res => {
            if (!D.combat || !D.combat.isTrial) return;
            if (!res || !res.success) throw new Error(res?.error || 'Trial action failed.');
            D.combat.turnNonce = Number(res.turnNonce || (D.combat.turnNonce + 1));
            if (typeof res.serverNow === 'number') {
                D.combat._serverNow = Number(res.serverNow);
                D.combat._serverNowAtClient = Date.now();
            }
            if (Array.isArray(res.log) && res.log.length) {
                D.combat.roundLog.push(...res.log);
                if (isHeartbeat) {
                    // Heartbeats arrive every second — refresh ONLY the log node so
                    // the live fight updates without a full panel rebuild. The log is
                    // NOT trimmed: animation tracking is index-based, and trimming
                    // shifts indexes so old entries replay as wrong animations
                    // (the "everything turns Frost after a burst" glitch).
                    const logNode = document.querySelector('.dungeon-trial-panel .combat-log');
                    if (logNode) {
                        logNode.innerHTML = D.combat.roundLog.slice(-10).reverse().map(e =>
                            `<div class="combat-log-entry ${e.actor}">${_ptCombat(e.text)}</div>`).join('');
                    }
                }
            }
            const gainedCombos = Math.max(0, Number(res.comboPoints || 0));
            if (gainedCombos > 0) trialComboFlash(gainedCombos);

            if (Array.isArray(res.monsters) && res.monsters.length) {
                D.combat.monsters = res.monsters.map(m => ({
                    ...m,
                    currentHp: m.currentHp ?? m.hp ?? m.maxHp,
                    maxHp: m.maxHp ?? m.hp ?? m.currentHp,
                }));
                // Keep the player's chosen target (trial parties pick the target per
                // action — the server's echo is always 0 and must NOT overwrite it).
                let keptSel = Math.max(0, Number(D.combat.currentMonsterIndex || 0));
                if (keptSel >= D.combat.monsters.length) keptSel = 0;
                D.combat.currentMonsterIndex = keptSel;
            }
            if (Array.isArray(res.party) && res.party.length) D.combat.party = res.party;

            // The active champion NEVER changes by itself — the player stays in
            // control of who acts next. Real-time combat has no rounds to end.
            // Stash the pre-action snapshots — deaths shatter only AFTER the attack
            // and retaliation animations finish. At this moment a closing skill check
            // may still be open on top of the panel, so nothing shatters yet.
            // Run-level kill/boss totals sync on EVERY action (server banks them live).
            syncEventRunStats({ kills: res.runKills, bosses: res.runBosses });
            const deathPrev = D.combat._deathPrev;
            const hadDeath = (res.newKills || 0) > 0
                || (Array.isArray(D.combat.party) && Array.isArray(res.party)
                    && res.party.some((c, i) => D.combat.party[i]?.alive && !c.alive));
            // Keep the stash through a closing call too — it snapshots the moment
            // BEFORE the killing blow, which is exactly what must shatter later.
            D.combat._pendingDeathShatters = (hadDeath || closing) ? deathPrev : null;
            D.combat._deathPrev = null;
            if (D.combat._deathShatterTimer) { clearTimeout(D.combat._deathShatterTimer); D.combat._deathShatterTimer = null; }

            // Live score: the server credits kills/boss-kills/elemental combos the instant
            // they happen (plus the room-clear damage conversion and closing flourish), so
            // update the HUD number and float the gained points on the score pill.
            if (typeof res.currentScore === 'number' && res.currentScore !== Number(D.eventRun?.score ?? 0)) {
                D.eventRun = { ...(D.eventRun || {}), score: res.currentScore };
                updateEventScoreDisplay();
                const deductPts = Math.max(0, Math.floor(Number(res.scoreDeducted || 0)));
                if (deductPts > 0) flashScoreGain(-deductPts, 'damage');
                const delta = Math.max(0, Math.floor(Number(res.scoreDelta || 0)));
                if (delta > 0) {
                    const cat = (res.newBosses || 0) > 0 ? 'boss' : (res.newKills || 0) > 0 ? 'kill' : res.closing ? 'flourish' : (res.comboPoints || 0) > 0 ? 'combo' : 'kill';
                    flashScoreGain(delta, cat);
                }
            }

            // If the current target just died, auto-select the first alive monster so the
            // big VS card + 🎯 highlight stay on a living target for the next turn.
            const aliveNow = (D.combat.monsters || []).some(m => Number(m.currentHp || 0) > 0);
            if (aliveNow && D.combat.monsters[D.combat.currentMonsterIndex] && Number(D.combat.monsters[D.combat.currentMonsterIndex].currentHp || 0) <= 0) {
                const firstAlive = D.combat.monsters.findIndex(m => Number(m.currentHp || 0) > 0);
                D.combat.currentMonsterIndex = firstAlive >= 0 ? firstAlive : 0;
            }

            if (res.ended && res.outcome === 'player_dead') {
                stopTrialHeartbeat();
                unlockTrialSubmit(isHeartbeat);
                onPlayerDeath();
                return;
            }

            if (res.ended && (res.outcome === 'room_cleared' || res.outcome === 'event_complete')) {
                const isComplete = res.outcome === 'event_complete';
                stopTrialHeartbeat();
                if (isHeartbeat) D.combat._heartbeatBusy = false; // a tick may deliver the clear
                if (res.closing) {
                    // The Final Blow check resolved the battle — its multiplier already
                    // paid out server-side (the full point adjustment is in eventStats).
                    applyEventClear(res.eventStats, isComplete, { noPointLog: true });
                    return;
                }
                // A second clear echo (this click + an in-flight heartbeat both
                // delivering it, or a 409 retry landing after the first) must NOT
                // schedule a second Final Blow check — the skill check overlay
                // would spawn twice and the battle would double-pay.
                if (D.combat._flourishScheduled) {
                    // A stray click echo arriving after the real clear must not
                    // schedule a second check — but its request still holds the
                    // `resolving` lock, so release it or the closing Final Blow
                    // submit (from the first flourish) is swallowed and the battle
                    // never resolves.
                    unlockTrialSubmit(isHeartbeat);
                    return;
                }
                D.combat._flourishScheduled = true;
                // First arrival at the clear — ability kill OR End Turn: the battle stays
                // open. The Final Blow check is the battle's LAST act and multiplies its
                // total points, so it can never be skipped by ending the turn. Play the
                // killing blow first, then the check; the shatter fires via the closing
                // submit (the stash survives it, describing the pre-death moment).
                // Remember the clear so a failed closing act can still tear the battle down.
                if (!D.combat._pendingClear) D.combat._pendingClear = { eventStats: res.eventStats, isComplete };
                // The killing act must NOT leave `resolving` wedged: the Final Blow
                // closing submit below is a NEW request and needs the lock free, or
                // the closing act is swallowed and the battle never resolves.
                unlockTrialSubmit(isHeartbeat);
                renderCombatPanel();
                triggerCombatAnimations();
                setTimeout(() => runTrialClosingFlourish(isComplete), endTurn ? 400 : 1400);
                return;
            }

            unlockTrialSubmit(isHeartbeat);
            if (!isHeartbeat) {
                saveState();
                renderCombatPanel();
                triggerCombatAnimations();
            } else {
                // Heartbeat: light-touch refresh (HP/energy numbers) + animate tick
                // events — monster strikes and burn DoT must never be invisible
                // just because the player didn't act this second.
                updateTrialLiveHud();
                triggerCombatAnimations();
            }

            // Fire the stashed death shatters once the attack/retaliation timeline has
            // fully played out (delays mirror triggerTrialCombatAnimations exactly —
            // ultimate projectiles run a touch longer: +160ms per player strike).
            // Heartbeats (tick strikes only) shatter after a short fixed delay.
            const resLog = Array.isArray(res.log) ? res.log : [];
            const pAtk = !isHeartbeat ? resLog.filter(e => e.actor === 'player' && e.text && e.text.includes('→')).length : 0;
            const mAtk = resLog.filter(e => e.actor === 'monster').length;
            const hasUlt = !isHeartbeat && resLog.some(e => e.actor === 'player' && isTrialUltimateLog(e.text));
            const playerEnd = pAtk ? 120 + (pAtk - 1) * 700 + (hasUlt ? 460 : 380) + 500 : 0;
            const monEnd = mAtk ? (isHeartbeat ? 450 : 700 + pAtk * 700 + (mAtk - 1) * 650 + 300) + 450 : 0;
            if (D.combat._pendingDeathShatters || D.combat._deathShatterTimer) {
                if (D.combat._deathShatterTimer) clearTimeout(D.combat._deathShatterTimer);
                D.combat._deathShatterTimer = setTimeout(() => {
                    firePendingTrialDeathShatters();
                }, Math.max(playerEnd, monEnd, isHeartbeat ? 500 : 900));
            }
        })
        .catch(err => {
            console.error('Trial action failed:', err);
            if (!D.combat || !D.combat.isTrial) return;
            const body = err && err.data;
            // A 409 means OUR nonce fell behind the server's and the action was NOT
            // applied (lost/dropped response, a heartbeat slipping past a skill check,
            // a second tab, ...). Re-sync to the server's nonce and retry EXACTLY once:
            // the stale request never executed, so a retry cannot duplicate effects.
            if (!isRetry && err && err.status === 409 && body && typeof body.turnNonce === 'number') {
                D.combat.turnNonce = Number(body.turnNonce);
                unlockTrialSubmit(isHeartbeat);
                submitTrial(actions, endTurn, skillCheckMult, closing, true);
                return;
            }
            unlockTrialSubmit(isHeartbeat);
            if (closing && D.combat._pendingClear) {
                // The room was already cleared server-side (the first-clear response
                // confirmed it) but the closing act could not be delivered. Tear the
                // battle down with the known stats so the screen can never deadlock on
                // a room whose monsters are all dead.
                applyEventClear(D.combat._pendingClear.eventStats, D.combat._pendingClear.isComplete, { noPointLog: true });
                return;
            }
            D.combat.roundLog.push({ actor: 'monster', text: `⚠️ ${String(err.message || err)}` });
            renderCombatPanel();
        });
}

// Room-clear teardown for the Trial: celebrate the win, mark monsters dead for the
// death animation, flash the score, then leave the combat and open the next room.
function applyEventClear(eventStats, isComplete, opts) {
    if (!D.combat || !D.combat.isTrial) return;
    stopTrialHeartbeat();
    const room = D.rooms && D.rooms[D.combat.roomIdx];
    if (room && Array.isArray(room.monsters)) {
        room.monsters.forEach(m => { m.lastKilled = Date.now(); m.currentHp = 0; });
        room.monstersEvaded = false;
        room.monstersCleared = Date.now();
    }
    opts = opts || {};
    if (eventStats) {
        const st = eventStats;
        D.eventRun = {
            room_index: Number(st.room_index || 0),
            score: Number(st.score || 0),
            kills: Number(st.kills || 0),
            bosses: Number(st.bosses || 0),
            total_dmg: Number(st.total_dmg || 0),
        };
        updateEventScoreDisplay();
        if (!opts.noPointLog) {
            log(`${_pt(`⭐ +${st.points} pontos do evento`, `⭐ Event +${st.points} points`)}`, 'log-loot');
        }
    }
    if (isComplete) {
        D._eventRunCompleted = true;
        log(`${_pt('👁️ O Soberano Arcano foi derrotado! O Trial está completo!', '👁️ The Arcane Sovereign has fallen! The Trial is complete!')}`, 'log-boss');
    }
    D.combat.resolving = false;
    saveTargetRectForAnim();
    if (D.combat && D.combat.monsters && D.combat.monsters.length > 0) {
        const anyAlive = D.combat.monsters.some(m => m.currentHp > 0);
        if (!anyAlive) D.combat.monsters[D.combat.monsters.length - 1].currentHp = 1;
    }
    renderCombatPanel();
    if (D.combat && Array.isArray(D.combat.monsters)) {
        D.combat.monsters.forEach(m => { m.currentHp = 0; });
    }
    triggerCombatAnimations();
    // Clear-time shatter: fire the stashed pre-death ghosts (Final Blow path) or
    // capture the dead row cards as they are and shatter every one of them — but
    // only AFTER the attack/retaliation timeline has finished playing.
    setTimeout(() => {
        if (!D.combat) return;
        if (D.combat._pendingDeathShatters || D.combat._deathShatterTimer) {
            if (D.combat._deathShatterTimer) { clearTimeout(D.combat._deathShatterTimer); D.combat._deathShatterTimer = null; }
            firePendingTrialDeathShatters();
            return;
        }
        const overlay = document.getElementById('dungeon-overlay');
        const cards = overlay ? [...overlay.querySelectorAll('.trial-mon-card')] : [];
        cards.forEach(node => {
            const rect = node.getBoundingClientRect();
            if (!rect.width || !rect.height) return;
            const ghost = document.createElement('div');
            ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:500000;pointer-events:none;overflow:hidden;border-radius:12px`;
            ghost.appendChild(node.cloneNode(true));
            document.body.appendChild(ghost);
            pixelDissolveCard(ghost);
            setTimeout(() => { try { ghost.remove(); } catch (e) { /* noop */ } }, 3200);
        });
    }, 2000);
    setTimeout(() => {
        D.combat = null;
        saveState();
        saveProgressToDB();
        if (isComplete) finishEventRun(true);
        else renderDungeonView();
    }, 3800);
}

// Last monster died to an ability mid-turn: run the "Final Blow" skill check and
// send it as the closing act. The server awards a linear flourish bonus (dead-center
// = 1.0 → edges = 0) and marks the room cleared. Then the normal clear teardown plays.
function runTrialClosingFlourish(isComplete) {
    if (!D.combat || !D.combat.isTrial) return;
    // The closing check must spawn exactly once — a stray second call (retry,
    // duplicate clear echo) would show two stacked overlays.
    if (D.combat._closingCheckOpen) return;
    D.combat._closingCheckOpen = true;
    showSkillCheck('closing', function (mult) {
        if (D.combat) D.combat._closingCheckOpen = false;
        submitTrial([], true, mult, true);
    });
}

// Queue one champion's action for the current round (resolves immediately,
// no retaliation until End Turn). Champions can only act once per round.
function trialUseAbility(abilityId) {
    if (!D.combat || !D.combat.isTrial) return;
    const active = D.combat.party?.[D.combat.trialActiveChar];
    const ability = (active?.abilities || []).find(a => a.id === abilityId);
    if (!active || !ability) return;
    if (!active.alive) return;
    const energy = Number(active.energy || 0);
    const maxEnergy = Math.max(1, Number(active.maxEnergy || 120));
    // Real-time gating mirrors the server: only the ultimate costs energy (a
    // full bar); bursts are free (cooldown-gated only) — they're generators,
    // like normal attacks. Wall-clock cooldown also gates every ability.
    if (energy < Number(ability.cost || 0)) return;
    if (ability.type === 'ultimate' && energy < maxEnergy) return;
    if (cdMsLeft(active, ability.id) > 0) return;
    submitTrial([{ characterIndex: D.combat.trialActiveChar, abilityId, currentMonsterIndex: D.combat.currentMonsterIndex }], false);
}

// Battle-start Battle Focus: the FIRST of only two checks per battle. Its linear
// score (1.0 center → 0 rim) becomes the damage + score multiplier for the WHOLE
// battle — ×1.5 at a perfect bullseye, ×0.5 at the rim. Blocking: actions wait.
function rollTrialFocusCheck() {
    if (!D.combat || !D.combat.isTrial) return;
    if (D.combat.resolving) return;
    if (D.combat._focusSent || typeof D.combat.trialFocusMult === 'number') return; // already rolled
    showSkillCheck('defend', (mult) => {
        if (!D.combat || !D.combat.isTrial) return;
        D.combat.trialFocusMult = mult;
        renderTrialCombatPanel();
    });
}

// In real-time combat there is nothing to skip — the battle clock runs on its
// own. The button just resets the local target lock (cosmetic) and stays
// enabled as long as its champion is alive.
function trialSkipAction() {
    if (!D.combat || !D.combat.isTrial) return;
    if (D.combat.resolving) return;
    const party = D.combat.party || [];
    const active = party[D.combat.trialActiveChar];
    if (!active || !active.alive) return;
    renderCombatPanel();
}

// Rounds no longer exist (real-time combat). Kept as a no-op for any stale
// call site — the server ignores endTurn.
function trialEndTurn() {}

// ── Real-time heartbeat ───────────────────────────────────────────────
// While a trial battle is open the client polls /event/combat/act once a
// second with NO action. Each poll carries the elapsed wall-clock delta; the
// server advances the battle (3s monster strikes, burn DoT, buff/cooldown
// expiry) and echoes the authoritative state. A parallel rAF-driven loop
// updates cooldown rings/seconds locally between polls so the UI feels live.
const TRIAL_HEARTBEAT_MS = 1000;

function trialHeartbeatTick() {
    if (!D.combat || !D.combat.isTrial || !D.combat.combatId) return;
    // A closing Final Blow check or a pending skill check blocks ticking.
    if (document.querySelector('#skill-check-overlay')) return;
    // The busy-flag lives INSIDE submitTrial: a heartbeat still in flight simply
    // absorbs this tick. If the tick set the flag here too, submitTrial's own
    // heartbeat branch would see itself busy and die instantly — no act request
    // would ever fire, freezing bars/log between clicks (live combat was dead).
    submitTrial([]);
}

function startTrialHeartbeat() {
    stopTrialHeartbeat();
    D.combat._heartbeatTimer = setInterval(trialHeartbeatTick, TRIAL_HEARTBEAT_MS);
    D.combat._cdAnimTimer = setInterval(updateTrialCooldownUi, 120);
}

function stopTrialHeartbeat() {
    if (D.combat && D.combat._heartbeatTimer) { clearInterval(D.combat._heartbeatTimer); D.combat._heartbeatTimer = null; }
    if (D.combat && D.combat._cdAnimTimer) { clearInterval(D.combat._cdAnimTimer); D.combat._cdAnimTimer = null; }
}

// Live HUD: HP/energy numbers + bars for champions and monsters, without a
// full panel rebuild (keeps animations and buttons stable between actions).
function updateTrialLiveHud() {
    if (!D.combat || !D.combat.isTrial) return;
    const party = D.combat.party || [];
    party.forEach((c, i) => {
        const node = document.getElementById(`trial-char-${i}`);
        if (!node) return;
        const hpPct = Math.round((Math.max(0, c.hp) / Math.max(1, c.maxHp)) * 100);
        const enPct = Math.round((Math.max(0, c.energy) / Math.max(1, c.maxEnergy)) * 100);
        const bars = node.querySelectorAll('.trial-hp, .trial-en');
        if (bars[0]) bars[0].style.width = `${c.alive ? hpPct : 0}%`;
        if (bars[1]) bars[1].style.width = `${enPct}%`;
        const stats = node.querySelectorAll('.trial-char-stat');
        if (stats[0]) stats[0].textContent = `❤️ ${Math.max(0, c.hp)}/${c.maxHp}`;
        if (stats[1]) stats[1].textContent = `🔷 ${Math.max(0, c.energy)}/${c.maxEnergy}`;
        node.classList.toggle('down', !c.alive);
    });
    (D.combat.monsters || []).forEach((m, i) => {
        const node = document.getElementById(`trial-mon-${i}`);
        if (!node) return;
        const hp = Math.max(0, Number(m.currentHp ?? m.hp ?? 0));
        const maxHp = Math.max(1, Number(m.maxHp ?? m.hp ?? 1));
        const bar = node.querySelector('.trial-hp');
        if (bar) bar.style.width = `${hp <= 0 ? 0 : Math.round((hp / maxHp) * 100)}%`;
        const stat = node.querySelector('.trial-char-stat');
        if (stat) stat.textContent = `${hp}/${maxHp}`;
        node.classList.toggle('down', hp <= 0);
        node.classList.toggle('frozen', hp > 0 && Number(m.freezeUntil || 0) > trialServerNowMs());
        node.classList.toggle('burning', hp > 0 && Number(m.burnTicksLeft || 0) > 0);
    });
    updateTrialCooldownUi();
}

// Cooldown UI: seconds pill + dark veil + disabled state on each ability
// button, updated ~8×/s from the synced server clock. No re-render needed.
function updateTrialCooldownUi() {
    const active = D.combat?.party?.[D.combat.trialActiveChar];
    if (!active) return;
    document.querySelectorAll('.dungeon-trial-panel .trial-ability-btn[data-abil]').forEach(btn => {
        const abilId = btn.getAttribute('data-abil');
        const abil = (active.abilities || []).find(a => a.id === abilId);
        if (!abil) return;
        const left = cdMsLeft(active, abilId);
        const total = Math.max(1000, Number(abil.cooldownMs || 5000));
        const pill = btn.querySelector('.trial-cd-pill');
        const veil = btn.querySelector('.trial-cd-veil');
        if (pill) {
            if (left > 0) { pill.style.display = ''; pill.textContent = Math.ceil(left / 1000); }
            else pill.style.display = 'none';
        }
        if (veil) {
            if (left > 0) {
                veil.style.display = '';
                veil.style.setProperty('--cd-frac', String(Math.min(1, left / total)));
            } else veil.style.display = 'none';
        }
        const energy = Number(active.energy || 0);
        const maxEnergy = Math.max(1, Number(active.maxEnergy || 120));
        const energyOk = abil.type === 'ultimate' ? energy >= maxEnergy : energy >= Number(abil.cost || 0);
        // Mirror buildTrialAbilityRowHtml's `locked` exactly: the button must not
        // re-enable mid-resolution or for a down champion.
        const isBusy = !!D.combat.resolving;
        const ready = left <= 0 && energyOk && !isBusy && !!active.alive;
        btn.classList.toggle('trial-ability-locked', !ready);
        btn.classList.toggle('trial-ability-ready', ready);
        // Crucial: the delegated click dispatcher (app.js) swallows clicks on any
        // [aria-disabled="true"], but the cooldown enable path used to only clear
        // `disabled`. Leaving the stale aria-disabled behind made the button look
        // ready yet unclickable until a full re-render (skip / char switch).
        if (ready) {
            btn.removeAttribute('disabled');
            btn.removeAttribute('aria-disabled');
        } else {
            btn.setAttribute('disabled', '');
            btn.setAttribute('aria-disabled', 'true');
        }
        // Energy gauge mirrors the bar live — toward the FULL bar for the
        // ultimate (attacks/bursts carry no ring at all; they're generators).
        const ring = btn.querySelector('.trial-ring-fill');
        if (ring) {
            const denom = abil.type === 'ultimate' ? maxEnergy : Math.max(1, Number(abil.cost || 0));
            const pct = Math.min(100, Math.round((energy / denom) * 100));
            ring.setAttribute('stroke-dashoffset', String(100 - pct));
        }
    });
}

// Golden popup whenever the party lands an elemental combo (Vaporize/Shatter/Thermal Shock).
function trialComboFlash(pts) {
    if (!D.combat || !D.combat.isTrial) return;
    const panel = document.querySelector('.dungeon-combat-panel');
    if (!panel) return;
    let el = panel.querySelector('.trial-combo-flash');
    if (!el) {
        el = document.createElement('div');
        el.className = 'trial-combo-flash';
        panel.appendChild(el);
    }
    el.textContent = `🔀 COMBO +${pts} ${_pt('pontos', 'pts')}!`;
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    clearTimeout(trialComboFlash._t);
    trialComboFlash._t = setTimeout(() => { try { el.remove(); } catch (e) { /* noop */ } }, 1800);
}

// Floating "+N" rises off the score pill(s) whenever points are earned live, so hits,
// kills and combos visibly light up the counter. Big moments (boss kill, Final Blow
// flourish, big combos) also pulse a radial flash across the whole trial overlay.
function flashScoreGain(delta, cat) {
    if (!D.combat || !D.combat.isTrial) return;
    const isBig = cat === 'boss' || cat === 'flourish' || (cat === 'combo' && delta >= 150);
    const nums = [...document.querySelectorAll('#event-cb-score, #event-score-count')];
    nums.forEach(num => {
        const host = num.parentElement;
        if (!host) return;
        const wasStatic = getComputedStyle(host).position === 'static';
        if (wasStatic) host.style.position = 'relative';
        let existing = host.querySelector('.score-gain-float');
        if (existing) existing.remove();
        const fl = document.createElement('span');
        fl.className = 'score-gain-float ' + (cat === 'boss' ? 'boss' : cat === 'combo' ? 'combo' : cat === 'flourish' ? 'flourish' : cat === 'damage' ? 'damage' : 'kill');
        fl.textContent = (delta > 0 ? '+' : '') + delta;
        host.appendChild(fl);
        const cleanup = () => {
            try { if (fl.parentNode) fl.parentNode.removeChild(fl); } catch (e) { /* noop */ }
            if (wasStatic) host.style.position = '';
        };
        setTimeout(cleanup, 1300);
    });
    if (isBig) {
        const host = document.querySelector('.dungeon-overlay') || document.querySelector('.dungeon-combat-panel');
        if (!host) return;
        const fl2 = document.createElement('div');
        fl2.className = 'score-flash';
        host.appendChild(fl2);
        setTimeout(() => { try { if (fl2.parentNode) fl2.parentNode.removeChild(fl2); } catch (e) { /* noop */ } }, 600);
    }
}

function tryRun(roomIdx) {
    if (!D.combat) return;
    const pushCombatLog = (actor, text) => {
        if (!D.combat) return;
        if (!Array.isArray(D.combat.roundLog)) D.combat.roundLog = [];
        D.combat.roundLog.push({ actor, text });
    };

    // If we've already "successfully escaped", require an explicit decision.
    if (D.combat.escapeReady) {
        renderCombatPanel();
        return;
    }

    // Trial of the Arcane: fleeing is always safe (the trial party has no persistent
    // HP outside the room and the run only advances when a room is cleared).
    if (D.combat.isTrial) {
        pushCombatLog('player', `${_pt('💨 Você ordena a retirada...', '💨 You order the retreat...')}`);
        pushCombatLog('player', `${_pt('✅ O grupo escapa em segurança.', '✅ The party escapes safely.')}`);
        D.combat.escapeReady = true;
        const room = D.rooms && D.rooms[roomIdx];
        if (room) room.monstersEvaded = true;
        renderCombatPanel();
        return;
    }

    pushCombatLog('player', `${_pt('💨 Você tenta fugir...', '💨 You attempt to flee...')}`);

    // Server-authoritative fleeing (Crawler uses its own endpoint; others use unified endpoint).
    if (D.combat.serverAuth && D.combat.isCrawler) {
        if (D.combat.resolving) return;
        if (!D.combat.combatId) {
            pushCombatLog('monster', `${_pt('⚠️ Ainda conectando ao combate do servidor...', '⚠️ Still connecting to server combat...')}`);
            renderCombatPanel();
            return;
        }
        D.combat.resolving = true;
        renderCombatPanel();
        apiFetch('POST', '/game/dungeon/crawler-combat/act', { combatId: D.combat.combatId, action: 'run', turnNonce: D.combat.turnNonce })
            .then(res => {
                if (!D.combat || !D.combat.isCrawler) return;
                if (!res || !res.success) throw new Error(res?.error || 'Crawler flee failed.');
                D.combat.turnNonce = Number(res.turnNonce || (D.combat.turnNonce + 1));
                if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
                if (res.monster) {
                    const m = { ...D.combat.monsters[0], ...res.monster };
                    m.currentHp = Number(res.monster.currentHp ?? m.currentHp ?? m.maxHp ?? m.hp);
                    m.maxHp = Number(res.monster.maxHp ?? m.maxHp ?? m.hp);
                    D.combat.monsters = [m];
                    if (D.crawler && D.crawler.monster) {
                        D.crawler.monster.currentHp = m.currentHp;
                        D.crawler.monster.maxHp = m.maxHp;
                    }
                }
                const c = getChar();
                if (c && res.player && typeof res.player.hp === 'number') {
                    c.hp_current = res.player.hp;
                    c.hp = res.player.hp;
                    if (typeof renderTopBar === 'function') renderTopBar();
                }
                if (res.ended && res.outcome === 'player_dead') {
                    D.combat.resolving = false;
                    onPlayerDeath();
                    return;
                }
                if (res.escapeReady) {
                    D.combat.escapeReady = true;
                    const room = D.rooms && D.rooms[roomIdx];
                    if (room) room.monstersEvaded = true;
                }
                D.combat.resolving = false;
                saveState();
                saveProgressToDB();
                saveTargetRectForAnim();
                renderCombatPanel();
                triggerCombatAnimations();
            })
            .catch(err => {
                console.error('Crawler flee action failed:', err);
                if (D.combat && D.combat.isCrawler) {
                    D.combat.resolving = false;
                    pushCombatLog('monster', `⚠️ ${String(err.message || err)}`);
                    renderCombatPanel();
                }
            });
        return;
    }

    if (D.combat.serverAuth) {
        if (D.combat.resolving) return;
        if (!D.combat.combatId) {
            pushCombatLog('monster', `${_pt('⚠️ Ainda conectando ao combate do servidor...', '⚠️ Still connecting to server combat...')}`);
            renderCombatPanel();
            return;
        }
        D.combat.resolving = true;
        renderCombatPanel();
        apiFetch('POST', '/game/dungeon/combat/act', { combatId: D.combat.combatId, action: 'run', turnNonce: D.combat.turnNonce })
            .then(res => {
                if (!D.combat) return;
                if (!res || !res.success) throw new Error(res?.error || 'Flee failed.');
                if (res?.debug) console.debug('[dungeon combat act]', res.debug);
                D.combat.turnNonce = Number(res.turnNonce || (D.combat.turnNonce + 1));
                if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
                if (Array.isArray(res.monsters) && res.monsters.length) {
                    D.combat.monsters = res.monsters.map(m => ({
                        ...m,
                        currentHp: m.currentHp ?? m.hp ?? m.maxHp,
                        maxHp: m.maxHp ?? m.hp ?? m.currentHp,
                    }));
                    D.combat.currentMonsterIndex = Number(res.currentMonsterIndex || 0);
                }
                const c = getChar();
                if (c && res.player && typeof res.player.hp === 'number') {
                    c.hp_current = res.player.hp;
                    c.hp = res.player.hp;
                    if (typeof renderTopBar === 'function') renderTopBar();
                }
                if (res.ended && res.outcome === 'player_dead') {
                    D.combat.resolving = false;
                    onPlayerDeath();
                    return;
                }
                if (res.escapeReady) {
                    D.combat.escapeReady = true;
                    const room = D.rooms && D.rooms[roomIdx];
                    if (room) room.monstersEvaded = true;
                }
                D.combat.resolving = false;
                saveState();
                saveProgressToDB();
                saveTargetRectForAnim();
                renderCombatPanel();
                triggerCombatAnimations();
            })
            .catch(err => {
                console.error('Server flee failed:', err);
                if (D.combat) {
                    D.combat.resolving = false;
                    pushCombatLog('monster', `⚠️ ${String(err.message || err)}`);
                    renderCombatPanel();
                }
            });
        return;
    }

    if (chance(RUN_ESCAPE_CHANCE)) {
        pushCombatLog('player', `${_pt('✅ Fuga bem-sucedida. Você pode sair agora ou continuar lutando.', '✅ Escape successful. You can leave now, or keep fighting.')}`);

        // Mark the room as evaded so travel is allowed even if multiple monsters are alive.
        // (Reset in travelToRoom once you actually leave.)
        const room = D.rooms && D.rooms[roomIdx];
        if (room) room.monstersEvaded = true;

        if (D.combat && D.combat.isCrawler && D.crawler) {
            D.crawler.active = true;
            D.crawler.roomIdx = roomIdx;
        }

        // Keep the combat modal open: user must choose "Get Out" (or keep fighting).
        D.combat.escapeReady = true;
        renderCombatPanel();
    } else {
        pushCombatLog('monster', `${_pt('⚠️ Fuga falhou! Os inimigos atacam!', '⚠️ Escape failed! The enemies strike!')}`);
        const c = getChar();
        if (c && D.combat && D.combat.monsters && D.combat.monsters.length > 0) {
            const pStats = calcPlayerStats();
            let totalDamage = 0;
            
            for (let i = 0; i < D.combat.monsters.length; i++) {
                const m = D.combat.monsters[i];
                if (m.currentHp > 0) {
                    const mDmg = Math.max(1, Math.floor(m.atk - pStats.def * 0.5 + rand(-2, 2)));
                    totalDamage += mDmg;
                    pushCombatLog('monster', `${_pt(`💥 ${m.name} acerta você com ${mDmg}!`, `💥 ${m.name} hits you for ${mDmg}!`)}`);
                }
            }
            
            // hp_current can be 0; don't treat it as "missing".
            c.hp_current = Math.max(0, Number((c.hp_current ?? c.hp ?? 100)) - totalDamage);
            c.hp = c.hp_current;
            pushCombatLog('player', `${_pt(`💔 Você sofre ${totalDamage} de dano.`, `💔 You take ${totalDamage} damage.`)}`);
            
            if (c.hp_current <= 0) {
                onPlayerDeath();
                return;
            }
            renderCombatPanel();
        }
    }
}

function confirmEscape(roomIdx) {
    if (!D.combat) return;

    // Release room entry (regular rooms only; crawler escape keeps chase logic intact).
    // In event mode, skip the tower room-exit call — there is no room lock to release.
    if (!D.eventMode && !(D.combat && D.combat.isCrawler)) {
        D._exitingRoom = apiFetch('POST', '/game/dungeon/room-exit', { floor: D.floor, roomIndex: roomIdx })
            .catch(e => console.error('Failed to exit room:', e));
    }

    D.combat = null;
    D._combatPrefetch = null;
    saveState();
    saveProgressToDB();
    renderDungeonView();
}

function cancelEscape() {
    if (!D.combat) return;
    D.combat.escapeReady = false;
    if (!Array.isArray(D.combat.roundLog)) D.combat.roundLog = [];
    D.combat.roundLog.push({ actor: 'player', text: `${_pt('⚔️ Você decide continuar lutando.', '⚔️ You decide to keep fighting.')}` });
    renderCombatPanel();
}

function onPlayerDeath() {
    // Trial of the Arcane: death finalizes the event run (counts as an attempt).
    if (D.eventMode) {
        log(`${_pt('💀 Você foi derrotado no Trial do Arcano!', '💀 You were slain in the Trial of the Arcane!')}`, 'log-danger');
        document.body.classList.remove('modal-lock');
        document.body.classList.remove('combat-lock');
        // Rows-only arena: shatter the ACTIVE champion's row card (fallback kept
        // for the regular combat panel's first-card layout).
        const activeIdx = Number(D.combat.trialActiveChar ?? 0);
        const pCard = document.querySelector(`#trial-char-${activeIdx}`)
            || document.querySelector('.combat-fighters > .fighter-card:first-child');
        if (pCard) pixelDissolveCard(pCard, true);
        setTimeout(() => {
            D.combat = null;
            finishEventRun(false);
        }, 400);
        return;
    }
    log(`${_pt('💀 Você foi derrotado! Progresso salvo.', '💀 You have been slain! Progress saved.')}`, 'log-danger');
    if (D.combat && (D.combat.isCrawler || D.combat.monsters?.some(m => m.isCrawler))) {
        apiFetch('POST', '/game/dungeon/crawler-event', { event: 'death' }).catch(() => {});
    }
    const c = getChar();
    if (c && c.hp_current !== undefined) c.hp = c.hp_current;

    // Ensure we never keep the page scroll-locked after combat ends (death returns to dungeon UI).
    document.body.classList.remove('modal-lock');
    document.body.classList.remove('combat-lock');
    
    // Play player card dissolve before cleanup
    const pCard = document.querySelector('.combat-fighters > .fighter-card:first-child');
    if (pCard) pixelDissolveCard(pCard, true);

    setTimeout(() => {
        // Release room entry and lock
        if (D.combat && D.combat.roomIdx !== undefined) {
            apiFetch('POST', '/game/dungeon/room-exit', { floor: D.floor, roomIndex: D.combat.roomIdx })
                .catch(e => console.error('Failed to exit room:', e));
        }
        stopLockRefresh();
        
        D.savedProgress['tower'] = {
          floor: D.floor,
          pos: D.playerPos,
          rooms: D.rooms,
          explored: [...D.exploredRooms],
          crawler: D.crawler,
          floorRunId: D.floorRunId,
          bossDefeated: !!D.bossDefeated,
        };
        D.combat = null;
        D._combatPrefetch = null;
        D.activeDungeon = null;
        global.__dungeonActive = false;
        saveState();
        saveProgressToDB();
        setTimeout(() => renderDungeonList(), 1500);
    }, 800);
}

async function fightBoss(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room || !room.isBoss) return;
    
    // The floor's boss is a one-time fight — it never respawns once defeated.
    if (D.bossDefeated) {
        log(`${_pt('⚠️ O chefe deste andar já foi derrotado. Use as escadas para descer.', '⚠️ This floor\'s boss was already defeated. Use the stairs to descend.')}`, 'log-warning');
        return;
    }
    
    // Check tokens before attempting boss fight
    const tokensNeeded = 50;
    if ((D.tokens || 0) < tokensNeeded) {
        log(`${_pt(`⚠️ Você precisa de ${tokensNeeded} tokens para desafiar o chefe. Você tem ${D.tokens || 0}.`, `⚠️ Need ${tokensNeeded} tokens to challenge the boss. You have ${D.tokens || 0}.`)}`, 'log-warning');
        return;
    }

    // Prevent entering boss combat at 0 HP (server rejects; client should show a clear modal instead).
    const c0 = getChar();
    const hp0 = Number(c0?.hp_current ?? c0?.hp ?? c0?.hp_max ?? 0);
    if (Number.isFinite(hp0) && hp0 <= 0) {
        const msg = _pt('Você está com 0 de HP. Saia da masmorra para se recuperar antes de desafiar o chefe.', 'You are at 0 HP. Leave the dungeon to recover before challenging the boss.');
        if (typeof openGameDialog === 'function') {
            await openGameDialog({ title: _pt('Sem HP', 'Out of HP'), message: msg, confirmLabel: 'OK', showCancel: false });
        } else {
            alert(msg);
        }
        return;
    }

    // Boss fights are server-authoritative (includes token gate + loot).
    const _def = getDungeonDef();
    const boss = _def.boss;
    D.combat = {
        roomIdx,
        monsters: [{
            ...boss,
            currentHp: boss.hp,
            maxHp: boss.hp,
            stolenItems: [],
            isBoss: true,
        }],
        currentMonsterIndex: 0,
        roundLog: [],
        serverAuth: true,
        resolving: true,
        combatId: null,
        turnNonce: 0,
        manaPoints: 0,
        manaCap: 100,
    };
    renderCombatPanel();

    Promise.resolve(refreshCharacter?.()).catch(() => {}).finally(() => {
    apiFetch('POST', '/game/dungeon/combat/start', { floor: D.floor, roomIndex: roomIdx, kind: 'boss', floorRunId: D.floorRunId })
        .then(res => {
            if (!D.combat || D.combat.roomIdx !== roomIdx) return;
            if (!res || !res.success) throw new Error(res?.error || 'Failed to start boss combat.');
            D.combat.combatId = res.combatId;
            D.combat.turnNonce = Number(res.turnNonce || 0);
            if (Array.isArray(res.monsters) && res.monsters.length) {
                D.combat.monsters = res.monsters.map(m => ({
                    ...m,
                    currentHp: m.currentHp ?? m.hp ?? m.maxHp,
                    maxHp: m.maxHp ?? m.hp ?? m.currentHp,
                }));
                D.combat.currentMonsterIndex = Number(res.currentMonsterIndex || 0);
            }
            if (typeof res.manaPoints === 'number') D.combat.manaPoints = res.manaPoints;
            if (typeof res.manaCap === 'number') D.combat.manaCap = res.manaCap;
            if (typeof res.tokens === 'number') {
                D.tokens = res.tokens;
                updateTokenDisplay();
            }
            if (Array.isArray(res.log) && res.log.length) D.combat.roundLog.push(...res.log);
            D.combat.resolving = false;
            saveState();
            saveProgressToDB();
            renderCombatPanel();
        })
        .catch(err => {
            console.error('Failed to start boss combat:', err);
            if (D.combat && D.combat.roomIdx === roomIdx) {
                D.combat.resolving = false;
                D.combat.roundLog.push({ actor: 'monster', text: `⚠️ ${String(err.message || err)}` });
                renderCombatPanel();
            }
        });
    });
}

function renderDungeonTab() {
    const container = document.getElementById('tab-dungeon');
    if (!container) return;

    if (D.eventMode && Array.isArray(D.rooms) && D.rooms.length) {
        const run = D.eventRun || {};
        const progress = `${run.room_index ?? 1}/10`;
        container.innerHTML = `
            <div class="dungeon-wrapper">
                <div class="dungeon-topbar dungeon-event-topbar" style="border-bottom:2px solid rgba(168,85,247,0.4);background:rgba(107,33,168,0.08);justify-content:center">
                    <div class="dungeon-title-wrap" style="flex:1;min-width:0">
                        <span class="dungeon-title-icon">🔮</span>
                        <div>
                            <div class="dungeon-title-text">${_pt('Provação do Arcano', 'Trial of the Arcane')}</div>
                            <div class="dungeon-title-sub">${_pt(`Sala ${progress} · Avance destruindo todos que bloqueiam seu caminho`, `Room ${progress} · Push forward, slaying all who stand in your way`)}</div>
                        </div>
                    </div>
                    <div class="dungeon-token-wrap" style="display:flex;gap:12px;">
                        <div class="dungeon-token-pill" style="background:rgba(168,85,247,0.1);border-color:rgba(168,85,247,0.3);">
                            <span class="dungeon-token-icon">⭐</span>
                            <span>${_pt('Pontuação:', 'Score:')}</span>
                            <span id="event-score-count" class="dungeon-token-num">${run.score ?? 0}</span>
                        </div>
                        <div class="dungeon-token-pill" style="background:rgba(34,197,94,0.1);border-color:rgba(34,197,94,0.3);">
                            <span class="dungeon-token-icon">⏱️</span>
                            <span id="event-timer" class="dungeon-token-num">0:00</span>
                        </div>
                        <div class="dungeon-token-pill">
                            <span class="dungeon-token-icon">🚩</span>
                            <span>${_pt('Sala:', 'Room:')}</span>
                            <span id="event-room-count" class="dungeon-token-num">${run.room_index ?? 1}</span>
                        </div>
                    </div>
                    <div style="flex:1;display:flex;justify-content:flex-end">
                        <button class="dungeon-btn dungeon-btn-hud" ${actionAttrs('dungeonExit')}>${_pt('Sair', 'Exit')}</button>
                    </div>
                </div>
                <div id="dungeon-main-area"></div>
            </div>
        `;
        if (D.combat) renderCombatPanel();
        else if (!D._eventStarted) renderEventStartScreen();
        else renderDungeonView();
        renderLog();

        // Event timer — tick every second showing elapsed minutes:seconds.
        // Only starts counting once the player clicks "Begin" (server start_time mirrors this).
        if (!D._eventStarted) {
            if (D._eventTimerInterval) clearInterval(D._eventTimerInterval);
            D._eventTimerInterval = null;
            const el0 = document.getElementById('event-timer');
            if (el0) el0.textContent = '0:00';
            return;
        }
        if (D._eventTimerInterval) clearInterval(D._eventTimerInterval);
        if (!D._eventStartTime) D._eventStartTime = Number(run.start_time) || Date.now();
        const tickTimer = () => {
            const secs = Math.max(0, Math.floor((Date.now() - D._eventStartTime) / 1000));
            const text = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
            document.querySelectorAll('#event-timer, #event-cb-timer').forEach(el => { el.textContent = text; });
        };
        tickTimer();
        D._eventTimerInterval = setInterval(tickTimer, 1000);
        return;
    }

    loadState();
    
    if (character) {
        // Load persisted dungeon data, then rerender the list so resume works reliably.
        loadDungeonDataFromDB().then(() => {
            // Move HTML rendering INSIDE here, after data is loaded
            container.innerHTML = `
                <div class="dungeon-wrapper">
                    <div class="dungeon-topbar">
                        <div class="dungeon-title-wrap">
                            <span class="dungeon-title-icon">⚔️</span>
                            <div>
                                <div class="dungeon-title-text">${_pt('Masmorra', 'Dungeon')}</div>
                                <div class="dungeon-title-sub">${_pt('Avance fundo. Vença a escuridão. Alcance a glória.', 'Delve deep. Conquer darkness. Claim glory.')}</div>
                            </div>
                        </div>
                        <div class="dungeon-token-wrap" style="display: flex; gap: 12px;">
                            <div class="dungeon-token-pill">
                                <span class="dungeon-token-icon">🗝️</span>
                                <span>${_pt('Tokens de Chefe:', 'Boss Tokens:')}</span>
                                <span id="dungeon-token-count" class="dungeon-token-num">${D.tokens}</span>
                            </div>
                            <div class="dungeon-token-pill" style="background: rgba(241,196,15,0.1); border-color: rgba(241,196,15,0.3);">
                                <span class="dungeon-token-icon">💰</span>
                                <span>${_pt('Ouro de Masmorra:', 'Dungeon Gold:')}</span>
                                <span id="dungeon-gold-count" class="dungeon-token-num">${D.dungeonGold || 0}</span>
                            </div>
                        </div>
                        <div class="dungeon-token-hint">${_pt(`20 MP gastos = 1 Token · ${TOKENS_PER_RUN} Tokens por chefe`, `20 MP spent = 1 Token · ${TOKENS_PER_RUN} Tokens per boss`)}</div>
                    </div>
                    <div id="dungeon-main-area"></div>
                </div>
            `;
            
            if (!D.activeDungeon) {
                renderDungeonList();
            } else {
                if (D.combat) renderCombatPanel();
                else renderDungeonView();
            }
            updateDungeonGoldDisplay();
            renderLog();
        });
    } else {
        // If no character, just render basic HTML
        container.innerHTML = `
            <div class="dungeon-wrapper">
                <div class="dungeon-topbar">
                    <div class="dungeon-title-wrap">
                        <span class="dungeon-title-icon">⚔️</span>
                        <div>
                            <div class="dungeon-title-text">${_pt('Masmorra', 'Dungeon')}</div>
                            <div class="dungeon-title-sub">${_pt('Avance fundo. Vença a escuridão. Alcance a glória.', 'Delve deep. Conquer darkness. Claim glory.')}</div>
                        </div>
                    </div>
                    <div class="dungeon-token-wrap" style="display: flex; gap: 12px;">
                        <div class="dungeon-token-pill">
                            <span class="dungeon-token-icon">🗝️</span>
                            <span>${_pt('Tokens de Chefe:', 'Boss Tokens:')}</span>
                            <span id="dungeon-token-count" class="dungeon-token-num">${D.tokens}</span>
                        </div>
                        <div class="dungeon-token-pill" style="background: rgba(241,196,15,0.1); border-color: rgba(241,196,15,0.3);">
                            <span class="dungeon-token-icon">💰</span>
                            <span>${_pt('Ouro de Masmorra:', 'Dungeon Gold:')}</span>
                            <span id="dungeon-gold-count" class="dungeon-token-num">${D.dungeonGold || 0}</span>
                        </div>
                    </div>
                    <div class="dungeon-token-hint">${_pt(`20 MP gastos = 1 Token · ${TOKENS_PER_RUN} Tokens por chefe`, `20 MP spent = 1 Token · ${TOKENS_PER_RUN} Tokens per boss`)}</div>
                </div>
                <div id="dungeon-main-area"></div>
            </div>
        `;
        renderDungeonList();
        renderLog();
    }
}

function formatRaidDuration(seconds) {
    const total = Math.max(0, Number(seconds || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
    if (hours > 0) return `${hours}h`;
    return `${minutes}m`;
}

function renderDungeonRaidHub(guildData) {
    const reputation = Number(guildData.guildReputation || 0);
    const allRaids = Array.isArray(guildData.raids) ? guildData.raids : [];
    const highestFloor = Math.max(1, Number(guildData.highestFloor || 1));
    const now = Math.floor(Date.now() / 1000);
    const raidCooldownUntil = Number(guildData.raidCooldownUntil || 0);
    const cooldownLeft = raidCooldownUntil > now ? (raidCooldownUntil - now) : 0;
    const apprenticeReq = GUILD_RANKS.find(r => r.name === 'Apprentice')?.reputationNeeded || 10;
    const canCreateRaid = reputation >= apprenticeReq;
    const isRaidLocked = cooldownLeft > 0;
    // Commitment is character-scoped (not account-scoped), so switching characters can run parallel raids.
    const existingRaid = allRaids.find(raid => raid.status === 'forming' && (raid.isLeader || raid.isMember));
    const hasRaidCommitment = !!existingRaid;
    const createLocked = isRaidLocked || hasRaidCommitment;
    const raids = isRaidLocked ? [] : allRaids;
    const raidFloorOptions = Array.from({ length: highestFloor }, (_, idx) => idx + 1)
        .map(floor => `<option value="${floor}">${_pt(`Andar ${floor}`, `Floor ${floor}`)}</option>`)
        .join('');
    const constraintMax = guildData.level ? Number(guildData.level) + Math.floor(Number(guildData.level) / 3) : 999;
    const constraintMin = 1;

    const raidCards = raids.length ? raids.map(raid => {
        const members = Array.isArray(raid.members) ? raid.members : [];
        const membersHtml = members.map(member => `
            <span class="cost-item ${member.isLeader ? 'raid-member-leader' : ''}">
                ${member.isLeader ? _pt('Líder', 'Leader') : _pt('Membro', 'Member')} · ${member.name} Lv.${member.level}
            </span>
        `).join('');
        const rewardBits = [];
        if (raid.reward?.gold) rewardBits.push(`${Number(raid.reward.gold).toLocaleString()} ${_pt('Ouro', 'Gold')}`);
        if (raid.reward?.gems) rewardBits.push(`${Number(raid.reward.gems).toLocaleString()} ${_pt('Gemas', 'Gems')}`);
        if (raid.reward?.item?.itemData?.name) rewardBits.push(raid.reward.item.itemData.name);

        const viewerLevel = guildData.level || 0;
        const canJoin = raid.status === 'forming' && !raid.isMember && !raid.isAccountMember && raid.memberCount < 6 && viewerLevel >= raid.minLevel && viewerLevel <= raid.maxLevel;
        const canStart = raid.status === 'forming' && raid.isLeader;
        const canClaim = raid.status === 'completed' && raid.isMember && !raid.rewardClaimed && raid.reward;
        const autoStartLabel = raid.autoStartMode === 'full'
            ? _pt('Início automático quando cheio', 'Auto-start when full')
            : raid.autoStartMode === 'scheduled'
                ? _pt(`Agendado: ${formatRaidTime(raid.scheduledStartAt)}`, `Scheduled: ${formatRaidTime(raid.scheduledStartAt)}`)
                : _pt('Início manual', 'Manual start');
        const resultLog = Array.isArray(raid.resultLog) && raid.resultLog.length
            ? `<div class="raid-result-log">${raid.resultLog.map(line => `<div class="raid-result-line">${line}</div>`).join('')}</div>`
            : '';

        return `                <div class="exchange-card exchange-available raid-card raid-status-${raid.status}"${raid.bossImage ? ` style="--raid-bg:url('${raid.bossImage}')"` : ''}>
                <div class="exchange-info">
                    <div class="exchange-name">${_pt(`Andar ${raid.floor} Invasão:`, `Floor ${raid.floor} Raid:`)} ${raid.bossName}</div>
                    <div class="exchange-desc">${_pt('Até seis jogadores se unem em um único ataque contra um chefe de invasão escalonado pelo andar.', 'Up to six players combine into one strike against a floor-scaled raid boss.')}</div>
                    <div class="exchange-cost">
                        <span class="cost-item">${_pt('Status:', 'Status:')} ${raid.status}</span>
                        <span class="cost-item">${autoStartLabel}</span>
                        <span class="cost-item">${_pt('HP do Chefe', 'Boss HP')} ${Number(raid.bossHp || 0).toLocaleString()}</span>
                    </div>
                    <div class="exchange-cost">${membersHtml}</div>
                    ${raid.resultSummary ? `<div class="exchange-desc raid-summary">${raid.resultSummary}</div>` : ''}
                    ${rewardBits.length ? `<div class="exchange-reward"><span class="reward-item">${_pt('Recompensas:', 'Rewards:')} ${rewardBits.join(' · ')}</span></div>` : ''}
                    ${resultLog}
                    ${canJoin ? `<button class="exchange-btn" ${actionAttrs('joinGuildRaid', raid.id)}>${_pt('Entrar na Invasão', 'Join Raid')}</button>` : ''}
                    ${raid.status === 'forming' && raid.isAccountMember && !raid.isMember ? `<div class="exchange-desc raid-summary" style="margin-top:8px;color:var(--text-dim)">${_pt('Outro personagem da sua conta já está nesta invasão.', 'Another character on your account is already in this raid.')}</div>` : ''}
                    ${canStart ? `<button class="exchange-btn" ${actionAttrs('startGuildRaid', raid.id)}>${_pt('Iniciar Invasão', 'Start Raid')}</button>` : ''}
                    ${canClaim ? `<button class="exchange-btn" ${actionAttrs('claimGuildRaidReward', raid.id)}>${_pt('Reivindicar Recompensa', 'Claim Reward')}</button>` : ''}
                    ${raid.status === 'forming' && raid.isMember && !raid.isLeader ? `<button class="exchange-btn" ${actionAttrs('leaveGuildRaid', raid.id)}>${_pt('Sair da Invasão', 'Leave Raid')}</button>` : ''}
                    ${raid.status === 'forming' && raid.isLeader ? `<button class="exchange-btn" ${actionAttrs('deleteGuildRaid', raid.id)}>${_pt('Excluir Invasão', 'Delete Raid')}</button>` : ''}
                </div>
            </div>
        `;
    }).join('') : `
        <div class="exchange-card exchange-unavailable">
            <div class="exchange-info">
                <div class="exchange-name">${_pt('Nenhuma invasão ativa ainda', 'No active raids yet')}</div>
                <div class="exchange-desc">${_pt('Quando um Aprendiz publicar uma invasão, ela aparecerá aqui para todos entrarem.', 'When an Apprentice posts a raid, it will appear here for everyone to join.')}</div>
            </div>
        </div>
    `;

    return `
        <div class="dungeon-raid-hub-head">
            <div class="dungeon-raid-hub-title">${_pt('Invasões', 'Raids')}</div>
            <div class="dungeon-raid-hub-subtitle">${_pt('Jogadores com rank Aprendiz podem abrir invasões para qualquer um entrar.', 'Apprentice-ranked players can open raids for anyone to join.')}</div>
        </div>
        ${cooldownLeft > 0 ? `<div class="rep-bar-text" style="margin-bottom:10px">${_pt(`Recuperação de invasão ativa: ${formatRaidDuration(cooldownLeft)} restantes.`, `Raid recovery active: ${formatRaidDuration(cooldownLeft)} remaining.`)}</div>` : ''}
        ${canCreateRaid ? `
            <div class="exchange-card exchange-available raid-create-card" style="--raid-bg:url('/images/assets/raid2.png')">
                <div class="exchange-info">
                    <div class="exchange-name">${_pt('Criar Invasão', 'Create a Raid')}</div>
                    <div class="exchange-desc">${_pt('Escolha qualquer andar até o andar de masmorra mais alto que você já limpou. Inicie manualmente, quando cheio, ou em um agendamento.', 'Choose any floor up to your highest cleared dungeon floor. You can start manually, when full, or on a schedule.')}</div>
                    <div class="raid-create-grid">
                        <label class="raid-field">
                            <span>${_pt('Andar', 'Floor')}</span>
                            <select id="guild-raid-floor" class="raid-input">${raidFloorOptions}</select>
                        </label>
                        <label class="raid-field">
                            <span>${_pt('Modo de início', 'Start mode')}</span>
                            <select id="guild-raid-mode" class="raid-input">
                                <option value="manual">${_pt('Manual', 'Manual')}</option>
                                <option value="full">${_pt('Início automático quando cheio', 'Auto-start when full')}</option>
                                <option value="scheduled">${_pt('Agendado', 'Scheduled')}</option>
                            </select>
                        </label>
                        <label class="raid-field raid-field-wide">
                            <span>${_pt('Início agendado', 'Scheduled start')}</span>
                            <input id="guild-raid-scheduled-at" class="raid-input" type="datetime-local">
                        </label>
                    </div>
                    <button class="exchange-btn" ${actionAttrs('createGuildRaid')}>${_pt('Criar Invasão', 'Create Raid')}</button>
                </div>
            </div>
        ` : `
            <div class="exchange-card exchange-unavailable">
                <div class="exchange-info">
                    <div class="exchange-name">${_pt('Invasões desbloqueadas no rank Aprendiz', 'Raids unlock at Apprentice')}</div>
                    <div class="exchange-desc">${_pt(`Alcance ${apprenticeReq} de reputação de guilda para criar invasões. Você ainda pode entrar nas invasões listadas abaixo.`, `Reach ${apprenticeReq} guild reputation to create raids. You can still join raids listed below.`)}</div>
                </div>
            </div>
        `}
        <div class="exchanges-grid raids-grid">${raidCards}</div>
    `;
}

function refreshRaidUi() {
    if (document.getElementById('dungeon-raid-hub')) {
        // Raids tab is on screen — reload just the hub.
        fetchGuildRaids();
    } else if (typeof renderGuild === 'function') {
        renderGuild();
    } else {
        renderRaidsTab();
    }
}

// ── Raids tab (World hub → Raids) ──────────────────────────────────────────
// Raids live in their own tab, split out of the Dungeon tab. The shell renders
// immediately, then guild raid data loads async into the hub container.
function renderRaidsTab() {
    const container = document.getElementById('tab-raids');
    if (!container) return;
    container.innerHTML = `
        <div class="dungeon-wrapper">
            <div class="raid-hero-banner">
                <img class="raid-hero-img" src="/images/assets/raid1.png" alt="" onerror="this.classList.add('is-missing')">
                <div class="raid-hero-shade"></div>
                <div class="raid-hero-content">
                    <div class="raid-hero-kicker">⚔ ${_pt('Batalhas de Guilda', 'Guild Assaults')}</div>
                    <h2 class="raid-hero-title">${_pt('Invasões', 'Raids')}</h2>
                    <p class="raid-hero-sub">${_pt('Forme um esquadrão de até seis e derrube chefes colossais.', 'Form a squad of up to six and bring down colossal bosses.')}</p>
                </div>
            </div>
            <div id="raids-main-area">
                <div id="dungeon-raid-hub" class="dungeon-floor-history dungeon-raid-hub-shell">
                    <div class="dungeon-raid-hub-head">
                        <div class="dungeon-raid-hub-title">${_pt('Invasões', 'Raids')}</div>
                        <div class="dungeon-raid-hub-subtitle">${_pt('Carregando invasões da guilda...', 'Loading guild raids...')}</div>
                    </div>
                </div>
            </div>
        </div>
    `;
    fetchGuildRaids();
}

// Load guild raid data into whichever raid-hub container is on screen.
function fetchGuildRaids() {
    apiFetch('GET', '/game/dungeon/guild')
        .then(guildData => {
            const raidHub = document.getElementById('dungeon-raid-hub');
            if (raidHub) raidHub.innerHTML = renderDungeonRaidHub(guildData);
            // Attach input listeners for real-time slider value display
            const maxSlider = document.getElementById('guild-raid-max-level');
            const minSlider = document.getElementById('guild-raid-min-level');
            const minDisplay = document.getElementById('guild-raid-min-level-val');
            const maxVal = document.getElementById('guild-raid-max-level-val');
            if (minSlider && minDisplay) {
                minSlider.addEventListener('input', function() { minDisplay.textContent = this.value; });
            }
            if (maxSlider && maxVal) {
                maxSlider.addEventListener('input', function() { maxVal.textContent = this.value; });
            }
        })
        .catch(e => {
            console.error('Failed to load raid hub:', e);
            const raidHub = document.getElementById('dungeon-raid-hub');
            if (raidHub) {
                raidHub.innerHTML = `
                    <div class="dungeon-raid-hub-head">
                        <div class="dungeon-raid-hub-title">${_pt('Invasões', 'Raids')}</div>
                        <div class="dungeon-raid-hub-subtitle">${_pt('Falha ao carregar o centro de invasões do servidor.', 'Raid hub failed to load from the server.')}</div>
                    </div>
                `;
            }
        });
}

function createGuildRaid() {
    const floor = Number(document.getElementById('guild-raid-floor')?.value || 1);
    const autoStartMode = String(document.getElementById('guild-raid-mode')?.value || 'manual');
    const scheduledStartAt = autoStartMode === 'scheduled' ? readGuildRaidScheduleTs() : 0;
    apiFetch('POST', '/game/dungeon/guild/raid/create', { floor, autoStartMode, scheduledStartAt })
        .then(response => {
            if (response?.success) {
                log(response.message || _pt('Invasão criada.', 'Raid created.'), 'log-success');
                refreshRaidUi();
            }
        })
        .catch(e => console.error('Raid create failed:', e));
}

function joinGuildRaid(raidId) {
    apiFetch('POST', '/game/dungeon/guild/raid/join', { raidId })
        .then(response => {
            if (response?.success) {
                log(response.message || _pt('Entrou na invasão.', 'Joined raid.'), 'log-success');
                refreshRaidUi();
                refreshCharacter();
            } else if (response?.error) {
                log(response.error, 'log-warning');
            }
        })
        .catch(e => {
            log(e?.message || _pt('Falha ao entrar na invasão.', 'Failed to join raid.'), 'log-warning');
            console.error('Raid join failed:', e);
        });
}

function leaveGuildRaid(raidId) {
    apiFetch('POST', '/game/dungeon/guild/raid/leave', { raidId })
        .then(response => {
            if (response && response.success) {
                log(response.message || _pt('Saiu da invasão.', 'Left raid.'), 'log-success');
                refreshRaidUi();
            }
        })
        .catch(e => console.error('Raid leave failed:', e));
}

function deleteGuildRaid(raidId) {
    apiFetch('POST', '/game/dungeon/guild/raid/delete', { raidId })
        .then(response => {
            if (response && response.success) {
                log(response.message || _pt('Invasão excluída.', 'Raid deleted.'), 'log-success');
                refreshRaidUi();
            }
        })
        .catch(e => console.error('Raid delete failed:', e));
}

function startGuildRaid(raidId) {
    apiFetch('POST', '/game/dungeon/guild/raid/start', { raidId })
        .then(response => {
            if (response?.success) {
                log(response.message || _pt('Batalha de invasão resolvida.', 'Raid battle resolved.'), 'log-success');
                refreshRaidUi();
                refreshCharacter();
            }
        })
        .catch(e => console.error('Raid start failed:', e));
}

function claimGuildRaidReward(raidId) {
    apiFetch('POST', '/game/dungeon/guild/raid/claim', { raidId })
        .then(response => {
            if (response?.success) {
                log(response.message || _pt('Recompensa de invasão reivindicada.', 'Raid reward claimed.'), 'log-success');
                if (typeof window.refreshRaidTokens === 'function' && response.raidTokens != null) {
                    window.refreshRaidTokens(response.raidTokens);
                }
                refreshRaidUi();
                refreshCharacter();
            }
        })
        .catch(e => console.error('Raid reward claim failed:', e));
}

function renderDungeonRaidHub(guildData) {
    const reputation = Number(guildData.guildReputation || 0);
    const allRaids = Array.isArray(guildData.raids) ? guildData.raids : [];
    const highestFloor = Math.max(1, Number(guildData.highestFloor || 1));
    const now = Math.floor(Date.now() / 1000);
    const raidCooldownUntil = Number(guildData.raidCooldownUntil || 0);
    const cooldownLeft = raidCooldownUntil > now ? (raidCooldownUntil - now) : 0;
    const apprenticeReq = GUILD_RANKS.find(r => r.name === 'Apprentice')?.reputationNeeded || 10;
    const canCreateRaid = reputation >= apprenticeReq;
    const isRaidLocked = cooldownLeft > 0;
    // Commitment is character-scoped (not account-scoped), so switching characters can run parallel raids.
    const existingRaid = allRaids.find(raid => raid.status === 'forming' && (raid.isLeader || raid.isMember));
    const hasRaidCommitment = !!existingRaid;
    const createLocked = isRaidLocked || hasRaidCommitment;
    const raids = isRaidLocked ? [] : allRaids;
    const raidFloorOptions = Array.from({ length: highestFloor }, (_, idx) => idx + 1)
        .map(floor => `<option value="${floor}">${_pt(`Andar ${floor}`, `Floor ${floor}`)}</option>`)
        .join('');
    const constraintMax = guildData.level ? Number(guildData.level) + Math.floor(Number(guildData.level) / 3) : 999;
    const constraintMin = 1;

    const viewerLevel = guildData.level || 0;
    const visibleRaids = raids.filter(raid =>
        raid.isMember || raid.isAccountMember || raid.isLeader ||
        (viewerLevel >= raid.minLevel && viewerLevel <= raid.maxLevel)
    );
    const raidCards = visibleRaids.length ? visibleRaids.map((raid, raidIdx) => {
        const members = Array.isArray(raid.members) ? raid.members : [];
        const showMembers = raid.isMember || raid.isAccountMember;
        const membersHtml = showMembers ? members.map(member => `
            <span class="cost-item ${member.isLeader ? 'raid-member-leader' : ''}">
                ${member.isLeader ? _pt('Líder', 'Leader') : _pt('Membro', 'Member')} В· ${member.name} Lv.${member.level}
            </span>
        `).join('') : `<span class="cost-item">${raid.memberCount}/${raid.maxMemberCount || 6} ${_pt('membros', 'members')}</span>`;
        const canJoin = raid.status === 'forming' && !raid.isMember && !raid.isAccountMember && raid.memberCount < 6 && viewerLevel >= raid.minLevel && viewerLevel <= raid.maxLevel;
        const canStart = raid.status === 'forming' && raid.isLeader;
        const autoStartLabel = raid.autoStartPlayers > 0
            ? _pt(`Início automático com ${raid.autoStartPlayers} jogador${raid.autoStartPlayers === 1 ? '' : 'es'}`, `Auto-start at ${raid.autoStartPlayers} player${raid.autoStartPlayers === 1 ? '' : 's'}`)
            : _pt('Início manual', 'Manual start');
        const mercenaryCards = raid.isLeader && Array.isArray(raid.mercenaryPool) && raid.mercenaryPool.length
            ? `
                <div class="raid-mercenary-head">${_pt('Recrutar Mercenários', 'Recruit Mercenaries')}</div>
                <div class="raid-mercenary-sub">${_pt('Gaste 1 gema para adicionar um recruta da masmorra a esta invasão. Eles contam para o tamanho e a força do grupo.', 'Spend 1 gem to add a dungeon recruit to this raid. They count toward party size and strength.')}</div>
                <div class="raid-mercenary-board">
                    ${raid.mercenaryPool.map(merc => {
                        const mercArt = MONSTER_POOL.find(m => m.id === merc.key);
                        return `
                        <div class="raid-mercenary-card ${merc.recruited ? 'is-recruited' : ''}">
                            ${mercArt ? `<img class="raid-mercenary-art" src="${mercArt.image}" alt="${merc.name}" onerror="this.classList.add('is-missing')">` : ''}
                            <div class="raid-mercenary-name">${merc.name}</div>
                            <div class="raid-mercenary-stats">
                                HP ${merc.stats.hp} · ATK ${merc.stats.dmgMin}-${merc.stats.dmgMax} · DEF ${merc.stats.defense}
                            </div>
                            <div class="raid-mercenary-stats">
                                AGI ${merc.stats.agility} · MAG ${merc.stats.magic} · HIT ${merc.stats.hitChance} · CRIT ${merc.stats.critChance}
                            </div>
                            ${merc.recruited
                                ? `<div class="raid-mercenary-status">${_pt('Recrutado', 'Recruited')}</div>`
                                : `<button class="exchange-btn raid-mercenary-btn" ${actionAttrs('recruitGuildRaidMercenary', raid.id, merc.id)}>${_pt('Recrutar · 1 Gema', 'Recruit · 1 Gem')}</button>`}
                        </div>`;
                    }).join('')}
                </div>
            `
            : '';

        return `
            <div class="exchange-card exchange-available raid-card raid-status-${raid.status}"${raid.bossImage ? ` style="--raid-bg:url('${raid.bossImage}')"` : ''}>
                ${raid.bossImage ? `<img class="raid-card-art" src="${raid.bossImage}" alt="" onerror="this.classList.add('is-missing')">` : ''}
                <div class="exchange-info">
                    <div class="exchange-name">${_pt(`Andar ${raid.floor} · Invasão:`, `Floor ${raid.floor} Raid:`)} ${raid.bossName} (${raid.minLevel || 1}-${raid.maxLevel || 999})</div>
                    <div class="exchange-desc">${_pt('O grupo inteiro ataca como um só. Os ataques de invasão sempre acertam e não usam config de zonas.', 'The whole party strikes as one. Raid attacks always connect and do not use zone setups.')}</div>
                    <div class="exchange-cost">
                        <span class="cost-item">${_pt('Status:', 'Status:')} ${raid.status}</span>
                        <span class="cost-item">${autoStartLabel}</span>
                        <span class="cost-item">${_pt('HP do Chefe', 'Boss HP')} ${Number(raid.bossHp || 0).toLocaleString()}</span>
                    </div>
                    <div class="exchange-cost">${membersHtml}</div>
                    <div class="exchange-desc raid-summary">${_pt('Resultados e recompensas da invasão são enviados à sua caixa de entrada ao concluir.', 'Raid results and rewards are sent to your inbox after completion.')}</div>
                        ${raid.isLeader ? `
                        <div class="raid-setting-row">
                            <select id="raid-start-threshold-${raid.id}" class="raid-input raid-inline-input">
                                 <option value="0" ${raid.autoStartPlayers === 0 ? 'selected' : ''}>${_pt('Início manual', 'Manual start')}</option>
                                 <option value="1" ${raid.autoStartPlayers === 1 ? 'selected' : ''}>${_pt('Auto com 1', 'Auto at 1')}</option>
                                 <option value="2" ${raid.autoStartPlayers === 2 ? 'selected' : ''}>${_pt('Auto com 2', 'Auto at 2')}</option>
                                 <option value="3" ${raid.autoStartPlayers === 3 ? 'selected' : ''}>${_pt('Auto com 3', 'Auto at 3')}</option>
                                 <option value="4" ${raid.autoStartPlayers === 4 ? 'selected' : ''}>${_pt('Auto com 4', 'Auto at 4')}</option>
                                 <option value="5" ${raid.autoStartPlayers === 5 ? 'selected' : ''}>${_pt('Auto com 5', 'Auto at 5')}</option>
                                 <option value="6" ${raid.autoStartPlayers === 6 ? 'selected' : ''}>${_pt('Auto com 6', 'Auto at 6')}</option>
                             </select>
                             <button class="exchange-btn raid-settings-btn" ${actionAttrs('updateGuildRaidSettings', raid.id)}>${_pt('Atualizar Início', 'Update Start')}</button>
                        </div>
                    ` : ''}
                    ${canJoin ? `<button class="exchange-btn" ${actionAttrs('joinGuildRaid', raid.id)}>${_pt('Entrar na Invasão', 'Join Raid')}</button>` : ''}
                    ${raid.status === 'forming' && raid.isAccountMember && !raid.isMember ? `<button class="exchange-btn" disabled title="${_pt('Outro personagem da sua conta já está nesta invasão.', 'Another character on your account is already in this raid.')}">${_pt('Entrar na Invasão', 'Join Raid')}</button>` : ''}
                    ${raid.status === 'forming' && raid.isAccountMember && !raid.isMember ? `<div class="exchange-desc raid-summary" style="margin-top:8px;color:var(--text-dim)">${_pt('Outro personagem da sua conta já está nesta invasão.', 'Another character on your account is already in this raid.')}</div>` : ''}
                    ${canStart ? `<button class="exchange-btn" ${actionAttrs('startGuildRaid', raid.id)}>${_pt('Iniciar Invasão', 'Start Raid')}</button>` : ''}
                    ${raid.status === 'forming' && raid.isMember && !raid.isLeader ? `<button class="exchange-btn" ${actionAttrs('leaveGuildRaid', raid.id)}>${_pt('Sair da Invasão', 'Leave Raid')}</button>` : ''}
                    ${raid.status === 'forming' && raid.isLeader ? `<button class="exchange-btn" ${actionAttrs('deleteGuildRaid', raid.id)}>${_pt('Excluir Invasão', 'Delete Raid')}</button>` : ''}
                    ${mercenaryCards}
                </div>
            </div>
        `;
    }).join('') : `
        <div class="exchange-card exchange-unavailable">
            <div class="exchange-info">
                <div class="exchange-name">${_pt('Nenhuma invasão ativa ainda', 'No active raids yet')}</div>
                <div class="exchange-desc">${_pt('Quando um Aprendiz publicar uma invasão, ela aparecerá aqui para todos entrarem.', 'When an Apprentice posts a raid, it will appear here for everyone to join.')}</div>
            </div>
        </div>
    `;

    return `
        <div class="dungeon-raid-hub-head">
            <div class="dungeon-raid-hub-title">${_pt('Invasões', 'Raids')}</div>
            <div class="dungeon-raid-hub-subtitle">${_pt('Jogadores com rank Aprendiz podem abrir invasões para qualquer um entrar. Invasões concluídas são entregues via relatórios na caixa de entrada.', 'Apprentice-ranked players can open raids for anyone to join. Finished raids are delivered through inbox reports.')}</div>
        </div>
        ${cooldownLeft > 0 ? `<div class="rep-bar-text" style="margin-bottom:10px">${_pt(`Recuperação de invasão ativa: ${formatRaidDuration(cooldownLeft)} restantes.`, `Raid recovery active: ${formatRaidDuration(cooldownLeft)} remaining.`)}</div>` : ''}
        ${canCreateRaid ? `
            <div class="exchange-card exchange-available raid-create-card" style="--raid-bg:url('/images/assets/raid2.png')">
                <div class="exchange-info">
                    <div class="exchange-name">${_pt('Criar Invasão', 'Create a Raid')}</div>
                    <div class="exchange-desc">${isRaidLocked
                        ? _pt(`A recuperação de invasão está ativa. Você poderá criar ou ver invasões novamente em ${formatRaidDuration(cooldownLeft)}.`, `Raid recovery is active. You can create or view raids again in ${formatRaidDuration(cooldownLeft)}.`)
                        : hasRaidCommitment
                            ? _pt(`Você já está comprometido com uma invasão em formação${existingRaid?.isLeader ? ' como líder' : ''}. Conclua ou saia dessa invasão antes de criar outra.`, `You are already committed to a forming raid${existingRaid?.isLeader ? ' as leader' : ''}. Finish or leave that raid before creating another one.`)
                            : _pt('Escolha qualquer andar até o andar de masmorra mais alto que você já limpou. Inicie manualmente ou inicie automaticamente quando o grupo atingir o tamanho selecionado.', 'Choose any floor up to your highest cleared dungeon floor. Start manually or auto-launch when the party reaches the selected size.')}</div>
                    <div class="raid-create-grid">
                        <label class="raid-field">
                            <span>${_pt('Andar', 'Floor')}</span>
                            <select id="guild-raid-floor" class="raid-input" ${createLocked ? 'disabled' : ''}>${raidFloorOptions}</select>
                        </label>
                        <label class="raid-field">
                            <span>${_pt('Início automático em', 'Auto-start at')}</span>
                            <select id="guild-raid-autostart" class="raid-input" ${createLocked ? 'disabled' : ''}>
                                <option value="0">${_pt('Somente manual', 'Manual only')}</option>
                                <option value="1">${_pt('1 jogador', '1 player')}</option>
                                <option value="2">${_pt('2 jogadores', '2 players')}</option>
                                <option value="3">${_pt('3 jogadores', '3 players')}</option>
                                <option value="4">${_pt('4 jogadores', '4 players')}</option>
                                <option value="5">${_pt('5 jogadores', '5 players')}</option>
                                <option value="6">${_pt('6 jogadores', '6 players')}</option>
                            </select>
                        </label>
                        <div class="raid-field">
                            <span>${_pt('Nível Mín.:', 'Min Level:')} <span id="guild-raid-min-level-val">1</span></span>
                            <input type="range" id="guild-raid-min-level" min="1" max="${constraintMax}" value="1">
                        </div>
                        <div class="raid-field">
                            <span>${_pt('Nível Máx.:', 'Max Level:')} <span id="guild-raid-max-level-val">${constraintMax}</span></span>
                            <input type="range" id="guild-raid-max-level" min="1" max="${constraintMax}" value="${constraintMax}">
                        </div>
                    </div>
                    <button class="exchange-btn ${createLocked ? 'disabled' : ''}" ${createLocked ? 'disabled' : actionAttrs('createGuildRaid')}>${isRaidLocked ? _pt(`Invasão pronta em ${formatRaidDuration(cooldownLeft)}`, `Raid Ready In ${formatRaidDuration(cooldownLeft)}`) : hasRaidCommitment ? _pt('Já em Invasão', 'Already In Raid') : _pt('Criar Invasão', 'Create Raid')}</button>
                </div>
            </div>
        ` : `
            <div class="exchange-card exchange-unavailable">
                <div class="exchange-info">
                    <div class="exchange-name">${_pt('Invasões desbloqueadas no rank Aprendiz', 'Raids unlock at Apprentice')}</div>
                    <div class="exchange-desc">${_pt(`Alcance ${apprenticeReq} de reputação de guilda para criar invasões. Você ainda pode entrar nas invasões listadas abaixo.`, `Reach ${apprenticeReq} guild reputation to create raids. You can still join raids listed below.`)}</div>
                </div>
            </div>
        `}
        ${isRaidLocked ? '' : `<div class="exchanges-grid raids-grid">${raidCards}</div>`}
    `;
}

function updateMinLevelSlider() {
    const val = document.getElementById('guild-raid-min-level')?.value;
    const display = document.getElementById('guild-raid-min-level-val');
    if (val && display) display.textContent = val;
}

function updateMaxLevelSlider() {
    const val = document.getElementById('guild-raid-max-level')?.value;
    const display = document.getElementById('guild-raid-max-level-val');
    if (val && display) display.textContent = val;
}

function createGuildRaid() {
    const floor = Number(document.getElementById('guild-raid-floor')?.value || 1);
    const autoStartPlayers = Number(document.getElementById('guild-raid-autostart')?.value || 0);
    const minLevel = Number(document.getElementById('guild-raid-min-level')?.value || 1);
    const maxLevel = Number(document.getElementById('guild-raid-max-level')?.value || 999);
    apiFetch('POST', '/game/dungeon/guild/raid/create', { floor, autoStartPlayers, minLevel, maxLevel })
        .then(response => {
            if (response?.success) {
                log(response.message || _pt('Invasão criada.', 'Raid created.'), 'log-success');
                refreshRaidUi();
                refreshCharacter();
            }
        })
        .catch(e => console.error('Raid create failed:', e));
}

function updateGuildRaidSettings(raidId) {
    const autoStartPlayers = Number(document.getElementById(`raid-start-threshold-${raidId}`)?.value || 0);
    apiFetch('POST', '/game/dungeon/guild/raid/update-settings', { raidId, autoStartPlayers })
        .then(response => {
            if (response?.success) {
                log(response.message || _pt('Configurações da invasão atualizadas.', 'Raid settings updated.'), 'log-success');
                refreshRaidUi();
            }
        })
        .catch(e => console.error('Raid settings update failed:', e));
}

function recruitGuildRaidMercenary(raidId, recruitId) {
    apiFetch('POST', '/game/dungeon/guild/raid/recruit', { raidId, recruitId })
        .then(response => {
            if (response?.success) {
                log(response.message || _pt('Mercenário recrutado.', 'Mercenary recruited.'), 'log-success');
                refreshRaidUi();
                refreshCharacter();
            }
        })
        .catch(e => console.error('Raid mercenary recruit failed:', e));
}

function renderDungeonList() {
    const area = document.getElementById('dungeon-main-area');
    if (!area) return;
    D.activeDungeon = null;
    global.__dungeonActive = false;
    D._combatActive = false;

    // Safety: if combat ended unexpectedly (death/disconnect), ensure scrolling is restored.
    document.body.classList.remove('modal-lock');
    document.body.classList.remove('combat-lock');

    // Check BOTH saved progress AND database floor value
    const hasSave = !!D.savedProgress['tower'];
    const hasDatabaseProgress = (D.floor > 1) || (D.highestFloor > 1);
    const hasAnyProgress = hasSave || hasDatabaseProgress;
    
    // Use the highest floor from either saved progress or database
    const savedFloor = hasSave ? D.savedProgress['tower'].floor : 1;
    const curFloor = Math.max(savedFloor, D.floor || 1);
    const highFloor = D.highestFloor || 1;
    const nextBoss = getBossForFloor(curFloor);
    const nextTheme = getFloorTheme(curFloor);
    const nextLoot = nextBoss.loot;

const previewFloors = [0,1,2,3,4].map(offset => {
    const fl = curFloor + offset;
    const boss = getBossForFloor(fl);
    const t = getFloorTheme(fl);
    return `<div class="dungeon-floor-preview-card" style="--card-accent:${t.theme}">
        <div class="fp-banner">
            <img src="${boss.image}" alt="${boss.name}">
            <div class="fp-floor-badge">F${fl}</div>
        </div>
        <div class="fp-name">${boss.name.split(' ').slice(0,2).join(' ')}</div>
        <div class="fp-stats">
            <span>❤️${boss.hp}</span>
            <span>⚔️${boss.atk}</span>
            <span>🛡️${boss.def}</span>
        </div>
    </div>`;
}).join('');

    area.innerHTML = `
      <div class="dungeon-tower-entry" style="--dtheme:${nextTheme.theme};--dglow:${nextTheme.themeGlow}">
        <div class="dungeon-tower-top">
          <div class="dungeon-tower-icon" aria-hidden="true">
            <svg class="tower-svg" viewBox="0 0 48 48">
              <defs><linearGradient id="tower-gold" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#e8b84b"/><stop offset="0.55" stop-color="#d49a2e"/><stop offset="1" stop-color="#c2581f"/>
              </linearGradient></defs>
              <path d="M13 44 V13 H10 V5 H16 V9 H20 V5 H28 V9 H32 V5 H38 V13 H35 V44 Z" fill="url(#tower-gold)"/>
              <rect x="21" y="19" width="6" height="9" rx="3" fill="#0a0e14" opacity="0.85"/>
              <path d="M20.5 44 v-5.5 a3.5 3.5 0 0 1 7 0 V44 Z" fill="#0a0e14" opacity="0.85"/>
            </svg>
          </div>
          <div class="dungeon-tower-info">
            <div class="dungeon-card-name">${_pt('A Torre Infinita', 'The Endless Tower')}</div>
            <div class="dungeon-card-desc">${_pt('Uma torre infinita de escuridão. Limpe cada andar para subir. Os chefes ficam mais fortes para sempre.', 'An infinite tower of darkness. Clear each floor to ascend. Bosses grow stronger forever.')}</div>
            <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px;font-size:0.78rem;color:var(--dungeon-muted)">
              <span>🏆 ${_pt('Seu recorde:', 'Your best:')} <strong style="color:var(--dungeon-text)">${_pt(`Andar ${highFloor}`, `Floor ${highFloor}`)}</strong></span>
              <span>🗝️ <strong style="color:var(--dungeon-token)">${D.tokens}</strong> tokens · ${_pt(`${TOKENS_PER_RUN} por chefe`, `${TOKENS_PER_RUN} per boss`)}</span>
              ${hasSave ? `<span class="dungeon-save-badge">📌 ${_pt(`Salvo no Andar ${curFloor}`, `Saved on Floor ${curFloor}`)}</span>` : ''}
            </div>
          </div>
        </div>

        <div class="dungeon-tower-next">
          <div class="dungeon-next-label">
            ${_pt(`Próximo chefe — Andar ${curFloor}`, `Next boss — Floor ${curFloor}`)}
          </div>
          <div class="dungeon-next-boss">
            <div class="dungeon-next-art">
              <img src="${nextBoss.image}" alt="${nextBoss.name}" data-error-hide="true" data-error-next-display="flex">
              <span style="display:none;font-size:3rem">${nextBoss.icon}</span>
              <div class="dungeon-next-shade"></div>
              <div class="dungeon-next-floor">F${curFloor}</div>
            </div>
            <div class="dungeon-next-info">
              <div class="dungeon-next-name">${nextBoss.name}</div>
              <div class="dungeon-next-stats">
                <span>❤️ ${nextBoss.hp} ${_pt('PV', 'HP')}</span>
                <span>⚔️ ${nextBoss.atk} ${_pt('ATQ', 'ATK')}</span>
                <span>🛡️ ${nextBoss.def} ${_pt('DEF', 'DEF')}</span>
              </div>
              <div class="dungeon-next-drops">
                ${_pt('Saque:', 'Drops:')} 💰${nextLoot.gold[0]}–${nextLoot.gold[1]} · 💎${nextLoot.gems[0]}–${nextLoot.gems[1]} · ✨ ${_pt('Premium Aleatório', 'Random Premium')} (${nextLoot.premiumDays[0]}–${nextLoot.premiumDays[1]} ${_pt('dias', 'days')})
              </div>
              <div class="dungeon-next-lore">${nextBoss.lore}</div>
            </div>
          </div>
        </div>

        <button class="dungeon-btn dungeon-btn-enter" style="width:100%;padding:12px;font-size:1rem;margin-top:16px"
            ${actionAttrs('dungeonEnter', 'tower')}>
        ${hasAnyProgress ? `${_pt('🔮 Retomar Jornada (Andar ', '🔮 Resume Delve (Floor ')}${curFloor}${_pt(')', ')')}` : _pt('⚔️ Iniciar a Subida', '⚔️ Begin the Ascent')}
    </button>
      </div>

      <div class="dungeon-floor-history">
        <div style="font-size:0.7rem;color:var(--dungeon-muted);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:10px">📈 ${_pt('Próximos andares', 'Upcoming floors')}</div>
        <div class="dungeon-floor-preview-row">${previewFloors}</div>
      </div>
    `;
  }

  function renderDungeonView() {
    const area = document.getElementById('dungeon-main-area');
    if (!area) return;
    if (!_cachedElemental && getChar()?.elemental) fetchElemental();
    document.body.classList.remove('modal-lock');
    document.body.classList.add('combat-lock');

    const _oldOverlay = document.getElementById('dungeon-overlay');
    if (_oldOverlay) _oldOverlay.innerHTML = '';
    // Keep combat-lock on to prevent topbar/sidebar reappearance from shifting layout.
    // Only remove when leaving dungeon entirely.
    
    if (!D.rooms || D.rooms.length === 0) {
      console.error('No rooms generated');
      area.innerHTML = '<div class="error">'+_pt('Masmorra não gerada. Entre novamente.', 'Dungeon not generated. Please re-enter.')+'</div>';
      return;
    }
    
    if (!D.rooms[D.playerPos]) {
      console.error('Invalid player position:', D.playerPos, 'Rooms:', D.rooms.length);
      const startIndex = D.rooms.findIndex(r => r.isStart);
      if (startIndex !== -1) D.playerPos = startIndex;
      else {
        area.innerHTML = '<div class="error">'+_pt('Estado de masmorra inválido. Entre novamente.', 'Invalid dungeon state. Please re-enter.')+'</div>';
        return;
      }
    }
    
    const def = getDungeonDef(D.activeDungeon);
    if (!def) return;

    const currentRoom = D.rooms[D.playerPos];
    const visual = currentRoom.visual || (currentRoom.isBoss ? DUNGEON_VISUALS.boss : currentRoom.isStart ? DUNGEON_VISUALS.start : DUNGEON_VISUALS.corridor);
    const roomImage = visual.image || '';
    const roomDescription = visual.description || (currentRoom.isBoss ? _pt('Uma câmara massiva se abre diante de você.', 'A massive chamber opens before you.') : _pt('Você entra em outra sala da torre.', 'You enter another room of the tower.'));
    const latestLogMessage = D.dungeonLog && D.dungeonLog[0] ? D.dungeonLog[0].msg : '';
    const exploredCount = D.exploredRooms ? D.exploredRooms.size : 0;
    const totalRoomCount = Array.isArray(D.rooms) ? D.rooms.length : 0;
    const roomLabel = currentRoom.isBoss
      ? _pt('Sala do Chefe', 'Boss Room')
      : currentRoom.isStart
        ? _pt('Entrada', 'Entrance')
        : currentRoom.type === 'treasure'
          ? _pt('Sala do Tesouro', 'Treasure Room')
          : currentRoom.type === 'miniboss'
            ? _pt('Câmara do Mini-Chefe', 'Mini-Boss Chamber')
            : currentRoom.isArea || currentRoom.type === 'area'
              ? _pt('Câmara Aberta', 'Open Chamber')
              : _pt('Corredor', 'Corridor');

    const roomHasAliveMonsters =
      !!(currentRoom.monsters && currentRoom.monsters.some(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)));
    // On small screens, we need more vertical room for the enemy preview/actions. Hide bottom travel UI during encounters.
    const isEncounter = roomHasAliveMonsters && !currentRoom.isBoss && !currentRoom.monstersEvaded;

    area.innerHTML = `
      <div class="dungeon-game ${isEncounter ? 'dungeon-has-encounter' : ''}" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">
        <div class="dungeon-game-screen">
          ${roomImage ? `
            <img class="dungeon-game-scene" src="${roomImage}" alt="${_pt('Cena da Masmorra', 'Dungeon Scene')}" data-error-hide="true">
          ` : `<div class="dungeon-game-scene dungeon-game-scene-fallback"></div>`}
          <div class="dungeon-game-vignette"></div>

<div class="dungeon-hud-top">
  <div class="dungeon-hud-title">${def.icon} ${def.name}</div>
  <div class="dungeon-hud-floor">${_pt(`Andar ${D.floor}`, `Floor ${D.floor}`)}</div>
  <div class="dungeon-hud-actions">
    ${!getChar()?.elemental && (D.floor||1) >= 5 ? `<button class="dungeon-btn dungeon-btn-hud" ${actionAttrs('dungeonDiscoverElemental')}>✨ ${_pt('Espírito', 'Spirit')}</button>` : ''}
    <button class="dungeon-btn dungeon-btn-hud" ${actionAttrs('openGuild')}>${_pt('Guilda', 'Guild')}</button>
    <button class="dungeon-btn dungeon-btn-exit dungeon-btn-hud" ${actionAttrs('dungeonExit')}>${_pt('Sair', 'Exit')}</button>
  </div>
</div>

          <div class="dungeon-hud-minimap">
            <div class="dungeon-hud-minimap-title">${_pt('Mapa', 'Map')}</div>
            <div id="dungeon-minimap" class="dungeon-minimap">${renderMapGrid()}</div>
          </div>

          <div class="dungeon-hud-center">
            <div class="dungeon-hud-room ${roomHasAliveMonsters ? 'has-monster' : ''}">
              <div class="dungeon-hud-room-title">
                ${roomLabel}
                <span class="dungeon-hud-room-id"> � ${_pt(`Sala ${D.playerPos + 1}`, `Room ${D.playerPos + 1}`)}</span>
              </div>
              <div class="dungeon-hud-room-desc">${roomDescription}</div>
              <div class="dungeon-hud-room-progress">${exploredCount}/${totalRoomCount} ${_pt('exploradas', 'explored')}</div>
              ${latestLogMessage ? `<div class="dungeon-hud-room-log"><span>${latestLogMessage}</span></div>` : ''}
              <div class="dungeon-hud-room-info">
                ${renderRoomInfo(currentRoom)}
              </div>
            </div>
          </div>

          <div class="dungeon-hud-bottom">
            <div class="dungeon-travel-bar-wrap dungeon-travel-bar-wrap-hud">
              <div id="dungeon-travel-bar" class="dungeon-travel-bar"></div>
            </div>
            <div class="dungeon-path-options">
              ${(() => {
                // Get all connectable rooms: direct connections + nearby discovered rooms
                const currentRoom = D.rooms[D.playerPos];
                const connectable = [...(currentRoom.connections || [])];
                
                // Add adjacent discovered rooms that aren't in connections yet
                D.rooms.forEach((r, idx) => {
                  if (idx === D.playerPos) return;
                  if (!D.exploredRooms.has(idx)) return;
                  if (connectable.includes(idx)) return;
                  
                  // Check if adjacent in grid
                  const dx = Math.abs(r.x - currentRoom.x);
                  const dy = Math.abs(r.y - currentRoom.y);
                  if (dx <= 1 && dy <= 1 && (dx + dy) > 0 && (r.connections || []).includes(D.playerPos)) {
                    connectable.push(idx);
                  }
                });
                
                return connectable.map(ci => {
                  const cr = D.rooms[ci];
                  const explored = D.exploredRooms.has(ci);
                  const directionArrow = explored ? getRoomDirectionArrow(D.playerPos, ci) : null;
                  const arrowImg = directionArrow ? DIR_IMGS[directionArrow] : 'question.png';
                  const monsterAlive = cr.monsters && cr.monsters.length > 0 && cr.monsters.some(m => 
                    !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)
                  );
                  const text = explored ? `${_pt('Sala ', 'Room ')}${ci+1}` : _pt('Desconhecida', 'Unknown');
                  return `
                    <button class="dungeon-path-btn ${monsterAlive ? 'has-monster' : ''} ${cr.isBoss ? 'is-boss' : ''}"
                            ${actionAttrs('dungeonTravel', ci)} ${D.isTraveling ? 'disabled' : ''}>
                      <span class="dungeon-path-btn-icon"><img class="dungeon-path-btn-arrow-img" src="/images/assets/${arrowImg}" alt="${directionArrow || 'unknown'}"></span>
                      <span class="dungeon-path-btn-text">${text}</span>
                      ${explored ? `<span class="dungeon-path-btn-roomno">#${ci + 1}</span>` : ''}
                    </button>
                  `;
                }).join('');
              })()}
            </div>
          </div>

          <div id="dungeon-overlay" class="dungeon-overlay"></div>
        </div>
      </div>
    `;

    // Always scroll overlay to bottom so HUD/action buttons are in view.
    setTimeout(() => {
      try {
        const o = document.getElementById('dungeon-overlay');
        if (o) o.scrollTop = o.scrollHeight;
      } catch(_) {}
    }, 50);

    if (roomHasAliveMonsters && !currentRoom.isBoss && !currentRoom.monstersEvaded) {
      prefetchCombatForRoom(D.playerPos);
    }
    renderLog();
  }


  function hydrateDungeonPathButtons(connectionIds) {
    const buttons = document.querySelectorAll('.dungeon-path-btn');
    buttons.forEach((btn, index) => {
      const targetIdx = connectionIds[index];
      const iconEl = btn.querySelector('.dungeon-path-btn-icon');
      if (!iconEl || targetIdx == null) return;
      const explored = D.exploredRooms.has(targetIdx);
      const directionArrow = explored ? getRoomDirectionArrow(D.playerPos, targetIdx) : null;
      const arrowImg = directionArrow ? DIR_IMGS[directionArrow] : 'question.png';
      iconEl.innerHTML = `<img class="dungeon-path-btn-arrow-img" src="/images/assets/${arrowImg}" alt="${directionArrow || 'unknown'}">`;
    });
  }
function getRoomDirectionArrow(fromIdx, toIdx) {
    const fromRoom = D.rooms[fromIdx];
    const toRoom = D.rooms[toIdx];
    if (!fromRoom || !toRoom) return 'right';

    const dx = toRoom.x - fromRoom.x;
    const dy = toRoom.y - fromRoom.y;

    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) return 'right';
      if (dx < 0) return 'left';
    }
    if (dy < 0) return 'up';
    if (dy > 0) return 'down';
    return 'right';
  }

function isRoomVisible(idx) {
    if (D.exploredRooms.has(idx)) return true;
    const currentRoom = D.rooms[D.playerPos];
    if (!currentRoom || !Array.isArray(currentRoom.connections)) return false;
    
    // Direct path connection
    if (currentRoom.connections.includes(idx)) return true;
    
    // Adjacent rooms in the grid (within 1 tile in any direction)
    const targetRoom = D.rooms[idx];
    const dx = Math.abs(targetRoom.x - currentRoom.x);
    const dy = Math.abs(targetRoom.y - currentRoom.y);
    if (dx <= 1 && dy <= 1 && (dx + dy) > 0) return true;
    
    return false;
}
function renderMapGrid() {
    const grid = {};
    for (let i = 0; i < D.rooms.length; i++) {
        const r = D.rooms[i];
        grid[`${r.x},${r.y}`] = i;
    }

    const currentRoom = D.rooms[D.playerPos];
    const crawlerRoomIdx = D.crawler && !D.crawler.defeated && D.crawler.active ? D.crawler.roomIdx : null;
    const centerX = currentRoom.x;
    const centerY = currentRoom.y;
    
    const viewSize = 5;
    const offset = Math.floor(viewSize / 2);
    const viewMinX = centerX - offset;
    const viewMaxX = centerX + offset;
    const viewMinY = centerY - offset;
    const viewMaxY = centerY + offset;
    
    const cellSize = 38;
    const roomSize = 16;
    const corridorWidth = 14;
    const gridWidth = (viewMaxX - viewMinX + 1) * cellSize;
    const gridHeight = (viewMaxY - viewMinY + 1) * cellSize;
    
let svg = `<svg class="dungeon-maze-svg" viewBox="0 0 ${gridWidth} ${gridHeight}" style="display:block;width:100%;height:auto;background:rgba(10,15,25,0.9);">`;
    
    for (let y = viewMinY; y <= viewMaxY; y++) {
        for (let x = viewMinX; x <= viewMaxX; x++) {
            const key = `${x},${y}`;
            if (grid[key] !== undefined) {
                const idx = grid[key];
                const room = D.rooms[idx];
                const cx = (x - viewMinX) * cellSize + cellSize / 2;
                const cy = (y - viewMinY) * cellSize + cellSize / 2;
                
                room._mapX = cx;
                room._mapY = cy;
                room._mapIdx = idx;
            } else {
                const cx = (x - viewMinX) * cellSize + cellSize / 2;
                const cy = (y - viewMinY) * cellSize + cellSize / 2;
                svg += `<circle cx="${cx}" cy="${cy}" r="5" fill="rgba(100,100,120,0.25)" stroke="none"/>`;
            }
        }
    }
    
    const drawnCorridors = new Set();
    for (let y = viewMinY; y <= viewMaxY; y++) {
        for (let x = viewMinX; x <= viewMaxX; x++) {
            const key = `${x},${y}`;
            if (grid[key] !== undefined) {
                const idx = grid[key];
                const room = D.rooms[idx];
                const isPlayer = idx === D.playerPos;
                const explored = D.exploredRooms.has(idx);
                const visible = isRoomVisible(idx);
                const showRoom = visible || explored || crawlerRoomIdx === idx;
                
                if (!showRoom || room._mapX === undefined) continue;
                
                const cx = room._mapX;
                const cy = room._mapY;
                
                for (const connIdx of (room.connections || [])) {
                    const connRoom = D.rooms[connIdx];
                    if (!connRoom) continue;
                    const connExplored = D.exploredRooms.has(connIdx);
                    const connVisible = isRoomVisible(connIdx);
                    if (!connExplored && !connVisible) continue;
                    if (connRoom._mapX === undefined) continue;
                    
                    const corridorKey = [Math.min(idx, connIdx), Math.max(idx, connIdx)].join('-');
                    if (drawnCorridors.has(corridorKey)) continue;
                    drawnCorridors.add(corridorKey);
                    
                    const tcx = connRoom._mapX;
                    const tcy = connRoom._mapY;
                    
                    const isPlayerRoom = idx === D.playerPos || connIdx === D.playerPos;
                    const corridorColor = isPlayerRoom ? '#6366f1' : '#374151';
                    const corridorGlow = isPlayerRoom ? '#818cf8' : '#4b5563';
                    
                    svg += `<line x1="${cx}" y1="${cy}" x2="${tcx}" y2="${tcy}" stroke="${corridorGlow}" stroke-width="${corridorWidth + 6}" stroke-linecap="round" opacity="0.3"/>`;
                    svg += `<line x1="${cx}" y1="${cy}" x2="${tcx}" y2="${tcy}" stroke="${corridorColor}" stroke-width="${corridorWidth}" stroke-linecap="round"/>`;
                }
                
                let roomColor = '#1f2937';
                let roomBorder = '#4b5563';
                let roomGlow = 'none';
                if (isPlayer) {
                    roomColor = '#c026d3';
                    roomBorder = '#f0abfc';
                    roomGlow = '#f0abfc';
                } else if (room.isBoss) {
                    roomColor = '#7f1d1d';
                    roomBorder = '#ef4444';
                    roomGlow = '#ef4444';
                } else if (room.isMiniBoss || room.type === 'miniboss') {
                    roomColor = '#581c87';
                    roomBorder = '#c084fc';
                    roomGlow = '#c084fc';
                } else if (room.type === 'treasure') {
                    roomColor = '#713f12';
                    roomBorder = '#fbbf24';
                    roomGlow = '#fbbf24';
                } else if (room.type === 'area' || room.isArea) {
                    roomColor = '#1e40af';
                    roomBorder = '#3b82f6';
                    roomGlow = '#3b82f6';
                } else if (room.monsters && room.monsters.some(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H))) {
                    roomColor = '#7f1d1d';
                    roomBorder = '#f87171';
                    roomGlow = '#f87171';
                } else {
                    roomColor = '#14532d';
                    roomBorder = '#22c55e';
                    roomGlow = '#22c55e';
                }
                
                if (!explored && visible) {
                    roomColor = '#1f2937';
                    roomBorder = '#6b7280';
                    roomGlow = 'none';
                }
                
                if (roomGlow !== 'none') {
                    const pulseClass = isPlayer ? ' class="maze-player-pulse"' : '';
                    svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 2 + 6}" fill="${roomGlow}" opacity="0.4"${pulseClass}/>`;
                }
                
                svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 2}" fill="${roomColor}" stroke="${roomBorder}" stroke-width="2"/>`;
                
                if (isPlayer) {
                    svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 4}" fill="#fff" opacity="0.95"/>`;
                }

                if (crawlerRoomIdx === idx) {
                    svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 2 + 8}" fill="rgba(239,68,68,0.18)" stroke="rgba(248,113,113,0.55)" stroke-width="2"/>`;
                    svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 3}" fill="#991b1b" stroke="#fca5a5" stroke-width="1.5"/>`;
                    svg += `<circle cx="${cx}" cy="${cy}" r="${roomSize / 7}" fill="#fee2e2" opacity="0.95"/>`;
                }
                
                if (room.isBoss) {
                    svg += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" font-size="10" fill="#fff">👑</text>`;
                }
            }
        }
    }
    
    for (let i = 0; i < D.rooms.length; i++) {
        delete D.rooms[i]._mapX;
        delete D.rooms[i]._mapY;
        delete D.rooms[i]._mapIdx;
    }
    
    svg += '</svg>';
    return svg;
}
function renderRoomInfo(room) {
    // Check if there are any monsters (array) and if any are alive
    const hasMonsters = room.monsters && room.monsters.length > 0;
    const anyMonsterAlive = hasMonsters && room.monsters.some(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H));
    const allMonstersRespawning = hasMonsters && room.monsters.every(m => m.lastKilled && !elapsed(m.lastKilled, MONSTER_RESPAWN_H));
    
    // Get first alive monster for display (if multiple)
    const aliveMonster = anyMonsterAlive ? room.monsters.find(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)) : null;
    // Hydrate missing or old-path images directly from pool templates
    const monsterImg = aliveMonster?.image;
    if (aliveMonster && (!monsterImg || /\/images\/dungeon\/miniboss\d*\.jpg/i.test(monsterImg))) {
        const id = aliveMonster.id || (aliveMonster.name || '').toLowerCase().replace(/[^\w]+/g, '_');
        const byName = (m) => (m.name || '').toLowerCase().replace(/[^\w]+/g, '_');
        const found = MONSTER_POOL.find(m => m.id === id)
            || MONSTER_POOL.find(m => byName(m) === id)
            || MINI_BOSS_POOL.find(m => byName(m) === id);
        if (found && found.image) aliveMonster.image = found.image;
    }
    const monsterCount = room.monsters ? room.monsters.length : 0;
    const aliveCount = room.monsters ? room.monsters.filter(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H)).length : 0;

    if (D.eventMode && room.monstersCleared) {
        return `
            <div class="dungeon-room-clear">
                <div style="color:var(--dungeon-muted)">✅ ${_pt('Sala do Trial limpa! Avance para o próximo desafio.', 'Trial room cleared! Push deeper into the event.')}</div>
            </div>
        `;
    }

    if (room.isBoss && !D.eventMode) {
        const def = getDungeonDef(D.activeDungeon);
        const boss = def.boss;
        // Once beaten, a floor's boss never respawns — the room shows the stairs instead.
        if (D.bossDefeated) {
            const nf = D.floor + 1;
            return `
                <div class="dungeon-boss-room">
                    <div class="boss-name-big" style="margin-top:0">${boss.name}</div>
                    <div class="boss-drop-preview" style="margin-bottom:8px">✅ ${_pt('Chefe derrotado — nunca mais reaparecerá.', 'Boss defeated — it will never respawn.')}</div>
                    <div class="stairs-hint" style="font-size:0.85rem;color:var(--dungeon-gold,#e8c66a);margin-bottom:8px">⬇️ ${_pt(`As escadas para o Andar ${nf} estão abertas.`, `Stairs to Floor ${nf} are open.`)}</div>
                    <button class="dungeon-btn dungeon-btn-fight boss-fight-btn" ${actionAttrs('descendDungeonFloor')}>⬇️ ${_pt(`Descer ao Andar ${nf}`, `Descend to Floor ${nf}`)}</button>
                </div>
            `;
        }
        return `
            <div class="dungeon-boss-room">
                <div style="width:82px;height:110px;margin:0 auto 6px;border-radius:10px;overflow:hidden;border:2px solid var(--dungeon-gold)">
                    <img src="${boss.image}" alt="${boss.name}" data-error-hide="true" data-error-next-display="flex" style="width:100%;height:100%;object-fit:cover">
                </div>
                <div class="boss-name-big" style="margin-top:0">${boss.name}</div>
                <div class="fighter-class" style="margin-bottom:8px">⚔️ ${boss.atk || '?'} · 🛡️ ${boss.def || '?'}</div>
                <div class="boss-drop-preview" style="margin-bottom:8px">
                    💰${boss.loot.gold[0]}-${boss.loot.gold[1]}g · 💎${boss.loot.gems[0]}-${boss.loot.gems[1]} · ✨${boss.loot.premiumDays[0]}-${boss.loot.premiumDays[1]}d premium
                </div>
                <button class="dungeon-btn dungeon-btn-fight boss-fight-btn" ${actionAttrs('dungeonFightBoss', room.id)}>
                    ⚔️ ${_pt(`Desafiar Chefe (${TOKENS_PER_RUN} Tokens Necessários)`, `Challenge Boss (${TOKENS_PER_RUN} Tokens Required)`)}
                </button>
            </div>
        `;
    }

    if (room.isMiniBoss && anyMonsterAlive) {
        const m = aliveMonster;
        const hasImg = !!m.image;
        return `
            <div class="dungeon-room-monster">
                <div style="width:82px;height:110px;margin:0 auto 4px;border-radius:10px;overflow:hidden;border:2px solid rgba(201,146,42,0.45)">
                    ${hasImg ? `<img src="${m.image}" alt="${m.name}" data-error-hide="true" data-error-next-display="flex" style="width:100%;height:100%;object-fit:cover">` : ''}
                    <span class="battle-fighter-fallback" style="${hasImg ? 'display:none' : ''}">${m.icon || '👾'}</span>
                </div>
                <div class="fighter-name" style="margin-bottom:2px;font-weight:700">${_pt('MINI-CHEFE:', 'MINI-BOSS:')} ${m.name}</div>
                <div class="fighter-class">⚔️ ${m.atk || '?'} · 🛡️ ${m.def || '?'}</div>
                <div class="monster-btns" style="margin-top:6px">
                    <button class="dungeon-btn dungeon-btn-fight" ${actionAttrs('dungeonFightMiniBoss', room.id)}>⚔️ ${_pt('Desafiar Mini-Chefe', 'Challenge Mini-Boss')}</button>
                </div>
            </div>
        `;
    }

    if (anyMonsterAlive) {
        const aliveMonsters = room.monsters.filter(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H));
        const aliveCount = aliveMonsters.length;
        if (!D._roomMonsterOffset) D._roomMonsterOffset = {};
        const roomIdx = D.rooms.indexOf(room);
        const perPage = window.innerWidth <= 768 ? 1 : 3;
        let offset = D._roomMonsterOffset[roomIdx] ?? 0;
        if (offset >= aliveCount) offset = Math.max(0, aliveCount - perPage);
        const visible = aliveMonsters.slice(offset, offset + perPage);
        const hasPrev = offset > 0;
        const hasNext = offset + perPage < aliveCount;

        const cardsHtml = visible.map(m => {
            const hi = !!m.image;
            return `
                <div style="text-align:center">
                    <div style="width:82px;height:110px;margin:0 auto 4px;border-radius:10px;overflow:hidden;border:2px solid rgba(100,180,255,0.35);display:flex;align-items:center;justify-content:center">
                        ${hi ? `<img src="${m.image}" alt="${m.name}" data-error-hide="true" data-error-next-display="flex" style="width:100%;height:100%;object-fit:cover">` : ''}
                        <span class="battle-fighter-fallback" style="${hi ? 'display:none' : ''}">${m.icon || '👾'}</span>
                    </div>
                    <div class="fighter-name" style="font-size:0.7rem;font-weight:600;max-width:82px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${m.name}">${m.name}</div>
                    <div class="fighter-class" style="font-size:0.6rem">⚔️ ${m.atk || '?'} · 🛡️ ${m.def || '?'}</div>
                </div>
            `;
        }).join('');

        const arrowStyle = 'width:28px;height:80px;border:none;background:rgba(0,0,0,0.2);color:rgba(201,146,42,0.7);cursor:pointer;border-radius:6px;font-size:1rem;display:flex;align-items:center;justify-content:center;flex-shrink:0';
        const prevArrow = hasPrev ? `<button style="${arrowStyle}" data-action="roomDeckNav" data-args='[-1]'>◀</button>` : `<div style="width:28px;flex-shrink:0"></div>`;
        const nextArrow = hasNext ? `<button style="${arrowStyle}" data-action="roomDeckNav" data-args='[1]'>▶</button>` : `<div style="width:28px;flex-shrink:0"></div>`;

        return `
            <div class="dungeon-room-monster" style="text-align:center">
                <div style="display:flex;align-items:center;justify-content:center;gap:4px">
                    ${prevArrow}
                    <div style="display:flex;gap:8px;justify-content:center">
                        ${cardsHtml}
                    </div>
                    ${nextArrow}
                </div>
                ${aliveCount > 1 ? `<div class="deck-counter" style="margin-top:2px">${offset + 1}–${Math.min(offset + perPage, aliveCount)} ${_pt('de', 'of')} ${aliveCount}</div>` : ''}
                <div class="monster-btns" style="margin-top:6px">
                    <button class="dungeon-btn dungeon-btn-fight" ${actionAttrs('dungeonFight', room.id)}>⚔️ ${D.eventMode && room.isBoss ? _pt('Desafiar o Soberano (GRÁTIS)', 'Challenge the Sovereign (FREE)') : _pt('Lutar', 'Fight')}</button>
                </div>
                ${(() => { const anyStolen = room.monsters.find(m => m.stolenItems?.length); return anyStolen ? `
                    <div class="stolen-items-notice" style="margin-top:4px">
                        🎒 ${_pt('O monstro carrega itens roubados', 'Monster carries stolen items')}
                    </div>` : '';
                })()}
            </div>
        `;
    }

    if (allMonstersRespawning && room.monsters && room.monsters[0]) {
        const hoursLeft = (MONSTER_RESPAWN_H - (Date.now() - room.monsters[0].lastKilled) / 3600000).toFixed(1);
        return `
            <div class="dungeon-room-clear">
                <div style="color:var(--dungeon-muted);font-size:0.9rem">💤 ${_pt(`${monsterCount} monstro${monsterCount > 1 ? 's' : ''} renasce${monsterCount > 1 ? 'm' : ''} em ${hoursLeft}h`, `${monsterCount} monster${monsterCount > 1 ? 's' : ''} respawn${monsterCount > 1 ? '' : 's'} in ${hoursLeft}h`)}</div>
                ${room.type === 'treasure' ? `<div style="color:#f1c40f;margin-top:8px">💰 ${_pt('Tesouro já saqueado', 'Treasure already looted')}</div>` : ''}
            </div>
        `;
    }

    return `
        <div class="dungeon-room-clear">
            <div style="color:var(--dungeon-muted)">
                ${room.isStart ? _pt('🚪 Entrada da Masmorra — escolha um caminho para explorar.', '🚪 Dungeon Entrance — choose a path to explore.') :
                    room.type === 'treasure' ? (room.looted ? _pt('💰 Tesouro já coletado.', '💰 Treasure already collected.') : _pt('✨ Câmara tranquila. Tesouro coletado!', '✨ Peaceful chamber. Treasure collected!')) :
                    _pt('🏚️ Corredor vazio. Tudo limpo.', '🏚️ Empty corridor. All clear.')}
</div>
          </div>
    `;
}

// ── Trial of the Arcane ── fixed 4-champion party combat panel ──
// The player picks one champion (active) + one ability per turn; the active
// champion takes all monster retaliation at the end of the turn.
// Arena layout: monster row on TOP, a VS divider, then the champion row —
// there are NO preview cards; the rows themselves are the fighters.

// Always-visible row of ALL monsters in the room, with individual HP bars.
// Click a card to set it as the single-target ability's target.
function buildTrialMonsterRowHtml(monsters) {
    if (!Array.isArray(monsters) || monsters.length === 0) {
        return `<div style="padding:4px 8px;color:var(--dungeon-muted);text-align:center;font-size:0.7rem">${_pt('Carregando inimigos...', 'Loading enemies...')}</div>`;
    }
    return monsters.map((m, i) => {
        const hp = Math.max(0, Number(m.currentHp ?? m.hp ?? 0));
        const maxHp = Math.max(1, Number(m.maxHp ?? m.hp ?? 1));
        const pct = Math.max(0, Math.min(100, Math.round((hp / maxHp) * 100)));
        const dead = hp <= 0;
        const isTarget = i === D.combat.currentMonsterIndex;
        const hasImg = !!m.image;
        // Real-time status: burn counts down in ticks, freeze is a wall-clock stamp.
        const burns = Math.max(0, Number(m.burnTicksLeft || 0));
        const frozen = Number(m.freezeUntil || 0) > trialServerNowMs();
        const statusCls = dead ? '' : (frozen ? ' frozen' : (burns > 0 ? ' burning' : ''));
        return `
            <div id="trial-mon-${i}" class="trial-mon-card ${dead ? 'down' : ''} ${isTarget ? 'target' : ''}${statusCls} ${m.isBoss ? 'is-boss-card' : ''}" ${dead ? '' : `data-action="selectMonster" data-args='[${i}]'`} style="${dead ? '' : 'cursor:pointer'}">
                ${hasImg ? `<img class="trial-card-bg" src="${m.image}" alt="${m.name}" data-error-hide="true">` : ''}
                <div class="trial-card-overlay"></div>
                <div class="trial-card-content">
                    <div class="trial-char-name">${m.name}${dead ? ' ☠️' : ''}</div>
                    <div class="trial-char-role">${m.isBoss ? '👑 BOSS' : `⚔️ ${m.atk || 0} · 🛡️ ${m.def || 0}`}</div>
                    <div style="width:100%;height:4px;background:rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;margin-top:3px">
                        <div class="fighter-hp-bar trial-hp" style="width:${dead ? 0 : pct}%;height:100%;background:linear-gradient(90deg,#e74c3c,#e67e22)"></div>
                    </div>
                    <div class="trial-char-stat">${hp}/${maxHp}</div>
                </div>
                ${frozen ? '<div class="trial-mon-status trial-mon-status-frozen">🧊</div>' : ''}
                ${burns > 0 ? '<div class="trial-mon-status trial-mon-status-burn">🔥 ' + burns + '</div>' : ''}
                ${isTarget ? '<div class="trial-mon-target">🎯</div>' : ''}
            </div>`;
    }).join('');
}

function buildTrialPartyRowHtml(party) {
    if (!Array.isArray(party) || party.length === 0) {
        return `<div style="padding:8px 12px;color:var(--dungeon-muted);text-align:center">${_pt('Carregando campeões...', 'Loading champions...')}</div>`;
    }
    return party.map((c, i) => {
        const isActive = i === D.combat.trialActiveChar;
        const hpPct = Math.round((c.hp / Math.max(1, c.maxHp)) * 100);
        const enPct = Math.round((c.energy / Math.max(1, c.maxEnergy)) * 100);
        const down = !c.alive;
        const hasImg = !!(c.image || c.className);
        const imgSrc = c.image || (c.className ? `/images/class/${c.className}.png` : '');
        return `
            <div id="trial-char-${i}" class="trial-char-card ${isActive ? 'active' : ''} ${down ? 'down' : ''}" data-action="trialSelectChar" data-args='[${i}]' data-char-name="${c.name}" style="cursor:pointer">
                ${imgSrc ? `<img class="trial-card-bg" src="${imgSrc}" alt="${c.name}" data-error-hide="true">` : ''}
                <div class="trial-card-overlay"></div>
                <div class="trial-card-content">
                    <div class="trial-char-name">${c.name}${down ? ' ☠️' : ''}</div>
                    <div class="trial-char-role">${c.role || ''}</div>
                    <div style="width:100%;height:4px;background:rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;margin-top:3px">
                        <div class="fighter-hp-bar trial-hp" style="width:${down ? 0 : hpPct}%;height:100%;background:linear-gradient(90deg,#e74c3c,#27ae60)"></div>
                    </div>
                    <div class="trial-char-stat">❤️ ${Math.max(0, c.hp)}/${c.maxHp}</div>
                    <div style="width:100%;height:3px;background:rgba(255,255,255,0.12);border-radius:2px;overflow:hidden;margin-top:2px">
                        <div class="trial-en" style="width:${enPct}%;height:100%;background:linear-gradient(90deg,#0984e3,#00cec9)"></div>
                    </div>
                    <div class="trial-char-stat">🔷 ${Math.max(0, c.energy)}/${c.maxEnergy}</div>
                </div>
                ${down ? '<div class="trial-char-down">☠️</div>' : ''}
            </div>`;
    }).join('');
}

// Attack buttons as DECALS (normal / burst / ultimate — shared art per button
// type, alpha-channel PNGs with a transparent halo). Gating rules:
//   • normal  — always usable (generates energy)
//   • burst   — no energy cost (generates energy too) + 15s wall-clock cooldown
//   • ultimate — needs a FULL energy bar (drains it) + 30s cooldown
// Only the ultimate wears an SVG gauge (fills toward the full bar); attacks and
// bursts GENERATE energy, so they carry just the +N badge and the ready glow. A
// countdown pill + dark veil show while an ability recharges.
function buildTrialAbilityRowHtml(champ) {
    if (!champ) return '';
    const isBusy = !!D.combat.resolving;
    const energy = Number(champ.energy || 0);
    const maxEnergy = Math.max(1, Number(champ.maxEnergy || 120));
    const abil = (Array.isArray(champ.abilities) ? champ.abilities : []).map(a => {
        const type = a.type || 'attack';
        const cost = Number(a.cost || 0);
        const cdTotal = Math.max(1000, Number(a.cooldownMs || 5000));
        // Real-time cooldown: wall-clock stamp on the champion's cdUntil map.
        const cdLeftMs = cdMsLeft(champ, a.id);
        // Ultimates need a FULL energy bar; attacks/bursts (cost 0) just need
        // their cooldown cleared.
        const energyOk = type === 'ultimate' ? energy >= maxEnergy : energy >= cost;
        const ready = energyOk && cdLeftMs <= 0;
        const locked = isBusy || !champ.alive || !ready;
        let hint = '';
        if (isBusy) hint = _pt('resolvendo...', 'resolving...');
        else if (!champ.alive) hint = _pt('derrubado', 'down');
        else if (cdLeftMs > 0) hint = _pt(`recarregando (${Math.ceil(cdLeftMs / 1000)}s)`, `recharging (${Math.ceil(cdLeftMs / 1000)}s)`);
        else if (!energyOk) hint = _pt('precisa da barra cheia', 'needs a full bar');
        else hint = _pt(a.name, a.name);
        // Generator badge: how much energy this button feeds the ultimate.
        const gen = (type === 'attack' || type === 'burst') ? Number(champ.energyGain || 0) : 0;
        // SVG gauge only where energy is SPENT: ultimate toward the FULL bar.
        // Attacks and bursts only generate energy — no ring, just the +N
        // generator badge and the ready glow. (r=15.9155 → circumference ≈ 100,
        // so dashoffset = 100 − pct.)
        const ringDenom = maxEnergy;
        const ringPct = Math.min(100, Math.round((energy / ringDenom) * 100));
        const offset = 100 - ringPct;
        const imgKey = type === 'attack' ? 'normal' : type; // art files: trial-attack-normal|burst|ultimate
        return `
            <button class="trial-ability-btn trial-atk-${type} ${locked ? 'trial-ability-locked' : ''} ${ready ? 'trial-ability-ready' : ''}" data-abil="${a.id}" data-cd-total="${cdTotal}" title="${a.name} — ${a.desc || ''}${hint ? ` (${hint})` : ''}" ${locked ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('trialUseAbility', a.id)}>
                <span class="trial-decal-wrap">
                    <img class="trial-decal-img" src="/images/decals/trial-attack-${imgKey}.png?v=2026-09-18-burstgen" alt="" data-error-hide="true">
                    ${type === 'ultimate' ? `
                    <svg class="trial-energy-ring" viewBox="0 0 36 36" aria-hidden="true">
                        <circle class="trial-ring-bg" cx="18" cy="18" r="15.9155"></circle>
                        <circle class="trial-ring-fill" cx="18" cy="18" r="15.9155" stroke-dasharray="100 100" stroke-dashoffset="${offset}"></circle>
                    </svg>` : ''}
                    ${gen > 0 ? `<span class="trial-gen-badge">+${gen}</span>` : ''}
                    <span class="trial-cd-pill" ${cdLeftMs <= 0 ? 'style="display:none"' : ''}>${Math.ceil(cdLeftMs / 1000)}</span>
                    <span class="trial-cd-veil" ${cdLeftMs <= 0 ? 'style="display:none"' : ''}></span>
                </span>
            </button>`;
    }).join('');
    return (abil + buildTrialSkipBtnHtml(champ, isBusy)) || `<div style="color:var(--dungeon-muted);font-size:0.75rem">${_pt('Nenhuma habilidade disponível.', 'No abilities available.')}</div>`;
}

// Skip decal: in real-time combat it does nothing server-side — it just resets
// the active champion's local target-lock visual. Kept for muscle memory.
function buildTrialSkipBtnHtml(champ, isBusy) {
    const alive = !!champ?.alive;
    const locked = isBusy || !alive;
    const hint = isBusy ? _pt('resolvendo...', 'resolving...')
        : !alive ? _pt('derrubado', 'down')
        : _pt('reiniciar mira', 'reset target lock');
    return `
        <button class="trial-ability-btn trial-atk-skip ${locked ? 'trial-ability-locked' : ''}" title="${hint}" ${locked ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('trialSkipAction')}>
            <span class="trial-decal-wrap">
                <img class="trial-decal-img" src="/images/decals/trial-attack-skip.png" alt="" data-error-hide="true">
            </span>
        </button>`;
}

// Live battle clock: remaining cooldown (ms) for one ability of one champion,
// computed against the synced server clock so UI seconds match the server's.
function cdMsLeft(champ, abilityId) {
    const stamps = champ?.cdUntil || {};
    const until = Number(stamps[abilityId] || 0);
    if (!(until > 0)) return 0;
    return Math.max(0, until - trialServerNowMs());
}
function trialServerNowMs() {
    // The server echoes its Date.now() on every act; the client keeps the offset
    // so cooldown labels always agree with server-authoritative gating.
    if (typeof D.combat?._serverNow !== 'number' || typeof D.combat?._serverNowAtClient !== 'number') return Date.now();
    return Date.now() + (D.combat._serverNow - D.combat._serverNowAtClient);
}

// ── Trial of the Arcane ambience ─────────────────────────────────────────
// The combat backdrop becomes an arcane vault scene: purple-gold vignette,
// two counter-rotating mana swirls, drifting runic glyphs and floating motes.
// Built once (module scope) so re-renders don't reshuffle the scene.
const TRIAL_GLYPHS = ['☉', '☽', '✦', 'ᚠ', 'ᛗ', 'ᛟ', '⚡', '✵', '◈', 'ᚨ', '✧', 'ᛉ'];
const TRIAL_MOTE_COUNT = 26;

function trialMoteStyle(i) {
    const rand = (seed) => {
        // Deterministic pseudo-random per mote index (stable across re-renders).
        const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
        return x - Math.floor(x);
    };
    const left = (rand(1) * 100).toFixed(1);
    const size = (2 + rand(2) * 4).toFixed(1);
    const dur = (9 + rand(3) * 14).toFixed(1);
    const delay = (-rand(4) * 20).toFixed(1);
    const drift = ((rand(5) - 0.5) * 90).toFixed(0);
    const gold = rand(6) > 0.45;
    return `left:${left}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s;--mote-drift:${drift}px;${gold ? 'background:radial-gradient(circle,rgba(255,222,130,0.95),rgba(255,200,80,0) 70%);' : ''}`;
}

// In-panel battlefield effects (glyphs drift inside the combat card itself,
// above the artwork but below all content — pure ambience, pointer-events off).
function trialFieldGlyphStyle(i) {
    const rand = (s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
    const left = (5 + rand(1) * 88).toFixed(1);
    const top = (6 + rand(2) * 76).toFixed(1);
    const size = (0.75 + rand(3) * 0.85).toFixed(2);
    const dur = (8 + rand(4) * 9).toFixed(1);
    const delay = (-rand(5) * 12).toFixed(1);
    const violet = rand(6) > 0.6;
    return `left:${left}%;top:${top}%;font-size:${size}rem;animation-duration:${dur}s;animation-delay:${delay}s;${violet ? 'color:rgba(178,148,255,0.85);text-shadow:0 0 10px rgba(155,125,255,0.4);' : ''}`;
}
function trialFieldMoteStyle(i) {
    const rand = (s) => { const x = Math.sin(i * 269.5 + s * 183.3) * 43758.5453; return x - Math.floor(x); };
    const left = (rand(1) * 97).toFixed(1);
    const top = (8 + rand(2) * 84).toFixed(1);
    const size = (2 + rand(3) * 3.5).toFixed(1);
    const dur = (6 + rand(4) * 8).toFixed(1);
    const delay = (-rand(5) * 10).toFixed(1);
    const dx = ((rand(6) - 0.5) * 36).toFixed(0);
    return `left:${left}%;top:${top}%;width:${size}px;height:${size}px;animation-duration:${dur}s;animation-delay:${delay}s;--wisp-dx:${dx}px;`;
}

// The battle's ambience + field FX are built EXACTLY ONCE per battle, then the
// panel body is re-rendered around them. Re-creating these subtrees on every
// render restarts their CSS animations (motes/glyphs/beam snap back), which
// reads as constant flashing on real devices — and right under the skill-check
// overlay it looks broken. Deterministic per-index styles keep every rebuild
// looks-identical if a fresh scene is ever needed.
function trialAmbienceSceneHtml() {
    return `
        <div class="dungeon-overlay-backdrop trial-ambience">
            <div class="trial-ambience-vignette"></div>
            <div class="trial-ambience-vault"></div>
            <div class="trial-ambience-swirl trial-swirl-a"></div>
            <div class="trial-ambience-swirl trial-swirl-b"></div>
            <div class="trial-ambience-glyphs">${TRIAL_GLYPHS.map(g => `<span>${g}</span>`).join('')}</div>
            <div class="trial-ambience-motes">${Array.from({ length: TRIAL_MOTE_COUNT }, (_, i) => `<i style="${trialMoteStyle(i)}"></i>`).join('')}</div>
        </div>`;
}

function trialFieldFxSceneHtml() {
    return `
        <div class="trial-field-vignette"></div>
        <div class="trial-field-beam"></div>
        <div class="trial-field-glyphs">${TRIAL_GLYPHS.map((g, i) => `<span style="${trialFieldGlyphStyle(i)}">${g}</span>`).join('')}</div>
        <div class="trial-field-motes">${Array.from({ length: 14 }, (_, i) => `<i class="${i % 3 === 0 ? 'gold' : ''}" style="${trialFieldMoteStyle(i)}"></i>`).join('')}</div>`;
}

function renderTrialCombatPanel() {
    const overlay = document.getElementById('dungeon-overlay');
    if (!overlay || !D.combat) return;
    const def = getDungeonDef('event');
    const monsters = D.combat.monsters;
    const currentMonster = monsters[D.combat.currentMonsterIndex] || {};
    const party = D.combat.party || [];
    const active = party[D.combat.trialActiveChar] || null;
    const isLoading = !Array.isArray(monsters) || monsters.length === 0 || Array.isArray(party) && party.length === 0;

    // Persistent layer, built ONCE per battle: full-screen ambience + in-card
    // field FX. Re-renders only refresh `.trial-card-body`, so their CSS
    // animations keep running instead of restarting on every action (which
    // flashed constantly on phones, brightest right under the skill check).
    let amb = overlay.querySelector(':scope > .trial-ambience');
    if (!amb) {
        amb = document.createElement('div');
        amb.className = 'dungeon-overlay-backdrop trial-ambience';
        amb.innerHTML = trialAmbienceSceneHtml();
        overlay.appendChild(amb);
    }

    let card = overlay.querySelector(':scope > .dungeon-overlay-card.dungeon-trial-panel');
    if (!card) {
        card = document.createElement('div');
        card.className = 'dungeon-overlay-card dungeon-combat-panel dungeon-trial-panel';
        card.style.setProperty('--dtheme', def.theme);
        card.style.setProperty('--dglow', def.themeGlow);
        overlay.appendChild(card);
    }

    const fx = card.querySelector(':scope > .trial-field-fx');
    if (!fx) {
        const fxEl = document.createElement('div');
        fxEl.className = 'trial-field-fx';
        fxEl.setAttribute('aria-hidden', 'true');
        fxEl.innerHTML = trialFieldFxSceneHtml();
        card.appendChild(fxEl);
    }

    let body = card.querySelector(':scope > .trial-card-body');
    if (!body) {
        const bodyEl = document.createElement('div');
        bodyEl.className = 'trial-card-body';
        card.appendChild(bodyEl);
        body = bodyEl;
    }

    const partyRowHtml = buildTrialPartyRowHtml(party);
    const abilityRowHtml = buildTrialAbilityRowHtml(active);
    const turn = Math.max(1, Number(D.combat.round ?? 1));

    const roundEntries = D.combat.roundLog.slice(-10).reverse().map(e =>
        `<div class="combat-log-entry ${e.actor}">${_ptCombat(e.text)}</div>`
    ).join('');

    const escapeReady = !!D.combat.escapeReady;
    const isBusy = !!D.combat.resolving;

    const scoreVal = Number(D.eventRun?.score ?? 0);
    const roomIdx = Number(D.combat?.roomIdx ?? 0);
    const timerText = (() => {
        if (!D._eventStarted || !D._eventStartTime) return '0:00';
        const secs = Math.max(0, Math.floor((Date.now() - D._eventStartTime) / 1000));
        return Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
    })();

    body.innerHTML = `
        <div class="trial-hud">
            <div class="trial-hud-pill"><span class="trial-hud-ico">⭐</span> <span class="trial-hud-num" id="event-cb-score">${scoreVal}</span></div>
            <div class="trial-hud-pill"><span class="trial-hud-ico">⏱️</span> <span class="trial-hud-num" id="event-cb-timer">${timerText}</span></div>
            <div class="trial-hud-pill"><span class="trial-hud-ico">🚩</span> <span class="trial-hud-num" id="event-cb-room">${roomIdx + 1}/10</span></div>
        </div>
        <div class="combat-header">
            ${currentMonster.isBoss ? `<div class="combat-boss-warning">⚠️ ${_pt('O SOBERANO ARCANO', 'THE ARCANE SOVEREIGN')}</div>` : `<div class="combat-boss-warning">👁️ ${_pt('PROVAÇÃO DO ARCANO', 'TRIAL OF THE ARCANE')}</div>`}
            <div class="combat-title">${_pt(`Sala ${(Number(D.combat?.roomIdx ?? 1) + 1)} de 10`, `Room ${(Number(D.combat?.roomIdx ?? 1) + 1)} of 10`)}</div>
            <div class="trial-turn-pill">🕯️ ${_pt('Tempo real', 'Real-time')}</div>
        </div>

        <div class="trial-arena">
            <div class="trial-monster-row">${buildTrialMonsterRowHtml(monsters)}</div>
            <div class="trial-arena-clash">VS</div>
        </div>
        <div class="trial-turn-block">
            <div class="trial-turn-strip">
                ${typeof D.combat.trialFocusMult === 'number' ? `<span style="color:${D.combat.trialFocusMult >= 0.9 ? '#ffd700' : '#9b7dff'}">🌟 ${_pt('Foco de Batalha', 'Battle Focus')}: ×${(0.5 + 0.5 * D.combat.trialFocusMult).toFixed(2)}</span>` : ''}
                <span style="color:#ff9f43">🔥+🧊 = ${_pt('pontos de combo', 'combo pts')}</span>
                <span class="trial-live-dot">● ${_pt('ao vivo', 'live')}</span>
            </div>
            ${active && !active.alive ? `<div class="trial-down-hint">${_pt('Este campeão está derrubado — escolha outro. (Curas podem revivê-lo.)', 'This champion is down — pick another. (Heals can revive.)')}</div>` : ''}
        </div>

        <div class="combat-log">${roundEntries || '<div class="combat-log-entry" style="color:var(--dungeon-muted)">'+_pt('O Trial começa...', 'The Trial begins...')+'</div>'}</div>

        <!-- Champion row lives at the end of the flex body; mobile 'order'
             rules place it just above the fixed action dock for one-handed
             champion selection. -->
        <div class="trial-party-row">${partyRowHtml}</div>

        <div class="combat-actions">
            ${escapeReady
                ? `<button class="dungeon-btn dungeon-btn-run" ${actionAttrs('dungeonEscapeConfirm')}>🚪 ${_pt('Sair', 'Get Out')}</button>
                   <button class="dungeon-btn dungeon-btn-fight" ${actionAttrs('dungeonEscapeCancel')}>⚔️ ${_pt('Continuar Lutando', 'Keep Fighting')}</button>`
                : `<div class="trial-ability-row">${abilityRowHtml}</div>
                   <div class="trial-flee-row">
                       <button class="dungeon-btn dungeon-btn-run trial-flee-btn" ${isBusy ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('dungeonRunCombat')}>💨 ${_pt('Fugir', 'Flee')}</button>
                   </div>`}
        </div>
    `;
}

function trialSelectChar(idx) {
    if (!D.combat || !D.combat.isTrial) return;
    const party = D.combat.party || [];
    if (party[idx] && party[idx].alive) {
        D.combat.trialActiveChar = idx;
        renderTrialCombatPanel();
    }
}

// Grab the live DOM nodes + rects of every trial row card BEFORE an action
// re-renders the panel. Node clones (including the full-bleed portrait) become the
// shatter ghosts, so the animation shows the real card art even after re-render.
// Row cards carry their fighter's HP so we can tell which ones just died.
function captureTrialCardSnapshots() {
    const overlay = document.getElementById('dungeon-overlay');
    if (!overlay) return {};
    const snap = {};
    snap.monsterRects = [...overlay.querySelectorAll('.trial-mon-card')].map((node, i) => ({
        node: node.cloneNode(true),
        rect: node.getBoundingClientRect(),
        hp: Math.max(0, Number(D.combat?.monsters?.[i]?.currentHp ?? 0)),
    }));
    snap.champRects = [...overlay.querySelectorAll('.trial-char-card')].map((node, i) => ({
        node: node.cloneNode(true),
        rect: node.getBoundingClientRect(),
        alive: !!D.combat?.party?.[i]?.alive,
    }));
    return snap;
}

// Fire the stashed death shatters: every fighter that died since the pending
// snapshot was taken shatters fully at its captured grid-slot position. Called
// only AFTER the skill check has completed and the attack/retaliation timeline
// has played out — never while a skill-check overlay is on screen.
function firePendingTrialDeathShatters() {
    if (!D.combat || !D.combat.isTrial) return;
    const stash = D.combat._pendingDeathShatters;
    D.combat._pendingDeathShatters = null;
    if (D.combat._deathShatterTimer) { clearTimeout(D.combat._deathShatterTimer); D.combat._deathShatterTimer = null; }
    // Hand the panel back its authoritative down-rendered nodes — the shatter
    // ghosts carry the death visuals now.
    const restorable = D.combat._restorableDeadNodes;
    if (Array.isArray(restorable)) {
        const overlay = document.getElementById('dungeon-overlay');
        restorable.forEach(({ selector, idx, deadNode }) => {
            if (!overlay || !deadNode) return;
            const aliveNode = overlay.querySelector(`${selector}-${idx}`);
            if (aliveNode && aliveNode.parentNode) aliveNode.replaceWith(deadNode);
        });
    }
    D.combat._restorableDeadNodes = null;
    if (!stash) return;
    queueTrialDeathShatters(stash, null);
}

// Full shatter (shake → blow-out → shards) for any trial fighter that just died —
// the same treatment the big monster card always got. The panel usually re-renders
// before the animation plays, so we shatter a fixed-position ghost clone captured
// at the dying card's exact rect, in its own grid slot.
function queueTrialDeathShatters(prev, next) {
    if (!D.combat || !D.combat.isTrial) return;
    prev = prev || {};
    next = next || {};

    const shatterGhost = (node, rect) => {
        if (!node || !rect || !rect.width || !rect.height) return;
        const ghost = document.createElement('div');
        ghost.style.cssText = `position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;z-index:500000;pointer-events:none;overflow:hidden;border-radius:12px`;
        ghost.appendChild(node);
        document.body.appendChild(ghost);
        pixelDissolveCard(ghost);
        // The ghost lives on <body> (outside the re-rendered panel) — clean it up
        // once the intro + shard rain has fully played out.
        setTimeout(() => { try { ghost.remove(); } catch (e) { /* noop */ } }, 3200);
    };

    // Monster deaths — only row cards whose monster just transitioned alive → dead,
    // each shattered at its own grid slot position.
    (prev.monsterRects || []).forEach((r, i) => {
        const nowHp = Math.max(0, Number(D.combat?.monsters?.[i]?.currentHp ?? 0));
        if (r.hp > 0 && nowHp <= 0) shatterGhost(r.node, r.rect);
    });

    // Champion deaths — row cards whose champion just transitioned alive → down.
    (prev.champRects || []).forEach((r, i) => {
        const nowAlive = !!D.combat?.party?.[i]?.alive;
        if (r.alive && !nowAlive) shatterGhost(r.node, r.rect);
    });
}
  function renderCombatPanel() {
    const overlay = document.getElementById('dungeon-overlay');
    if (!overlay || !D.combat) return;
    D._combatActive = true;
    // Combat should fully take over the screen: prevent background scrolling.
    document.body.classList.add('modal-lock');
    document.body.classList.add('combat-lock');

    // Trial of the Arcane — fixed 4-champion party combat has its own panel.
    if (D.combat.isTrial) {
      return renderTrialCombatPanel();
    }

    const def = getDungeonDef(D.activeDungeon);
    const monsters = D.combat.monsters;

    const currentMonster = monsters[D.combat.currentMonsterIndex] || {};
    const pStats = calcPlayerStats();
    const pHpPct = Math.round((pStats.hp / pStats.maxHp) * 100);
    const isLoadingMonsters = !!D.combat.serverAuth && !!D.combat.resolving && (!Array.isArray(monsters) || monsters.length === 0);
    
    const c = getChar();
    const playerClass = c?.class || 'warrior';
    const playerLevel = c?.level || 1;
    const playerSplash = `/images/class/${playerClass}-st.png`;

    // Build monster deck view — single card with <> navigation
    const aliveMonsters = monsters.filter(m => m.currentHp > 0);
    const aliveCount = aliveMonsters.length;
    let viewIdx = D.combat.currentMonsterIndex;
    if (!monsters[viewIdx] || monsters[viewIdx].currentHp <= 0) {
        viewIdx = aliveCount ? monsters.indexOf(aliveMonsters[0]) : 0;
    }
    const alivePos = aliveCount ? aliveMonsters.findIndex(m => monsters.indexOf(m) === viewIdx) + 1 : 0;
    const findAlive = (start, dir) => { for (let i = start + dir; i >= 0 && i < monsters.length; i += dir) { if (monsters[i].currentHp > 0) return i; } return -1; };
    const prevAlive = findAlive(viewIdx, -1);
    const nextAlive = findAlive(viewIdx, 1);

    const monsterDeckHtml = isLoadingMonsters
        ? `<div style="padding:10px;color:var(--dungeon-muted)">${_pt('Carregando inimigos...', 'Loading enemies...')}</div>`
        : aliveCount === 0
        ? `<div style="padding:10px;color:var(--dungeon-muted);text-align:center">${_pt('Todos os inimigos derrotados!', 'All enemies defeated!')}</div>`
        : (() => {
        const m = monsters[viewIdx];
        const hpPercent = Math.round(m.currentHp / m.maxHp * 100);
        const hasImg = !!m.image;
        const isSelected = viewIdx === D.combat.currentMonsterIndex;
        const targetBorder = isSelected ? '3px solid rgba(201,146,42,0.9)' : '2px solid rgba(201,146,42,0.35)';
        const hpBars = Number(m.hpBars || 1);
        const bossBarsHtml = hpBars > 1 ? (() => {
            const barSize = Math.ceil(m.maxHp / hpBars);
            const fullBars = Math.max(0, Math.floor((m.currentHp || 0) / barSize));
            let bars = '';
            for (let i = 0; i < hpBars; i++) {
                const pct = i < fullBars ? 100 : i === fullBars ? ((m.currentHp % barSize) / barSize) * 100 : 0;
                bars += '<div style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden;margin-bottom:2px"><div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#e74c3c,#c0392b);border-radius:2px;transition:width 0.2s"></div></div>';
            }
            return bars;
        })() : '';

        return `
            <div class="monster-side">
                <div class="fighter-card monster-combat-card ${isSelected ? 'current-target' : ''}" data-action="selectMonster" data-args='[${viewIdx}]' style="cursor:pointer">
                    <div class="fighter-avatar" style="display:flex;align-items:center;justify-content:center;overflow:hidden;border:${targetBorder}">
                        <button class="deck-arrow deck-arrow-left" data-action="deckNav" data-args='["prev"]' ${prevAlive === -1 ? 'disabled' : ''}>◀</button>
                        ${hasImg ? `<img src="${m.image}" alt="${m.name}" data-error-hide="true" data-error-next-display="flex" style="width:100%;height:100%;object-fit:cover">` : ''}
                        <span class="battle-fighter-fallback" style="${hasImg ? 'display:none' : ''}">${m.icon || '👾'}</span>
                        <button class="deck-arrow deck-arrow-right" data-action="deckNav" data-args='["next"]' ${nextAlive === -1 ? 'disabled' : ''}>▶</button>
                    </div>
                    <div class="fighter-name" data-action="toggleMonsterLore" data-args='[${viewIdx}]' title="${(m.lore || '').replace(/"/g,'&quot;')}">${m.name}</div>
                    <div class="fighter-class">⚔️ ${m.atk || 0} · 🛡️ ${m.def || 0}</div>
                    <div style="width:72px;margin:4px auto">
                        ${bossBarsHtml || `<div class="fighter-hp-bar-wrap" style="width:100%;height:5px;margin:0"><div class="fighter-hp-bar monster-hp" style="width:${hpPercent}%"></div></div>`}
                    </div>
                    <div class="fighter-stats">${m.currentHp}/${m.maxHp}</div>
                </div>
                <div class="deck-counter">${_pt('Monstro', 'Monster')} ${alivePos}/${aliveCount}</div>
            </div>`;
    })();

    const roundEntries = D.combat.roundLog.slice(-10).reverse().map(e =>
        `<div class="combat-log-entry ${e.actor}">${_ptCombat(e.text)}</div>`
    ).join('');

    const escapeReady = !!D.combat.escapeReady;
    const isBusy = !!D.combat.resolving;

    overlay.innerHTML = `
        <div class="dungeon-overlay-backdrop"></div>
        <div class="dungeon-overlay-card dungeon-combat-panel" style="--dtheme:${def.theme};--dglow:${def.themeGlow}">
            <div class="combat-header">
                ${D.combat.isCrawler ? `<div class="combat-boss-warning">🕷️ ${_pt('O DEVORADOR', 'THE CRAWLER')}</div>` : currentMonster.isBoss ? `<div class="combat-boss-warning">⚠️ ${_pt('BATALHA DE CHEFE', 'BOSS BATTLE')}</div>` : ''}
                <div class="combat-title">${D.combat.isCrawler ? _pt('Fuja ou seja dilacerado.', 'Run or be torn apart.') : `${_pt('Você contra', 'You vs')} ${monsters.length} ${monsters.length === 1 ? _pt('Monstro', 'Monster') : _pt('Monstros', 'Monsters')}`}</div>
            </div>

            <div class="combat-fighters">
                <div class="fighter-card">
                    <div class="fighter-avatar fighter-avatar-splash">
                        <img src="${playerSplash}" alt="${playerClass}" data-error-hide="true" data-error-next-display="flex" style="width:100%;height:100%;object-fit:cover">
                        <span class="battle-fighter-fallback" style="display:none">🧙</span>
                    </div>
                    <div class="fighter-name">${_pt('Você', 'You')}</div>
                    <div class="fighter-class">${capitalize(playerClass)} Lv.${playerLevel}</div>
                    <div class="fighter-hp-bar-wrap" style="width:130px;height:6px;margin:4px auto">
                        <div class="fighter-hp-bar player-hp" style="width:${pHpPct}%"></div>
                    </div>
                    <div class="fighter-stats">${pStats.hp} / ${pStats.maxHp} ${_pt('PV', 'HP')}</div>
                    <div style="margin-top:4px;width:130px">
                        <div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--dungeon-muted);margin-bottom:2px">
                            <span>🔷 Mana</span>
                            <span>${D.combat.manaPoints ?? 0}/${D.combat.manaCap ?? 100}</span>
                        </div>
                        <div style="width:100%;height:4px;background:rgba(255,255,255,0.1);border-radius:2px;overflow:hidden">
                            <div style="width:${Math.round(((D.combat.manaPoints ?? 0) / (D.combat.manaCap ?? 100)) * 100)}%;height:100%;background:linear-gradient(90deg,#4fc3f7,#29b6f6);border-radius:2px;transition:width 0.2s"></div>
                        </div>
                    </div>
                </div>

                <div class="fighter-vs">VS</div>

                ${monsterDeckHtml}
            </div>

            <div class="combat-log">${roundEntries || '<div class="combat-log-entry" style="color:var(--dungeon-muted)">'+_pt('A batalha começa...', 'Battle begins...')+'</div>'}</div>

             <div class="combat-actions">
                 ${escapeReady
                     ? `
                         <button class="dungeon-btn dungeon-btn-run" ${actionAttrs('dungeonEscapeConfirm')}>🚪 ${_pt('Sair', 'Get Out')}</button>
                         <button class="dungeon-btn dungeon-btn-fight" ${actionAttrs('dungeonEscapeCancel')}>⚔️ ${_pt('Continuar Lutando', 'Keep Fighting')}</button>
                       `
                     : `
                         <div style="display:flex;gap:4px;justify-content:center;flex-wrap:wrap">
                           <button class="dungeon-btn ${D.combat.attackType === 'regular' ? 'dungeon-btn-fight' : 'dungeon-btn-run'}" style="font-size:0.75rem;padding:6px 10px" ${isBusy ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('selectAttack', 'regular')}>⚔️ ${_pt('Atacar', 'Strike')}</button>
                           <button class="dungeon-btn ${D.combat.attackType === 'burst' ? 'dungeon-btn-fight' : 'dungeon-btn-run'}" style="font-size:0.75rem;padding:6px 10px" ${isBusy || (D.combat.manaPoints ?? 0) < 60 ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('selectAttack', 'burst')}>💥 ${_pt('Rajada (60)', 'Burst (60)')}</button>
                           <button class="dungeon-btn ${D.combat.attackType === 'ultimate' ? 'dungeon-btn-fight' : 'dungeon-btn-run'}" style="font-size:0.75rem;padding:6px 10px" ${isBusy || (D.combat.manaPoints ?? 0) < 100 ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('selectAttack', 'ultimate')}>⚡ ${_pt('Supremo (100)', 'Ultimate (100)')}</button>
                         </div>
                         <div style="display:flex;gap:4px;justify-content:center;margin-top:4px">
                           <button class="dungeon-btn dungeon-btn-fight" style="font-size:0.85rem;padding:8px 20px" ${isBusy ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('dungeonAttack')}>⚔️ ${_pt('Atacar', 'Attack')}</button>
                           <button class="dungeon-btn dungeon-btn-run" ${isBusy ? 'disabled aria-disabled="true"' : ''} ${actionAttrs('dungeonRunCombat')}>💨 ${_pt('Fugir (75%)', 'Flee (75%)')}</button>
                         </div>
                       `}
             </div>
         </div>
    `;
}

function saveTargetRectForAnim() {
    if (!D.combat) return;
    const overlay = document.getElementById('dungeon-overlay');
    if (!overlay) return;
    const monsterSide = overlay.querySelector('.monster-side');
    const card = monsterSide ? monsterSide.querySelector('.monster-combat-card') : null;
    if (card) {
        const r = card.getBoundingClientRect();
        D.combat._prevMonsterRect = { left: r.left, top: r.top, width: r.width, height: r.height };
        D.combat._prevMonsterName = D.combat.monsters?.[D.combat.currentMonsterIndex]?.name;
        D.combat._prevMonsterIdx = D.combat.currentMonsterIndex;
    }
}

function triggerCombatAnimations() {
    const overlay = document.getElementById('dungeon-overlay');
    if (!overlay || !D.combat) return;
    const roundLog = D.combat.roundLog;
    if (!roundLog || roundLog.length < 1) return;

    const lastAnimatedIdx = D.combat._lastAnimatedLogIdx ?? -1;
    const newEntries = lastAnimatedIdx < 0 ? [...roundLog] : roundLog.slice(lastAnimatedIdx + 1);
    if (newEntries.length === 0) return;
    D.combat._lastAnimatedLogIdx = roundLog.length - 1;

    // Trial arena: rows only (no preview cards) — animate the row cards themselves.
    if (D.combat.isTrial) {
        triggerTrialCombatAnimations(newEntries);
        return;
    }

    const playerCard = overlay.querySelector('.combat-fighters > .fighter-card:first-child');
    const monsterSide = overlay.querySelector('.monster-side');
    let currentMonsterCard = monsterSide ? monsterSide.querySelector('.monster-combat-card') : null;

    const prevRect = D.combat._prevMonsterRect;
    const prevName = D.combat._prevMonsterName;
    const prevIdx = D.combat._prevMonsterIdx;
    const monsterChanged = prevRect && prevIdx != null && (
        !currentMonsterCard || D.combat.currentMonsterIndex !== prevIdx
    );

    if (!playerCard || !monsterSide || (!currentMonsterCard && !monsterChanged)) return;

    const currentMonster = D.combat.monsters[D.combat.currentMonsterIndex];
    const attackType = D.combat._lastAttackType || 'regular';
    const isBigAttack = attackType === 'burst' || attackType === 'ultimate';

    const parseDmg = (text) => {
        const m = text.match(/(\d+)\s*damage/i) || text.match(/for\s+(\d+)/i) || text.match(/(\d+)!/);
        return m ? parseInt(m[1]) : null;
    };

    const spawnDmgFloat = (target, dmg, isHeal, styleType) => {
        if (dmg == null) return;
        const el = document.createElement('div');
        let cls = 'combat-damage-float';
        if (isHeal) cls += ' heal';
        if (styleType === 'ultimate') cls += ' ultimate';
        else if (styleType === 'burst') cls += ' burst';
        el.className = cls;
        el.textContent = isHeal ? `+${dmg}` : `-${dmg}`;
        if (monsterChanged && target === currentMonsterCard && prevRect) {
            el.style.left = (prevRect.left + prevRect.width / 2 - 30) + 'px';
            el.style.top = (prevRect.top + 20) + 'px';
        } else {
            const rect = target.getBoundingClientRect();
            el.style.left = (rect.left + rect.width / 2 - 30) + 'px';
            el.style.top = (rect.top + 20) + 'px';
        }
        el.style.position = 'fixed';
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 900);
    };

    const findMonsterByName = (text) => {
        if (!text) return null;
        const lower = text.toLowerCase();
        let best = null, bestIdx = Infinity, bestLen = 0;
        for (let i = 0; i < D.combat.monsters.length; i++) {
            const m = D.combat.monsters[i];
            if (m.currentHp <= 0) continue;
            const name = m.name.toLowerCase();
            const idx = lower.indexOf(name);
            if (idx !== -1 && (idx < bestIdx || (idx === bestIdx && name.length > bestLen))) {
                best = m;
                bestIdx = idx;
                bestLen = name.length;
            }
        }
        return best;
    };

    // Separate new entries by actor
    const monsterEntries = newEntries.filter(e => e.actor === 'monster');
    const playerEntries = newEntries.filter(e => e.actor === 'player');

    // Collect unique monster attackers (preserving order)
    const monsterAttacks = [];
    const seen = new Set();
    for (const entry of monsterEntries) {
        const mon = findMonsterByName(entry.text);
        if (mon && !seen.has(mon.name)) {
            seen.add(mon.name);
            monsterAttacks.push({ monster: mon, dmg: parseDmg(entry.text) });
        }
    }

    const lastPlayerEntry = playerEntries[playerEntries.length - 1];
    const playerDmg = lastPlayerEntry ? parseDmg(lastPlayerEntry.text) : null;

    const combatPanel = overlay.querySelector('.dungeon-combat-panel');

    // --- Animation sequence ---

    // 1) Player attack (t=0)
    if (playerEntries.length > 0) {
        if (attackType === 'ultimate') {
            playerCard.classList.add('combat-anim-player-ultimate');
            if (combatPanel) {
                setTimeout(() => combatPanel.classList.add('combat-anim-screen-shake'), 200);
                setTimeout(() => combatPanel.classList.remove('combat-anim-screen-shake'), 600);
            }
            setTimeout(() => playerCard.classList.remove('combat-anim-player-ultimate'), 1000);
        } else if (attackType === 'burst') {
            playerCard.classList.add('combat-anim-player-burst');
            setTimeout(() => playerCard.classList.remove('combat-anim-player-burst'), 800);
        } else {
            playerCard.classList.add('combat-anim-player-lunge');
            setTimeout(() => playerCard.classList.remove('combat-anim-player-lunge'), 600);
        }
    }

    // 2) Player damage on current monster (t=400ms)
    if (playerDmg != null) {
        setTimeout(() => {
            currentMonsterCard.classList.add('combat-anim-monster-hit');
            spawnDmgFloat(currentMonsterCard, playerDmg, false, attackType);
            setTimeout(() => currentMonsterCard.classList.remove('combat-anim-monster-hit'), 500);
        }, 400);
    }

    // 3) Monster counter-attacks (t=1100ms onwards, sequential)
    let baseDelay = 1100;
    for (let i = 0; i < monsterAttacks.length; i++) {
        const attack = monsterAttacks[i];
        const isCurrent = attack.monster === currentMonster;
        const d = baseDelay + i * 1100;

        if (isCurrent) {
            setTimeout(() => {
                currentMonsterCard.classList.add('combat-anim-monster-strike');
                spawnDmgFloat(playerCard, attack.dmg, false);
                setTimeout(() => {
                    currentMonsterCard.classList.remove('combat-anim-monster-strike');
                    currentMonsterCard.classList.add('combat-anim-monster-hit');
                    setTimeout(() => currentMonsterCard.classList.remove('combat-anim-monster-hit'), 400);
                }, 400);
            }, d);
        } else {
            // Delay DOM insertion until this monster's turn
            setTimeout(() => {
                const tempCard = buildTempMonsterCard(attack.monster);
                monsterSide.appendChild(tempCard);
                void tempCard.offsetHeight;
                tempCard.classList.add('combat-anim-monster-attack-from-deck');
                setTimeout(() => spawnDmgFloat(playerCard, attack.dmg, false), 350);

                tempCard.addEventListener('animationend', function onEnd(e) {
                    if (e.animationName === 'combat-monster-attack-from-deck') {
                        tempCard.removeEventListener('animationend', onEnd);
                        tempCard.classList.remove('combat-anim-monster-attack-from-deck');
                        tempCard.classList.add('combat-anim-monster-retreat');
                        tempCard.addEventListener('animationend', function onRetreat(e2) {
                            if (e2.animationName === 'combat-monster-retreat') {
                                tempCard.removeEventListener('animationend', onRetreat);
                                if (tempCard.parentNode) tempCard.remove();
                            }
                        });
                    }
                });
            }, d);
        }
    }

    // Player shake if first monster attacker is non-current (handles solo monster hits)
    if (monsterAttacks.length > 0 && monsterAttacks[0].monster !== currentMonster) {
        const shakeDelay = baseDelay + 350;
        setTimeout(() => {
            playerCard.classList.add('combat-anim-monster-hit');
            setTimeout(() => playerCard.classList.remove('combat-anim-monster-hit'), 400);
        }, shakeDelay);
    }
}

// ── Trial rows-only combat animations ──
// The active champion's row card LASHES OUT at the monster named in the log:
// lunge toward it, a projectile streak, an impact shake + damage float, then the
// elemental effect aura (burn/freeze). Monster retaliation shakes champion cards.
// Victims are ALWAYS resolved from the log text — never from currentMonsterIndex,
// which is auto-advanced to the next alive monster before animations run (that
// mismatch made attacks fly at the wrong, still-living card). A fighter that just
// died is temporarily swapped back to its pre-death look so the blow lands on the
// card that falls — the down state comes back when the shatter fires.
// Ultimate casts (full-bar abilities) get the big treatment: gold panel flash,
// fat projectile, huge impact aura — and a longer animation timeline.
function isTrialUltimateLog(text) {
    const t = text || '';
    return t.includes('Inferno') || t.includes('Blizzard') || t.includes('War Cry') || t.includes('Renewal');
}

function triggerTrialCombatAnimations(newEntries) {
    const overlay = document.getElementById('dungeon-overlay');
    if (!overlay || !D.combat) return;

    const panel = overlay.querySelector('.dungeon-trial-panel');
    // Lunge the champion who ACTUALLY performed each strike (the log names its
    // caster: "🔥 Pyra Fireball → …"). CRITICAL: cards must be resolved LAZILY
    // inside each animation callback — resolving them eagerly here captures
    // nodes that any re-render (or the just-died swap below) has since DETACHED,
    // making animations play on invisible elements with zero-size rects
    // (damage floats then land at the top-left corner of the screen).
    const champCardFor = (text) => {
        const party = D.combat.party || [];
        // Match the caster ONLY in the clause before the '→' arrow. Champion
        // "Frost" shares a fragment with monster "Frost Wyrmling" — scanning the
        // whole line made Vorn's/Aria's strikes lunge from FROST's card.
        const lower = String(text || '').split('→')[0].toLowerCase();
        const idx = party.findIndex(c => c && lower.includes(String(c.name || '').toLowerCase()));
        return idx >= 0 ? overlay.querySelector(`#trial-char-${idx}`) : null; // unknown caster → no lunge (never guess)
    };

    const parseDmg = (text) => {
        const m = text.match(/(\d+)\s*damage/i) || text.match(/for\s+(\d+)/i) || text.match(/(\d+)!/);
        return m ? parseInt(m[1]) : null;
    };

    const floatDmg = (card, dmg, opts) => {
        if (!card || dmg == null) return;
        const r = card.getBoundingClientRect();
        // A detached/hidden card has a zero rect — never float from (0,0).
        if (r.width === 0 && r.height === 0) return;
        const el = document.createElement('div');
        el.className = 'combat-damage-float' + (opts && opts.isHeal ? ' heal' : '') + (opts && opts.isEnergy ? ' energy' : '');
        el.textContent = opts && opts.isHeal ? `+${dmg}` : opts && opts.isEnergy ? `+${dmg} 🔷` : `-${dmg}`;
        el.style.cssText = `position:fixed;left:${r.left + r.width / 2 - 30}px;top:${r.top + 18}px;z-index:500000`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 900);
    };

    // Arc Bolt/Fireball/Inferno → fire · Frost Strike/Deep Freeze/Blizzard → frost ·
    // Smite/Shield Bash → holy (gold) · buffs/heals carry no projectile.
    const effectOf = (text) => {
        const t = text || '';
        if (t.includes('Fireball') || t.includes('Inferno') || t.includes('Arc Bolt')) return 'fire';
        if (t.includes('Frost Strike') || t.includes('Deep Freeze') || t.includes('Blizzard')) return 'frost';
        if (t.includes('Smite') || t.includes('Shield Bash')) return 'holy';
        return null;
    };

    // Ultimate casts wash the whole panel in a golden flash.
    const isUltimateCast = isTrialUltimateLog;

    // ── Restore just-died fighters to their pre-death look for the animations ──
    // The stash clones show the alive card; swap them in over the down-rendered
    // nodes and keep the down nodes to restore when the shatter fires.
    const stash = D.combat._pendingDeathShatters || {};
    const restorable = [];
    const swapInAliveClone = (selector, snapList, check) => {
        (snapList || []).forEach((snap, i) => {
            if (!check(i, snap)) return;
            const node = overlay.querySelector(`${selector}-${i}`);
            if (!node || !snap.node) return;
            const aliveClone = snap.node.cloneNode(true);
            aliveClone.id = node.id;
            node.replaceWith(aliveClone);
            restorable.push({ selector, idx: i, deadNode: node });
        });
    };
    swapInAliveClone('#trial-mon', stash.monsterRects, (i, s) => s.hp > 0 && Number(D.combat.monsters?.[i]?.currentHp ?? 0) <= 0);
    swapInAliveClone('#trial-char', stash.champRects, (i, s) => s.alive && !D.combat.party?.[i]?.alive);
    D.combat._restorableDeadNodes = restorable;

    const playerEntries = newEntries.filter(e => e.actor === 'player');
    // Only actual strike lines animate ("X strikes Y for N damage!") — "is down!"
    // and freeze notices have no attacker/victim pair to visualize.
    const monsterEntries = newEntries.filter(e => e.actor === 'monster' && (e.text || '').includes(' strikes '));

    // Resolve the victim monster of a champion strike from the LOG TEXT
    // ("... → <MonsterName> for N damage!"). Falls back to a name scan, then to
    // the selected target index.
    const resolveMonsterVictim = (text) => {
        const t = String(text || '');
        let name = '';
        const arrow = t.match(/→\s*(.+?)(?:\s+for\s+\d+|!|$)/);
        if (arrow) name = arrow[1].trim().toLowerCase();
        let idx = -1;
        if (name) {
            idx = (D.combat.monsters || []).findIndex(m => String(m.name || '').toLowerCase() === name);
            if (idx < 0) idx = (D.combat.monsters || []).findIndex(m => String(m.name || '').toLowerCase().includes(name) || name.includes(String(m.name || '').toLowerCase()));
        }
        if (idx < 0) {
            const lower = t.toLowerCase();
            idx = (D.combat.monsters || []).findIndex(m => lower.includes(String(m.name || '').toLowerCase()));
        }
        if (idx < 0) idx = Math.max(0, Number(D.combat.currentMonsterIndex ?? 0));
        return overlay.querySelector(`#trial-mon-${idx}`);
    };

    // 1) Champion attacks: lunge up toward the victim's row, projectile, impact.
    //    Only targeted strikes animate — heals/buffs (no '→' arrow) are skipped.
    playerEntries.filter(e => e.text && e.text.includes('→')).forEach((entry, k) => {
        const dmg = parseDmg(entry.text);
        const effect = effectOf(entry.text);
        const isUlt = isUltimateCast(entry.text);
        const delay = 120 + k * 700;
        if (isUlt) setTimeout(() => spawnTrialUltimateFlash(), delay);
        setTimeout(() => {
            // Resolve cards NOW — the panel may have re-rendered since scheduling.
            const casterCard = champCardFor(entry.text);
            const victimCard = resolveMonsterVictim(entry.text);
            if (casterCard) {
                casterCard.classList.add('combat-anim-player-lunge');
                setTimeout(() => casterCard.classList.remove('combat-anim-player-lunge'), 600);
            }
            if (casterCard && victimCard) {
                const cr = casterCard.getBoundingClientRect();
                const tr = victimCard.getBoundingClientRect();
                const from = { x: cr.left + cr.width / 2, y: cr.top + cr.height * 0.25 };
                const to = { x: tr.left + tr.width / 2, y: tr.top + tr.height * 0.75 };
                if (effect) spawnTrialProjectile(from, to, effect, isUlt);
            }
            setTimeout(() => {
                if (victimCard) {
                    victimCard.classList.add('combat-anim-monster-hit');
                    setTimeout(() => victimCard.classList.remove('combat-anim-monster-hit'), 500);
                    if (effect) spawnTrialEffectAura(victimCard, effect, isUlt);
                }
                floatDmg(victimCard, dmg);
                // Normal attacks AND bursts GENERATE energy — show the gain rising
                // off the caster. Pre-arrow clause only (see champCardFor: the
                // 'Frost' fragment trap). Only the ultimate SPENDS — no generator
                // ever flashes a spent-cost float (a big part of the energy confusion).
                const casterClause = String(entry.text || '').split('→')[0].toLowerCase();
                const casterIdx = (D.combat.party || []).findIndex(c => casterClause.includes(String(c?.name || '').toLowerCase()));
                const casterChamp = casterIdx >= 0 ? D.combat.party[casterIdx] : null;
                const castAbil = casterChamp
                    ? (casterChamp.abilities || []).find(a => casterClause.includes(String(a.name || '').toLowerCase()))
                    : null;
                const gain = castAbil && (castAbil.type === 'attack' || castAbil.type === 'burst') ? Number(casterChamp.energyGain || 0) : 0;
                if (gain > 0 && !isUlt) floatDmg(casterCard, gain, { isEnergy: true });
            }, 380);
        }, delay);
    });

    // 2) Monster retaliation: each attacker's card strikes down, champion card shakes.
    const findCharIdxByName = (text) => {
        const party = D.combat.party || [];
        // The VICTIM stands after the 'strikes' keyword — before it sits the
        // attacker's name ("Frost Wyrmling strikes Frost…"), whose 'Frost'
        // fragment would otherwise shadow the actual champion victim.
        const lower = (String(text || '').toLowerCase().split(/\bstrikes\b/)[1] || '');
        for (let i = 0; i < party.length; i++) {
            if (party[i] && lower.includes(String(party[i].name || '').toLowerCase())) return i;
        }
        return Number(D.combat.trialActiveChar ?? 0);
    };
    monsterEntries.forEach((entry, k) => {
        const dmg = parseDmg(entry.text);
        const lower = String(entry.text || '').toLowerCase();
        const monIdx = (D.combat.monsters || []).findIndex(m => lower.includes(String(m.name || '').toLowerCase()));
        const victimIdx = findCharIdxByName(entry.text);
        // Tick-only strikes (no player attack in this batch) land fast instead of
        // waiting out the player-attack timeline slot.
        const delay = (playerEntries.length ? 700 : 150) + playerEntries.length * 700 + k * 650;
        setTimeout(() => {
            // Resolve attacker + victim NOW (lazy) — eager lookups go stale after
            // re-renders and the animations vanish off-screen.
            const attacker = monIdx >= 0 ? overlay.querySelector(`#trial-mon-${monIdx}`) : null;
            const victim = overlay.querySelector(`#trial-char-${victimIdx}`);
            if (attacker) {
                attacker.classList.add('combat-anim-monster-strike');
                setTimeout(() => attacker.classList.remove('combat-anim-monster-strike'), 450);
            }
            setTimeout(() => {
                if (victim) {
                    victim.classList.add('combat-anim-monster-hit');
                    setTimeout(() => victim.classList.remove('combat-anim-monster-hit'), 450);
                }
                floatDmg(victim, dmg);
            }, 300);
        }, delay);
    });
}

// Projectile streak from a champion card to its target (fire/frost variants).
function spawnTrialProjectile(from, to, effect, isUltimate) {
    const el = document.createElement('div');
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const ang = Math.atan2(dy, dx);
    el.className = `trial-projectile trial-projectile-${effect}${isUltimate ? ' trial-projectile-ult' : ''}`;
    el.style.cssText = `position:fixed;left:${from.x}px;top:${from.y}px;width:${dist}px;z-index:499999;transform-origin:0 50%;transform:rotate(${ang}rad)`;
    document.body.appendChild(el);
    const ult = isUltimate ? 'scaleX(1.45) scaleY(2.2)' : 'scaleX(1.02)';
    el.animate([
        { opacity: 0, transform: `rotate(${ang}rad) scaleX(0.05)` },
        { opacity: 1, transform: `rotate(${ang}rad) scaleX(0.6)`, offset: 0.3 },
        { opacity: 1, transform: `rotate(${ang}rad) scaleX(1)`, offset: 0.85 },
        { opacity: 0, transform: `rotate(${ang}rad) ${ult}` },
    ], { duration: isUltimate ? 460 : 380, easing: 'ease-out' }).onfinish = () => { try { el.remove(); } catch (e) { /* noop */ } };
}

// Elemental impact aura on the hit card (burn = fire ring, freeze = frost ring).
function spawnTrialEffectAura(card, effect, isUltimate) {
    if (!card) return;
    const r = card.getBoundingClientRect();
    const el = document.createElement('div');
    el.className = `trial-effect-aura trial-effect-${effect}${isUltimate ? ' trial-effect-ult' : ''}`;
    el.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;${isUltimate ? 'width:220px;height:220px;' : ''}z-index:499998;pointer-events:none`;
    document.body.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch (e) { /* noop */ } }, isUltimate ? 950 : 700);
}

// Full-panel golden wash when a champion unleashes an ultimate.
function spawnTrialUltimateFlash() {
    const panel = document.querySelector('.dungeon-trial-panel');
    if (!panel) return;
    const el = document.createElement('div');
    el.className = 'trial-ult-flash';
    panel.appendChild(el);
    setTimeout(() => { try { el.remove(); } catch (e) { /* noop */ } }, 1100);
}

function inlineStyles(src) {
    const clone = src.cloneNode(true);
    const walk = (orig, cpy) => {
        const cs = getComputedStyle(orig);
        for (let i = 0; i < cs.length; i++) {
            const prop = cs[i];
            cpy.style[prop] = cs.getPropertyValue(prop);
        }
        for (let i = 0; i < orig.children.length; i++) {
            if (cpy.children[i]) walk(orig.children[i], cpy.children[i]);
        }
    };
    walk(src, clone);
    return clone;
}

function captureElementToCanvas(el) {
    const rect = el.getBoundingClientRect();
    const w = Math.ceil(rect.width);
    const h = Math.ceil(rect.height);
    if (w <= 0 || h <= 0) return null;
    const styled = inlineStyles(el);
    // Inline same-origin <img> as data URLs — external resources are blocked inside
    // an SVG-as-image foreignObject, so we embed them so the portrait shows in the shatter.
    const imgJobs = Array.from(styled.querySelectorAll('img')).map(img => {
        const src = img.getAttribute('src');
        if (!src || src.startsWith('data:') || /^https?:\/\//i.test(src)) return Promise.resolve();
        return fetch(src, { credentials: 'same-origin' })
            .then(r => (r.ok ? r.blob() : Promise.reject(new Error('img fetch failed'))))
            .then(blob => new Promise(resolve => {
                const fr = new FileReader();
                fr.onload = () => { img.setAttribute('src', fr.result); resolve(); };
                fr.onerror = () => resolve();
                fr.readAsDataURL(blob);
            }))
            .catch(() => {});
    });
    return Promise.all(imgJobs).then(() => {
        // Serialize the computed-style clone as well-formed XHTML (never manual string
        // escaping — malformed markup was leaking raw `<div ...>` text into the shatter).
        const xml = new XMLSerializer().serializeToString(styled);
        const svgText = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
            <foreignObject width="100%" height="100%">
                <div xmlns="http://www.w3.org/1999/xhtml" style="width:${w}px;height:${h}px;overflow:hidden">${xml}</div>
            </foreignObject>
        </svg>`;
        return new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.onerror = () => resolve(null);
            img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgText);
        });
    });
}

function pixelDissolveCard(card, quick) {
    const rect = card.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const useWAA = typeof Element !== 'undefined' && !!Element.prototype.animate;

    // Intro: shake slowly → bulge → blow up (flash + cracks) → shatter shards.
    const introMs = quick ? 1 : 700 + Math.random() * 300;
    const popAt = Math.floor(introMs * 0.80);

    // Capture at rest BEFORE the shake starts, so shard tile sizes stay true.
    const capPromise = captureElementToCanvas(card);

    if (quick) {
        card.style.opacity = '0';
    } else if (useWAA) {
        const anim = card.animate(buildShatterIntroFrames(), {
            duration: introMs,
            easing: 'ease-in-out',
            fill: 'forwards'
        });
        anim.onfinish = () => { card.style.opacity = '0'; };
    } else {
        card.style.transition = 'transform 0.2s ease-in, filter 0.2s ease-in';
        setTimeout(() => { card.style.transform = 'scale(1.08)'; card.style.filter = 'brightness(1.2)'; }, 0);
        setTimeout(() => {
            card.style.transform = 'scale(1.13)';
            card.style.filter = 'brightness(1.5)';
        }, Math.floor(introMs * 0.5));
        setTimeout(() => {
            card.style.transform = 'scale(1.32)';
            card.style.filter = 'brightness(2.2)';
            card.style.opacity = '0';
        }, popAt);
    }

    capPromise.then(canvas => {
        const fire = () => {
            if (!quick) spawnBlowout(cx, cy);
            if (canvas) spawnShatterShards(canvas, rect, cx, cy);
            else spawnFallbackParticles(cx, cy, 20 + Math.floor(Math.random() * 16));
        };
        if (quick) fire();
        else setTimeout(fire, popAt);
    });
}

function buildShatterIntroFrames() {
    // Slow shake grows and becomes VIOLENT right before the blow-out: escalating
    // translate + rotational jitter, then a hard pop at ~0.80.
    const pts = [
        { o: 0.00, shake: 0.0, scale: 1.000, br: 1.00 },
        { o: 0.10, shake: 2.5, scale: 1.000, br: 1.00 },
        { o: 0.20, shake: 4.5, scale: 1.005, br: 1.03 },
        { o: 0.32, shake: 7.5, scale: 1.015, br: 1.06 },
        { o: 0.44, shake: 11,  scale: 1.030, br: 1.10 },
        { o: 0.56, shake: 16,  scale: 1.050, br: 1.15 },
        { o: 0.68, shake: 23,  scale: 1.080, br: 1.22 },
        { o: 0.78, shake: 30,  scale: 1.120, br: 1.35 },
        { o: 0.82, shake: 0,   scale: 1.340, br: 2.20 },
        { o: 1.00, shake: 0,   scale: 1.220, br: 1.40 }
    ];
    return pts.map(pt => {
        const dx = (Math.random() - 0.5) * 2 * pt.shake;
        const dy = (Math.random() - 0.5) * 2 * pt.shake;
        const rot = (Math.random() - 0.5) * pt.shake * 0.16;
        return {
            transform: `translate(${dx}px,${dy}px) rotate(${rot}deg) scale(${pt.scale})`,
            filter: `brightness(${pt.br})`,
            offset: pt.o
        };
    });
}

function spawnBlowout(cx, cy) {
    // Center flash that pops out and fades — sells the "blow up" moment.
    const flash = document.createElement('div');
    flash.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;width:150px;height:150px;margin-left:-75px;margin-top:-75px;border-radius:50%;pointer-events:none;z-index:499999;background:radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,210,110,0.55) 45%, transparent 72%);transform:scale(0.1);opacity:0.95`;
    document.body.appendChild(flash);
    flash.style.transition = 'transform 0.22s ease-out, opacity 0.3s ease-out';
    requestAnimationFrame(() => { flash.style.transform = 'scale(1.35)'; flash.style.opacity = '0'; });
    setTimeout(() => flash.remove(), 400);

    // Radial crack streaks shooting outward from the pop point.
    const cracks = 12 + Math.floor(Math.random() * 7);
    for (let i = 0; i < cracks; i++) {
        const a = Math.random() * 2 * Math.PI;
        const len = 22 + Math.random() * 60;
        const dist = 12 + Math.random() * 50;
        const s = document.createElement('div');
        s.style.cssText = `position:fixed;left:${cx - len / 2}px;top:${cy - 1}px;width:${len}px;height:2px;pointer-events:none;z-index:500000;background:linear-gradient(90deg, rgba(255,225,140,0.95), rgba(255,120,50,0));opacity:1;transform-origin:center;transform:rotate(${a}rad) translateX(0)`;
        document.body.appendChild(s);
        requestAnimationFrame(() => {
            s.style.transition = 'transform 0.3s ease-out, opacity 0.3s ease-out';
            s.style.transform = `rotate(${a}rad) translateX(${dist}px)`;
            s.style.opacity = '0';
        });
        setTimeout(() => s.remove(), 360);
    }
}

function spawnShatterShards(canvas, rect, cx, cy) {
    const dataUrl = canvas.toDataURL();

    // Random style CHAIN — each shatter morphs dynamically through 2-3 styles mid-flight,
    // so pieces change direction and spin while they're still flying.
    const STYLE_POOL = ['grid', 'rows', 'cols', 'directional'];
    const chain = [];
    const phaseCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < phaseCount; i++) chain.push(STYLE_POOL[Math.floor(Math.random() * STYLE_POOL.length)]);
    const globals = chain.map(() => ({ biasAngle: Math.random() * 2 * Math.PI, distScale: 0.8 + Math.random() * 0.8 }));
    const phaseAngle = (style, g, px, py) => {
        if (style === 'grid') return Math.atan2(py, px) + (Math.random() - 0.5) * 0.7;
        if (style === 'rows') return (Math.random() < 0.5 ? -1 : 1) * Math.PI / 2;
        if (style === 'cols') return Math.random() < 0.5 ? Math.PI : 0;
        return g.biasAngle + (Math.random() - 0.5) * Math.PI * 1.4;
    };
    const durPer = 260 + Math.random() * 180;
    const useWAA = typeof Element !== 'undefined' && !!Element.prototype.animate;

    // Cell density follows the FIRST style so the initial break shape matches the opening burst.
    const gridCols = chain[0] === 'rows' ? 1 : 5 + Math.floor(Math.random() * 9);
    const gridRows = chain[0] === 'cols' ? 1 : 5 + Math.floor(Math.random() * 11);
    const cellW = canvas.width / gridCols;
    const cellH = canvas.height / gridRows;

    for (let r = 0; r < gridRows; r++) {
        for (let c = 0; c < gridCols; c++) {
            const px = (c + 0.5) / gridCols - 0.5;
            const py = (r + 0.5) / gridRows - 0.5;

            const p = document.createElement('div');
            p.style.position = 'fixed';
            p.style.width = cellW + 'px';
            p.style.height = cellH + 'px';
            p.style.left = (rect.left + c * cellW) + 'px';
            p.style.top = (rect.top + r * cellH) + 'px';
            p.style.backgroundImage = `url(${dataUrl})`;
            p.style.backgroundSize = `${canvas.width}px ${canvas.height}px`;
            p.style.backgroundPosition = `-${c * cellW}px -${r * cellH}px`;
            p.style.pointerEvents = 'none';
            p.style.zIndex = '500000';
            p.style.borderRadius = Math.random() < 0.3 ? '50%' : Math.random() < 0.5 ? '2px' : '1px';
            document.body.appendChild(p);

            if (useWAA) {
                // Multi-phase keyframes: each piece follows one style's vector, then swerves
                // into the next style's vector mid-animation, with rotation flipping too.
                const frames = [{
                    transform: 'translate(0px,0px) rotate(0deg)',
                    opacity: '1',
                    offset: 0
                }];
                for (let i = 0; i < chain.length; i++) {
                    const g = globals[i];
                    const a = phaseAngle(chain[i], g, px, py);
                    const dist = (20 + Math.random() * 140) * g.distScale * (0.6 + Math.random() * 1.2);
                    const tx = Math.cos(a) * dist;
                    const ty = Math.sin(a) * dist - 10 - Math.random() * 30;
                    const rot = (Math.random() - 0.5) * 1080;
                    frames.push({
                        transform: `translate(${tx}px,${ty}px) rotate(${rot}deg)`,
                        opacity: i === chain.length - 1 ? '0' : '0.9',
                        offset: (i + 1) / chain.length
                    });
                }
                const total = chain.length * durPer;
                const anim = p.animate(frames, {
                    duration: total,
                    delay: Math.random() * 120,
                    easing: 'cubic-bezier(0.22,0.61,0.36,1)',
                    fill: 'forwards'
                });
                anim.onfinish = () => { if (p.parentNode) p.remove(); };
                setTimeout(() => { if (p.parentNode) p.remove(); }, total + 500);
            } else {
                // Fallback (no WAAPI): single-phase fly-out using the first style.
                const a = phaseAngle(chain[0], globals[0], px, py);
                const dist = (20 + Math.random() * 140) * globals[0].distScale * (0.6 + Math.random() * 1.2);
                const tx = Math.cos(a) * dist;
                const ty = Math.sin(a) * dist - 10 - Math.random() * 30;
                const rot = (Math.random() - 0.5) * 1080;
                p.style.transition = `transform ${durPer * chain.length}ms cubic-bezier(0.22,0.61,0.36,1), opacity ${durPer * chain.length}ms ease`;
                p.style.transform = 'translate(0,0) rotate(0deg)';
                requestAnimationFrame(() => {
                    p.style.transform = `translate(${tx}px,${ty}px) rotate(${rot}deg)`;
                    p.style.opacity = '0';
                });
                setTimeout(() => p.remove(), chain.length * durPer + 150);
            }
        }
    }
    // trailing embers
    spawnFallbackParticles(cx, cy, 10 + Math.floor(Math.random() * 10));
}

function spawnFallbackParticles(x, y, count) {
    count = count || 18;
    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'combat-dissolve-particle';
        const angle = Math.random() * 2 * Math.PI;
        const dist = 40 + Math.random() * 100;
        const px = Math.cos(angle) * dist;
        const py = Math.sin(angle) * dist;
        p.style.left = x + 'px';
        p.style.top = y + 'px';
        p.style.setProperty('--px', px + 'px');
        p.style.setProperty('--py', py + 'px');
        p.style.background = Math.random() < 0.3
            ? 'radial-gradient(circle, #ff8c00, #ff4500)'
            : Math.random() < 0.5
                ? 'radial-gradient(circle, #ffd700, #ff8c00)'
                : 'radial-gradient(circle, #fff4e0, #ffd700)';
        const size = 3 + Math.random() * 5;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        document.body.appendChild(p);
        setTimeout(() => p.remove(), 1000);
    }
}

function buildTempMonsterCard(monster) {
    const hasImg = !!monster.image;
    const iconEl = hasImg
        ? `<img src="${monster.image}" alt="${monster.name}" style="width:100%;height:100%;object-fit:cover">`
        : `<span class="battle-fighter-fallback">${monster.icon || '👾'}</span>`;
    const el = document.createElement('div');
    el.className = 'combat-temp-monster-card';
    el.innerHTML = `
        <div class="fighter-card monster-combat-card" style="border:2px solid rgba(201,146,42,0.35)">
            <div class="fighter-avatar" style="display:flex;align-items:center;justify-content:center;overflow:hidden;width:80px;height:80px">
                ${iconEl}
            </div>
            <div class="fighter-name">${monster.name}</div>
            <div class="fighter-class">⚔️ ${monster.atk || 0} · 🛡️ ${monster.def || 0}</div>
            <div style="width:72px;margin:4px auto">
                <div class="fighter-hp-bar-wrap" style="width:100%;height:5px;margin:0">
                    <div class="fighter-hp-bar monster-hp" style="width:${Math.round(monster.currentHp / monster.maxHp * 100)}%"></div>
                </div>
            </div>
            <div class="fighter-stats">${monster.currentHp}/${monster.maxHp}</div>
        </div>`;
    return el;
}

function renderLog() {
    const roomLog = document.querySelector('.dungeon-hud-room-log');
    if (roomLog) {
      roomLog.innerHTML = `<span>${D.dungeonLog[0]?.msg || ''}</span>`;
      roomLog.style.display = D.dungeonLog[0]?.msg ? 'block' : 'none';
    }
  }

  function showBossVictoryModal(boss, loot, nextFloor) {
  let modal = document.getElementById('dungeon-boss-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'dungeon-boss-modal';
    modal.className = 'modal-overlay';
    document.body.appendChild(modal);
  }
  const nf = Number(nextFloor) || D.floor + 1;
  modal.classList.remove('hidden');
  modal.innerHTML = `
    <div class="modal-box dungeon-victory-box">
      <div class="victory-icon">${boss.icon}</div>
      <div class="victory-title">${_pt('CHEFE DERROTADO!', 'BOSS DEFEATED!')}</div>
      <div class="victory-boss-name">${boss.name}</div>
      <div class="victory-loot">
        <div class="loot-row">💰 <strong>${loot.gold.toLocaleString()}</strong> ${_pt('Ouro', 'Gold')}</div>
        <div class="loot-row">💎 <strong>${loot.gems}</strong> ${_pt('Gemas', 'Gems')}</div>
        <div class="loot-row premium-reward">
          ✨ <strong>${loot.premium.emoji} ${loot.premium.name}</strong> (${loot.premium.days} ${_pt('dias', 'days')})
          <div class="premium-desc">${loot.premium.desc}</div>
        </div>
      </div>
      <div class="victory-next">${_pt(`⬇️ As escadas para o Andar ${nf} se abriram.`, `⬇️ Stairs to Floor ${nf} have opened.`)}</div>
      <button class="btn-primary" style="margin-top:16px;width:100%" ${actionAttrs('descendDungeonFloor')}>${_pt(`⬇️ Descer ao Andar ${nf}`, `⬇️ Descend to Floor ${nf}`)}</button>
      <button class="btn-secondary" style="margin-top:8px;width:100%" ${actionAttrs('closeDungeonVictory')}>${_pt('Explorar Antes', 'Explore First')}</button>
    </div>
  `;
}

  async function descendFloor() {
    if (!D.activeDungeon) return;
    if (D._descending) return;
    if (!D.bossDefeated) {
      log(`${_pt('⚠️ As escadas ainda estão seladas.', '⚠️ The stairs are still sealed.')}`, 'log-warning');
      return;
    }
    D._descending = true;
    try {
      // Server re-validates (floor's boss defeated + still on that floor) before advancing.
      const res = await apiFetch('POST', '/game/dungeon/descend', { floor: D.floor });
      if (!res || !res.success) throw new Error(res?.error || _pt('Falha ao descer.', 'Failed to descend.'));
      const m = document.getElementById('dungeon-boss-modal');
      if (m) m.classList.add('hidden');
      D.floor = res.newFloor;
      if (typeof res.highestFloor === 'number') D.highestFloor = res.highestFloor;
      D.bossDefeated = false;
      delete D.savedProgress['tower'];
      D.rooms = normalizeMiniBossRooms(generateFloor(D.activeDungeon, D.floor), D.floor);
      D.playerPos = D.rooms.findIndex(r => r.isStart);
      D.exploredRooms = new Set([D.playerPos]);
      D.crawler = spawnCrawlerForCurrentFloor();
      D.floorRunId = createFloorRunId();
      D.combat = null;
      D._combatPrefetch = null;
      saveState();
      saveProgressToDB();
      refreshCharacter();
      log(`${_pt(`⬇️ Descendo para o Andar ${D.floor}...`, `⬇️ Descending to Floor ${D.floor}...`)}`, 'log-enter');
      renderDungeonView();
    } catch (e) {
      console.error('Descend failed:', e);
      const msg = (e && (e.message || e)) || _pt('Falha ao descer.', 'Failed to descend.');
      if (typeof openGameDialog === 'function') {
        await openGameDialog({ title: _pt('Descida Bloqueada', 'Descent Blocked'), message: String(msg), confirmLabel: 'OK', showCancel: false });
      } else {
        alert(msg);
      }
    } finally {
      D._descending = false;
    }
  }

function toggleMonsterLore(idx) {
  const cards = document.querySelectorAll('.monster-combat-card');
  const card = cards[idx];
  if (!card) return;
  const m = D.combat?.monsters?.[idx];
  if (!m || !m.lore) return;
  const existing = card.querySelector('.monster-lore-popup');
  if (existing) { existing.remove(); return; }
  const popup = document.createElement('div');
  popup.className = 'monster-lore-popup';
  popup.textContent = m.lore;
  card.appendChild(popup);
  popup.addEventListener('click', e => { e.stopPropagation(); popup.remove(); });
}
function deckNav(dir) {
  if (!D.combat || !D.combat.monsters) return;
  const monsters = D.combat.monsters;
  const current = D.combat.currentMonsterIndex;
  const step = dir === 'prev' ? -1 : 1;
  for (let i = current + step; i >= 0 && i < monsters.length; i += step) {
    if (monsters[i].currentHp > 0) {
      D.combat.currentMonsterIndex = i;
      renderCombatPanel();
      return;
    }
  }
}

function selectMonster(idx) {
  if (!D.combat || !D.combat.monsters) return;
  if (D.combat.monsters[idx] && D.combat.monsters[idx].currentHp > 0) {
    D.combat.currentMonsterIndex = idx;
    renderCombatPanel();
  }
}

function selectAttack(type) {
  if (!D.combat) return;
  D.combat.attackType = type;
  renderCombatPanel();
}

// Skill check mini-game — dual presentation:
//   ring (Trial defend/closing): a needle sweeps a circular gauge around a gold
//   bullseye; score fades linearly from 1.0 at dead-center to 0 at the rim.
//   bar (dungeon burst/ultimate): a marker sweeps a zoned bar (1.0/0.75/0.5).
// Motion is SMOOTH (no jittery pauses/reversals): the marker always accelerates while
// crossing the center of the bar and slows near the edges — so landing dead-center is a
// real timing challenge. Dungeon burst/ultimate keep zoned multipliers (1.0/0.75/0.5);
// the Trial's event checks (defend/closing) use a LINEAR multiplier: 1.0 at the very
// center, fading gradually to 0 at the edges.
function showSkillCheck(attackType, callback) {
  if (document.getElementById('skill-check-overlay')) return; // never double-spawn
  const cfg = SKILL_CHECK_CFG[attackType] || SKILL_CHECK_CFG.burst;
  const isLinear = !!cfg.linear;
  const mode = isLinear ? 'ring' : 'bar';
  const accent = cfg.color;
  // Create overlay — ABOVE the combat overlay (z 400000), below shatter ghosts.
  const overlay = document.createElement('div');
  overlay.id = 'skill-check-overlay';
  overlay.style.zIndex = '400500';

  const title = `${_pt(cfg.titlePT, cfg.titleEN)} <span class="skc-tap">· ${_pt('toque para parar!', 'tap to stop!')}</span>`;

  overlay.innerHTML = mode === 'ring' ? `
<div class="skc-panel skc-ring-mode" style="--skc-accent:${accent}">
  <div class="skc-title">${title}</div>
  <div class="skc-ring-wrap">
    <svg class="skc-ring" viewBox="0 0 120 120" aria-hidden="true">
      <circle class="skc-ring-track" cx="60" cy="60" r="54"></circle>
      <circle class="skc-ring-ticks" cx="60" cy="60" r="47"></circle>
      <circle class="skc-ring-glow" cx="60" cy="60" r="54"></circle>
      <g class="skc-needle"><line x1="60" y1="60" x2="60" y2="14"></line></g>
      <circle class="skc-bullseye" cx="60" cy="60" r="7"></circle>
      <circle class="skc-bullseye-core" cx="60" cy="60" r="3"></circle>
    </svg>
    <div class="skc-ring-readout"><span id="skc-result">50%</span></div>
  </div>
  <div class="skc-hint">${attackType === 'defend'
    ? _pt('Acerte o centro — dano e pontos ×1.5 nesta batalha', 'Center it — damage & points ×1.5 this battle')
    : _pt('Multiplica os pontos de toda a batalha', 'Multiplies this entire battle\'s points')}</div>
</div>` : `
<div class="skc-panel skc-bar-mode" style="--skc-accent:${accent}">
  <div class="skc-title">${title}</div>
  <div class="skc-bar-track">
    <div class="skc-zone skc-zone-miss" style="flex:0 0 25%"></div>
    <div class="skc-zone skc-zone-good" style="flex:0 0 15%"></div>
    <div class="skc-zone skc-zone-perfect" style="flex:0 0 20%"></div>
    <div class="skc-zone skc-zone-good" style="flex:0 0 15%"></div>
    <div class="skc-zone skc-zone-miss" style="flex:0 0 25%"></div>
    <div class="skc-centerline"></div>
    <div class="skc-bar-marker" id="skc-marker"></div>
  </div>
  <div class="skc-bar-labels">
    <span style="flex:0 0 25%">${_pt('ERROU', 'MISS')}</span><span style="flex:0 0 15%">${_pt('BOM', 'GOOD')}</span><span style="flex:0 0 20%">${_pt('PERFEITO', 'PERFECT')}</span><span style="flex:0 0 15%">${_pt('BOM', 'GOOD')}</span><span style="flex:0 0 25%">${_pt('ERROU', 'MISS')}</span>
  </div>
  <div class="skc-result" id="skc-result">${_pt('Ciclo 1/10', 'Cycle 1/10')}</div>
</div>`;
  document.body.appendChild(overlay);

  const panel = overlay.querySelector('.skc-panel');
  const resultEl = overlay.querySelector('#skc-result');
  const marker = overlay.querySelector('#skc-marker');
  const needle = overlay.querySelector('.skc-needle');

  let pos = 50; // 0-100, percentage position on the bar / around the ring
  let dir = 1; // 1 = right, -1 = left
  let bounces = 0; // count edge hits (0 or 100)
  const maxBounces = cfg.maxBounces || 20; // 10 full left-right cycles by default
  let animId = null;
  let done = false;
  // Anti-stray-tap gate: the overlay resolves on ANY tap, but at the end of a
  // battle a player still tapping their attack button can land a click on the
  // just-spawned Final Blow check — resolving it "before it even shows up".
  // Clicks within the first resolveGraceMs after spawn are swallowed so the
  // check can only be resolved by a deliberate second tap on a VISIBLE check.
  const spawnMs = Date.now();
  const resolveGraceMs = 450;
  function tapResolve() {
    if (done) return;
    if (Date.now() - spawnMs < resolveGraceMs) return; // ignore the spawn-window tap
    resolve();
  }

  // Instantaneous sweep speed at position p: slow at the edges, ramping HARD up toward
  // the center (the marker visibly whips through the middle, "evading" your tap). A tiny
  // wobble keeps it organic without masking the acceleration or causing jitter.
  function speedAt(p, base, boost) {
    const center = 1 - Math.abs(p - 50) / 50; // 0 at edges, 1 at dead-center
    let s = base * (1 + (boost - 1) * center);
    s *= 0.94 + Math.random() * 0.12;
    return s;
  }

  function getZoneMult(p) {
    if (p >= 40 && p <= 60) return 1.0; // perfect
    if ((p >= 25 && p < 40) || (p > 60 && p <= 75)) return 0.75; // good
    return 0.5; // miss
  }

  function getLinearMult(p) {
    // Vertical distance from dead-center: exact center = 1.0, each unit of distance
    // subtracts the same amount, so it falls off smoothly all the way to 0 at the edges.
    return Math.max(0, 1 - Math.abs(p - 50) / 50);
  }

  // Keep the readout/needle in sync with the sweep (both modes).
  function paint() {
    if (mode === 'ring') {
      if (needle) needle.setAttribute('transform', `rotate(${((pos - 50) / 100) * 360} 60 60)`);
      const live = getLinearMult(pos);
      resultEl.textContent = Math.round(live * 100) + '%';
      resultEl.style.color = live >= 0.9 ? '#ffd700' : live >= 0.6 ? accent : 'rgba(255,255,255,0.65)';
    } else if (marker) {
      marker.style.left = pos + '%';
    }
  }

  function resolve() {
    if (done) return;
    done = true;
    if (animId) cancelAnimationFrame(animId);
    const mult = isLinear ? getLinearMult(pos) : getZoneMult(pos);
    const tier = mult >= 0.9 ? 'perfect' : mult >= 0.6 ? 'good' : 'miss';
    panel.classList.add('skc-res-' + tier);
    if (mode === 'ring' && needle) {
      needle.classList.add('skc-needle-' + tier);
    }
    if (isLinear) {
      resultEl.textContent = _pt('Pontuação: ', 'Score: ') + Math.round(mult * 100) + '%';
    } else {
      resultEl.textContent = mult >= 0.9 ? _pt('✨ Perfeito!', '✨ Perfect!') : (mult >= 0.75 ? _pt('👍 Bom!', '👍 Good!') : _pt('💔 Errou!', '💔 Miss!'));
    }
    setTimeout(() => {
      overlay.remove();
      callback(mult);
    }, 620);
  }

  function animate() {
    if (done) return;
    pos += dir * speedAt(pos, cfg.base, cfg.boost);

    // Bounce off the edges.
    if (pos >= 100) { pos = 100; dir = -1; bounces++; if (!isLinear) updateCycle(); }
    else if (pos <= 0) { pos = 0; dir = 1; bounces++; if (!isLinear) updateCycle(); }

    paint();
    if (bounces >= maxBounces) { resolve(); return; }

    animId = requestAnimationFrame(animate);
  }

  function updateCycle() {
    resultEl.textContent = _pt('Ciclo ', 'Cycle ') + Math.ceil(bounces / 2) + '/' + (maxBounces / 2);
    resultEl.style.color = 'rgba(255,255,255,0.5)';
  }

  overlay.addEventListener('click', tapResolve);
  overlay.addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); resolve(); } });
  paint();
  animId = requestAnimationFrame(animate);
}
const SKILL_CHECK_CFG = {
  burst:    { titlePT: '💥 Rajada',       titleEN: '💥 Burst',          color: '#3498db', base: 1.1, boost: 3.0, maxBounces: 20, linear: false },
  ultimate: { titlePT: '⚡ Supremo',       titleEN: '⚡ Ultimate',       color: '#e74c3c', base: 2.4, boost: 3.2, maxBounces: 20, linear: false },
  defend:   { titlePT: '🌟 Foco de Batalha', titleEN: '🌟 Battle Focus', color: '#9b7dff', base: 1.3, boost: 4.0, maxBounces: 10, linear: true },
  closing:  { titlePT: '🌟 Golpe Final',   titleEN: '🌟 Final Blow',     color: '#ffd700', base: 1.5, boost: 4.5, maxBounces: 12, linear: true },
};

function roomDeckNav(dir) {
  if (!D._roomMonsterOffset) D._roomMonsterOffset = {};
  const room = D.rooms?.[D.playerPos];
  if (!room || !Array.isArray(room.monsters)) return;
  const aliveMonsters = room.monsters.filter(m => !m.lastKilled || elapsed(m.lastKilled, MONSTER_RESPAWN_H));
  if (aliveMonsters.length < 2) return;
  const perPage = window.innerWidth <= 768 ? 1 : 3;
  const currentOffset = D._roomMonsterOffset[D.playerPos] ?? 0;
  let newOffset = currentOffset + dir * perPage;
  if (newOffset < 0) newOffset = 0;
  const maxOffset = Math.max(0, aliveMonsters.length - perPage);
  if (newOffset > maxOffset) newOffset = maxOffset;
  if (newOffset === currentOffset) return;
  D._roomMonsterOffset[D.playerPos] = newOffset;
  const infoEl = document.querySelector('.dungeon-hud-room-info');
  if (infoEl) infoEl.innerHTML = renderRoomInfo(room);
}

  function updateTravelBtn(idx, disabled) {
    const btns = document.querySelectorAll('.dungeon-conn-btn');
    btns.forEach(b => b.disabled = disabled);
  }

function dungeonExit() {
    // Trial of the Arcane:
    // - Pre-BEGIN (lobby): leave without starting the timer/run; do NOT record an attempt.
    // - Post-BEGIN: leaving records a defeat because the run is in progress.
    if (D.eventMode) {
        if (D._eventRunCompleted) {
            resetEventState();
            return;
        }
        if (!D._eventStarted) {
            resetEventState();
            return;
        }
        const msg = _pt('Sair agora registrará esta tentativa como derrota. Tem certeza?', 'Exiting now will record this attempt as a defeat. Are you sure?');
        const confirmExit = () => finishEventRun(false);
        if (typeof openGameDialog === 'function') {
            openGameDialog({ title: _pt('Sair do Trial', 'Exit Trial'), message: msg, confirmLabel: _pt('Sair', 'Exit'), showCancel: true })
                .then(confirmed => { if (confirmed) confirmExit(); })
                .catch(() => {});
        } else {
            if (confirm(msg)) confirmExit();
        }
        return;
    }
    if (D.activeDungeon) {
        D.savedProgress[D.activeDungeon] = {
            floor: D.floor, 
            pos: D.playerPos,
            rooms: D.rooms, 
            explored: [...D.exploredRooms],
            crawler: D.crawler,
            floorRunId: D.floorRunId,
            bossDefeated: !!D.bossDefeated,
        };
    }

    // We are leaving the dungeon: clear local state first so /dungeon/progress can also clear any
    // server-side combat session (which otherwise can keep HP potions locked indefinitely).
    const prevFloor = D.floor;
    const prevRoomIdx = D.playerPos;
    D.activeDungeon = null;
    global.__dungeonActive = false;
    D.combat = null;
    D._combatPrefetch = null;
    D._combatActive = false;
    document.body.classList.remove('modal-lock');
    document.body.classList.remove('combat-lock');

    // Best-effort: release any room claim + end any active combat session for this room.
    // (Older clients/versions may not have done this, leaving stale `dungeon_combat_sessions.status='active'`.)
    apiFetch('POST', '/game/dungeon/room-exit', { floor: prevFloor, roomIndex: prevRoomIdx }).catch(() => {});

    // Save to database (activeDungeon is now null, so server clears active combat sessions).
    saveProgressToDB();

    // Release lock
    stopLockRefresh();

    saveState();
    renderDungeonList();
}

function closeDungeonVictory() {
    const m = document.getElementById('dungeon-boss-modal');
    if (m) m.classList.add('hidden');
    renderDungeonView();
  }

  function renderGuild() {
  const overlay = document.getElementById('dungeon-overlay');
  const area = document.getElementById('dungeon-main-area');
  if (!overlay && !area) return;

  D.dungeonGold = D.dungeonGold || 0;

  apiFetch('GET', '/game/dungeon/guild').then(guildData => {
    const reputation = guildData.guildReputation || 0;
    const dungeonGold = guildData.dungeonGold || 0;
    const bounty = guildData.bounty || null;
    const elemInv = guildData.elemInventory || {};

    D.dungeonGold = dungeonGold;
    D._elemInv = elemInv;
    D._guildBounty = bounty;

    // Calculate current rank
    let currentRank = GUILD_RANKS[0];
    for (let i = GUILD_RANKS.length - 1; i >= 0; i--) {
      if (reputation >= GUILD_RANKS[i].reputationNeeded) {
        currentRank = GUILD_RANKS[i];
        break;
      }
    }

    const nextRank = GUILD_RANKS[Math.min(currentRank.rank + 1, GUILD_RANKS.length - 1)];
    const repNeeded = nextRank.rank > currentRank.rank ? nextRank.reputationNeeded - reputation : 0;
    const repProgress = nextRank.rank > currentRank.rank ? (reputation / nextRank.reputationNeeded) * 100 : 100;
    const bountyProgress = bounty ? Math.min(100, Math.round(((bounty.progress || 0) / Math.max(1, bounty.target_count || 1)) * 100)) : 0;

    const guildHtml = `
      <div class="guild-container">
        <div class="guild-header">
          <span class="guild-icon">🏛️</span>
          <div>
            <div class="guild-title">${_pt('Guilda do Aventureiro', "Adventurer's Guild")}</div>
            <div class="guild-subtitle">${_pt('Troque os despojos da masmorra por recompensas reais', 'Exchange dungeon spoils for real rewards')}</div>
          </div>
<button class="dungeon-btn dungeon-btn-exit" ${actionAttrs('closeGuild')}>← ${_pt('Voltar à Masmorra', 'Back to Dungeon')}</button>
        </div>

        <div class="guild-stats">
          <div class="guild-stat-card">
            <div class="guild-stat-icon">💰</div>
            <div class="guild-stat-info">
              <div class="guild-stat-label">${_pt('Ouro da Masmorra', 'Dungeon Gold')}</div>
              <div class="guild-stat-value">${dungeonGold.toLocaleString()}</div>
            </div>
          </div>
          <div class="guild-stat-card">
            <div class="guild-stat-icon">⭐</div>
            <div class="guild-stat-info">
              <div class="guild-stat-label">${_pt('Reputação', 'Reputation')}</div>
              <div class="guild-stat-value">${reputation}</div>
              <div class="guild-stat-rank">${_guildRankName(currentRank.name)}</div>
            </div>
          </div>
        </div>

        <div class="guild-reputation-bar">
          <div class="rep-bar-label">${_pt(`Progresso para ${_guildRankName(nextRank.name)}`, `Progress to ${nextRank.name}`)}</div>
          <div class="rep-bar-track">
            <div class="rep-bar-fill" style="width: ${repProgress}%"></div>
          </div>
          <div class="rep-bar-text">${repNeeded > 0 ? _pt(`${repNeeded} reputação necessária`, repNeeded + ' reputation needed') : _pt('RANK MÁXIMO', 'MAX RANK')}</div>
        </div>

        ${bounty ? `
        <div class="guild-exchanges" style="margin-top:18px">
          <div class="guild-section-title">🎯 ${_pt('Caça Ativa', 'Active Bounty')}</div>
          <div class="exchange-card exchange-available">
            <div class="exchange-icon">🎯</div>
            <div class="exchange-info">
              <div class="exchange-name">${_pt(`Caçar ${bounty.target_name}`, `Hunt ${bounty.target_name}`)}</div>
              <div class="exchange-desc">${_pt(`Derrote ${bounty.target_count}x ${bounty.target_name} em salas da masmorra e volte aqui para receber seu pagamento.`, `Defeat ${bounty.target_count}x ${bounty.target_name} in dungeon rooms and report back here for your payout.`)}</div>
              <div class="exchange-cost">
                <span class="cost-item">${_pt('Progresso:', 'Progress:')} ${bounty.progress || 0}/${bounty.target_count || 0}</span>
              </div>
              <div class="rep-bar-track" style="margin:10px 0 8px">
                <div class="rep-bar-fill" style="width: ${bountyProgress}%"></div>
              </div>
              <div class="exchange-reward">
                <span class="reward-gold">💰 ${(bounty.reward_gold || 0).toLocaleString()} ${_pt('Ouro', 'Gold')}</span>
                <span class="reward-rep">⭐ +${bounty.reward_reputation || 0} ${_pt('Reputação', 'Reputation')}</span>
              </div>
              <button class="exchange-btn" ${actionAttrs('claimGuildBounty')} ${(bounty.progress || 0) < (bounty.target_count || 0) ? 'disabled' : ''}>
                ${(bounty.progress || 0) < (bounty.target_count || 0) ? _pt('Caça em Progresso', 'Bounty In Progress') : _pt('Reivindicar Caça', 'Claim Bounty')}
              </button>
              <button class="exchange-btn exchange-btn-skip" ${actionAttrs('skipGuildBounty')} ${formatBountySkipDisabled(bounty) ? 'disabled' : ''}>
                ${formatBountySkipLabel(bounty)}
              </button>

            </div>
          </div>
        </div>` : ''}

        <div class="guild-exchanges">
          <div class="guild-section-title">📜 ${_pt('Trocas Disponíveis', 'Available Exchanges')}</div>
          <div class="exchanges-grid">
            ${GUILD_EXCHANGES.map(exchange => {
              let canExchange = true;
              let missingReason = '';
              let isLocked = false;

              // Reputation check
              if (exchange.minRep > 0 && reputation < exchange.minRep) {
                isLocked = true;
                canExchange = false;
                missingReason = _pt(`🔒 Desbloqueia em ${exchange.minRep} de reputação`, '🔒 Unlocks at ' + exchange.minRep + ' reputation');
              }

              // Dungeon gold check
              if (canExchange && exchange.cost.dungeonGold && dungeonGold < exchange.cost.dungeonGold) {
                canExchange = false;
                missingReason = _pt(`Necessário ${exchange.cost.dungeonGold} de ouro da masmorra`, 'Need ' + exchange.cost.dungeonGold + ' dungeon gold');
              }

              // Tier material check (swap exchanges)
              let tierCostKey = null, tierCostQty = 0;
              for (const [key, qty] of Object.entries(exchange.cost)) {
                if (key.startsWith('tier_')) {
                  tierCostKey = key.replace('tier_', '');
                  tierCostQty = qty;
                  break;
                }
              }
              let totalTierMats = 0;
              if (tierCostKey && canExchange) {
                const tierItems = ELEM_TIER_ITEMS ? ELEM_TIER_ITEMS[tierCostKey] : [];
                for (const id of (tierItems || [])) {
                  totalTierMats += elemInv[id] || 0;
                }
                if (totalTierMats < tierCostQty) {
                  canExchange = false;
                  missingReason = _pt(`Necessário ${tierCostQty} materiais ${tierCostKey} (tem ${totalTierMats})`, 'Need ' + tierCostQty + ' ' + tierCostKey + ' materials (have ' + totalTierMats + ')');
                }
              }

              const discount = currentRank.discount / 100;
              const discountedGold = exchange.reward.gold ? Math.floor(exchange.reward.gold * (1 + discount)) : exchange.reward.gold;

              // Build cost display
              let costHtml = '';
              if (exchange.cost.dungeonGold) {
                costHtml += '<span class="cost-item">💰 ' + exchange.cost.dungeonGold + ' ' + _pt('Ouro da Masmorra', 'Dungeon Gold') + '</span>';
              }
              if (tierCostKey) {
                costHtml += '<span class="cost-item">📦 ' + tierCostQty + 'x ' + capitalize(tierCostKey) + '</span>';
              }

              // Build reward display
              let rewardHtml = '';
              if (discountedGold) {
                rewardHtml += '<span class="reward-gold">💰 ' + discountedGold.toLocaleString() + ' ' + _pt('Ouro', 'Gold') + '</span>';
              }
              if (exchange.reward.reputation) {
                rewardHtml += '<span class="reward-rep">⭐ +' + exchange.reward.reputation + ' ' + _pt('Reputação', 'Reputation') + '</span>';
              }
              if (exchange.reward.elemTier) {
                const ti = ELEM_TIER_INFO[exchange.reward.elemTier];
                rewardHtml += '<span class="reward-item">📦 1x ' + (ti ? _pt({
                  Common: 'Comum', Uncommon: 'Incomum', Rare: 'Raro', Epic: 'Épico', Legendary: 'Lendário'
                }[ti.name] || ti.name, ti.name) : capitalize(exchange.reward.elemTier)) + ' ' + _pt('Elemental', 'Element') + '</span>';
              }
              if (exchange.reward.item) {
                rewardHtml += '<span class="reward-item">📦 ' + exchange.reward.item + '</span>';
              }
              if (currentRank.discount > 0 && discountedGold > 0) {
                rewardHtml += '<span class="reward-discount">✨ +' + currentRank.discount + '% ' + _pt('Bônus de Ouro', 'Gold Bonus') + ' (' + _guildRankName(currentRank.name) + ')</span>';
              }

              return '<div class="exchange-card ' + (isLocked ? 'exchange-unavailable' : canExchange ? 'exchange-available' : 'exchange-unavailable') + '">' +
                '<div class="exchange-icon">' + exchange.icon + '</div>' +
                '<div class="exchange-info">' +
                  '<div class="exchange-name">' + exchange.name + '</div>' +
                  '<div class="exchange-desc">' + exchange.desc + '</div>' +
                  '<div class="exchange-cost">' + costHtml + '</div>' +
                  '<div class="exchange-reward">' + rewardHtml + '</div>' +
                  '<button class="exchange-btn" ' + actionAttrs('exchangeAtGuild', exchange.id) + ' ' + ((!canExchange || D._guildExchangeInFlight) ? 'disabled' : '') + '>' +
                    (isLocked ? _pt('🔒 Bloqueado', '🔒 Locked') : canExchange ? _pt('Trocar', 'Exchange') : missingReason || _pt('Requisitos Ausentes', 'Missing Requirements')) +
                  '</button>' +
                '</div>' +
              '</div>';
            }).join('')}
          </div>
        </div>

<button class="dungeon-btn" ${actionAttrs('closeGuild')} style="width:100%;margin-top:20px">${_pt('Continuar Explorando', 'Continue Exploring')}</button>
      </div>
    `;

    // Fix: Ensure the overlay is properly positioned relative to body
    if (overlay) {
      overlay.innerHTML = `
<div class="dungeon-overlay-backdrop" ${actionAttrs('closeGuild')}></div>
        <div class="dungeon-overlay-card guild-overlay-card">
          ${guildHtml}
        </div>
      `;

      // Force scroll to top when opening
      setTimeout(() => {
        const container = overlay.querySelector('.guild-container');
        if (container) {
          container.scrollTop = 0;
        }
      }, 50);
    } else if (area) {
      area.innerHTML = guildHtml;
    }
  }).catch(e => console.error('Failed to load guild data:', e));
}

function openGuild() {
  const overlay = document.getElementById('dungeon-overlay');
  if (overlay) overlay.classList.add('guild-active');
  document.body.classList.add('modal-lock');
  renderGuild();
}

function closeGuild() {
  const overlay = document.getElementById('dungeon-overlay');
  if (overlay) {
    overlay.innerHTML = '';
    overlay.classList.remove('guild-active');
  }
  document.body.classList.remove('modal-lock');
  renderDungeonView();
}

function exchangeAtGuild(exchangeId) {
  if (D._guildExchangeInFlight) return;
  D._guildExchangeInFlight = true;
  D._pendingExchangeModal = false;
  apiFetch('POST', '/game/dungeon/guild/exchange', { exchangeId })
    .then(response => {
      if (response.success) {
        const msg = response.goldGained ? _pt(`Ouro da masmorra trocado → ${response.goldGained} ouro${response.rankBonus > 0 ? ` (+${response.rankBonus}% bônus de rank)` : ''}`, `Exchanged dungeon gold → ${response.goldGained} gold${response.rankBonus > 0 ? ` (${response.rankBonus}% rank bonus)` : ''}`) : response.message;
        log(msg, 'log-success');
        const goldEl = document.getElementById('dungeon-gold-count');
        if (goldEl) goldEl.textContent = response.dungeonGold;
        refreshCharacter();
        if (response.grantedItem) {
          D._pendingExchangeModal = true;
          showExchangeRewardModal(response.grantedItem);
        }
      }
    })
    .catch(e => console.error('Exchange failed:', e))
    .finally(() => {
      D._guildExchangeInFlight = false;
      if (!D._pendingExchangeModal) renderGuild();
    });
}

function showExchangeRewardModal(item) {
  const overlay = document.getElementById('dungeon-overlay');
  if (!overlay) return;
  // Remove any old reward modal
  const old = overlay.querySelector('.exchange-reward-modal');
  if (old) old.remove();
  const modal = document.createElement('div');
  modal.className = 'exchange-reward-modal';
  modal.innerHTML = `
<div style="text-align:center;padding:20px 24px">
  <div style="font-size:2.5rem;margin-bottom:8px">${item.emoji || '📦'}</div>
  <div style="font-size:1.1rem;margin-bottom:6px;color:#fff">${_pt('Você obteve:', 'You obtained:')}</div>
  <div style="font-size:1.3rem;font-weight:bold;color:#ffcc00;margin-bottom:4px">${item.name}</div>
  <div style="font-size:0.85rem;opacity:0.6;text-transform:capitalize;color:#aaa">${_pt({
    common: 'Comum', uncommon: 'Incomum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário'
  }[item.rarity] || item.rarity, item.rarity)} ${_pt('Material Elemental', 'Elemental Material')}</div>
<button class="dungeon-btn" style="margin-top:16px;width:100%;cursor:pointer" data-action="closeExchangeRewardModal">OK</button>
</div>`;
  modal.setAttribute('data-action', 'closeExchangeRewardModal');
  overlay.appendChild(modal);
  overlay.style.display = 'flex';
}

function bountySkipRemainingSecs(bounty) {
  const until = Number(bounty?.skip_available_at || 0);
  const now = Math.floor(Date.now() / 1000);
  return until > now ? (until - now) : 0;
}

function formatBountySkipDisabled(bounty) {
  return bountySkipRemainingSecs(bounty) > 0;
}

function formatBountySkipLabel(bounty) {
  const rem = bountySkipRemainingSecs(bounty);
  if (rem > 0) {
    const hours = Math.floor(rem / 3600);
    const mins = Math.floor((rem % 3600) / 60);
    if (hours > 0) return _pt(`Pular (${hours}h ${mins}m)`, `Skip (${hours}h ${mins}m)`);
    return _pt(`Pular (${mins}m)`, `Skip (${mins}m)`);
  }
  return _pt('Pular Caça', 'Skip Bounty');
}

function removeBountySkipModal() {
  const el = document.getElementById('bounty-skip-modal');
  if (el) el.remove();
}

function skipGuildBounty() {
  if (D._guildBountySkipInFlight) return;
  const bounty = D._guildBounty || {};
  const targetName = bounty.target_name || '';
  const targetCount = bounty.target_count || 0;
  const progress = bounty.progress || 0;

  const div = document.createElement('div');
  div.id = 'bounty-skip-modal';
  div.innerHTML = `
    <div class="spirit-overlay"></div>
    <div class="spirit-dialog">
      <div class="spirit-dialog-title">🎯 ${_pt('Pular Caça?', 'Skip Bounty?')}</div>
      <div class="spirit-dialog-body">
        ${targetName ? `<div style="margin-bottom:8px">${_pt('Caça atual:', 'Current bounty:')} <strong>${escHtml(targetName)}</strong> (${progress}/${targetCount})</div>` : ''}
        ${_pt('Abandonar esta caça e sortear um novo contrato?', 'Abandon this bounty and roll a new contract?')}
        <div style="margin-top:8px;opacity:0.8">⏳ ${_pt('A nova caça só poderá ser pulada novamente após 24h.', 'The new bounty can only be skipped again after 24h.')}</div>
      </div>
      <div class="spirit-dialog-actions">
        <button class="btn-secondary">${_pt('Cancelar', 'Cancel')}</button>
        <button class="btn-primary">🎯 ${_pt('Pular Caça', 'Skip Bounty')}</button>
      </div>
    </div>
  `;
  function cancel() { removeBountySkipModal(); }
  function confirmSkip() {
    removeBountySkipModal();
    if (D._guildBountySkipInFlight) return;
    D._guildBountySkipInFlight = true;
    apiFetch('POST', '/game/dungeon/guild/bounty/skip', {})
      .then(response => {
        if (response.success) {
          log(response.message || _pt('Caça pulada. Um novo contrato aguarda.', 'Bounty skipped. A new contract awaits.'), 'log-success');
          renderGuild();
          refreshCharacter();
        }
      })
      .catch(e => {
        log(e?.message || _pt('Falha ao pular a caça. Tente novamente.', 'Failed to skip bounty. Try again.'), 'log-danger');
        renderGuild();
      })
      .finally(() => { D._guildBountySkipInFlight = false; });
  }
  div.querySelector('.spirit-overlay').addEventListener('click', cancel);
  div.querySelector('.btn-secondary').addEventListener('click', cancel);
  div.querySelector('.btn-primary').addEventListener('click', confirmSkip);
  document.body.appendChild(div);
}

function claimGuildBounty() {
  apiFetch('POST', '/game/dungeon/guild/bounty/claim', {})
    .then(response => {
      if (response.success) {
        log(response.message, 'log-success');
        renderGuild();
        refreshCharacter();
      }
    })
    .catch(e => console.error('Bounty claim failed:', e));
}

  async function fightMiniBoss(roomIdx) {
    const room = D.rooms[roomIdx];
    if (!room || !room.isMiniBoss) return;

    // Mini-bosses must use the same server-authoritative combat flow as normal rooms.
    // The old local-only mini-boss combat path could desync HP (including snapping to full HP after the fight).
    startCombat(roomIdx);
}

  // ── CSS Loading ──────────────────────────────────────────
  function loadCSS() {
    if (document.getElementById('dungeon-css')) return;
    const link = document.createElement('link');
    link.id = 'dungeon-css';
    link.rel = 'stylesheet';
    link.href = 'css/dungeon.css?v=2026-05-08-hud-layer-fix';
    document.head.appendChild(link);
  }

  // ── Global API (called from HTML onclick) ──────────────────
  global.dungeonFightMiniBoss = fightMiniBoss;
  global.debugDungeon = function() {
    console.log('=== DUNGEON DEBUG ===');
    console.log('Floor:', D.floor);
    console.log('Total rooms:', D.rooms.length);
    console.log('Rooms with monsters:', D.rooms.filter(r => r.monsters && r.monsters.length > 0).length);
    console.log('Monsters available from pool:', getMonstersForFloor(D.floor).length);
    
    // Check first 3 non-start, non-boss rooms
    const testRooms = D.rooms.filter(r => !r.isStart && !r.isBoss).slice(0, 3);
    testRooms.forEach((r, i) => {
        console.log(`Room ${i}: type=${r.type}, monsterCount=${r.monsters?.length || 0}, monsters=`, r.monsters);
    });
    
    // Check if the monster spawn chance is working
    console.log('Sample dungeonDef monsters:', getDungeonDef('tower').monsters.length);
};
global.debugDungeonDetails = function() {
    console.log('=== DETAILED DEBUG ===');
    
    // Check first 10 rooms
    D.rooms.slice(0, 10).forEach((r, i) => {
        console.log(`Room ${i}: isStart=${r.isStart}, isBoss=${r.isBoss}, type=${r.type}, connections=${r.connections?.length}, hasMonsters=${!!r.monsters}`);
    });
    
    // Also check if dungeonDef is truthy in the loop
    const dungeonDef = getDungeonDef('tower');
    console.log('dungeonDef exists:', !!dungeonDef);
    console.log('dungeonDef.monsters length:', dungeonDef.monsters.length);
    
    // Test chance function
    let trueCount = 0;
    for(let i = 0; i < 100; i++) {
        if (chance(0.7)) trueCount++;
    }
    console.log('chance(0.7) test:', trueCount, 'out of 100');
};
  // ── Elemental Spirit System ──────────────────────────────────
  let _cachedElemental = null;

  async function fetchElemental() {
    try {
      const r = await apiFetch('GET', '/game/elemental');
      _cachedElemental = r?.elemental || null;
      return _cachedElemental;
    } catch { return _cachedElemental; }
  }

  function renderElementalPanel() {
    const char = getChar();
    if (!char) return '';
    const hasElem = !!char.elemental;
    const floor = D.floor || 1;

    if (!hasElem && floor >= 5) {
      return `<div class="dungeon-elem-panel">
        <div class="dungeon-elem-header">🐉 ${_pt('Espírito Elemental', 'Elemental Spirit')}</div>
        <div class="dungeon-elem-body">
          <p style="font-size:0.7rem;color:var(--text-dim);margin:0 0 6px">${_pt('Um altar antigo brilha fracamente. Você sente uma conexão com uma besta espiritual neste andar.', 'An ancient altar glows faintly. You sense a connection to a spirit beast on this floor.')}</p>
          <button class="dungeon-btn dungeon-btn-hud" ${actionAttrs('dungeonDiscoverElemental')}>✨ ${_pt('Descobrir Elemental', 'Discover Elemental')}</button>
        </div>
      </div>`;
    }

    if (!hasElem) return '';

    const e = _cachedElemental;
    if (!e) return '';

    const hpPct = e.hpMax > 0 ? Math.round((e.hp_current / e.hpMax) * 100) : 0;
    const xpPct = e.xpNext > 0 ? Math.round(((e.xp || 0) / e.xpNext) * 100) : 0;
    const elemEmoji = e.element === 'pyro' ? '🔥' : e.element === 'water' ? '💧' : e.element === 'wind' ? '🌪️' : '⚡';

    return `<div class="dungeon-elem-panel">
      <div class="dungeon-elem-header">🐉 ${e.name} ${elemEmoji}</div>
      <div class="dungeon-elem-body">
        <div style="font-size:0.7rem;color:var(--text-dim)">Lv.${e.level} ${e.element}</div>
        <div style="font-size:0.65rem;margin:4px 0"><span class="stat-hp">❤️</span> ${e.hp_current}/${e.hpMax}</div>
        <div class="dungeon-elem-bar"><div class="dungeon-elem-bar-fill hp-fill" style="width:${hpPct}%"></div></div>
        <div style="font-size:0.65rem;margin:4px 0">XP ${e.xp || 0}/${e.xpNext}</div>
        <div class="dungeon-elem-bar"><div class="dungeon-elem-bar-fill xp-fill" style="width:${xpPct}%"></div></div>
        <button class="dungeon-btn dungeon-btn-hud" style="margin-top:6px" ${actionAttrs('dungeonShowFeedModal')}>🍽️ ${_pt('Alimentar com Materiais', 'Feed Materials')}</button>
      </div>
    </div>`;
  }

  let _spiritResolve = null;

  function removeSpiritModal() {
    const el = document.getElementById('spirit-discover-modal');
    if (el) el.remove();
  }

  global.dungeonDiscoverElemental = async function() {
    const spiritTypes = ['Phoenix', 'Wyrm', 'Wolf', 'Drake', 'Serpent', 'Fox', 'Tiger', 'Griffin', 'Kitsune', 'Leviathan'];
    const spiritType = spiritTypes[Math.floor(Math.random() * spiritTypes.length)];

    const name = await new Promise(resolve => {
      _spiritResolve = resolve;
      const div = document.createElement('div');
      div.id = 'spirit-discover-modal';
      div.innerHTML = `
        <div class="spirit-overlay"></div>
        <div class="spirit-dialog">
          <div class="spirit-dialog-title">🐉 ${_pt('Besta Espiritual Encontrada!', 'Spirit Beast Found!')}</div>
          <div class="spirit-dialog-body">
            ${_pt(`No interior da torre, você descobre um místico espírito ${spiritType}. Sua essência pulsa com poder ancestral, esperando se vincular com um campeão digno. O espírito lutará ao seu lado em batalha.`, `Deep within the tower, you discover a mystical ${spiritType} spirit. Its essence pulses with ancient power, waiting to bond with a worthy champion. The spirit will fight alongside you in battle.`)}
          </div>
          <label class="spirit-dialog-label">${_pt('Nomeie sua Besta Espiritual:', 'Name your Spirit Beast:')}</label>
          <input id="spirit-name-input" class="spirit-dialog-input" type="text" maxlength="24" placeholder="${_pt('Digite um nome...', 'Enter a name...')}" value="${spiritType}">
          <div class="spirit-dialog-actions">
            <button class="btn-secondary">${_pt('Pular', 'Skip')}</button>
            <button class="btn-primary">✨ ${_pt('Vincular', 'Bond')}</button>
          </div>
        </div>
      `;
      function cancel() { removeSpiritModal(); _spiritResolve(null); }
      function confirm() {
        const input = document.getElementById('spirit-name-input');
        const n = input ? input.value.trim().slice(0, 24) : 'Elemental';
        removeSpiritModal();
        _spiritResolve(n);
      }
      div.querySelector('.spirit-overlay').addEventListener('click', cancel);
      div.querySelector('.btn-secondary').addEventListener('click', cancel);
      div.querySelector('.btn-primary').addEventListener('click', confirm);
      document.body.appendChild(div);
      setTimeout(() => document.getElementById('spirit-name-input')?.focus(), 100);
    });

    if (!name) { log(_pt('❌ Descoberta cancelada', '❌ Discovery cancelled'), 'log-info'); return; }

    // Show loading
    const loadingEl = document.createElement('div');
    loadingEl.id = 'spirit-discover-modal';
    loadingEl.innerHTML = `<div class="spirit-overlay"></div><div class="spirit-dialog" style="text-align:center;padding:30px">✨ ${_pt('Vinculando espírito...', 'Bonding spirit...')}</div>`;
    document.body.appendChild(loadingEl);

    try {
      const r = await apiFetch('POST', '/game/elemental/discover', { name });
      loadingEl.remove();
      if (r.elemental) {
        _cachedElemental = r.elemental;
        const charR = await apiFetch('GET', '/game/character');
        if (charR) Object.assign(getChar(), charR);
        renderDungeonView();
        log(`🐉 ${r.message || _pt('Besta espiritual vinculada!', 'Spirit beast bonded!')}`, 'log-arrive');
      } else {
        log(_pt('⚠️ ') + (r.error || _pt('Falha ao vincular', 'Failed to bond')), 'log-danger');
      }
    } catch (e) {
      loadingEl.remove();
      console.error('[Discover] Error:', e);
      log(_pt('⚠️ Erro ao vincular espírito: ', '⚠️ Error bonding spirit: ') + e.message, 'log-danger');
    }
  };

  global.dungeonShowFeedModal = async function() {
    const elem = _cachedElemental;
    if (!elem) return;

    // Fetch inventory for raw materials
    const invR = await apiFetch('GET', '/game/inventory');
    const mats = (invR?.items || []).filter(i => {
      const d = typeof i.item_data === 'string' ? JSON.parse(i.item_data) : i.item_data;
      return (d.type === 'raw_mat' || d.category === 'material') && d.qty > 0;
    });

    if (mats.length === 0) {
      log(_pt('📭 Sem materiais para alimentar. Limpe salas da masmorra para obter drops!', '📭 No materials to feed. Clear dungeon rooms for drops!'), 'log-info');
      return;
    }

    const overlay = document.getElementById('dungeon-overlay');
    if (!overlay) return;

    const xpPct = elem.xpNext > 0 ? Math.round(((elem.xp || 0) / elem.xpNext) * 100) : 0;
    let html = `<div class="dungeon-overlay-backdrop" ${actionAttrs('closeDungeonOverlay')}></div>
      <div class="dungeon-modal">
        <div class="dungeon-modal-title">🍽️ ${_pt('Alimentar', 'Feed')} ${elem.name}</div>
        <div style="font-size:0.7rem;color:var(--text-dim);margin-bottom:8px">
          Lv.${elem.level}  XP ${elem.xp || 0}/${elem.xpNext} (${xpPct}%)
        </div>
        <div style="max-height:300px;overflow-y:auto;display:flex;flex-direction:column;gap:4px">`;

    for (const inv of mats) {
      const d = typeof inv.item_data === 'string' ? JSON.parse(inv.item_data) : inv.item_data;
      const qty = d.qty || 1;
      const iconSrc = typeof getAssetImagePath === 'function' ? getAssetImagePath(d.name || d.id) : null;
      const iconHtml = iconSrc
        ? `<img src="${iconSrc}" alt="" style="width:1.1rem;height:1.1rem;object-fit:contain;display:inline-block;vertical-align:middle;margin-right:4px" data-error-hide="true" data-error-next-display="inline-block"><span style="display:none">${d.emoji || '📦'}</span>`
        : `${d.emoji || '📦'} `;
      html += `<div class="dungeon-elem-feed-row" ${actionAttrs('dungeonFeedElemental', inv.id)} style="cursor:pointer">
        <span>${iconHtml}${d.name} (${qty})</span>
      </div>`;
    }

    html += `</div>
      <button class="dungeon-btn" style="margin-top:10px;width:100%" ${actionAttrs('closeDungeonOverlay')}>${_pt('Cancelar', 'Cancel')}</button>
    </div>`;

    overlay.innerHTML = html;
  };

  global.dungeonFeedElemental = async function(invId, triggerEl, event) {
    const overlay = document.getElementById('dungeon-overlay');
    if (overlay) overlay.innerHTML = '';

    try {
      const r = await apiFetch('POST', '/game/elemental/feed', { inventory_id: invId });
      if (r.elemental) {
        _cachedElemental = r.elemental;
        log(r.message || _pt('🍽️ Elemental alimentado!', '🍽️ Fed elemental!'), 'log-arrive');
        // Refresh character data
        const charR = await apiFetch('GET', '/game/character');
        if (charR) Object.assign(getChar(), charR);
        renderDungeonView();
      } else {
        log(_pt('⚠️ ') + (r.error || _pt('Falha ao alimentar', 'Failed to feed')), 'log-danger');
      }
    } catch (e) {
      log(_pt('⚠️ Erro ao alimentar elemental', '⚠️ Error feeding elemental'), 'log-danger');
    }
  };

  global.dungeonElementalInfo = async function() {
    await fetchElemental();
    renderDungeonView();
  };

  global.closeDungeonOverlay = function() {
    const overlay = document.getElementById('dungeon-overlay');
    if (overlay) overlay.innerHTML = '';
  };

  global.debugDungeonMonsters = function() {
    console.log('=== MONSTER CREATION DEBUG ===');
    
    // Check if the condition is being evaluated
    const dungeonDef = getDungeonDef('tower');
    console.log('dungeonDef exists:', !!dungeonDef);
    console.log('dungeonDef.monsters length:', dungeonDef.monsters.length);
    
    // Check a specific room that should have monsters (room 1)
    const room1 = D.rooms[1];
    console.log('Room 1 details:', {
        isStart: room1.isStart,
        isBoss: room1.isBoss,
        type: room1.type,
        connections: room1.connections,
        monsters: room1.monsters
    });
    
    // Manually test if a monster would be created for room 1
    const shouldCreateMonster = !room1.isStart && !room1.isBoss && dungeonDef && chance(0.7);
    console.log('Should create monster for room 1?', shouldCreateMonster);
    
    // Check if the monster pool has valid monsters
    console.log('Monster pool sample:', dungeonDef.monsters[0]);
};
  global.testMonsterCreation = function() {
    const dungeonDef = getDungeonDef('tower');
    let monsterCount = 0;
    for(let i = 0; i < 100; i++) {
        if (!false && !false && dungeonDef && Math.random() < 0.7) {
            monsterCount++;
        }
    }
    console.log('Monster creation would happen', monsterCount, 'out of 100 times');
};

  // ── Trial of the Arcane ─────────────────────────────────────

  function _lbEscape(name) {
      return String(name || '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  }

  function formatEventTime(minutes) {
      const m = Math.max(0, Math.floor(Number(minutes || 0)));
      const s = Math.max(0, Math.round((Number(minutes || 0) - m) * 60));
      return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatEventCountdown(sec) {
      sec = Math.max(0, Math.floor(Number(sec || 0)));
      const p = n => String(n).padStart(2, '0');
      const d = Math.floor(sec / 86400);
      const h = Math.floor((sec % 86400) / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      return `${p(d)}:${p(h)}:${p(m)}:${p(s)}`;
  }

  function stopEventCountdown() {
      if (global.__eventCdTimer) { clearInterval(global.__eventCdTimer); global.__eventCdTimer = null; }
  }

  function startEventCountdown(endsAtSec) {
      stopEventCountdown();
      const el = document.getElementById('event-countdown-el');
      if (!el || !endsAtSec) return;
      const tick = () => {
          const secLeft = Math.floor(Number(endsAtSec) - Date.now() / 1000);
          el.textContent = secLeft <= 0 ? '00:00:00:00' : formatEventCountdown(secLeft);
      };
      tick();
      global.__eventCdTimer = setInterval(tick, 1000);
  }

  function showEventErrorDialog(msg) {
      if (typeof openGameDialog !== 'function') { alert(msg); return; }
      stopEventCountdown();
      apiFetch('GET', '/event/status').then(st => {
          const endsAt = Number(st?.eventEndsAt || 0) || null;
          let countdown = '';
          if (endsAt) countdown = `<br><br>⏰ ${_pt('O Evento termina em:', 'Event ends in:')} <span id="event-countdown-el" style="font-weight:800;color:#ffd700;letter-spacing:.5px">${formatEventCountdown(Math.floor(endsAt - Date.now() / 1000))}</span>`;
          const p = openGameDialog({ title: _pt('Provação do Arcano', 'Trial of the Arcane'), message: msg + countdown, confirmLabel: 'OK', showCancel: false });
          if (endsAt) startEventCountdown(endsAt);
          p.then(stopEventCountdown).catch(stopEventCountdown);
      }).catch(() => {
          const p = openGameDialog({ title: _pt('Provação do Arcano', 'Trial of the Arcane'), message: msg, confirmLabel: 'OK', showCancel: false });
          p.catch(() => {});
      });
  }

  async function fetchEventLeaderboard() {
      try {
          const res = await apiFetch('GET', '/event/leaderboard');
          return Array.isArray(res?.leaderboard) ? res.leaderboard : [];
      } catch(e) {
          console.error('Failed to load event leaderboard:', e);
          return null;
      }
  }

  function eventLeaderboardHTML(rows) {
      if (!rows) return `<div class="event-lb-empty">${_pt('Não foi possível carregar o ranking.', 'Could not load the leaderboard.')}</div>`;
      if (!rows.length) return `<div class="event-lb-empty">${_pt('Nenhuma pontuação ainda — seja o primeiro!', 'No scores yet — be the first!')}</div>`;
      const myName = global.character?.char_name;
      const medals = ['🥇', '🥈', '🥉'];
      return rows.map((r, i) => {
          const mine = myName && r.char_name === myName;
          return `<div class="event-lb-row${mine ? ' event-lb-row-self' : ''}">
              <span class="event-lb-rank">${medals[i] || `${i + 1}.`}</span>
              <span class="event-lb-name">${_lbEscape(r.char_name)}</span>
              <span class="event-lb-score">⭐ ${r.best_score}</span>
              <span class="event-lb-time">⏱ ${formatEventTime(r.best_time)}</span>
          </div>`;
      }).join('');
  }

  function renderEventStartScreen() {
      const area = document.getElementById('dungeon-main-area');
      if (!area) return;
      area.innerHTML = `
          <div style="display:flex;align-items:center;justify-content:center;min-height:420px;padding:24px;text-align:center;">
              <div style="max-width:520px;width:100%;padding:36px 28px;border-radius:18px;background:linear-gradient(180deg,rgba(37,24,74,0.92),rgba(26,19,48,0.95));border:2px solid rgba(168,85,247,0.45);box-shadow:0 0 40px rgba(168,85,247,0.25);">
                  <div style="font-size:3rem;margin-bottom:10px">👁️</div>
                  <div style="font-size:1.7rem;font-weight:800;letter-spacing:1px;color:#e9d5ff">${_pt('PROVAÇÃO DO ARCANO', 'TRIAL OF THE ARCANE')}</div>
                  <div style="font-size:0.9rem;color:rgba(255,255,255,0.65);margin:14px 0 22px;line-height:1.5">
                      ${_pt('10 salas. 1 mini-chefe + 2 lacaios por sala. Você comanda 4 campeões fixos (🔥 Piromante · ❄️ Criomante · 🛡️ Guardião · ✨ Curandeira) — escolha quem age e qual habilidade usar a cada turno. Derrote o Soberano Arcano (sala 10) para reivindicar a coroa. O tempo começa agora — termine rápido para o bônus!', '10 rooms. 1 mini-boss + 2 mobs per room. You command a fixed team of 4 champions (🔥 Pyromancer · ❄️ Cryomancer · 🛡️ Warden · ✨ Mender) — pick who acts and which ability each turn. Slay the Arcane Sovereign (room 10) to claim the crown. Time starts now — finish fast for the bonus!')}
                  </div>
                  <div class="event-lb-box">
                      <div class="event-lb-title">🏆 ${_pt('TOP 10 MELHORES', 'TOP 10 LEADERS')}</div>
                      <div id="event-lb-list" class="event-lb-list"><div class="event-lb-empty">${_pt('Carregando...', 'Loading...')}</div></div>
                  </div>
                  <button id="event-begin-btn" class="dungeon-btn dungeon-btn-fight" style="font-size:1.25rem;padding:16px 44px;border-radius:12px;box-shadow:0 0 24px rgba(168,85,247,0.5)">⚔️ ${_pt('COMEÇAR', 'BEGIN')}</button>
              </div>
          </div>
      `;
      const beginBtn = document.getElementById('event-begin-btn');
      if (beginBtn) beginBtn.onclick = startEventTimer;
      fetchEventLeaderboard().then(rows => {
          const list = document.getElementById('event-lb-list');
          if (list) list.innerHTML = eventLeaderboardHTML(rows);
      });
  }

  async function startEventTimer() {
      if (D._eventStarted) return;
      try {
          const res = await apiFetch('POST', '/event/start');
          D._eventStarted = true;
          D._eventStartTime = Number(res?.startTime || 0) || Date.now();
          if (D.eventRun) D.eventRun.start_time = D._eventStartTime;
          renderDungeonTab();
      } catch(e) {
          console.error('Failed to start event timer:', e);
          const msg = e?.message || _pt('Erro ao começar o Trial.', 'Failed to start the Trial.');
          if (typeof openGameDialog === 'function') openGameDialog({ title: _pt('Provação do Arcano', 'Trial of the Arcane'), message: msg, confirmLabel: 'OK', showCancel: false }).catch(() => {});
          else alert(msg);
      }
  }

  function updateEventScoreDisplay() {
      const run = D.eventRun || {};
      const score = run.score ?? 0;
      const room = run.room_index ?? 1;
      document.querySelectorAll('#event-score-count, #event-cb-score').forEach(el => { el.textContent = score; });
      document.querySelectorAll('#event-room-count, #event-cb-room').forEach(el => { el.textContent = room; });
  }

  // Sync run-level stats (score/kills/bosses) from any server response that
  // carries them, so the results modal can never show stale or missed counts.
  function syncEventRunStats(stats) {
      if (!stats || !D.eventRun) return;
      if (stats.score != null) D.eventRun.score = Number(stats.score);
      if (stats.kills != null) D.eventRun.kills = Number(stats.kills);
      if (stats.bosses != null) D.eventRun.bosses = Number(stats.bosses);
      if (stats.total_dmg != null) D.eventRun.total_dmg = Number(stats.total_dmg);
      if (stats.room_index != null) D.eventRun.room_index = Number(stats.room_index);
      updateEventScoreDisplay();
  }

  async function enterEvent() {
      if (D.eventMode) return;
      const charFloor = Number((typeof character !== 'undefined' && character && character.dungeon_highest_floor) || 0);
      if (charFloor < 5) {
          const msg = _pt('Reach dungeon floor 5 to unlock the Trial of the Arcane.', 'Reach dungeon floor 5 to unlock the Trial of the Arcane.');
          if (typeof openGameDialog === 'function') openGameDialog({ title: _pt('Trial Locked', 'Trial Locked'), message: msg, confirmLabel: 'OK', showCancel: false }).catch(() => {});
          else alert(msg);
          return;
      }
      try {
          const res = await apiFetch('POST', '/event/enter');
          if (!res || !res.success) {
              const msg = res?.error || 'Event unavailable';
              showEventErrorDialog(msg);
              return;
          }
          D.eventMode = true;
          // Isolation sandbox: snapshot every shared tower-runtime field the event
          // is about to replace. resetEventState() puts them back, so the conditional
          // event floor can never clobber live dungeon progress (DB/localStorage saves
          // are already blocked while eventMode is true).
          D._towerSnapshot = {
              rooms: D.rooms,
              playerPos: D.playerPos,
              exploredRooms: D.exploredRooms,
              crawler: D.crawler,
              floorRunId: D.floorRunId,
              bossDefeated: D.bossDefeated,
              combat: D.combat,
              _combatPrefetch: D._combatPrefetch,
              dungeonLog: D.dungeonLog,
          };
          // The event floor holds NO tower lock: release any live lock + orphaned
          // refresh timer so the tower is free for other devices while we play.
          if (D.lockRefreshInterval) { clearInterval(D.lockRefreshInterval); D.lockRefreshInterval = null; }
          if (D.hasLock) { D.hasLock = false; apiFetch('POST', '/game/dungeon/lock-release').catch(() => {}); }
          if (D.travelTimer) { clearTimeout(D.travelTimer); D.travelTimer = null; }
          D.isTraveling = false;
          D.eventRun = res.run || { room_index: 1, score: 0, kills: 0, bosses: 0, total_dmg: 0 };
          D._eventStarted = false;
          D._eventStartTime = Number(res.run?.start_time || 0) || Date.now();
          D.activeDungeon = 'event';
          global.__dungeonActive = true;
          D.rooms = (res.floor || []).map((r, idx) => ({
              ...r,
              id: idx,
              monsters: Array.isArray(r.monsters) ? r.monsters.map(m => ({ ...m, currentHp: m.currentHp ?? m.hp ?? m.maxHp, maxHp: m.maxHp ?? m.hp })) : [],
          }));
          D.playerPos = D.rooms.findIndex(r => r.isStart);
          if (D.playerPos === -1) D.playerPos = 0;
          D.exploredRooms = new Set([D.playerPos]);
          D.crawler = null;
          D.floorRunId = null;
          D.bossDefeated = false;
          D.combat = null;
          D._combatPrefetch = null;
          D.dungeonLog = [];
          D.lockRefreshInterval = null;
          log(`${_pt('🔮 Provação do Arcano começou! Avance pela sala 1 para começar a lutar.', '🔮 Trial of the Arcane has begun! Move into Room 1 to start fighting.')}`, 'log-enter');
          if (typeof showTab === 'function') showTab('dungeon');
          else renderDungeonTab();
      } catch(e) {
          console.error('Failed to enter event:', e);
          const msg = e?.message || _pt('Erro ao entrar no Trial do Arcano.', 'Failed to enter the Trial of the Arcane.');
          showEventErrorDialog(msg);
      }
  }

  async function finishEventRun(completed) {
      if (!D.eventMode || D._eventFinishing) return;
      D._eventFinishing = true;
      const prevEventRun = D.eventRun;
      try {
          const res = await apiFetch('POST', '/event/finish', { completed: !!completed });
          showEventResultModal(res, prevEventRun, completed);
      } catch(e) {
          console.error('Failed to finish event run:', e);
          alert(_pt('Erro ao finalizar o Trial do Arcano.', 'Failed to finalize the Trial of the Arcane.'));
      }
      D._eventFinishing = false;
      resetEventState();
  }

  function resetEventState() {
      if (D._eventTimerInterval) clearInterval(D._eventTimerInterval);
      D._eventTimerInterval = null;
      D._eventStartTime = 0;
      D._eventStarted = false;
      D._eventFinishing = false;
      D._eventRunCompleted = false;
      D.eventMode = false;
      D.eventRun = null;
      D.activeDungeon = null;
      global.__dungeonActive = false;
      D.combat = null;
      D._combatPrefetch = null;
      D._combatActive = false;
      // Restore the tower runtime exactly as it was before the event sandbox took
      // over — rooms, position, crawler, floorRunId and log come back untouched.
      const snap = D._towerSnapshot;
      if (snap) {
          D.rooms = snap.rooms;
          D.playerPos = snap.playerPos;
          D.exploredRooms = snap.exploredRooms;
          D.crawler = snap.crawler;
          D.floorRunId = snap.floorRunId;
          D.bossDefeated = snap.bossDefeated;
          D.combat = snap.combat || null;
          D._combatPrefetch = snap._combatPrefetch || null;
          D.dungeonLog = snap.dungeonLog || [];
          D._towerSnapshot = null;
      }
      document.body.classList.remove('modal-lock');
      document.body.classList.remove('combat-lock');
      if (typeof renderDungeonTab === 'function') renderDungeonTab();
  }

  function showEventResultModal(res, prevRun, completed) {
      const score = res?.score ?? prevRun?.score ?? 0;
      const baseScore = res?.baseScore ?? prevRun?.score ?? 0;
      const timeBonus = res?.timeBonus ?? 0;
      const timeTaken = Math.max(0, Number(res?.timeTaken ?? 0));
      const attemptsUsed = res?.attemptsUsed ?? '?';
      const attemptsLimit = res?.attemptsLimit ?? null;
      const kills = prevRun?.kills ?? 0;
      const bosses = prevRun?.bosses ?? 0;
      let overlay = document.getElementById('event-result-modal');
      if (!overlay) {
          overlay = document.createElement('div');
          overlay.id = 'event-result-modal';
          overlay.className = 'modal-overlay';
          document.body.appendChild(overlay);
      }
      overlay.classList.remove('hidden');
      overlay.classList.add('modal-overlay');
      overlay.innerHTML = `
          <div class="modal-box dungeon-victory-box" style="background:linear-gradient(180deg,#2a1e4f,#1a1330);border:2px solid rgba(168,85,247,0.5)">
              <div class="victory-icon">${completed ? '👁️' : '💀'}</div>
              <div class="victory-title" style="color:#c9a7ff">${_pt('PROVAÇÃO DO ARCANO', 'TRIAL OF THE ARCANE')}</div>
              <div class="victory-boss-name">${completed ? _pt('Trial Completo!', 'Trial Complete!') : _pt('Você foi derrotado', 'You were defeated')}</div>
              <div style="text-align:center;margin:12px 0">
                  <div style="font-size:1.9rem;font-weight:800;color:#f5d76e">⭐ ${score}</div>
                  <div style="font-size:0.85rem;color:rgba(255,255,255,0.65);margin-top:4px">
                      ⚔️ ${kills} ${_pt('mortes', 'kills')} · 💀 ${bosses} ${_pt('chefes', 'bosses')}
                  </div>
                  <div style="font-size:0.85rem;color:rgba(255,255,255,0.55);margin-top:6px">
                      ${_pt('Base:', 'Base:')} ${baseScore} + ${_pt('Bonus de tempo:', 'Time bonus:')} ${timeBonus}<br>
                      ${attemptsLimit === null ? `${_pt(`Tentativas: ${attemptsUsed}`, `Attempts: ${attemptsUsed}`)}` : `${_pt(`Tentativas: ${attemptsUsed}/${attemptsLimit}`, `Attempts: ${attemptsUsed}/${attemptsLimit}`)}`}
                  </div>
                  <div id="event-result-rank" style="margin-top:8px"></div>
              </div>
              <button id="event-result-close-btn" class="btn-primary" style="margin-top:12px;width:100%">OK</button>
          </div>`;
      overlay.onclick = (ev) => { if (ev.target === overlay) overlay.classList.add('hidden'); };
      const btn = overlay.querySelector('#event-result-close-btn');
      if (btn) btn.onclick = () => { overlay.classList.add('hidden'); };
      fetchEventLeaderboard().then(rows => {
          const el = document.getElementById('event-result-rank');
          if (!el) return;
          const myName = (typeof character !== 'undefined' && character && character.name) ? character.name : ((typeof global !== 'undefined' && global && global.character && global.character.name) ? global.character.name : null);
          if (!rows || !myName) { el.innerHTML = ''; return; }
          const idx = rows.findIndex(r => r.char_name === myName);
          const style = 'font-size:1rem;font-weight:700;color:#c9a7ff;text-align:center;letter-spacing:0.5px';
          el.innerHTML = idx !== -1
              ? `<div style="${style}">🏆 ${_pt('SEU RANK:', 'YOUR RANK:')} #${idx + 1}</div>`
              : `<div style="${style};color:rgba(255,255,255,0.45)">${_pt('Fora do Top 10', 'Not in the Top 10')}</div>`;
      });
  }

  function resetDungeonState() {
    D = {
      tokens: 0,
      activeDungeon: null,
      floor: 1,
      highestFloor: 1,
      rooms: [],
      playerPos: 0,
      exploredRooms: new Set(),
      floorRunId: null,
      crawler: null,
      combat: null,
      travelTimer: null,
      isTraveling: false,
      dungeonLog: [],
      savedProgress: {},
      dungeonInventory: [],
      dungeonGold: 0,
      blacksmithUnlocked: false,
      guildReputation: 0,
      eventMode: false,
      eventRun: null,
      _eventStarted: false,
      _eventStartTime: 0,
      _eventTimerInterval: null,
    };
    if (D._eventTimerInterval) clearInterval(D._eventTimerInterval);
    try { localStorage.removeItem('dungeon_state'); } catch(e) {}
  }

  global.resetDungeonState = resetDungeonState;
  global.enterEvent = enterEvent;
  global.startEventTimer = startEventTimer;
  global.openGuild = openGuild;
global.closeGuild = closeGuild;
global.exchangeAtGuild = exchangeAtGuild;
global.closeExchangeRewardModal = function() {
  const modal = document.querySelector('.exchange-reward-modal');
  if (modal) modal.remove();
  D._pendingExchangeModal = false;
  renderGuild();
};
global.claimGuildBounty = claimGuildBounty;
  global.skipGuildBounty    = skipGuildBounty;
  global.createGuildRaid    = createGuildRaid;
  global.joinGuildRaid      = joinGuildRaid;
  global.leaveGuildRaid     = leaveGuildRaid;
  global.deleteGuildRaid    = deleteGuildRaid;
  global.startGuildRaid     = startGuildRaid;
  global.claimGuildRaidReward = claimGuildRaidReward;
  global.updateGuildRaidSettings = updateGuildRaidSettings;
  global.recruitGuildRaidMercenary = recruitGuildRaidMercenary;
  global.dungeonEnter        = enterDungeon;
  global.dungeonTravel       = travelToRoom;
  global.dungeonFight        = initiateFight;
  global.dungeonAttack       = fightRound;
  global.dungeonRunCombat    = () => { if(D.combat) tryRun(D.combat.roomIdx); };
  global.dungeonEscapeConfirm = () => { if(D.combat) confirmEscape(D.combat.roomIdx); };
  global.dungeonEscapeCancel  = () => { cancelEscape(); };
  global.dungeonFightBoss    = fightBoss;
  global.dungeonExit         = dungeonExit;
  global.descendDungeonFloor = descendFloor;
  global.closeDungeonVictory = closeDungeonVictory;
  global.toggleMonsterLore   = toggleMonsterLore;
  global.deckNav             = deckNav;
  global.selectMonster       = selectMonster;
  global.selectAttack        = selectAttack;
  global.trialSelectChar     = trialSelectChar;
  global.trialUseAbility     = trialUseAbility;
  global.trialEndTurn        = trialEndTurn;
  global.trialSkipAction     = trialSkipAction;
  global.roomDeckNav         = roomDeckNav;
  global.dungeonElementalInfo = globalThis.dungeonElementalInfo;
  global.dungeonDiscoverElemental = globalThis.dungeonDiscoverElemental;
  global.dungeonShowFeedModal = globalThis.dungeonShowFeedModal;
  global.dungeonFeedElemental = globalThis.dungeonFeedElemental;
  global.closeDungeonOverlay = globalThis.closeDungeonOverlay;
  global.renderDungeonTab    = function() {
    renderDungeonTab();
    if (character && !D.eventMode) {
      loadDungeonDataFromDB();
    }
  };
  global.renderRaidsTab      = renderRaidsTab;

  // ── Init ───────────────────────────────────────────────────
  loadCSS();
  loadState();

})(window);
