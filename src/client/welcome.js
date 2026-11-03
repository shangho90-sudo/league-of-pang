// One announcement per match, driven by match time rather than loading time.
export const WELCOME_TEXT = '팽스닥의 협곡에 오신것을 환영합니다';
let welcomeClip, loading;

export function loadWelcomeAssets(audio) {
  if (loading) return loading;
  loading = Promise.all([
    document.fonts.load('32px Jua', WELCOME_TEXT).catch(e => console.warn('환영 글꼴:', e.message)),
    (async () => {
      audio.init();
      if (!audio.ctx || welcomeClip) return;
      try {
        const response = await fetch(new URL('public/audio/announcer/welcome.mp3', document.baseURI));
        if (!response.ok) throw new Error(String(response.status));
        const buffer = await audio.ctx.decodeAudioData(await response.arrayBuffer());
        let peak = 0;
        for (let c = 0; c < buffer.numberOfChannels; c++) for (const v of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
        const threshold = Math.max(.0005, peak * .015);
        let start = buffer.length, end = 0;
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          const samples = buffer.getChannelData(c); let i = 0, j = samples.length - 1;
          while (i < j && Math.abs(samples[i]) < threshold) i++;
          while (j > i && Math.abs(samples[j]) < threshold) j--;
          start = Math.min(start, i); end = Math.max(end, j);
        }
        const offset = Math.max(0, start / buffer.sampleRate - .01);
        welcomeClip = { buffer, offset, duration: Math.min(buffer.duration - offset, (end + 1) / buffer.sampleRate - offset + .08), gain: Math.min(16, .68 / Math.max(.01, peak)) };
      } catch (e) { console.warn('환영 음성:', e.message); }
    })(),
  ]).finally(() => { loading = null; });
  return loading;
}

export class WelcomeAnnouncement {
  constructor(game) {
    this.game = game; this.clip = welcomeClip;
    this.shown = game.sim.time >= 5; // Rejoining an ongoing match must not replay it.
    this.el = document.createElement('div'); this.el.id = 'match-welcome';
    this.el.setAttribute('role', 'status'); this.el.setAttribute('aria-live', 'polite');
    this.el.setAttribute('aria-hidden', 'true');
    const text = document.createElement('span'); text.textContent = WELCOME_TEXT; this.el.appendChild(text);
    game.hud.root.appendChild(this.el);
  }
  update() {
    const g = this.game;
    if (g.over) { if (this.visibleUntil || this.voice) this.dismiss(); return; }
    if (!this.shown && g.sim.time >= 5) {
      this.shown = true;
      // Skip a stale greeting after a long background/disconnection interval.
      if (g.sim.time < 9) {
        this.startedAt = g.sim.time;
        const duration = this.playVoice();
        this.visibleUntil = performance.now() + Math.max(4, duration + .25) * 1000;
        this.el.classList.add('visible'); this.el.setAttribute('aria-hidden', 'false');
      }
    }
    if (this.visibleUntil && performance.now() >= this.visibleUntil) this.hideText();
  }
  playVoice() {
    const audio = this.game.audio, ctx = audio.ctx, clip = this.clip;
    if (!ctx || ctx.state !== 'running' || !clip) return 0;
    const source = ctx.createBufferSource(), body = ctx.createBiquadFilter(), gain = ctx.createGain();
    source.buffer = clip.buffer; source.playbackRate.value = .96;
    body.type = 'lowshelf'; body.frequency.value = 160; body.gain.value = 2.8;
    gain.gain.value = clip.gain * .85;
    source.connect(body); body.connect(gain); gain.connect(audio.sfxG);
    const now = ctx.currentTime, duration = clip.duration / source.playbackRate.value;
    const duck = audio.announcementDuck.gain;
    duck.cancelAndHoldAtTime(now); duck.linearRampToValueAtTime(.28, now + .06);
    duck.setValueAtTime(.28, now + duration); duck.linearRampToValueAtTime(1, now + duration + .45);
    const voice = { source, body, gain }; this.voice = voice;
    source.onended = () => { source.disconnect(); body.disconnect(); gain.disconnect(); if (this.voice === voice) this.voice = null; };
    source.start(now, clip.offset, clip.duration);
    return duration;
  }
  hideText() { this.visibleUntil = 0; this.el.classList.remove('visible'); this.el.setAttribute('aria-hidden', 'true'); }
  dismiss() {
    this.hideText();
    if (this.voice) { this.voice.source.stop(); this.voice = null; }
    const audio = this.game.audio;
    if (audio.ctx && audio.announcementDuck) {
      const t = audio.ctx.currentTime, gain = audio.announcementDuck.gain;
      gain.cancelAndHoldAtTime(t); gain.linearRampToValueAtTime(1, t + .15);
    }
  }
  destroy() { this.dismiss(); this.el.remove(); }
}
