# 🎲 Ludo King — Multiplayer

Match-code based multiplayer Ludo with 3D dice, step-by-step token animation,
procedural sound (no audio files) and 3-consecutive-6 turn-forfeit rule.

## Features
- 2 – 4 players, each on their own phone
- Host creates room → shares 6-char **match code**
- Players join, pick their colour, control only their own dice
- Ludo-King style animations: token hops, capture bounce, home fanfare
- 3D CSS dice with rattle sound
- Roll 6 → extra turn · three 6s in a row → turn forfeited
- Sound on/off toggle
- Auto-reconnect (player id stored in localStorage)

## Run locally
```bash
npm install
npm start
# open http://localhost:3000
