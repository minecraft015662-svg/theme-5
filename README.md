# Shadow Theme (by Sarthak34) - license server + installer

One Node.js app (no npm install) = admin website + license API + `install.sh` + theme/extension files.

## Folder layout
    server.js  install.sh  Dockerfile  README.md
    packages/index.json
    packages/theme/theme.css
    packages/extensions/<name>/ext.css, ext.js

## Deploy free on Render (Docker) + Upstash Redis (keeps licenses)
Environment variables:
- ADMIN_PASS  = long password (8+ chars)
- PUBLIC_URL  = your Render link, no trailing slash (e.g. https://your-app.onrender.com)
- UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN = from your Upstash Redis database
Add a free UptimeRobot HTTP monitor (5 min) so Render does not sleep. Accept 401 as OK.

## Use
- Open PUBLIC_URL, log in (user `admin`, your ADMIN_PASS), create/revoke licenses.
- Customer (on the panel server): curl -sSL https://YOUR-LINK/install.sh | sudo bash
- Afterwards just run `sarthak34` for the menu. The menu is sectioned (THEME / EXTENSIONS / SERVER / INFO).
  Extensions are picked **by number from a list** (names + descriptions shown) - no typing names.
- CLI: sarthak34 update | status | uninstall | panel | wings | cloudflare | ext list|install|remove <name>
  - `panel`  = run the official Pterodactyl panel installer, then apply Shadow Theme
  - `wings`  = run the official Wings (node daemon) installer
  - `cloudflare` = install cloudflared + create an auto-named tunnel (`shadow-panel`) for your panel domain
- Edit LINKS in quick-links/ext.js and TEXT in announcement-bar/ext.js before using them.

## Shadow Editor (live theming)
- The admin site has a **Shadow Editor** (sidebar -> Shadow Editor): set the logo (URL or upload),
  server name, Discord link text + invite, accent colours, announcement bar and footer, with a live preview.
- Save and the settings go live on every installed panel right away - they are served from
  `GET /api/theme-config` and applied by the **theme-sync** extension (installed by default).
- Settings persist in `data/theme.json` (and Upstash Redis when configured), so they survive redeploys.
- The editor needs `theme-sync` on the panel; `install.sh` bakes your PUBLIC_URL into it so it knows where to fetch from.

## Geek Editor (in-panel, Arix-style)
- Installed by default. A gear button (bottom-left) and a "Geek Editor" entry above Logout open an
  in-panel editor: set the **background from an image link** (or pick a preset), accent colours,
  panel logo + name, Discord link/invite and announcement - all with a live preview.
- Settings save to the browser's `localStorage` (per panel, per browser) and apply instantly.
- This is CSS/JS theming (no panel rebuild); the underlying Pterodactyl components stay the same.
