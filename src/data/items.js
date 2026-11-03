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
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));
export const MAX_SLOTS = 6;

// 역할별 AI 구매 순서
export const BUILDS = {
  tank: ['boots', 'ruby', 'mail', 'plate', 'swiftboots', 'orb', 'warhelm', 'plate'],
  fighter: ['boots', 'sword', 'ruby', 'warhelm', 'swiftboots', 'scythe', 'plate', 'greatsword'],
  assassin: ['boots', 'sword', 'greatsword', 'swiftboots', 'scythe', 'warhelm', 'greatsword', 'orb'],
  marksman: ['boots', 'dagger', 'stormbow', 'swiftboots', 'greatsword', 'scythe', 'stormbow', 'orb'],
  mage: ['boots', 'tome', 'staff', 'swiftboots', 'essence', 'staff', 'orb', 'staff'],
  support: ['boots', 'tome', 'essence', 'swiftboots', 'ruby', 'orb', 'plate', 'staff'],
  jungle: ['boots', 'sword', 'warhelm', 'swiftboots', 'scythe', 'plate', 'greatsword', 'orb'],
};
