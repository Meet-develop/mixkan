---
name: new-feature
description: 新機能を実装する。Issue作成→ブランチ作成→実装→PRまでの一連のワークフローを実行する。新機能・追加実装・機能拡張の依頼で積極的に呼び出すこと。
argument-hint: --title "機能名"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Skill: new-feature

新機能の完全実装ワークフロー。Issue 作成から PR 作成まで一貫して実行する。
Issue・PR の本文は `.github/` のテンプレートを参照すること。インラインで書かないこと。

## 前提条件

- `gh` CLI がインストール・認証済みであること
- ベースブランチ: `develop`
- リポジトリ: `Meet-develop/mixkan`

## Phase 1 — Issue 作成

`create-issue` スキルを呼び出し、`--type feat` を指定して Issue を作成する。
テンプレート: `.github/ISSUE_TEMPLATE/feature_request.md`

Issue 番号（`ISSUE_NUMBER`）を取得して次の Phase で使用する。

## Phase 2 — ブランチ作成

```bash
git fetch origin develop
git checkout -b gh-${ISSUE_NUMBER}-<feature-slug> origin/develop
```

`<feature-slug>` はケバブケースで機能を短く表現（例: `add-triangle-vote`）。

## Phase 3 — 実装

機能の仕様に従い実装する。推奨順序:
1. Prisma スキーマ変更（DB 変更がある場合）
2. API エンドポイントの更新
3. フロントエンドコンポーネントの更新
4. 型定義の整合

### Prisma マイグレーション（DB 変更がある場合）

```bash
# Docker 環境内で実行
docker compose exec app npm run db:migrate:dev
```

## Phase 4 — コミット

```bash
git add <変更ファイル>
git commit -m "feat: <変更内容の簡潔な説明>

Refs #${ISSUE_NUMBER}"
```

## Phase 5 — PR 作成

`create-pr` スキルを呼び出す。テンプレート: `.github/PULL_REQUEST_TEMPLATE.md`
- base: `develop`
- `Closes #${ISSUE_NUMBER}` を本文に含める

## プロジェクト固有メモ

```
app/api/         # API ルート
components/      # コンポーネント
prisma/          # DB スキーマ・マイグレーション
```

コーディング規約は `AGENTS.md` を参照。
