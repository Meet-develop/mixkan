import assert from "node:assert";
import { buildAreaPath, matchAreaPath, extractPrefecture, extractCityOrWard } from "../lib/area-path";

console.log("[tests] Running tests/area-path.test.ts");

// 1. extractPrefecture
assert.strictEqual(extractPrefecture("島根県松江市朝日町"), "島根県");
assert.strictEqual(extractPrefecture("東京都渋谷区"), "東京都");
assert.strictEqual(extractPrefecture("松江駅"), null);
console.log("[PASS] extractPrefecture");

// 2. extractCityOrWard
assert.strictEqual(extractCityOrWard("島根県松江市朝日町"), "松江市");
assert.strictEqual(extractCityOrWard("東京都渋谷区宇田川町"), "渋谷区");
assert.strictEqual(extractCityOrWard("三重県四日市市安島"), "四日市市");
assert.strictEqual(extractCityOrWard("広島県廿日市市下平良"), "廿日市市");
assert.strictEqual(extractCityOrWard("神奈川県横浜市中区本町"), "横浜市中区");
console.log("[PASS] extractCityOrWard");

// 3. buildAreaPath
assert.strictEqual(buildAreaPath("松江駅", "島根県松江市朝日町"), "島根県/松江市/松江駅");
assert.strictEqual(buildAreaPath("渋谷駅", "東京都渋谷区"), "東京都/渋谷区/渋谷駅");
assert.strictEqual(buildAreaPath("島根県/松江市/松江駅"), "島根県/松江市/松江駅");
assert.strictEqual(buildAreaPath("松江市"), "松江市");
assert.strictEqual(buildAreaPath(null), null);
assert.strictEqual(buildAreaPath("   "), null);
console.log("[PASS] buildAreaPath");

// 4. matchAreaPath
const samplePath = "島根県/松江市/松江駅";
assert.strictEqual(matchAreaPath(samplePath, "松江駅", ["松江市"]), true);
assert.strictEqual(matchAreaPath(samplePath, "松江駅", ["松江駅"]), true);
assert.strictEqual(matchAreaPath(samplePath, "松江駅", ["島根県"]), true);
assert.strictEqual(matchAreaPath(samplePath, "松江駅", ["出雲市"]), false);
assert.strictEqual(matchAreaPath(samplePath, "松江駅", []), true); // No filter = true

// 5. False positive prevention (Important!)
// ユーザーが「東京都渋谷区」を設定しているとき、八王子市のイベントが誤マッチしないこと
const tokyoHachioji = "東京都/八王子市/高尾";
assert.strictEqual(matchAreaPath(tokyoHachioji, "高尾", ["東京都渋谷区"]), false);
assert.strictEqual(matchAreaPath(tokyoHachioji, "高尾", ["渋谷区"]), false);
assert.strictEqual(matchAreaPath(tokyoHachioji, "高尾", ["八王子市"]), true);
assert.strictEqual(matchAreaPath(tokyoHachioji, "高尾", ["東京都"]), true);

const tokyoShibuya = "東京都/渋谷区/渋谷駅";
assert.strictEqual(matchAreaPath(tokyoShibuya, "渋谷駅", ["東京都渋谷区"]), true);
assert.strictEqual(matchAreaPath(tokyoShibuya, "渋谷駅", ["渋谷区"]), true);
console.log("[PASS] matchAreaPath (including false-positive prevention)");

console.log("All area path tests passed.");
