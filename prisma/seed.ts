import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const areaFrequentPlaces: Record<
  "米子" | "松江" | "出雲",
  Array<{ placeId: string; name: string; address: string; lat: number; lng: number; photoUrl: string }>
> = {
  米子: [
    {
      placeId: "yonago-001",
      name: "米子駅前バル だんだん",
      address: "鳥取県米子市明治町200",
      lat: 35.4283,
      lng: 133.3312,
      photoUrl: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?w=640&h=480&fit=crop",
    },
    {
      placeId: "yonago-002",
      name: "皆生カフェ 波音",
      address: "鳥取県米子市皆生温泉3-12-8",
      lat: 35.4349,
      lng: 133.3654,
      photoUrl: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=640&h=480&fit=crop",
    },
    {
      placeId: "yonago-003",
      name: "角盤町グリル 砂丘",
      address: "鳥取県米子市角盤町2-20",
      lat: 35.4247,
      lng: 133.3334,
      photoUrl: "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=640&h=480&fit=crop",
    },
  ],
  松江: [
    {
      placeId: "matsue-001",
      name: "松江しんじ湖温泉 夕凪ダイニング",
      address: "島根県松江市千鳥町39",
      lat: 35.4681,
      lng: 133.0492,
      photoUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=640&h=480&fit=crop",
    },
    {
      placeId: "matsue-002",
      name: "松江城下カフェ 堀川",
      address: "島根県松江市殿町120",
      lat: 35.4742,
      lng: 133.0519,
      photoUrl: "https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=640&h=480&fit=crop",
    },
    {
      placeId: "matsue-003",
      name: "学園通りキッチン 宍道",
      address: "島根県松江市学園2-25-6",
      lat: 35.4862,
      lng: 133.0698,
      photoUrl: "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=640&h=480&fit=crop",
    },
  ],
  出雲: [
    {
      placeId: "izumo-001",
      name: "出雲大社前 ご縁テラス",
      address: "島根県出雲市大社町杵築南780",
      lat: 35.4027,
      lng: 132.6856,
      photoUrl: "https://images.unsplash.com/photo-1559339352-11d035aa65de?w=640&h=480&fit=crop",
    },
    {
      placeId: "izumo-002",
      name: "神門通りカフェ 八雲",
      address: "島根県出雲市大社町杵築南840",
      lat: 35.3998,
      lng: 132.6843,
      photoUrl: "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=640&h=480&fit=crop",
    },
    {
      placeId: "izumo-003",
      name: "出雲市駅前バル いずも",
      address: "島根県出雲市今市町930-4",
      lat: 35.3607,
      lng: 132.7558,
      photoUrl: "https://images.unsplash.com/photo-1550966871-3ed3cdb5ed0c?w=640&h=480&fit=crop",
    },
  ],
};

const defaultWeekdaySlots = {
  mon: { daytime: false, night: true },
  tue: { daytime: false, night: true },
  wed: { daytime: true, night: true },
  thu: { daytime: false, night: true },
  fri: { daytime: false, night: true },
  sat: { daytime: true, night: true },
  sun: { daytime: true, night: false },
};

const userDrafts = [
  {
    userId: "70000000-0000-0000-0000-000000000001",
    displayName: "ゆうと",
    avatarIcon: null,
    gender: "male" as const,
    birthDate: new Date("1994-01-12"),
    playFrequency: "high" as const,
    drinkFrequency: "often" as const,
    budgetMin: 2500,
    budgetMax: 7000,
    ngFoods: ["甲殻類"],
    area: "米子" as const,
  },
  {
    userId: "70000000-0000-0000-0000-000000000002",
    displayName: "ひなた",
    avatarIcon: null,
    gender: "female" as const,
    birthDate: new Date("1996-05-24"),
    playFrequency: "medium" as const,
    drinkFrequency: "sometimes" as const,
    budgetMin: 1800,
    budgetMax: 5000,
    ngFoods: ["辛いもの"],
    area: "米子" as const,
  },
  {
    userId: "70000000-0000-0000-0000-000000000003",
    displayName: "れん",
    avatarIcon: null,
    gender: "male" as const,
    birthDate: new Date("1991-09-08"),
    playFrequency: "high" as const,
    drinkFrequency: "often" as const,
    budgetMin: 3000,
    budgetMax: 8000,
    ngFoods: ["パクチー"],
    area: "米子" as const,
  },
  {
    userId: "70000000-0000-0000-0000-000000000004",
    displayName: "そら",
    avatarIcon: null,
    gender: "male" as const,
    birthDate: new Date("1993-03-16"),
    playFrequency: "medium" as const,
    drinkFrequency: "sometimes" as const,
    budgetMin: 2000,
    budgetMax: 6000,
    ngFoods: ["生魚"],
    area: "松江" as const,
  },
  {
    userId: "70000000-0000-0000-0000-000000000005",
    displayName: "なつき",
    avatarIcon: null,
    gender: "female" as const,
    birthDate: new Date("1997-07-11"),
    playFrequency: "high" as const,
    drinkFrequency: "often" as const,
    budgetMin: 2500,
    budgetMax: 6500,
    ngFoods: ["乳製品"],
    area: "松江" as const,
  },
  {
    userId: "70000000-0000-0000-0000-000000000006",
    displayName: "こうき",
    avatarIcon: null,
    gender: "male" as const,
    birthDate: new Date("1992-12-02"),
    playFrequency: "low" as const,
    drinkFrequency: "never" as const,
    budgetMin: 1500,
    budgetMax: 4500,
    ngFoods: ["香草系"],
    area: "松江" as const,
  },
  {
    userId: "70000000-0000-0000-0000-000000000007",
    displayName: "みなと",
    avatarIcon: null,
    gender: "male" as const,
    birthDate: new Date("1990-10-21"),
    playFrequency: "medium" as const,
    drinkFrequency: "sometimes" as const,
    budgetMin: 2200,
    budgetMax: 6200,
    ngFoods: ["揚げ物"],
    area: "出雲" as const,
  },
  {
    userId: "70000000-0000-0000-0000-000000000008",
    displayName: "あおい",
    avatarIcon: null,
    gender: "female" as const,
    birthDate: new Date("1998-04-05"),
    playFrequency: "high" as const,
    drinkFrequency: "often" as const,
    budgetMin: 2800,
    budgetMax: 7200,
    ngFoods: ["炭酸"],
    area: "出雲" as const,
  },
  {
    userId: "70000000-0000-0000-0000-000000000009",
    displayName: "しおん",
    avatarIcon: null,
    gender: "other" as const,
    birthDate: new Date("1995-08-30"),
    playFrequency: "medium" as const,
    drinkFrequency: "sometimes" as const,
    budgetMin: 2000,
    budgetMax: 5500,
    ngFoods: ["卵"],
    area: "出雲" as const,
  },
];

const users = userDrafts.map((draft) => {
  const frequentPlaces = areaFrequentPlaces[draft.area];

  return {
    userId: draft.userId,
    displayName: draft.displayName,
    avatarIcon: draft.avatarIcon,
    gender: draft.gender,
    birthDate: draft.birthDate,
    playFrequency: draft.playFrequency,
    drinkFrequency: draft.drinkFrequency,
    budgetMin: draft.budgetMin,
    budgetMax: draft.budgetMax,
    ngFoods: draft.ngFoods,
    favoriteAreas: [draft.area],
    favoritePlaces: frequentPlaces.map((place) => place.name),
    availability: {
      weekdaySlots: defaultWeekdaySlots,
      frequentPlaces,
    },
  };
});

const friendships = [
  ...users.slice(1).flatMap((user) => [
    { userId: users[0].userId, friendId: user.userId, status: "accepted" as const },
    { userId: user.userId, friendId: users[0].userId, status: "accepted" as const },
  ]),
  { userId: users[1].userId, friendId: users[2].userId, status: "accepted" as const },
  { userId: users[2].userId, friendId: users[1].userId, status: "accepted" as const },
  { userId: users[3].userId, friendId: users[4].userId, status: "accepted" as const },
  { userId: users[4].userId, friendId: users[3].userId, status: "accepted" as const },
  { userId: users[6].userId, friendId: users[7].userId, status: "accepted" as const },
  { userId: users[7].userId, friendId: users[6].userId, status: "accepted" as const },
];

const favoriteFriends = [
  { userId: users[0].userId, favoriteUserId: users[1].userId },
  { userId: users[0].userId, favoriteUserId: users[4].userId },
  { userId: users[0].userId, favoriteUserId: users[7].userId },
];

const events = [
  {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    ownerId: users[0].userId,
    purpose: "週末の飲み会",
    visibility: "public" as const,
    capacity: 6,
    status: "open" as const,
    scheduleMode: "candidate" as const,
  },
  {
    id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ownerId: users[2].userId,
    purpose: "深夜カラオケ",
    visibility: "limited" as const,
    capacity: 8,
    status: "open" as const,
    scheduleMode: "candidate" as const,
  },
  {
    id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
    ownerId: users[4].userId,
    purpose: "映画鑑賞会",
    visibility: "private" as const,
    capacity: 4,
    status: "confirmed" as const,
    scheduleMode: "fixed" as const,
    fixedStartTime: new Date("2026-03-14T19:00:00.000Z"),
    fixedEndTime: new Date("2026-03-14T21:30:00.000Z"),
    fixedPlaceId: "place_roma_001",
    fixedPlaceName: "六本木シネマ",
    fixedPlaceAddress: "東京都港区六本木1-1-1",
  },
  {
    id: "11111111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    ownerId: users[3].userId,
    purpose: "出雲そば会",
    area: "出雲",
    visibility: "public" as const,
    capacity: 5,
    status: "completed" as const,
    scheduleMode: "fixed" as const,
    fixedStartTime: new Date("2026-03-22T10:00:00.000Z"),
    fixedEndTime: new Date("2026-03-22T12:00:00.000Z"),
    fixedPlaceId: "history-izumo-001",
    fixedPlaceName: "神門通りそば処",
    fixedPlaceAddress: "島根県出雲市大社町杵築南812",
  },
  {
    id: "22222222-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
    ownerId: users[6].userId,
    purpose: "湖畔テラスでランチ",
    area: "松江",
    visibility: "public" as const,
    capacity: 6,
    status: "open" as const,
    scheduleMode: "fixed" as const,
    fixedStartTime: new Date("2026-04-20T03:30:00.000Z"),
    fixedEndTime: new Date("2026-04-20T05:00:00.000Z"),
    fixedPlaceId: "public-matsue-001",
    fixedPlaceName: "宍道湖サイドテラス",
    fixedPlaceAddress: "島根県松江市袖師町4-1",
  },
  {
    id: "33333333-cccc-cccc-cccc-cccccccccccc",
    ownerId: users[4].userId,
    purpose: "仕事終わりの軽飲み",
    area: "米子",
    visibility: "limited" as const,
    capacity: 4,
    status: "open" as const,
    scheduleMode: "fixed" as const,
    fixedStartTime: new Date("2026-04-25T10:00:00.000Z"),
    fixedEndTime: new Date("2026-04-25T12:00:00.000Z"),
    fixedPlaceId: "invite-yonago-001",
    fixedPlaceName: "米子駅前ハイボール酒場",
    fixedPlaceAddress: "鳥取県米子市明治町195",
  },
  {
    id: "44444444-dddd-dddd-dddd-dddddddddddd",
    ownerId: users[1].userId,
    purpose: "週末カフェ巡り",
    area: "米子",
    visibility: "public" as const,
    capacity: 5,
    status: "confirmed" as const,
    scheduleMode: "fixed" as const,
    fixedStartTime: new Date("2026-04-18T04:00:00.000Z"),
    fixedEndTime: new Date("2026-04-18T06:00:00.000Z"),
    fixedPlaceId: "joined-yonago-001",
    fixedPlaceName: "皆生海辺カフェ",
    fixedPlaceAddress: "鳥取県米子市皆生温泉4-8-2",
  },
  {
    id: "77777777-eeee-eeee-eeee-eeeeeeeeeeee",
    ownerId: users[0].userId,
    purpose: "秋の懇親会",
    area: "渋谷",
    visibility: "limited" as const,
    capacity: 8,
    status: "open" as const,
    scheduleMode: "candidate" as const,
  },
];

const participants = [
  { eventId: events[0].id, userId: users[0].userId, status: "approved" as const, role: "owner" as const },
  { eventId: events[0].id, userId: users[1].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[0].id, userId: users[2].userId, status: "requested" as const, role: "guest" as const },
  { eventId: events[0].id, userId: users[5].userId, status: "requested" as const, role: "guest" as const },
  { eventId: events[1].id, userId: users[2].userId, status: "approved" as const, role: "owner" as const },
  { eventId: events[1].id, userId: users[0].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[2].id, userId: users[4].userId, status: "approved" as const, role: "owner" as const },
  { eventId: events[2].id, userId: users[1].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[3].id, userId: users[3].userId, status: "approved" as const, role: "owner" as const },
  { eventId: events[3].id, userId: users[0].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[3].id, userId: users[7].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[4].id, userId: users[6].userId, status: "approved" as const, role: "owner" as const },
  { eventId: events[4].id, userId: users[8].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[5].id, userId: users[4].userId, status: "approved" as const, role: "owner" as const },
  { eventId: events[5].id, userId: users[5].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[6].id, userId: users[1].userId, status: "approved" as const, role: "owner" as const },
  { eventId: events[6].id, userId: users[0].userId, status: "approved" as const, role: "guest" as const },
  // 秋の懇親会 (events[7]) — ゆうと がオーナー、6人承認済み + あおいは申請中
  { eventId: events[7].id, userId: users[0].userId, status: "approved" as const, role: "owner" as const },
  { eventId: events[7].id, userId: users[1].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[7].id, userId: users[2].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[7].id, userId: users[3].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[7].id, userId: users[4].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[7].id, userId: users[5].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[7].id, userId: users[6].userId, status: "approved" as const, role: "guest" as const },
  { eventId: events[7].id, userId: users[7].userId, status: "requested" as const, role: "guest" as const },
];

const invites = [
  {
    id: "d1111111-1111-1111-1111-111111111111",
    eventId: events[0].id,
    inviterId: users[0].userId,
    inviteeId: users[2].userId,
    token: "invite-token-aaa",
    status: "pending" as const,
  },
  {
    id: "d2222222-2222-2222-2222-222222222222",
    eventId: events[1].id,
    inviterId: users[2].userId,
    inviteeId: users[5].userId,
    token: "invite-token-bbb",
    status: "pending" as const,
  },
  {
    id: "d3333333-3333-3333-3333-333333333333",
    eventId: events[2].id,
    inviterId: users[4].userId,
    inviteeId: users[3].userId,
    token: "invite-token-ccc",
    status: "accepted" as const,
  },
  {
    id: "d4444444-4444-4444-4444-444444444444",
    eventId: events[5].id,
    inviterId: users[4].userId,
    inviteeId: users[0].userId,
    token: "invite-token-history-check",
    status: "pending" as const,
  },
];

const timeCandidates = [
  {
    id: "e1111111-1111-1111-1111-111111111111",
    eventId: events[0].id,
    startTime: new Date("2026-03-15T11:00:00.000Z"),
    endTime: new Date("2026-03-15T14:00:00.000Z"),
    score: 3,
    source: "system" as const,
  },
  {
    id: "e2222222-2222-2222-2222-222222222222",
    eventId: events[0].id,
    startTime: new Date("2026-03-16T18:00:00.000Z"),
    endTime: new Date("2026-03-16T21:00:00.000Z"),
    score: 5,
    source: "system" as const,
  },
  {
    id: "e3333333-3333-3333-3333-333333333333",
    eventId: events[0].id,
    startTime: new Date("2026-03-17T19:00:00.000Z"),
    endTime: new Date("2026-03-17T22:00:00.000Z"),
    score: 4,
    source: "proposal" as const,
    proposedBy: users[1].userId,
  },
  {
    id: "e4444444-4444-4444-4444-444444444444",
    eventId: events[1].id,
    startTime: new Date("2026-03-12T22:00:00.000Z"),
    endTime: new Date("2026-03-13T02:00:00.000Z"),
    score: 5,
    source: "system" as const,
  },
  {
    id: "e5555555-5555-5555-5555-555555555555",
    eventId: events[1].id,
    startTime: new Date("2026-03-13T22:00:00.000Z"),
    endTime: new Date("2026-03-14T02:00:00.000Z"),
    score: 4,
    source: "system" as const,
  },
  {
    id: "e6666666-6666-6666-6666-666666666666",
    eventId: events[1].id,
    startTime: new Date("2026-03-14T20:00:00.000Z"),
    endTime: new Date("2026-03-14T23:00:00.000Z"),
    score: 3,
    source: "proposal" as const,
    proposedBy: users[0].userId,
  },
  // 秋の懇親会 (events[7]) — 9月〜10月の土曜日 5候補
  {
    id: "e9111111-1111-1111-1111-111111111111",
    eventId: events[7].id,
    startTime: new Date("2026-09-05T09:00:00.000Z"), // 土 18:00 JST
    endTime: new Date("2026-09-05T12:00:00.000Z"),
    score: 0,
    source: "system" as const,
  },
  {
    id: "e9222222-2222-2222-2222-222222222222",
    eventId: events[7].id,
    startTime: new Date("2026-09-12T10:00:00.000Z"), // 土 19:00 JST
    endTime: new Date("2026-09-12T13:00:00.000Z"),
    score: 0,
    source: "system" as const,
  },
  {
    id: "e9333333-3333-3333-3333-333333333333",
    eventId: events[7].id,
    startTime: new Date("2026-09-19T09:30:00.000Z"), // 土 18:30 JST
    endTime: new Date("2026-09-19T12:30:00.000Z"),
    score: 0,
    source: "system" as const,
  },
  {
    id: "e9444444-4444-4444-4444-444444444444",
    eventId: events[7].id,
    startTime: new Date("2026-09-26T10:00:00.000Z"), // 土 19:00 JST
    endTime: new Date("2026-09-26T13:00:00.000Z"),
    score: 0,
    source: "proposal" as const,
    proposedBy: users[2].userId,
  },
  {
    id: "e9555555-5555-5555-5555-555555555555",
    eventId: events[7].id,
    startTime: new Date("2026-10-03T09:00:00.000Z"), // 土 18:00 JST
    endTime: new Date("2026-10-03T12:00:00.000Z"),
    score: 0,
    source: "system" as const,
  },
];

const placeCandidates = [
  {
    id: "f1111111-1111-1111-1111-111111111111",
    eventId: events[0].id,
    placeId: "place_ebisu_001",
    name: "恵比寿ビアバル",
    address: "東京都渋谷区恵比寿1-2-3",
    lat: 35.6467,
    lng: 139.7100,
    priceLevel: 2,
    score: 5,
    source: "system" as const,
  },
  {
    id: "f2222222-2222-2222-2222-222222222222",
    eventId: events[0].id,
    placeId: "place_shibuya_002",
    name: "渋谷クラフト横丁",
    address: "東京都渋谷区道玄坂2-4-1",
    lat: 35.6595,
    lng: 139.7005,
    priceLevel: 3,
    score: 4,
    source: "system" as const,
  },
  {
    id: "f3333333-3333-3333-3333-333333333333",
    eventId: events[0].id,
    placeId: "place_nakame_003",
    name: "中目黒バルテラス",
    address: "東京都目黒区上目黒1-5-6",
    lat: 35.6440,
    lng: 139.6995,
    priceLevel: 2,
    score: 3,
    source: "proposal" as const,
    proposedBy: users[2].userId,
  },
  {
    id: "f4444444-4444-4444-4444-444444444444",
    eventId: events[1].id,
    placeId: "place_shinjuku_001",
    name: "新宿カラオケタウン",
    address: "東京都新宿区歌舞伎町1-1-2",
    lat: 35.6947,
    lng: 139.7030,
    priceLevel: 2,
    score: 5,
    source: "system" as const,
  },
  {
    id: "f5555555-5555-5555-5555-555555555555",
    eventId: events[1].id,
    placeId: "place_shibuya_003",
    name: "渋谷カラオケパーク",
    address: "東京都渋谷区宇田川町20-3",
    lat: 35.6620,
    lng: 139.6980,
    priceLevel: 3,
    score: 4,
    source: "system" as const,
  },
  {
    id: "f6666666-6666-6666-6666-666666666666",
    eventId: events[1].id,
    placeId: "place_ike_004",
    name: "池袋ナイトカラオケ",
    address: "東京都豊島区南池袋1-10-5",
    lat: 35.7295,
    lng: 139.7120,
    priceLevel: 2,
    score: 3,
    source: "proposal" as const,
    proposedBy: users[5].userId,
  },
];

const timeVotes = [
  { candidateId: timeCandidates[0].id, userId: users[0].userId, availability: "available" as const },
  { candidateId: timeCandidates[0].id, userId: users[1].userId, availability: "available" as const },
  { candidateId: timeCandidates[1].id, userId: users[0].userId, availability: "available" as const },
  { candidateId: timeCandidates[1].id, userId: users[2].userId, availability: "unavailable" as const },
  { candidateId: timeCandidates[2].id, userId: users[1].userId, availability: "maybe" as const },
  { candidateId: timeCandidates[3].id, userId: users[2].userId, availability: "available" as const },
  { candidateId: timeCandidates[4].id, userId: users[0].userId, availability: "maybe" as const },
  { candidateId: timeCandidates[5].id, userId: users[5].userId, availability: "available" as const },
  // 秋の懇親会 — 候補1 (9/5): ○4 △1 ×0 未2 → スコア最高
  { candidateId: timeCandidates[6].id, userId: users[0].userId, availability: "available" as const },
  { candidateId: timeCandidates[6].id, userId: users[1].userId, availability: "available" as const },
  { candidateId: timeCandidates[6].id, userId: users[2].userId, availability: "available" as const },
  { candidateId: timeCandidates[6].id, userId: users[3].userId, availability: "available" as const },
  { candidateId: timeCandidates[6].id, userId: users[4].userId, availability: "maybe" as const },
  // 候補2 (9/12): ○3 △2 ×1 未1
  { candidateId: timeCandidates[7].id, userId: users[0].userId, availability: "available" as const },
  { candidateId: timeCandidates[7].id, userId: users[1].userId, availability: "available" as const },
  { candidateId: timeCandidates[7].id, userId: users[2].userId, availability: "maybe" as const },
  { candidateId: timeCandidates[7].id, userId: users[3].userId, availability: "maybe" as const },
  { candidateId: timeCandidates[7].id, userId: users[4].userId, availability: "unavailable" as const },
  { candidateId: timeCandidates[7].id, userId: users[5].userId, availability: "available" as const },
  // 候補3 (9/19): △1 — 未投票多め
  { candidateId: timeCandidates[8].id, userId: users[0].userId, availability: "maybe" as const },
  { candidateId: timeCandidates[8].id, userId: users[1].userId, availability: "unavailable" as const },
  // 候補4 (9/26): ×4 ○3 — 逆転パターン
  { candidateId: timeCandidates[9].id, userId: users[0].userId, availability: "unavailable" as const },
  { candidateId: timeCandidates[9].id, userId: users[1].userId, availability: "unavailable" as const },
  { candidateId: timeCandidates[9].id, userId: users[2].userId, availability: "unavailable" as const },
  { candidateId: timeCandidates[9].id, userId: users[3].userId, availability: "unavailable" as const },
  { candidateId: timeCandidates[9].id, userId: users[4].userId, availability: "available" as const },
  { candidateId: timeCandidates[9].id, userId: users[5].userId, availability: "available" as const },
  { candidateId: timeCandidates[9].id, userId: users[6].userId, availability: "available" as const },
  // 候補5 (10/3): 少数投票
  { candidateId: timeCandidates[10].id, userId: users[0].userId, availability: "available" as const },
  { candidateId: timeCandidates[10].id, userId: users[1].userId, availability: "maybe" as const },
];

const placeVotes = [
  { candidateId: placeCandidates[0].id, userId: users[0].userId, score: 5 },
  { candidateId: placeCandidates[1].id, userId: users[1].userId, score: 4 },
  { candidateId: placeCandidates[2].id, userId: users[2].userId, score: 3 },
  { candidateId: placeCandidates[3].id, userId: users[2].userId, score: 5 },
  { candidateId: placeCandidates[4].id, userId: users[0].userId, score: 4 },
  { candidateId: placeCandidates[5].id, userId: users[5].userId, score: 3 },
];

const placeCache = [
  {
    query: "恵比寿 クラフトビール",
    response: {
      places: [
        {
          placeId: "place_ebisu_001",
          name: "恵比寿ビアバル",
          address: "東京都渋谷区恵比寿1-2-3",
          lat: 35.6467,
          lng: 139.71,
          priceLevel: 2,
        },
        {
          placeId: "place_shibuya_002",
          name: "渋谷クラフト横丁",
          address: "東京都渋谷区道玄坂2-4-1",
          lat: 35.6595,
          lng: 139.7005,
          priceLevel: 3,
        },
      ],
    },
  },
  {
    query: "新宿 カラオケ",
    response: {
      places: [
        {
          placeId: "place_shinjuku_001",
          name: "新宿カラオケタウン",
          address: "東京都新宿区歌舞伎町1-1-2",
          lat: 35.6947,
          lng: 139.703,
          priceLevel: 2,
        },
        {
          placeId: "place_shibuya_003",
          name: "渋谷カラオケパーク",
          address: "東京都渋谷区宇田川町20-3",
          lat: 35.662,
          lng: 139.698,
          priceLevel: 3,
        },
      ],
    },
  },
];

const notifications = [
  {
    userId: users[0].userId,
    type: "join_requested" as const,
    title: "参加申請のお知らせ",
    body: "だいきさんがイベント参加を申請しました。",
    message: "だいきさんがイベント参加を申請しました。",
    eventId: events[0].id,
  },
  {
    userId: users[2].userId,
    type: "invite_received" as const,
    title: "イベント招待",
    body: "けんたさんから招待が届きました。",
    message: "けんたさんから招待が届きました。",
    eventId: events[0].id,
  },
  {
    userId: users[4].userId,
    type: "event_confirmed" as const,
    title: "開催情報のお知らせ",
    body: "映画鑑賞会の日時とお店が確定しました。",
    message: "映画鑑賞会の日時とお店が確定しました。",
    eventId: events[2].id,
  },
];

async function main() {
  await prisma.eventPlaceVote.deleteMany();
  await prisma.eventTimeVote.deleteMany();
  await prisma.eventPlaceCandidate.deleteMany();
  await prisma.eventTimeCandidate.deleteMany();
  await prisma.eventInvite.deleteMany();
  await prisma.eventParticipant.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.event.deleteMany();
  await prisma.favoriteFriend.deleteMany();
  await prisma.friendship.deleteMany();
  await prisma.placeCache.deleteMany();
  await prisma.profile.deleteMany();

  await prisma.profile.createMany({ data: users });
  await prisma.friendship.createMany({ data: friendships });
  await prisma.favoriteFriend.createMany({ data: favoriteFriends });
  await prisma.event.createMany({ data: events });
  await prisma.eventParticipant.createMany({ data: participants });
  await prisma.eventInvite.createMany({ data: invites });
  await prisma.eventTimeCandidate.createMany({ data: timeCandidates });
  await prisma.eventPlaceCandidate.createMany({ data: placeCandidates });
  await prisma.eventTimeVote.createMany({ data: timeVotes });
  await prisma.eventPlaceVote.createMany({ data: placeVotes });
  await prisma.placeCache.createMany({ data: placeCache });
  await prisma.notification.createMany({ data: notifications });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
