#!/bin/bash
E="$(cd "$(dirname "$0")" && pwd)"; R=$E/run; B=http://127.0.0.1:18080; P=$B/_svc/workbench/api/storage/me/files; U=$B/_svc/workbench/api/storage/me/usage
HOST='Host: webstudio.omnibioai.org'; ORIGIN='Origin: https://webstudio.omnibioai.org'; T=$(cat $R/token); CK="omnibioai_access_token=$T"
SIZE=95000000; F=$E/run/blob.bin; head -c $SIZE /dev/urandom > $F; SHA=$(sha256sum $F | cut -d' ' -f1)
pass(){ echo "PASS $1"; }; fail(){ echo "FAIL $1"; FAILS=$((FAILS+1)); }; FAILS=0
check(){ [ "$2" == "$3" ] && pass "$1 ($2)" || fail "$1 got=$2 want=$3"; }
jqf(){ python3 -c "import json,sys;d=json.load(sys.stdin);print(eval(sys.argv[1]))" "$1" 2>/dev/null; }
for i in $(seq 1 90); do [ "$(curl -s -o /dev/null -w '%{http_code}' -m 3 -H "$HOST" $B/health)" == 200 ] && break; sleep 2; done
# warm the lazily imported code paths so RSS below measures transfers only
WID=$(curl -s -X POST -H "$HOST" -H "$ORIGIN" -b "$CK" -H 'X-File-Name: warm.bin' -H 'Idempotency-Key: warm' --data-binary warm "$P" | jqf "d['file']['id']")
curl -s -o /dev/null -H "$HOST" -b "$CK" "$P/$WID/download"; curl -s -o /dev/null -H "$HOST" -b "$CK" "$P"; curl -s -o /dev/null -X DELETE -H "$HOST" -H "$ORIGIN" -b "$CK" "$P/$WID"
wbpid1=$(docker exec myfiles-e2e-wb sh -c 'grep VmHWM /proc/1/status' | awk '{print $2}')
USED0=$(curl -s -H "$HOST" -b "$CK" $U | jqf "d['used_bytes']"); echo "start used_bytes=$USED0, workbench peak RSS $wbpid1 kB"
curl -s -H "$HOST" -b "$CK" "$P" -o $R/list0.json -w 'list_http=%{http_code}\n'; jqf "(d['total_count'],d['max_upload_bytes'],d['active_organization'])" < $R/list0.json
# streaming: bytes reach the tenant folder while the client is still sending
curl -s -o $R/up.json -w '%{http_code}' -X POST -H "$HOST" -H "$ORIGIN" -b "$CK" -H 'Content-Type: application/octet-stream' -H 'X-File-Name: e2e%20genome.bam' -H 'Idempotency-Key: e2e-upload-1' --limit-rate 25M -T $F "$P" > $R/up.code &
CP=$!; sleep 1.5; PARTIAL=$(find $R/tenants -name payload -printf '%s\n' | head -1); wait $CP
[ -n "$PARTIAL" ] && [ "$PARTIAL" -gt 0 ] && [ "$PARTIAL" -lt $SIZE ] && pass "upload streams through router ($PARTIAL bytes on disk mid-upload)" || fail "streaming partial='$PARTIAL'"
check "upload via cookie" "$(cat $R/up.code)" 201
ID=$(jqf "d['file']['id']" < $R/up.json); check "upload checksum" "$(jqf "d['file']['checksum']" < $R/up.json)" $SHA
check "list count" "$(curl -s -H "$HOST" -b "$CK" "$P" | jqf "d['total_count']")" 1
LT=$(curl -s -H "$HOST" -b "$CK" "$P" | jqf "d['total_bytes']"); UT=$(curl -s -H "$HOST" -b "$CK" $U | jqf "d['used_bytes']")
check "list total equals used_bytes" "$LT" "$UT"; check "used grew by file" "$UT" $((USED0+SIZE))
curl -s -D $R/dl.head -o $R/dl.bin -H "$HOST" -b "$CK" "$P/$ID/download"
check "download checksum matches" "$(sha256sum $R/dl.bin | cut -d' ' -f1)" $SHA
grep -i '^content-disposition' $R/dl.head | tr -d '\r'; grep -iE '^(etag|x-content-type|accept-ranges|content-type)' $R/dl.head | tr -d '\r' | cut -c1-90
head -c 40000000 $R/dl.bin > $R/resume.bin
CODE=$(curl -s -o $R/tail.bin -w '%{http_code}' -H "$HOST" -b "$CK" -H 'Range: bytes=40000000-' -H "If-Range: \"$SHA\"" "$P/$ID/download"); check "range status" $CODE 206
cat $R/tail.bin >> $R/resume.bin; check "resumed download checksum" "$(sha256sum $R/resume.bin | cut -d' ' -f1)" $SHA; rm -f $R/dl.bin $R/tail.bin $R/resume.bin
check "bare path with bearer lists" "$(curl -s -o /dev/null -w '%{http_code}' -H "$HOST" -H "Authorization: Bearer $T" $B/api/storage/me/files)" 200
check "bare path without bearer" "$(curl -s -o /dev/null -w '%{http_code}' -H "$HOST" -b "$CK" $B/api/storage/me/files)" 401
check "cross-origin upload" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$HOST" -H 'Origin: https://evil.example' -b "$CK" -H 'X-File-Name: a' -H 'Idempotency-Key: x' --data-binary abc "$P")" 403
check "cross-origin delete" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "$HOST" -H 'Origin: https://evil.example' -b "$CK" "$P/$ID")" 403
# over-limit: router answers from the header, nothing is sent upstream or reserved
truncate -s 95000001 $R/over.bin; BEFORE=$(curl -s -H "$HOST" -b "$CK" $U | jqf "d['reserved_bytes']")
curl -s -o $R/over.json -w '%{http_code}\n' -X POST -H "$HOST" -H "$ORIGIN" -b "$CK" -H 'X-File-Name: big.bin' -H 'Idempotency-Key: over' -T $R/over.bin "$P" > $R/over.code
check "over-limit status" "$(cat $R/over.code)" 413; check "over-limit JSON code" "$(jqf "d['code']" < $R/over.json)" upload_too_large
check "over-limit no reservation" "$(curl -s -H "$HOST" -b "$CK" $U | jqf "d['reserved_bytes']")" "$BEFORE"; rm -f $R/over.bin
# dropped connection
curl -s -o /dev/null --max-time 1 -X POST -H "$HOST" -H "$ORIGIN" -b "$CK" -H 'X-File-Name: drop.bin' -H 'Idempotency-Key: e2e-drop-1' --limit-rate 5M -T $F "$P"; sleep 4
check "dropped upload no reservation left" "$(curl -s -H "$HOST" -b "$CK" $U | jqf "d['reserved_bytes']")" 0
check "dropped upload no payload left" "$(find $R/tenants -name payload | wc -l)" 1
check "dropped upload key reusable" "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H "$HOST" -H "$ORIGIN" -b "$CK" -H 'X-File-Name: drop.bin' -H 'Idempotency-Key: e2e-drop-1' --data-binary small "$P")" 201
DROPID=$(curl -s -H "$HOST" -b "$CK" "$P?q=drop" | jqf "d['files'][0]['id']"); curl -s -o /dev/null -X DELETE -H "$HOST" -H "$ORIGIN" -b "$CK" "$P/$DROPID"
# concurrency limit (6 per client)
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -o /dev/null --limit-rate 2M --max-time 4 -w '%{http_code}\n' -H "$HOST" -b "$CK" "$P/$ID/download" >> $R/conc.txt & done; wait
echo "parallel downloads: $(sort $R/conc.txt | uniq -c | tr '\n' ' ')"; [ "$(grep -c 429 $R/conc.txt)" -ge 4 ] && pass "concurrency limit returns 429" || fail "concurrency limit"; sleep 2
wbpid2=$(docker exec myfiles-e2e-wb sh -c 'grep VmHWM /proc/1/status' | awk '{print $2}'); echo "workbench peak RSS after transfers $wbpid2 kB (grew $((wbpid2-wbpid1)) kB)"
[ $((wbpid2-wbpid1)) -lt 60000 ] && pass "memory stays bounded for 95 MB transfers" || fail "memory grew"
check "delete" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "$HOST" -H "$ORIGIN" -b "$CK" "$P/$ID")" 200
check "repeat delete" "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE -H "$HOST" -H "$ORIGIN" -b "$CK" "$P/$ID")" 200
check "used_bytes back to start" "$(curl -s -H "$HOST" -b "$CK" $U | jqf "d['used_bytes']")" $USED0
check "no payload on disk" "$(find $R/tenants -name payload | wc -l)" 0
check "list empty" "$(curl -s -H "$HOST" -b "$CK" "$P" | jqf "d['total_count']")" 0
rm -f $F; echo "E2E failures: $FAILS"
