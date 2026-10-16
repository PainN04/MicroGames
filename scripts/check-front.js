// Confere a sintaxe dos scripts da página (cada um e todos juntos: declaração repetida entre arquivos dá erro). Roda no npm test.
const fs=require('fs'),vm=require('vm');const h=fs.readFileSync('public/index.html','utf8');
const files=[...h.matchAll(/<script src="(js\/[^"]+)"/g)].map(m=>'public/'+m[1]);
for(const f of files){try{new vm.Script(fs.readFileSync(f,'utf8'),{filename:f})}catch(e){console.log('ERRO',f,e.message);process.exitCode=1}}
try{new vm.Script(files.map(f=>fs.readFileSync(f,'utf8')).join('\n;\n'))}catch(e){console.log('ERRO junto',e.message);process.exitCode=1}
console.log('sintaxe ok:',files.length,'arquivos');
