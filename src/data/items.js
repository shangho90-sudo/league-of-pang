// 아이템 — 본진 상점 구역에서만 구매 가능
export const ITEMS = [
  { id: 'potion', name: '회복 물약', cost: 50, consumable: true, max: 3, desc: '10초에 걸쳐 체력 130을 회복합니다.', icon: '🧪' },
  { id: 'sword', name: '연마된 장검', cost: 350, stats: { ad: 12 }, desc: '공격력 +12', icon: '🗡' },
  { id: 'tome', name: '견습 마도서', cost: 400, stats: { ap: 20 }, desc: '주문력 +20', icon: '📘' },
  { id: 'ruby', name: '혈석', cost: 400, stats: { hp: 150 }, desc: '체력 +150', icon: '♦' },
  { id: 'mail', name: '사슬 조끼', cost: 300, stats: { armor: 16 }, desc: '방어력 +16', icon: '⛨' },
  { id: 'cloak', name: '은빛 망토', cost: 400, stats: { mr: 20 }, desc: '마법 저항력 +20', icon: '◈' },
  { id: 'boots', name: '여행자 장화', cost: 300, stats: { ms: 0.35 }, desc: '이동 속도 +0.35', icon: '👢' },
  { id: 'dagger', name: '바람 단검', cost: 300, stats: { as: 0.15 }, desc: '공격 속도 +15%', icon: '⚔' },
  { id: 'greatsword', name: '결전의 대검', cost: 1300, stats: { ad: 40 }, desc: '공격력 +40', icon: '⚔' },
  { id: 'scythe', name: '흡혈 낫', cost: 1300, stats: { ad: 28, lifesteal: 0.12 }, desc: '공격력 +28, 생명력 흡수 12%', icon: '☾' },
  { id: 'stormbow', name: '폭풍 시위', cost: 1400, stats: { as: 0.35, ad: 18 }, desc: '공격 속도 +35%, 공격력 +18', icon: '➶' },
  { id: 'staff', name: '비전 지팡이', cost: 1400, stats: { ap: 70 }, desc: '주문력 +70', icon: '✦' },
  { id: 'essence', name: '연금 정수', cost: 1200, stats: { ap: 35, healPower: 0.15, mpR: 1.5, cdr: 0.1 }, desc: '주문력 +35, 회복·보호막 효과 +15%, 재사용 대기시간 10% 감소', icon: '⚗' },
  { id: 'plate', name: '수호 판갑', cost: 1500, stats: { hp: 350, armor: 40 }, desc: '체력 +350, 방어력 +40', icon: '⛊' },
  { id: 'orb', name: '명상의 보주', cost: 1300, stats: { hp: 250, mr: 45 }, desc: '체력 +250, 마법 저항력 +45', icon: '◉' },
  { id: 'swiftboots', name: '신속의 장화', cost: 900, stats: { ms: 0.6, cdr: 0.05 }, desc: '이동 속도 +0.6, 재사용 대기시간 5% 감소', icon: '🥾' },
  { id: 'warhelm', name: '전쟁 투구', cost: 1500, stats: { hp: 300, ad: 25, cdr: 0.1 }, desc: '체력 +300, 공격력 +25, 재사용 대기시간 10% 감소', icon: '⛑' },
  // 추가 아이템
  { id: 'ring', name: '재생의 반지', cost: 350, stats: { hpR: 2 }, desc: '체력 재생 초당 +2', icon: '💍' },
  { id: 'amulet', name: '마력 부적', cost: 400, stats: { mp: 250 }, desc: '마나 +250', icon: '📿' },
  { id: 'windboots', name: '질풍의 장화', cost: 950, stats: { ms: 0.5, as: 0.12 }, desc: '이동 속도 +0.5, 공격 속도 +12%', icon: '👟' },
  { id: 'crystal', name: '비전 수정', cost: 1100, stats: { mp: 300, mpR: 2, cdr: 0.1 }, desc: '마나 +300, 마나 재생 초당 +2, 재사용 대기시간 10% 감소', icon: '💎' },
  { id: 'bulwark', name: '파수꾼의 방패', cost: 1300, stats: { hp: 300, dr: 0.06 }, desc: '체력 +300, 받는 피해 6% 감소', icon: '🛡' },
  { id: 'thorn', name: '가시 흉갑', cost: 1400, stats: { hp: 200, armor: 50 }, desc: '체력 +200, 방어력 +50', icon: '🦔' },
  { id: 'hourglass', name: '모래시계', cost: 1400, stats: { ap: 45, armor: 30, cdr: 0.1 }, desc: '주문력 +45, 방어력 +30, 재사용 대기시간 10% 감소', icon: '⏳' },
  { id: 'twinblades', name: '핏빛 쌍검', cost: 1500, stats: { ad: 30, as: 0.2, lifesteal: 0.06 }, desc: '공격력 +30, 공격 속도 +20%, 생명력 흡수 6%', icon: '⚔' },
  { id: 'axe', name: '거인의 도끼', cost: 1500, stats: { ad: 35, hp: 250 }, desc: '공격력 +35, 체력 +250', icon: '🪓' },
  { id: 'voidstaff', name: '공허의 홀', cost: 1600, stats: { ap: 60, dmgMult: 0.08 }, desc: '주문력 +60, 주는 피해 +8%', icon: '🔮' },
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const MAX_SLOTS = 6;
// 아이콘 그림: public/art/items/<id>.webp (기존 17종 = 상점 시안 그림, 추가 10종 = tools/paint_items.mjs로 그림)
export const itemIconSrc = (id, base = '') => `${base}public/art/items/${id}.webp`;

// 역할별 AI 구매 순서
export const BUILDS = {
  tank: ['boots', 'ruby', 'mail', 'plate', 'swiftboots', 'bulwark', 'thorn', 'orb'],
  fighter: ['boots', 'sword', 'ruby', 'warhelm', 'swiftboots', 'axe', 'scythe', 'plate'],
  assassin: ['boots', 'sword', 'greatsword', 'swiftboots', 'twinblades', 'warhelm', 'greatsword', 'orb'],
  marksman: ['boots', 'dagger', 'stormbow', 'windboots', 'twinblades', 'greatsword', 'scythe', 'orb'],
  mage: ['boots', 'tome', 'staff', 'swiftboots', 'voidstaff', 'hourglass', 'crystal', 'orb'],
  support: ['boots', 'amulet', 'essence', 'swiftboots', 'crystal', 'bulwark', 'orb', 'hourglass'],
  jungle: ['boots', 'sword', 'warhelm', 'swiftboots', 'axe', 'scythe', 'plate', 'orb'],
};
