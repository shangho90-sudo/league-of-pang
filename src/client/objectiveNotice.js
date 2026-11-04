// Separate spawn notices cannot be overwritten by kill announcements.
const SPAWNS = {
  '비룡이 강 하류에 나타났습니다': ['비룡 출현', '강 하류에 비룡이 나타났습니다.', 'drake'],
  '협곡 거신이 깨어났습니다': ['협곡 거신 출현', '강 상류에 협곡 거신이 나타났습니다.', 'colossus'],
};
export class ObjectiveNotice {
  constructor(root) {
    this.root = document.createElement('div');
    this.root.id = 'objective-notices';
    this.root.setAttribute('role', 'status');
    this.root.setAttribute('aria-live', 'polite');
    root.appendChild(this.root);
    this.active = new Map();
  }
  show(text) {
    const info = SPAWNS[text];
    if (!info) return false;
    const [title, description, kind] = info;
    const old = this.active.get(kind);
    if (old) { clearTimeout(old.timer); old.card.remove(); }
    const card = document.createElement('div');
    card.className = 'objective-notice ' + kind;
    const heading = document.createElement('strong');
    heading.textContent = title;
    const detail = document.createElement('span');
    detail.textContent = description;
    card.append(heading, detail);
    this.root.appendChild(card);
    const timer = setTimeout(() => {
      card.remove();
      this.active.delete(kind);
    }, 3000);
    this.active.set(kind, { card, timer });
    return true;
  }
  destroy() {
    for (const { timer } of this.active.values()) clearTimeout(timer);
    this.active.clear();
    this.root.remove();
  }
}
