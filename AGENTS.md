# AGENTS.md

## Project Overview

**thatday** — "One photo. One headline. Every day."

A personal daily journal web app where users capture each day with a photo (or video) and a short headline (max 300 characters). Features include a photo-tile grid, calendar navigation, "On This Day" memory lookback, slideshow browsing, and offline PWA support. Also packaged as an Android app via Capacitor.

Live: https://thatday-vibe-coded.onrender.com/

## Tech Stack

- **Runtime:** Node.js (CommonJS modules)
- **Backend:** Express.js v5 — single-file server (`server.js`)
- **Frontend:** Vanilla HTML, CSS, JavaScript — no framework, no bundler, no build step
- **Auth:** JWT (30-day tokens in localStorage) + bcrypt password hashing
- **Image processing:** Sharp (progressive compression to <=500KB JPEG)
- **File upload:** Multer (memory storage)
- **Database:** None — flat JSON files on disk (`data/users/`, `data/entries/`)
- **Photo storage:** Disk (`data/uploads/<userId>/<uuid>.jpg`)
- **PWA:** Service Worker + Web App Manifest
- **Mobile:** Capacitor 8.x (Android)
- **Date picker:** Flatpickr (vendored in `public/dist/`)
- **Package manager:** npm

## Project Structure

```
server.js              # ALL backend code: Express server, API routes, middleware, helpers (607 lines)
public/
  index.html           # Main app page (authenticated)
  login.html           # Login/register page (inline JS)
  confirm.html         # Email confirmation landing page
  app.js               # ALL frontend logic (1140 lines)
  style.css            # ALL styles, dark + light theme via CSS custom properties (1057 lines)
  sw.js                # Service Worker (cache strategies per content type)
  manifest.json        # PWA manifest
  icon.svg             # App icon
  dist/                # Vendored third-party libs (flatpickr)
data/                  # Runtime data (gitignored)
  users/               # <userId>.json per user
  entries/             # <userId>.json per user (array of entries)
  uploads/             # <userId>/<uuid>.jpg per photo
android/               # Capacitor Android project
capacitor.config.json  # Capacitor config (appId: app.thatday, webDir: public)
```

## API Endpoints

All defined in `server.js`:

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| POST | `/api/auth/register` | No | Create account, sends confirmation email |
| POST | `/api/auth/login` | No | Login, returns JWT |
| GET | `/api/auth/me` | Yes | Get current user info |
| GET | `/api/auth/confirm/:token` | No | Confirm email |
| GET | `/api/entries` | Yes | List all entries (sorted by date desc) |
| POST | `/api/entries` | Yes | Create entry (multipart: photo + video) |
| PUT | `/api/entries/:id` | Yes | Update entry |
| DELETE | `/api/entries/:id` | Yes | Delete entry and files |
| GET | `/uploads/:userId/:filename` | Token (query string) | Serve uploaded files |

## Commands

```bash
npm start   # node server.js — starts on port 3000 (or $PORT)
npm stop    # kills server using .server.pid
```

There is no build step, no test suite, no linter.

## Code Conventions

- **Architecture:** Monolithic — one file for backend (`server.js`), one for frontend JS (`app.js`), one for CSS (`style.css`)
- **Naming:** camelCase for JS variables/functions, kebab-case for CSS classes/variables, lowercase filenames
- **IDs:** UUID v4 for all entities (users, entries, photos)
- **Strings:** Double quotes preferred
- **Indentation:** 2 spaces
- **Variables:** `const` preferred, `let` when mutation needed
- **Functions:** Arrow functions, `async/await` for async
- **No TypeScript, no semicolon enforcement (mostly present), no strict linting**
- **UI language:** Mostly English; some German labels exist in camera/video buttons ("Foto aufnehmen", "Aus Galerie", etc.)

## Key Patterns

- **Photo processing:** Multer memory storage -> Sharp progressive compression (quality 65->20, then width 1800->400) targeting <=500KB JPEG
- **Auth flow:** JWT in `Authorization: Bearer` header for API calls; query string `?token=` for `<img>` src URLs
- **Theming:** CSS custom properties with dark mode default, `[data-theme="light"]` override
- **Service Worker:** Cache-first for photos, network-first for API, stale-while-revalidate for static assets
- **Inline editing:** Click-to-edit for headlines and dates in detail view
- **Data persistence:** Read/write JSON files with `fs.readFileSync`/`fs.writeFileSync`
- **Email:** Nodemailer with SMTP in production, console logging in dev (`APP_ENV=dev`)

## Important Notes

- Express v5 (not v4) — has breaking changes from v4 (e.g., path parameter syntax, error handling)
- The `.env` file is tracked by git — currently safe (only `APP_ENV=dev`) but do not add secrets to it
- No separation of concerns — all backend logic is in `server.js`, all frontend logic is in `app.js`
- No tests exist — manual testing only
- No migration system — data format changes require manual migration
