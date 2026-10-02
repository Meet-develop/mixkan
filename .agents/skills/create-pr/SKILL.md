---
name: create-pr
description: 作業ブランチからdevelopへのPull Requestを作成する。PR作成を依頼されたとき・new-feature/fix-bugワークフローの最終ステップとして積極的に呼び出すこと。
argument-hint: --title "タイトル" --issue 42
allowed-tools:
  - Bash
  - Read
---

# Skill: create-pr

`.github/PULL_REQUEST_TEMPLATE.md` を読み込んで Pull Request を作成する。
テンプレートの内容をインラインで書き直さないこと。必ず `.github/` のファイルを参照すること。

## 前提条件

- 作業ブランチが remote にプッシュ済みであること（未プッシュなら `git push -u origin <branch>` を実行）
- リポジトリ: `Meet-develop/mixkan`
- ベースブランチ: `develop`

## Step 1 — 変更内容を把握する

```bash
git log develop..HEAD --oneline
git diff develop...HEAD --stat
```

## Step 2 — PR テンプレートを読み込む

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cat "$REPO_ROOT/.github/PULL_REQUEST_TEMPLATE.md"
```

テンプレートの各セクション（`## 概要`、`## 影響範囲`、`## 変更点`、`## QA 観点`、`## 動作確認ケース`）に実際の内容を埋める。
`<!-- ... -->` コメントは除去する。
`Closes #<issue番号>` を `## 概要` 末尾に追記する。

## Step 3 — PR を作成する

```bash
gh pr create \
  --repo Meet-develop/mixkan \
  --base develop \
  --head <branch-name> \
  --title "<PRタイトル>" \
  --body "<Step 2 で生成したテンプレート本文>"
```

## Step 4 — PR URL を出力する

```
PR_NUMBER=66
PR_URL=https://github.com/Meet-develop/mixkan/pull/66
```
