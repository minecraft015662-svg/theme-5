#!/usr/bin/env bash
# Shadow Theme CLI (by Sarthak34) - installs the licensed theme and extensions on a Pterodactyl panel.
set -uo pipefail
RAW="${S34_RAW:-__SERVER__}"
PANEL="${PANEL_DIR:-/var/www/pterodactyl}"
CONF=/etc/sarthak34/license.conf
SERVER_FILE=/etc/sarthak34/server.url
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

# ask VAR "prompt" - read a line from the user. stdin when it is a real terminal,
# otherwise /dev/tty (needed for `curl | sudo bash`, where stdin is the script).
ask(){
  local __val=''
  if [ -t 0 ]; then
    read -rp "$2" __val || return 1
  elif { : </dev/tty; } 2>/dev/null; then
    read -rp "$2" __val </dev/tty || return 1
  else
    return 1
  fi
  printf -v "$1" '%s' "$__val"
}

# resolve_raw - install.sh copied from GitHub keeps the literal __SERVER__ placeholder.
# Ask once for the license server PUBLIC_URL, sanity-check it, then remember it.
resolve_raw(){
  case "$RAW" in ''|*__SERVER__*) ;; *) return 0;; esac
  if [ -f "$SERVER_FILE" ]; then
    local saved; saved=$(head -n1 "$SERVER_FILE" 2>/dev/null | tr -d '[:space:]')
    case "$saved" in ''|*__SERVER__*) ;; *)
      RAW=$saved; echo "License server: $RAW"; return 0;;
    esac
  fi
  echo "This install.sh has no license server URL yet."
  echo "Enter the PUBLIC_URL of your license server (the host where the admin panel runs)."
  local u='' probe
  while :; do
    if ! ask u "License server URL: "; then
      echo
      die "no terminal to ask on - rerun as: S34_RAW=https://your-server sudo -E bash install.sh"
    fi
    u=${u%/}
    case "$u" in
      http://*|https://*) ;;
      *) echo "  Type a URL starting with http:// or https://"; continue;;
    esac
    probe=$(curl -sSL -m 15 -o /dev/null -w '%{http_code}' "$u/install.sh" 2>/dev/null) || probe=000
    if [ "$probe" != "200" ]; then
      echo "  Cannot reach $u/install.sh (HTTP $probe) - check the URL and that the server is running."
      continue
    fi
    break
  done
  RAW=$u
  if mkdir -p "$(dirname "$SERVER_FILE")" 2>/dev/null && printf '%s\n' "$RAW" > "$SERVER_FILE" 2>/dev/null; then
    echo "Saved to $SERVER_FILE"
  else
    echo "Could not save to $SERVER_FILE - you will be asked again next time."
  fi
}

# verify_license LICENSE EMAIL DOMAIN -> asks the license server; prints reason on failure
verify_license(){
  local body out code json
  case "$RAW" in ''|*__SERVER__*)
    echo "no license server URL in this install.sh - download it from your own server (curl -sSL https://YOUR-SERVER/install.sh | sudo bash), not from GitHub"
    return 1;;
  esac
  body=$(python3 -c 'import json,sys;print(json.dumps({"license":sys.argv[1],"email":sys.argv[2],"domain":sys.argv[3]}))' "$1" "$2" "$3") \
    || { echo "could not build the verify request (python3 problem)"; return 1; }
  # no -f: we capture the HTTP status ourselves so a 3xx/4xx/5xx never becomes a bare python traceback
  # -L follows redirects (http->https); --post301/302 keeps POST instead of degrading to GET
  out=$(curl -sSL --post301 --post302 -m 20 -X POST -H 'Content-Type: application/json' -d "$body" -w $'\n%{http_code}' "$RAW/api/verify" 2>/dev/null)
  code=${out##*$'\n'}; json=${out%$'\n'*}
  if [ -z "$code" ] || [ "$code" = "000" ]; then
    echo "cannot reach license server $RAW - check the URL and that the server is running"
    return 1
  fi
  if [ "$code" != "200" ]; then
    echo "license server $RAW answered HTTP $code - check PUBLIC_URL on the server"
    return 1
  fi
  if [ -z "${json// }" ]; then
    echo "license server $RAW returned an empty response - check PUBLIC_URL on the server"
    return 1
  fi
  python3 -c 'import json,sys
t=sys.argv[1]
try: d=json.loads(t)
except Exception: sys.stdout.write("license server sent non-JSON: "+t.strip()[:160].replace("\n"," ")); sys.exit(1)
if not isinstance(d,dict): sys.stdout.write("unexpected reply from license server: "+t.strip()[:160].replace("\n"," ")); sys.exit(1)
if d.get("ok"): sys.stdout.write("ok:"+str(d.get("plan","standard"))); sys.exit(0)
sys.stdout.write(str(d.get("reason") or "license rejected")); sys.exit(1)' "$json"
}

dl(){ curl -fsSL "$RAW/$1" -o "$2"; }

rebuild(){
  [ -f "$WRAP.s34bak" ] || cp "$WRAP" "$WRAP.s34bak"
  python3 - "$WRAP" "$TDIR" <<'PY'
import os, re, sys, time
wrap, tdir = sys.argv[1], sys.argv[2]; v = int(time.time()); tags = []
if os.path.exists(f"{tdir}/server.js"): tags.append(f'<script src="/themes/sarthak34/server.js?v={v}"></script>')
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
  resolve_raw
  ask LIC "License key: " || die "no terminal to read the license key - run this from an interactive shell"
  ask EMAIL "Email: " || die "no terminal to read the email - run this from an interactive shell"
  [ -n "$LIC" ] || die "license key is empty"
  [ -n "$EMAIL" ] || die "email is empty"
  local m; m=$(verify_license "$LIC" "$EMAIL" "$DOMAIN") || die "$m"
  mkdir -p /etc/sarthak34; (umask 077; printf 'LIC=%q\nEMAIL=%q\n' "$LIC" "$EMAIL" > "$CONF"); chmod 600 "$CONF"
  echo "License verified for $DOMAIN (${m#ok:} plan)."
}
need_license(){
  resolve_raw
  load_conf; [ -n "$LIC" ] || ask_license
  local m; m=$(verify_license "$LIC" "$EMAIL" "$DOMAIN") || die "$m"
}
valid_name(){ [[ "$1" =~ ^[A-Za-z0-9._-]+$ ]]; }

get_theme(){ mkdir -p "$TDIR"; dl packages/theme/theme.css "$TDIR/theme.css" || die "could not download the theme from $RAW"; printf 'window.__S34_SERVER="%s";\n' "${RAW//\"/}" > "$TDIR/server.js"; }
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
  for e in login-aurora accent-picker footer-brand theme-sync theme-overhaul; do get_ext "$e"; done
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

# ---------- interactive pickers (show names, no typing) ----------
# pick_index VAR "prompt" item... -> sets VAR to the 1-based number chosen
pick_index(){
  local __var=$1 __prompt=$2; shift 2
  local __items=("$@") __i=1 __c='' __n=$#
  [ "$__n" -gt 0 ] || return 1
  for __it in "${__items[@]}"; do printf '  %2d) %s\n' "$__i" "$__it"; __i=$((__i+1)); done
  while :; do
    ask __c "$__prompt" || return 1
    if [[ "$__c" =~ ^[0-9]+$ ]] && [ "$__c" -ge 1 ] && [ "$__c" -le "$__n" ]; then
      printf -v "$__var" '%s' "$__c"; return 0
    fi
    echo "  Enter a number from 1 to $__n"
  done
}

# pick_ext -> sets EXT to an extension name chosen from the server list
pick_ext(){
  resolve_raw
  local __lines nm desc
  __lines=$(curl -fsSL "$RAW/packages/index.json" | python3 -c 'import json,sys
for e in json.load(sys.stdin)["extensions"]: print(e["name"]+"\t"+e["description"])') \
    || die "cannot read the extension list"
  [ -n "$__lines" ] || die "no extensions available"
  local -a names disp
  while IFS=$'\t' read -r nm desc; do names+=("$nm"); disp+=("$nm  -  $desc"); done <<< "$__lines"
  local idx
  pick_index idx "  Extension number: " "${disp[@]}" || return 1
  EXT="${names[$((idx-1))]}"
}

# pick_installed_ext -> sets EXT to an installed extension name chosen from disk
pick_installed_ext(){
  local -a names; local d
  for d in "$TDIR"/ext/*/; do [ -d "$d" ] && names+=("$(basename "$d")"); done
  [ "${#names[@]}" -gt 0 ] || die "no extensions installed yet"
  local idx
  pick_index idx "  Extension number: " "${names[@]}" || return 1
  EXT="${names[$((idx-1))]}"
}

# ---------- server roles: panel / wings / cloudflare ----------
cmd_panel(){
  need_license
  echo
  echo "  Install / update the Pterodactyl Panel (official installer)."
  echo "  Sets up PHP, MariaDB, Redis, Nginx and the panel. You will be"
  echo "  asked for the panel domain and database details."
  echo
  ask _go "  Continue? [y/N] " || return 0
  case "$_go" in [yY]*) ;; *) echo "  Cancelled."; return 0;; esac
  local s rc; s=$(mktemp)
  curl -fsSL https://raw.githubusercontent.com/pterodactyl/panel/develop/install.sh -o "$s" \
    || { echo "  Could not download the panel installer."; rm -f "$s"; return 1; }
  bash "$s"; rc=$?; rm -f "$s"
  if [ "$rc" -eq 0 ]; then echo "  Panel ready. Choose option 1 to apply Shadow Theme to it."
  else echo "  Panel installer exited with code $rc."; fi
  return "$rc"
}

cmd_wings(){
  echo
  echo "  Install Wings, the Pterodactyl node daemon (official installer)."
  echo "  Sets up Docker and registers this machine as a node."
  echo
  ask _go "  Continue? [y/N] " || return 0
  case "$_go" in [yY]*) ;; *) echo "  Cancelled."; return 0;; esac
  local s rc; s=$(mktemp)
  curl -fsSL https://raw.githubusercontent.com/pterodactyl/wings/develop/install.sh -o "$s" \
    || { echo "  Could not download the Wings installer."; rm -f "$s"; return 1; }
  bash "$s"; rc=$?; rm -f "$s"
  if [ "$rc" -eq 0 ]; then echo "  Wings installed. Configure it from Admin -> Nodes in the panel."
  else echo "  Wings installer exited with code $rc."; fi
  return "$rc"
}

CF_TUNNEL=shadow-panel
cmd_cloudflare(){
  echo
  echo "  Connect this server to Cloudflare with a Tunnel."
  echo "  Installs cloudflared and creates a tunnel named '$CF_TUNNEL',"
  echo "  routing your panel ($DOMAIN) without port forwarding."
  echo
  ask _go "  Continue? [y/N] " || return 0
  case "$_go" in [yY]*) ;; *) echo "  Cancelled."; return 0;; esac
  if ! command -v cloudflared >/dev/null 2>&1; then
    echo "  Installing cloudflared..."
    curl -fsSL https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 \
      -o /usr/local/bin/cloudflared || { echo "  Could not download cloudflared."; return 1; }
    chmod +x /usr/local/bin/cloudflared
  fi
  echo "  Logging in to Cloudflare (a browser window will open)..."
  cloudflared tunnel login || { echo "  Cloudflare login failed or was cancelled."; return 1; }
  if ! cloudflared tunnel list 2>/dev/null | grep -qw "$CF_TUNNEL"; then
    echo "  Creating tunnel '$CF_TUNNEL'..."
    cloudflared tunnel create "$CF_TUNNEL" || { echo "  Could not create the tunnel."; return 1; }
  fi
  local tid; tid=$(cloudflared tunnel list 2>/dev/null | awk -v n="$CF_TUNNEL" 'index($0,n){print $1; exit}')
  [ -n "$tid" ] || { echo "  Could not read the tunnel id."; return 1; }
  mkdir -p /root/.cloudflared
  cat > /root/.cloudflared/config.yml <<EOF
tunnel: $tid
credentials-file: /root/.cloudflared/$tid.json
ingress:
  - hostname: $DOMAIN
    service: http://localhost:80
  - service: http_status:404
EOF
  cloudflared tunnel route dns "$CF_TUNNEL" "$DOMAIN" 2>/dev/null
  cloudflared service install 2>/dev/null
  echo "  Tunnel '$CF_TUNNEL' configured for $DOMAIN and service installed."
  echo "  It tunnels to http://localhost:80 - point Nginx there, then:"
  echo "     systemctl enable --now cloudflared"
}

cmd_menu(){
  while true; do
    clear 2>/dev/null || true; banner
    echo "  THEME"
    echo "    1) Install / Reinstall Shadow Theme"
    echo "    2) Update theme + extensions"
    echo "    7) Uninstall theme"
    echo
    echo "  EXTENSIONS"
    echo "    3) List extensions"
    echo "    4) Install an extension"
    echo "    5) Remove an extension"
    echo
    echo "  SERVER"
    echo "    8) Install Pterodactyl Panel"
    echo "    9) Install Wings (node daemon)"
    echo "   10) Connect Cloudflare (tunnel)"
    echo
    echo "  INFO"
    echo "    6) Status"
    echo
    echo "    0) Exit"
    echo
    ask c "  Choose: " || exit 0
    case "$c" in
      1) ( cmd_install );;
      2) ( cmd_update );;
      3) ( cmd_ext list );;
      4) ( pick_ext && cmd_ext install "$EXT" );;
      5) ( pick_installed_ext && cmd_ext remove "$EXT" );;
      6) ( cmd_status );;
      7) ( cmd_uninstall );;
      8) ( cmd_panel );;
      9) ( cmd_wings );;
      10) ( cmd_cloudflare );;
      0) exit 0;;
      *) echo "  Invalid choice";;
    esac
    echo; ask _p "  Press Enter to continue... " || true
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
    panel) cmd_panel;; wings) cmd_wings;; cloudflare) cmd_cloudflare;;
    uninstall) cmd_uninstall;; status) cmd_status;;
    *) echo "Usage: sarthak34 [menu|install|update|status|uninstall|panel|wings|cloudflare|ext list|ext install <name>|ext remove <name>]";;
  esac
}
[ "${S34_LIB:-}" = 1 ] || main "$@"
