// WebAudio 효과음 + 화면별 Runway 오케스트라 음악. 음원은 같은 사이트에서 스트리밍한다.
import {CombatAudio} from './combatAudio.js';
const MUSIC = { title: 'title', select: 'select', menu: 'select', battle: 'battle' };
export class Audio {
  constructor() {
    this.ctx = null; this.vol = { master: 0.7, sfx: 0.8, music: 0.4 };
    this.last = {};this.combat=new CombatAudio(this);
    this.musicOn = null; this.musicVoice = null; this.musicVoices = new Set(); this.musicEpoch = 0;
  }
  init() {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain();
      this.limiter=this.ctx.createDynamicsCompressor();this.limiter.threshold.value=-8;this.limiter.knee.value=10;this.limiter.ratio.value=6;this.limiter.attack.value=.003;this.limiter.release.value=.16;
      this.master.connect(this.limiter);this.limiter.connect(this.ctx.destination);
      this.sfxG = this.ctx.createGain(); this.sfxG.connect(this.master);
      this.announcementDuck = this.ctx.createGain(); this.announcementDuck.connect(this.master);
      this.musG = this.ctx.createGain(); this.musG.connect(this.announcementDuck);
      this.applyVol();
      // 노이즈 버퍼
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  }
  applyVol() { if (!this.ctx) return; this.master.gain.value = this.vol.master; this.sfxG.gain.value = this.vol.sfx; this.musG.gain.cancelScheduledValues(this.ctx.currentTime); this.musG.gain.setValueAtTime(this.vol.music,this.ctx.currentTime); }
  async loadCombat(ids){this.init();if(this.ctx)await this.combat.load(ids);}
  playCombat(id,kind,options){return this.combat.play(id,kind,options);}
  duckMusic(){if(!this.ctx)return;const g=this.musG.gain,t=this.ctx.currentTime;g.cancelAndHoldAtTime(t);g.linearRampToValueAtTime(this.vol.music*.55,t+.06);g.linearRampToValueAtTime(this.vol.music,t+1.4);}
  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this.musicOn && !this.musicVoice) this.startMusic(this.musicOn);
  }
  _throttle(key, gap) { const t = performance.now(); if (this.last[key] && t - this.last[key] < gap) return true; this.last[key] = t; return false; }
  tone(freq, dur, { type = 'sine', vol = 0.2, attack = 0.005, slide = 0, delay = 0, dest } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest || this.sfxG);
    o.start(t); o.stop(t + dur + 0.05);
  }
  noiseBurst(dur, { freq = 1200, q = 1, vol = 0.25, type = 'bandpass', slide = 1, delay = 0 } = {}) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide !== 1) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.sfxG);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }
  play(name, vol = 1) {
    if (!this.ctx || this._throttle(name, 40)) return;
    const v = vol;
    switch (name) {
      case 'swing': this.noiseBurst(0.14, { freq: 2400, q: 1.5, vol: 0.18 * v, slide: 0.4 }); break;
      case 'hitPhys': this.noiseBurst(0.08, { freq: 900, q: 0.8, vol: 0.3 * v }); this.tone(140, 0.09, { type: 'triangle', vol: 0.18 * v, slide: 0.5 }); break;
      case 'hitHeavy': this.noiseBurst(0.22, { freq: 400, q: 0.7, vol: 0.4 * v, type: 'lowpass', slide: 0.5 }); this.tone(80, 0.25, { type: 'sine', vol: 0.35 * v, slide: 0.5 }); break;
      case 'hitMagic': this.tone(660, 0.16, { type: 'triangle', vol: 0.12 * v, slide: 1.6 }); this.noiseBurst(0.1, { freq: 3000, q: 4, vol: 0.08 * v }); break;
      case 'arrow': this.noiseBurst(0.1, { freq: 4000, q: 3, vol: 0.1 * v, slide: 0.6 }); this.tone(900, 0.06, { type: 'square', vol: 0.03 * v, slide: 0.5 }); break;
      case 'zap': this.tone(520, 0.12, { type: 'sawtooth', vol: 0.06 * v, slide: 1.8 }); break;
      case 'cast': this.tone(440, 0.22, { type: 'sine', vol: 0.1 * v, slide: 1.5 }); this.tone(660, 0.2, { type: 'sine', vol: 0.07 * v, slide: 1.5, delay: 0.04 }); break;
      case 'ult': this.tone(220, 0.6, { type: 'sawtooth', vol: 0.08 * v, slide: 2 }); this.tone(330, 0.6, { type: 'triangle', vol: 0.1 * v, slide: 2, delay: 0.05 }); this.noiseBurst(0.5, { freq: 600, q: 0.6, vol: 0.12 * v, slide: 3 }); break;
      case 'boom': this.noiseBurst(0.45, { freq: 500, q: 0.5, vol: 0.45 * v, type: 'lowpass', slide: 0.3 }); this.tone(60, 0.4, { vol: 0.4 * v, slide: 0.5 }); break;
      case 'glass': for (let i = 0; i < 4; i++) this.tone(1800 + Math.random() * 1600, 0.12, { type: 'triangle', vol: 0.05 * v, delay: i * 0.02 }); this.noiseBurst(0.12, { freq: 5000, q: 2, vol: 0.1 * v }); break;
      case 'heal': [523, 659, 784].forEach((f, i) => this.tone(f, 0.3, { type: 'sine', vol: 0.07 * v, delay: i * 0.05 })); break;
      case 'shield': this.tone(392, 0.3, { type: 'triangle', vol: 0.1 * v, slide: 1.25 }); this.tone(784, 0.25, { type: 'sine', vol: 0.05 * v, delay: 0.03 }); break;
      case 'turret': this.tone(300, 0.25, { type: 'sawtooth', vol: 0.07 * v, slide: 0.4 }); this.noiseBurst(0.15, { freq: 1500, vol: 0.08 * v }); break;
      case 'level': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.25, { type: 'triangle', vol: 0.1 * v, delay: i * 0.07 })); break;
      case 'gold': this.tone(1318, 0.08, { type: 'square', vol: 0.03 * v }); this.tone(1760, 0.1, { type: 'square', vol: 0.03 * v, delay: 0.05 }); break;
      case 'click': this.tone(880, 0.04, { type: 'square', vol: 0.04 * v }); break;
      case 'deny': this.tone(220, 0.12, { type: 'square', vol: 0.05 * v }); this.tone(180, 0.12, { type: 'square', vol: 0.05 * v, delay: 0.08 }); break;
      case 'death': this.tone(330, 0.5, { type: 'triangle', vol: 0.12 * v, slide: 0.4 }); break;
      case 'note': this.tone([523, 587, 659, 784, 880][Math.floor(Math.random() * 5)], 0.25, { type: 'sine', vol: 0.08 * v }); break;
      case 'recall': this.tone(392, 1.2, { type: 'sine', vol: 0.06 * v, slide: 2, attack: 0.3 }); break;
      case 'victory': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.6, { type: 'triangle', vol: 0.12, delay: i * 0.12 })); break;
      case 'defeat': [392, 349, 311, 262].forEach((f, i) => this.tone(f, 0.7, { type: 'triangle', vol: 0.12, delay: i * 0.18 })); break;
    }
  }
  async startMusic(mode = 'battle') {
    mode = MUSIC[mode] || 'battle';
    if (this.musicOn === mode && this.musicVoice) return;
    this.musicOn = mode;
    if (!this.ctx) return; // 첫 사용자 입력에서 다시 시작 (브라우저 자동 재생 정책)
    const epoch = ++this.musicEpoch;
    const element = document.createElement('audio');
    element.src = new URL(`public/audio/${mode}.mp3`, document.baseURI).href;
    element.loop = true; element.preload = 'auto';
    const source = this.ctx.createMediaElementSource(element), gain = this.ctx.createGain();
    gain.gain.value = 0; source.connect(gain); gain.connect(this.musG);
    const voice = { element, source, gain, timer: null };
    this.musicVoices.add(voice);
    try {
      await element.play();
      if (epoch !== this.musicEpoch) { this.releaseMusic(voice); return; }
      const old = this.musicVoice;
      this.musicVoice = voice;
      gain.gain.setValueAtTime(0, this.ctx.currentTime);
      gain.gain.linearRampToValueAtTime(mode === 'battle' ? 0.65 : 0.85, this.ctx.currentTime + 1.5);
      if (old) this.fadeMusic(old);
    } catch (e) {
      this.releaseMusic(voice);
      if (epoch === this.musicEpoch) {
        if (this.musicVoice) this.fadeMusic(this.musicVoice);
        this.musicVoice = null;
        if (e.name !== 'NotAllowedError') console.warn('배경음악을 불러오지 못했습니다:', mode, e.message);
      }
    }
  }
  fadeMusic(voice, seconds = 1.5) {
    const g = voice.gain.gain, now = this.ctx.currentTime;
    g.cancelAndHoldAtTime(now);
    g.linearRampToValueAtTime(0, now + seconds);
    voice.timer = setTimeout(() => this.releaseMusic(voice), seconds * 1000 + 100);
  }
  releaseMusic(voice) {
    clearTimeout(voice.timer); voice.element.pause();
    voice.element.removeAttribute('src'); voice.element.load();
    voice.source.disconnect(); voice.gain.disconnect(); this.musicVoices.delete(voice);
  }
  stopMusic() {
    ++this.musicEpoch; this.musicOn = null; this.musicVoice = null;
    for (const voice of this.musicVoices) this.fadeMusic(voice, 0.6);
  }
}
export const audio = new Audio();
