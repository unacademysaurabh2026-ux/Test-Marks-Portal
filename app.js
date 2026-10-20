// ====== 1. PASTE YOUR SUPABASE VALUES HERE (Project Settings > API) ======
const SB_URL = 'https://sclulrpxjhiqgaddnipi.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjbHVscnB4amhpcWdhZGRuaXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA4Mzg1NTYsImV4cCI6MjEwNjQxNDU1Nn0.ugfqvOUF3MX7tkkKzuhioUwiuEV8Yp-9uYmYy0DAVbM';
// =========================================================================
const sb = supabase.createClient(SB_URL, SB_KEY);
const SUBJ = {   // CSV formats: Name of Student, Roll Number, then these subjects
  NEET:['Physics','Chemistry','Botany','Zoology'],
  JEE:['Maths','Physics','Chemistry'],
  FOUNDATION:['Maths','Physics','Chemistry','Biology','SST','English','Mental Ability']};
const EACH = {NEET:180, JEE:100, FOUNDATION:''};   // default max marks per subject (all editable)
const downloadFormat = t => {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name of Student','Roll Number',...SUBJ[t]]]), 'Sheet1');
  XLSX.writeFile(wb, `${t}_format.csv`, {bookType:'csv'});
};
const TABS = {tests:'Tests',students:'Students',history:'Student history',dash:'Dashboard',admin:'Admin'};
const $ = s => document.querySelector(s), view = $('#view');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
let me, batches = [], charts = [], T, rows = [];
const can = {write:()=>['admin','teacher','data_entry'].includes(me.role), edit:()=>['admin','teacher'].includes(me.role), del:()=>me.role==='admin'};
const bopts = sel => batches.map(b=>`<option value="${b.id}" ${b.id===sel?'selected':''}>${esc(b.name)}</option>`).join('');
const fail = (e,el) => { if(e){ (el||view).insertAdjacentHTML('afterbegin',`<p class="err">${esc(e.message||e)}</p>`); return true; } };
const chart = (id,type,labels,label,data) => { charts.push(new Chart($(id),{type,data:{labels,datasets:[{label,data,backgroundColor:'#0d6b6b',borderColor:'#0d6b6b'}]},options:{plugins:{legend:{display:false}}}})); };
const killCharts = () => { charts.forEach(c=>c.destroy()); charts=[]; };

// ---------- auth ----------
$('#go').onclick = async () => {
  const {error} = await sb.auth.signInWithPassword({email:$('#em').value,password:$('#pw').value});
  if(error) $('#le').textContent = error.message; else init();
};
$('#out').onclick = async () => { await sb.auth.signOut(); location.reload(); };
async function init(){
  const {data:{session}} = await sb.auth.getSession();
  if(!session){ $('#login').hidden=false; $('#app').hidden=true; return; }
  const {data:p} = await sb.from('profiles').select('*').eq('id',session.user.id).single();
  me = p; $('#login').hidden=true; $('#app').hidden=false;
  $('#who').textContent = `${p.email} (${p.role})`;
  await loadBatches(); go(Object.keys(TABS)[0]);
}
async function loadBatches(){ batches = (await sb.from('batches').select('*').order('name')).data || []; }
function go(t){
  killCharts();
  $('#nav').innerHTML = Object.entries(TABS).filter(([k])=>k!=='admin'||can.del()).map(([k,v])=>`<button data-t="${k}" class="${k===t?'on':''}">${v}</button>`).join('');
  $('#nav').onclick = e => e.target.dataset.t && go(e.target.dataset.t);
  ({tests:vTests,students:vStudents,history:vHistory,dash:vDash,admin:vAdmin})[t]();
}

// ---------- tests list + create ----------
async function vTests(){
  view.innerHTML = `<div class="bar" id="tbar"><select id="fb"><option value="">All batches</option>${bopts()}</select><span class="sp"></span><span class="mu">Download CSV format:</span>${Object.keys(SUBJ).map(k=>`<button data-f="${k}">${k==='FOUNDATION'?'Foundation':k}</button>`).join('')}${can.write()?'<button class="p" id="nt">New test</button>':''}</div><div id="nf"></div><div class="card tw" id="tl"></div>`;
  $('#tbar').onclick = e => e.target.dataset.f && downloadFormat(e.target.dataset.f);
  const load = async () => {
    let q = sb.from('tests').select('*,batches(name)').order('test_date',{ascending:false}).limit(200);
    if($('#fb').value) q = q.eq('batch_id',$('#fb').value);
    const {data,error} = await q; if(fail(error,$('#tl'))) return;
    $('#tl').innerHTML = data.length ? `<table><tr><th>Date</th><th>Batch</th><th>Test</th><th>Type</th><th class="n">Max marks</th></tr>${data.map(t=>`<tr class="link" data-id="${t.id}"><td>${t.test_date}</td><td>${esc(t.batches.name)}</td><td>${esc(t.name)}</td><td>${t.test_type||''}</td><td class="n">${t.max_total}</td></tr>`).join('')}</table>` : '<p class="mu">No tests yet. Create one to start entering marks.</p>';
  };
  $('#fb').onchange = load; load();
  $('#tl').onclick = e => { const r=e.target.closest('tr[data-id]'); if(r) openTest(r.dataset.id); };
  if(!can.write()) return;
  $('#nt').onclick = () => {
    $('#nf').innerHTML = `<div class="card"><div class="bar"><select id="nb">${bopts()}</select>${can.del()?'<input id="nbn" placeholder="or create new batch"><select id="nbt"><option>NEET</option><option>JEE</option><option>FOUNDATION</option></select>':''}<select id="ny" hidden><option>Mains</option><option>Advanced</option></select><input id="nn" placeholder="Test name"><input id="nd" type="date"></div>
      <div class="bar" id="nsub"></div><div class="bar"><label>Total max marks <input id="nm" type="number" style="width:100px"></label><button class="p" id="ncr">Create test</button></div>
      <p class="mu">Max marks are filled in for you and can be changed. Clear a subject's max marks if it is not part of this test. JEE Advanced and Foundation start empty for you to enter.</p></div>`;
    const etype = () => ($('#nbn') && $('#nbn').value.trim()) ? $('#nbt').value : (batches.find(b=>b.id===$('#nb').value)||{}).exam_type;
    const sum = () => [...document.querySelectorAll('[data-sm]')].reduce((a,i)=>a+(+i.value||0),0);
    let manual = false;
    const fill = () => {
      const t = etype(); if(!t) return;
      $('#ny').hidden = t!=='JEE';
      const blank = t==='FOUNDATION' || (t==='JEE' && $('#ny').value==='Advanced');
      $('#nsub').innerHTML = SUBJ[t].map(s=>`<label>${s} <input data-sm="${s}" type="number" style="width:80px" value="${blank?'':EACH[t]}"></label>`).join('');
      manual = false; $('#nm').value = sum() || '';
    };
    ['nb','nbt','ny'].forEach(i => $('#'+i) && ($('#'+i).onchange = fill));
    if($('#nbn')) $('#nbn').onchange = fill;
    $('#nsub').oninput = () => { if(!manual) $('#nm').value = sum() || ''; };
    $('#nm').oninput = () => manual = true;
    fill();
    $('#ncr').onclick = async () => {
      let bid = $('#nb').value; const t = etype();
      const nbn = $('#nbn') && $('#nbn').value.trim();
      if(nbn){ const {data,error} = await sb.from('batches').insert({name:nbn,exam_type:$('#nbt').value}).select().single(); if(fail(error,$('#nf'))) return; bid = data.id; await loadBatches(); }
      if(!bid) return fail('Choose or create a batch first.',$('#nf'));
      const sm = {}; document.querySelectorAll('[data-sm]').forEach(i => { if(+i.value>0) sm[i.dataset.sm] = +i.value; });
      if(!Object.keys(sm).length) return fail('Enter max marks for at least one subject.',$('#nf'));
      const {data,error} = await sb.from('tests').insert({batch_id:bid,name:$('#nn').value,test_date:$('#nd').value,test_type:t==='JEE'?$('#ny').value:null,subjects:Object.keys(sm),subject_max:sm,max_total:+$('#nm').value||sum()}).select().single();
      if(!fail(error,$('#nf'))) openTest(data.id);
    };
  };
}

// ---------- marks grid ----------
const calc = r => T.subjects.reduce((a,s)=>a+(+r.marks[s]||0),0) + (+r.bonus||0);
async function openTest(id){
  killCharts();
  const {data:t,error} = await sb.from('tests').select('*,batches(name,exam_type)').eq('id',id).single(); if(fail(error)) return;
  T = t;
  const {data:rs} = await sb.from('results_view').select('*').eq('test_id',id).order('total',{ascending:false}).range(0,999);
  rows = (rs||[]).map(r=>({...r}));
  draw();
}
function draw(){
  const S = T.subjects, ed = r => can.write() && (r.isNew || can.edit()), mx = s => (T.subject_max||{})[s];
  view.innerHTML = `<div class="bar"><button id="bk">Back</button><b>${esc(T.name)}${T.test_type?' ('+T.test_type+')':''}</b><span class="mu">${esc(T.batches.name)}, ${T.test_date}, max ${T.max_total}</span><span class="sp"></span>
    ${can.write()?'<button id="ar">Add row</button><button id="im">Import CSV/Excel</button><input type="file" id="fi" accept=".csv,.xlsx,.xls" hidden><button class="p" id="sv">Save changes</button>':''}
    ${can.edit()?'<button id="em">Edit max marks</button>':''}<button id="cf">CSV format</button><button id="ex">Export Excel</button><button id="pr">Print / PDF</button>${can.del()?'<button class="d" id="dt">Delete test</button>':''}</div>
    <div class="card tw"><table><thead><tr><th>Roll number</th><th>Name of student</th>${S.map(s=>`<th class="n">${esc(s)}${mx(s)?` <span class="mu">/${mx(s)}</span>`:''}</th>`).join('')}<th class="n">Bonus</th><th class="n">Total</th><th class="n">%</th><th class="n">Rank</th></tr></thead>
    <tbody id="tb">${rows.map((r,i)=>`<tr data-i="${i}" class="${r.dirty?'dirty':''}"><td><input data-k="roll_no" value="${esc(r.roll_no)}" ${r.isNew?'':'disabled'} size="11"></td><td><input data-k="student_name" value="${esc(r.student_name)}" ${r.isNew?'':'disabled'}></td>
      ${S.map(s=>`<td class="n"><input class="m${mx(s)&&+r.marks[s]>mx(s)?' over':''}" data-m="${esc(s)}" value="${esc(r.marks[s])}" ${ed(r)?'':'disabled'}></td>`).join('')}
      <td class="n"><input class="m" data-k="bonus" value="${r.bonus||''}" ${ed(r)?'':'disabled'}></td><td class="n" data-t>${r.total??''}</td><td class="n">${r.percentage??''}</td><td class="n">${r.rnk??''}</td></tr>`).join('')}</tbody></table></div>
    <p class="mu noprint">Percentage and rank refresh after saving. Rank is within this test (this batch only). Marks above the subject maximum turn red.</p>`;
  $('#bk').onclick = vTests;
  $('#cf').onclick = () => downloadFormat(T.batches.exam_type);
  $('#ex').onclick = () => { const o=rows.map(r=>({'Roll Number':r.roll_no,'Name of Student':r.student_name,...Object.fromEntries(S.map(s=>[s,r.marks[s]??''])),Bonus:r.bonus,Total:r.total,Percentage:r.percentage,Rank:r.rnk})); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(o),'Result'); XLSX.writeFile(wb,`${T.batches.name}_${T.name}_${T.test_date}.xlsx`); };
  $('#pr').onclick = () => print();
  if(can.del()) $('#dt').onclick = async () => { if(confirm('Delete this test and all its marks?')){ const {error}=await sb.from('tests').delete().eq('id',T.id); if(!fail(error)) vTests(); } };
  if(can.edit()) $('#em').onclick = async () => {
    const cur = S.map(s=>`${s}=${mx(s)??''}`).join(', ')+`, Total=${T.max_total}`;
    const v = prompt('Edit max marks as Subject=marks, separated by commas. Total=marks sets the overall maximum.',cur); if(v===null) return;
    const sm = {}; let tot = T.max_total;
    v.split(',').forEach(p => { const [k,x]=p.split('=').map(z=>z.trim()); if(!k||!(+x>0)) return; if(k.toLowerCase()==='total') tot=+x; else sm[k]=+x; });
    if(!Object.keys(sm).length) return;
    const {error} = await sb.from('tests').update({subject_max:sm,subjects:Object.keys(sm),max_total:tot}).eq('id',T.id); if(!fail(error)) openTest(T.id);
  };
  if(!can.write()) return;
  $('#tb').oninput = e => {
    const tr=e.target.closest('tr'), r=rows[+tr.dataset.i], k=e.target.dataset;
    if(k.m){ r.marks[k.m] = e.target.value===''?null:+e.target.value; e.target.classList.toggle('over',!!mx(k.m)&&+e.target.value>mx(k.m)); } else r[k.k] = e.target.value;
    r.dirty = true; tr.classList.add('dirty'); r.total = calc(r); tr.querySelector('[data-t]').textContent = r.total;
  };
  $('#tb').onchange = async e => {   // look up name from roll number
    const tr=e.target.closest('tr'), r=rows[+tr.dataset.i];
    if(e.target.dataset.k==='roll_no' && r.isNew){
      const {data} = await sb.from('students').select('name').eq('roll_no',r.roll_no.trim()).maybeSingle();
      if(data?.name){ r.student_name=data.name; tr.querySelector('[data-k=student_name]').value=data.name; }
    }
  };
  $('#ar').onclick = () => { rows.push({roll_no:'',student_name:'',marks:{},bonus:0,total:0,isNew:true,dirty:true}); draw(); };
  $('#im').onclick = () => $('#fi').click();
  $('#fi').onchange = e => e.target.files[0] && importFile(e.target.files[0]);
  $('#sv').onclick = save;
}
async function save(){
  const todo = rows.filter(r=>r.dirty && r.roll_no.trim());
  if(!todo.length) return alert('Nothing to save.');
  const studs = todo.filter(r=>r.isNew).map(r=>({roll_no:r.roll_no.trim(),name:r.student_name||null}));
  if(studs.length){ const {error}=await sb.from('students').upsert(studs,{onConflict:'roll_no',ignoreDuplicates:true}); if(fail(error)) return; }
  // the student joins this test's batch (a student can be in many batches)
  const mem = todo.map(r=>({roll_no:r.roll_no.trim(),batch_id:T.batch_id}));
  { const {error}=await sb.from('student_batches').upsert(mem,{onConflict:'roll_no,batch_id',ignoreDuplicates:true}); if(fail(error)) return; }
  const out = todo.map(r=>({test_id:T.id,roll_no:r.roll_no.trim(),marks:r.marks,bonus:+r.bonus||0,total:calc(r)}));
  const {error} = can.edit() ? await sb.from('results').upsert(out,{onConflict:'test_id,roll_no'}) : await sb.from('results').insert(out);
  if(fail(error)) return;
  openTest(T.id);
}
async function readRows(f){
  const wb = XLSX.read(await f.arrayBuffer()); let sn = wb.SheetNames[0];
  if(wb.SheetNames.length>1){ sn = prompt('Which sheet to import?\n'+wb.SheetNames.join('\n'),sn); if(!wb.Sheets[sn]) return []; }
  return XLSX.utils.sheet_to_json(wb.Sheets[sn],{defval:''}).map(d => { const o={}; for(const k in d) o[k.trim().toLowerCase()]=d[k]; return o; });
}
async function importFile(f){
  let n=0;
  for(const o of await readRows(f)){
    const keys = Object.keys(o), key = rx => keys.find(k=>rx.test(k));
    const roll = String(o[key(/roll|candidate id/)] ?? '').trim(); if(!roll) continue;
    const marks = {};
    T.subjects.forEach(s => { const l=s.toLowerCase(), k=keys.find(k=>k===l||(k.length>=3&&l.startsWith(k))||(l==='maths'&&k==='mathematics')); if(k&&o[k]!=='') marks[s]=+o[k]; });
    const bonus = +o[key(/bonus/)] || 0, name = o[key(/^name/)] || '';
    let r = rows.find(x=>x.roll_no===roll);
    if(r){ if(!can.edit()) continue; Object.assign(r,{marks,bonus,dirty:true}); }
    else { r = {roll_no:roll,student_name:name,marks,bonus,isNew:true,dirty:true}; rows.push(r); }
    r.total = calc(r); n++;
  }
  draw(); alert(`${n} rows loaded. New students and their batch are created when you press Save changes.`);
}

// ---------- students ----------
function vStudents(){
  view.innerHTML = `<div class="bar"><input id="q" placeholder="Search roll number or name"><select id="fb"><option value="">All batches</option>${bopts()}</select></div>
    ${can.write()?`<div class="card bar"><input id="ar" placeholder="Roll number"><input id="an" placeholder="Name of student"><select id="ab">${bopts()}</select><button class="p" id="aa">Add student to batch</button><span class="sp"></span><button id="si">Import students CSV into this batch</button><input type="file" id="sf" accept=".csv,.xlsx,.xls" hidden></div>`:''}
    <div class="card tw" id="sl"></div>`;
  const load = async () => {
    const q = $('#q').value.trim().replace(/[,()%]/g,''), fb = $('#fb').value;
    let r = fb ? sb.from('students').select('*,student_batches!inner(batch_id,batches(name))').eq('student_batches.batch_id',fb)
               : sb.from('students').select('*,student_batches(batch_id,batches(name))');
    r = r.order('roll_no').limit(100);
    if(q) r = r.or(`roll_no.ilike.%${q}%,name.ilike.%${q}%`);
    const {data,error} = await r; if(fail(error,$('#sl'))) return;
    $('#sl').innerHTML = `<table><tr><th>Roll number</th><th>Name of student</th><th>Batches</th>${can.edit()?'<th>Add to batch</th>':''}</tr>${data.map(s=>`<tr><td>${esc(s.roll_no)}</td><td>${can.edit()?`<a href="#" data-r="${esc(s.roll_no)}" data-n="${esc(s.name)}">${esc(s.name)||'(add name)'}</a>`:esc(s.name)}</td>
      <td>${s.student_batches.map(x=>`<span class="chip">${esc(x.batches.name)}${can.edit()?` <a href="#" data-rm="${esc(s.roll_no)}|${x.batch_id}" title="Remove from batch">x</a>`:''}</span>`).join('')}</td>
      ${can.edit()?`<td><select data-ab="${esc(s.roll_no)}"><option value="">Choose batch</option>${bopts()}</select></td>`:''}</tr>`).join('')}</table><p class="mu">Showing up to 100 matches. A student can be in several batches.</p>`;
  };
  let tm; $('#q').oninput = () => { clearTimeout(tm); tm=setTimeout(load,300); }; $('#fb').onchange = load; load();
  $('#sl').onclick = async e => {
    const a=e.target.closest('a'); if(!a) return; e.preventDefault();
    if(a.dataset.r){ const n=prompt('Name of student',a.dataset.n); if(n===null) return; const {error}=await sb.from('students').update({name:n}).eq('roll_no',a.dataset.r); if(!fail(error)) load(); }
    if(a.dataset.rm){ const [r,b]=a.dataset.rm.split('|'); if(confirm('Remove this student from the batch? Their past results stay.')){ const {error}=await sb.from('student_batches').delete().eq('roll_no',r).eq('batch_id',b); if(!fail(error)) load(); } }
  };
  $('#sl').onchange = async e => { if(e.target.dataset.ab && e.target.value){ const {error}=await sb.from('student_batches').upsert({roll_no:e.target.dataset.ab,batch_id:e.target.value},{onConflict:'roll_no,batch_id',ignoreDuplicates:true}); if(!fail(error)) load(); } };
  if(!can.write()) return;
  $('#aa').onclick = async () => {
    const roll=$('#ar').value.trim(); if(!roll||!$('#ab').value) return alert('Enter a roll number and choose a batch.');
    let x = await sb.from('students').upsert({roll_no:roll,name:$('#an').value||null},{onConflict:'roll_no',ignoreDuplicates:true}); if(fail(x.error)) return;
    x = await sb.from('student_batches').upsert({roll_no:roll,batch_id:$('#ab').value},{onConflict:'roll_no,batch_id',ignoreDuplicates:true}); if(!fail(x.error)){ $('#ar').value=$('#an').value=''; load(); }
  };
  $('#si').onclick = () => $('#sf').click();
  $('#sf').onchange = async e => {
    const f=e.target.files[0], bid=$('#ab').value; if(!f) return; if(!bid) return alert('Choose a batch first.');
    const stu=[], mem=[];
    for(const o of await readRows(f)){ const keys=Object.keys(o), rk=keys.find(k=>/roll/.test(k)), nk=keys.find(k=>/^name/.test(k)); const roll=String(o[rk]??'').trim(); if(!roll) continue; stu.push({roll_no:roll,name:o[nk]||null}); mem.push({roll_no:roll,batch_id:bid}); }
    if(!stu.length) return alert('No roll numbers found. Use the columns Name of Student and Roll Number.');
    let x = await sb.from('students').upsert(stu,{onConflict:'roll_no',ignoreDuplicates:true}); if(fail(x.error)) return;
    x = await sb.from('student_batches').upsert(mem,{onConflict:'roll_no,batch_id',ignoreDuplicates:true}); if(!fail(x.error)){ alert(`${stu.length} students added to the batch.`); load(); }
  };
}

// ---------- student history ----------
function vHistory(){
  view.innerHTML = `<div class="bar"><input id="hq" placeholder="Roll number or name" size="28"><button class="p" id="hg">Show history</button></div><div id="hr"></div>`;
  const show = async roll => {
    const [{data,error},{data:mb}] = await Promise.all([sb.from('results_view').select('*').eq('roll_no',roll).order('test_date'),sb.from('student_batches').select('batches(name)').eq('roll_no',roll)]);
    if(fail(error,$('#hr'))) return;
    if(!data.length){ $('#hr').innerHTML='<p class="mu">No test results for this roll number yet.</p>'; return; }
    const names = [...new Set(data.map(r=>r.batch_name))];
    $('#hr').innerHTML = `<h3 style="margin:0 0 4px">${esc(data[0].student_name)} <span class="mu">${esc(roll)}</span></h3><p class="mu">Batches: ${(mb||[]).map(x=>esc(x.batches.name)).join(', ')||'none'}</p>
      <div class="bar"><select id="hf"><option value="">All batches</option>${names.map(n=>`<option>${esc(n)}</option>`).join('')}</select><button id="hx">Export Excel</button><button id="hp">Print / PDF</button></div>
      <div class="card" style="max-width:760px"><canvas id="hc" height="110"></canvas></div><div class="card tw" id="ht"></div>`;
    const cur = () => { const f=$('#hf').value; return f ? data.filter(r=>r.batch_name===f) : data; };
    const render = () => {
      killCharts(); const d = cur();
      $('#ht').innerHTML = `<table><tr><th>Test date</th><th>Batch</th><th>Test</th><th>Subject marks</th><th class="n">Total marks</th><th class="n">%</th><th class="n">Rank</th></tr>${d.map(r=>`<tr><td>${r.test_date}</td><td>${esc(r.batch_name)}</td><td>${esc(r.test_name)}${r.test_type?' ('+r.test_type+')':''}</td><td>${r.subjects.map(s=>`${esc(s)} ${r.marks[s]??'-'}${(r.subject_max||{})[s]?'/'+r.subject_max[s]:''}`).join(', ')}</td><td class="n">${r.total}/${r.max_total}</td><td class="n">${r.percentage??''}</td><td class="n">${r.rnk}</td></tr>`).join('')}</table>`;
      chart('#hc','line',d.map(r=>r.test_date),'Percentage',d.map(r=>r.percentage));
    };
    $('#hf').onchange = render; render();
    $('#hp').onclick = () => print();
    $('#hx').onclick = () => { const d=cur(), subs=[...new Set(d.flatMap(r=>r.subjects))];
      const o=d.map(r=>({'Name of Student':r.student_name,'Roll Number':roll,'Test Date':r.test_date,Batch:r.batch_name,Test:r.test_name,Type:r.test_type||'',...Object.fromEntries(subs.map(s=>[s,r.marks[s]??''])),'Total Marks':r.total,'Max Marks':r.max_total,Rank:r.rnk}));
      const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(o),'History'); XLSX.writeFile(wb,`${roll}_history.xlsx`); };
  };
  $('#hg').onclick = async () => {
    const q=$('#hq').value.trim(); if(!q) return;
    const {data} = await sb.from('students').select('roll_no,name').or(`roll_no.eq.${q.replace(/[,()]/g,'')},name.ilike.%${q.replace(/[,()%]/g,'')}%`).limit(20);
    if(!data?.length){ $('#hr').innerHTML='<p class="mu">No student found.</p>'; return; }
    if(data.length===1) return show(data[0].roll_no);
    $('#hr').innerHTML = `<div class="card">${data.map(s=>`<div><a href="#" data-r="${esc(s.roll_no)}">${esc(s.name)} (${esc(s.roll_no)})</a></div>`).join('')}</div>`;
    $('#hr').onclick = e => { const a=e.target.closest('a[data-r]'); if(a){ e.preventDefault(); show(a.dataset.r); } };
  };
}

// ---------- dashboard ----------
function vDash(){
  view.innerHTML = `<div class="bar"><select id="db">${bopts()}</select><select id="dt"></select></div><div id="ds"></div>`;
  const loadTests = async () => {
    const {data} = await sb.from('tests').select('id,name,test_date').eq('batch_id',$('#db').value).order('test_date',{ascending:false});
    $('#dt').innerHTML = (data||[]).map(t=>`<option value="${t.id}">${t.test_date} ${esc(t.name)}</option>`).join(''); loadDash();
  };
  const loadDash = async () => {
    killCharts(); if(!$('#dt').value){ $('#ds').innerHTML='<p class="mu">No tests in this batch.</p>'; return; }
    const {data:rs} = await sb.from('results_view').select('*').eq('test_id',$('#dt').value).order('total',{ascending:false}).range(0,999);
    if(!rs.length){ $('#ds').innerHTML='<p class="mu">No marks entered for this test.</p>'; return; }
    const S=rs[0].subjects, avg=a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length*10)/10;
    $('#ds').innerHTML = `<p>${rs.length} students. Average ${avg(rs.map(r=>+r.total))} of ${rs[0].max_total}. Highest ${rs[0].total}.</p><div class="grid2"><div class="card"><h4>Top 10</h4><canvas id="c1"></canvas></div><div class="card"><h4>Subject averages</h4><canvas id="c2"></canvas></div></div>`;
    chart('#c1','bar',rs.slice(0,10).map(r=>r.student_name||r.roll_no),'Total',rs.slice(0,10).map(r=>r.total));
    chart('#c2','bar',S,'Average',S.map(s=>avg(rs.map(r=>+r.marks[s]||0))));
  };
  $('#db').onchange = loadTests; $('#dt').onchange = loadDash; loadTests();
}

// ---------- admin ----------
async function vAdmin(){
  const [{data:us},{data:tb},{data:au}] = await Promise.all([sb.from('profiles').select('*').order('email'),sb.from('teacher_batches').select('user_id,batch_id,batches(name)'),sb.from('audit_log').select('*').order('at',{ascending:false}).limit(60)]);
  view.innerHTML = `<div class="card bar"><input id="bn" placeholder="New batch name"><select id="bt"><option>NEET</option><option>JEE</option><option>FOUNDATION</option></select><button class="p" id="ba">Add batch</button><span class="mu">${batches.map(b=>esc(b.name)).join(', ')}</span></div>
    <div class="card tw"><h4>Users</h4><p class="mu">Create logins in Supabase Authentication, then set role and batches here. Teachers and data entry users can only add marks to assigned batches.</p><table><tr><th>Email</th><th>Role</th><th>Assigned batches</th><th>Assign batch</th></tr>
    ${us.map(u=>`<tr><td>${esc(u.email)}</td><td><select data-role="${u.id}">${['admin','teacher','data_entry','viewer'].map(r=>`<option ${r===u.role?'selected':''}>${r}</option>`).join('')}</select></td><td>${tb.filter(x=>x.user_id===u.id).map(x=>`${esc(x.batches.name)} <a href="#" data-rm="${u.id}|${x.batch_id}">x</a>`).join(', ')}</td><td><select data-ab="${u.id}">${bopts()}</select> <button data-as="${u.id}">Assign</button></td></tr>`).join('')}</table></div>
    <div class="card tw"><h4>Recent edits</h4><table><tr><th>When</th><th>Table</th><th>Action</th><th>Change</th></tr>${au.map(a=>`<tr><td>${new Date(a.at).toLocaleString()}</td><td>${a.tbl}</td><td>${a.action}</td><td style="white-space:normal;max-width:600px;font-size:12px">${esc(JSON.stringify(a.old_data?{from:a.old_data.marks??a.old_data.name,to:a.new_data?.marks??a.new_data?.name}:a.new_data)).slice(0,160)}</td></tr>`).join('')}</table></div>`;
  $('#ba').onclick = async () => { const {error}=await sb.from('batches').insert({name:$('#bn').value.trim(),exam_type:$('#bt').value}); if(!fail(error)){ await loadBatches(); vAdmin(); } };
  view.onchange = async e => { if(e.target.dataset.role){ const {error}=await sb.from('profiles').update({role:e.target.value}).eq('id',e.target.dataset.role); fail(error); } };
  view.onclick = async e => {
    const t=e.target;
    if(t.dataset.as){ const b=view.querySelector(`[data-ab="${t.dataset.as}"]`).value; const {error}=await sb.from('teacher_batches').insert({user_id:t.dataset.as,batch_id:b}); if(!fail(error)) vAdmin(); }
    if(t.dataset.rm){ e.preventDefault(); const [u,b]=t.dataset.rm.split('|'); await sb.from('teacher_batches').delete().eq('user_id',u).eq('batch_id',b); vAdmin(); }
  };
}
init();
