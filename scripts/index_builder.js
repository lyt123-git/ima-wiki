const fs=require('fs'),path=require('path'),C=require('./wiki_core');
const {pages}=C.load(),groups=Object.fromEntries(C.DIRS.map(d=>[d,pages.filter(p=>p.kind===d).sort((a,b)=>a.id.localeCompare(b.id))]));
const labels={concepts:'概念',entities:'实体',sources:'源摘要',comparisons:'对比'};
const lines=['# 知识库索引','',`> 最后更新：${C.today()} ｜ 页面总数：${pages.length}（概念 ${groups.concepts.length} / 实体 ${groups.entities.length} / 源摘要 ${groups.sources.length} / 对比 ${groups.comparisons.length}）`,'','> 自动生成。学习与复盘入口见 [首页](首页.md)。'];
for(const d of C.DIRS){lines.push('',`## ${labels[d]}（${d}）`,'');for(const p of groups[d]){const m=/## (?:一句话摘要|定义|是什么|结论)\s*\n+([^\n]+)/.exec(p.body);const desc=(m?.[1]||'待补充摘要').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g,(_,a,b)=>b||a).replace(/\*\*/g,'').slice(0,100);lines.push(`- [[wiki/${p.id.replace(/\.md$/,'')}|${p.title}]] — ${desc}`)}}
const out=lines.join('\n')+'\n';if(process.argv.includes('--dry'))console.log(out);else{fs.writeFileSync(path.join(C.ROOT,'index.md'),out);console.log('Index:',pages.length)}
