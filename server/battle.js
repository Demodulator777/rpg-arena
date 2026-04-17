/**
 * Battle Engine v2
 * - STR/4 = base physical damage per point
 * - Weapon adds flat dmg_min–dmg_max roll
 * - Elemental damage is separate roll from weapon/amulet
 * - Elemental resistance reduces incoming elemental hits
 * - Mage gets 1.5x elemental damage multiplier
 * - AGI = initiative + dodge chance
 * - DEF = physical damage mitigation
 * - MAG = magic burst chance on physical hit
 */

function roll(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getEquipStats(equip) {
  if (!equip) return {};
  const stats = { dmg_min:0, dmg_max:0, def_bonus:0, agi_bonus:0, mag_bonus:0, str_bonus:0,
    elem_dmg:0, elem_dmg_type:null,
    elem_resist_pyro:0, elem_resist_water:0, elem_resist_wind:0, elem_resist_electro:0 };

  const slots = ['weapon','armor','boots','amulet','ring'];
  slots.forEach(slot => {
    const item = equip[slot];
    if (!item || !item.stats) return;
    const s = item.stats;
    if (s.dmg_min)            stats.dmg_min += s.dmg_min;
    if (s.dmg_max)            stats.dmg_max += s.dmg_max;
    if (s.def_bonus)          stats.def_bonus += s.def_bonus;
    if (s.agi_bonus)          stats.agi_bonus += s.agi_bonus;
    if (s.mag_bonus)          stats.mag_bonus += s.mag_bonus;
    if (s.str_bonus)          stats.str_bonus += s.str_bonus;
    if (s.elem_dmg && s.elem_dmg > stats.elem_dmg) {
      stats.elem_dmg = s.elem_dmg;
      stats.elem_dmg_type = s.elem_dmg_type;
    }
    if (s.elem_resist_pyro)    stats.elem_resist_pyro    += s.elem_resist_pyro;
    if (s.elem_resist_water)   stats.elem_resist_water   += s.elem_resist_water;
    if (s.elem_resist_wind)    stats.elem_resist_wind    += s.elem_resist_wind;
    if (s.elem_resist_electro) stats.elem_resist_electro += s.elem_resist_electro;
  });
  return stats;
}

function getResist(defender, defEquip, elemType) {
  if (!elemType) return 0;
  const baseResist = defender[`elem_resist_${elemType}`] || 0;
  const equipResist = defEquip[`elem_resist_${elemType}`] || 0;
  return Math.min(80, baseResist + equipResist); // cap at 80%
}

function calcHit(attacker, aEquip, defender, dEquip) {
  const totalStr = attacker.strength + (aEquip.str_bonus || 0);
  const totalDef = defender.defense + (dEquip.def_bonus || 0);
  const totalAgi = defender.agility + (dEquip.agi_bonus || 0);
  const totalMag = attacker.magic + (aEquip.mag_bonus || 0);

  // Physical damage: STR/4 base + weapon roll
  const physBase = Math.floor(totalStr / 4);
  const weaponRoll = aEquip.dmg_max > 0 ? roll(aEquip.dmg_min, aEquip.dmg_max) : 0;
  const rawPhys = physBase + weaponRoll + roll(1, 6);

  // Defense mitigation
  const mitigation = totalDef * 0.35;
  const dodged = Math.random() < (totalAgi / 350);
  let physDmg = Math.max(1, Math.round(rawPhys - mitigation));
  if (dodged) physDmg = Math.floor(physDmg / 2);

  // Magic burst on physical
  const magicBurst = Math.random() < (totalMag / 200);
  const burstDmg = magicBurst ? Math.floor(totalMag * 0.4) : 0;

  // Elemental damage
  let elemDmg = 0;
  let elemType = aEquip.elem_dmg_type;
  if (elemType && aEquip.elem_dmg > 0) {
    const rawElem = roll(Math.floor(aEquip.elem_dmg * 0.7), aEquip.elem_dmg);
    const elemMult = attacker.class === 'mage' ? 1.5 : 1.0;
    const resist = getResist(defender, dEquip, elemType);
    elemDmg = Math.max(0, Math.floor(rawElem * elemMult * (1 - resist / 100)));
  }

  const totalDmg = physDmg + burstDmg + elemDmg;

  return { physDmg, burstDmg, magicBurst, dodged, elemDmg, elemType, totalDmg };
}

function calcInit(char, equip) {
  return (char.agility + (equip.agi_bonus || 0)) + roll(1, 20);
}

const ELEM_EMOJIS = { pyro:'🔥', water:'💧', wind:'🌀', electro:'⚡' };

function resolveBattle(attacker, defender, aEquipRaw, dEquipRaw) {
    const aEquip = getEquipStats(aEquipRaw);
    const dEquip = getEquipStats(dEquipRaw);

    const log = [];
    let aHp = attacker.hp_max;
    let dHp = defender.hp_max;

    log.push(`⚔️ ${attacker.name} challenges ${defender.name}!`);
    log.push(`📊 ${attacker.name}: STR ${attacker.strength} | DEF ${attacker.defense} | AGI ${attacker.agility} | MAG ${attacker.magic}`);
    log.push(`📊 ${defender.name}: STR ${defender.strength} | DEF ${defender.defense} | AGI ${defender.agility} | MAG ${defender.magic}`);
    if (aEquip.dmg_max > 0) log.push(`🗡️ ${attacker.name} wields gear (+${aEquip.dmg_min}-${aEquip.dmg_max} dmg${aEquip.elem_dmg_type ? ', '+ELEM_EMOJIS[aEquip.elem_dmg_type]+' '+aEquip.elem_dmg+' elem' : ''})`);
    if (dEquip.dmg_max > 0) log.push(`🗡️ ${defender.name} wields gear (+${dEquip.dmg_min}-${dEquip.dmg_max} dmg${dEquip.elem_dmg_type ? ', '+ELEM_EMOJIS[dEquip.elem_dmg_type]+' '+dEquip.elem_dmg+' elem' : ''})`);
    log.push(`---`);

    let round = 0;
    const MAX_ROUNDS = 30;

    while (aHp > 0 && dHp > 0 && round < MAX_ROUNDS) {
        round++;
        log.push(`🔔 Round ${round}`);

        const aFirst = calcInit(attacker, aEquip) >= calcInit(defender, dEquip);
        const [first, fEquip, second, sEquip] = aFirst
            ? [attacker, aEquip, defender, dEquip]
            : [defender, dEquip, attacker, aEquip];

        let fHp = aFirst ? aHp : dHp;
        let sHp = aFirst ? dHp : aHp;

        // First strikes
        const h1 = calcHit(first, fEquip, second, sEquip);
        sHp = Math.max(0, sHp - h1.totalDmg);
        let msg1 = `  ${first.name} → ${second.name}: ${h1.physDmg} phys`;
        if (h1.magicBurst) msg1 += ` + ${h1.burstDmg} magic burst`;
        if ((h1.elemDmg || 0) > 0) msg1 += ` + ${h1.elemDmg} ${ELEM_EMOJIS[h1.elemType]}`;
        if (h1.dodged) msg1 += ` (dodged!)`;
        msg1 += ` = ${h1.totalDmg} total | ${second.name} ${sHp}HP`;
        log.push(msg1);

        if (aFirst) { aHp = fHp; dHp = sHp; } else { dHp = fHp; aHp = sHp; }
        if (sHp <= 0) break;

        // Second strikes
        const h2 = calcHit(second, sEquip, first, fEquip);
        fHp = Math.max(0, fHp - h2.totalDmg);
        let msg2 = `  ${second.name} → ${first.name}: ${h2.physDmg} phys`;
        if (h2.magicBurst) msg2 += ` + ${h2.burstDmg} magic burst`;
        if ((h2.elemDmg || 0) > 0) msg2 += ` + ${h2.elemDmg} ${ELEM_EMOJIS[h2.elemType]}`;
        if (h2.dodged) msg2 += ` (dodged!)`;
        msg2 += ` = ${h2.totalDmg} total | ${first.name} ${fHp}HP`;
        log.push(msg2);

        if (aFirst) { aHp = fHp; dHp = sHp; } else { dHp = fHp; aHp = sHp; }
        if (fHp <= 0) break;
    }

    let winnerId;
    let xpChange = 0;

    if (aHp <= 0 && dHp <= 0) {
        winnerId = attacker.id; // Attacker wins by honor
        xpChange = calculateBattleXP(attacker.level, defender.level, true);
        log.push(`💥 Both fall! ${attacker.name} wins by honor.`);
    } else if (dHp <= 0) {
        winnerId = attacker.id;
        xpChange = calculateBattleXP(attacker.level, defender.level, true);
        log.push(`🏆 ${attacker.name} wins with ${aHp} HP remaining!`);
    } else if (aHp <= 0) {
        winnerId = defender.id;
        xpChange = calculateBattleXP(defender.level, attacker.level, true);
        log.push(`🏆 ${defender.name} wins with ${dHp} HP remaining!`);
    } else {
        const aPct = aHp / attacker.hp_max;
        const dPct = dHp / defender.hp_max;
        winnerId = aPct >= dPct ? attacker.id : defender.id;

        // Winner gets XP based on their level vs opponent
        if (winnerId === attacker.id) {
            xpChange = calculateBattleXP(attacker.level, defender.level, true);
        } else {
            xpChange = calculateBattleXP(defender.level, attacker.level, true);
        }
        log.push(`⏱️ Time limit! ${winnerId === attacker.id ? attacker.name : defender.name} wins by endurance.`);
    }

    // Add XP info to log
    if (xpChange > 0) {
        log.push(`✨ Winner gains +${xpChange} XP!`);
    } else if (xpChange < 0) {
        log.push(`⚠️ Winner loses ${Math.abs(xpChange)} XP (opponent was too weak)!`);
    }

    return {
        winnerId,
        log,
        xpChange,
        winner: winnerId === attacker.id ? attacker : defender,
        loser: winnerId === attacker.id ? defender : attacker
    };
}

// Add the XP calculation function
function calculateBattleXP(winnerLevel, loserLevel) {
    const levelDiff = loserLevel - winnerLevel; // Positive = fighting higher level

    if (levelDiff <= -5) return -3;  // 5+ levels lower
    if (levelDiff <= -3) return -2;  // 3-4 levels lower
    if (levelDiff <= -2) return -1;  // 2 levels lower
    if (levelDiff <= -1) return 0;   // 1 level lower
    if (levelDiff === 0) return 1;   // Same level
    if (levelDiff <= 1) return 1;    // 1 level higher
    if (levelDiff <= 2) return 2;    // 2 levels higher
    return 3;                         // 3+ levels higher
}

module.exports = { resolveBattle };
