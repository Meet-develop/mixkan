# Supabase Backup Recovery Runbook

このドキュメントは、本番DBでデータ消失・破損が起きた際の復旧手順です。

## 1. 事故発生時の初動

1. 書き込み系トラフィックを止める
- Vercel の環境変数で `DATABASE_URL` を一時的に無効値へ切り替える、またはメンテナンス画面へ切り替える。
- 管理者オペレーションで `prisma db seed` / `prisma migrate dev` / `prisma db push` を停止する。

2. 影響範囲を記録する
- いつから異常が起きたか（JST時刻）
- 消失対象（events, profiles, invites など）
- 誤操作コマンド履歴（CIログ / シェル履歴）

3. 復旧方針を決める
- Point-In-Time Recovery (PITR) が使える場合: 事故直前時点へ復元
- PITR 非対応の場合: 最新の自動バックアップから復元

## 2. Supabase 側の復元

利用可能な復元機能は Supabase プランと設定に依存します。

1. Supabase Dashboard を開く
- 対象 Project を選択
- Backups / Restore 相当の画面を開く

2. 復元先を決める
- 可能なら「新規復元先プロジェクト」へリストアして検証
- 直接上書き復元は最終手段

3. 復元時刻を決める
- 事故時刻より前の安全な時点を指定

4. 復元完了後に接続文字列を取得
- Pooler 接続文字列（`DATABASE_URL`）
- Direct 接続文字列（`DIRECT_URL`）

## 3. アプリ切替とスキーマ整合

1. 本番環境変数を更新
- `DATABASE_URL`
- `DIRECT_URL`

2. Prisma マイグレーションのみ適用

```bash
npm run db:migrate
npm run db:generate
```

注意:
- 本番で `npm run db:seed` は実行しない。
- 本番で `prisma migrate dev` / `prisma db push` は実行しない。

## 3.1 自動バックアップ運用

GitHub Actions から定期的に `pg_dump` を実行し、Supabase Storage に保存する運用を推奨する。

- Workflow: [`.github/workflows/supabase-backup.yml`](../.github/workflows/supabase-backup.yml)
- 実行スクリプト: [`scripts/supabase-backup.cjs`](../scripts/supabase-backup.cjs)

必要な Secrets:

- `PROD_DIRECT_URL` - 本番DBへの direct 接続文字列
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Storage へ書き込むための service role key
- `SUPABASE_BACKUP_BUCKET` - 任意。未設定時は `db-backups` を使用
- `SUPABASE_BACKUP_RETENTION_COUNT` - 任意。未設定時は 14 世代保持

保存先の例:

- bucket: `db-backups`
- path: `production/YYYY-MM-DD/mixkan-<timestamp>-<sha>.dump`

補足:

- `pg_dump --format=custom` を使うため、復元時は `pg_restore` を使う。
- バックアップはリポジトリには保存しない。`.git` 管理外の一時ファイルとして扱う。
- 世代削除はバックアップ完了後に自動で実行される。

### 3.2 ワンコマンド復元

最新のバックアップを使って復元する場合は、次のコマンドを実行する。

```bash
npm run restore:supabase
```

特定のバックアップを指定したい場合は、Storage の path を明示する。

```bash
BACKUP_STORAGE_PATH="production/2026-05-30/mixkan-<timestamp>-<sha>.dump" npm run restore:supabase
```

必要な Secrets:

- `DATABASE_URL` - 復元先DB（本番 Supabase）の接続文字列
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY` - Storage からバックアップを読むための service role key

補足:

- 復元スクリプトは `BACKUP_STORAGE_PATH` が未指定なら最新の `.dump` を自動選択する。
- `pg_restore --clean --if-exists` を使うため、復元先の既存オブジェクトは上書きされる。

## 4. 復旧後の検証

1. レコード件数
- `profiles`, `events`, `event_participants`, `event_invites`, `notifications` の件数確認

2. 主要導線の動作確認
- ログイン
- イベント作成
- 招待/参加
- 通知作成

3. ダミーデータ混入確認
- `profile.user_id` の seed 固定ID (`70000000-...`) が存在しないこと
git s
## 5. 再発防止の運用ルール

1. 本番運用では Prisma は migrate のみ
- 許可: `prisma migrate deploy`, `prisma generate`
- 禁止: `prisma db seed`, `prisma migrate dev`, `prisma db push`

2. 環境分離
- ローカル `.env` に本番 `DATABASE_URL` を置かない
- `.env.local`, `.env.prod` などを分離

3. seed の安全装置
- 非ローカルDBへの seed はデフォルト拒否
- 例外時のみ `ALLOW_NON_LOCAL_SEED=true` を明示

4. CI ガード
- ワークフロー内の seed 実行を禁止
- 非ローカル seed 解除フラグを禁止

## 6. インシデント後のチェックリスト

- 事故原因のポストモーテムを記録
- 復旧時刻と復旧ポイントを記録
- 影響ユーザーへの通知文面を準備
- 同様の操作を防ぐPRチェックを有効化
