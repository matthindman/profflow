# Fire‑Reader MVP — Consolidated Technical Design Document (TDD) **Version:** 0.3.0 **Date:** 2026‑01‑07 **Target device:** macOS laptop (MacBook Pro) in a modern browser (Chrome/Safari) **Operating model:** Adult + child co‑play; adult reads instructions and grades performance --- ## 1. Purpose and Scope ### 1.1 Product goal Build a browser‑based educational game that teaches a bright 4‑year‑old: - phonics basics, - high‑utility English words (including sight words), - and simple sentence reading, using a firefighter narrative: **correct reading = water spray = puts out fires**. ### 1.2 MVP constraints - **Single developer** build - **No backend** - **Local saving** only (IndexedDB). If IndexedDB is unavailable (Safari private mode), the app remains playable but progress won’t persist. - **10 levels** (9 word levels + 1 sentence level boss) ### 1.3 Non‑goals (for MVP) - Speech recognition / automatic grading - Cloud sync / multi‑profile support - Complex inventory or character customization - Full pause system (can be added later) --- ## 2. Core Design Principles 1. **Adult‑mediated correctness** - The adult clicks **Easy**, **Hard**, or **Try again**. 2. **Short sessions** - One level should be finishable in ~10 minutes for near‑perfect performance; cap ~20 minutes. 3. **Fixed scope & sequence** - Each level has a defined core phonics principle and vocabulary set. 4. **Gentle failure** - Failing delays progress and repeats items. - After repeated failures (default: 10), restart the level. 5. **Spaced repetition for “problem words”** - Simple SM‑2‑lite style scheduling plus in‑session re‑insertion for immediate practice. 6. **Bundler‑safe + offline‑friendly** - All asset loads use new URL(..., import.meta.url) so Parcel includes files in builds. - Offline requires serving dist/ via local HTTP server (not file://). --- ## 3. Gameplay Loop ### 3.1 Word levels (1–9) - The level has **target words**: new[] + trick[] (deduped). - A session deck also includes up to **15 review words** (due words first). - Every prompt: - **Easy**: counts as success; if the word is a target word and not yet cleared this session, boss HP decreases by 1. - **Hard**: advances but no HP damage; the word reappears later in the session. - **Try again**: increments mistake counter, repeats word soon. ### 3.2 Sentence level (10) - The session chooses hp sentences at random from sentences[]. - Word‑by‑word progression: - **Easy** advances highlight. When sentence is completed with **Easy** on the final word, boss HP decreases by 1. - **Hard** advances highlight but does **not** reduce HP on completion. - **Try again** resets the sentence to the start and increments mistakes. - If HP remains > 0, sentences reshuffle and repeat (no “out of sentences” dead end). --- ## 4. Spaced Repetition Strategy ### 4.1 Persistent scheduling (SM‑2‑lite) Per word we store: - successes: number of Easy ratings historically - ease: grows slowly with Easy - interval: hours until due - due: epoch timestamp Updates: - **Easy** - successes += 1 - ease = min(2.5, ease + 0.15) - interval = interval === 0 ? 4 : interval * ease (4 hours on first success) - due = now + interval hours - **Hard** - interval = max(1, (interval||1)*0.5) - due = now + interval hours - **Fail** - reset: successes=0, interval=0, ease=1.3, due=now ### 4.2 In‑session repetition (queue reinsertion) Within a play session: - **Fail** reappears after ~3 cards - **Hard** reappears after ~6 cards - **Easy** may reappear after ~10 cards if successes < 2 (quick confirmation) This achieves most of the benefit of complex scheduling while remaining simple enough for a solo dev MVP. --- ## 5. Technical Stack - **TypeScript** (strict) - **Phaser 3** for rendering/animation/game loop - **Parcel** for dev server + bundling - **IndexedDB** via idb-keyval with an in‑memory fallback --- ## 6. Architecture and Scene Flow ### 6.1 Scenes - Boot Loads assets, shows progress bar, validates data & atlas frames, creates animations. - Menu Level selection + storage warning toast + settings launcher. - Lesson Adult‑read lesson text for the level. - Game Main gameplay loop. - Result “Level Clear” + gear unlock flavor text. - UI overlays: - Settings (modal) - ParentDashboard (DOM overlay with progress table + copy CSV) ### 6.2 State - SaveData persisted locally: - unlockedLevel (1–10) - words dictionary of WordState - muted, contrastHigh --- ## 7. Assets and Art Pipeline ### 7.1 Required folders
assets/
  atlas.png
  atlas.json
  backgrounds/
  audio/
### 7.2 Required backgrounds (exact filenames)
assets/backgrounds/
  bg1_kitchen.png
  bg2_alley.png
  bg3_campsite.png
  bg4_home_stove.png
  bg5_parkinglot.png
  bg6_backyard_bbq.png
  bg7_forest.png
  bg8_warehouse.png
  bg9_office.png
  bg10_castle.png
### 7.3 Required audio Use MP3 for Safari compatibility:
assets/audio/
  bgm.mp3
  bgm.ogg     (optional fallback)
  spray.wav
  hit.wav
  fail.wav
  victory.wav
### 7.4 TexturePacker / atlas requirements (CRITICAL) The code supports atlas frames **with** or **without** .png extensions, but your atlas must include these base names: **Minimum required frames** - kid_idle_0 … kid_idle_3 - water - boss_kitchen_0 … boss_kitchen_5 - all other boss sets used by levels (0–5 frames each) - dragon_0 … dragon_11 **Recommended TexturePacker settings** - Data format: **Phaser 3 JSON Array** - Frame names: keep file base names (extension optional) - Allow rotation: off (simplifies) - Trim: optional BootScene validates required frames and shows an error if missing. --- ## 8. Build & Run Instructions (macOS) ### 8.1 Development
bash
npm install
npm run dev
Open the URL Parcel prints (usually http://localhost:1234). ### 8.2 Production build
bash
npm run build
Creates dist/. ### 8.3 Run “offline” Do **not** open dist/index.html via file://. Serve it: **Option A (Python)**
bash
cd dist
python3 -m http.server 8080
Open http://localhost:8080. **Option B (Node)**
bash
npx serve dist
--- ## 9. QA Test Plan (must pass) 1. Boot shows loading bar; missing assets show friendly error screen. 2. Menu displays unlocked levels correctly. 3. Lesson scene shows text and starts game. 4. Word mode: - Easy reduces HP only once per target word. - Hard advances and repeats later. - Fail increments mistakes and triggers restart at 10. 5. Sentence mode: - Hard advances; never dead‑ends. - Easy on final word reduces HP. 6. Progress persists in normal mode (close/reopen). 7. Safari private mode shows “progress will not save” toast. 8. Settings: - Mute persists; unmute resumes BGM. - Reset requires confirmation. 9. ParentDashboard opens/closes repeatedly with no DOM leak. --- # 10. Complete Implementation (Full Source) ## 10.1 File tree
text
fire-reader/
├── .gitignore
├── .parcelrc
├── package.json
├── tsconfig.json
├── index.html
├── data/
│   ├── level01.json
│   ├── level02.json
│   ├── level03.json
│   ├── level04.json
│   ├── level05.json
│   ├── level06.json
│   ├── level07.json
│   ├── level08.json
│   ├── level09.json
│   └── level10.json
├── assets/ (binary assets; see Section 7)
└── src/
    ├── main.ts
    ├── constants.ts
    ├── types.ts
    ├── storage.ts
    ├── spacedRepetition.ts
    ├── audio.ts
    ├── atlasUtil.ts
    ├── visuals.ts
    ├── anims.ts
    ├── validate.ts
    ├── data/
    │   └── levels.ts
    ├── scenes/
    │   ├── BootScene.ts
    │   ├── MenuScene.ts
    │   ├── LessonScene.ts
    │   ├── GameScene.ts
    │   └── ResultScene.ts
    └── ui/
        ├── SentenceCard.ts
        ├── SettingsModal.ts
        └── ParentDashboard.ts
--- ## 10.2 Root files ### .gitignore
gitignore
# Dependencies
node_modules/

# Build outputs
dist/
.parcel-cache/

# Editor
.vscode/
.idea/
*.swp
*.swo

# OS
.DS_Store
Thumbs.db

# Logs
*.log
npm-debug.log*

# Distribution
fire-reader-dist.zip

# Environment
.env
.env.local
### .parcelrc
json
{
  "extends": "@parcel/config-default"
}
### package.json
json
{
  "name": "fire-reader",
  "version": "0.3.0",
  "private": true,
  "description": "Fire-Reader MVP (Phonics + spaced repetition) — browser game",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "dev": "parcel index.html",
    "build": "parcel build index.html --public-url ./",
    "build:debug": "parcel build index.html --public-url ./ --no-optimize",
    "build:zip": "npm run build && (cd dist && zip -r ../fire-reader-dist.zip .)",
    "typecheck": "tsc --noEmit",
    "atlas": "texturepacker --data assets/atlas.json --sheet assets/atlas.png --format phaser-json-array assets/raw/*.png"
  },
  "dependencies": {
    "idb-keyval": "^6.2.1",
    "phaser": "^3.70.0"
  },
  "devDependencies": {
    "parcel": "^2.11.0",
    "typescript": "^5.4.0"
  }
}
### tsconfig.json
json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "strict": true,
    "moduleResolution": "Node",
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2020", "DOM"]
  }
}
### index.html
html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport"
        content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
  <title>Fire‑Reader MVP</title>
  <style>
    html, body { margin:0; height:100%; background:#111; }
    #game { width:100%; height:100%; }
    * { touch-action: manipulation; }
    body.contrast-high { background:#000; }
  </style>
</head>
<body>
  <div id="game"></div>
  <script type="module" src="./src/main.ts"></script>
</body>
</html>
--- ## 10.3 src/ code ### src/main.ts
ts
import Phaser from 'phaser';
import BootScene from './scenes/BootScene';
import MenuScene from './scenes/MenuScene';
import LessonScene from './scenes/LessonScene';
import GameScene from './scenes/GameScene';
import ResultScene from './scenes/ResultScene';
import SettingsModal from './ui/SettingsModal';
import ParentDashboard from './ui/ParentDashboard';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: 960,
  height: 540,
  backgroundColor: '#000000',
  parent: 'game',
  dom: { createContainer: true },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MenuScene, LessonScene, GameScene, ResultScene, SettingsModal, ParentDashboard]
};

new Phaser.Game(config);
### src/constants.ts
ts
export const GAME_CONSTANTS = {
  MAX_FAILS_PER_LEVEL: 10,
  REVIEW_WORDS_LIMIT: 15,

  // In-session reinsertion spacing
  REINSERT_DELAY_FAIL: 3,
  REINSERT_DELAY_HARD: 6,
  REINSERT_DELAY_EASY_CONFIRM: 10,

  // Easy streak needed for "stable" mastery
  MASTERY_THRESHOLD: 2
} as const;
### src/types.ts
ts
export interface WordState {
  interval: number;   // hours
  ease: number;       // 1.3…2.5
  due: number;        // epoch ms
  successes: number;  // count of Easy ratings
}

export interface SaveData {
  unlockedLevel: number;
  words: Record<string, WordState>;
  muted: boolean;
  contrastHigh: boolean;
}

export interface LevelData {
  id: number;
  title: string;
  phonics: string;
  lesson: string;
  hp: number;

  new?: string[];
  trick?: string[];
  sentences?: string[];
}
### src/storage.ts
ts
import { get, set } from 'idb-keyval';
import type { SaveData } from './types';

const DEFAULT: SaveData = {
  unlockedLevel: 1,
  words: {},
  muted: false,
  contrastHigh: false
};

let memStore: SaveData | null = null;

let storageAvailable = true;
let storageChecked = false;

export function isStorageAvailable(): boolean {
  return storageAvailable;
}

export function hasStorageBeenChecked(): boolean {
  return storageChecked;
}

export async function loadProfile(): Promise<SaveData> {
  try {
    const val = await get<SaveData>('fire-reader');
    storageChecked = true;
    storageAvailable = true;

    const merged = val ? { ...DEFAULT, ...val, words: val.words ?? {} } : { ...DEFAULT };

    for (const k of Object.keys(merged.words)) {
      const w = merged.words[k];
      w.successes = Number.isFinite(w.successes) ? w.successes : 0;
      w.ease = Number.isFinite(w.ease) ? w.ease : 1.3;
      w.interval = Number.isFinite(w.interval) ? w.interval : 0;
      w.due = Number.isFinite(w.due) ? w.due : 0;
    }
    return merged;
  } catch {
    storageChecked = true;
    storageAvailable = false;
    return memStore ? { ...DEFAULT, ...memStore } : { ...DEFAULT };
  }
}

export async function saveProfile(state: SaveData): Promise<boolean> {
  try {
    await set('fire-reader', state);
    storageAvailable = true;
    return true;
  } catch {
    memStore = state;
    storageAvailable = false;
    return false;
  }
}

// Debounced saves (performance)
let pending: SaveData | null = null;
let timer: number | null = null;

export function debouncedSaveProfile(state: SaveData, delayMs = 500): void {
  pending = state;
  if (timer) window.clearTimeout(timer);
  timer = window.setTimeout(async () => {
    if (!pending) return;
    await saveProfile(pending);
    pending = null;
    timer = null;
  }, delayMs);
}

export async function flushSaveProfile(): Promise<boolean> {
  if (timer) {
    window.clearTimeout(timer);
    timer = null;
  }
  if (pending) {
    const ok = await saveProfile(pending);
    pending = null;
    return ok;
  }
  return storageAvailable;
}
### src/audio.ts
ts
import Phaser from 'phaser';

let bgm: Phaser.Sound.BaseSound | null = null;

export function ensureBgm(scene: Phaser.Scene) {
  if (scene.sound.mute) return;

  if (!bgm) {
    bgm = scene.sound.add('bgm', { loop: true, volume: 0.4 });
  }

  try {
    const anyBgm = bgm as any;
    if (anyBgm.isPaused) {
      anyBgm.resume();
      return;
    }
    if (!bgm.isPlaying) bgm.play();
  } catch {
    // Autoplay blocked; starts after next gesture.
  }
}

export function stopBgm() {
  try { bgm?.stop(); } catch {}
  bgm = null;
}

export function setBgmMute(muted: boolean) {
  if (!bgm) return;
  const anyBgm = bgm as any;
  try {
    if (muted) {
      if (bgm.isPlaying && !anyBgm.isPaused) anyBgm.pause();
    } else {
      if (anyBgm.isPaused) anyBgm.resume();
      else if (!bgm.isPlaying) bgm.play();
    }
  } catch {}
}
### src/atlasUtil.ts
ts
import Phaser from 'phaser';

let atlasFrames: Set<string> | null = null;

export function initAtlasFrames(texture: Phaser.Textures.Texture) {
  atlasFrames = new Set(texture.getFrameNames());
}

export function hasAtlasFrame(base: string): boolean {
  if (!atlasFrames) return false;
  return atlasFrames.has(base) || atlasFrames.has(`${base}.png`);
}

export function atlasFrame(base: string): string {
  if (!atlasFrames) return `${base}.png`;
  if (atlasFrames.has(`${base}.png`)) return `${base}.png`;
  if (atlasFrames.has(base)) return base;
  const m = Array.from(atlasFrames).find(n => n === base || n === `${base}.png`);
  return m ?? `${base}.png`;
}

export function sampleAtlasFrames(limit = 20): string[] {
  if (!atlasFrames) return [];
  return Array.from(atlasFrames).slice(0, limit);
}
### src/visuals.ts
ts
export const LEVEL_BGS: Readonly<Record<number, string>> = {
  1: 'bg1',
  2: 'bg2',
  3: 'bg3',
  4: 'bg4',
  5: 'bg5',
  6: 'bg6',
  7: 'bg7',
  8: 'bg8',
  9: 'bg9',
  10: 'bg10'
};

export const LEVEL_BOSS_ANIMS: Readonly<Record<number, string>> = {
  1: 'boss_kitchen',
  2: 'boss_trash',
  3: 'boss_campfire',
  4: 'boss_stove',
  5: 'boss_car',
  6: 'boss_bbq',
  7: 'boss_forest',
  8: 'boss_warehouse',
  9: 'boss_office',
  10: 'dragon'
};
### src/anims.ts
ts
import Phaser from 'phaser';
import { LEVEL_BOSS_ANIMS } from './visuals';

function pickFrame(names: Set<string>, base: string): string | null {
  if (names.has(`${base}.png`)) return `${base}.png`;
  if (names.has(base)) return base;
  return null;
}

function buildFrames(
  names: Set<string>,
  prefix: string,
  start: number,
  end: number
): Phaser.Types.Animations.AnimationFrame[] {
  const frames: Phaser.Types.Animations.AnimationFrame[] = [];
  for (let i = start; i <= end; i++) {
    const f = pickFrame(names, `${prefix}${i}`);
    if (!f) throw new Error(`Missing atlas frame: ${prefix}${i}`);
    frames.push({ key: 'atlas', frame: f });
  }
  return frames;
}

export function ensureAnimations(
  anims: Phaser.Animations.AnimationManager,
  texture: Phaser.Textures.Texture
) {
  const names = new Set(texture.getFrameNames());

  if (!anims.exists('kid_idle')) {
    anims.create({
      key: 'kid_idle',
      frames: buildFrames(names, 'kid_idle_', 0, 3),
      frameRate: 6,
      repeat: -1
    });
  }

  const bossKeys = new Set(Object.values(LEVEL_BOSS_ANIMS));
  for (const k of bossKeys) {
    if (anims.exists(k)) continue;
    if (k === 'dragon') {
      anims.create({
        key: 'dragon',
        frames: buildFrames(names, 'dragon_', 0, 11),
        frameRate: 10,
        repeat: -1
      });
    } else {
      anims.create({
        key: k,
        frames: buildFrames(names, `${k}_`, 0, 5),
        frameRate: 8,
        repeat: -1
      });
    }
  }
}
### src/spacedRepetition.ts
ts
import type { WordState } from './types';
import { GAME_CONSTANTS } from './constants';

export type Rating = 'easy' | 'hard' | 'fail';

export function defaultState(): WordState {
  return { interval: 0, ease: 1.3, due: 0, successes: 0 };
}

export function applyRating(prev: WordState | undefined, rating: Rating, now = Date.now()): WordState {
  const s: WordState = { ...(prev ?? defaultState()) };

  if (rating === 'easy') {
    s.successes += 1;
    s.ease = Math.min(2.5, s.ease + 0.15);
    s.interval = s.interval === 0 ? 4 : s.interval * s.ease;
    s.due = now + s.interval * 3_600_000;
    return s;
  }

  if (rating === 'hard') {
    const base = s.interval || 1;
    s.interval = Math.max(1, base * 0.5);
    s.due = now + s.interval * 3_600_000;
    return s;
  }

  s.successes = 0;
  s.interval = 0;
  s.ease = 1.3;
  s.due = now;
  return s;
}

export class Scheduler {
  private queue: string[];
  private queueSet: Set<string>;
  private store: Record<string, WordState>;

  constructor(words: string[], store: Record<string, WordState>) {
    this.store = store;
    const unique = Array.from(new Set(words));
    this.queue = unique.slice();
    this.queueSet = new Set(unique);

    for (const w of unique) {
      if (!this.store[w]) this.store[w] = defaultState();
      else {
        const s = this.store[w];
        s.successes = Number.isFinite(s.successes) ? s.successes : 0;
        s.ease = Number.isFinite(s.ease) ? s.ease : 1.3;
        s.interval = Number.isFinite(s.interval) ? s.interval : 0;
        s.due = Number.isFinite(s.due) ? s.due : 0;
      }
    }
  }

  next(): string | null {
    return this.queue[0] ?? null;
  }

  grade(word: string, rating: Rating) {
    const prev = this.store[word] ?? defaultState();
    const next = applyRating(prev, rating);
    this.store[word] = next;

    if (this.queue[0] === word) {
      this.queue.shift();
      this.queueSet.delete(word);
    } else {
      const idx = this.queue.indexOf(word);
      if (idx >= 0) {
        this.queue.splice(idx, 1);
        this.queueSet.delete(word);
      }
    }

    const needsConfirm = rating === 'easy' && next.successes < GAME_CONSTANTS.MASTERY_THRESHOLD;

    let delay: number | null = null;
    if (rating === 'fail') delay = GAME_CONSTANTS.REINSERT_DELAY_FAIL;
    else if (rating === 'hard') delay = GAME_CONSTANTS.REINSERT_DELAY_HARD;
    else if (needsConfirm) delay = GAME_CONSTANTS.REINSERT_DELAY_EASY_CONFIRM;

    if (delay !== null) this.insertAt(Math.min(delay, this.queue.length), word);
  }

  private insertAt(index: number, word: string) {
    if (this.queueSet.has(word)) return;
    this.queue.splice(index, 0, word);
    this.queueSet.add(word);
  }
}
### src/data/levels.ts
ts
import l1 from '../../data/level01.json';
import l2 from '../../data/level02.json';
import l3 from '../../data/level03.json';
import l4 from '../../data/level04.json';
import l5 from '../../data/level05.json';
import l6 from '../../data/level06.json';
import l7 from '../../data/level07.json';
import l8 from '../../data/level08.json';
import l9 from '../../data/level09.json';
import l10 from '../../data/level10.json';
import type { LevelData } from '../types';

const raw: Record<number, unknown> = { 1: l1, 2: l2, 3: l3, 4: l4, 5: l5, 6: l6, 7: l7, 8: l8, 9: l9, 10: l10 };

export const LEVEL_ERRORS: string[] = [];
export const LEVELS: Record<number, LevelData> = {} as any;

function isValidLevelData(obj: unknown, expectedId: number): obj is LevelData {
  if (typeof obj !== 'object' || obj === null) return false;
  const o = obj as Record<string, unknown>;

  if (o.id !== expectedId) return false;
  if (typeof o.title !== 'string' || o.title.length === 0) return false;
  if (typeof o.phonics !== 'string') return false;
  if (typeof o.lesson !== 'string') return false;
  if (typeof o.hp !== 'number' || o.hp <= 0) return false;

  if (expectedId === 10) {
    if (!Array.isArray(o.sentences) || o.sentences.length === 0) return false;
  } else {
    const hasNew = Array.isArray(o.new) && o.new.length > 0;
    const hasTrick = Array.isArray(o.trick) && o.trick.length > 0;
    if (!hasNew && !hasTrick) return false;
  }
  return true;
}

function fallbackLevel(id: number): LevelData {
  return {
    id,
    title: `Invalid level ${id}`,
    phonics: '',
    lesson: 'Level data is invalid. Please check JSON files.',
    hp: 1,
    new: ['error'],
    trick: []
  };
}

for (let i = 1; i <= 10; i++) {
  const d = raw[i];
  if (isValidLevelData(d, i)) {
    LEVELS[i] = d as LevelData;
  } else {
    LEVEL_ERRORS.push(`Invalid level data for level ${i}`);
    LEVELS[i] = fallbackLevel(i);
  }
}
### src/validate.ts
ts
import { LEVELS, LEVEL_ERRORS } from './data/levels';

export function validateLevels(): boolean {
  let ok = LEVEL_ERRORS.length === 0;
  if (!ok) console.error('[LEVELS] Errors:', LEVEL_ERRORS);

  const newLocations = new Map<string, number[]>();
  const uniqueTargets = new Set<string>();

  for (let i = 1; i <= 9; i++) {
    const L = LEVELS[i];
    const targets = [...(L.new ?? []), ...(L.trick ?? [])];
    if (targets.length === 0) { console.error(`[LEVELS] Level ${i} has no targets.`); ok = false; }

    for (const w of (L.new ?? [])) {
      uniqueTargets.add(w);
      const locs = newLocations.get(w) ?? [];
      locs.push(i);
      newLocations.set(w, locs);
    }

    if (typeof L.hp === 'number') {
      const expected = new Set(targets).size;
      if (L.hp !== expected) {
        console.warn(`[LEVELS] Level ${i} hp=${L.hp} but unique targets=${expected}. (Runtime uses unique targets.)`);
      }
    }
  }

  for (const [word, levels] of newLocations.entries()) {
    if (levels.length > 1) {
      console.warn(`[LEVELS] Word "${word}" appears in new[] of levels: ${levels.join(', ')}`);
    }
  }

  console.log(`[LEVELS] Unique new[] words across levels 1–9: ${uniqueTargets.size}`);

  const L10 = LEVELS[10];
  if (!Array.isArray(L10.sentences) || L10.sentences.length < L10.hp) {
    console.error('[LEVELS] Level 10 must have sentences.length >= hp.');
    ok = false;
  }

  return ok;
}
--- ## 10.4 Scenes ### src/scenes/BootScene.ts
ts
import Phaser from 'phaser';
import { loadProfile } from '../storage';
import { validateLevels } from '../validate';
import { ensureAnimations } from '../anims';
import { initAtlasFrames, hasAtlasFrame, sampleAtlasFrames } from '../atlasUtil';

export default class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    const w = this.cameras.main.width;
    const h = this.cameras.main.height;

    const progressBox = this.add.graphics();
    progressBox.fillStyle(0x222222, 0.8);
    progressBox.fillRect(w / 2 - 160, h / 2 - 25, 320, 50);

    const progressBar = this.add.graphics();

    const loadingText = this.add.text(w / 2, h / 2 - 55, 'Loading…', {
      fontSize: '20px', color: '#ffffff', fontFamily: 'sans-serif'
    }).setOrigin(0.5);

    const percentText = this.add.text(w / 2, h / 2, '0%', {
      fontSize: '18px', color: '#ffffff', fontFamily: 'sans-serif'
    }).setOrigin(0.5);

    const loadErrors: string[] = [];

    this.load.on('loaderror', (fileObj: Phaser.Loader.File) => {
      console.error(`Failed to load: ${fileObj.key} from ${fileObj.url}`);
      loadErrors.push(fileObj.key);
    });

    this.load.on('progress', (value: number) => {
      progressBar.clear();
      progressBar.fillStyle(0x00E676, 1);
      progressBar.fillRect(w / 2 - 150, h / 2 - 15, 300 * value, 30);
      percentText.setText(`${Math.round(value * 100)}%`);
    });

    this.load.on('complete', () => {
      progressBar.destroy();
      progressBox.destroy();
      loadingText.destroy();
      percentText.destroy();
      if (loadErrors.length) this.registry.set('loadErrors', loadErrors);
    });

    const bg = (file: string) => new URL(`../../assets/backgrounds/${file}`, import.meta.url).toString();
    const au = (file: string) => new URL(`../../assets/audio/${file}`, import.meta.url).toString();

    this.load.atlas(
      'atlas',
      new URL('../../assets/atlas.png', import.meta.url).toString(),
      new URL('../../assets/atlas.json', import.meta.url).toString()
    );

    this.load.image('bg1', bg('bg1_kitchen.png'));
    this.load.image('bg2', bg('bg2_alley.png'));
    this.load.image('bg3', bg('bg3_campsite.png'));
    this.load.image('bg4', bg('bg4_home_stove.png'));
    this.load.image('bg5', bg('bg5_parkinglot.png'));
    this.load.image('bg6', bg('bg6_backyard_bbq.png'));
    this.load.image('bg7', bg('bg7_forest.png'));
    this.load.image('bg8', bg('bg8_warehouse.png'));
    this.load.image('bg9', bg('bg9_office.png'));
    this.load.image('bg10', bg('bg10_castle.png'));

    this.load.audio('bgm', [au('bgm.mp3'), au('bgm.ogg')]);
    this.load.audio('spray', au('spray.wav'));
    this.load.audio('hit', au('hit.wav'));
    this.load.audio('fail', au('fail.wav'));
    this.load.audio('victory', au('victory.wav'));
  }

  create() {
    const loadErrors = this.registry.get('loadErrors') as string[] | undefined;
    if (loadErrors?.length) {
      this.add.text(480, 200, '⚠️ Failed to load game assets', {
        fontSize: '28px', color: '#FF4444', fontFamily: 'sans-serif'
      }).setOrigin(0.5);

      this.add.text(480, 270, `Missing: ${loadErrors.join(', ')}`, {
        fontSize: '18px', color: '#AAAAAA', fontFamily: 'sans-serif',
        wordWrap: { width: 700 }, align: 'center'
      }).setOrigin(0.5);

      this.add.text(480, 350, 'Please refresh or check your build/assets.', {
        fontSize: '20px', color: '#FFFFFF', fontFamily: 'sans-serif'
      }).setOrigin(0.5);
      return;
    }

    const levelsOk = validateLevels();
    if (!levelsOk) {
      this.add.text(480, 240, '⚠️ Level data validation failed', {
        fontSize: '26px', color: '#FF4444', align: 'center', fontFamily: 'sans-serif'
      }).setOrigin(0.5);
      this.add.text(480, 310, 'Check console for details.', {
        fontSize: '18px', color: '#FFFFFF', fontFamily: 'sans-serif'
      }).setOrigin(0.5);
      return;
    }

    const tex = this.textures.get('atlas');
    initAtlasFrames(tex);

    const required = ['kid_idle_0', 'water', 'boss_kitchen_0'];
    const missing = required.filter(b => !hasAtlasFrame(b));
    if (missing.length) {
      this.add.text(480, 210, '⚠️ Atlas frames missing', {
        fontSize: '26px', color: '#FF4444', fontFamily: 'sans-serif'
      }).setOrigin(0.5);
      this.add.text(480, 270, `Missing: ${missing.join(', ')}`, {
        fontSize: '18px', color: '#AAAAAA', fontFamily: 'sans-serif',
        wordWrap: { width: 720 }, align: 'center'
      }).setOrigin(0.5);
      this.add.text(480, 350, `Example frames found: ${sampleAtlasFrames(8).join(', ')}`, {
        fontSize: '14px', color: '#AAAAAA', fontFamily: 'sans-serif',
        wordWrap: { width: 820 }, align: 'center'
      }).setOrigin(0.5);
      return;
    }

    try {
      ensureAnimations(this.anims, tex);
    } catch (e) {
      console.error(e);
      this.add.text(480, 270, '⚠️ Failed to create animations.\nCheck atlas naming.', {
        fontSize: '22px', color: '#FF4444', align: 'center', fontFamily: 'sans-serif'
      }).setOrigin(0.5);
      return;
    }

    loadProfile().then(profile => {
      this.sound.mute = profile.muted;
      document.body.classList.toggle('contrast-high', profile.contrastHigh);
    }).finally(() => {
      this.scene.start('Menu');
    });
  }
}
### src/scenes/MenuScene.ts
ts
import Phaser from 'phaser';
import { loadProfile, isStorageAvailable } from '../storage';
import { ensureBgm } from '../audio';

export default class MenuScene extends Phaser.Scene {
  constructor() { super('Menu'); }

  create() {
    const unlockAudio = () => ensureBgm(this);

    this.input.once('pointerdown', unlockAudio);
    this.input.keyboard?.once('keydown', unlockAudio);

    const touchUnlock = () => unlockAudio();
    this.game.canvas.addEventListener('touchstart', touchUnlock, { once: true, passive: true });
    this.events.once('shutdown', () => {
      this.game.canvas.removeEventListener('touchstart', touchUnlock);
    });

    this.add.text(480, 90, '🔥 Fire‑Reader', { fontSize: '46px', color: '#FFD700', fontFamily: 'sans-serif' })
      .setOrigin(0.5);

    const loading = this.add.text(480, 270, 'Loading…', { fontSize: '22px', color: '#AAAAAA' }).setOrigin(0.5);
    void this.buildMenu(loading);
  }

  private async buildMenu(loadingText: Phaser.GameObjects.Text) {
    const profile = await loadProfile();
    loadingText.destroy();

    if (!isStorageAvailable() && !this.registry.get('storageWarningShown')) {
      this.registry.set('storageWarningShown', true);
      const warning = this.add.text(480, 520, '⚠️ Private/blocked storage: progress will not save', {
        fontSize: '14px', color: '#FFAA00', fontFamily: 'sans-serif'
      }).setOrigin(0.5);

      this.time.delayedCall(5000, () => {
        this.tweens.add({
          targets: warning,
          alpha: 0,
          duration: 900,
          onComplete: () => warning.destroy()
        });
      });
    }

    for (let i = 1; i <= 10; i++) {
      const y = 155 + i * 32;
      const unlocked = i <= profile.unlockedLevel;

      const label = this.add.text(480, y, `Level ${i}`, {
        fontSize: '24px',
        color: unlocked ? '#00E676' : '#777777',
        fontFamily: 'sans-serif'
      }).setOrigin(0.5);

      if (unlocked) label.setInteractive({ useHandCursor: true });
      else label.setAlpha(0.4);

      label.on('pointerup', () => {
        if (!unlocked) return;
        this.scene.start('Lesson', { levelNum: i });
      });
    }

    const gear = this.add.text(880, 505, '⚙ Settings', { fontSize: '18px', color: '#FFFFFF' })
      .setInteractive({ useHandCursor: true });

    gear.on('pointerup', () => {
      if (!this.scene.isActive('Settings')) this.scene.launch('Settings');
    });
  }
}
### src/scenes/LessonScene.ts
ts
import Phaser from 'phaser';
import { LEVELS } from '../data/levels';
import { ensureBgm } from '../audio';
import type { LevelData } from '../types';

export default class LessonScene extends Phaser.Scene {
  private escHandler?: () => void;

  constructor() { super('Lesson'); }

  init(data: { levelNum: number }) {
    this.registry.set('nextLevel', data.levelNum);
  }

  create() {
    const unlockAudio = () => ensureBgm(this);
    this.input.once('pointerdown', unlockAudio);
    this.input.keyboard?.once('keydown', unlockAudio);

    const levelNum = this.registry.get('nextLevel') as number;
    const L = LEVELS[levelNum] as LevelData;

    this.add.rectangle(0, 0, 960, 540, 0x000000, 0.72).setOrigin(0);

    this.add.text(480, 70, `Level ${levelNum}: ${L.title}`, {
      fontSize: '34px', color: '#FFD700', fontFamily: 'sans-serif'
    }).setOrigin(0.5);

    this.add.text(160, 130, L.lesson, {
      fontSize: '26px', color: '#FFFFFF', wordWrap: { width: 640 }
    });

    const start = this.add.text(480, 465, 'Start Level ▶', {
      fontSize: '32px', color: '#00E676', backgroundColor: '#222',
      padding: { left: 22, right: 22, top: 8, bottom: 8 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    start.on('pointerup', () => this.scene.start('Game'));

    this.add.text(20, 510, 'Esc: back to menu', { fontSize: '16px', color: '#AAAAAA' });

    this.escHandler = () => this.scene.start('Menu');
    this.input.keyboard?.on('keydown-ESC', this.escHandler);

    this.events.once('shutdown', () => {
      if (this.escHandler) this.input.keyboard?.off('keydown-ESC', this.escHandler);
    });
  }
}
### src/scenes/GameScene.ts
ts
import Phaser from 'phaser';
import { LEVELS } from '../data/levels';
import type { LevelData, SaveData } from '../types';
import { Scheduler, type Rating, applyRating } from '../spacedRepetition';
import { loadProfile, debouncedSaveProfile, flushSaveProfile, saveProfile } from '../storage';
import { LEVEL_BGS, LEVEL_BOSS_ANIMS } from '../visuals';
import { atlasFrame } from '../atlasUtil';
import SentenceCard from '../ui/SentenceCard';
import { GAME_CONSTANTS } from '../constants';

export default class GameScene extends Phaser.Scene {
  constructor() { super('Game'); }

  private profile!: SaveData;
  private levelNum!: number;
  private levelData!: LevelData;

  private scheduler?: Scheduler;
  private currentId: string | null = null;

  private bossTargets = new Set<string>();
  private bossCleared = new Set<string>();
  private bossHP = 0;
  private maxHP = 0;

  private mistakes = 0;
  private winInProgress = false;
  private grading = false;

  private hpBarBack!: Phaser.GameObjects.Rectangle;
  private hpBar!: Phaser.GameObjects.Rectangle;

  private kid!: Phaser.GameObjects.Sprite;
  private boss!: Phaser.GameObjects.Sprite;
  private wordText!: Phaser.GameObjects.Text;

  private sentenceCard?: SentenceCard;
  private sentenceOrder: number[] = [];
  private sentenceIndex = 0;

  private onE = () => void this.grade('easy');
  private onH = () => void this.grade('hard');
  private onF = () => void this.grade('fail');

  create() {
    this.add.text(480, 270, 'Loading…', { fontSize: '24px', color: '#AAAAAA' }).setOrigin(0.5);
    void this.initAsync();
  }

  private async initAsync() {
    this.children.removeAll(true);

    this.mistakes = 0;
    this.bossHP = 0;
    this.maxHP = 0;
    this.winInProgress = false;
    this.grading = false;
    this.bossTargets = new Set();
    this.bossCleared = new Set();
    this.currentId = null;
    this.scheduler = undefined;
    this.sentenceCard = undefined;
    this.sentenceOrder = [];
    this.sentenceIndex = 0;

    this.profile = await loadProfile();
    this.levelNum = (this.registry.get('nextLevel') as number) ?? 1;
    this.levelData = LEVELS[this.levelNum];

    const bgKey = LEVEL_BGS[this.levelNum] ?? 'bg1';
    const bg = this.add.image(480, 270, bgKey);
    bg.setDisplaySize(960, 540);

    this.add.text(20, 16, `Level ${this.levelNum}: ${this.levelData.title}`, {
      fontSize: '18px', color: '#FFFFFF', fontFamily: 'sans-serif'
    });
    this.add.text(20, 38, this.levelData.phonics, {
      fontSize: '16px', color: '#FFD700', fontFamily: 'sans-serif'
    });

    this.hpBarBack = this.add.rectangle(480, 26, 320, 14, 0x333333).setOrigin(0.5);
    this.hpBar = this.add.rectangle(480 - 160, 26, 320, 14, 0xff4444).setOrigin(0, 0.5);

    this.kid = this.add.sprite(180, 380, 'atlas', atlasFrame('kid_idle_0')).play('kid_idle');
    this.kid.setScale(1.0);

    const bossAnim = LEVEL_BOSS_ANIMS[this.levelNum] ?? 'boss_kitchen';
    this.boss = this.add.sprite(780, 310, 'atlas', atlasFrame(`${bossAnim}_0`)).play(bossAnim);
    this.boss.setScale(this.levelNum === 10 ? 1.15 : 1.0);

    this.wordText = this.add.text(480, 220, '', {
      fontFamily: 'sans-serif', fontSize: '72px', color: '#F5F5F5'
    }).setOrigin(0.5);

    const y = 470;
    this.makeButton(250, y, 'Easy (E)', () => void this.grade('easy'));
    this.makeButton(480, y, 'Hard (H)', () => void this.grade('hard'));
    this.makeButton(710, y, 'Try again (F)', () => void this.grade('fail'));

    this.input.keyboard?.on('keydown-E', this.onE);
    this.input.keyboard?.on('keydown-H', this.onH);
    this.input.keyboard?.on('keydown-F', this.onF);

    this.events.once('shutdown', () => {
      this.input.keyboard?.off('keydown-E', this.onE);
      this.input.keyboard?.off('keydown-H', this.onH);
      this.input.keyboard?.off('keydown-F', this.onF);
      void flushSaveProfile();
    });

    if (this.levelNum === 10) this.initSentenceMode();
    else this.initWordMode();

    this.renderHUD();
  }

  private initWordMode() {
    const rawTargets = [...(this.levelData.new ?? []), ...(this.levelData.trick ?? [])];
    const targets = Array.from(new Set(rawTargets));

    this.bossTargets = new Set(targets);
    this.bossCleared = new Set();
    this.maxHP = this.bossHP = targets.length;

    const review = this.selectReviewWords(GAME_CONSTANTS.REVIEW_WORDS_LIMIT, this.bossTargets);
    const deck = this.buildInterleavedDeck(targets, review);

    this.scheduler = new Scheduler(deck, this.profile.words);
    this.currentId = this.scheduler.next();
    this.setWordText(this.currentId ?? '');
  }

  private initSentenceMode() {
    const sentences = this.levelData.sentences ?? [];
    const hp = Math.min(this.levelData.hp, sentences.length);

    this.maxHP = this.bossHP = hp;

    const indices = Array.from({ length: sentences.length }, (_, i) => i);
    this.sentenceOrder = shuffle(indices).slice(0, hp);
    this.sentenceIndex = 0;

    this.sentenceCard = new SentenceCard(this, sentences[this.sentenceOrder[0]]);
    this.wordText.setText('');
    this.wordText.setAlpha(0);
  }

  private selectReviewWords(limit: number, exclude: Set<string>): string[] {
    const now = Date.now();
    const due = Object.entries(this.profile.words)
      .filter(([w, s]) => !exclude.has(w) && (s.due ?? 0) <= now)
      .sort((a, b) => (a[1].due ?? 0) - (b[1].due ?? 0))
      .slice(0, limit)
      .map(([w]) => w);

    if (due.length >= limit) return due;

    const pool = Object.keys(this.profile.words).filter(w => !exclude.has(w) && !due.includes(w));
    const fill = shuffle(pool).slice(0, limit - due.length);
    return [...due, ...fill];
  }

  private buildInterleavedDeck(targets: string[], review: string[]): string[] {
    const t = shuffle(targets);
    const r = shuffle(review);
    const out: string[] = [];
    let ti = 0, ri = 0;

    while (ti < t.length || ri < r.length) {
      const batch = Math.min(3 + Math.floor(Math.random() * 2), t.length - ti);
      for (let i = 0; i < batch && ti < t.length; i++) out.push(t[ti++]);
      if (ri < r.length) out.push(r[ri++]);
    }
    return out;
  }

  private makeButton(x: number, y: number, label: string, cb: () => void) {
    const btn = this.add.text(x, y, label, {
      backgroundColor: '#222',
      color: '#FFFFFF',
      padding: { left: 16, right: 16, top: 8, bottom: 8 },
      fontSize: '22px'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    let pressed = false;

    btn.on('pointerdown', () => {
      pressed = true;
      btn.setScale(0.92);
      btn.setBackgroundColor('#444');
    });

    btn.on('pointerup', () => {
      if (!pressed) return;
      pressed = false;
      btn.setScale(1);
      btn.setBackgroundColor('#222');
      cb();
    });

    btn.on('pointerout', () => {
      pressed = false;
      btn.setScale(1);
      btn.setBackgroundColor('#222');
    });
  }

  private setWordText(word: string) {
    const cleaned = word ?? '';
    const len = Math.max(1, cleaned.length);
    this.wordText.setAlpha(1);
    this.wordText.setFontSize(Math.max(44, Math.min(72, Math.floor(92 - len * 4))));
    this.wordText.setText(cleaned);
  }

  private renderHUD() {
    const frac = this.maxHP > 0 ? this.bossHP / this.maxHP : 1;
    this.hpBar.width = 320 * Phaser.Math.Clamp(frac, 0, 1);
    this.hpBar.x = 480 - 160;
  }

  private spray(r: Rating) {
    this.sound.play('spray');

    const water = this.add.image(this.kid.x + 40, this.kid.y - 40, 'atlas', atlasFrame('water'));
    water.setScale(2.5);

    if (r === 'fail') {
      water.setTint(0x888888);
      this.tweens.add({
        targets: water,
        x: this.boss.x - 120,
        y: this.boss.y + 40,
        alpha: 0,
        duration: 280,
        onComplete: () => water.destroy()
      });
      return;
    }

    if (r === 'hard') water.setTint(0xffcc66);
    if (r === 'easy') water.setTint(0x66ccff);

    this.tweens.add({
      targets: water,
      x: this.boss.x - 40,
      y: this.boss.y - 20,
      duration: 280,
      onComplete: () => {
        water.destroy();
        if (r === 'easy') {
          this.boss.setTintFill(0xffffff);
          this.time.delayedCall(80, () => this.boss.clearTint());
        }
      }
    });
  }

  private async grade(r: Rating) {
    if (this.winInProgress || this.grading) return;

    this.grading = true;
    try {
      this.spray(r);

      if (this.levelNum === 10 && this.sentenceCard) {
        await this.gradeSentence(r);
        return;
      }
      await this.gradeWord(r);
    } finally {
      this.grading = false;
    }
  }

  private async gradeWord(r: Rating) {
    if (!this.scheduler || !this.currentId) return;

    this.scheduler.grade(this.currentId, r);
    debouncedSaveProfile(this.profile);

    if (r === 'fail') {
      this.sound.play('fail');
      if (++this.mistakes >= GAME_CONSTANTS.MAX_FAILS_PER_LEVEL) return this.restartLevel();
    }

    if (r === 'easy') {
      this.sound.play('hit');
      if (this.bossTargets.has(this.currentId) && !this.bossCleared.has(this.currentId)) {
        this.bossCleared.add(this.currentId);
        this.bossHP--;
        this.renderHUD();
      }
      if (this.bossHP <= 0) {
        await this.win();
        return;
      }
    }

    this.currentId = this.scheduler.next();
    if (!this.currentId) {
      if (this.bossHP <= 0) await this.win();
      else this.restartLevel();
      return;
    }
    this.setWordText(this.currentId);
  }

  private async gradeSentence(r: Rating) {
    const token = this.sentenceCard!.currentWord();
    if (token) {
      const key = normalizeWord(token);
      if (key) {
        this.profile.words[key] = applyRating(this.profile.words[key], r);
        debouncedSaveProfile(this.profile);
      }
    }

    if (r === 'fail') {
      this.sound.play('fail');
      if (++this.mistakes >= GAME_CONSTANTS.MAX_FAILS_PER_LEVEL) return this.restartLevel();
      this.sentenceCard!.resetCurrent();
      return;
    }

    const hasMore = this.sentenceCard!.advance();
    if (hasMore) return;

    if (r === 'easy') {
      this.sound.play('hit');
      this.bossHP--;
      this.renderHUD();
      if (this.bossHP <= 0) {
        await this.win();
        return;
      }
    }

    this.sentenceIndex++;
    if (this.sentenceIndex >= this.sentenceOrder.length) {
      this.sentenceIndex = 0;
      this.sentenceOrder = shuffle(this.sentenceOrder);
    }

    const idx = this.sentenceOrder[this.sentenceIndex];
    this.sentenceCard!.reset(this.levelData.sentences![idx]);
  }

  private restartLevel() {
    this.winInProgress = true; // lock input
    this.add.rectangle(0, 0, 960, 540, 0x000000, 0x000000, 0.55).setOrigin(0);
    this.add.text(480, 270, "Let's try that fire again!", {
      fontSize: '32px', color: '#FFD700', fontFamily: 'sans-serif'
    }).setOrigin(0.5);

    this.time.delayedCall(900, () => this.scene.restart());
  }

  private async win() {
    if (this.winInProgress) return;
    this.winInProgress = true;

    if (this.levelNum === this.profile.unlockedLevel && this.levelNum < 10) {
      this.profile.unlockedLevel++;
    }

    await flushSaveProfile();
    await saveProfile(this.profile);

    this.registry.set('lastLevelCleared', this.levelNum);
    this.sound.play('victory');

    this.time.delayedCall(50, () => {
      this.winInProgress = false;
      this.scene.start('Result');
    });
  }
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function normalizeWord(token: string): string {
  return token.toLowerCase().replace(/[^\p{L}]/gu, '');
}
### src/scenes/ResultScene.ts
ts
import Phaser from 'phaser';

const GEAR_TEXT: Record<number, string> = {
  1: 'Unlocked: Kid helmet sticker',
  2: 'Unlocked: Stronger hose nozzle',
  3: 'Unlocked: Boots upgrade',
  4: 'Unlocked: Water tank upgrade',
  5: 'Unlocked: Fire truck badge',
  6: 'Unlocked: Super soaker mode',
  7: 'Unlocked: Heat shield',
  8: 'Unlocked: Rescue rope',
  9: 'Unlocked: Chief hat',
  10: 'Unlocked: Dragon medal'
};

export default class ResultScene extends Phaser.Scene {
  constructor() { super('Result'); }

  create() {
    const last = (this.registry.get('lastLevelCleared') as number) ?? 1;

    this.add.rectangle(0, 0, 960, 540, 0x000000, 0.65).setOrigin(0);

    this.add.text(480, 200, 'Level Clear!', {
      fontSize: '54px', color: '#00E676', fontFamily: 'sans-serif'
    }).setOrigin(0.5);

    this.add.text(480, 270, GEAR_TEXT[last] ?? 'Great job!', {
      fontSize: '24px', color: '#FFD700', fontFamily: 'sans-serif'
    }).setOrigin(0.5);

    const back = this.add.text(480, 390, 'Back to menu', {
      fontSize: '34px', color: '#FFFFFF', backgroundColor: '#222',
      padding: { left: 18, right: 18, top: 8, bottom: 8 }
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    back.on('pointerup', () => this.scene.start('Menu'));
  }
}
--- ## 10.5 UI overlays ### src/ui/SentenceCard.ts
ts
import Phaser from 'phaser';

export default class SentenceCard extends Phaser.GameObjects.Container {
  private tokens: string[] = [];
  private texts: Phaser.GameObjects.Text[] = [];
  private index = 0;

  constructor(scene: Phaser.Scene, sentence: string) {
    super(scene, 480, 220);
    scene.add.existing(this);
    this.reset(sentence);
  }

  reset(sentence: string) {
    this.removeAll(true);
    this.tokens = sentence.split(' ');
    this.texts = [];
    this.index = 0;

    const fontSize = Math.max(26, Math.min(44, Math.floor(840 / Math.max(4, this.tokens.length))));
    const gap = 14;

    const temp: Phaser.GameObjects.Text[] = [];
    let totalWidth = 0;

    for (const token of this.tokens) {
      const t = this.scene.add.text(0, 0, token, {
        fontSize: `${fontSize}px`,
        color: '#FFFFFF',
        fontFamily: 'sans-serif'
      });
      temp.push(t);
      totalWidth += t.width;
    }
    totalWidth += gap * (temp.length - 1);

    let x = -totalWidth / 2;
    temp.forEach((t, i) => {
      t.setPosition(x, 0);
      t.setAlpha(i === 0 ? 1 : 0.35);
      this.add(t);
      this.texts.push(t);
      x += t.width + gap;
    });
  }

  resetCurrent() {
    this.index = 0;
    for (let i = 0; i < this.texts.length; i++) {
      this.texts[i].setAlpha(i === 0 ? 1 : 0.35);
    }
  }

  currentWord(): string | null {
    return this.tokens[this.index] ?? null;
  }

  advance(): boolean {
    if (this.index < this.texts.length) this.texts[this.index].setAlpha(1);
    this.index++;

    if (this.index >= this.texts.length) return false;

    for (let i = 0; i < this.texts.length; i++) {
      if (i < this.index) this.texts[i].setAlpha(1);
      else if (i === this.index) this.texts[i].setAlpha(1);
      else this.texts[i].setAlpha(0.35);
    }
    return true;
  }
}
### src/ui/SettingsModal.ts
ts
import Phaser from 'phaser';
import { loadProfile, saveProfile } from '../storage';
import { ensureBgm, setBgmMute } from '../audio';

const BTN_STYLE = {
  fontSize: '22px',
  color: '#FFFFFF',
  backgroundColor: '#333',
  padding: { left: 16, right: 16, top: 8, bottom: 8 }
};

export default class SettingsModal extends Phaser.Scene {
  private escHandler?: () => void;

  constructor() { super({ key: 'Settings', active: false }); }

  create() {
    const blocker = this.add.rectangle(480, 270, 960, 540, 0x000000, 0.6).setOrigin(0.5);
    blocker.setInteractive();

    this.add.rectangle(480, 270, 460, 360, 0x000000, 0.92).setOrigin(0.5);
    this.add.text(480, 120, 'Settings', { fontSize: '28px', color: '#FFD700', fontFamily: 'sans-serif' }).setOrigin(0.5);

    void this.initAsync();
  }

  private async initAsync() {
    const profile = await loadProfile();

    const musicBtn = this.add.text(480, 200, `Music: ${profile.muted ? 'Off' : 'On'}`, BTN_STYLE)
      .setOrigin(0.5).setInteractive({ useHandCursor: true });

    musicBtn.on('pointerup', async () => {
      profile.muted = !profile.muted;
      this.sound.mute = profile.muted;
      setBgmMute(profile.muted);
      musicBtn.setText(`Music: ${profile.muted ? 'Off' : 'On'}`);
      await saveProfile(profile);
      if (!profile.muted) ensureBgm(this);
    });

    const contrastBtn = this.add.text(480, 250, `Contrast: ${profile.contrastHigh ? 'High' : 'Normal'}`, BTN_STYLE)
      .setOrigin(0.5).setInteractive({ useHandCursor: true });

    contrastBtn.on('pointerup', async () => {
      profile.contrastHigh = !profile.contrastHigh;
      document.body.classList.toggle('contrast-high', profile.contrastHigh);
      contrastBtn.setText(`Contrast: ${profile.contrastHigh ? 'High' : 'Normal'}`);
      await saveProfile(profile);
    });

    const progressBtn = this.add.text(480, 300, 'View progress', BTN_STYLE)
      .setOrigin(0.5).setInteractive({ useHandCursor: true });

    progressBtn.on('pointerup', () => {
      if (!this.scene.isActive('ParentDashboard')) this.scene.launch('ParentDashboard');
    });

    const resetBtn = this.add.text(480, 350, 'Reset progress', BTN_STYLE)
      .setOrigin(0.5).setInteractive({ useHandCursor: true });

    resetBtn.on('pointerup', () => {
      const overlay = this.add.rectangle(480, 270, 960, 540, 0x000000, 0.7).setOrigin(0.5);
      overlay.setInteractive();

      const dialog = this.add.rectangle(480, 270, 380, 160, 0x222222).setOrigin(0.5);
      dialog.setStrokeStyle(2, 0x666666);

      const confirmText = this.add.text(480, 230, 'Reset all progress?', {
        fontSize: '22px', color: '#FF6666', fontFamily: 'sans-serif'
      }).setOrigin(0.5);

      const subText = this.add.text(480, 260, 'This cannot be undone.', {
        fontSize: '16px', color: '#AAAAAA', fontFamily: 'sans-serif'
      }).setOrigin(0.5);

      const yesBtn = this.add.text(400, 310, 'Reset', { ...BTN_STYLE, backgroundColor: '#662222' })
        .setOrigin(0.5).setInteractive({ useHandCursor: true });

      const noBtn = this.add.text(560, 310, 'Cancel', BTN_STYLE)
        .setOrigin(0.5).setInteractive({ useHandCursor: true });

      const cleanup = () => {
        overlay.destroy(); dialog.destroy(); confirmText.destroy(); subText.destroy(); yesBtn.destroy(); noBtn.destroy();
      };

      yesBtn.on('pointerup', async () => {
        cleanup();
        profile.unlockedLevel = 1;
        profile.words = {};
        await saveProfile(profile);
        this.scene.stop();
        this.scene.get('Menu').scene.restart();
      });

      noBtn.on('pointerup', cleanup);
    });

    const closeBtn = this.add.text(480, 405, 'Close (Esc)', BTN_STYLE)
      .setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on('pointerup', () => this.scene.stop());

    this.escHandler = () => this.scene.stop();
    this.input.keyboard?.on('keydown-ESC', this.escHandler);

    this.events.once('shutdown', () => {
      if (this.escHandler) this.input.keyboard?.off('keydown-ESC', this.escHandler);
    });
  }
}
### src/ui/ParentDashboard.ts
ts
import Phaser from 'phaser';
import { loadProfile } from '../storage';

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export default class ParentDashboard extends Phaser.Scene {
  private domElement?: Phaser.GameObjects.DOMElement;
  private escHandler?: () => void;

  constructor() { super('ParentDashboard'); }

  create() {
    void this.initAsync();
  }

  private async initAsync() {
    const { words } = await loadProfile();

    const rows = Object.entries(words).map(([word, st]) => ({
      word,
      interval: (st.interval ?? 0).toFixed(1),
      ease: (st.ease ?? 1.3).toFixed(2),
      successes: st.successes ?? 0
    })).sort((a, b) => b.successes - a.successes);

    const csv = ['word,interval_hours,ease,successes']
      .concat(rows.map(r => `${r.word},${r.interval},${r.ease},${r.successes}`))
      .join('\n');

    const html = `
      <style>
        .panel{width:520px;background:#111;color:#fff;border:1px solid #444;padding:10px;font-family:sans-serif}
        table{width:100%;border-collapse:collapse;font-size:13px}
        th,td{border:1px solid #333;padding:4px 6px}
        th{background:#222}
        tbody tr:nth-child(even){background:#181818}
        .wrap{max-height:260px;overflow:auto;margin-top:8px}
        button{margin-top:10px;margin-right:8px}
      </style>
      <div class="panel">
        <div><b>Word mastery (local only)</b></div>
        <div class="wrap">
          <table>
            <thead><tr><th>Word</th><th>Interval (h)</th><th>Ease</th><th>✔</th></tr></thead>
            <tbody>
              ${rows.map(r => `<tr>
                <td>${escapeHtml(r.word)}</td><td>${r.interval}</td><td>${r.ease}</td><td>${r.successes}</td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        <button id="copy">Copy CSV</button>
        <button id="close">Close</button>
      </div>
    `;

    this.domElement = this.add.dom(480, 270).createFromHTML(html);
    this.domElement.addListener('click');

    this.domElement.on('click', (e: any) => {
      const t = e.target as HTMLElement;
      if (t.id === 'close') this.scene.stop();
      if (t.id === 'copy') navigator.clipboard?.writeText(csv);
    });

    this.escHandler = () => this.scene.stop();
    this.input.keyboard?.on('keydown-ESC', this.escHandler);

    this.events.once('shutdown', () => {
      if (this.escHandler) this.input.keyboard?.off('keydown-ESC', this.escHandler);
      this.domElement?.destroy();
      this.domElement = undefined;
    });
  }
}
--- ## 10.6 Level data (JSON) ### data/level01.json
json
{
  "id": 1,
  "title": "Kitchen Fire",
  "phonics": "Short /a/ in CVC words",
  "lesson": "Today we will practice words with the short ‘a’ sound — a-a-a like in ‘apple’. Many words use the same pattern: one letter, then ‘a’, then one letter. If you can read ‘cat’, you can read ‘bat’ and ‘hat’. Let’s spray water each time we read it right!",
  "hp": 50,
  "new": [
    "cat","bat","mat","sat","hat","rat","pat","man","fan","pan",
    "can","ran","tan","cap","map","tap","nap","lap","gap","bag",
    "rag","tag","wag","jam","ham","dam","bad","dad","sad","mad",
    "pad","had","gas","wax","max","van","cab","lad","pal","ram"
  ],
  "trick": ["the","a","I","and","to","you","is","my","we","go"]
}
### data/level02.json
json
{
  "id": 2,
  "title": "Trash‑Can Fire",
  "phonics": "Short /i/ in CVC words",
  "lesson": "Now we listen for short ‘i’ — i-i-i like in ‘igloo’. The pattern is letter + i + letter. Read ‘sit’. Change the first letter and you can read ‘hit’, ‘fit’, and ‘kit’. Let’s put out this fire with i‑words!",
  "hp": 50,
  "new": [
    "sit","hit","fit","kit","bit","lit","pit","sip","tip","zip",
    "pig","dig","wig","big","fig","rig","fin","pin","win","tin",
    "bin","lip","rip","dip","hip","him","his","kid","lid","rid",
    "did","mix","fix","six","bib","rib","jib","dim","rim","gig"
  ],
  "trick": ["was","of","for","me","he","she","be","do","no","so"]
}
### data/level03.json
json
{
  "id": 3,
  "title": "Campfire",
  "phonics": "Short /o/ in CVC words",
  "lesson": "This level is short ‘o’ — o-o-o like in ‘octopus’. The pattern is letter + o + letter. ‘Dog’ and ‘log’ both have the same middle sound. Let’s cool down the campfire with o‑words!",
  "hp": 50,
  "new": [
    "cot","dot","hot","pot","lot","not","rot","got","hop","mop",
    "pop","top","cop","sop","log","dog","fog","hog","jog","box",
    "fox","ox","rod","nod","pod","sod","mom","tom","job","rob",
    "sob","bob","bog","cob","lob","mob","jot","tot","con","don"
  ],
  "trick": ["said","are","one","two","three","four","five","here","there","where"]
}
### data/level04.json
json
{
  "id": 4,
  "title": "Stove Fire",
  "phonics": "Short /u/ in CVC words",
  "lesson": "Hear the short ‘u’ — u-u-u like in ‘umbrella’. The pattern is letter + u + letter. ‘Sun’, ‘fun’, and ‘run’ are a word family. Let’s practice u‑words and spray the flames!",
  "hp": 50,
  "new": [
    "sun","fun","bun","run","gun","nun","pup","cup","tub","rub",
    "bug","dug","hug","rug","mug","jug","tug","lug","cut","but",
    "hut","nut","bud","mud","dud","bus","fuss","hum","gum","sum",
    "sub","cub","hub","pug","rut","gut","pun","up","us","yum"
  ],
  "trick": ["come","some","done","gone","give","have","does","says","your","who"]
}
### data/level05.json
json
{
  "id": 5,
  "title": "Car Fire",
  "phonics": "Short /e/ in CVC and CVCC words",
  "lesson": "Short ‘e’ sounds like e-e-e in ‘elephant’. We can read many words with the same pattern. ‘Red’, ‘bed’, and ‘fed’ change only the first letter. Read carefully and the fire will go out!",
  "hp": 50,
  "new": [
    "set","get","let","met","net","pet","vet","wet","bet","yet",
    "bed","fed","red","led","hen","pen","ten","den","men","leg",
    "beg","peg","jet","gem","hem","web","wed","end","mess","less",
    "nest","rest","test","bell","tell","sell","well","fell","kept","next"
  ],
  "trick": ["they","this","that","with","when","where","why","from","again","friend"]
}
### data/level06.json
json
{
  "id": 6,
  "title": "Backyard BBQ",
  "phonics": "Initial blends: st‑, sp‑, sl‑, sn‑, sw‑",
  "lesson": "Blends are two consonants that slide together at the start. You still hear both sounds: s‑t in ‘stop’ and s‑p in ‘spin’. Let’s practice starting blends and keep the BBQ safe!",
  "hp": 50,
  "new": [
    "stop","step","stem","stab","stack","stiff","still","staff","stand","stamp",
    "stag","stun","stub","sting","spot","spit","spin","span","spat","spank",
    "spill","spell","sped","spud","spun","spilt","slip","slap","slam","sled",
    "slim","slug","slum","slop","slab","slot","snap","snip","snub","snug",
    "snob","sniff","snuff","snag","swim","swam","swap","swan","swig","swat"
  ],
  "trick": []
}
### data/level07.json
json
{
  "id": 7,
  "title": "Forest Floor Fire",
  "phonics": "Digraphs: sh, ch, th, wh, ck",
  "lesson": "A digraph is two letters that make one new sound. ‘sh’ is one sound, and ‘ch’ is one sound. We also use ‘th’, ‘wh’, and ‘ck’. These letter teams work together!",
  "hp": 50,
  "new": [
    "ship","shop","shut","dish","fish","wish","dash","cash","rash","mash",
    "push","rush","chip","chin","chat","chop","much","such","rich","chest",
    "chick","munch","lunch","pinch","thin","this","that","with","bath","math",
    "path","moth","both","then","them","what","when","which","wham","whip",
    "duck","luck","back","sack","pack","tick","sock","rock","lick","kick"
  ],
  "trick": []
}
### data/level08.json
json
{
  "id": 8,
  "title": "Warehouse Blaze",
  "phonics": "Final blends: -nd, -ng, -nt, -mp, -st",
  "lesson": "Now we practice blends at the end of words. The last two letters slide together, like ‘nd’ in ‘hand’ and ‘mp’ in ‘jump’. Listen for the ending sounds and read the whole word.",
  "hp": 50,
  "new": [
    "sand","hand","band","land","pond","end","bend","send","lend","tend",
    "sing","ring","wing","king","song","long","bang","rang","hung","sting",
    "tent","bent","went","hunt","punt","mint","tint","sent","rent","hint",
    "lamp","camp","damp","ramp","jump","bump","dump","lump","limp","pump",
    "last","fast","past","mast","best","rest","nest","test","cost","lost"
  ],
  "trick": []
}
### data/level09.json
json
{
  "id": 9,
  "title": "Office‑Tower Fire",
  "phonics": "R‑controlled vowels: ar, or, er, ir, ur",
  "lesson": "Sometimes ‘r’ changes a vowel sound. We call these r‑controlled vowels. ‘car’ has ar, ‘corn’ has or, ‘her’ has er, ‘bird’ has ir, and ‘turn’ has ur. Let’s practice each sound carefully!",
  "hp": 50,
  "new": [
    "car","far","jar","bar","star","park","dark","hard","farm","yarn",
    "for","or","corn","fork","horn","storm","short","sort","port","sport",
    "her","term","fern","perk","jerk","germ","herd","stern","perch","verb",
    "bird","dirt","girl","shirt","stir","third","first","firm","whirl","skirt",
    "fur","burn","turn","surf","hurt","curb","curl","blur","burst","purse"
  ],
  "trick": []
}
### data/level10.json
json
{
  "id": 10,
  "title": "Burning Castle (Dragon)",
  "phonics": "Mixed review in short sentences",
  "lesson": "You have learned lots of words! Now we will read short sentences. Read left to right. Say each word clearly. When a whole sentence is read, the dragon’s fire gets weaker. Let’s save the castle!",
  "hp": 20,
  "sentences": [
    "The cat sat on me.",
    "I can run fast.",
    "We went to the park.",
    "The dog dug in sand.",
    "She said yes to me.",
    "The fish swam in a tub.",
    "The kid can jump fast.",
    "A big bug ran.",
    "We can get wet.",
    "The duck went in.",
    "The moth is on the rug.",
    "He can kick the ball.",
    "We will stop and rest.",
    "The frog is not here.",
    "Dad had a red cap.",
    "The bird is in the nest.",
    "The campfire is hot.",
    "The car can turn.",
    "Look at the map.",
    "Please help me, friend.",
    "The cat can sit still.",
    "The dog can run with you.",
    "We can shop and get gum.",
    "The kid will swat a bug.",
    "The truck is in the lot.",
    "The girl can jump up.",
    "The duck can swim.",
    "The fish is on the dish.",
    "The band can sing.",
    "The king has a staff.",
    "The barn is far.",
    "The storm is big.",
    "The best wish is kind.",
    "The camp is near the pond.",
    "The bird can chirp.",
    "The kid can spot the fox.",
    "The bug is under the rug.",
    "The cat is on the box.",
    "The dog ran from me.",
    "We can rest in the tent.",
    "The duck went to the pond.",
    "The girl can help you.",
    "The kid can look here.",
    "The bird is on the perch.",
    "The dog can sniff the mud.",
    "The cat can nap on the bed.",
    "The fish can swim fast.",
    "We can play in the yard.",
    "The car is in the lot.",
    "The dragon is not kind."
  ]
}
--- ## 11. Notes for a “coding model” implementing from scratch - Implement the file tree exactly. - Implement BootScene first; ensure assets load and the atlas validation passes. - Ensure assets/ files exist at the paths listed; **most runtime issues come from missing assets or wrong atlas naming**. - Run through the QA checklist in Section 9 before considering the MVP “done.” ---