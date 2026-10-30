#!/usr/bin/env bash
# Manages ZITADEL email and SMS providers over the Admin API, including the HTTP providers the
# Management Console has no form for (the Tijorat+ branded emails use one, see TIJORAT_FORK.md).
#
# Usage: ZITADEL_PAT=<token> scripts/tijorat/notification-provider.sh <domain> <email|sms> <command> [args]
#
#   list                                   providers with id, type, state, host or endpoint
#   add-http <endpoint> [description]      create an inactive HTTP provider, print its signing key
#   update-http <id> <endpoint> [description] [--rotate-key]   description defaults to the current one
#   activate <id> | deactivate <id>
#   remove <id> [--yes]
#
# The token comes from ZITADEL_PAT only, never from an argument, so it stays out of shell history
# and the process list. It needs IAM_OWNER: a service user with a personal access token, added
# under Default Settings -> Administrators. <domain> is e.g. id-staging.tijorat.plus or a full URL.
set -euo pipefail

usage() {
  sed -n '5,11p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

[[ $# -ge 3 ]] || usage
domain="$1" kind="$2" command="$3"
shift 3
[[ "$kind" == email || "$kind" == sms ]] || usage

if [[ -z "${ZITADEL_PAT:-}" ]]; then
  echo "Set ZITADEL_PAT to a personal access token of a user with the IAM_OWNER role." >&2
  exit 2
fi
for tool in curl jq; do
  command -v "$tool" >/dev/null || { echo "$tool is required." >&2; exit 2; }
done

base="${domain%/}"
[[ "$base" == http://* || "$base" == https://* ]] || base="https://$base"
api="$base/admin/v1/$kind"

# call <method> <path> [json body]: prints the response body, fails with ZITADEL's message.
call() {
  local method="$1" path="$2" body="${3:-}" response status
  local args=(-sS -X "$method" -H "Authorization: Bearer $ZITADEL_PAT" -H "Accept: application/json" -w '\n%{http_code}')
  [[ -n "$body" ]] && args+=(-H "Content-Type: application/json" --data "$body")
  response="$(curl "${args[@]}" "$api$path")"
  status="${response##*$'\n'}"
  response="${response%$'\n'*}"
  if [[ "$status" != 2* ]]; then
    echo "ZITADEL answered HTTP $status: $(jq -r '.message // .' <<<"$response" 2>/dev/null || echo "$response")" >&2
    exit 1
  fi
  printf '%s\n' "$response"
}

need_id() {
  [[ -n "${1:-}" ]] || usage
}

print_key() {
  local id="$1" key="$2"
  echo "id:          $id"
  if [[ -n "$key" && "$key" != null ]]; then
    echo "signing key: $key"
    echo
    echo "Keep the signing key secret: store it where the receiving endpoint reads it"
    echo "(TIJORAT_EMAIL_SIGNING_KEY for the Tijorat+ login) and do not paste it into chats or tickets."
  fi
}

case "$command" in
  list)
    call POST /_search '{}' | jq -r '
      (.result // [])
      | (["ID", "TYPE", "STATE", "HOST / ENDPOINT", "DESCRIPTION"] | @tsv),
        (.[] | [
          .id,
          (if .smtp then "smtp" elif .http then "http" elif .twilio then "twilio" else "?" end),
          ((.state // "") | sub("^(EMAIL_PROVIDER|SMS_PROVIDER_CONFIG)_"; "")),
          (.smtp.host // .http.endpoint // .twilio.senderNumber // ""),
          (.description // "")
        ] | @tsv)' | awk -F'\t' '{ printf "%-20s %-7s %-9s %-60s %s\n", $1, $2, $3, $4, $5 }'
    ;;
  add-http)
    [[ -n "${1:-}" ]] || usage
    body="$(jq -n --arg endpoint "$1" --arg description "${2:-}" '{endpoint: $endpoint, description: $description}')"
    response="$(call POST /http "$body")"
    print_key "$(jq -r .id <<<"$response")" "$(jq -r .signingKey <<<"$response")"
    echo
    echo "The provider is inactive. Activate it with: $0 $domain $kind activate $(jq -r .id <<<"$response")"
    ;;
  update-http)
    need_id "${1:-}"
    [[ -n "${2:-}" ]] || usage
    id="$1" endpoint="$2" description="" rotate=false keep_description=true
    shift 2
    for arg in "$@"; do
      if [[ "$arg" == --rotate-key ]]; then
        rotate=true
      else
        description="$arg" keep_description=false
      fi
    done
    if $keep_description; then
      description="$(call GET "/$id" | jq -r '.config.description // ""')"
    fi
    body="$(jq -n --arg endpoint "$endpoint" --arg description "$description" --argjson rotate "$rotate" \
      '{endpoint: $endpoint, description: $description} + (if $rotate then {expirationSigningKey: "0s"} else {} end)')"
    response="$(call PUT "/http/$id" "$body")"
    print_key "$id" "$(jq -r '.signingKey // empty' <<<"$response")"
    ;;
  activate | deactivate)
    need_id "${1:-}"
    call POST "/$1/_$command" '{}' >/dev/null
    echo "${command}d $kind provider $1"
    ;;
  remove)
    need_id "${1:-}"
    if [[ "${2:-}" != --yes ]]; then
      read -r -p "Remove $kind provider $1 from $base? Type the id to confirm: " answer
      [[ "$answer" == "$1" ]] || { echo "Not removed." >&2; exit 1; }
    fi
    call DELETE "/$1" >/dev/null
    echo "removed $kind provider $1"
    ;;
  *)
    usage
    ;;
esac
