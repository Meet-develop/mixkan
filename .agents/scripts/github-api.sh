#!/bin/bash
# GitHub REST API ヘルパー
# MCP が使えない環境（CODEX・CI・初回セッション等）でも動作する汎用スクリプト。
# .env.local または環境変数から GITHUB_PERSONAL_ACCESS_TOKEN を読み込む。
#
# 使い方:
#   ./github-api.sh create-issue --title "タイトル" --label "bug" --body "本文"
#   ./github-api.sh create-branch --branch "gh-42-feature" --from "develop"
#   ./github-api.sh create-pr --title "PR" --branch "gh-42-feature" --issue 42 --body "本文"
#   ./github-api.sh get-issue --issue 42
#   ./github-api.sh list-issues

set -euo pipefail

# ── パス解決 ──
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

# ── .env.local 読み込み ──
if [ -f "$PROJECT_ROOT/.env.local" ]; then
  set -a
  source "$PROJECT_ROOT/.env.local"
  set +a
fi

# ── 設定値 ──
TOKEN="${GITHUB_PERSONAL_ACCESS_TOKEN:-}"
REPO="${GITHUB_REPO:-Meet-develop/mixkan}"
BASE_BRANCH="${GITHUB_BASE_BRANCH:-develop}"
API="https://api.github.com"

if [ -z "$TOKEN" ]; then
  echo "Error: GITHUB_PERSONAL_ACCESS_TOKEN が設定されていません。" >&2
  echo "  .env.local に GITHUB_PERSONAL_ACCESS_TOKEN=ghp_... を設定してください。" >&2
  exit 1
fi

# ── 共通 curl 関数 ──
gh_api() {
  local method="$1"; shift
  local endpoint="$1"; shift
  curl -s -X "$method" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Accept: application/vnd.github+json" \
    -H "X-GitHub-Api-Version: 2022-11-28" \
    "$API$endpoint" \
    "$@"
}

# ── コマンドパーサー ──
COMMAND="${1:-help}"
shift || true

TITLE=""
BODY=""
LABELS=""
BRANCH=""
FROM_BRANCH="$BASE_BRANCH"
ISSUE_NUMBER=""
BASE_PR="$BASE_BRANCH"
DRAFT="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --title)   TITLE="$2"; shift 2 ;;
    --body)    BODY="$2";  shift 2 ;;
    --label|--labels) LABELS="$2"; shift 2 ;;
    --branch)  BRANCH="$2"; shift 2 ;;
    --from)    FROM_BRANCH="$2"; shift 2 ;;
    --issue)   ISSUE_NUMBER="$2"; shift 2 ;;
    --base)    BASE_PR="$2"; shift 2 ;;
    --draft)   DRAFT="true"; shift ;;
    *) echo "Unknown option: $1" >&2; shift ;;
  esac
done

case "$COMMAND" in

  # ── Issue作成 ──
  create-issue)
    if [ -z "$TITLE" ]; then echo "Error: --title が必要です" >&2; exit 1; fi

    # labels を JSON 配列に変換
    LABELS_JSON="[]"
    if [ -n "$LABELS" ]; then
      LABELS_JSON="$(echo "$LABELS" | tr ',' '\n' | jq -Rsc 'split("\n") | map(select(length > 0))')"
    fi

    PAYLOAD="$(jq -n \
      --arg title "$TITLE" \
      --arg body  "$BODY" \
      --argjson labels "$LABELS_JSON" \
      '{title: $title, body: $body, labels: $labels}')"

    RESULT="$(gh_api POST "/repos/$REPO/issues" -d "$PAYLOAD")"
    ISSUE_URL="$(echo "$RESULT" | jq -r '.html_url')"
    ISSUE_NUM="$(echo "$RESULT" | jq -r '.number')"

    echo "ISSUE_NUMBER=$ISSUE_NUM"
    echo "ISSUE_URL=$ISSUE_URL"
    ;;

  # ── ブランチ作成 ──
  create-branch)
    if [ -z "$BRANCH" ]; then echo "Error: --branch が必要です" >&2; exit 1; fi

    # FROM_BRANCH の最新コミット SHA を取得
    SHA="$(gh_api GET "/repos/$REPO/git/ref/heads/$FROM_BRANCH" | jq -r '.object.sha')"
    if [ "$SHA" = "null" ] || [ -z "$SHA" ]; then
      echo "Error: ブランチ '$FROM_BRANCH' が見つかりません" >&2; exit 1
    fi

    RESULT="$(gh_api POST "/repos/$REPO/git/refs" \
      -d "{\"ref\":\"refs/heads/$BRANCH\",\"sha\":\"$SHA\"}")"

    echo "BRANCH=$BRANCH"
    echo "SHA=$SHA"
    echo "URL=https://github.com/$REPO/tree/$BRANCH"
    ;;

  # ── PR作成 ──
  create-pr)
    if [ -z "$TITLE" ] || [ -z "$BRANCH" ]; then
      echo "Error: --title と --branch が必要です" >&2; exit 1
    fi

    # issue 番号を本文に追加
    if [ -n "$ISSUE_NUMBER" ] && [[ "$BODY" != *"Closes #"* ]]; then
      BODY="$BODY

Closes #$ISSUE_NUMBER"
    fi

    PAYLOAD="$(jq -n \
      --arg title  "$TITLE" \
      --arg head   "$BRANCH" \
      --arg base   "$BASE_PR" \
      --arg body   "$BODY" \
      --argjson draft "$DRAFT" \
      '{title: $title, head: $head, base: $base, body: $body, draft: $draft}')"

    RESULT="$(gh_api POST "/repos/$REPO/pulls" -d "$PAYLOAD")"
    PR_URL="$(echo "$RESULT" | jq -r '.html_url')"
    PR_NUM="$(echo "$RESULT" | jq -r '.number')"

    echo "PR_NUMBER=$PR_NUM"
    echo "PR_URL=$PR_URL"
    ;;

  # ── Issue取得 ──
  get-issue)
    if [ -z "$ISSUE_NUMBER" ]; then echo "Error: --issue が必要です" >&2; exit 1; fi
    gh_api GET "/repos/$REPO/issues/$ISSUE_NUMBER" | jq '{number:.number, title:.title, state:.state, url:.html_url}'
    ;;

  # ── Issue一覧 ──
  list-issues)
    gh_api GET "/repos/$REPO/issues?state=open&per_page=20" | jq '.[] | {number:.number, title:.title, labels:[.labels[].name]}'
    ;;

  help|*)
    cat <<'HELP'
使い方:
  github-api.sh <command> [options]

コマンド:
  create-issue  --title "タイトル" [--label "bug,enhancement"] [--body "本文"]
  create-branch --branch "gh-42-feature" [--from "develop"]
  create-pr     --title "PR title" --branch "gh-42-feature" --issue 42 [--body "本文"] [--base develop]
  get-issue     --issue 42
  list-issues

環境変数 (.env.local で設定):
  GITHUB_PERSONAL_ACCESS_TOKEN  GitHub PAT (必須)
  GITHUB_REPO                   リポジトリ (デフォルト: Meet-develop/mixkan)
  GITHUB_BASE_BRANCH            ベースブランチ (デフォルト: develop)
HELP
    ;;
esac
