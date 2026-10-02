---
name: pr-review
description: "PRを専門エージェントで包括的にレビューする。コード品質・テスト・エラーハンドリング・型設計・コメント・簡潔化・ビルド検証の観点でレビューを実施する。PR作成前・マージ前確認・コードレビュー依頼で積極的に呼び出すこと。レビュー観点を絞る場合は引数で指定できる（例: /pr-review tests errors build）。"
argument-hint: "[build] [code] [tests] [errors] [types] [comments] [simplify] [all] [parallel]"
allowed-tools:
  - Bash
  - Glob
  - Grep
  - Read
  - Agent
---

# Comprehensive PR Review

mixkan 向けの包括的 PR レビュー。複数の専門エージェントで PR を精査し、マージ前の品質を保証する。

**レビュー引数:** "$ARGUMENTS"

---

## Step 1 — レビュー対象を特定する

```bash
# 変更ファイル一覧を取得
git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only origin/develop...HEAD

# PR が存在する場合は PR 情報も取得
gh pr view --json number,title,baseRefName,additions,deletions,changedFiles 2>/dev/null || true
```

引数を解析する:
- 引数なし or `all` → 全観点を実行
- `parallel` → 全エージェントを並列起動（デフォルトは逐次）
- 個別指定（例: `tests errors`）→ 指定された観点のみ

---

## Step 2 — 適用する観点を決定する

| 観点 | 引数キー | 対応エージェント | 適用条件 |
|---|---|---|---|
| **ビルド検証** | `build` | ─（直接実行） | 常に適用（最優先） |
| **コード品質** | `code` | `pr-review-toolkit:code-reviewer` | 常に適用 |
| **テスト** | `tests` | `pr-review-toolkit:pr-test-analyzer` | テストファイルまたはロジック変更時 |
| **エラーハンドリング** | `errors` | `pr-review-toolkit:silent-failure-hunter` | 常に適用 |
| **型設計** | `types` | `pr-review-toolkit:type-design-analyzer` | TypeScript 型が追加・変更された場合 |
| **コメント** | `comments` | `pr-review-toolkit:comment-analyzer` | コメント・ドキュメントが変更された場合 |
| **簡潔化** | `simplify` | `pr-review-toolkit:code-simplifier` | レビュー通過後のポリッシュ用 |

変更ファイルのパターンで自動判定:
- `**/*.test.ts` `**/*.spec.ts` → `tests` を適用
- `**/*.ts` `**/*.tsx` で型定義あり → `types` を適用
- `try` / `catch` / `error` の変更 → `errors` を適用

---

## Step 3 — ビルド検証（`build` 観点）

**必ず最初に実行する。ビルドが失敗した場合はエージェントレビューを中断して報告すること。**

```bash
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "=== TypeScript 型チェック ==="
npx tsc --noEmit 2>&1

echo "=== ESLint ==="
npm run lint 2>&1

echo "=== Next.js ビルド ==="
# 注意: next build は prisma generate を含む（package.json: "build": "prisma generate && next build"）
# DATABASE_URL が必要な場合は .env.local を参照
npm run build 2>&1
```

ビルド結果を報告:
- ✅ 成功 → エージェントレビューに進む
- ❌ TypeScript エラー → 型エラーをリストアップして **Critical** として報告
- ❌ Lint エラー → **Important** として報告
- ❌ Build エラー → ビルドエラーをリストアップして **Critical** として報告、**エージェントレビューを中断**

---

## Step 4 — エージェントレビューを起動する

### 逐次実行（デフォルト）

`parallel` 引数がない場合は 1 エージェントずつ順番に実行する。各レポートを確認してから次に進む。

適用する各エージェントに以下の情報を渡す:

```
PR の変更内容をレビューしてください。

【対象変更の取得方法】
git diff --name-only HEAD~1 HEAD 2>/dev/null || git diff --name-only origin/develop...HEAD
git diff HEAD~1 HEAD 2>/dev/null || git diff origin/develop...HEAD

【プロジェクト情報】
- リポジトリ: Meet-develop/mixkan
- フレームワーク: Next.js (App Router) + Prisma + PostgreSQL + TypeScript
- ガイドライン: リポジトリルートの AGENTS.md を参照
- ブランチ: develop がベースブランチ

【注意事項】
- 信頼度 80 以上の問題のみ報告すること
- ファイルパスと行番号を明示すること
```

### 並列実行（`parallel` 引数指定時）

**CRITICAL: 全エージェントを単一のレスポンスで同時に起動すること。**

適用する全エージェントに同じプロンプトを渡し、一括起動する。

---

## Step 5 — 結果を集約する

全エージェントの完了後（逐次の場合は都度確認）、以下のフォーマットでサマリーを出力する。**毎回必ずこの形式で出力すること。**

### 出力ルール

- 重要度は色付きアイコンで視覚的に区別する: 🔴 Critical / 🟠 Important / 🔵 Suggestions
- 各指摘は連番（🔴 1, 🟠 2, 🔵 3 …）を振り、見出しにファイル:行番号を併記する
- 各指摘には必ず次の 2 項目を書く:
  1. **問題点** — 非エンジニアでも理解できるよう噛み砕いて説明する（専門用語は使ってよいが、平易な言葉で補足する）。実際のコードを引用し、「どのタイミングで・どんな操作をすると・何が起きるか」を処理の流れで示す。このコードが引き起こすバグや影響を、実装と照らして具体的に書く。必要なら状況別の表を使う
  2. **改善案** — 具体的にどう修正するかをコード例付きで示す。修正に伴う注意点（他の呼び出し元への影響など）があれば添える
- 複数エージェントが同じ点を指摘した場合は 1 件に統合し、どのエージェントの指摘か明記する
- 指摘が 0 件の重要度セクションは「なし」と書く

### フォーマット

```markdown
# PR レビュー結果

対象: PR #N（タイトル）。ビルド検証の要約を 1〜2 行で書く。

## ビルド検証結果
| チェック | 結果 |
|---|---|
| TypeScript 型チェック | ✅ / ❌ N件のエラー |
| ESLint | ✅ / ❌ N件の警告/エラー（PR 起因か既存かを明記） |
| Next.js ビルド | ✅ / ❌ ビルドエラー |

---

## 🔴 Critical（マージ前に必ず修正）

### 🔴 1. 指摘のタイトル（一言で）

`ファイル:行番号`（指摘元エージェント）

**問題点**
- 何が問題か（非エンジニア向けに噛み砕いて）
- 該当コードの引用
- どんなときに何が起きるか（状況別の表や処理の流れ）
- 実際のユーザー影響・引き起こすバグ

**改善案**
具体的な修正方針とコード例

---

## 🟠 Important（修正を強く推奨）

### 🟠 2. 指摘のタイトル
（同じ構成: ファイル:行番号 / 問題点 / 改善案）

---

## 🔵 Suggestions（任意の改善）

### 🔵 3. 指摘のタイトル
（同じ構成: ファイル:行番号 / 問題点 / 改善案）

---

## ✅ 良かった点
- 優れている点

## エージェント別サマリー
| エージェント | 発見数 | 最高重要度 |
|---|---|---|
| build | N件 | Critical/Important/✅ |
| code-reviewer | N件 | Critical/Important/None |
| pr-test-analyzer | N件 | Critical(8-10)/Important(5-7)/None |
| silent-failure-hunter | N件 | CRITICAL/HIGH/MEDIUM/None |
| type-design-analyzer | N件 | Concern/None |
| comment-analyzer | N件 | Critical/Improvement/None |
| code-simplifier | N件 | Suggestion/None |

## 推奨アクション
1. ビルドエラーを修正する（最優先）
2. Critical Issues を修正する（マージブロッカー）
3. Important Issues に対応する
4. Suggestions を検討する
5. 修正後に再レビュー: `/pr-review`
```

---

## 使用例

```
# フルレビュー（デフォルト: 逐次、全観点）
/pr-review

# 全観点を並列実行（高速）
/pr-review all parallel

# ビルド検証のみ
/pr-review build

# テストとエラーハンドリングのみ
/pr-review tests errors

# ビルド検証 + コード品質（最小チェックセット）
/pr-review build code

# レビュー通過後の最終ポリッシュ
/pr-review simplify
```

---

## ワークフロー統合

**コミット前:**
```
1. コードを書く
2. /pr-review build code errors
3. Critical を修正してコミット
```

**PR 作成前:**
```
1. /pr-review all
2. Critical・Important をすべて対処
3. /create-pr で PR を作成
```

**PR フィードバック対応後:**
```
1. 指摘された変更を加える
2. /pr-review <指摘に対応する観点>
3. 解消を確認してプッシュ
```

---

## エージェント別の役割

| エージェント | 専門 | 重要度スケール |
|---|---|---|
| **code-reviewer** | AGENTS.md 準拠・バグ・コード品質 | Critical(90-100) / Important(80-89) |
| **pr-test-analyzer** | テストカバレッジの網羅性 | Critical Gap(8-10) / Important Gap(5-7) |
| **silent-failure-hunter** | サイレントエラー・catch ブロック | CRITICAL / HIGH / MEDIUM |
| **type-design-analyzer** | TypeScript 型のカプセル化・不変条件 | 4軸スコア（encapsulation等） |
| **comment-analyzer** | コメントの正確性・保守性 | Critical Issue / Improvement / Removal |
| **code-simplifier** | 可読性・重複排除・簡潔化 | Suggestion |
