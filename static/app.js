'use strict';
const $ = s => document.querySelector(s);
const app = $('#app'), modal = $('#modal');
const paths = {
  overview:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  transactions:'<path d="M4 7h15m-4-4 4 4-4 4M20 17H5m4-4-4 4 4 4"/>',
  cards:'<rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="M3 10h18M6 15h4"/>',
  rewards:'<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9-6.2-3.3-6.2 3.3L7 14.2l-5-4.9 6.9-1z"/>',
  connections:'<path d="m8 3 2 2m4-2 2 2M6 7l9 9m-7-7-3 3a4.2 4.2 0 0 0 6 6l3-3M4 20l-2 2m9-16 3-3m0 6 3-3"/>',
  shield:'<path d="M12 2 4 5.5v6c0 4.6 3 7.7 8 10.5 5-2.8 8-5.9 8-10.5v-6z"/><path d="m8.5 11.7 2.4 2.4 4.8-5"/>',
  down:'<path d="m7 10 5 5 5-5"/>', right:'<path d="m9 6 6 6-6 6"/>',left:'<path d="m15 6-6 6 6 6"/>', plus:'<path d="M12 5v14M5 12h14"/>',close:'<path d="m6 6 12 12M18 6 6 18"/>',
  calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18"/>',lock:'<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
  laptop:'<rect x="4" y="4" width="16" height="12" rx="2"/><path d="m4 16-2 4h20l-2-4"/>', growth:'<path d="m3 16 6-6 4 4 7-9m-6 0h6v6"/>',drop:'<path d="m3 8 6 6 4-4 7 9m-6 0h6v-6"/>',
  points:'<path d="m12 2 2.6 6.8L21 12l-6.4 3.1L12 22l-2.6-6.9L3 12l6.4-3.2z"/>',wallet:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="M4 7 16 3l1 2m4 6h-6v5h6m-3-2.5h.1"/>',
  menu:'<path d="M3 6h18M3 12h18M3 18h18"/>',search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',check:'<path d="m4 12 5 5L20 6"/>',mail:'<rect x="3" y="5" width="18" height="15" rx="3"/><path d="m4 7 8 6 8-6"/>',sms:'<path d="M4 4h16v13H9l-5 4z"/><path d="M8 9h8m-8 4h5"/>',
  edit:'<path d="m15 5 4 4M4 20l4-1L21 6l-4-4L4 15z"/>',refresh:'<path d="M20 7v5h-5m5-1A8 8 0 1 0 18 18"/>',contact:'<path d="M6 9q3 3 0 6m4-9q5 6 0 12m4-15q7 9 0 18"/>',chart:'<path d="M4 20h17M6 16v-4m5 4V7m5 9V3"/>',layers:'<path d="m2 8 10-6 10 6-10 6zM3 12l9 5 9-5M3 16l9 5 9-5"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',list:'<path d="M7 6h14M7 12h14M7 18h14M3 6h.1M3 12h.1M3 18h.1"/>', receipt:'<path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8m-8 4h6"/>',bag:'<rect x="4" y="7" width="16" height="14" rx="2"/><path d="M8 9V6a4 4 0 0 1 8 0v3"/>',plane:'<path d="m2 14 8-4 5-7 3-1-2 8 6 4-1 2-8-2-5 5-2-1 3-5z"/>',coffee:'<path d="M3 7h13v6a6 6 0 0 1-12 0zM16 8h2a3 3 0 0 1 0 6h-2M3 21h16"/>'
};
function icon(name,size=18){return '<svg aria-hidden="true" width="'+size+'" height="'+size+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">'+(paths[name]||'')+'</svg>'}
const esc = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = new Intl.NumberFormat('en-IN');
const rs = (paise,dec=false) => new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',minimumFractionDigits:dec?2:0,maximumFractionDigits:dec?2:0}).format(paise/100);
const dateName=(day,opts={day:'numeric',month:'short'})=>new Date(day+'T12:00:00').toLocaleDateString('en-IN',opts);
const monthName=(ym,short=false)=>dateName(ym+'-01',{month:short?'short':'long',year:'numeric'});
const monthAdd=(ym,n)=>{let [y,m]=ym.split('-').map(Number);let d=new Date(Date.UTC(y,m-1+n,1));return d.toISOString().slice(0,7)};
const sum=(rows,key)=>rows.reduce((s,r)=>s+r[key],0);
const names={overview:'Overview',tracker:'Spend tracker',transactions:'Transactions',cards:'My cards',rewards:'Rewards',wealth:'Net worth',stocks:'Investments',insights:'Insights',settings:'Settings',simulator:'Approval simulator',connections:'Connections'};
const subtitles={simulator:'Explore credit profile scenarios and card eligibility on your Mac.',tracker:'Track everyday expenses, monthly budgets and recurring bills.',overview:'Your spending, cards and rewards in one place.',transactions:'Search, review and reconcile your card activity.',cards:'Manage your cards, statement cycles and earning rules.',rewards:'Track the value your cards earn on each purchase.',connections:'Bring bank transaction alerts into your local ledger.'};
const native=window.webkit?.messageHandlers?.cardfolio;
let mode=location.protocol==='https:'?'live':'demo';
try{const saved=localStorage.getItem('cardfolio.workspace');if(['live','demo'].includes(saved))mode=saved}catch{}
let page='overview', selectedMonth='', cardIndex=0,period=6, query='', filterCard='', filterCat='',listPage=0,menuOpen=false, lastFocus=null, syncTimer=null,refreshSerial=0;
let s=null;
async function rpc(action='state',data={},requestedMode=mode){
  const msg={mode:requestedMode,action,data};
  let reply;
  if(native) reply=await native.postMessage(msg);
  else {const r=await fetch('/api',{method:'POST',headers:{'Content-Type':'application/json','X-Cardfolio':'local'},body:JSON.stringify(msg)});if(r.status===401)throw Error('Pair this phone');reply=await r.json()}
  if(!reply.ok)throw Error(reply.error||'Could not save the change.');
  return reply.state;
}
function notice(msg){const t=$('#toast');t.textContent=msg;t.classList.add('shown');clearTimeout(notice.timer);notice.timer=setTimeout(()=>t.classList.remove('shown'),3300)}
function button(text,action,ic='',cls='btn',more=''){return '<button type="button" class="'+cls+'" data-act="'+action+'" '+more+'>'+(ic?icon(ic,16):'')+esc(text)+'</button>'}
function iconBtn(action,ic,label,extra=''){return '<button type="button" class="iconbtn" data-act="'+action+'" aria-label="'+esc(label)+'" title="'+esc(label)+'" '+extra+'>'+icon(ic,16)+'</button>'}
function nav(key){return '<button class="navitem '+(page===key?'active':'')+'" data-nav="'+key+'" '+(page===key?'aria-current="page"':'')+'>'+icon(key==='tracker'?'chart':key==='simulator'?'growth':key,19)+'<span>'+names[key]+'</span>'+(key==='connections'&&s.review.length?'<b class="navnum">'+s.review.length+'</b>':'')+'</button>'}
function periodOptions(){
  const months=new Set([s.today.slice(0,7),selectedMonth,...s.entries.map(t=>t.day.slice(0,7))]);
  for(let i=1;i<12;i++)months.add(monthAdd(s.today.slice(0,7),-i));
  return [...months].filter(Boolean).sort().reverse().map(m=>'<option value="'+m+'" '+(m===selectedMonth?'selected':'')+'>'+esc(monthName(m))+'</option>').join('');
}
function monthSelect(){return '<label class="selectwrap">'+icon('calendar',16)+'<select aria-label="Reporting month" data-change="month">'+periodOptions()+'</select>'+icon('down',14)+'</label>'}
function shell(content){ renderShell(content) }
const forMonth=(ym,all=false)=>s.entries.filter(t=>t.day.startsWith(ym)&&(all||t.card>0));
const cardBy=id=>[...s.cards,...s.accounts].find(c=>c.id===Number(id));
const colors=['#268777','#d9a35b','#839ed0','#8caa7f','#ba8e98','#5e808c'];
const cardColors=['#218673','#c69755','#7995c1','#83a980'];
function breakdown(rows){
 const cats=s.categories.map(k=>[k,rows.filter(t=>t.category===k&&t.kind==='Purchase').reduce((v,r)=>v+r.amount,0)]).filter(a=>a[1]>0).sort((a,b)=>b[1]-a[1]);
 const shown=cats.slice(0,3);if(cats.length>3)shown.push(['Remaining',cats.slice(3).reduce((v,k)=>v+k[1],0)]);
 const total=shown.reduce((v,k)=>v+k[1],0);let start=0;
 const arcs=shown.map(([k,v],i)=>{const pct=v/total*100,offset=start;start+=pct;return '<circle cx="76" cy="76" r="60" fill="none" stroke="'+colors[i]+'" stroke-width="16" pathLength="100" stroke-dasharray="'+Math.max(.01,pct-(shown.length>1?1.4:0))+' 100" stroke-dashoffset="'+(-offset)+'" transform="rotate(-90 76 76)"><title>'+esc(k)+': '+rs(v)+'</title></circle>'}).join('');
 return '<section class="panel breakdown"><div class="panelhead"><div><h2>Spend breakdown</h2><p>Purchases by category</p></div><span class="panelicon">'+icon('chart',19)+'</span></div><div class="mix"><div class="ring"><svg viewBox="0 0 152 152" role="img" aria-label="Purchases by category"><circle cx="76" cy="76" r="60" fill="none" stroke="var(--track)" stroke-width="16"/>'+arcs+'</svg><div><strong>'+rows.filter(r=>r.kind==='Purchase').length+'</strong><span>Purchases</span></div></div><div class="mixlegend">'+(shown.length?shown.map(([k,v],i)=>'<div><span><i style="--c:'+colors[i]+'"></i>'+esc(k)+'</span><b>'+Math.round(v/total*100)+'%</b></div>').join(''):'<p>No purchases this month.</p>')+'</div></div></section>';
}
function merchantIcon(t){
 const marks={'Amazon':['a','#f9e4c3','#754518'],'IndiGo':['6E','#e5e7fe','#373a92'],'Swiggy':['S','#ffeadc','#cb5d1b'],'BigBasket':['bb','#e3f0d7','#568327'],'Zomato':['z','#ffe6e9','#ca324a'],'Uber':['U','#ecebf0','#282630'],'Croma':['C','#d9f0e9','#24796a'],'Air India':['AI','#fbe8e3','#a8443b'],'Blue Tokai':['B','#e5ecf2','#365a72']};
 const m=marks[t.merchant]||[t.merchant.slice(0,1).toUpperCase(),'#eee9fb','#7055a8'];
 return '<span class="merchantmark" style="background:'+m[1]+';color:'+m[2]+'">'+esc(m[0])+'</span>';
}
function table(rows){
 return '<div class="tablewrap"><table><thead><tr><th>Merchant</th><th>Payment method</th><th>Date</th><th class="num">Amount</th><th class="num">Points</th><th><span class="sr">Details</span></th></tr></thead><tbody>'+rows.map(t=>'<tr><td><div class="merchant">'+merchantIcon(t)+'<div><b>'+esc(t.merchant)+'</b><small>'+esc(t.category)+(t.kind==='Refund'?' · Refund':'')+'</small></div></div></td><td><span class="cardtag"><i style="--c:'+(t.card>0?cardColors[s.cards.findIndex(c=>c.id===t.card)%cardColors.length]:'#82b4a8')+'"></i>'+esc(cardBy(t.card)?.name)+'</span></td><td class="muted nowrap">'+dateName(t.day)+'</td><td class="num money">'+(t.kind==='Refund'?'−':'')+rs(t.amount,true)+'</td><td class="num pts">'+(t.points>0?'+':'')+fmt.format(t.points)+'</td><td>'+iconBtn('edit-entry','edit','Edit '+t.merchant,'data-id="'+t.id+'"')+'</td></tr>').join('')+'</tbody></table></div>';
}
function empty(title,body,btn=''){return '<div class="empty"><span class="emptyicon">'+icon('receipt',22)+'</span><b>'+esc(title)+'</b><p>'+esc(body)+'</p>'+btn+'</div>'}
function overview(){ return overviewPage() }
const allAccounts=()=>[...s.cards,...s.accounts];
function opts(arr,selected){return arr.map(a=>{const [v,t]=Array.isArray(a)?a:[a,a];return '<option value="'+esc(v)+'" '+(String(v)===String(selected)?'selected':'')+'>'+esc(t)+'</option>'}).join('')}
function stat(label,value,note,ic){return '<article class="panel stat"><span class="statlabel">'+icon(ic,17)+esc(label)+'</span><strong>'+esc(value)+'</strong><small>'+esc(note)+'</small></article>'}
function transactions(){
 const all=forMonth(selectedMonth,true),rows=filtered();const last=Math.max(0,Math.ceil(rows.length/12)-1);listPage=Math.min(listPage,last);
 return '<section class="panel"><div class="panelhead"><div><h2>Transaction ledger</h2><p>'+rows.length+' entries · '+rs(sum(rows,'net'))+' net spend</p></div>'+'<div class="inline">'+button('Import CSV','import-csv','upload')+button('Export','export','download')+'</div>'+'</div><div class="filters"><label class="searchbox">'+icon('search',17)+'<input id="search" aria-label="Search by merchant, category or source" placeholder="Search transactions" value="'+esc(query)+'"></label><select data-change="filterCard" aria-label="Payment method">'+opts([['','All payment methods'],...allAccounts().map(c=>[c.id,c.name])],filterCard)+'</select><select data-change="filterCat" aria-label="Category">'+opts([['','All categories'],...s.categories],filterCat)+'</select>'+ledgerFilters()+'</div>'+(rows.length?table(rows.slice(listPage*12,listPage*12+12)):empty('No matching transactions',all.length?'Try another search or filter.':'Add a transaction to this month.'))+'<div class="tablefoot"><span>'+(!rows.length?'0 results':(listPage*12+1)+'–'+Math.min(rows.length,listPage*12+12)+' of '+rows.length)+'</span><div>'+iconBtn('list-prev','left','Previous page',listPage===0?'disabled':'')+iconBtn('list-next','right','Next page',listPage===last?'disabled':'')+'</div></div></section>'
}
function filtered(){return (allHistory?s.entries:forMonth(selectedMonth,true)).filter(t=>(!filterCard||String(t.card)===filterCard)&&(!filterCat||t.category===filterCat)&&[t.merchant,t.category,t.source,cardBy(t.card)?.name,t.day].join(' ').toLowerCase().includes(query.toLowerCase())&&(!kindFilter||t.kind===kindFilter)&&(!sourceFilter||t.source===sourceFilter)).sort(sortEntries)}
function cardsPage(){return '<div class="cardgrid">'+s.cards.map((c,i)=>'<article class="panel walletcard"><div class="cardstage">'+plastic(c)+'</div><div class="walletinfo"><div><h2>'+esc(c.name)+'</h2><p>'+esc(c.bank)+' · '+esc(c.network)+'</p></div>'+iconBtn('edit-card','edit','Edit '+c.name,'data-id="'+c.id+'"')+'</div><dl><div><dt>Card ending</dt><dd>'+esc(c.last4||'Set last four')+'</dd></div><div><dt>Statement day</dt><dd>'+c.cycle+'</dd></div><div><dt>Base earning</dt><dd>'+(c.program==='dream'?'Conditional cashback':c.rate+' pts / '+rs(c.step))+'</dd></div></dl><div class="cardfoot">'+button('Statement cycle','statement','calendar','btn','data-id="'+c.id+'"')+button('Artwork','artwork','cards','btn','data-id="'+c.id+'"')+'</div></article>').join('')+'</div>'}
function rewards(){
 const rows=forMonth(selectedMonth), points=sum(rows,'points'),value=sum(rows,'value'),net=sum(rows,'net');
 const qStart=monthAdd(selectedMonth,-((Number(selectedMonth.slice(5))-1)%3));const qEnd=monthAdd(qStart,3);
 return '<div class="statgrid">'+stat('Estimated points',fmt.format(points)+' pts','Includes statement overrides','points')+stat('Reward value',rs(value,true),'Points valuation + confirmed cashback','wallet')+stat('Effective return',(net>0?(100*value/net).toFixed(2):'0.00')+'%','Reward value ÷ net card spend','growth')+'</div><div class="analytics equal"><section class="panel"><div class="panelhead"><div><h2>Earnings by card</h2><p>'+esc(monthName(selectedMonth))+'</p></div></div>'+s.cards.map(c=>{const t=rows.filter(r=>r.card===c.id);return '<div class="datarow"><span><b>'+esc(c.name)+'</b><small>'+fmt.format(sum(t,'points'))+' points · '+rs(t.reduce((x,r)=>x+r.cashback*(r.kind==='Refund'?-1:1),0),true)+' confirmed cashback</small></span><strong>'+rs(sum(t,'value'),true)+'</strong></div>'}).join('')+'</section><section class="panel"><div class="panelhead"><div><h2>Quarterly spend goals</h2><p>'+dateName(qStart+'-01',{month:'short'})+' – '+monthName(monthAdd(qEnd,-1),true)+' · logged net spend</p></div></div>'+s.cards.filter(c=>c.target).map(c=>{const spend=sum(s.entries.filter(t=>t.card===c.id&&t.day>=qStart+'-01'&&t.day<qEnd+'-01'),'net');return progressLine(c.name,spend,c.target,'edit-card','data-id="'+c.id+'"')}).join('')+(!s.cards.some(c=>c.target)?'<p class="padded">Set a quarterly target in My cards.</p>':'')+'</section></div><section class="panel notes"><h2>Reward rules</h2><p><b>Regalia Gold</b> earns 5 base points per full ₹200 of eligible spend from 15 May 2026. Earlier purchases use 4 per ₹150. The default ₹0.50 valuation is for flights and hotels. Fuel, rent, wallet, government, EMI and third-party education categories receive zero base points here. Offers, MCC-specific caps and milestone eligibility require statement reconciliation. Set exact points on any transaction. <a href="https://www.hdfc.bank.in/credit-cards/regalia-gold-credit-card">HDFC terms</a></p><p><b>Dream Different</b> cashback depends on ₹15,000 eligible cycle spend, prior bill payment through Kotak digital channels, category and payment route. The 2% program caps cashback at ₹100 per transaction, ₹200 on eligible Kotak811 UPI and ₹500 per cycle. Enter credited cashback when confirmed. <a href="https://www.kotak811.bank.in/credit-cards/811-dream-different-credit-card-against-fd/terms-and-conditions">Kotak terms</a></p></section>';
}
function progressLine(name,used,limit,act,extra=''){let pct=limit?Math.max(0,used/limit*100):0;
 return '<div class="progressitem"><div><b>'+esc(name)+'</b>'+iconBtn(act,'edit','Edit '+name,extra)+'</div><div class="track"><i class="'+(pct>100?'over':'')+'" style="width:'+Math.min(100,pct)+'%"></i></div><small>'+rs(used)+' of '+rs(limit)+' · '+Math.round(pct)+'%</small></div>'}
function tracker(){
 const rows=forMonth(selectedMonth,true),net=sum(rows,'net'),budgets=s.budgets.filter(b=>b.month===selectedMonth),budget=sum(budgets,'amount'),budgeted=sum(rows.filter(t=>budgets.some(b=>b.category===t.category)),'net');
 const elapsed=selectedMonth===s.today.slice(0,7)?Number(s.today.slice(8)):new Date(Number(selectedMonth.slice(0,4)),Number(selectedMonth.slice(5,7)),0).getDate();
 return '<div class="statgrid">'+stat('Net spending',rs(net),rows.length+' transactions across payment methods','wallet')+stat('Daily average',rs(net/elapsed),elapsed+' calendar days in period','chart')+stat('Budget remaining',budget?rs(budget-budgeted):'—',budget?'Across budgeted categories':'Set your first category budget','layers')+'</div><div class="analytics equal"><section class="panel"><div class="panelhead"><div><h2>Category budgets</h2><p>'+monthName(selectedMonth)+'</p></div>'+'<div class="inline">'+button('Copy previous','copy-budgets','layers','btn')+button('Set budget','budget','plus')+'</div>' +'</div>'+(budgets.length?budgets.map(b=>progressLine(b.category,sum(rows.filter(t=>t.category===b.category),'net'),b.amount,'budget','data-cat="'+esc(b.category)+'"')).join(''):empty('No budgets yet','Set a monthly limit for a category.'))+'</section>'+breakdown(rows)+'</div><section class="panel"><div class="panelhead"><div><h2>Recurring bills</h2><p>Monthly payments and their next due dates</p></div>'+button('Add bill','recurring','plus')+'</div>'+(s.recurring.length?s.recurring.map(r=>'<div class="datarow"><span><b>'+esc(r.merchant)+'</b><small>'+esc(cardBy(r.card)?.name)+' · Due '+dateName(r.due,{day:'numeric',month:'short',year:'numeric'})+'</small></span><div class="inline"><strong>'+rs(r.amount,true)+'</strong>'+button('Manage','manage-bill','','btn','data-id="'+r.id+'"')+'</div></div>').join(''):empty('No recurring bills','Add a monthly subscription, bill or fee.'))+'</section><section class="panel"><div class="panelhead"><div><h2>Payment methods</h2><p>Net spend after refunds</p></div></div>'+allAccounts().map(c=>{const t=rows.filter(r=>r.card===c.id);return '<div class="datarow"><span>'+esc(c.name)+'</span><strong>'+rs(sum(t,'net'),true)+'</strong></div>'}).join('')+'</section>';
}
function connections(){
 const demo=mode==='demo', sources=s.sources.map(src=>{const mail=src.name==='Mail',label=mail?'Apple Mail':'iPhone SMS';return '<article class="panel source"><span class="sourceicon">'+icon(mail?'mail':'sms',26)+'</span><h2>'+label+'</h2><p>'+(mail?'Reads supported HDFC and Kotak transaction alerts in the inbox of your Mac’s Mail app.':'Reads supported bank sender IDs from texts already available in Messages on this Mac.')+'</p><div class="sourceinfo"><span>'+(!src.enabled?'Disconnected':src.error?'Needs attention':s.scanning?'Checking alerts…':'Enabled')+'</span><small>'+(src.checked?'Last successful check '+new Date(src.checked*1000).toLocaleString('en-IN'):'No completed checks')+'</small></div>'+(src.error?'<p class="err">'+esc(src.error)+'</p>':'')+button(demo?'Open my portfolio':src.enabled?'Disconnect':'Connect '+label,demo?'switch-live':'source','',src.enabled?'btn':'btn primary',(clientPhone?'disabled title="Manage sources on your Mac" ':'')+'data-source="'+src.name+'" data-enable="'+(!src.enabled)+'"')+'</article>'}).join('');
 return '<div class="cardgrid">'+sources+'</div><section class="panel notes"><div class="panelhead flat"><div><h2>Import settings</h2><p>Checks every five minutes while Cardfolio is running. The first check covers up to 30 days.</p></div>'+button(s.scanning?'Checking…':'Check now','scan','refresh','btn',(clientPhone||demo||s.scanning||!s.sources.some(x=>x.enabled))?'disabled':'')+'</div><ol><li>Save the last four digits in My cards for card purchases or Net worth for savings balance alerts.</li><li>Add your bank-alert email account to Apple Mail. When connecting, allow Cardfolio to control Mail.</li><li>On iPhone, open Settings → Apps → Messages → Text Message Forwarding and select your Mac. Give Cardfolio Full Disk Access under macOS Privacy &amp; Security for SMS import, then reopen it.</li></ol><p>Only extracted transaction fields and matching identifiers are saved. Unrecognised formats, OTPs, card-bill payments and declines are skipped. '+(s.sources.some(x=>x.checked)?'Last scan skipped '+s.sources.reduce((n,x)=>n+x.skipped,0)+' unsupported or unrelated bank messages.':'')+'</p></section><section class="panel"><div class="panelhead"><div><h2>Review queue</h2><p>Unmatched cards, unknown merchants and potential duplicates</p></div><span class="count">'+s.review.length+'</span></div>'+(s.review.length?s.review.map(r=>'<div class="datarow"><span><b>'+esc(r.merchant)+'</b><small>'+esc(r.bank)+' · '+esc(r.last4||'No card ending')+' · '+r.channel+' · '+dateName(r.day)+'</small></span><div class="inline"><b>'+rs(r.amount,true)+'</b>'+button('Review','review','','btn','data-uid="'+r.uid+'"')+'</div></div>').join(''):empty('All caught up','Alerts that need a decision will appear here.'))+'</section>';
}
const fields=[['score','Bureau score',300,900],['util','Credit utilisation (%)',0,1000],['enquiries','Hard enquiries in 6 months',0,1000],['late','Late payments in 12 months',0,1000],['ageMonths','Oldest account (months)',0,1200]];
const upgradeFields=[['limit','Current HDFC limit (₹)',0,1000000000],['spend','HDFC spend in 6 months (₹)',0,1000000000]];
const scenarios=[['Flexible',[700,65,5,1,6]],['Balanced',[740,40,3,0,12]],['Strict',[780,25,1,0,24]]];
let draft=null,simTab='profile';
function profileField([key,name,min,max]){return '<label>'+esc(name)+'<input data-metric="'+key+'" type="number" min="'+min+'" max="'+max+'" step="'+(['util','limit','spend'].includes(key)?'0.01':'1')+'" value="'+esc(draft[key]??'')+'" placeholder="Unknown"></label>'}
function simulation(){
 if(simTab==='upgrade'){
 const ok=upgradeFields.filter(([k])=>draft[k]!==undefined&&draft[k]!=='').length===2;
 const meet=ok&&Number(draft.limit)>=500000&&Number(draft.spend)>=500000;
 return '<h2>DCB Metal upgrade screen</h2><p class="muted">HDFC’s published upgrade grid lists a ₹5 lakh existing limit and ₹5 lakh spend in six months.</p><div class="simscore">'+(ok?meet?'2 / 2':((draft.limit>=500000?1:0)+(draft.spend>=500000?1:0))+' / 2':'—')+'</div><strong>Published spend and limit benchmarks met</strong><p>HDFC also lists income requirements and retains discretion. Eligibility for an FD-backed upgrade remains unverified. <a href="https://www.hdfc.bank.in/content/dam/hdfcbankpws/in/en/personal-banking/discover-products/cards/credit-cards/credit-card-services/Upgrade%20process.pdf">Upgrade grid</a></p>';
 }
 const bad=fields.some(([k,,lo,hi])=>draft[k]!==''&&draft[k]!==undefined&&(!Number.isFinite(Number(draft[k]))||Number(draft[k])<lo||Number(draft[k])>hi||k!=='util'&&!Number.isInteger(Number(draft[k]))));
 if(bad)return '<h2>Check your figures</h2><p>One or more entries fall outside the allowed range.</p>';
 const results=scenarios.map(([name,limits])=>{const checks=fields.map(([k,label],i)=>{let v=draft[k];let high=i===0||i===4;return {label,rule:(high?'≥ ':'≤ ')+limits[i],pass:v===undefined||v===''?null:high?Number(v)>=limits[i]:Number(v)<=limits[i]}});const missing=checks.some(c=>c.pass===null),failed=checks.some(c=>c.pass===false);return {name,checks,out:failed?'Outside criteria':missing?'Incomplete':'Pass'}});
 const complete=fields.every(([k])=>draft[k]!==undefined&&draft[k]!=='');const passed=results.filter(r=>r.out==='Pass').length;
 return '<h2>Scenario pass rate</h2><div class="simscore">'+(complete?Math.round(passed/3*100)+'%':'—')+'</div><p>'+(complete?passed+' of 3 illustrative policies passed.':'Enter all five metrics to calculate a scenario pass rate.')+' Actual approval probability is unknown.</p>'+results.map(r=>'<details class="scenario"><summary><b>'+r.name+'</b><span class="pill '+(r.out==='Pass'?'good':'')+'">'+r.out+'</span></summary>'+r.checks.map(c=>'<div><span>'+esc(c.label)+' '+c.rule+'</span><b>'+(c.pass===null?'Unknown':c.pass?'Pass':'Outside')+'</b></div>').join('')+'</details>').join('');
}
function simulator(){
 if(!draft)draft={...s.profile};
 return '<div class="simtabs">'+['profile','upgrade'].map(k=>button(k==='profile'?'Credit profile scenarios':'HDFC upgrade screen','sim-tab','',simTab===k?'btn primary':'btn','data-tab="'+k+'"')).join('')+'</div><div class="analytics equal"><section class="panel notes"><h2>'+(simTab==='profile'?'Credit profile':'Upgrade inputs')+'</h2><p>Edit the figures to test a change. Save only the figures you want to keep.</p><div class="formgrid">'+(simTab==='profile'?fields:upgradeFields).map(profileField).join('')+'</div><div class="formactions">'+button('Reset edits','reset-profile')+button('Save profile','save-profile','check','btn primary')+'</div></section><section class="panel notes" id="simresult">'+simulation()+'</section></div><section class="panel notes"><h2>How to read the result</h2><p>The three profiles use illustrative cutoffs for score, utilisation, enquiries, missed payments and history length. Open each scenario to inspect its rules. Each carries equal weight. These thresholds have no lender approval-outcome calibration.</p><p>Banks also assess product eligibility, income documentation and internal account history. Checking a file here runs entirely on this Mac and creates no bureau enquiry. <a href="https://www.cibil.com/faq/credit-score-and-loan-basics">CIBIL guidance</a></p>'+button('Clear saved profile','clear-profile','','btn subtle')+'</section>';
}
function render(){if(!s)return;cardIndex=Math.min(cardIndex,s.cards.length-1);shell(({overview,transactions,cards:cardsPage,rewards,tracker,connections,simulator,wealth:wealthPage,stocks:stockPage,insights:insightsPage,settings:settingsPage})[page]());}
function input(name,title,value='',type='text',attrs=''){return '<label>'+esc(title)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+attrs+'></label>'}
function select(name,title,options,val){return '<label>'+esc(title)+'<select name="'+name+'">'+opts(options,val)+'</select></label>'}
function show(title,body,form='',submit='Save'){
 if(!modal.open)lastFocus=document.activeElement;
 modal.innerHTML='<div class="modalhead"><h2>'+esc(title)+'</h2>'+iconBtn('close','close','Close dialog')+'</div>'+(form?'<form data-form="'+form+'"><div class="modalbody">'+body+'</div><div class="formerror" role="alert"></div><div class="modalfoot">'+button('Cancel','close')+'<button class="btn primary" type="submit">'+esc(submit)+'</button></div></form>':'<div class="modalbody">'+body+'</div>');
 modal.setAttribute('aria-label',title);if(!modal.open)modal.showModal();
}
function close(){if(modal.open)modal.close()}
modal.addEventListener('close',()=>{if(modal.open)return;modal.innerHTML='';if(lastFocus?.isConnected)lastFocus.focus()});
modal.addEventListener('click',e=>{if(e.target===modal){const b=modal.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)close()}});
const hidden=(k,v)=>'<input type="hidden" name="'+k+'" value="'+esc(v)+'">';
function entryForm(t={},review=null){
 const livePreview=review?'<p class="tip">Check your ledger for an existing purchase. Dismiss this alert if it is already recorded.</p>':'';
 const accounts=review?s.cards:allAccounts();
 let body=livePreview+(t.id?hidden('id',t.id):'')+(review?hidden('uid',review.uid):'')+'<div class="formgrid">'+input('merchant','Merchant',t.merchant||'','text','required maxlength="70" autofocus')+input('amount','Amount (₹)',t.amount!==undefined?(t.amount/100).toFixed(2):'','number','required min="0.01" max="100000000" step="0.01"')+select('card','Payment method',accounts.map(c=>[c.id,c.name]),t.card??s.cards[0].id)+input('day','Date',t.day||s.today,'date','required max="'+s.today+'" min="2000-01-01"')+select('category','Category',s.categories,t.category||'Other')+select('kind','Transaction type',['Purchase','Refund'],t.kind||'Purchase')+'</div><details class="morefields" '+(t.override!=null||t.cashback?'open':'')+'><summary>Statement reconciliation</summary><div class="formgrid">'+input('override','Statement points (optional)',t.override??'','number','min="0" max="1000000" step="1" placeholder="Use base estimate"')+input('cashback','Confirmed cashback (₹)',(t.cashback||0)/100,'number','min="0" step="0.01"')+'</div></details>'+(t.id?'<div class="sourcefoot"><span>Source · '+esc(t.source)+'</span>'+button('Delete transaction','delete-entry','','linkdanger','data-id="'+t.id+'"')+'</div>':'')+(review?button('Dismiss this alert','dismiss','','linkdanger','data-uid="'+review.uid+'"'):'');
 show(review?'Review imported alert':t.id?'Edit transaction':page==='tracker'?'Add expense':'Add transaction',body,review?'review':'entry',review?'Log transaction':'Save transaction');
}
function cardForm(c={}){
 const body=(c.id?hidden('id',c.id):'')+'<div class="formgrid">'+input('name','Card name',c.name||'','text','required maxlength="70"')+select('bank','Issuer',['HDFC Bank','Kotak Mahindra Bank','Other'],c.bank||'Other')+input('last4','Last four digits',c.last4||'','text','inputmode="numeric" maxlength="4" pattern="[0-9]{4}" placeholder="Optional"')+select('network','Network',['Visa','RuPay','Mastercard','Diners Club','Amex','Other'],c.network||'Visa')+select('program','Reward program',[['regalia','Regalia Gold'],['dream','Dream Different'],['custom','Custom points']],c.program||'custom')+input('cycle','Statement day',c.cycle||1,'number','min="1" max="31" required')+input('step','Earning block (₹)',(c.step??10000)/100,'number','step=".01" min="1" required')+input('rate','Points per block',c.rate??0,'number','step="1" min="0" max="1000" required')+input('valuation','Value per point (₹)',(c.valuation??0)/100,'number','step=".01" min="0" required')+input('target','Quarterly spend goal (₹)',(c.target||0)/100,'number','step=".01" min="0" required')+'</div><p class="tip">Earning rules recalculate estimates across your ledger. Statement overrides keep their recorded point count.</p>';
 show(c.id?'Edit card':'Add card',body,'card','Save card');
}
let mutating=false;
async function update(action,data,msg){
 if(mutating)return;mutating=true;
 try{const next=await rpc(action,data);s=next;refreshSerial++;if(action==='profile')draft={...s.profile};close();render();if(msg)notice(msg);if(page==='connections')scheduleCheck()}finally{mutating=false}
}
function confirm(title,body,form,vals,buttonText){show(title,'<p>'+esc(body)+'</p>'+Object.entries(vals).map(([k,v])=>hidden(k,v)).join(''),form,buttonText)}
function setPage(key){if(!Object.hasOwn(names,key))return;page=key;if(location.protocol!=='file:'&&location.hash!=='#'+key)history.pushState(null,'','#'+key);menuOpen=false;listPage=0;close();render();window.scrollTo(0,0);if(key==='connections')scheduleCheck()}
async function changeMode(m){
 const next=await rpc('state',{},m);close();mode=m;try{localStorage.setItem('cardfolio.workspace',m)}catch{}s=next;refreshSerial++;draft=null;selectedMonth=s.today.slice(0,7);cardIndex=0;resetLedger();setPage(page)
}
function scheduleCheck(){clearTimeout(syncTimer);if(page!=='connections'||mode!=='live')return;syncTimer=setTimeout(async()=>{if(page!=='connections'||modal.open||mutating){if(page==='connections')scheduleCheck();return}const version=refreshSerial;try{const next=await rpc();if(version===refreshSerial&&page==='connections'&&mode==='live'){s=next;render()}}catch{}scheduleCheck()},s.scanning?1300:4500)}
function csvValue(v){let txt=String(v??'');if(/^[\s]*[=+@-]/.test(txt)&&!/^[-+]?\d+(?:\.\d+)?$/.test(txt))txt="'"+txt;return '"'+txt.replace(/"/g,'""')+'"'}
async function exportCsv(){const rows=filtered();let csv='\ufeff'+[['Date','Merchant','Payment method','Category','Type','Net amount INR','Points','Reward value INR','Source'],...rows.map(t=>[t.day,t.merchant,cardBy(t.card)?.name,t.category,t.kind,(t.net/100).toFixed(2),t.points,(t.value/100).toFixed(2),t.source])].map(r=>r.map(csvValue).join(',')).join('\r\n');
 if(native){if((await native.postMessage({action:'export',csv})).saved)notice('CSV saved.');return}
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download='Cardfolio-'+mode+'-'+selectedMonth+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);
}
function manageBill(id){
 const b=s.recurring.find(x=>x.id===id);if(!b)return;
 const candidates=s.entries.filter(t=>t.card===b.card&&t.amount===b.amount&&t.day.slice(0,7)===b.due.slice(0,7)&&t.kind==='Purchase');
 let content='<p><b>'+rs(b.amount,true)+'</b> · '+esc(cardBy(b.card)?.name)+' · due '+dateName(b.due,{day:'numeric',month:'long',year:'numeric'})+'</p>';
 content+=hidden('id',id)+hidden('due',b.due)+select('link','Record this occurrence',[[0,'Create a new expense'],...candidates.map(t=>[t.id,'Link '+t.merchant+' · '+t.day])],candidates[0]?.id||0)+'<div class="formactions">'+button('Skip occurrence','skip-bill','','btn','data-id="'+id+'"')+button('Remove schedule','remove-bill','','linkdanger','data-id="'+id+'"')+'</div>';
 show('Manage '+b.merchant,content,'log-recurring','Log and advance');if(b.due>s.today)modal.querySelector('[type=submit]').disabled=true;
}
function reportDialog(){show('Import credit report','<p>Choose a text-based PDF, TXT, labelled CSV or JSON file (up to 8 MB). Review recognised figures before saving. The document and password are discarded after extraction.</p><label>Credit report<input type="file" name="report" accept=".pdf,.txt,.csv,.json" required></label>'+input('password','PDF password (if locked)','','password','autocomplete="off"')+'<p class="tip">Scanned pages need manual entry. JSON supports score, util, enquiries, late, ageMonths, limit and spend.</p>','report','Extract figures')}
document.addEventListener('click',async e=>{
 const n=e.target.closest('[data-nav]');if(n){setPage(n.dataset.nav);return}
 const b=e.target.closest('[data-act]');if(!b||b.disabled)return;
 const a=b.dataset.act,id=Number(b.dataset.id);
 try{
 if(await workspaceAction(a,b))return;
 switch(a){
 case 'menu':menuOpen=!menuOpen;render();break;
 case 'close':close();break;
 case 'workspace':show('Choose workspace','<div class="workchoices">'+button('My portfolio','switch-live','lock','choice')+'<p>Your local expenses, cards and bank connections.</p>'+button('Demo portfolio','switch-demo','layers','choice')+'<p>Explore the tracker with separate sample data.</p></div>');break;
 case 'switch-live':await changeMode('live');break;case 'switch-demo':await changeMode('demo');break;
 case 'next-card':case 'prev-card':cardIndex=(cardIndex+(a==='next-card'?1:-1)+s.cards.length)%s.cards.length;render();break;
 case 'chart-period':period=Number(b.dataset.period);render();break;case 'activity-month':selectedMonth=b.dataset.month;render();break;
 case 'view-all':resetLedger();setPage('transactions');break;case 'setup':setPage('cards');break;
 case 'add-entry':entryForm();break;case 'edit-entry':entryForm(s.entries.find(t=>t.id===id));break;
 case 'delete-entry':confirm('Delete transaction?','This removes the entry from your ledger and updates spending and rewards.','remove',{id},'Delete');break;
 case 'add-card':cardForm();break;case 'edit-card':cardForm(cardBy(id));break;
 case 'export':await exportCsv();break;case 'list-prev':listPage=Math.max(0,listPage-1);render();break;case 'list-next':listPage++;render();break;
 case 'budget':{let cat=b.dataset.cat||s.categories[0],record=s.budgets.find(k=>k.category===cat&&k.month===selectedMonth);show('Monthly category budget',hidden('month',selectedMonth)+select('category','Category',s.categories,cat)+input('amount','Budget for '+monthName(selectedMonth)+' (₹)',record?record.amount/100:'','number','min="0" step=".01" required')+'<p class="tip">Saving zero removes this category budget.</p>','budget','Save budget');break}
 case 'recurring':show('Add monthly bill','<div class="formgrid">'+input('merchant','Merchant or bill name','','text','required maxlength="70"')+input('amount','Amount (₹)','','number','step=".01" min=".01" required')+select('card','Payment method',allAccounts().map(c=>[c.id,c.name]),-2)+select('category','Category',s.categories,'Bills')+input('due','Next due date',s.today,'date','required')+'</div><p class="tip">Log each occurrence or link it to an imported payment. The next due date advances by one month.</p>','recurring','Save bill');break;
 case 'manage-bill':manageBill(id);break;
 case 'skip-bill':case 'remove-bill':{const bill=s.recurring.find(r=>r.id===id);confirm(a==='skip-bill'?'Skip this occurrence?':'Remove monthly schedule?',a==='skip-bill'?'Move the next due date forward one month.':'Existing transactions stay in the ledger.',a==='skip-bill'?'skip-recurring':'remove-recurring',{id,due:bill.due},a==='skip-bill'?'Skip':'Remove');break}
 case 'source':if(b.dataset.enable==='true'){confirm('Connect '+b.dataset.source+'?',b.dataset.source==='Mail'?'Cardfolio will check bank senders in your local Mail inbox every five minutes while open. macOS may request Mail automation permission.':'Cardfolio will read supported bank SMS from Messages every five minutes while open. macOS requires Full Disk Access for this source.','source',{name:b.dataset.source,enabled:'true'},'Connect')}else await update('source',{name:b.dataset.source,enabled:false},'Source disconnected.');break;
 case 'scan':await update('scan',{},'Checking enabled sources…');break;
 case 'review':{const r=s.review.find(x=>x.uid===b.dataset.uid);entryForm({...r,card:s.cards.find(c=>c.bank===r.bank&&c.last4===r.last4)?.id},r);break}
 case 'dismiss':await update('review',{uid:b.dataset.uid,decision:'dismiss'},'Alert dismissed.');break;
 case 'sim-tab':simTab=b.dataset.tab;render();break;
 case 'reset-profile':draft={...s.profile};render();break;
 case 'save-profile':await update('profile',draft,'Reviewed figures saved locally.');break;
 case 'clear-profile':confirm('Clear credit profile?','Remove all saved credit metrics from this workspace.','clear-profile',{},'Clear profile');break;
 case 'import-report':reportDialog();break;
 }
 }catch(err){displayError(err)}
});
function displayError(err){if(modal.open&&modal.querySelector('.formerror'))modal.querySelector('.formerror').textContent=err.message;else notice(err.message||'The operation could not be completed.')}
document.addEventListener('input',e=>{
 if(e.target.id==='search'){query=e.target.value;listPage=0;const pos=e.target.selectionStart;render();$('#search').focus();$('#search').setSelectionRange(pos,pos)}
 if(e.target.dataset.metric){draft[e.target.dataset.metric]=e.target.value;$('#simresult').innerHTML=simulation()}
});
document.addEventListener('change',e=>{
 const t=e.target;if(t.dataset.change){if(['history','kind','source','sort'].includes(t.dataset.change)){changeFilter(t.dataset.change,t.value)}if(t.dataset.change==='month')selectedMonth=t.value;if(t.dataset.change==='filterCard')filterCard=t.value;if(t.dataset.change==='filterCat')filterCat=t.value;listPage=0;render()}
 if(t.name==='category'&&t.form?.dataset.form==='budget'){const b=s.budgets.find(k=>k.month===selectedMonth&&k.category===t.value);t.form.elements.amount.value=b?b.amount/100:''}
 if(t.name==='program'&&t.form?.dataset.form==='card'&&t.value!=='custom'){let rg=t.value==='regalia';t.form.elements.step.value=rg?200:100;t.form.elements.rate.value=rg?5:0;t.form.elements.valuation.value=rg?.5:0}
});
document.addEventListener('submit',async e=>{
 const f=e.target.closest('form[data-form]');if(!f)return;e.preventDefault();const d=Object.fromEntries(new FormData(f)),key=f.dataset.form,send=f.querySelector('[type=submit]');send.disabled=true;f.querySelector('.formerror').textContent='';
 try{
 if(await specialForm(key,d,f))return;
 if(key==='report'){
   const file=d.report;if(!file||file.size>8*1024*1024)throw Error('Choose a file under 8 MB.');
   const content=await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result.split(',')[1]);r.onerror=()=>rej(Error('Could not open the selected file.'));r.readAsDataURL(file)});
   const {extracted}=await rpc('parse-report',{ext:file.name.split('.').pop().toLowerCase(),content,password:d.password});
   const count=Object.keys(extracted).length;
   if(!count)throw Error('No unambiguous labelled figures found. Enter the figures manually or use a labelled text export.');
   draft={...draft,...extracted};simTab=Object.keys(extracted).every(k=>k==='limit'||k==='spend')?'upgrade':'profile';close();render();notice(count+' figures imported for review. Select Save profile to keep them.');return;
 }
 if(key==='source')d.enabled=d.enabled==='true';
 if(key==='review')d.decision='post';
 if(key==='log-recurring')d.link=Number(d.link);
 if(key==='clear-profile'){await update('profile',{},'Credit profile cleared.');return}
 await update(key,d,key==='source'?'Connection enabled. Checking alerts…':'Saved.');
 }catch(err){displayError(err)}finally{send.disabled=false}
});
async function boot(){
 try{s=await rpc();selectedMonth=s.today.slice(0,7);page=Object.hasOwn(names,location.hash.slice(1))?location.hash.slice(1):'overview';render()}
 catch(err){if(err.message==='Pair this phone'){pairForm();return}app.innerHTML='<main class="launcherror"><img src="icon.svg" alt=""><h1>Open Cardfolio on your Mac</h1><p>Launch Cardfolio.app or start the local browser server to connect to your private ledger.</p><button class="btn" id="retry">Try again</button></main>';$('#retry').onclick=boot}
}
document.addEventListener('DOMContentLoaded',boot);
