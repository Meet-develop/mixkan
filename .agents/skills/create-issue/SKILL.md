---
name: create-issue
description: GitHubにIssueを作成する。機能追加・バグ修正・改善の3種類のテンプレートをサポートする。Issue作成を依頼されたとき・new-feature/fix-bugワークフローの一部として積極的に呼び出すこと。
argument-hint: --type feat|fix|improve --title "タイトル"
allowed-tools:
  - Bash
  - Read
---

# Skill: create-issue

`.github/ISSUE_TEMPLATE/` のテンプレートを読み込んで GitHub Issue を作成する。
テンプレートの内容をインラインで書き直さないこと。必ず `.github/` のファイルを参照すること。

## 前提条件

- `gh` CLI がインストール・認証済みであること
- リポジトリ: `Meet-develop/mixkan`

## Step 1 — Issue の種類を判断する

引数の `--type` またはユーザーの依頼内容から判断する:

| 種類 | テンプレート | タイトルプレフィックス | ラベル |
|---|---|---|---|
| 機能追加 (`feat`) | `.github/ISSUE_TEMPLATE/feature_request.md` | `[FEAT]` | `enhancement` |
| バグ修正 (`fix`) | `.github/ISSUE_TEMPLATE/bug_report.md` | `[FIX]` | `bug` |
| 改善 (`improve`) | `.github/ISSUE_TEMPLATE/improvement.md` | `[IMPROVE]` | `improvement` |

## Step 2 — テンプレートを読み込む

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
# 種類に応じて適切なテンプレートファイルを読み込む
```

フロントマター（`---` で囲まれた YAML 部分）は除去して、Markdown 本文部分のみを Issue 本文に使用する。
各セクションの `<!-- ... -->` コメントを除去し、実際の内容を埋める。

## Step 3 — Issue を作成する

### 方法 A — GitHub MCP（Claude Code 推奨）

MCP の `mcp__github__create_issue` ツールを使用する（設定済みの場合）。

### 方法 B — gh CLI

```bash
gh issue create \
  --repo Meet-develop/mixkan \
  --title "[FEAT] <タイトル>" \
  --label "enhancement" \
  --body "<Step 2 で生成したテンプレート本文>"
```

## Step 4 — Issue 番号を記録する

作成後に表示される Issue URL から番号を取得して出力する:

```
ISSUE_NUMBER=65
ISSUE_URL=https://github.com/Meet-develop/mixkan/issues/65
```

この番号を後続のブランチ作成・PR 作成で使用する。
