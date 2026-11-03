// 챔피언 데이터 — 모든 수치는 여기서 조정한다.
// 스킬 targeting: 'point'(지점) | 'dir'(방향) | 'ally'(아군 대상, 빠른 시전=자신) | 'self' | 'enemy'(적 대상)
// model: public/models/m{n}.glb (사용자 제공 리깅 모델 — 머리/얼굴 기반), 매핑은 자유롭게 변경 가능

export const ROLES = {
  tank: '탱커', fighter: '전사', assassin: '암살자', marksman: '원거리 딜러', mage: '마법사', support: '서포터', jungle: '정글러',
};

export const CHAMPIONS = [
  {
    id: 'pang', name: '김두영', title: '생명의 연금약사', roles: ['support', 'mage'], lanePref: ['bot', 'mid', 'jungle', 'top'],
    model: 0, arche: 'staff', body: [1.0, 1.0, 1.0], coat: 0xeee6d2, trim: 0x2fb8a8, accent: 0x7af0e0,
    stats: { hp: 520, hpG: 78, mp: 380, mpG: 40, ad: 46, adG: 2.6, armor: 22, armG: 3.5, mr: 30, mrG: 1.3, as: 0.64, asG: 0.02, range: 5.4, ms: 3.35, hpR: 1.2, mpR: 2.2, ranged: true, proj: 'alch', projSpeed: 16, windup: 0.30 },
    passive: { name: '조제 순환', desc: '스킬을 사용할 때마다 조제 게이지가 1 쌓입니다. 3이 되면 다음 일반 스킬이 강화됩니다(Q 피해 +50%, W 회복 +50%, E 둔화 +20%p·속박 0.6초).' },
    skills: {
      Q: { name: '파열 약병', t: 'point', range: 8.5, radius: 2.2, cd: 7, cost: 50, castTime: 0.25, desc: '지정 위치에 약병을 던져 {dmg}의 마법 피해를 줍니다.', base: [70, 115, 160, 205, 250], ap: 0.6 },
      W: { name: '생기 처방', t: 'ally', range: 7.5, cd: 12, cost: 70, castTime: 0.2, desc: '아군을 즉시 {heal} 회복시키고 3초간 {hot}을 추가로 회복시킵니다. 빠른 시전 시 자신에게 사용합니다.', base: [60, 90, 120, 150, 180], hot: [30, 45, 60, 75, 90], ap: 0.4 },
      E: { name: '응고 지대', t: 'point', range: 7.5, radius: 2.8, cd: 14, cost: 60, castTime: 0.2, desc: '3초간 연금액을 펼쳐 적을 35% 둔화시키고 초당 {dps}의 마법 피해를 줍니다.', base: [12, 18, 24, 30, 36], ap: 0.1 },
      R: { name: '생명의 대조제', t: 'point', range: 6.5, radius: 6, cd: 90, cost: 100, castTime: 0.45, desc: '5초간 넓은 영역을 만들어 아군을 초당 {hps} 회복시키고, 최초 발동 시 {shield}의 보호막을 부여합니다.', base: [30, 45, 60], shield: [90, 150, 210], ap: 0.2 },
    },
  },
  {
    id: 'koo', name: '구자현', title: '흑철의 수호자', roles: ['tank'], lanePref: ['top', 'jungle', 'bot', 'mid'],
    model: 1, arche: 'shield', body: [1.18, 1.05, 1.15], coat: 0x4c5563, trim: 0x2c3038, accent: 0xff8a2a,
    stats: { hp: 640, hpG: 105, mp: 300, mpG: 35, ad: 58, adG: 3.2, armor: 34, armG: 4.4, mr: 32, mrG: 1.8, as: 0.62, asG: 0.018, range: 1.9, ms: 3.25, hpR: 2.2, mpR: 1.6, ranged: false, windup: 0.32 },
    passive: { name: '철갑 축적', desc: '전투 중 10초마다 최대 체력의 9% 보호막을 4초간 얻습니다.' },
    skills: {
      Q: { name: '철벽 강타', t: 'dir', range: 3.0, width: 2.6, cd: 6, cost: 35, castTime: 0.3, desc: '방패로 전방을 타격해 {dmg}(+최대 체력 3%)의 물리 피해를 주고 1초간 30% 둔화시킵니다.', base: [60, 95, 130, 165, 200], ad: 0.6 },
      W: { name: '요새 자세', t: 'self', cd: 14, cost: 40, castTime: 0.1, desc: '3초간 받는 피해가 {dr}% 감소하지만 이동 속도가 25% 느려집니다.', base: [30, 34, 38, 42, 46] },
      E: { name: '중갑 돌진', t: 'dir', range: 6, width: 1.6, cd: 12, cost: 50, castTime: 0.1, desc: '지정 방향으로 돌진해 처음 맞은 적에게 {dmg}의 피해를 주고 밀어냅니다.', base: [50, 80, 110, 140, 170], ad: 0.4 },
      R: { name: '수호자의 진격', t: 'dir', range: 11, width: 2.6, cd: 100, cost: 100, castTime: 0.6, desc: '0.6초 준비 후 전방으로 돌격해 충돌한 적을 1초간 공중에 띄우고 {dmg}의 피해를 줍니다.', base: [120, 200, 280], ad: 0.6 },
    },
  },
  {
    id: 'bang', name: '방지욱', title: '허상의 추적자', roles: ['assassin', 'jungle'], lanePref: ['mid', 'jungle', 'top', 'bot'],
    model: 2, arche: 'dual', body: [0.92, 1.04, 0.92], coat: 0x262f52, trim: 0x3a2f6a, accent: 0xb06aff,
    stats: { hp: 560, hpG: 86, mp: 280, mpG: 30, ad: 62, adG: 3.4, armor: 26, armG: 3.6, mr: 30, mrG: 1.3, as: 0.68, asG: 0.03, range: 1.8, ms: 3.5, hpR: 1.6, mpR: 1.8, ranged: false, windup: 0.22 },
    passive: { name: '빈틈 추적', desc: '표식이 있는 적을 공격하면 표식을 소모해 {mark}의 추가 마법 피해를 줍니다.' },
    skills: {
      Q: { name: '그림자 칼날', t: 'dir', range: 9, width: 0.8, cd: 6, cost: 40, castTime: 0.2, speed: 22, desc: '직선으로 칼날을 던져 처음 맞은 적에게 {dmg}의 물리 피해를 주고 4초간 표식을 남깁니다.', base: [60, 95, 130, 165, 200], ad: 0.7 },
      W: { name: '잔영 교란', t: 'self', cd: 14, cost: 45, castTime: 0.05, desc: '현재 위치에 2초 후 사라지는 잔영을 남기고 1.5초간 이동 속도가 40% 증가합니다.', base: [0, 0, 0, 0, 0] },
      E: { name: '측면 침투', t: 'dir', range: 4.5, cd: 9, cost: 35, castTime: 0.05, desc: '짧게 돌진하고 다음 기본 공격이 {bonus}% 강화됩니다.', base: [40, 50, 60, 70, 80] },
      R: { name: '허상의 포위', t: 'enemy', range: 6.5, cd: 80, cost: 100, castTime: 0.15, desc: '대상 주변에 잔영 4개를 생성한 뒤 연속 참격으로 회당 {dmg}의 물리 피해를 줍니다. 시전 중 대상으로 지정할 수 없습니다.', base: [60, 100, 140], ad: 0.5 },
    },
  },
  {
    id: 'park', name: '팽재현', title: '용광로의 장인', roles: ['fighter'], lanePref: ['top', 'jungle', 'mid', 'bot'],
    model: 3, arche: 'hammer', body: [1.1, 1.0, 1.08], coat: 0x7a5232, trim: 0x5a3a22, accent: 0xff7a2a,
    stats: { hp: 610, hpG: 96, mp: 300, mpG: 34, ad: 64, adG: 3.6, armor: 30, armG: 4.0, mr: 30, mrG: 1.5, as: 0.63, asG: 0.022, range: 2.0, ms: 3.3, hpR: 2.0, mpR: 1.6, ranged: false, windup: 0.34 },
    passive: { name: '달아오른 강철', desc: '공격 시 열기 12, 스킬 시 20을 얻습니다. 열기가 100이 되면 다음 일반 스킬 피해가 40% 증가하고 Q가 0.5초 기절을 겁니다.' },
    skills: {
      Q: { name: '단조 타격', t: 'dir', range: 3.3, angle: 70, cd: 6, cost: 30, castTime: 0.35, desc: '전방 부채꼴을 망치로 내려쳐 {dmg}의 물리 피해를 줍니다.', base: [70, 110, 150, 190, 230], ad: 0.8 },
      W: { name: '담금질', t: 'self', radius: 2.6, cd: 13, cost: 45, castTime: 0.1, desc: '3초간 {shield}의 보호막을 얻고 주변 적에게 초당 {dps}의 열기 피해를 줍니다.', base: [70, 110, 150, 190, 230], dps: [15, 22, 29, 36, 43] },
      E: { name: '쇄도', t: 'dir', range: 4.2, width: 1.6, cd: 10, cost: 40, castTime: 0.1, desc: '전진하며 지나간 적에게 {dmg}의 물리 피해를 주고 25% 둔화시킵니다.', base: [50, 80, 110, 140, 170], ad: 0.5 },
      R: { name: '거인의 모루', t: 'point', range: 6.5, radius: 4.2, inner: 1.8, cd: 90, cost: 100, castTime: 0.3, delay: 0.9, desc: '모루를 소환해 내려칩니다. 중심(반경 1.8)의 적은 1.25초 기절하고 {dmg}의 피해를, 주변 적은 절반의 피해와 40% 둔화를 받습니다.', base: [180, 280, 380], ad: 0.8 },
    },
  },
  {
    id: 'jung', name: '이선용', title: '여명의 기사', roles: ['fighter', 'tank'], lanePref: ['top', 'bot', 'jungle', 'mid'],
    model: 4, arche: 'sword', body: [1.05, 1.06, 1.02], coat: 0xf2efe6, trim: 0xd7a83a, accent: 0x4a8adf,
    stats: { hp: 600, hpG: 92, mp: 320, mpG: 36, ad: 60, adG: 3.3, armor: 30, armG: 4.1, mr: 32, mrG: 1.6, as: 0.65, asG: 0.022, range: 2.0, ms: 3.35, hpR: 1.9, mpR: 1.7, ranged: false, windup: 0.28 },
    passive: { name: '기사의 맹세', desc: '아군 영웅이 6 거리 안에 있으면 방어력과 마법 저항력이 15 증가합니다.' },
    skills: {
      Q: { name: '여명 베기', t: 'dir', range: 7.5, width: 1.3, cd: 7, cost: 40, castTime: 0.3, speed: 18, desc: '전방을 베고 검기를 발사해 {dmg}의 물리 피해를 줍니다.', base: [60, 95, 130, 165, 200], ad: 0.7 },
      W: { name: '수호의 맹세', t: 'ally', range: 6.5, cd: 12, cost: 55, castTime: 0.1, desc: '자신 또는 지정 아군에게 2.5초간 {shield}의 보호막을 부여합니다.', base: [70, 110, 150, 190, 230], ad: 0.3 },
      E: { name: '빛의 진입', t: 'dir', range: 5, cd: 11, cost: 45, castTime: 0.05, desc: '지정 방향으로 돌진해 도착 지점 주변 적에게 {dmg}의 물리 피해를 줍니다.', base: [40, 65, 90, 115, 140], ad: 0.4 },
      R: { name: '여명의 성역', t: 'self', radius: 5.5, cd: 100, cost: 100, castTime: 0.4, desc: '4초간 성역 안의 아군이 받는 피해가 30% 감소하고, 종료 시 빛의 파동으로 {dmg}의 마법 피해를 줍니다.', base: [150, 240, 330], ad: 0.5 },
    },
  },
  {
    id: 'cha', name: '사공민', title: '폭풍의 사수', roles: ['marksman'], lanePref: ['bot', 'mid', 'top', 'jungle'],
    model: 5, arche: 'bow', body: [0.96, 1.02, 0.96], coat: 0xcfd8e2, trim: 0x2f5f8a, accent: 0x9ae8ff,
    stats: { hp: 520, hpG: 82, mp: 300, mpG: 34, ad: 58, adG: 3.4, armor: 22, armG: 3.4, mr: 30, mrG: 1.0, as: 0.68, asG: 0.035, range: 6.5, ms: 3.3, hpR: 1.3, mpR: 1.6, ranged: true, proj: 'arrow', projSpeed: 26, windup: 0.22 },
    passive: { name: '가속 사격', desc: '같은 대상을 연속 공격하면 공격 속도가 8%씩 증가합니다(최대 5회).' },
    skills: {
      Q: { name: '관통 화살', t: 'dir', range: 11, width: 0.8, cd: 8, cost: 50, castTime: 0.3, speed: 30, desc: '일직선으로 관통하는 화살을 쏴 {dmg}의 물리 피해를 줍니다(대상마다 10% 감소, 최소 50%).', base: [70, 110, 150, 190, 230], ad: 1.0 },
      W: { name: '정밀 조준', t: 'self', cd: 14, cost: 40, castTime: 0.05, desc: '4초간 기본 공격 사거리가 1.5 늘고 피해가 {bonus}% 증가합니다.', base: [15, 20, 25, 30, 35] },
      E: { name: '회피 기동', t: 'dir', range: 3.6, cd: 10, cost: 30, castTime: 0.0, desc: '짧은 거리를 빠르게 이동합니다.', base: [0, 0, 0, 0, 0] },
      R: { name: '폭풍 사격', t: 'dir', range: 10, angle: 50, cd: 80, cost: 100, castTime: 0.2, channel: 2.0, desc: '2초간 지정 부채꼴 방향으로 화살 12발을 연속으로 쏘아 발당 {dmg}의 물리 피해를 줍니다.', base: [32, 48, 64], ad: 0.3 },
    },
  },
  {
    id: 'sagong', name: '차동호', title: '별길의 항해사', roles: ['mage'], lanePref: ['mid', 'bot', 'top', 'jungle'],
    model: 6, arche: 'orb', body: [0.98, 1.0, 0.98], coat: 0x23306a, trim: 0x4a3a8a, accent: 0xf2c94a,
    stats: { hp: 510, hpG: 80, mp: 420, mpG: 45, ad: 50, adG: 2.8, armor: 21, armG: 3.3, mr: 30, mrG: 1.3, as: 0.64, asG: 0.02, range: 6.0, ms: 3.3, hpR: 1.2, mpR: 2.4, ranged: true, proj: 'star', projSpeed: 18, windup: 0.28 },
    passive: { name: '성도 기록', desc: '스킬이 적에게 명중할 때마다 별 표식을 얻습니다. 3개가 되면 다음 기본 공격이 {bonus}의 추가 마법 피해를 줍니다.' },
    skills: {
      Q: { name: '유성편', t: 'dir', range: 9.5, width: 1.0, cd: 5, cost: 45, castTime: 0.25, speed: 20, desc: '별빛 파편을 발사해 처음 맞은 적에게 {dmg}의 마법 피해를 줍니다.', base: [80, 125, 170, 215, 260], ap: 0.7 },
      W: { name: '중력 우물', t: 'point', range: 8, radius: 2.1, cd: 13, cost: 70, castTime: 0.25, desc: '좁은 영역의 적을 40% 둔화시키고 1.4초 후 중심으로 끌어당기며 {dmg}의 마법 피해를 줍니다.', base: [60, 95, 130, 165, 200], ap: 0.5 },
      E: { name: '궤도 변경', t: 'dir', range: 4.5, cd: 12, cost: 50, castTime: 0.05, radius: 2.0, desc: '짧게 순간이동하고 출발 위치에 0.6초 후 폭발하는 별빛을 남겨 {dmg}의 마법 피해를 줍니다.', base: [50, 80, 110, 140, 170], ap: 0.4 },
      R: { name: '성좌 붕괴', t: 'point', range: 10, radius: 5.5, cd: 90, cost: 100, castTime: 0.5, delay: 1.2, desc: '충분한 사전 표시 후 넓은 범위에 유성 7개를 순차적으로 떨어뜨려 각각 {dmg}의 마법 피해를 줍니다.', base: [70, 110, 150], ap: 0.3 },
    },
  },
  {
    id: 'cho', name: '조강희', title: '숲의 맹약자', roles: ['jungle', 'fighter'], lanePref: ['jungle', 'top', 'mid', 'bot'],
    model: 7, arche: 'spear', body: [1.0, 1.03, 1.0], coat: 0x4a6a34, trim: 0x6a4a2a, accent: 0x9adf5a,
    stats: { hp: 590, hpG: 92, mp: 300, mpG: 32, ad: 63, adG: 3.5, armor: 28, armG: 3.8, mr: 30, mrG: 1.4, as: 0.67, asG: 0.025, range: 2.3, ms: 3.45, hpR: 1.9, mpR: 1.7, ranged: false, windup: 0.27 },
    passive: { name: '사냥의 맹약', desc: '정글 몬스터에게 20% 추가 피해를 주며, 처치 시 최대 체력의 8%를 회복하고 2초간 이동 속도가 30% 증가합니다.' },
    skills: {
      Q: { name: '송곳니 찌르기', t: 'dir', range: 3.6, width: 1.1, cd: 5, cost: 30, castTime: 0.25, desc: '전방의 좁은 범위를 찔러 {dmg}의 물리 피해를 줍니다.', base: [70, 110, 150, 190, 230], ad: 0.9 },
      W: { name: '숲의 숨결', t: 'self', cd: 12, cost: 50, castTime: 0.1, desc: '2초간 {heal}을 회복하고 3초간 방어력이 20 증가합니다.', base: [50, 80, 110, 140, 170], ad: 0.3 },
      E: { name: '도약 사냥', t: 'point', range: 6, radius: 1.7, cd: 11, cost: 45, castTime: 0.05, desc: '지정 위치로 도약해 착지 지점의 적에게 {dmg}의 물리 피해를 주고 30% 둔화시킵니다.', base: [50, 80, 110, 140, 170], ad: 0.5 },
      R: { name: '태고의 추적', t: 'self', cd: 80, cost: 100, castTime: 0.2, desc: '6초간 이동 속도와 공격 속도가 30% 증가하고, 첫 영웅 적중 공격이 1초 기절과 {dmg}의 추가 피해를 줍니다.', base: [100, 160, 220], ad: 0.6 },
    },
  },
  {
    id: 'kim', name: '정석호', title: '비전 포격수', roles: ['mage', 'marksman'], lanePref: ['mid', 'bot', 'top', 'jungle'],
    model: 8, arche: 'cannon', body: [1.02, 0.98, 1.02], coat: 0x5a4a6a, trim: 0x3a3048, accent: 0xd06aff,
    stats: { hp: 520, hpG: 80, mp: 400, mpG: 42, ad: 52, adG: 3.0, armor: 22, armG: 3.4, mr: 30, mrG: 1.3, as: 0.62, asG: 0.02, range: 7.0, ms: 3.25, hpR: 1.2, mpR: 2.3, ranged: true, proj: 'shell', projSpeed: 15, windup: 0.32 },
    passive: { name: '축전', desc: '이동과 스킬 사용으로 축전합니다. 100이 되면 다음 기본 공격이 80% 강화되고 주변에 폭발합니다.' },
    skills: {
      Q: { name: '마력 포탄', t: 'point', range: 12, radius: 1.8, cd: 7, cost: 55, castTime: 0.3, flight: 0.9, desc: '먼 거리에 포물선 포탄을 발사해 착탄 지점에 {dmg}의 마법 피해를 줍니다.', base: [80, 125, 170, 215, 260], ap: 0.7 },
      W: { name: '감응 지뢰', t: 'point', range: 6, radius: 1.3, cd: 8, cost: 40, castTime: 0.2, desc: '지뢰를 설치합니다(최대 3개). 적이 밟으면 {dmg}의 마법 피해와 40% 둔화를 줍니다.', base: [70, 105, 140, 175, 210], ap: 0.5 },
      E: { name: '반동 사격', t: 'dir', range: 4, angle: 50, cd: 10, cost: 45, castTime: 0.1, desc: '전방을 공격해 {dmg}의 마법 피해를 주며 반동으로 뒤로 이동합니다.', base: [50, 80, 110, 140, 170], ap: 0.4 },
      R: { name: '비전 포격망', t: 'point', range: 16, radius: 5, cd: 90, cost: 100, castTime: 0.5, delay: 1.0, desc: '지정 구역에 사전 경고 후 포탄 8발을 떨어뜨려 각각 {dmg}의 마법 피해를 줍니다. 착탄 위치는 미리 표시됩니다.', base: [60, 95, 130], ap: 0.3 },
    },
  },
  {
    id: 'lee', name: '박철호', title: '공명의 지휘자', roles: ['support', 'mage'], lanePref: ['bot', 'jungle', 'mid', 'top'],
    model: 9, arche: 'conductor', body: [0.97, 1.02, 0.97], coat: 0x2a8a86, trim: 0x6a2a6a, accent: 0xffa6e0,
    stats: { hp: 530, hpG: 80, mp: 380, mpG: 40, ad: 48, adG: 2.7, armor: 23, armG: 3.5, mr: 30, mrG: 1.3, as: 0.64, asG: 0.02, range: 5.5, ms: 3.35, hpR: 1.3, mpR: 2.2, ranged: true, proj: 'wave', projSpeed: 17, windup: 0.28 },
    passive: { name: '화음', desc: '서로 다른 일반 스킬 2개를 4초 안에 연계하면 다음 기본 공격이 {bonus}의 추가 마법 피해와 20% 둔화를 줍니다.' },
    skills: {
      Q: { name: '파동 선율', t: 'dir', range: 8.5, width: 1.4, cd: 6, cost: 45, castTime: 0.25, speed: 16, desc: '전방으로 관통하는 음파를 발사해 {dmg}의 마법 피해를 줍니다.', base: [60, 95, 130, 165, 200], ap: 0.5 },
      W: { name: '평온의 화음', t: 'self', radius: 5.5, cd: 13, cost: 65, castTime: 0.2, desc: '주변 아군에게 2.5초간 {shield}의 보호막을 줍니다.', base: [50, 80, 110, 140, 170], ap: 0.3 },
      E: { name: '행진 박자', t: 'self', radius: 5.5, cd: 14, cost: 50, castTime: 0.1, desc: '주변 아군의 이동 속도를 2.5초간 {ms}% 높입니다.', base: [20, 24, 28, 32, 36] },
      R: { name: '거대한 공명', t: 'dir', range: 8.5, angle: 60, cd: 90, cost: 100, castTime: 0.35, desc: '전방으로 넓은 공명파를 보내 적을 1.2초간 행동 불가 상태로 만들고 {dmg}의 마법 피해를 줍니다.', base: [100, 160, 220], ap: 0.5 },
    },
  },
];

export const CHAMP_BY_ID = Object.fromEntries(CHAMPIONS.map((c) => [c.id, c]));

// 레벨 & 성장
export const MAX_LEVEL = 13;
export const XP_TABLE = [0, 180, 380, 600, 840, 1100, 1380, 1680, 2000, 2340, 2700, 3080, 3480]; // 누적 경험치 (레벨 n 도달)
export const R_LEVELS = [6, 9, 12];
export const SKILL_ORDER = { // 자동 레벨업 우선순위
  default: ['Q', 'W', 'E', 'Q', 'Q', 'R', 'Q', 'E', 'R', 'Q', 'E', 'R', 'E', 'W', 'W', 'W'],
  support: ['W', 'Q', 'E', 'W', 'W', 'R', 'W', 'Q', 'R', 'W', 'Q', 'R', 'Q', 'E', 'E', 'E'],
};

export function respawnTime(level, gameTime) {
  return 6 + level * 1.6 + Math.min(10, gameTime / 90);
}
