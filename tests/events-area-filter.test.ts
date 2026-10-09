import assert from "node:assert";
import { buildAreaPath, matchAreaPath } from "../lib/area-path";

console.log("[tests] Running tests/events-area-filter.test.ts");

// 1. Check path building for various event areas
const path1 = buildAreaPath("松江駅", "島根県松江市朝日町1-1");
assert.strictEqual(path1, "島根県/松江市/松江駅");

const path2 = buildAreaPath("渋谷区宇田川町", "東京都渋谷区");
assert.strictEqual(path2, "東京都/渋谷区/宇田川町");

const path3 = buildAreaPath("梅田駅", "大阪府大阪市北区");
assert.strictEqual(path3, "大阪府/大阪市北区/梅田駅");

// 2. Check area filter matching for user's favorite areas
const userFavoriteAreas = ["松江市", "渋谷区"];

// Event A: 松江駅 (child of 松江市) -> should match
assert.strictEqual(matchAreaPath("島根県/松江市/松江駅", "松江駅", userFavoriteAreas), true);

// Event B: 宇田川町 (child of 渋谷区) -> should match
assert.strictEqual(matchAreaPath("東京都/渋谷区/宇田川町", "宇田川町", userFavoriteAreas), true);

// Event C: 難波駅 (Osaka) -> should NOT match
assert.strictEqual(matchAreaPath("大阪府/大阪市北区/梅田駅", "梅田駅", userFavoriteAreas), false);

// Event D: Ward/City matching
assert.strictEqual(matchAreaPath("大阪府/大阪市北区/梅田駅", "梅田駅", ["大阪市"]), true);
assert.strictEqual(matchAreaPath("大阪府/大阪市北区/梅田駅", "梅田駅", ["北区"]), true);
assert.strictEqual(matchAreaPath("大阪府/大阪市北区/梅田駅", "梅田駅", ["中央区"]), false);

// Event E: No area set -> should match when no filter or be handled gracefully
assert.strictEqual(matchAreaPath(null, null, []), true);

console.log("[PASS] Events area filter & areaPath matching verified successfully.");
