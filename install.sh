#!/usr/bin/env bash
# Shadow Theme CLI (by Sarthak34) - installs the licensed theme and extensions on a Pterodactyl panel.
set -uo pipefail
RAW="${S34_RAW:-__SERVER__}"
PANEL="${PANEL_DIR:-/var/www/pterodactyl}"
CONF=/etc/sarthak34/license.conf
WRAP="$PANEL/resources/views/templates/wrapper.blade.php"
TDIR="$PANEL/public/themes/sarthak34"
BIN=/usr/local/bin/sarthak34
die(){ echo "Error: $*" >&2; exit 1; }
banner(){
  printf '\033[38;5;141m'
  echo ' ____  _   _    _    ____   _____        __'
  echo '/ ___|| | | |  / \  |  _ \ / _ \ \      / /'
  echo '\___ \| |_| | / _ \ | | | | | | \ \ /\ / / '
  echo ' ___) |  _  |/ ___ \| |_| | |_| |\ V  V /  '
  echo '|____/|_| |_/_/   \_\____/ \___/  \_/\_/   '
  printf '\033[0m   Shadow Theme for Pterodactyl\n\n'
}

# verify_license LICENSE EMAIL DOMAIN -> asks the license server; prints reason on failure
verify_license(){
  local body res
  body=$(python3 -c 'import json,sys;print(json.dumps({"license":sys.argv[1],"email":sys.argv[2],"domain":sys.argv[3]}))' "$1" "$2" "$3")
  res=$(curl -fsS -m 15 -X POST -H 'Content-Type: application/json' -d "$body" "$RAW/api/verify" 2>/dev/null) || { echo "cannot reach license server $RAW"; return 1; }
  python3 -c 'import json,sys;d=json.loads(sys.argv[1]);print("ok:"+d.get("plan","standard") if d.get("ok") else d.get("reason","license rejected"));sys.exit(0 if d.get("ok") else 1)' "$res"
}

dl(){ curl -fsSL "$RAW/$1" -o "$2"; }

rebuild(){
  [ -f "$WRAP.s34bak" ] || cp "$WRAP" "$WRAP.s34bak"
  python3 - "$WRAP" "$TDIR" <<'PY'
import os, re, sys, time
wrap, tdir = sys.argv[1], sys.argv[2]; v = int(time.time()); tags = []
if os.path.exists(f"{tdir}/theme.css"): tags.append(f'<link rel="stylesheet" href="/themes/sarthak34/theme.css?v={v}">')
ext = f"{tdir}/ext"
for n in (sorted(os.listdir(ext)) if os.path.isdir(ext) else []):
    if os.path.exists(f"{ext}/{n}/ext.css"): tags.append(f'<link rel="stylesheet" href="/themes/sarthak34/ext/{n}/ext.css?v={v}">')
    if os.path.exists(f"{ext}/{n}/ext.js"): tags.append(f'<script defer src="/themes/sarthak34/ext/{n}/ext.js?v={v}"></script>')
s = open(wrap).read()
s = re.sub(r"\n?<!-- sarthak34:start -->.*?<!-- sarthak34:end -->\n?", "\n", s, flags=re.S)
if tags: s = s.replace("</head>", "<!-- sarthak34:start -->\n" + "\n".join(tags) + "\n<!-- sarthak34:end -->\n</head>", 1)
open(wrap, "w").write(s)
PY
  (cd "$PANEL" && php artisan view:clear >/dev/null 2>&1)
}

load_conf(){ LIC=""; EMAIL=""; [ -f "$CONF" ] && . "$CONF"; return 0; }
ask_license(){
  read -rp "License key: " LIC </dev/tty; read -rp "Email: " EMAIL </dev/tty
  local m; m=$(verify_license "$LIC" "$EMAIL" "$DOMAIN") || die "$m"
  mkdir -p /etc/sarthak34; (umask 077; printf 'LIC=%q\nEMAIL=%q\n' "$LIC" "$EMAIL" > "$CONF"); chmod 600 "$CONF"
  echo "License verified for $DOMAIN (${m#ok:} plan)."
}
need_license(){
  load_conf; [ -n "$LIC" ] || ask_license
  local m; m=$(verify_license "$LIC" "$EMAIL" "$DOMAIN") || die "$m"
}
valid_name(){ [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]]; }

get_theme(){ mkdir -p "$TDIR"; dl packages/theme/theme.css "$TDIR/theme.css" || die "could not download the theme from $RAW"; }
get_ext(){
  valid_name "$1" || die "bad extension name"
  local files f; files=$(curl -fsSL "$RAW/packages/index.json" | python3 -c 'import json,sys;n=sys.argv[1];[print(f) for e in json.load(sys.stdin)["extensions"] if e["name"]==n for f in e["files"]]' "$1") || die "cannot read extension list"
  [ -n "$files" ] || die "extension '$1' not found"
  mkdir -p "$TDIR/ext/$1"
  for f in $files; do valid_name "$f" || die "bad file name"; dl "packages/extensions/$1/$f" "$TDIR/ext/$1/$f" || die "download failed: $f"; done
}

cmd_install(){
  banner
  ask_license
  curl -fsSL "$RAW/install.sh" -o "$BIN" && chmod +x "$BIN"
  get_theme
  for e in login-aurora accent-picker footer-brand; do get_ext "$e"; done
  rebuild
  echo "Shadow Theme installed. Hard refresh your browser (Ctrl+Shift+R)."
  echo "Extensions: sarthak34 ext list | sarthak34 ext install <name>"
}
cmd_update(){ need_license; get_theme; for d in "$TDIR"/ext/*/; do [ -d "$d" ] && get_ext "$(basename "$d")"; done; rebuild; echo "Updated."; }
cmd_ext(){
  need_license
  case "${1:-}" in
    list) curl -fsSL "$RAW/packages/index.json" | python3 -c 'import json,sys;[print("%-18s %s"%(e["name"],e["description"])) for e in json.load(sys.stdin)["extensions"]]';;
    install) [ -n "${2:-}" ] || die "usage: sarthak34 ext install <name>"; get_ext "$2"; rebuild; echo "Extension '$2' installed.";;
    remove) [ -n "${2:-}" ] || die "usage: sarthak34 ext remove <name>"; valid_name "$2" || die "bad name"; rm -rf "$TDIR/ext/$2"; rebuild; echo "Extension '$2' removed.";;
    *) die "usage: sarthak34 ext list|install <name>|remove <name>";;
  esac
}
cmd_uninstall(){ rm -rf "$TDIR"; rebuild; echo "Theme removed. License file kept at $CONF"; }
cmd_status(){ load_conf; echo "Panel: $PANEL ($DOMAIN)"; echo "License: ${LIC:-none}"; echo "Email: ${EMAIL:-none}"
  if [ -d "$TDIR" ]; then echo "Theme: installed"; ls "$TDIR/ext" 2>/dev/null | sed 's/^/Extension: /'; else echo "Theme: not installed"; fi; }

cmd_menu(){
  while true; do
    clear; banner
    echo "  1) Install / Reinstall theme"
    echo "  2) Update theme + extensions"
    echo "  3) List extensions"
    echo "  4) Install an extension"
    echo "  5) Remove an extension"
    echo "  6) Status"
    echo "  7) Uninstall theme"
    echo "  0) Exit"
    echo
    read -rp "  Choose: " c </dev/tty
    case "$c" in
      1) ( cmd_install );;
      2) ( cmd_update );;
      3) ( cmd_ext list );;
      4) read -rp "  Extension name: " n </dev/tty; ( cmd_ext install "$n" );;
      5) read -rp "  Extension name: " n </dev/tty; ( cmd_ext remove "$n" );;
      6) ( cmd_status );;
      7) ( cmd_uninstall );;
      0) exit 0;;
      *) echo "  Invalid choice";;
    esac
    echo; read -rp "  Press Enter to continue..." </dev/tty
  done
}

main(){
  [ "$(id -u)" = 0 ] || die "run as root (sudo)."
  for b in curl python3; do command -v $b >/dev/null || die "$b is required (apt install -y $b)."; done
  [ -f "$WRAP" ] || die "Pterodactyl not found at $PANEL (use PANEL_DIR=/path)."
  DOMAIN=$(grep -E '^APP_URL=' "$PANEL/.env" | head -1 | cut -d= -f2- | tr -d '"' | sed -E 's#^https?://##; s#[/:].*$##')
  [ -n "$DOMAIN" ] || die "APP_URL missing in $PANEL/.env"
  case "${1:-menu}" in
    menu) cmd_menu;;
    install) cmd_install;; update) cmd_update;; ext) shift; cmd_ext "$@";;
    uninstall) cmd_uninstall;; status) cmd_status;;
    *) echo "Usage: sarthak34 [menu|install|update|status|uninstall|ext list|ext install <name>|ext remove <name>]";;
  esac
}
[ "${S34_LIB:-}" = 1 ] || main "$@"
