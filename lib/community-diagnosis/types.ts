// コミュニティ属性診断(16タイプ)の定義。
// タイプ名・説明は「飲み会あるある」トーンで統一し、誰も傷つかないポジティブな笑いに揃える。
// 名称変更はこのファイルの修正のみで完結する(DBには4文字コードを文字列で保存)。

export type AxisKey = "size" | "mood" | "role" | "bond";

export type AxisDef = {
  key: AxisKey;
  label: string;
  poleA: { letter: string; label: string };
  poleB: { letter: string; label: string };
};

// コードはこの配列の順に各軸の極の文字を連結した4文字(例: "BHLO")
export const COMMUNITY_AXES: AxisDef[] = [
  {
    key: "size",
    label: "人数",
    poleA: { letter: "B", label: "大人数ワイワイ" },
    poleB: { letter: "S", label: "少人数しっぽり" },
  },
  {
    key: "mood",
    label: "場の雰囲気",
    poleA: { letter: "H", label: "にぎやか" },
    poleB: { letter: "C", label: "落ち着き" },
  },
  {
    key: "role",
    label: "関わり方",
    poleA: { letter: "L", label: "企画・リード" },
    poleB: { letter: "F", label: "参加・フォロー" },
  },
  {
    key: "bond",
    label: "つながり方",
    poleA: { letter: "O", label: "広く浅く" },
    poleB: { letter: "D", label: "狭く深く" },
  },
];

export type CommunityTypeDef = {
  code: string;
  name: string;
  tagline: string;
  description: string;
  themeColor: string;
  // イラスト差し替え用スロット。ファイル未配置の間はテーマカラーのフォールバック表示になる
  imagePath: string;
  goodMatchTypes: string[];
  // 既存プロフィールの「好きなお店ジャンル」選択肢と揃える(将来のお店推薦で favoritePlaces とマッチング可能)
  recommendedGenres: string[];
  recommendedEventStyles: string[];
};

export const COMMUNITY_TYPES: CommunityTypeDef[] = [
  {
    code: "BHLO",
    name: "とりあえず全員呼ぶ幹事",
    tagline: "LINEグループの新規作成数は地域トップクラス",
    description:
      "人が集まる気配を感じたら、もう日程調整を始めている。「あいつも呼ぼう」が口グセで、気づけば席が足りない。あなたがいる場所が、今夜の集合場所です。",
    themeColor: "#ff6a00",
    imagePath: "/images/community-types/bhlo.png",
    goodMatchTypes: ["BHFO", "BHLD", "SHLO"],
    recommendedGenres: ["居酒屋", "焼肉"],
    recommendedEventStyles: ["大人数飲み会", "貸切パーティー"],
  },
  {
    code: "BHLD",
    name: "友達の誕生日を全力で祝いすぎる人",
    tagline: "サプライズの計画は1ヶ月前から",
    description:
      "大切な仲間のためなら、店の予約もケーキの手配も完璧。にぎやかな空間でいつメンと盛り上がる瞬間のために生きている。祝われる側より、祝う側が好き。",
    themeColor: "#e3405f",
    imagePath: "/images/community-types/bhld.png",
    goodMatchTypes: ["BHFD", "BHLO", "SHLD"],
    recommendedGenres: ["焼肉", "イタリアン"],
    recommendedEventStyles: ["誕生日会", "いつメンの定例会"],
  },
  {
    code: "BHFO",
    name: "全員の飲み会写真に写ってる人",
    tagline: "誘われすぎて予定がパンク気味",
    description:
      "幹事はやらないのに、どの集まりにも必ずいる。初対面でも10分で昔からの友達みたいに馴染む、天性の社交力の持ち主。今日もどこかの乾杯に参加中。",
    themeColor: "#ff9d2d",
    imagePath: "/images/community-types/bhfo.png",
    goodMatchTypes: ["BHLO", "BHFD", "SHFO"],
    recommendedGenres: ["居酒屋", "クラフトビール"],
    recommendedEventStyles: ["合同飲み会", "立食パーティー"],
  },
  {
    code: "BHFD",
    name: "大人数でも結局いつメンの隣に座る人",
    tagline: "大勢は好き。でも定位置はここ",
    description:
      "にぎやかな宴会は大好物。だけど安心できる仲間が近くにいてこそ、全力で楽しめる。いつメンとの内輪ネタが世界で一番笑える派。",
    themeColor: "#f4b400",
    imagePath: "/images/community-types/bhfd.png",
    goodMatchTypes: ["BHLD", "BHFO", "SHFD"],
    recommendedGenres: ["居酒屋", "焼肉"],
    recommendedEventStyles: ["仲良しグループの宴会", "飲み放題パーティー"],
  },
  {
    code: "BCLO",
    name: "乾杯の挨拶を頼まれがちな人",
    tagline: "「一言お願いします」は、だいたい自分",
    description:
      "落ち着いた大人の集まりをスマートに仕切れる人。広い人脈を活かして人と人をつなぐのが得意で、その信頼感は折り紙付き。",
    themeColor: "#6b5b95",
    imagePath: "/images/community-types/bclo.png",
    goodMatchTypes: ["BCFO", "BCLD", "SCLO"],
    recommendedGenres: ["和食", "BAR"],
    recommendedEventStyles: ["大人の会食", "交流会"],
  },
  {
    code: "BCLD",
    name: "気づけば家がたまり場になってる人",
    tagline: "合鍵、何本渡したか覚えてない",
    description:
      "落ち着ける空間づくりの達人。気の合う仲間が自然と集まり、なぜかみんな長居していく。ホスト役なのに気負いゼロ、それが居心地の良さの秘密。",
    themeColor: "#8d6e63",
    imagePath: "/images/community-types/bcld.png",
    goodMatchTypes: ["BCFD", "BCLO", "SCLD"],
    recommendedGenres: ["和食", "カフェ"],
    recommendedEventStyles: ["ホームパーティー", "鍋パーティー"],
  },
  {
    code: "BCFO",
    name: "いつの間にか来て、いつの間にか帰る人",
    tagline: "出欠確認の「既読」が最速",
    description:
      "大きな集まりに気負わずふらっと参加できる自由人。誰とでも心地よい距離感で話せて、帰り際もスマート。その身軽さ、みんな密かに憧れてます。",
    themeColor: "#4f9da6",
    imagePath: "/images/community-types/bcfo.png",
    goodMatchTypes: ["BCLO", "BCFD", "SCFO"],
    recommendedGenres: ["カフェ", "クラフトビール"],
    recommendedEventStyles: ["オープン参加の交流会", "昼飲み"],
  },
  {
    code: "BCFD",
    name: "グラスの空きに最初に気づく人",
    tagline: "「何か頼む?」の言い出し役",
    description:
      "にぎわいの中でも、全体をそっと見渡している気配りの人。大切な仲間が楽しんでいる姿を見るのが、実は一番のごちそう。",
    themeColor: "#7a9e7e",
    imagePath: "/images/community-types/bcfd.png",
    goodMatchTypes: ["BCLD", "BCFO", "SCFD"],
    recommendedGenres: ["和食", "居酒屋"],
    recommendedEventStyles: ["落ち着いた宴会", "食事会"],
  },
  {
    code: "SHLO",
    name: "「今夜空いてる?」の発信源",
    tagline: "思い立ったら30分後には乾杯してる",
    description:
      "少人数でサクッと集まる達人。フットワークの軽さと声かけの気軽さで、いろんな顔ぶれと飲める。突発開催の成功率は驚異的。",
    themeColor: "#ff7043",
    imagePath: "/images/community-types/shlo.png",
    goodMatchTypes: ["SHFO", "SHLD", "BHLO"],
    recommendedGenres: ["居酒屋", "中華"],
    recommendedEventStyles: ["突発飲み", "サク飲み"],
  },
  {
    code: "SHLD",
    name: "いつメン招集係",
    tagline: "「集合」の二文字で全員集まる",
    description:
      "いつものメンバー、いつもの店、最高のテンション。あなたの招集スタンプひとつで今夜の予定が決まる、仲間内の絆の中心人物。",
    themeColor: "#d84315",
    imagePath: "/images/community-types/shld.png",
    goodMatchTypes: ["SHFD", "SHLO", "BHLD"],
    recommendedGenres: ["焼肉", "居酒屋"],
    recommendedEventStyles: ["いつメン飲み", "月例会"],
  },
  {
    code: "SHFO",
    name: "「行く!」の即レス担当",
    tagline: "返信速度、光の速さ",
    description:
      "誘われたら基本断らない、ノリの良さが信条。少人数のワイワイした集まりで本領発揮。あなたの「行く!」で場のテンションが一段上がる。",
    themeColor: "#fbc02d",
    imagePath: "/images/community-types/shfo.png",
    goodMatchTypes: ["SHLO", "SHFD", "BHFO"],
    recommendedGenres: ["居酒屋", "クラフトビール"],
    recommendedEventStyles: ["少人数飲み", "はしご酒"],
  },
  {
    code: "SHFD",
    name: "親友の前だけ声が大きくなる人",
    tagline: "外では物静か、いつメンの前では別人",
    description:
      "心を許した相手の前でこそ、本当の面白さが爆発するタイプ。少人数で気の置けない仲間と騒ぐ時間が、何よりのエネルギー源。",
    themeColor: "#ef5350",
    imagePath: "/images/community-types/shfd.png",
    goodMatchTypes: ["SHLD", "SHFO", "BHFD"],
    recommendedGenres: ["居酒屋", "焼肉"],
    recommendedEventStyles: ["親友との飲み", "少人数カラオケ"],
  },
  {
    code: "SCLO",
    name: "隠れ家を知りすぎてる人",
    tagline: "「いい店知ってるよ」の的中率100%",
    description:
      "路地裏の名店から静かなバーまで、引き出しの多さはガイドブック級。気になる人を「とっておきの店」に案内する瞬間が至福。",
    themeColor: "#455a64",
    imagePath: "/images/community-types/sclo.png",
    goodMatchTypes: ["SCFO", "SCLD", "BCLO"],
    recommendedGenres: ["BAR", "和食"],
    recommendedEventStyles: ["隠れ家巡り", "大人の少人数会食"],
  },
  {
    code: "SCLD",
    name: "「今度サシで飲もう」を本当に実現する人",
    tagline: "社交辞令を本気にする(良い意味で)",
    description:
      "「今度飲もう」を言いっぱなしにしない、有言実行の人。一対一でじっくり向き合う時間を大切にし、深い信頼関係を築いていく。",
    themeColor: "#5d4037",
    imagePath: "/images/community-types/scld.png",
    goodMatchTypes: ["SCFD", "SCLO", "BCLD"],
    recommendedGenres: ["BAR", "和食"],
    recommendedEventStyles: ["サシ飲み", "じっくり語る会"],
  },
  {
    code: "SCFO",
    name: "気づいたら常連になってる人",
    tagline: "マスターに名前を覚えられがち",
    description:
      "落ち着いた場所にふらりと通ううちに、自然と顔なじみが増えていく。広く浅く、でも心地よいつながりを育てる名人。",
    themeColor: "#26a69a",
    imagePath: "/images/community-types/scfo.png",
    goodMatchTypes: ["SCLO", "SCFD", "BCFO"],
    recommendedGenres: ["カフェ", "BAR"],
    recommendedEventStyles: ["行きつけ開拓", "ゆる飲み"],
  },
  {
    code: "SCFD",
    name: "深夜2時に人生を語り出す人",
    tagline: "2軒目から本編が始まる",
    description:
      "静かな場所で、信頼できる少数の仲間と深い話をする時間が宝物。あなたの「実はさ…」から始まる夜は、いつも記憶に残る。",
    themeColor: "#3f51b5",
    imagePath: "/images/community-types/scfd.png",
    goodMatchTypes: ["SCLD", "SCFO", "BCFD"],
    recommendedGenres: ["BAR", "カフェ"],
    recommendedEventStyles: ["深夜の語り場", "少人数しっぽり飲み"],
  },
];

const typeByCode = new Map(COMMUNITY_TYPES.map((type) => [type.code, type]));

export const getCommunityType = (
  code: string | null | undefined
): CommunityTypeDef | null => {
  if (!code) return null;
  return typeByCode.get(code.trim().toUpperCase()) ?? null;
};
