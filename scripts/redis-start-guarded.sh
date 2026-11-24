#!/bin/sh
# redis-start-guarded.sh -- Redis entrypoint wrapper: repair ONE known AOF failure, then start as usual.
#
# 2026-11-21 a power loss left a malformed tail on the last AOF incr file. Redis refused to
# start ("Bad file format reading the append only file ..."), crash-looped for ~5 min, and
# took Auth (and with it TES's ToolServer registration) down until the owner ran
# `redis-check-aof --fix` by hand. aof-load-truncated does not cover this case: it only
# accepts a final command that is cut short, not garbage/zeros after it.
#
# Exactly one case is repaired, automatically and once:
#   - redis-check-aof reports a format error in the LAST incr file of the manifest, and
#   - what --fix would discard (its `diff=`) is at most AOF_AUTOFIX_MAX_BYTES (64 KiB).
# Then: back up appendonlydir, run `redis-check-aof --fix`, re-check, record the repair and
# log an alert line (REDIS-AOF-AUTOFIX) that a host self-check turns into an alert.
# Anything else (a valid AOF, a tail that aof-load-truncated already accepts, corruption in
# the middle or in another file, a larger tail, a repair already done for this exact file
# and size) changes nothing: Redis starts exactly as before and fails as before.
#
# Runs as root in the redis:7-alpine image before its own docker-entrypoint.sh, which still
# chowns /data and drops to the redis user. Mounted read-only by docker-compose.yml.
set -eu

DATA_DIR="${AOF_DATA_DIR:-/data}"
AOF_DIR="$DATA_DIR/${AOF_DIRNAME:-appendonlydir}"
MANIFEST="${AOF_MANIFEST:-appendonly.aof.manifest}"
MAX_BYTES="${AOF_AUTOFIX_MAX_BYTES:-65536}"
STATE_DIR="$DATA_DIR/aof-autofix"
NEXT="${AOF_NEXT_ENTRYPOINT:-docker-entrypoint.sh}"

log() { echo "redis-start-guarded: $*" >&2; }
start() { exec "$NEXT" "$@"; }

if [ ! -f "$AOF_DIR/$MANIFEST" ]; then
  start "$@"
fi

report="$(cd "$AOF_DIR" && redis-check-aof "$MANIFEST" 2>&1)" && start "$@"

last_incr="$(awk '$NF == "i" { f = $2 } END { print f }' "$AOF_DIR/$MANIFEST")"
analyzed="$(printf '%s\n' "$report" | grep -E '^AOF analyzed: filename=' | tail -1)"
bad_file="$(printf '%s\n' "$analyzed" | sed -nE 's/^AOF analyzed: filename=([^,]+),.*/\1/p')"
size="$(printf '%s\n' "$analyzed" | sed -nE 's/.* size=([0-9]+),.*/\1/p')"
diff="$(printf '%s\n' "$analyzed" | sed -nE 's/.* diff=([0-9]+).*/\1/p')"

if [ -z "$last_incr" ] || [ "$bad_file" != "$last_incr" ] \
   || ! printf '%s\n' "$report" | grep -qxF "AOF $last_incr format error" \
   || [ -z "$diff" ] || [ "$diff" -gt "$MAX_BYTES" ]; then
  log "AOF not valid, but not the repairable case (file=${bad_file:-?} last_incr=${last_incr:-?} diff=${diff:-?}); starting unchanged"
  start "$@"
fi

done_marker="$STATE_DIR/$last_incr.$size.fixed"
if [ -e "$done_marker" ]; then
  log "already repaired $last_incr at size $size once ($done_marker); not repairing again; starting unchanged"
  start "$@"
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)-$$"
mkdir -p "$STATE_DIR"
backup="$STATE_DIR/backup-$stamp"
cp -a "$AOF_DIR" "$backup"
log "backed up $AOF_DIR to $backup"

fix_out="$(cd "$AOF_DIR" && printf 'y\n' | redis-check-aof --fix "$MANIFEST" 2>&1)" || true
if ! (cd "$AOF_DIR" && redis-check-aof "$MANIFEST" >/dev/null 2>&1); then
  log "repair did not produce a valid AOF; backup kept at $backup; starting unchanged"
  printf '%s\n' "$fix_out" >&2
  : > "$done_marker"
  start "$@"
fi

{
  echo "time=$stamp file=$last_incr size_before=$size discarded_bytes=$diff backup=$backup"
  printf '%s\n' "$report" | tail -3
} > "$STATE_DIR/ALERT-$stamp.txt"
: > "$done_marker"
log "REDIS-AOF-AUTOFIX: repaired $last_incr (discarded $diff bytes after a format error); backup $backup; see $STATE_DIR/ALERT-$stamp.txt"
start "$@"
