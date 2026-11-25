'use strict';
Object.assign(paths,{
 sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
 moon:'<path d="M20 14a8.8 8.8 0 0 1-10-11A9.2 9.2 0 1 0 20 14z"/>',
 settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="9" cy="6" r="2.5"/><circle cx="16" cy="12" r="2.5"/><circle cx="8" cy="18" r="2.5"/>',
 bank:'<path d="m2 8 10-6 10 6H2zm2 12h16M6 10v7m6-7v7m6-7v7"/>',
 stock:'<path d="M3 20h18M6 14V9m5 8V3m5 10V6"/><path d="M5 11h2m3-3h2m3 2h2"/>',
 insights:'<path d="M3 17 9 11l4 3 8-10m-6 0h6v6"/>',
 upload:'<path d="M12 16V3m-5 5 5-5 5 5M3 15v5h18v-5"/>',
 bell:'<path d="M4 17h16l-2-4V9a6 6 0 0 0-12 0v4zM9 20a4 4 0 0 0 6 0"/>',
 globe:'<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
 phone:'<rect x="6" y="2" width="12" height="20" rx="3"/><path d="M10 18h4"/>',
 pie:'<path d="M11 3a9 9 0 1 0 10 10H11z"/><path d="M14 2v8h8a9 9 0 0 0-8-8z"/>',
});
const navGroups = [
 ['Workspace',[['overview','overview'],['transactions','transactions'],['tracker','wallet'],['insights','insights']]],
 ['Portfolio',[['wealth','bank'],['stocks','stock'],['cards','cards'],['rewards','points'],['simulator','chart']]],
 ['Manage',[['connections','connections'],['settings','settings']]],
];
const descriptions={...subtitles,overview:'Your wealth, spending and rewards at a glance.',wealth:'Balances, investments and outstanding liabilities in INR.',stocks:'Track your positions, cost basis and market prices.',insights:'See where your money goes and how spending changes.',settings:'Manage appearance, local backups and access from your phone.'};
let allHistory=false,kindFilter='',sourceFilter='',sortOrder='new',chartScope='card',statementId=null,statementMonth='',pendingCsv='',commandIndex=0;
const clientPhone=location.protocol==='https:'&&!native;
const pdate=(str)=>str?new Date(str).toLocaleString('en-IN',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'';
function groupButtons(items){
 return items.map(([key,ic])=>`<button class="navitem ${page===key?'active':''}" data-nav="${key}" aria-label="${names[key]}" title="${names[key]}" ${page===key?'aria-current="page"':''}>${icon(ic,18)}<span>${names[key]}</span>${key==='connections'&&s.review.length?'<b class="count">'+s.review.length+'</b>':''}</button>`).join('');
}
function renderShell(content){
 const demo=mode==='demo';
 const activeGroup=navGroups.find(([,items])=>items.some(([key])=>key===page))[0];
 const month=['overview','tracker','transactions','insights','rewards'].includes(page)&&!(page==='transactions'&&allHistory)?monthSelect():'';
 const primary={overview:['Add transaction','add-entry'],tracker:['Add expense','add-entry'],transactions:['Add transaction','add-entry'],cards:['Add card','add-card'],rewards:['Add transaction','add-entry'],simulator:['Import report','import-report'],wealth:['Add balance','balance'],stocks:['Add holding','holding']};
 const action=primary[page];
 document.title=names[page]+' · Cardfolio';
 app.innerHTML=`<div class="layout"><aside class="sidebar ${menuOpen?'mobileopen':''}">
  <button class="brand" data-nav="overview" aria-label="Cardfolio overview"><img src="icon.svg" alt=""><span>Cardfolio</span></button>
  <button class="workspacepick" data-act="workspace"><span class="avatar">${demo?'D':'M'}</span><span><small>Workspace</small><b>${demo?'Demo portfolio':'My portfolio'}</b></span>${icon('down',14)}</button>
  <nav aria-label="Main navigation">${navGroups.map(([label,items])=>`<div class="navtitle">${label}</div>${groupButtons(items)}`).join('')}</nav>
  <div class="sidebottom">${icon('shield',19)}<div><b>Private by design</b><small>Local ledger on Mac</small></div></div>
 </aside>${menuOpen?'<button class="backdrop" data-act="menu" aria-label="Close navigation"></button>':''}
 <section class="workspace"><header class="top"><div class="crumb">${iconBtn('menu','menu','Open navigation')}<span>${activeGroup}</span>${icon('right',13)}<b>${names[page]}</b></div>
 <div class="toptools"><button class="command" data-act="commands">${icon('search',16)}<span>Search workspace</span><kbd>⌘ K</kbd></button>${iconBtn('appearance',document.documentElement.dataset.theme==='dark'?'moon':'sun','Change appearance')}<span class="private"><i></i>${clientPhone?'Paired phone':'Local only'}</span></div></header>
 <main id="main" tabindex="-1"><div class="pagehead"><div><h1>${page==='overview'?'Portfolio overview':names[page]}</h1><p>${descriptions[page]}</p></div><div class="actions">${month}${action?button(action[0],action[1],'plus','btn primary'):''}</div></div>${content}</main></section></div>`;
}
function navButton(label,key){return `<button class="textbtn" data-nav="${key}">${esc(label)}</button>`}
function finance(){
 const hod=s.holdings||[],balances=s.balances||[];
 const liability=balances.filter(a=>['Loan','Card dues'].includes(a.kind)).reduce((n,a)=>n+a.balance,0);
 const bank=balances.filter(a=>!['Loan','Card dues'].includes(a.kind)).reduce((n,a)=>n+a.balance,0);
 const stocks=hod.reduce((n,h)=>n+h.shares*(h.price??h.cost),0);
 const cost=hod.reduce((n,h)=>n+h.shares*h.cost,0);
 const unpriced=hod.filter(h=>h.price==null).length;
 return {bank,stocks,cost,liability,assets:stocks+bank,net:stocks+bank-liability,unpriced};
}
function tile(title,value,note,ico,key,tone='mint'){
 return `<button class="metric ${tone}" data-nav="${key}"><span class="metriclabel"><span class="metricicon">${icon(ico,18)}</span>${esc(title)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></button>`;
}
function daysIn(m){return new Date(Number(m.slice(0,4)),Number(m.slice(5)),0).getDate()}
function trend(){
 const month=selectedMonth,prior=monthAdd(month,-1),days=daysIn(month);
 const limit=month===s.today.slice(0,7)?Number(s.today.slice(8)):days;
 const accumulated=m=>{
   let n=0;const values=Array(daysIn(m)).fill(0);
   for(const row of forMonth(m,chartScope==='all'))values[Number(row.day.slice(8))-1]+=row.net;
   return [0,...values.map(v=>(n+=v))];
 };
 const now=accumulated(month).slice(0,limit+1),before=accumulated(prior).slice(0,days+1);
 const max=Math.max(100,...now,...before),min=Math.min(0,...now,...before);
 const high=Math.ceil(max/(10**Math.floor(Math.log10(max))/2))*(10**Math.floor(Math.log10(max))/2);
 const x=i=>6+i/days*588,y=v=>101-(v-min)/(high-min)*90;
 const path=points=>points.map((v,i)=>(i?'L':'M')+x(i).toFixed(1)+' '+y(v).toFixed(1)).join(' ');
 const last=now.length-1,total=now[last],previous=before[Math.min(limit,before.length-1)],delta=previous>0?(total-previous)/previous*100:null;
 const curve=path(now),baseline=y(0);
 const change=delta==null?'No prior comparison':Math.abs(delta).toFixed(1)+'% '+(delta>0?'higher':'lower')+' vs prior period';
 return `<section class="trendpanel"><div class="trendtop"><h2>${icon('insights',16)} Spending trend</h2><div class="switcher">${['card','all'].map(k=>`<button data-act="trend-scope" data-scope="${k}" aria-pressed="${chartScope===k}" class="${chartScope===k?'on':''}">${k==='card'?'Cards':'All spend'}</button>`).join('')}</div></div>
 <div class="trendamount">${rs(total)}</div><p class="trendcompare">${esc(change)}</p>
 <div class="plot"><svg viewBox="0 0 600 111" preserveAspectRatio="none" role="img" aria-label="Cumulative spending for ${monthName(month)} and the previous month"><defs><linearGradient id="area" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#a3e7b0" stop-opacity=".30"/><stop offset="100%" stop-color="#a3e7b0" stop-opacity="0"/></linearGradient></defs>
 ${[18,47,75,101].map(h=>`<path d="M0 ${h}H600" stroke="#ffffff26" stroke-dasharray="3 6"/>`).join('')}
 <path d="${curve} L ${x(last)} ${baseline} L 6 ${baseline} Z" fill="url(#area)"/>
 <path d="${path(before)}" fill="none" stroke="#98aea2" stroke-width="1.7" stroke-dasharray="4 5" vector-effect="non-scaling-stroke"/>
 <path d="${curve}" fill="none" stroke="#aff2bd" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
 <circle cx="${x(last)}" cy="${y(total)}" r="3.9" fill="#baf7c6" stroke="#254f40" stroke-width="2"/>
 ${now.slice(1).map((value,i)=>`<rect x="${Math.max(0,x(i+1)-8)}" y="0" width="${588/days}" height="108" fill="transparent"><title>${i+1} ${monthName(month,true)} · ${rs(value,true)}</title></rect>`).join('')}</svg></div>
 <div class="plotaxis">${[1,7,14,21,days].map(d=>'<span>'+d+' '+dateName(month+'-01',{month:'short'})+'</span>').join('')}</div>
 <div class="plotlegend"><span><i></i>${dateName(month+'-01',{month:'long'})}</span><span><i></i>${dateName(prior+'-01',{month:'long'})}</span><span>Cumulative net spend</span></div></section>`;
}
function plastic(c){
 const custom=s.artwork?.[c.id];
 if(custom)return `<img class="productart ownart" src="data:image/jpeg;base64,${custom}" alt="Saved artwork for ${esc(c.name)}">`;
 const h=c.program==='regalia'&&c.bank==='HDFC Bank',k=c.program==='dream'&&c.bank==='Kotak Mahindra Bank';
 if(!h&&!k)return `<div class="genericcard">${icon('cards',42)}<span>${esc(c.name)}</span></div>`;
 return `<img class="productart ${h?'hdfcart':'kotakart'}" src="${h?'regalia-gold-mastercard.png':'dream-different.webp'}" alt="${h?'HDFC Regalia Gold Mastercard sample artwork':'Kotak811 Dream Different product artwork'}">`;
}
function wallet(){
 const c=s.cards[cardIndex];if(!c)return empty('Your wallet is empty','Add your first card in My cards.');
 const mismatch=c.program==='regalia'&&c.network!=='Mastercard'&&!s.artwork?.[c.id];
 return `<section class="panel walletpanel"><div class="panelhead"><h2>Card wallet</h2>${navButton('Manage cards','cards')}</div>
 <div class="walletstage"><div class="orbit"></div>${plastic(c)}</div><div class="walletcaption"><div><b>${esc(c.name)}</b><small>${esc(c.network)} · ${c.last4?'•••• '+esc(c.last4):'No ending saved'}</small></div><div class="pager">${iconBtn('prev-card','left','Previous card')}<span>${cardIndex+1}/${s.cards.length}</span>${iconBtn('next-card','right','Next card')}</div></div>
 ${mismatch?'<p class="artnote">Product illustration shows the Mastercard edition.</p>':''}</section>`;
}
function overviewPage(){
 const w=finance(),rows=forMonth(selectedMonth),net=sum(rows,'net'),value=sum(rows,'value');
 const meta=w.unpriced?w.unpriced+' unpriced positions valued at cost':'Assets minus recorded liabilities';
 const first=mode==='live'&&!s.entries.length?'<div class="setupnote">'+icon('info',18)+'<div><b>Start your personal ledger</b><p>Add a balance or connect supported bank alerts.</p></div>'+navButton('Connections','connections')+'</div>':'';
 return first+`<section class="metricgrid">${tile('Net worth',rs(w.net),meta,'bank','wealth')}${tile('Reward value',rs(value,true),fmt.format(sum(rows,'points'))+' estimated points','points','rewards','gold')}${tile('Investment value',rs(w.stocks),s.holdings?.length?String(s.holdings.length)+' holdings · '+rs(w.cost)+' invested':'No holdings recorded','stock','stocks','blue')}</section>
 <div class="dashgrid">${trend()}${wallet()}</div>
 <div class="dashgrid lower"><section class="panel recent"><div class="panelhead"><div><h2>Recent transactions</h2><p>Card activity · ${monthName(selectedMonth)}</p></div>${button('View all','view-all','','textbtn')}</div>${rows.length?smallTable(rows.slice(0,5)):empty('No card transactions','Log a purchase to see it here.')}</section>${breakdown(rows)}</div>`;
}
function smallTable(rows){
 return '<div class="compactrows">'+rows.map(t=>`<button class="compactrow" data-act="edit-entry" data-id="${t.id}">${merchantIcon(t)}<span class="rowmain"><b>${esc(t.merchant)}</b><small>${esc(t.category)} · ${dateName(t.day)}</small></span><span class="rowend"><b>${rs(t.net,true)}</b><small>${esc(cardBy(t.card).name)}</small></span></button>`).join('')+'</div>';
}
function wealthPage(){
 const w=finance(),balances=s.balances||[];
 const assetGroups=[['Bank & other assets',w.bank],['Stock holdings',w.stocks],['Liabilities',w.liability]];
 return `<div class="metricgrid">${tile('Net worth',rs(w.net),w.unpriced?'Includes cost-based estimates':'Reported assets less liabilities','bank','wealth')}${tile('Total assets',rs(w.assets),'Bank balances + investments','layers','wealth','blue')}${tile('Liabilities',rs(w.liability),'Recorded loans and card dues','receipt','wealth','gold')}</div>
 <div class="analytics equal"><section class="panel"><div class="panelhead"><div><h2>Accounts & balances</h2><p>Latest recorded balance per account</p></div></div>${balances.length?balances.map(a=>`<div class="datarow"><span><b>${esc(a.name)}</b><small>${esc(a.kind)} · ${esc(a.source)} · ${esc(a.asof)}</small></span><div class="inline"><strong>${rs(a.balance,true)}</strong>${iconBtn('balance','edit','Edit '+a.name,'data-id="'+a.id+'"')}</div></div>`).join(''):empty('No balances yet','Add your savings, deposits, cash and outstanding debts.')}</section>
 <section class="panel notes"><h2>Balance sheet</h2>${assetGroups.map(([k,n])=>`<div class="wealthline"><span>${k}</span><strong>${rs(n,true)}</strong></div>`).join('')}<p>Enter current card dues and loans as liabilities. Keep pledged deposits in one asset entry. An unpriced holding uses its cost until you save or fetch a quote.</p></section></div>
 <section class="panel notes"><h2>Balance updates from alerts</h2><p>For an HDFC or Kotak savings account, save its bank and last four digits. With Mail or SMS connected, a newer alert containing an explicit available or closing balance updates the account automatically. Your account shows the source and date of its latest balance.</p>${navButton('Manage connections','connections')}</section>`;
}
function stockPage(){
 const w=finance(),hold=s.holdings||[],priced=hold.filter(h=>h.price!=null),pl=priced.reduce((n,h)=>n+(h.price-h.cost)*h.shares,0);
 return `<div class="metricgrid">${tile('Portfolio value',rs(w.stocks),w.unpriced?w.unpriced+' unpriced · carried at cost':'At latest recorded prices','stock','stocks')}${tile('Cost basis',rs(w.cost),'Quantity × average purchase price','layers','stocks','blue')}${tile('Unrealised return',priced.length?rs(pl,true):'—',priced.length+' priced positions · before fees','growth','stocks','gold')}</div>
 <section class="panel"><div class="panelhead"><div><h2>Equity holdings</h2><p>NSE and BSE · INR</p></div>${button('Refresh prices','quotes','refresh','btn',mode==='demo'?'disabled title="Sample quotes in demo portfolio"':'')}</div>
 ${hold.length?'<div class="tablewrap"><table><thead><tr><th>Instrument</th><th class="num">Shares</th><th class="num">Avg. cost</th><th class="num">Last price</th><th class="num">Day change</th><th class="num">Gain / loss</th><th></th></tr></thead><tbody>'+hold.map(h=>`<tr><td><b>${esc(h.symbol)}</b><small class="block">${esc(h.exchange)} · ${esc(h.source)}${h.quoted?' · '+esc(h.quoted.slice(0,10)):''}</small></td><td class="num">${fmt.format(h.shares)}</td><td class="num">${rs(h.cost,true)}</td><td class="num">${h.price==null?'—':rs(h.price,true)}</td><td class="num">${h.previous?(100*(h.price-h.previous)/h.previous).toFixed(2)+'%':'—'}</td><td class="num">${h.price==null?'—':rs((h.price-h.cost)*h.shares,true)}</td><td>${iconBtn('holding','edit','Edit '+h.symbol,'data-id="'+h.id+'"')}</td></tr>`).join('')+'</tbody></table></div>':empty('Add your first stock','Enter a symbol, quantity and average buy price. An ISIN enables market quotes.')}</section>
 <section class="panel notes"><h2>Market data</h2><p>${mode==='demo'?'Demo holdings use illustrative prices.':'Upstox LTP returns last traded prices and previous closes. A refresh sends exchange identifiers and the Mac’s token to Upstox. Quantities and cost basis stay in your ledger.'}</p>${mode==='live'&&!clientPhone?button(s.marketConnected?'Update market token':'Connect Upstox','market-token','connections'):''}</section>`;
}
function insightsPage(){
 const rows=forMonth(selectedMonth,true),prev=monthAdd(selectedMonth,-1),cut=selectedMonth===s.today.slice(0,7)?Number(s.today.slice(8)):31,prior=forMonth(prev,true).filter(t=>Number(t.day.slice(8))<=cut);
 const tab=new Map();for(const t of rows){let key=t.merchant.trim().toLocaleLowerCase();const rec=tab.get(key)||{name:t.merchant,net:0,n:0};rec.net+=t.net;rec.n++;tab.set(key,rec)}
 const merchants=[...tab.values()].sort((a,b)=>b.net-a.net),current=sum(rows,'net'),delta=current-sum(prior,'net');
 return `<div class="metricgrid">${tile('Net spend',rs(current),'All payment methods','wallet','tracker')}${tile('Change vs prior period',prior.length?rs(delta):'—','Same elapsed days for an open month','insights','insights','gold')}${tile('Distinct merchants',fmt.format(tab.size),rows.length+' transactions','bag','transactions','blue')}</div><div class="analytics equal"><section class="panel"><div class="panelhead"><h2>Top merchants</h2></div>${merchants.length?merchants.slice(0,12).map(m=>`<button class="datarow merchantdrill" data-act="merchant-drill" data-name="${esc(m.name)}"><span><b>${esc(m.name)}</b><small>${m.n} transactions</small></span><strong>${rs(m.net,true)}</strong></button>`).join(''):empty('No merchant activity','Add expenses or select another month.')}</section>${breakdown(rows)}</div>`;
}
function settingsPage(){
 const backups=s.snapshots||[];
 return `<div class="analytics equal"><section class="panel notes"><h2>Appearance</h2><p>Choose the theme for this device.</p>${themeChoices()}</section>${phoneSettings()}</div><section class="panel"><div class="panelhead"><div><h2>Local snapshots</h2><p>Verified copies of this workspace in the Mac’s Cardfolio data folder</p></div>${clientPhone?'':button('Create snapshot','snapshot','plus')}</div>${backups.length?backups.map(x=>`<div class="datarow"><span><b>${esc(pdate(x.created))}</b><small>${Math.ceil(x.size/1024)} KB · ${mode==='demo'?'Demo':'Personal'} ledger</small></span>${clientPhone?'':button('Restore','restore','','btn','data-file="'+esc(x.file)+'"')}</div>`).join(''):empty('No snapshots yet','Create a recovery copy before importing a large statement.')}</section>`;
}
function themeChoices(){const current=document.documentElement.dataset.appearance;return '<div class="themechoices">'+[['system','laptop'],['light','sun'],['dark','moon']].map(([k,ic])=>button(k[0].toUpperCase()+k.slice(1),'set-theme',ic,'btn '+(k===current?'activechoice':''),'data-theme="'+k+'" aria-pressed="'+(k===current)+'"')).join('')+'</div>'}
function resetLedger(){query=filterCard=filterCat=kindFilter=sourceFilter='';allHistory=false;sortOrder='new';listPage=0}
function sortEntries(a,b){if(sortOrder==='high')return b.net-a.net||b.id-a.id;if(sortOrder==='low')return a.net-b.net||b.id-a.id;if(sortOrder==='old')return a.day.localeCompare(b.day)||a.id-b.id;return b.day.localeCompare(a.day)||b.id-a.id}
function changeFilter(k,v){if(k==='history')allHistory=v==='all';if(k==='kind')kindFilter=v;if(k==='source')sourceFilter=v;if(k==='sort')sortOrder=v}
function ledgerFilters(){
 return [['history',[['month','Reporting month'],['all','All history']],allHistory?'all':'month','Date range'],['kind',[['','All types'],'Purchase','Refund'],kindFilter,'Transaction type'],['source',[['','All sources'],...new Set(s.entries.map(x=>x.source))],sourceFilter,'Source'],['sort',[['new','Newest first'],['old','Oldest first'],['high','Highest amount'],['low','Lowest amount']],sortOrder,'Sort transactions']].map(([k,o,v,l])=>`<select data-change="${k}" aria-label="${l}">${opts(o,v)}</select>`).join('');
}
function acctForm(id){
 const a=(s.balances||[]).find(x=>x.id===id)||{};
 const kinds=['Savings','Fixed deposit','Cash','Other asset','Loan','Card dues'];
 show(a.id?'Update balance':'Add balance',(a.id?hidden('id',id):'')+'<div class="formgrid">'+input('name','Account label',a.name,'text','required maxlength="70"')+select('kind','Account type',kinds,a.kind)+input('balance','Balance (₹)',a.id?a.balance/100:'','number','required min="0" step=".01"')+input('asof','Balance as of',s.today,'date','required max="'+s.today+'"')+select('bank','Issuer',['Other','HDFC Bank','Kotak Mahindra Bank'],a.bank)+input('last4','Account ending (optional)',a.last4,'text','inputmode="numeric" maxlength="4" pattern="[0-9]{4}"')+'</div><p class="tip">Add a current outstanding debt as a positive liability. Use one record for each asset.</p>'+(a.id?button('Remove balance','remove-balance','','linkdanger','data-id="'+id+'"'):''),'balance','Save balance');
}
function holdingForm(id){
 const h=(s.holdings||[]).find(x=>x.id===id)||{};
 show(h.id?'Edit holding':'Add holding',(h.id?hidden('id',id):'')+'<div class="formgrid">'+input('symbol','Stock symbol',h.symbol,'text','required maxlength="25" placeholder="INFY"')+select('exchange','Exchange',['NSE','BSE'],h.exchange)+input('shares','Shares held',h.shares,'number','required min="1" max="10000000" step="1"')+input('cost','Average buy price (₹)',h.id?h.cost/100:'','number','required min=".01" step=".01"')+input('acquired','Purchase date',h.acquired||s.today,'date','required max="'+s.today+'"')+input('isin','ISIN for quotes',h.isin,'text','maxlength="12" placeholder="INE009A01021"')+input('price',h.id?'Replace market price (₹)':'Market price (₹, optional)','','number','min=".01" step=".01"')+input('quoteDay','Manual price date',s.today,'date','max="'+s.today+'"')+'</div>'+(h.id?button('Remove holding','remove-holding','','linkdanger','data-id="'+id+'"'):''),'holding','Save holding');
}
function cycleEnd(month,day){return month+'-'+String(Math.min(daysIn(month),day)).padStart(2,'0')}
function dayAfter(day){const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10)}
function openStatement(id,month){
 const c=cardBy(id);statementId=id;statementMonth=month;
 const end=cycleEnd(month,c.cycle),start=dayAfter(cycleEnd(monthAdd(month,-1),c.cycle));
 const rows=s.entries.filter(t=>t.card===id&&t.day>=start&&t.day<=end);
 show(c.name+' statement cycle',`<div class="periodnav">${iconBtn('cycle-prev','left','Previous statement')}<b>${dateName(start)} – ${dateName(end,{day:'numeric',month:'short',year:'numeric'})}</b>${iconBtn('cycle-next','right','Next statement')}</div><div class="statementtotal"><small>Recorded net spend</small><strong>${rs(sum(rows,'net'),true)}</strong><p>${rows.length} transactions · ${fmt.format(sum(rows,'points'))} points</p></div>${rows.length?smallTable(rows):empty('No activity in this cycle','Choose another cycle or log transactions.')}`);
}
function commands(q=''){
 const pages=navGroups.flatMap(([,ns])=>ns.map(([k,ic])=>({title:names[k],key:k,type:'Page',icon:ic})));
 const actions=[['Add transaction','add-entry','plus'],['Add balance','balance','bank'],['Add stock holding','holding','stock'],['Change appearance','appearance','sun'],['Import statement CSV','import-csv','upload']].map(([title,key,icon])=>({title,key,icon,type:'Action'}));
 const merchants=q.trim()?[...new Set(s.entries.map(t=>t.merchant))].map(title=>({title,key:title,icon:'bag',type:'Merchant'})):[];
 return [...pages,...actions,...merchants].filter(x=>x.title.toLowerCase().includes(q.toLowerCase())).slice(0,14);
}
function commandList(q=''){
 const list=commands(q);return list.map((x,i)=>`<button class="cmdrow" data-act="choose-command" data-type="${x.type}" data-key="${esc(x.key)}" tabindex="0">${icon(x.icon,16)}<b>${esc(x.title)}</b><small>${x.type}</small></button>`).join('')||'<p class="padded">No results.</p>';
}
function openCommands(){
 show('Search workspace','<label class="searchbox">'+icon('search',17)+'<input id="cmdsearch" autocomplete="off" aria-label="Search pages, actions and merchants" placeholder="Search pages, actions and merchants"></label><div id="cmdrows">'+commandList()+'</div>');$('#cmdsearch').focus();
}
async function workspaceAction(a,b){
 const id=Number(b.dataset.id);
 switch(a){
 case 'appearance':show('Appearance',themeChoices());break;
 case 'set-theme':remember('theme',b.dataset.theme);applyTheme(b.dataset.theme);close();render();break;
 case 'trend-scope':chartScope=b.dataset.scope;render();break;
 case 'commands':openCommands();break;
 case 'choose-command':{
   const {key,type}=b.dataset;close();
   if(type==='Page')setPage(key);
   else if(type==='Merchant'){resetLedger();allHistory=true;query=key;setPage('transactions')}
   else if(key==='add-entry')entryForm();
   else await workspaceAction(key,b);
   break;
 }
 case 'merchant-drill':resetLedger();query=b.dataset.name;setPage('transactions');break;
 case 'balance':acctForm(id);break;
 case 'holding':holdingForm(id);break;
 case 'remove-balance':case 'remove-holding':confirm('Remove this record?','Its value will be removed from your tracked net worth.',a,{id},'Remove');break;
 case 'statement':{const c=cardBy(id);const m=s.today.slice(0,7);openStatement(id,s.today>cycleEnd(m,c.cycle)?monthAdd(m,1):m);break}
 case 'cycle-prev':case 'cycle-next':openStatement(statementId,monthAdd(statementMonth,a==='cycle-next'?1:-1));break;
 case 'market-token':show('Connect Upstox','<p>Enter a read-only Analytics Token. It stays in server memory until the Mac app closes. You can also set UPSTOX_ANALYTICS_TOKEN before starting Cardfolio.</p>'+input('token','Analytics token','','password','autocomplete="off" maxlength="8192"')+'<p class="tip">Save an empty field to clear the session token.</p>','market-token','Save token');break;
 case 'quotes':b.disabled=true;try{await update('quotes',{},'Prices refreshed.');notice((s.quoteResult?.updated??0)+' of '+(s.quoteResult?.requested??0)+' instruments updated.')}finally{b.disabled=false}break;
 case 'snapshot':await update('snapshot',{},'Verified snapshot created.');break;
 case 'restore':confirm('Restore this snapshot?','Your current ledger will be preserved in a new snapshot before restoring. Reconnect your sources after restoring.','restore',{file:b.dataset.file},'Restore snapshot');break;
 case 'copy-budgets':await update('copy-budgets',{month:selectedMonth},'Copied missing budgets from the previous month.');break;
 case 'import-csv':pendingCsv='';show('Import statement CSV','<p>Use Date (YYYY-MM-DD), Merchant, Payment method and Amount columns. Optional Category and Type columns accept your ledger labels. Re-importing matching rows skips them.</p><label>Statement CSV<input name="csv" type="file" accept=".csv,text/csv" required></label><p class="tip">Use an exact card name, its unique last four digits, Cash, Debit card or Bank UPI.</p>','csv-preview','Preview import');break;
 case 'phone-guide':show('Use Cardfolio on iPhone',phoneGuide());break;
 case 'phone-start':case 'phone-code':{
   b.disabled=true;
   try {
     const result=await rpc(a);
     s.phone={enabled:result.enabled,url:result.url,certificate:result.certificate,fingerprint:result.fingerprint};
     render();
     show('Pair an iPhone',phoneGuide(result));
   } finally{b.disabled=false}
   break;
 }
 case 'phone-stop':await rpc(a);s.phone={enabled:false};render();notice('Phone access is off.');break;
 case 'phone-revoke':show('Forget all paired devices?','<p>Each phone will need a new pairing code. Your ledger stays on your Mac.</p>','forget-devices','Forget devices');break;
 case 'save-cert':{
   const result=await rpc('phone-cert');
   if(!result.der)throw Error('Enable phone access first.');
   if(native){const saved=await native.postMessage({action:'export-certificate',der:result.der});if(saved.saved)notice('Public certificate saved.')}
   else {const bytes=Uint8Array.from(atob(result.der),ch=>ch.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:'application/pkix-cert'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='Cardfolio.cer';anchor.click();setTimeout(()=>URL.revokeObjectURL(url),5000)}
   break;
 }
 case 'artwork':show('Card artwork',hidden('id',id)+'<p>Choose a public product image matching your card edition. Crop out any personal name, number or security code before selecting a photo.</p><label>Card image<input type="file" name="photo" accept="image/png,image/jpeg,image/webp" required></label>'+(s.artwork?.[id]?button('Use default artwork','reset-art','','btn','data-id="'+id+'"'):''),'artwork','Save artwork');break;
 case 'reset-art':await update('artwork',{id,image:''},'Default artwork restored.');break;
 default:return false;
 }
 return true;
}
async function specialForm(key,d,f){
 if(key==='forget-devices'){await rpc('phone-revoke');close();notice('Device sessions revoked.');return true}
 if(key==='csv-preview'){
   if(!d.csv||d.csv.size>2000000)throw Error('Select a UTF-8 CSV under 2 MB.');
   pendingCsv=await d.csv.text();const r=await rpc('csv-preview',{text:pendingCsv});
   const summary=`<div class="statementtotal"><strong>${r.added}</strong><p>new rows · ${r.duplicates} existing · ${r.errorCount} errors</p></div>`;
   const errors=r.errors.map(e=>`<p class="err">Row ${e.row} · ${esc(e.error)}</p>`).join('');
   const samples=r.sample.map(t=>`<div class="wealthline"><span>${esc(t.merchant)} · ${esc(t.day)}</span><b>${rs(Number(t.amount)*100,true)}</b></div>`).join('');
   if(r.errorCount||!r.added)show('Statement preview',summary+errors+samples+button('Choose another file','import-csv','upload'));
   else show('Statement preview',summary+samples,'csv-post','Import '+r.added+' rows');
   return true;
 }
 if(key==='csv-post'){await update('csv-post',{text:pendingCsv},'Statement imported.');pendingCsv='';return true}
 if(key==='artwork'){
   const file=d.photo;if(!file||file.size>8*1024*1024)throw Error('Select a JPG, PNG or WebP under 8 MB.');
   const blob=await new Promise((ok,bad)=>{const reader=new FileReader();reader.onload=()=>ok(reader.result);reader.onerror=()=>bad(Error('Image unavailable.'));reader.readAsDataURL(file)});
   const img=new Image();img.src=blob;await img.decode();
   const canvas=document.createElement('canvas'),scale=Math.min(1,600/Math.max(img.width,img.height));
   canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#f1f1ee';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);
   await update('artwork',{id:d.id,image:canvas.toDataURL('image/jpeg',.83).split(',')[1]},'Card artwork saved.');return true;
 }
 if(key==='pair'){
   const r=await fetch('/pair',{method:'POST',headers:{'Content-Type':'application/json','X-Cardfolio':'local'},body:JSON.stringify({code:d.code})});
   if(!r.ok)throw Error('Code expired or incorrect. Use the code shown on your Mac.');
   close();await boot();return true;
 }
 return false;
}
function pairForm(){app.innerHTML='<main class="launcherror"><img src="icon.svg" alt=""><h1>Pair this iPhone</h1><p>Use the code shown by Cardfolio on your Mac.</p><button class="btn primary" id="pair-open">Enter code</button></main>';const prompt=()=>show('Pair this device',input('code','Pairing code','','text','required autocomplete="one-time-code" maxlength="24" autocapitalize="none"'),'pair','Pair device');$('#pair-open').onclick=prompt;prompt()}
document.addEventListener('keydown',e=>{
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&s){e.preventDefault();openCommands();return}
 if(modal.open&&$('#cmdrows')&&['ArrowDown','ArrowUp','Enter'].includes(e.key)){
   const rows=[...modal.querySelectorAll('.cmdrow')];if(!rows.length)return;
   const idx=rows.indexOf(document.activeElement);
   if(e.key==='Enter'&&document.activeElement.id==='cmdsearch'){e.preventDefault();rows[0].click()}
   else if(e.key!=='Enter'){e.preventDefault();rows[(idx+(e.key==='ArrowDown'?1:-1)+rows.length)%rows.length].focus()}
 }
 if(e.key==='Escape'&&menuOpen){menuOpen=false;render()}
});
document.addEventListener('input',e=>{if(e.target.id==='cmdsearch')$('#cmdrows').innerHTML=commandList(e.target.value)});
window.addEventListener('popstate',()=>{if(s){const k=location.hash.slice(1);page=Object.hasOwn(names,k)?k:'overview';menuOpen=false;close();render()}});

function phoneSettings(){
 if(clientPhone)return '<section class="panel notes"><h2>Paired iPhone</h2><p>This device uses the ledger on your Mac. Manage paired devices from Settings on the Mac.</p></section>';
 const active=s.phone?.enabled;
 const controls=active?button('Pair a phone','phone-code','phone')+button('Turn off','phone-stop'):button('Enable phone access','phone-start','phone','btn primary');
 return '<section class="panel notes"><h2>iPhone access</h2><p>'+(active?'Listening on '+esc(s.phone.url):'Off · Enable a private HTTPS connection on the same Wi-Fi.')+'</p><div class="inline phone-controls">'+controls+button('Pairing guide','phone-guide')+'</div>'+button('Forget paired devices','phone-revoke','','textbtn phone-forget')+'</section>';
}
function phoneGuide(result){
 const state=result||s.phone||{};
 const certificate=state.enabled?'<div class="phone-certificate">'+button('Save public certificate','save-cert','download')+'<small>SHA-256 fingerprint</small><code>'+esc(state.fingerprint)+'</code></div>':'';
 const code=result?.code?'<div class="statementtotal"><small>Single-use pairing code · valid for 10 minutes</small><strong>'+esc(result.code.match(/.{1,4}/g).join('-'))+'</strong></div>':'';
 return code+'<ol><li>On the Mac, enable phone access in Settings. Keep Cardfolio open and your Mac awake.</li><li>Save the public Cardfolio certificate and AirDrop it to your iPhone. Install it under Settings → General → VPN &amp; Device Management. Then enable trust under General → About → Certificate Trust Settings.</li><li>On the same Wi-Fi, open <b>'+esc(state.url||'the HTTPS address shown on the Mac')+'</b> in Safari and enter the pairing code.</li><li>Use Share → Add to Home Screen. The paired session lasts up to 30 days. Choose Forget paired devices on the Mac to revoke it.</li></ol>'+certificate;
}

// Offline clones can use a neutral placeholder until product artwork is installed.
document.addEventListener('error',event=>{
 const image=event.target;
 if(image instanceof HTMLImageElement && image.classList.contains('productart')){
   const fallback=document.createElement('div');fallback.className='genericcard';
   fallback.innerHTML=icon('cards',36);fallback.setAttribute('aria-label','Product artwork unavailable');image.replaceWith(fallback);
 }
},true);
