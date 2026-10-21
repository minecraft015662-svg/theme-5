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
- Afterwards just run `sarthak34` for the menu, or: sarthak34 update | status | uninstall | ext list|install|remove <name>
- Edit LINKS in quick-links/ext.js and TEXT in announcement-bar/ext.js before using them.
