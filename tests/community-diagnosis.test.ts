import assert from "node:assert/strict";
import {
  COMMUNITY_AXES,
  COMMUNITY_TYPES,
  getCommunityType,
} from "../lib/community-diagnosis/types";
import { DIAGNOSIS_QUESTIONS } from "../lib/community-diagnosis/questions";
import {
  computeDiagnosis,
  type DiagnosisRating,
  type DiagnosisAnswers,
} from "../lib/community-diagnosis/scoring";

// 16タイプのコードが全組み合わせ分そろっていて重複がない
{
  const codes = COMMUNITY_TYPES.map((type) => type.code);
  assert.equal(codes.length, 16, "タイプは16種類");
  assert.equal(new Set(codes).size, 16, "コードに重複がない");

  for (const type of COMMUNITY_TYPES) {
    assert.equal(type.code.length, 4, `${type.code} は4文字`);
    type.code.split("").forEach((letter, index) => {
      const axis = COMMUNITY_AXES[index];
      assert.ok(
        letter === axis.poleA.letter || letter === axis.poleB.letter,
        `${type.code} の${index + 1}文字目は ${axis.label} の極の文字`
      );
    });
    assert.ok(type.name.trim().length > 0, `${type.code} に名前がある`);
    assert.ok(type.themeColor.startsWith("#"), `${type.code} にテーマカラーがある`);
    assert.ok(type.imagePath.startsWith("/images/community-types/"), `${type.code} に画像スロットがある`);
  }
  console.log("[PASS] 16タイプの定義が揃っている");
}

// 相性タイプはすべて実在のコードで、自分自身は含まない
{
  const codes = new Set(COMMUNITY_TYPES.map((type) => type.code));
  for (const type of COMMUNITY_TYPES) {
    assert.ok(type.goodMatchTypes.length > 0, `${type.code} に相性タイプがある`);
    for (const match of type.goodMatchTypes) {
      assert.ok(codes.has(match), `${type.code} の相性タイプ ${match} が実在する`);
      assert.notEqual(match, type.code, `${type.code} の相性タイプに自分自身が含まれない`);
    }
  }
  console.log("[PASS] 相性タイプの参照が正しい");
}

// 質問は各軸ちょうど3問(奇数なので同点なし)
{
  for (const axis of COMMUNITY_AXES) {
    const count = DIAGNOSIS_QUESTIONS.filter((question) => question.axis === axis.key).length;
    assert.equal(count, 3, `${axis.label} の質問は3問`);
  }
  const ids = DIAGNOSIS_QUESTIONS.map((question) => question.id);
  assert.equal(new Set(ids).size, ids.length, "質問IDに重複がない");
  console.log("[PASS] 質問は各軸3問ずつ");
}

const buildAnswers = (pick: (questionId: string, axis: string) => DiagnosisRating): DiagnosisAnswers =>
  DIAGNOSIS_QUESTIONS.reduce<DiagnosisAnswers>((acc, question) => {
    acc[question.id] = pick(question.id, question.axis);
    return acc;
  }, {});

// 全て強くA(1)を選ぶと BHLO、全て強くB(4)を選ぶと SCFD
{
  const allA = computeDiagnosis(buildAnswers(() => 1));
  assert.equal(allA.code, "BHLO");
  assert.deepEqual(allA.axisScores, { size: 1.0, mood: 1.0, role: 1.0, bond: 1.0 });

  const allB = computeDiagnosis(buildAnswers(() => 4));
  assert.equal(allB.code, "SCFD");
  assert.deepEqual(allB.axisScores, { size: 0.0, mood: 0.0, role: 0.0, bond: 0.0 });
  console.log("[PASS] 全強A/全強Bの分類が正しい");
}

// 混合回答: 2問強A・1問強B → A極になる (平均0.67 > 0.5)
{
  // size: q1=4(強B), q5=1(強A), q9=1(強A) → avg=(0+1+1)/3=0.67 → A極(B)
  // mood/role: 全て4(強B) → avg=0 → B極(C/F)
  // bond: 全て1(強A) → avg=1 → A極(O)
  const mixed = computeDiagnosis(
    buildAnswers((questionId, axis) => {
      if (axis === "size") return questionId === "q1" ? 4 : 1;
      if (axis === "bond") return 1;
      return 4;
    })
  );
  assert.equal(mixed.code, "BCFO");
  assert.deepEqual(mixed.axisScores, { size: 0.67, mood: 0.0, role: 0.0, bond: 1.0 });
  console.log("[PASS] 混合回答の判定が正しい");
}

// ややA(2)とややB(3)の中間判定
{
  // 全てに rating 2 (ややA) → avg=2/3≈0.67 → A極
  const slightlyA = computeDiagnosis(buildAnswers(() => 2));
  assert.equal(slightlyA.code, "BHLO");

  // 全てに rating 3 (ややB) → avg=1/3≈0.33 → B極
  const slightlyB = computeDiagnosis(buildAnswers(() => 3));
  assert.equal(slightlyB.code, "SCFD");
  console.log("[PASS] 中間評価の判定が正しい");
}

// 全16コードが実際に到達可能で、定義済みタイプに解決される
{
  for (const type of COMMUNITY_TYPES) {
    const answers = buildAnswers((questionId, axisKey) => {
      const axisIndex = COMMUNITY_AXES.findIndex((axis) => axis.key === axisKey);
      const letter = type.code[axisIndex];
      return letter === COMMUNITY_AXES[axisIndex].poleA.letter ? 1 : 4;
    });
    const result = computeDiagnosis(answers);
    assert.equal(result.code, type.code);
    assert.equal(getCommunityType(result.code)?.code, type.code);
  }
  console.log("[PASS] 全16タイプに到達可能");
}

// 不正コードや未回答はエラー/nullになる
{
  assert.equal(getCommunityType("XXXX"), null);
  assert.equal(getCommunityType(""), null);
  assert.equal(getCommunityType(null), null);
  assert.equal(getCommunityType("bhlo")?.code, "BHLO", "小文字コードは大文字に正規化される");
  assert.throws(() => computeDiagnosis({}), /Missing or invalid/);
  console.log("[PASS] 不正入力のハンドリングが正しい");
}

console.log("All community diagnosis tests passed.");
