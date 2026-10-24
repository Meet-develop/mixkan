// コミュニティ属性診断のリリース告知を全ユーザーに配信するワンショットスクリプト。
//
// 使い方:
//   npx tsx scripts/announce-community-diagnosis.ts --dry-run  # 対象者数の確認のみ
//   npx tsx scripts/announce-community-diagnosis.ts            # 実際に配信
//
// 前提: feature_announcement enum を追加するマイグレーションが適用済みであること。
// LINE連携済みユーザーには createAppNotification 経由でLINEプッシュも送られる。
// 既に同じ告知を受け取ったユーザーはスキップされる(再実行しても二重配信されない)。
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { createAppNotification } from "../lib/notification-delivery";

const ANNOUNCEMENT_TITLE = "コミュニティ属性診断が登場!";
const ANNOUNCEMENT_BODY =
  "あなたの「居心地タイプ」を16タイプで診断する新機能がリリースされました。" +
  "質問に答えるだけでプロフィールの未入力項目も一緒に埋められます。" +
  "診断結果はプロフィールに登録され、今後は相性のいいお店やイベントの紹介にも活用されます。";
const ANNOUNCEMENT_LINK_PATH = "/diagnosis";

const BATCH_SIZE = 25;
const BATCH_DELAY_MS = 1000;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  const isDryRun = process.argv.includes("--dry-run");

  const profiles = await prisma.profile.findMany({
    select: { userId: true },
    orderBy: { createdAt: "asc" },
  });

  const alreadyNotified = await prisma.notification.findMany({
    where: {
      type: "feature_announcement",
      title: ANNOUNCEMENT_TITLE,
    },
    select: { userId: true },
  });
  const notifiedUserIds = new Set(alreadyNotified.map((item) => item.userId));

  const targets = profiles.filter((profile) => !notifiedUserIds.has(profile.userId));

  console.log(
    `profiles: ${profiles.length}, already notified: ${notifiedUserIds.size}, targets: ${targets.length}`
  );

  if (isDryRun) {
    console.log("[dry-run] 配信は行いません。");
    return;
  }

  let successCount = 0;
  let failureCount = 0;

  for (let offset = 0; offset < targets.length; offset += BATCH_SIZE) {
    const batch = targets.slice(offset, offset + BATCH_SIZE);

    for (const target of batch) {
      try {
        await createAppNotification({
          userId: target.userId,
          type: "feature_announcement",
          title: ANNOUNCEMENT_TITLE,
          body: ANNOUNCEMENT_BODY,
          message: ANNOUNCEMENT_BODY,
          linkPath: ANNOUNCEMENT_LINK_PATH,
        });
        successCount += 1;
      } catch (error) {
        failureCount += 1;
        console.error(`Failed to notify user ${target.userId}`, error);
      }
    }

    console.log(
      `progress: ${Math.min(offset + BATCH_SIZE, targets.length)}/${targets.length}`
    );

    // LINE Messaging API のレート制限を避けるためバッチ間で待機する
    if (offset + BATCH_SIZE < targets.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`done. success: ${successCount}, failure: ${failureCount}`);
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
