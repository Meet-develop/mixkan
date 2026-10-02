---
name: fix-bug
description: バグを修正する。Issue作成→ブランチ作成→修正→PRまでの一連のワークフローを実行する。バグ報告・不具合修正・エラー解消の依頼で積極的に呼び出すこと。
argument-hint: --title "バグ概要"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Skill: fix-bug

バグ修正の完全ワークフロー。Issue 作成から PR 作成まで一貫して実行する。
Issue・PR の本文は `.github/` のテンプレートを参照すること。インラインで書かないこと。

## 前提条件

- `gh` CLI がインストール・認証済みであること
- ベースブランチ: `develop`
- リポジトリ: `Meet-develop/mixkan`

## Phase 1 — Issue 作成

`create-issue` スキルを呼び出し、`--type fix` を指定して Issue を作成する。
テンプレート: `.github/ISSUE_TEMPLATE/bug_report.md`

Issue 番号（`ISSUE_NUMBER`）を取得して次の Phase で使用する。

## Phase 2 — ブランチ作成

```bash
git fetch origin develop
git checkout -b gh-${ISSUE_NUMBER}-fix-<bug-slug> origin/develop
```

`<bug-slug>` はケバブケースでバグを短く表現（例: `fix-vote-null-error`）。

## Phase 3 — バグ修正

根本原因を特定してから最小限の変更で修正する。

```bash
# TypeScript 型エラー確認
npx tsc --noEmit

# Prisma スキーマ確認
npx prisma validate
```

## Phase 4 — コミット

```bash
git add <変更ファイル>
git commit -m "fix: <修正内容の簡潔な説明>

Fixes #${ISSUE_NUMBER}"
```

## Phase 5 — PR 作成

`create-pr` スキルを呼び出す。テンプレート: `.github/PULL_REQUEST_TEMPLATE.md`
- base: `develop`
- `Fixes #${ISSUE_NUMBER}` を本文に含める
