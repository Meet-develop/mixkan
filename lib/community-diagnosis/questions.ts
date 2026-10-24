import type { AxisKey } from "./types";

// 二択の診断質問。optionA を選ぶと各軸の A極(B/H/L/O)、optionB は B極(S/C/F/D)に加点。
// 各軸3問(奇数)なので同点は発生しない。軸を交互に出題してMBTI風のリズムにする。
export type DiagnosisQuestion = {
  id: string;
  axis: AxisKey;
  text: string;
  optionA: string;
  optionB: string;
};

export const DIAGNOSIS_QUESTIONS: DiagnosisQuestion[] = [
  {
    id: "q1",
    axis: "size",
    text: "金曜の夜、理想の集まりは?",
    optionA: "10人超えのにぎやかな宴会",
    optionB: "3〜4人でゆっくり飲み",
  },
  {
    id: "q2",
    axis: "mood",
    text: "お店選びで重視するのは?",
    optionA: "ワイワイ盛り上がれる活気",
    optionB: "ゆっくり話せる静けさ",
  },
  {
    id: "q3",
    axis: "role",
    text: "飲み会の日程調整、誰がやる?",
    optionA: "自分。むしろ任せてほしい",
    optionB: "決めてくれたら全力で乗っかる",
  },
  {
    id: "q4",
    axis: "bond",
    text: "初対面の人が多い集まりは?",
    optionA: "新しい出会いのチャンス!",
    optionB: "知ってる顔がいないと少し緊張",
  },
  {
    id: "q5",
    axis: "size",
    text: "「参加者20人です」と言われたら?",
    optionA: "楽しそう!ワクワクする",
    optionB: "ちょっと多いかも…と思う",
  },
  {
    id: "q6",
    axis: "mood",
    text: "理想のBGMは?",
    optionA: "アップテンポで場が沸く曲",
    optionB: "会話を邪魔しない控えめな音",
  },
  {
    id: "q7",
    axis: "role",
    text: "お店の予約が取れてなかった!",
    optionA: "すぐ代わりの店を探して仕切る",
    optionB: "探してくれる人を信じて待つ",
  },
  {
    id: "q8",
    axis: "bond",
    text: "連絡先の登録数は?",
    optionA: "多い。気づけば増えてる",
    optionB: "厳選。本当に大事な人だけ",
  },
  {
    id: "q9",
    axis: "size",
    text: "貸切パーティーの招待が届いた",
    optionA: "大人数の熱気、最高!即参加",
    optionB: "そのあとの少人数二次会が本命",
  },
  {
    id: "q10",
    axis: "mood",
    text: "宴もたけなわ、あなたの状態は?",
    optionA: "声がかれるくらい笑ってる",
    optionB: "グラス片手にじっくりトーク",
  },
  {
    id: "q11",
    axis: "role",
    text: "グループでの自分の役割は?",
    optionA: "言い出しっぺ・まとめ役",
    optionB: "ムードを支える名サポーター",
  },
  {
    id: "q12",
    axis: "bond",
    text: "理想の人間関係は?",
    optionA: "広いネットワークでゆるくつながる",
    optionB: "少数の仲間と深くつきあう",
  },
];
