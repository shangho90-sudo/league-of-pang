// Short Runway one-shots, decoded once and mixed through a bounded voice pool.
const KINDS=['attack','hit','Q','W','E','R'];
export class CombatAudio {
  constructor(owner){this.owner=owner;this.buffers=new Map();this.pending=new Map();this.voices=[];this.last=new Map();this.stats={played:0,dropped:0,byKey:{}};}
  async load(ids){
    const keys=[...new Set(ids)].flatMap(id=>KINDS.map(k=>`${id}/${k}`));let cursor=0;
    await Promise.all(Array.from({length:4},async()=>{while(cursor<keys.length)await this.loadOne(keys[cursor++]);}));
  }
  async loadOne(key){
    if(this.buffers.has(key))return;if(this.pending.has(key))return this.pending.get(key);
    const job=(async()=>{try{
      const response=await fetch(new URL(`public/audio/combat/${key}.mp3`,document.baseURI));if(!response.ok)throw new Error(String(response.status));
      const buffer=await this.owner.ctx.decodeAudioData(await response.arrayBuffer());
      let peak=0;for(let c=0;c<buffer.numberOfChannels;c++){const a=buffer.getChannelData(c);for(let i=0;i<a.length;i++)peak=Math.max(peak,Math.abs(a[i]));}
      const threshold=Math.max(.0001,peak*.018);let start=buffer.length,end=0;
      for(let c=0;c<buffer.numberOfChannels;c++){const a=buffer.getChannelData(c);let i=0,j=a.length-1;while(i<j&&Math.abs(a[i])<threshold)i++;while(j>i&&Math.abs(a[j])<threshold)j--;start=Math.min(start,i);end=Math.max(end,j);}
      this.buffers.set(key,{buffer,offset:Math.max(0,start/buffer.sampleRate-.006),duration:Math.max(.04,(end-start)/buffer.sampleRate+.06),gain:Math.min(100,.72/Math.max(peak,.0072))});
    }catch(e){console.warn('Combat audio unavailable:',key,e.message);}finally{this.pending.delete(key);}})();
    this.pending.set(key,job);return job;
  }
  play(id,kind,{volume=1,pan=0,unitId=id}={}){
    const ctx=this.owner.ctx,key=`${id}/${kind}`,clip=this.buffers.get(key);if(!ctx||ctx.state!=='running'||!clip)return false;
    const now=ctx.currentTime,tag=`${unitId}/${kind}`,gap=kind==='hit'?.16:kind==='attack'?.09:.10;
    if(now-(this.last.get(tag)??-10)<gap)return true;this.last.set(tag,now);
    const priority=kind==='R'?3:KINDS.indexOf(kind)>1?2:kind==='attack'?1:0;
    if(this.voices.length>=18){const victim=this.voices.find(v=>v.priority<priority);if(victim){victim.source.stop();this.release(victim);}else{this.stats.dropped++;return true;}}
    const source=ctx.createBufferSource(),gain=ctx.createGain(),panner=ctx.createStereoPanner();source.buffer=clip.buffer;
    source.playbackRate.value=(kind==='attack'||kind==='hit') ? .97+Math.random()*.06 : 1;
    const level=(kind==='hit'?.23:kind==='attack'?.35:kind==='R'?.55:.43)*Math.max(0,Math.min(volume,1))*clip.gain;
    gain.gain.setValueAtTime(0,now);gain.gain.linearRampToValueAtTime(level,now+.004);
    const duration=Math.min(clip.duration,clip.buffer.duration-clip.offset)/source.playbackRate.value;
    gain.gain.setValueAtTime(level,now+Math.max(.005,duration-.045));gain.gain.linearRampToValueAtTime(0,now+duration);
    panner.pan.value=Math.max(-.75,Math.min(.75,pan));source.connect(gain);gain.connect(panner);panner.connect(this.owner.sfxG);
    const voice={source,gain,panner,priority};this.voices.push(voice);source.onended=()=>this.release(voice);
    source.start(now,clip.offset);source.stop(now+duration+.005);
    if(kind==='R'&&volume>.6)this.owner.duckMusic();
    this.stats.played++;this.stats.byKey[key]=(this.stats.byKey[key]||0)+1;return true;
  }
  release(v){const i=this.voices.indexOf(v);if(i<0)return;this.voices.splice(i,1);v.source.disconnect();v.gain.disconnect();v.panner.disconnect();}
  stop(){for(const v of [...this.voices]){try{v.source.stop();}catch{}this.release(v);}this.last.clear();}
}
