# ⚔️ Arena RPG — RPG Arena

A browser-based async PvP/PvE RPG with turn-based combat, skill trees, dungeons, crafting, tournaments, and more.

## Stack
- **Backend**: Node.js + Express
- **Database**: SQLite via `@libsql/client` (Turso-compatible, local `file:` URLs auto-detected)
- **Auth**: JWT + bcrypt
- **Frontend**: Vanilla JS SPA served from `/public`

## Quick Start

```bash
npm install
npm start
# → http://localhost:3000
```

Dev mode with auto-restart (Node 18+):
```bash
npm run dev
```

## Project Structure
```
server/
├── index.js         # Express setup, CSP, /admin-panel route
├── db.js            # DB connection (Turso/local auto-detect)
├── middleware.js    # JWT auth middleware + isAdmin check
├── auth.js         # Register / Login routes
├── routes.js       # Main routes: battle engine, PvP, missions,
│                   # dungeons, crafting, upgrades, skill trees,
│                   # achievements, admin API, elemental companion
├── battle.js       # Combat resolution engine (NPC battles)
├── gamedata.js     # Zones, materials, recipes, crafting data
├── skills.js       # Skill tree definitions, training logic
└── tournaments.js  # Tournament system (auto-scheduled, daily)
public/
├── index.html
├── admin/
│   ├── panel.html  # Admin panel (client-side auth: checks JWT isAdmin)
│   └── panel.js
├── css/
│   ├── style.css
│   └── dungeon.css
└── js/
    ├── app.js          # Main client logic
    ├── skills-tree.js  # Skill tree + training UI
    └── dungeon.js      # Dungeon floor cards (fp-* classes)
```

## Game Features

### PvP Combat
- Turn-based auto-battler with hit chance → dodge/block → crit → damage calc
- Supports shields, dual-wielding, and class-specific combat effects
- Cooldowns between attacks (can be skipped with gems)

### Missions & PvE
- Generate missions from zones with rewards scaling by level
- Hard missions for greater challenges and rewards
- NPC battles with monster fighters built from gamedata

### Skill Trees
- 8 class-specific skill trees with passive bonuses, active combat effects, and class modifiers
- Skills unlocked via training with gems and time
- Full refund on cancel (pro-rata by time)

### Dungeon
- Progressive floor system with climbing difficulty
- Floor cards with `fp-*` classes (renamed from `dfp-*` to avoid ad-blocker blocking)
- Each floor has random encounters, loot, and boss fights

### Crafting
- Craft weapons, armor, helmets, boots, rings, amulets from raw materials and components
- Tier system (Common → Uncommon → Rare → Epic → Legendary)
- Equipment leveling with XP, feed, and stat points

### Tournaments
- Daily auto-scheduled tournaments with multiple modes:
  - Deathmatch (points-based)
  - Elimination
  - Damage (total damage dealt)
  - Least Damage Taken
  - All-vs-All
- Matchmaking, leaderboards, rewards (gold + gems)

### Elemental Companion
- Spirit beast companion with its own stats, levels, element types
- Fights alongside the player in PvP, missions, tournaments, and guardian fights
- Feed materials for XP, assign stat points, change element

### Achievements
- 100+ achievements across categories: victories, battles, economy, dungeon, missions, combat, community, raids
- Achievement chains with progressive milestones (e.g., win 10 → 50 → 200 → 300 → 500 → … → 10,000)
- Extended achievements generated via `addFromBase` for most chains

### Admin Panel
- `/admin-panel` serves `panel.html` (no server-side auth; client checks JWT `isAdmin`)
- Manage banners, rewards, csp-violations, bug reports, action log
- Add/remove tournament players, create tournaments

## Character Stats
| Stat       | Effect |
|------------|--------|
| Strength   | Base attack damage |
| Defense    | Damage reduction |
| Agility    | Initiative, dodge chance, hit chance contribution |
| Magic      | Elemental damage bonus |
| Vitality   | Hit points |
| Hit Chance | Accuracy (counters dodge) |
| Crit Chance| Critical strike chance |

## Deployment

### Railway / Render
- Push to GitHub, connect repo, set `npm start` as start command
- Set `JWT_SECRET` env variable to a random string
- Set `DATABASE_URL` for Turso remote DB (optional; defaults to local SQLite)

### Docker
```bash
docker build -t rpg-arena .
docker run -p 3000:3000 rpg-arena
```

## Environment Variables
| Variable      | Default           | Description |
|---------------|-------------------|-------------|
| `JWT_SECRET`  | (required)        | JWT signing secret |
| `DATABASE_URL`| `file:game.db`    | SQLite DB URL (Turso or local) |
| `ADMIN_PANEL_PASSWORD` | `baisbetterthanbk` | Password for admin panel access |
(subject to change once production stage ends)
