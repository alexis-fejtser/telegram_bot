# OpenCode Developer Guide: Telegram Bot

## Entrypoints
- Bot Bootstrapping: `src/index.js` (Executes `bootstrap()`)
- API Server: `api/server.js` (Called by `src/index.js`)
- Admin Client: `client/` (React + Vite)

## Critical Commands
- Start Bot: `npm start`
- Start Bot (Dev): `npm run dev`
- Build Admin UI: `cd client && npm run build`

## Architecture & Constraints
- **Startup Sequence**: `src/index.js` `bootstrap()` is the critical setup flow.
- **Scene Registration**: `registerSceneActions(bot)` must be called *after* `bot.use(stage.middleware())` inside `bootstrap()`.
- **Frontend Deployment**: API server in `api/server.js` serves production files from `client/dist`. Always rebuild client if UI changes.
- **ES Modules**: Project uses `"type": "module"`. Use `import/export`.

## Development Quirks
- Dynamic Scenes: Scenes are loaded from MySQL dynamically. Changes to scene structures often require updating DB via `scripts/seedScenes.js` or through the Admin UI.

# Project Guidelines & Context Boundaries

## Token Economy Rules
- Do NOT read, glob, or search in build outputs, bundle files, or cache directories.
- Ignore: `node_modules/`, `dist/`, `.next/`, `build/`, `.git/`, lockfiles (`package-lock.json`, `pnpm-lock.yaml`).
- Never read binary files, media assets, or database dumps (`*.mp4`, `*.png`, `*.tar.gz`, `*.dump`).

## Workflow
- Before editing, ask or inspect ONLY the specific file related to the task.
- Do not dump entire file contents into chat if small diffs suffice.