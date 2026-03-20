# ⚔️ Arena RPG

A browser-based async PvP RPG. Build your hero, train your stats, challenge other players.

## Stack
- **Backend**: Node.js + Express
- **Database**: SQLite (via better-sqlite3)
- **Auth**: JWT + bcrypt
- **Frontend**: Vanilla JS SPA, no framework

## Quick Start

```bash
npm install
npm start
# → http://localhost:3000
```

For dev with auto-restart (Node 18+):
```bash
npm run dev
```

## Game Loop
1. Register & create a character (Warrior, Mage, Rogue, or Paladin)
2. Go to **Training** → pick a stat → wait 60s → collect +2
3. Go to **Arena** → attack another player → see the battle log
4. Win = +50 XP + 20 Gold. Loss = +15 XP. Level up at 100×level XP.

## Character Stats
| Stat     | Effect |
|----------|--------|
| Strength | Base attack damage |
| Defense  | Damage reduction (~40% of stat) |
| Agility  | Initiative (who strikes first) + dodge chance |
| Magic    | Chance for burst damage on each hit |

## Project Structure
```
rpg-arena/
├── server/
│   ├── index.js      # Express entry point
│   ├── db.js         # SQLite schema & connection
│   ├── auth.js       # Register / Login routes
│   ├── middleware.js # JWT auth middleware
│   ├── routes.js     # Game routes (character, train, arena, battles)
│   └── battle.js     # Combat resolution engine
├── public/
│   ├── index.html
│   ├── css/style.css
│   └── js/app.js
└── game.db           # Created automatically on first run
```

## Deployment

### Railway / Render (recommended)
- Push to GitHub, connect repo, set `npm start` as start command
- Set `JWT_SECRET` env variable to a random string

### Vercel
- Not ideal (serverless doesn't persist SQLite). Swap to Vercel Postgres (Neon) if deploying there.

## Extending
- **Training time**: Change `TRAINING_DURATION_SEC` in `routes.js`
- **Stat gains**: Change `TRAINING_GAIN`
- **Battle formula**: Edit `battle.js`
- **Add equipment**: Add `items` table, modify damage calc
- **Cooldowns on attacks**: Add `last_attacked_at` to characters table
