# Backgammon

Offline single-player backgammon (you vs. computer: Easy / Medium / Hard). No ads, no accounts.
Plain HTML/JS installable web app (PWA). Your game and win/loss record are saved on the device.

## Install on iPhone
1. Host the folder somewhere static (e.g. GitHub Pages: push this repo, Settings -> Pages -> deploy from `main`, root).
2. Open the URL in **Safari** -> Share -> **Add to Home Screen**.
3. Open it once online; after that it runs fully offline from the home-screen icon.

## Play
Dice roll automatically on your turn. Tap a glowing checker, then a green spot. Undo steps back
(even into the previous turn), Hint shows a good move in blue, amber marks the computer's last move.

## Dev
- `engine.js` rules + AI, `app.js` UI/game flow, `sw.js` offline cache (bump `CACHE` when shipping changes).
- `node tests/sim.js` runs rule checks and AI-vs-AI games.
- Local preview: `python3 -m http.server` then open http://localhost:8000
