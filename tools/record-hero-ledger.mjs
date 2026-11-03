import fs from 'node:fs';
const plan=JSON.parse(fs.readFileSync('dev/tripo-hero-plan.json','utf8'));
const tasks=plan.plans.map(a=>{
  const r=JSON.parse(fs.readFileSync(`_art/tripo-heroes/records/${a.id}.json`,'utf8').replace(/^\uFEFF/,''));
  if(r.status!=='success')throw new Error(a.id+' incomplete');
  return {asset:a.id,label:a.label,type:r.type,task_id:r.task_id,credits:r.credits_consumed,status:r.status,submittedAt:fs.readFileSync(`_art/tripo-heroes/records/${a.id}.started`,'utf8').trim(),runtimeFile:a.runtimeFile};
}).sort((a,b)=>Date.parse(a.submittedAt)-Date.parse(b.submittedAt));
const total=tasks.reduce((s,t)=>s+t.credits,0);
const ledger={date:'2026-11-03',provider:'Tripo',model:'P1-20260311',approvedEstimate:1000,totalCredits:total,startingCredits:2075,remainingCredits:1075,frozenCredits:0,tasks};
fs.writeFileSync('docs/hero-asset-generation-ledger.json',JSON.stringify(ledger,null,2)+'\n');
fs.writeFileSync('docs/hero-asset-generation-ledger.md',`# 캐릭터 장비·이펙트 실제 제작 비용\n\n2026-11-03 · Tripo P1-20260311 · 27종 전부 성공\n\n총 **${total}크레딧**, 잔액 **1,075크레딧**, 동결 0. 장비 19종 × 40 = 760, 이펙트 8종 × 30 = 240. 추가 리깅·변환·재생성 비용 없음.\n\n| 순서 | 결과 | 단계 | 작업 ID | 실제 크레딧 |\n|---:|---|---|---|---:|\n`+tasks.map((t,i)=>`| ${i+1} | ${t.label} | ${t.type} | ${t.task_id} | ${t.credits} |`).join('\n')+'\n');
console.log(JSON.stringify({tasks:tasks.length,totalCredits:total,remainingCredits:1075}));
