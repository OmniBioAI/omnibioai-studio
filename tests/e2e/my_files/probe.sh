#!/bin/bash
E="$(cd "$(dirname "$0")" && pwd)"; R=$E/run; B=http://127.0.0.1:18080; P=$B/_svc/workbench/api/storage/me/files
HOST='Host: webstudio.omnibioai.org'; ORIGIN='Origin: https://webstudio.omnibioai.org'; T=$(cat $R/token); CK="omnibioai_access_token=$T"
mem(){ docker exec myfiles-e2e-wb sh -c 'grep -E "VmHWM|VmRSS" /proc/1/status' | awk '{printf "%s %d MB  ", $1, $2/1024}'; echo " <- $1"; }
F=$R/blob.bin; head -c 95000000 /dev/urandom > $F; mem start
curl -s -o $R/up.json -X POST -H "$HOST" -H "$ORIGIN" -b "$CK" -H 'X-File-Name: a.bam' -H 'Idempotency-Key: p1' --limit-rate 25M -T $F "$P" &
C=$!; for i in $(seq 1 24); do sleep 0.25; printf '%s ' "$(find $R/tenants -name payload -printf '%s' 2>/dev/null | head -c 12)"; done; echo; wait $C; mem "after upload 1"
ID=$(python3 -c "import json;print(json.load(open('$R/up.json'))['file']['id'])")
curl -s -o /dev/null -X POST -H "$HOST" -H "$ORIGIN" -b "$CK" -H 'X-File-Name: b.bam' -H 'Idempotency-Key: p2' -T $F "$P"; mem "after upload 2 (unthrottled)"
curl -s -o /dev/null -H "$HOST" -b "$CK" "$P/$ID/download"; mem "after download 1"
curl -s -o /dev/null -H "$HOST" -b "$CK" "$P/$ID/download"; mem "after download 2"
curl -s -o /dev/null --max-time 1 --limit-rate 5M -H "$HOST" -b "$CK" "$P/$ID/download"; sleep 2; mem "after aborted download"
curl -s -o /dev/null --max-time 1 -X POST -H "$HOST" -H "$ORIGIN" -b "$CK" -H 'X-File-Name: d.bin' -H 'Idempotency-Key: p3' --limit-rate 5M -T $F "$P"; sleep 3; mem "after dropped upload"
for i in 1 2 3 4 5 6; do curl -s -o /dev/null --max-time 4 --limit-rate 2M -H "$HOST" -b "$CK" "$P/$ID/download" & done; wait; sleep 2; mem "after 6 parallel throttled downloads"
