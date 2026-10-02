# AGENTS.md

このファイルはすべての AI エージェント（Claude Code・Antigravity CLI・GitHub Copilot・Cursor・Codex 等）が共通して読み込むプロジェクト共有コンテキストです。

## プロジェクト概要

**mixkan** — イベントの日程調整・出欠確認 Web アプリ。

- **フレームワーク**: Next.js (App Router)
- **ORM**: Prisma
- **DB**: PostgreSQL
- **言語**: TypeScript
- **リポジトリ**: `Meet-develop/mixkan`
- **デフォルトブランチ**: `develop`（main はリリース用）

## ブランチ命名規則

```
gh-{issue番号}-{機能・修正の短い説明（ケバブケース）}
例: gh-42-add-triangle-vote
    gh-43-fix-vote-null-error
```

## コーディング規約

- Prisma enum は PascalCase（例: `TimeAvailability`）
- DB カラムは snake_case（`@map` でマッピング）
- API レスポンスは camelCase
- コミットメッセージは Conventional Commits に従う（`feat:` / `fix:` / `chore:` 等）

## 共有スキル（.agents/skills/）

```
.agents/
└── skills/                    ← 全エージェント共通の正規フォルダ
    ├── create-issue/SKILL.md  ← GitHub Issue 作成
    ├── create-pr/SKILL.md     ← Pull Request 作成
    ├── fix-bug/SKILL.md       ← バグ修正ワークフロー
    ├── new-feature/SKILL.md   ← 新機能実装ワークフロー
    └── pr-review/SKILL.md     ← 並列 PR レビュー
```

各ツールのアクセス方法:
- **Antigravity CLI**: `.agents/skills/` をネイティブに読み込む
- **GitHub Copilot**: `.agents/skills/` をネイティブに読み込む
- **Claude Code**: `.claude/skills/` → `../.agents/skills/` シンボリックリンク経由

## 共有スクリプト（.agents/scripts/）

```
.agents/
└── scripts/                        ← 全エージェント共通のスクリプト
    ├── github-api.sh               ← GitHub REST API ラッパー
    └── mcp-github-wrapper.sh       ← MCP GitHub ラッパー
```

### github-api.sh の使い方

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
SCRIPT="$REPO_ROOT/.agents/scripts/github-api.sh"

# Issue 作成
bash "$SCRIPT" create-issue --title "タイトル" --label "enhancement" --body "..."

# PR 作成
bash "$SCRIPT" create-pr --title "タイトル" --branch "gh-42-feature" --issue 42 --body "..."
```

前提: `$REPO_ROOT/.env.local` に `GITHUB_PERSONAL_ACCESS_TOKEN=ghp_...` を設定済みであること。

## GitHub テンプレート

Issue・PR の本文は常に `.github/` のテンプレートを読み込んで使用すること。テンプレートを独自にインラインで書かないこと。

| テンプレート | パス | 用途 |
|---|---|---|
| 機能追加 | `.github/ISSUE_TEMPLATE/feature_request.md` | `[FEAT]` Issue |
| バグ修正 | `.github/ISSUE_TEMPLATE/bug_report.md` | `[FIX]` Issue |
| 改善 | `.github/ISSUE_TEMPLATE/improvement.md` | `[IMPROVE]` Issue |
| PR 本文 | `.github/PULL_REQUEST_TEMPLATE.md` | すべての PR |

## 重要なディレクトリ

```
app/
  api/events/[id]/votes/   # 投票 API
  events/[id]/             # イベント詳細ページ
components/features/events/ # イベント関連コンポーネント
prisma/
  schema.prisma            # DB スキーマ（変更時は migrate dev）
  migrations/              # マイグレーション履歴
.github/ISSUE_TEMPLATE/    # Issue テンプレート（feature_request / bug_report / improvement）
.github/PULL_REQUEST_TEMPLATE.md # PR テンプレート
.agents/skills/            # 共有スキル（全エージェント）
.agents/scripts/           # 共有スクリプト（全エージェント）
```

## ローカル開発環境の起動

このプロジェクトは **Docker Compose** でローカル DB ごと起動する。
`npm run db:migrate` をホストで直接実行すると `db:5432` に接続できないため、**必ず Docker を使うこと**。

```bash
# 起動（DB + Next.js + 自動マイグレーション）
docker compose up --build

# バックグラウンド起動
docker compose up -d --build

# ログ確認
docker compose logs -f app
```

### マイグレーション

```bash
# ローカル DB への適用（Docker コンテナ内）
docker compose exec app npm run db:migrate:dev

# 本番 / Supabase DB への直接適用
npm run db:migrate:prod
```

### テストデータ投入

```bash
docker compose exec app npm run db:seed
```

## Prisma スキーマ変更時の手順

```bash
# 1. schema.prisma を編集
# 2. マイグレーション作成・適用
docker compose exec app npm run db:migrate:dev
# 3. クライアント再生成は自動で行われる
```
