// Usage: node scripts/bot-status.js
// Shows current adaptive zone progress for all bots.

const fs = require('fs');
const path = require('path');

const MEMORY_FILE = path.join(__dirname, '..', 'server', '.bot_memory.json');

function loadMemory() {
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); }
  catch { return {}; }
}

const mem = loadMemory();
const adaptive = mem._adaptive || {};

const names = Object.keys(adaptive);
if (names.length === 0) {
  console.log('No adaptive state found in bot_memory.json');
  console.log('(Bots need to complete at least one PvP battle for tracking to begin)');
  process.exit(0);
}

console.log('Bot Adaptive Zone Status');
console.log('━━━━━━━━━━━━━━━━━━━━━━━\n');

for (const name of names.sort()) {
  const s = adaptive[name];
  const cycle = s.cycle ?? 0;
  const battles = s.battlesInCycle ?? 0;
  const progressBar = '█'.repeat(Math.floor(battles)) + '░'.repeat(10 - Math.floor(battles));

  const atk = s.attackZones;
  const blk = s.blockZones;
  const isDefaultAtk = atk && JSON.stringify(atk) === JSON.stringify(['chest','chest','solar_plexus','chest','head','solar_plexus','chest','stomach','chest','solar_plexus']);
  const isDefaultBlk = blk && JSON.stringify(blk) === JSON.stringify(['cross_guard','mid_guard','cross_guard','high_guard','cross_guard','mid_guard','cross_guard','mid_guard','cross_guard','high_guard']);

  console.log(`  ${name}`);
  console.log(`    Cycle: ${cycle}  |  Progress: ${battles}/10  ${progressBar}`);
  console.log(`    Attack: ${isDefaultAtk ? '(default)' : atk?.join(', ') || 'not set'}`);
  console.log(`    Block:  ${isDefaultBlk ? '(default)' : blk?.join(', ') || 'not set'}`);

  // Stats summary
  const atkStats = s.attackStats || {};
  const blkStats = s.blockStats || {};
  const atkEntries = Object.entries(atkStats);
  const blkEntries = Object.entries(blkStats);
  if (atkEntries.length > 0) {
    const lines = atkEntries.map(([zone, st]) => `${zone}: ${st.hits ?? 0} hits / ${st.blocks ?? 0} blocked`);
    console.log(`    Attack stats (${atkEntries.length} zones):`);
    for (const l of lines) console.log(`      ${l}`);
  }
  if (blkEntries.length > 0) {
    const lines = blkEntries.map(([zone, st]) => `${zone}: ${st.blocks ?? 0} blocks / ${st.hits ?? 0} hit through`);
    console.log(`    Block stats (${blkEntries.length} zones):`);
    for (const l of lines) console.log(`      ${l}`);
  }
  console.log('');
}

console.log('━━━━━━━━━━━━━━━━━━━━━━━');
