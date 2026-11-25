// Exercise the production page renderers and native RPC entry point against a temporary real ledger.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const {spawn} = require('node:child_process');
const {createInterface} = require('node:readline');
const root = path.resolve(__dirname,'..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(),'cardfolio-ui-'));
const backend = spawn('python3',['-B','app.py','--stdio'],{cwd:root,env:{...process.env,CARDFOLIO_DATA:temp}});
const lines = createInterface({input:backend.stdout})[Symbol.asyncIterator]();
async function postMessage(message){
  backend.stdin.write(JSON.stringify(message)+'\n');
  const {value,done} = await lines.next();
  if(done)throw new Error('Local backend stopped');
  return JSON.parse(value);
}
const change = new Map(), nodes=new Map(), prefs=new Map();
function element(){
  return {dataset:{},innerHTML:'',open:false,addEventListener(){},setAttribute(){},
    classList:{add(){},remove(){},contains(){return false}},focus(){},querySelector(){return element()},
    showModal(){this.open=true},close(){this.open=false}};
}
const document={documentElement:element(),get title(){return this._title},set title(v){this._title=v},
  querySelector(selector){if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector)},
  addEventListener(type,callback){change.set(type,callback)}};
const window={webkit:{messageHandlers:{cardfolio:{postMessage}}},addEventListener(){},scrollTo(){}};
const context=vm.createContext({document,window,location:{protocol:'file:',hash:''},history:{pushState(){}},console,
  localStorage:{getItem:k=>prefs.get(k),setItem:(k,v)=>prefs.set(k,v)},matchMedia:()=>({matches:false,addEventListener(){}}),
  setTimeout,clearTimeout,Intl,Date,URL,HTMLImageElement:class{},Blob,FormData});
const run=(script)=>vm.runInContext(script,context);
(async()=>{
  for(const file of ['theme.js','app.js','workspace.js'])run(fs.readFileSync(path.join(root,'static',file),'utf8'));
  await change.get('DOMContentLoaded')();
  assert.match(nodes.get('#app').innerHTML,/Portfolio overview/);
  for(const mode of ['demo','live']){
    await run('changeMode('+JSON.stringify(mode)+')');
    for(const p of Object.keys(run('names'))){
      run('setPage('+JSON.stringify(p)+')');
      assert.match(nodes.get('#app').innerHTML,/<h1>/,p);
      assert.ok(!/\b(?:NaN|undefined)\b/.test(nodes.get('#app').innerHTML),p);
    }
  }
  const cardArt = (program, bank, network) => run('plastic(' + JSON.stringify({id:-1,name:'Test card',program,bank,network}) + ')');
  assert.match(cardArt('regalia','HDFC Bank','Visa'),/walletidentity/);
  assert.match(cardArt('regalia','HDFC Bank','Mastercard'),/regalia-gold-mastercard.png/);
  assert.match(cardArt('dream','Kotak Mahindra Bank','RuPay'),/dream-different.webp/);
  assert.match(cardArt('dream','Kotak Mahindra Bank','Visa'),/walletidentity/);
  run("setPage('overview')");
  await run("workspaceAction('set-theme',{dataset:{theme:'dark'}})");
  assert.equal(document.documentElement.dataset.theme,'dark');
  assert.equal(prefs.get('cardfolio.theme'),'dark');
  await run("workspaceAction('set-theme',{dataset:{theme:'light'}})");
  assert.equal(document.documentElement.dataset.theme,'light');
  await run("changeMode('demo')");
  run("setPage('wealth')");
  assert.ok(run('finance().assets - finance().liability === finance().net'));
  run("openStatement(1,s.today.slice(0,7))");
  assert.match(nodes.get('#modal').innerHTML,/Recorded net spend/);
  run("setPage('transactions'); resetLedger(); allHistory=true; sortOrder='high'; render()");
  assert.ok(run('filtered().every((r,i,list)=>!i||list[i-1].net>=r.net)'));
  run("setPage('simulator');draft={score:765,util:24,enquiries:2,late:0,ageMonths:19};render()");
  assert.match(nodes.get('#app').innerHTML,/67%/);
  run("setPage('settings')");
  assert.match(nodes.get('#app').innerHTML,/Enable phone access/);
  console.log('Rendered all 11 screens in both workspaces; startup, themes, net worth, statements, filters, simulator and phone settings passed.');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{
  backend.stdin.end();backend.kill();fs.rmSync(temp,{recursive:true,force:true});
});
