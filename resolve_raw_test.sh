#!/usr/bin/env bash
# Tests for resolve_raw()/ask() - fix for "no license server URL in this install.sh"
set -uo pipefail
cd "$(dirname "$0")" || exit 1
pass=0; fail=0
chk(){ # chk <desc> <expected_exit> <expected_substr> <actual_exit> <actual_out>
  local d="$1" ee="$2" es="$3" ae="$4" ao="$5"
  if [ "$ee" = "$ae" ] && [[ "$ao" == *"$es"* ]]; then
    printf 'PASS  %-34s\n' "$d"; pass=$((pass+1))
  else
    printf 'FAIL  %-34s\n        want exit=%s substr=[%s]\n        got  exit=%s out=[%s]\n' \
      "$d" "$ee" "$es" "$ae" "${ao//$'\n'/ | }"; fail=$((fail+1))
  fi
}
chk_not(){ # chk_not <desc> <forbidden_substr> <actual_exit> <actual_out>
  local d="$1" fs="$2" ae="$3" ao="$4"
  if [[ "$ao" != *"$fs"* ]]; then
    printf 'PASS  %-34s\n' "$d"; pass=$((pass+1))
  else
    printf 'FAIL  %-34s\n        must NOT contain [%s]\n        got out=[%s]\n' \
      "$d" "$fs" "${ao//$'\n'/ | }"; fail=$((fail+1))
  fi
}

WORK=$(mktemp -d); trap 'kill $FAKE 2>/dev/null; rm -rf "$WORK"' EXIT

# --- PTY driver: run a bash snippet attached to a pseudo-terminal ---
# usage: drv.py <tty|notty> <bash-snippet> [lines to type...]
cat > "$WORK/drv.py" <<'PY'
import os, pty, subprocess, sys, select, time, fcntl, termios
mode, cmd = sys.argv[1], sys.argv[2]
inputs = sys.argv[3:]
m, s = pty.openpty()
def pre():
    os.setsid()
    try: fcntl.ioctl(s, termios.TIOCSCTTY, 0)
    except Exception: pass
    os.close(m)
stdin = s if mode == "tty" else subprocess.DEVNULL
p = subprocess.Popen(["bash","-c",cmd], stdin=stdin, stdout=s, stderr=s,
                     preexec_fn=pre, close_fds=False)
os.close(s)
buf = b""
if inputs:
    time.sleep(0.3)
    os.write(m, ("\n".join(inputs)+"\n").encode())
deadline = time.time()+25
while time.time() < deadline:
    r,_,_ = select.select([m],[],[],0.2)
    if r:
        try: c = os.read(m,65536)
        except OSError: break
        if not c: break
        buf += c
    if p.poll() is not None:
        while True:
            r,_,_ = select.select([m],[],[],0.1)
            if not r: break
            try: c = os.read(m,65536)
            except OSError: break
            if not c: break
            buf += c
        break
else:
    p.kill(); sys.stdout.write(buf.decode(errors="replace")); sys.exit(124)
sys.stdout.write(buf.decode(errors="replace")); sys.exit(p.wait())
PY

# --- no-terminal runner: plain pipe, /dev/tty unavailable (cloud/CI style) ---
noterm(){ # noterm <bash-snippet>  -> sets REPLY_OUT / REPLY_RC
  REPLY_OUT=$(printf '' | timeout 25 bash -c "$1" 2>&1); REPLY_RC=$?
}

# --- fake license server (install.sh + api/verify) ---
node -e '
const http=require("http");
http.createServer((q,s)=>{
  if(q.url==="/install.sh"){ s.writeHead(200,{"Content-Type":"text/plain"}); return s.end("# fake install\n"); }
  if(q.url==="/api/verify"){ s.writeHead(200,{"Content-Type":"application/json"});
    return s.end(JSON.stringify({ok:true,plan:"pro"})); }
  s.writeHead(404,{"Content-Type":"text/plain"}); s.end("nope");
}).listen(3451,"127.0.0.1",()=>0);
' > "$WORK/fake.log" 2>&1 &
FAKE=$!
for i in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:3451/install.sh && break; sleep .3; done

PRE="export S34_LIB=1; cd '$PWD'; source ./install.sh; SERVER_FILE='$WORK/server.url';"
pty_run(){ python3 "$WORK/drv.py" "$@"; }

# 1) RAW already valid -> no prompt at all
noterm "export S34_RAW=http://127.0.0.1:3451; $PRE resolve_raw; echo RAW=\$RAW"
chk "valid RAW is a no-op" 0 "RAW=http://127.0.0.1:3451" "$REPLY_RC" "$REPLY_OUT"

# 2) saved URL is reused -> no prompt
printf 'http://127.0.0.1:3451\n' > "$WORK/server.url"
noterm "$PRE resolve_raw; echo RAW=\$RAW"
chk "reuses saved server.url" 0 "RAW=http://127.0.0.1:3451" "$REPLY_RC" "$REPLY_OUT"
chk_not "no prompt when saved" "License server URL:" "$REPLY_RC" "$REPLY_OUT"

# 3) saved value is the placeholder again -> must NOT trust it, must ask/fail cleanly
printf '__SERVER__\n' > "$WORK/server.url"
noterm "$PRE resolve_raw; echo RAW=\$RAW"
chk "rejects saved __SERVER__" 1 "no terminal to ask on" "$REPLY_RC" "$REPLY_OUT"
chk_not "placeholder never used" "RAW=__SERVER__" "$REPLY_RC" "$REPLY_OUT"

# 4) interactive prompt: bad scheme, then unreachable host, then good URL
rm -f "$WORK/server.url"
out=$(pty_run tty "$PRE resolve_raw; echo RAW=\$RAW; echo SAVED=\$(cat \"\$SERVER_FILE\" 2>/dev/null)" \
      'ftp://nope.example' 'http://127.0.0.1:3999' 'http://127.0.0.1:3451/' 2>&1); e=$?
chk "rejects non-http scheme"  0 "Type a URL starting with http" "$e" "$out"
chk "probes before accepting"  0 "Cannot reach http://127.0.0.1:3999/install.sh" "$e" "$out"
chk "accepts good URL"         0 "RAW=http://127.0.0.1:3451" "$e" "$out"
chk "strips trailing slash"    0 "SAVED=http://127.0.0.1:3451" "$e" "$out"
chk "persists for next run"    0 "Saved to" "$e" "$out"

# 5) /dev/tty branch: stdin is NOT a tty (like `curl | sudo bash`) but a terminal exists
rm -f "$WORK/server.url"
out=$(pty_run notty "$PRE resolve_raw; echo RAW=\$RAW" 'http://127.0.0.1:3451' 2>&1); e=$?
chk "reads via /dev/tty" 0 "RAW=http://127.0.0.1:3451" "$e" "$out"

# 6) saved URL is trusted on the next run -> prompt never appears
noterm "$PRE resolve_raw; echo RAW=\$RAW"
chk "second run does not prompt" 0 "RAW=http://127.0.0.1:3451" "$REPLY_RC" "$REPLY_OUT"
chk_not "second run stays silent" "License server URL:" "$REPLY_RC" "$REPLY_OUT"

# 7) verify_license works end-to-end once resolve_raw has run
noterm "$PRE resolve_raw >/dev/null 2>&1; verify_license S34-AAAAAA-BBBBBB-CCCCCC-DDDDDD s@gmail.com '*'; echo exit=\$?"
chk "verify_license after resolve" 0 "exit=0" "$REPLY_RC" "$REPLY_OUT"

# 8) whole install path: cmd_install-style flow asks for URL before the license key
rm -f "$WORK/server.url"
out=$(pty_run tty "${PRE}DOMAIN=panel.example.com; ask_license; echo LICENSE=\$LIC" 'http://127.0.0.1:3451' 'S34-FB56FD-34198A-00D585-D1D869' 's@gmail.com' 2>&1); e=$?
chk "ask_license asks URL first" 0 "License server URL: http://127.0.0.1:3451" "$e" "$out"
chk "then asks for license key"  0 "License key:" "$e" "$out"
chk "then asks for email"        0 "Email:" "$e" "$out"

# 9) menu: exit choice must work, and a dead terminal must not trip set -u
out=$(pty_run tty "${PRE}TERM=dumb cmd_menu" '0' 2>&1); e=$?
chk "menu exits on 0"            0 "Shadow Theme" "$e" "$out"
chk_not "menu has no unbound err" "unbound variable" "$e" "$out"

noterm "$PRE cmd_menu"
chk "menu dies cleanly w/o tty"  0 "Shadow Theme" "$REPLY_RC" "$REPLY_OUT"
chk_not "no unbound var w/o tty"  "unbound variable" "$REPLY_RC" "$REPLY_OUT"

# 10) ask_license with no terminal gives a clear message, not a raw /dev/tty error
rm -f "$WORK/server.url"
printf 'http://127.0.0.1:3451\n' > "$WORK/server.url"
noterm "${PRE}DOMAIN=panel.example.com; ask_license"
chk "ask_license w/o tty is clear" 1 "no terminal to read the license key" "$REPLY_RC" "$REPLY_OUT"
chk_not "no raw /dev/tty error"    "/dev/tty: No such" "$REPLY_RC" "$REPLY_OUT"

echo
echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
