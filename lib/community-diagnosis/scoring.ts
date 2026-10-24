import { COMMUNITY_AXES, type AxisKey } from "./types";
import { DIAGNOSIS_QUESTIONS } from "./questions";

// 1 = 強くA, 2 = ややA, 3 = ややB, 4 = 強くB
export type DiagnosisRating = 1 | 2 | 3 | 4;
export type DiagnosisAnswers = Record<string, DiagnosisRating>;

export type DiagnosisResult = {
  code: string;
  // 軸ごとのA極への傾き (0.0〜1.0)。0.5超でA極、0.5未満でB極
  axisScores: Record<AxisKey, number>;
};

// A貢献度: 1→1.0, 2→2/3, 3→1/3, 4→0.0
const toAScore = (rating: DiagnosisRating): number =>
  ({ 1: 1.0, 2: 2 / 3, 3: 1 / 3, 4: 0.0 } as const)[rating];

export const computeDiagnosis = (answers: DiagnosisAnswers): DiagnosisResult => {
  const axisScores = {} as Record<AxisKey, number>;
  let code = "";

  for (const axis of COMMUNITY_AXES) {
    const questions = DIAGNOSIS_QUESTIONS.filter((question) => question.axis === axis.key);
    let aScoreSum = 0;

    for (const question of questions) {
      const rating = answers[question.id];
      if (rating !== 1 && rating !== 2 && rating !== 3 && rating !== 4) {
        throw new Error(`Missing or invalid answer for question ${question.id}`);
      }
      aScoreSum += toAScore(rating);
    }

    const avgAScore = aScoreSum / questions.length;
    // 小数2桁で丸める (3問×4段階では 0.5 ちょうどにならないため同点なし)
    axisScores[axis.key] = Math.round(avgAScore * 100) / 100;
    code += avgAScore > 0.5 ? axis.poleA.letter : axis.poleB.letter;
  }

  return { code, axisScores };
};
