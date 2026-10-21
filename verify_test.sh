#!/usr/bin/env bash
# Test harness for install.sh verify_license
set -uo pipefail
cd "$(dirname "$0")" || exit 1
pass=0; fail=0
chk(){ # chk <desc> <expected_exit> <expected_substr> <actual_exit> <actual_out>
  local d="$1" ee="$2" es="$3" ae="$4" ao="$5"
  if [ "$ee" = "$ae" ] && [[ "$ao" == *"$es"* ]]; then
    printf 'PASS  %-32s -> %s\n' "$d" "$ao"; pass=$((pass+1))
  else
    printf 'FAIL  %-32s\n        want exit=%s substr=[%s]\n        got  exit=%s out=[%s]\n' "$d" "$ee" "$es" "$ae" "$ao"; fail=$((fail+1))
  fi
}

rm -rf /tmp/s34t && mkdir -p /tmp/s34t
ADMIN_PASS=testpass123 PUBLIC_URL=http://127.0.0.1:3435 PORT=3435 DATA_DIR=/tmp/s34t \
  node server.js > /tmp/s34.log 2>&1 &
SRV=$!
for i in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:3435/ && break; sleep .3; done

AUTH="Authorization: Basic $(printf 'admin:testpass123' | base64 -w0)"
GOODKEY=$(curl -s -H "$AUTH" -H 'Content-Type: application/json' \
  -d '{"email":"s@gmail.com","domain":"*","plan":"pro","days":30}' \
  http://127.0.0.1:3435/api/admin/licenses | python3 -c 'import json,sys;print(json.load(sys.stdin)["key"])')

node -e '
const http=require("http");
http.createServer((q,s)=>{
  const p=q.url;
  if(p.startsWith("/redir")){ s.writeHead(302,{Location:"http://127.0.0.1:3440/final"}); return s.end(); }
  if(p.startsWith("/final")){ s.writeHead(200,{"Content-Type":"application/json"}); return s.end(JSON.stringify({ok:true,plan:"pro"})); }
  if(p.startsWith("/html")) { s.writeHead(200,{"Content-Type":"text/html"}); return s.end("<!doctype html><title>hi</title>"); }
  if(p.startsWith("/empty")){ s.writeHead(200,{"Content-Type":"application/json"}); return s.end(""); }
  if(p.startsWith("/err"))  { s.writeHead(500,{"Content-Type":"text/html"}); return s.end("<h1>boom</h1>"); }
  s.writeHead(404,{"Content-Type":"application/json"}); s.end(JSON.stringify({error:"not found"}));
}).listen(3440,"127.0.0.1",()=>0);
' > /tmp/fake.log 2>&1 &
FAKE=$!
for i in $(seq 1 20); do curl -s -o /dev/null http://127.0.0.1:3440/x && break; sleep .3; done

S34_LIB=1 S34_RAW=http://127.0.0.1:3435 source "$PWD/install.sh"
K="$GOODKEY"
run(){ local o e; o=$(verify_license "$2" "$3" "*" 2>&1); e=$?; chk "$1" "$4" "$5" "$e" "$o"; }

run "correct license+email"      "$K" "s@gmail.com"          0 "ok:pro"
run "wrong email"                "$K" "wrong@gmail.com"      1 "email does not match"
run "bogus license"              "S34-000000-000000-000000-000000" "s@gmail.com" 1 "invalid license"

RAW=http://127.0.0.1:3999
run "server down conn refused"   "$K" "s@gmail.com"          1 "cannot reach license server"
RAW=http://127.0.0.1:3440/html
run "HTML 200 body"              "$K" "s@gmail.com"          1 "non-JSON"
RAW=http://127.0.0.1:3440/empty
run "empty 200 body"             "$K" "s@gmail.com"          1 "empty response"
RAW=http://127.0.0.1:3440/err
run "HTTP 500"                   "$K" "s@gmail.com"          1 "HTTP 500"
RAW=http://127.0.0.1:3440/redir
run "302 redirect followed"      "$K" "s@gmail.com"          0 "ok:pro"
RAW=__SERVER__
run "unreplaced __SERVER__"      "$K" "s@gmail.com"          1 "no license server URL"

echo
echo "passed=$pass failed=$fail"
RC=0; [ "$fail" = 0 ] || RC=1
kill $SRV $FAKE 2>/dev/null
exit $RC
