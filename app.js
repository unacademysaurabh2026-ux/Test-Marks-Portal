// ====== 1. PASTE YOUR SUPABASE VALUES HERE (Project Settings > API) ======
const SB_URL = 'YOUR_SUPABASE_URL';
const SB_KEY = 'YOUR_SUPABASE_ANON_KEY';
// =========================================================================
const sb = supabase.createClient(SB_URL, SB_KEY);
const PRESETS = {
  NEET:{s:['Physics','Chemistry','Botany','Zoology'],m:720},
  JEE:{s:['Mathematics','Physics','Chemistry'],m:300},
  EXTERNAL:{s:['Physics','Chemistry','Botany','Zoology'],m:720},
  FOUNDATION:{s:['Maths','Physics','Chemistry','Biology','SST','English','MAT'],m:0}};
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
  view.innerHTML = `<div class="bar"><select id="fb"><option value="">All batches</option>${bopts()}</select><span class="sp"></span>${can.write()?'<button class="p" id="nt">New test</button>':''}</div><div id="nf"></div><div class="card tw" id="tl"></div>`;
  const load = async () => {
    let q = sb.from('tests').select('*,batches(name)').order('test_date',{ascending:false}).limit(200);
    if($('#fb').value) q = q.eq('batch_id',$('#fb').value);
    const {data,error} = await q; if(fail(error,$('#tl'))) return;
    $('#tl').innerHTML = data.length ? `<table><tr><th>Date</th><th>Batch</th><th>Test</th><th class="n">Max marks</th></tr>${data.map(t=>`<tr class="link" data-id="${t.id}"><td>${t.test_date}</td><td>${esc(t.batches.name)}</td><td>${esc(t.name)}</td><td class="n">${t.max_total}</td></tr>`).join('')}</table>` : '<p class="mu">No tests yet. Create one to start entering marks.</p>';
  };
  $('#fb').onchange = load; load();
  $('#tl').onclick = e => { const r=e.target.closest('tr[data-id]'); if(r) openTest(r.dataset.id); };
  if(can.write()) $('#nt').onclick = () => {
    $('#nf').innerHTML = `<div class="card bar"><select id="nb">${bopts()}</select><input id="nn" placeholder="Test name"><input id="nd" type="date"><input id="ns" placeholder="Subjects, comma separated" size="34"><input id="nm" type="number" placeholder="Max marks" style="width:110px"><button class="p" id="ncr">Create test</button></div>`;
    const fill = () => { const b=batches.find(x=>x.id===$('#nb').value); if(!b) return; const p=PRESETS[b.exam_type]; $('#ns').value=p.s.join(', '); $('#nm').value=p.m||''; };
    $('#nb').onchange = fill; fill();
    $('#ncr').onclick = async () => {
      const {data,error} = await sb.from('tests').insert({batch_id:$('#nb').value,name:$('#nn').value,test_date:$('#nd').value,subjects:$('#ns').value.split(',').map(s=>s.trim()).filter(Boolean),max_total:+$('#nm').value}).select().single();
      if(!fail(error,$('#nf'))) openTest(data.id);
    };
  };
}

// ---------- marks grid ----------
const calc = r => T.subjects.reduce((a,s)=>a+(+r.marks[s]||0),0) + (+r.bonus||0);
async function openTest(id){
  killCharts();
  const {data:t,error} = await sb.from('tests').select('*,batches(name)').eq('id',id).single(); if(fail(error)) return;
  T = t;
  const {data:rs} = await sb.from('results_view').select('*').eq('test_id',id).order('total',{ascending:false}).range(0,999);
  rows = (rs||[]).map(r=>({...r}));
  draw();
}
function draw(){
  const S = T.subjects, ed = r => can.write() && (r.isNew || can.edit());
  view.innerHTML = `<div class="bar"><button id="bk">Back</button><b>${esc(T.name)}</b><span class="mu">${esc(T.batches.name)}, ${T.test_date}, max ${T.max_total}</span><span class="sp"></span>
    ${can.write()?'<button id="ar">Add row</button><button id="im">Import Excel/CSV</button><input type="file" id="fi" accept=".xlsx,.xls,.csv" hidden><button class="p" id="sv">Save changes</button>':''}
    <button id="ex">Export Excel</button><button id="pr">Print / PDF</button>${can.del()?'<button class="d" id="dt">Delete test</button>':''}</div>
    <div class="card tw"><table><thead><tr><th>Roll no</th><th>Name</th>${S.map(s=>`<th class="n">${esc(s)}</th>`).join('')}<th class="n">Bonus</th><th class="n">Total</th><th class="n">%</th><th class="n">Rank</th></tr></thead>
    <tbody id="tb">${rows.map((r,i)=>`<tr data-i="${i}" class="${r.dirty?'dirty':''}"><td><input data-k="roll_no" value="${esc(r.roll_no)}" ${r.isNew?'':'disabled'} size="11"></td><td><input data-k="student_name" value="${esc(r.student_name)}" ${r.isNew?'':'disabled'}></td>
      ${S.map(s=>`<td class="n"><input class="m" data-m="${esc(s)}" value="${esc(r.marks[s])}" ${ed(r)?'':'disabled'}></td>`).join('')}
      <td class="n"><input class="m" data-k="bonus" value="${r.bonus||''}" ${ed(r)?'':'disabled'}></td><td class="n" data-t>${r.total??''}</td><td class="n">${r.percentage??''}</td><td class="n">${r.rnk??''}</td></tr>`).join('')}</tbody></table></div>
    <p class="mu noprint">Percentage and rank refresh after saving. Rank is within this test (batch only).</p>`;
  $('#bk').onclick = vTests;
  $('#ex').onclick = () => { const o=rows.map(r=>({'Roll no':r.roll_no,Name:r.student_name,...Object.fromEntries(S.map(s=>[s,r.marks[s]??''])),Bonus:r.bonus,Total:r.total,Percentage:r.percentage,Rank:r.rnk})); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(o),'Result'); XLSX.writeFile(wb,`${T.name}_${T.test_date}.xlsx`); };
  $('#pr').onclick = () => print();
  if(can.del()) $('#dt').onclick = async () => { if(confirm('Delete this test and all its marks?')){ const {error}=await sb.from('tests').delete().eq('id',T.id); if(!fail(error)) vTests(); } };
  if(!can.write()) return;
  $('#tb').oninput = e => {
    const tr=e.target.closest('tr'), r=rows[+tr.dataset.i], k=e.target.dataset;
    if(k.m) r.marks[k.m] = e.target.value===''?null:+e.target.value; else r[k.k] = e.target.value;
    r.dirty = true; tr.classList.add('dirty'); r.total = calc(r); tr.querySelector('[data-t]').textContent = r.total;
  };
  $('#tb').onchange = async e => {   // look up name from roll no
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
  const studs = todo.filter(r=>r.isNew).map(r=>({roll_no:r.roll_no.trim(),name:r.student_name||null,batch_id:T.batch_id}));
  if(studs.length){ const {error}=await sb.from('students').upsert(studs,{onConflict:'roll_no',ignoreDuplicates:true}); if(fail(error)) return; }
  const out = todo.map(r=>({test_id:T.id,roll_no:r.roll_no.trim(),marks:r.marks,bonus:+r.bonus||0,total:calc(r)}));
  const {error} = can.edit() ? await sb.from('results').upsert(out,{onConflict:'test_id,roll_no'}) : await sb.from('results').insert(out);
  if(fail(error)) return;
  openTest(T.id);
}
async function importFile(f){
  const wb = XLSX.read(await f.arrayBuffer()); let sn = wb.SheetNames[0];
  if(wb.SheetNames.length>1){ sn = prompt('Which sheet to import?\n'+wb.SheetNames.join('\n'),sn); if(!wb.Sheets[sn]) return; }
  const data = XLSX.utils.sheet_to_json(wb.Sheets[sn],{defval:''});
  let n=0;
  for(const d of data){
    const o = {}; for(const k in d) o[k.trim().toLowerCase()] = d[k];
    const keys = Object.keys(o), key = rx => keys.find(k=>rx.test(k));
    const roll = String(o[key(/roll|candidate id/)] ?? '').trim(); if(!roll) continue;
    const marks = {};
    T.subjects.forEach(s=>{ const l=s.toLowerCase(), k=keys.find(k=>k===l||(k.length>=3&&l.startsWith(k))); if(k&&o[k]!=='') marks[s]=+o[k]; });
    const bonus = +o[key(/bonus/)] || 0, name = o[key(/^name/)] || '';
    let r = rows.find(x=>x.roll_no===roll);
    if(r){ if(!can.edit()) continue; Object.assign(r,{marks,bonus,dirty:true}); }
    else { r = {roll_no:roll,student_name:name,marks,bonus,isNew:true,dirty:true}; rows.push(r); }
    r.total = calc(r); n++;
  }
  draw(); alert(`${n} rows loaded. Check them, then press Save changes.`);
}

// ---------- students ----------
function vStudents(){
  view.innerHTML = `<div class="bar"><input id="q" placeholder="Search roll no or name"><span class="sp"></span></div>
    ${can.write()?`<div class="card bar"><input id="ar" placeholder="Roll no"><input id="an" placeholder="Name"><select id="ab">${bopts()}</select><button class="p" id="aa">Add student</button></div>`:''}
    <div class="card tw" id="sl"></div>`;
  const load = async () => {
    const q = $('#q').value.trim().replace(/[,()%]/g,'');
    let r = sb.from('students').select('*,batches(name)').order('roll_no').limit(100);
    if(q) r = r.or(`roll_no.ilike.%${q}%,name.ilike.%${q}%`);
    const {data,error} = await r; if(fail(error,$('#sl'))) return;
    $('#sl').innerHTML = `<table><tr><th>Roll no</th><th>Name</th><th>Batch</th></tr>${data.map(s=>`<tr><td>${esc(s.roll_no)}</td><td>${can.edit()?`<a href="#" data-r="${esc(s.roll_no)}" data-n="${esc(s.name)}">${esc(s.name)||'(add name)'}</a>`:esc(s.name)}</td><td>${esc(s.batches?.name)}</td></tr>`).join('')}</table><p class="mu">Showing up to 100 matches.</p>`;
  };
  let tm; $('#q').oninput = () => { clearTimeout(tm); tm=setTimeout(load,300); }; load();
  $('#sl').onclick = async e => { const a=e.target.closest('a[data-r]'); if(!a) return; e.preventDefault();
    const n = prompt('Student name',a.dataset.n); if(n===null) return;
    const {error}=await sb.from('students').update({name:n}).eq('roll_no',a.dataset.r); if(!fail(error)) load(); };
  if(can.write()) $('#aa').onclick = async () => { const {error}=await sb.from('students').insert({roll_no:$('#ar').value.trim(),name:$('#an').value,batch_id:$('#ab').value}); if(!fail(error)){ $('#ar').value=$('#an').value=''; load(); } };
}

// ---------- student history ----------
function vHistory(){
  view.innerHTML = `<div class="bar"><input id="hq" placeholder="Roll no or name" size="28"><button class="p" id="hg">Show history</button></div><div id="hr"></div>`;
  const show = async roll => {
    const {data,error} = await sb.from('results_view').select('*').eq('roll_no',roll).order('test_date'); if(fail(error,$('#hr'))) return;
    if(!data.length){ $('#hr').innerHTML='<p class="mu">No results found for this roll no.</p>'; return; }
    killCharts();
    $('#hr').innerHTML = `<h3>${esc(data[0].student_name)||''} <span class="mu">${esc(roll)}</span></h3><div class="card" style="max-width:760px"><canvas id="hc" height="110"></canvas></div>
      <div class="card tw"><table><tr><th>Date</th><th>Batch</th><th>Test</th><th>Marks</th><th class="n">Total</th><th class="n">%</th><th class="n">Rank</th></tr>${data.map(r=>`<tr><td>${r.test_date}</td><td>${esc(r.batch_name)}</td><td>${esc(r.test_name)}</td><td>${r.subjects.map(s=>`${esc(s)}: ${r.marks[s]??'-'}`).join(', ')}</td><td class="n">${r.total}/${r.max_total}</td><td class="n">${r.percentage??''}</td><td class="n">${r.rnk}</td></tr>`).join('')}</table></div>`;
    chart('#hc','line',data.map(r=>r.test_date),'Percentage',data.map(r=>r.percentage));
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
  view.innerHTML = `<div class="card bar"><input id="bn" placeholder="New batch name"><select id="bt"><option>NEET</option><option>JEE</option><option>FOUNDATION</option><option>EXTERNAL</option></select><button class="p" id="ba">Add batch</button><span class="mu">${batches.map(b=>esc(b.name)).join(', ')}</span></div>
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
