#!/usr/bin/env bash
# Lists upstream files the Tijorat+ fork has modified and fails when one of them is not
# declared in TIJORAT_FORK.md. Files the fork adds are not checked: they cannot conflict.
#
# Usage: scripts/tijorat/upstream-diff.sh [upstream-ref]
#   upstream-ref defaults to $UPSTREAM_REF, then upstream/main, then origin/main.
set -euo pipefail

root="$(git rev-parse --show-toplevel)"
cd "$root"

ref="${1:-${UPSTREAM_REF:-}}"
if [[ -z "$ref" ]]; then
  for candidate in upstream/main origin/main; do
    if git rev-parse --verify --quiet "$candidate" >/dev/null; then
      ref="$candidate"
      break
    fi
  done
fi
if [[ -z "$ref" ]]; then
  echo "No upstream ref found; pass one or set UPSTREAM_REF." >&2
  exit 2
fi

base="$(git merge-base HEAD "$ref")"

# Modified, deleted and renamed upstream files, including uncommitted work.
mapfile -t changed < <(git diff --name-only --diff-filter=MDR "$base" -- | sort -u)

# Declared files: the backticked path in the first column of the table between the
# upstream-files markers in TIJORAT_FORK.md.
mapfile -t declared < <(
  sed -n '/<!-- upstream-files:start -->/,/<!-- upstream-files:end -->/p' TIJORAT_FORK.md |
    sed -n 's/^| *`\([^`]*\)`.*/\1/p' | sort -u
)

status=0
echo "Upstream files modified since $(git rev-parse --short "$base") ($ref):"
for file in "${changed[@]}"; do
  if printf '%s\n' "${declared[@]}" | grep -qxF "$file"; then
    echo "  ok        $file"
  else
    echo "  UNDECLARED $file"
    status=1
  fi
done

for file in "${declared[@]}"; do
  if ! printf '%s\n' "${changed[@]}" | grep -qxF "$file"; then
    echo "  stale     $file (declared in TIJORAT_FORK.md but unchanged)"
  fi
done

if [[ $status -ne 0 ]]; then
  echo
  echo "Declare every modified upstream file in TIJORAT_FORK.md, or move the change under a fork-owned path." >&2
fi
exit $status
