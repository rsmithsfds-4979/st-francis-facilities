// Render functions for dashboard, buildings, rooms, assets, work orders, PM, contacts, invoices, history

// ---- RENDER DASHBOARD ----
function renderDash(){
  const open=workOrders.filter(w=>w.status!=='Completed').length;
  document.getElementById('d-wo').textContent=open;
  document.getElementById('wo-badge').textContent=open;
  document.getElementById('d-assets').textContent=assets.length;
  document.getElementById('d-attn').textContent=assets.filter(a=>a.status==='Maintenance').length;
  document.getElementById('d-pm').textContent=pmTasks.filter(p=>p.status!=='Done').length;

  // COI alerts
  const now=new Date();
  const in60=new Date(now.getTime()+60*24*60*60*1000);
  const coiAlerts=contacts.filter(c=>{
    if(!c.coi_expiry)return false;
    const d=new Date(c.coi_expiry);
    return d<in60;
  });
  const ca=document.getElementById('d-coi-alerts');
  if(ca)ca.innerHTML=coiAlerts.map(c=>{
    const exp=new Date(c.coi_expiry);
    const expired=exp<now;
    return`<div class="coi-alert ${expired?'':'coi-warn'}">
      ${expired?'🚨':'⚠️'} <strong>${c.name}</strong> Certificate of Insurance ${expired?'EXPIRED':'expires soon'}: ${c.coi_expiry}
      <button class="btn btn-sm" style="margin-left:auto" onclick="editContact('${c.id}')">Update COI</button>
    </div>`;
  }).join('');

  // Warranty alerts
  const warningA=assets.filter(a=>{
    if(!a.warranty_expiry)return false;
    const d=new Date(a.warranty_expiry);
    return d>now&&d<in60;
  });
  const wa=document.getElementById('d-warranty-alerts');
  if(wa)wa.innerHTML=warningA.map(a=>`<div style="background:var(--warning-bg);border:1px solid #f0d060;border-radius:8px;padding:10px 14px;margin-bottom:8px;font-family:sans-serif;font-size:13px;display:flex;align-items:center;gap:10px">⚠️ <strong>${a.description}</strong> warranty expires ${a.warranty_expiry}</div>`).join('');

  const wr=document.getElementById('d-wo-rows');
  if(wr)wr.innerHTML=workOrders.slice(0,5).length
    ?workOrders.slice(0,5).map(w=>`<tr onclick="openWODetail('${w.id}')" style="cursor:pointer"><td style="font-weight:bold">${w.issue}</td><td>${w.building}</td><td>${sb(w.status)}</td></tr>`).join('')
    :'<tr><td colspan="3" class="loading">No work orders yet</td></tr>';

  const pr=document.getElementById('d-pm-rows');
  if(pr){
    const upcoming=pmTasks.filter(p=>p.status!=='Done').slice(0,4);
    pr.innerHTML=upcoming.length
      ?upcoming.map(p=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 18px;border-bottom:1px solid var(--border);font-family:sans-serif;font-size:13px">
        <span style="font-size:16px">🔧</span>
        <div style="flex:1;min-width:0"><div style="font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title}</div><div style="font-size:11px;color:var(--text3)">${p.next_due||'No date'} · ${p.assigned_to||'Unassigned'}</div></div>
        ${sb(p.status)}</div>`).join('')
      :'<div style="text-align:center;padding:20px;color:var(--text3);font-family:sans-serif;font-size:13px">No upcoming PM tasks</div>';
  }

  const aa=document.getElementById('d-asset-alerts');
  const attnA=assets.filter(a=>a.status==='Maintenance');
  if(aa)aa.innerHTML=attnA.length
    ?attnA.slice(0,5).map(a=>{
      const pic=firstPhoto(a);
      return`<div style="display:flex;align-items:center;gap:10px;padding:9px 18px;border-bottom:1px solid var(--border);font-family:sans-serif;font-size:13px">
      ${pic?`<img src="${pic}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;cursor:pointer" onclick="openLightbox('${pic}')">`:`<span style="font-size:17px">${catIcon[a.category]||'📦'}</span>`}
      <div style="flex:1;min-width:0"><div style="font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.description}</div><div style="font-size:11px;color:var(--text3)">${a.room_number||a.location} · ${a.building}</div></div>
      ${sb(a.status)}</div>`;
    }).join('')
    :'<div style="text-align:center;padding:20px;color:var(--text3);font-family:sans-serif;font-size:13px">All assets operational ✓</div>';
}

// ---- RENDER BUILDINGS ----
function renderBuildings(){
  const el=document.getElementById('buildings-grid');
  if(!el)return;
  if(!buildings.length){el.innerHTML='<div class="empty-state"><p>No buildings yet.</p></div>';return;}
  el.innerHTML=buildings.map(b=>{
    const roomCount=rooms.filter(r=>r.building_id===b.id).length;
    const assetCount=assets.filter(a=>a.building===b.name).length;
    const woCount=workOrders.filter(w=>w.building===b.name&&w.status!=='Completed').length;
    return`<div class="building-card" onclick="openBuilding('${b.id}')">
      <div style="font-size:28px;margin-bottom:8px">🏛️</div>
      <div class="building-card-name">${b.name}</div>
      <div class="building-card-meta" style="margin-bottom:8px">${b.description||''}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span class="badge b-blue">${roomCount} rooms</span>
        <span class="badge b-gray">${assetCount} assets</span>
        ${woCount?`<span class="badge b-amber">${woCount} open WO</span>`:''}
      </div>
      <div style="margin-top:10px;display:flex;gap:6px">
        <button class="btn btn-sm btn-edit" onclick="event.stopPropagation();editBuilding('${b.id}')">Edit</button>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation();confirmDeleteBuilding('${b.id}','${b.name.replace(/'/g,"\\'")}')">Del</button>
      </div>
    </div>`;
  }).join('');
}

function renderBuildingNav(){
  const el=document.getElementById('building-nav-items');
  if(!el)return;
  el.innerHTML=buildings.map(b=>`<div class="nav-item nav-sub" onclick="openBuilding('${b.id}')"><span>${b.name}</span></div>`).join('');
}

function openBuilding(id){
  currentBuildingId=id;
  const b=buildings.find(x=>x.id===id);
  if(!b)return;
  document.getElementById('bld-detail-title').textContent=b.name;
  document.getElementById('bld-detail-meta').textContent=b.description||'';
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('view-building-detail').classList.add('active');
  renderRooms();
}

function renderRooms(){
  const q=(document.getElementById('room-search')?.value||'').toLowerCase();
  const bldRooms=rooms.filter(r=>r.building_id===currentBuildingId&&(!q||r.name.toLowerCase().includes(q)||r.floor?.toLowerCase().includes(q)));
  const el=document.getElementById('rooms-grid');
  if(!el)return;
  if(!bldRooms.length){el.innerHTML='<div class="empty-state"><p>No rooms yet.</p><small>Click "+ Add Room" to add one.</small></div>';return;}
  // Group by floor
  const floors={};
  bldRooms.forEach(r=>{const f=r.floor||'Other';if(!floors[f])floors[f]=[];floors[f].push(r);});
  const b=buildings.find(x=>x.id===currentBuildingId);
  el.innerHTML=Object.entries(floors).map(([floor,roomList])=>`
    <div style="grid-column:1/-1;font-size:11px;font-weight:bold;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;font-family:sans-serif;margin-top:8px;margin-bottom:4px">${floor}</div>
    ${roomList.map(r=>{
      const aCount=assets.filter(a=>a.room_id===r.id).length;
      const wCount=workOrders.filter(w=>w.room_id===r.id&&w.status!=='Completed').length;
      return`<div class="room-card" onclick="openRoom('${r.id}')">
        <div class="room-name">${r.name}</div>
        ${r.notes?`<div class="room-note">${r.notes}</div>`:''}
        <div class="room-badges">
          ${aCount?`<span class="badge b-blue" style="font-size:10px">${aCount} assets</span>`:''}
          ${wCount?`<span class="badge b-amber" style="font-size:10px">${wCount} open WO</span>`:''}
        </div>
        <div style="display:flex;gap:4px;margin-top:6px">
          <button class="btn btn-sm" style="font-size:10px;padding:2px 6px" onclick="event.stopPropagation();editRoom('${r.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 6px" onclick="event.stopPropagation();confirmDeleteRoom('${r.id}','${r.name.replace(/'/g,"\\'")}')">Del</button>
        </div>
      </div>`;
    }).join('')}`).join('');
  // Fix floor label spanning — re-wrap in a proper grid
  el.style.display='grid';
}

function openRoom(id){
  currentRoomId=id;
  const r=rooms.find(x=>x.id===id);
  if(!r)return;
  document.getElementById('room-detail-title').textContent=r.name;
  document.getElementById('room-detail-meta').textContent=(r.floor||'')+(r.notes?' · '+r.notes:'');
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.getElementById('view-room-detail').classList.add('active');
  renderRoomDetail(id);
}

function renderRoomDetail(roomId){
  const room=rooms.find(r=>r.id===roomId);
  const roomAssets=assets.filter(a=>a.room_id===roomId);
  const roomWOs=workOrders.filter(w=>w.room_id===roomId);

  const rp=document.getElementById('room-photos');
  if(rp){
    const pics=allPhotos(room);
    rp.innerHTML=pics.length
      ?`<div class="photo-gallery">${pics.map(u=>`<div class="photo-thumb" style="width:110px;height:110px"><img src="${u}" onclick="openLightbox('${u}')"></div>`).join('')}</div>`
      :'';
  }

  const ra=document.getElementById('room-assets');
  if(ra)ra.innerHTML=roomAssets.length
    ?roomAssets.map(a=>{
      const pic=firstPhoto(a);
      return`<div class="asset-card" style="margin-bottom:8px">
        ${pic?`<img src="${pic}" class="asset-photo" onclick="openLightbox('${pic}')">`:`<div class="asset-icon">${catIcon[a.category]||'📦'}</div>`}
        <div class="asset-info">
          <div class="asset-name">${a.description}</div>
          <div class="asset-meta">${[a.serial,a.manufacturer].filter(Boolean).join(' · ')}</div>
          <div class="asset-tags">${sb(a.status)}<span class="badge b-gray">${a.category}</span></div>
        </div>
        <div class="asset-actions">
          <button class="btn btn-edit btn-sm" onclick="editAsset('${a.id}')">Edit</button>
        </div>
      </div>`;
    }).join('')
    :'<div class="empty-state" style="padding:20px"><p>No assets in this room.</p><small>Click "+ Add Asset" to add one.</small></div>';

  const rw=document.getElementById('room-workorders');
  if(rw)rw.innerHTML=roomWOs.length
    ?roomWOs.map(w=>`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:8px;font-family:sans-serif;cursor:pointer" onclick="openWODetail('${w.id}')">
        <div style="font-weight:bold;font-size:13px;margin-bottom:4px">${w.issue}</div>
        <div style="display:flex;gap:6px;align-items:center">${pb(w.priority)}${sb(w.status)}<span style="font-size:11px;color:var(--text3);margin-left:4px">${w.assignee}</span></div>
      </div>`).join('')
    :'<div class="empty-state" style="padding:20px"><p>No work orders for this room.</p><small>Click "+ Work Order" to create one.</small></div>';
}

function goBackToBuilding(){
  if(currentBuildingId)openBuilding(currentBuildingId);
  else go('buildings');
}

// ---- RENDER ASSETS ----
function renderAssets(){
  const q=(document.getElementById('asset-search')?.value||'').toLowerCase();
  const fb=document.getElementById('af-bld')?.value||'all';
  const fc=document.getElementById('af-cat')?.value||'all';
  const fs=document.getElementById('af-status')?.value||'all';
  const filtered=assets.filter(a=>{
    const m=!q||(a.description||'').toLowerCase().includes(q)||(a.serial||'').toLowerCase().includes(q)||(a.location||'').toLowerCase().includes(q)||(a.manufacturer||'').toLowerCase().includes(q)||(a.room_number||'').toLowerCase().includes(q);
    return m&&(fb==='all'||a.building===fb)&&(fc==='all'||a.category===fc)&&(fs==='all'||a.status===fs);
  });
  const el=document.getElementById('asset-list');
  if(!el)return;
  if(!filtered.length){el.innerHTML='<div class="empty-state"><p>No assets match.</p></div>';return;}
  el.innerHTML=filtered.map(a=>{
    const pic=firstPhoto(a);
    return`<div class="asset-card">
    ${pic?`<img src="${pic}" class="asset-photo" onclick="openLightbox('${pic}')">`:`<div class="asset-icon">${catIcon[a.category]||'📦'}</div>`}
    <div class="asset-info">
      <div class="asset-name">${a.description}</div>
      <div class="asset-meta">${[a.serial,a.room_number,a.location,a.manufacturer,a.size].filter(Boolean).join(' · ')}</div>
      <div class="asset-tags">${sb(a.status)}<span class="badge b-blue">${a.building}</span><span class="badge b-gray">${a.category}</span>${a.expected_life?`<span class="badge b-gray">Life: ${a.expected_life}</span>`:''}</div>
      ${a.notes?`<div class="asset-note">${a.notes.substring(0,130)}${a.notes.length>130?'…':''}</div>`:''}
    </div>
    <div class="asset-actions">
      <button class="btn btn-edit btn-sm" onclick="editAsset('${a.id}')">Edit</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDeleteAsset('${a.id}','${(a.description||'').replace(/'/g,"\\'")}')">Del</button>
    </div>
  </div>`;
  }).join('');
}

// ---- RENDER WORK ORDERS ----
function renderWO(){
  const fs=document.getElementById('wo-f-status')?.value||'all';
  const fb=document.getElementById('wo-f-bld')?.value||'all';
  const f=workOrders.filter(w=>(fs==='all'||w.status===fs)&&(fb==='all'||w.building===fb));
  const tb=document.getElementById('wo-table');
  if(tb)tb.innerHTML=f.length
    ?f.map((w,i)=>`<tr onclick="openWODetail('${w.id}')" style="cursor:pointer">
      <td style="font-size:11px;color:var(--text3)">#${i+1}</td>
      <td style="font-weight:bold">${w.issue}</td>
      <td>${w.building}</td>
      <td style="font-size:11px;color:var(--text3)">${w.location||'—'}</td>
      <td>${pb(w.priority)}</td>
      <td>${w.assignee}</td>
      <td>${sb(w.status)}</td>
      <td style="white-space:nowrap" onclick="event.stopPropagation()">
        ${w.status!=='Completed'?`<button class="btn btn-sm btn-success" onclick="updateWOStatus('${w.id}','Completed')">✓</button>`:''}
        <button class="btn btn-danger btn-sm" style="margin-left:4px" onclick="confirmDeleteWO('${w.id}')">Del</button>
      </td></tr>`).join('')
    :'<tr><td colspan="8" class="loading">No work orders match this filter</td></tr>';
}

// ---- RENDER PM ----
function renderPM(){
  const el=document.getElementById('pm-list');
  if(!el)return;
  if(!pmTasks.length){el.innerHTML='<div class="empty-state"><p>No PM tasks yet.</p></div>';return;}
  el.innerHTML=pmTasks.map(p=>`<div class="pm-card">
    <div style="width:38px;height:38px;border-radius:8px;background:var(--warning-bg);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">🔧</div>
    <div class="pm-info">
      <div class="pm-title">${p.title}</div>
      <div class="pm-meta">${p.building} · ${p.frequency} · ${p.assigned_to||'Unassigned'}</div>
      <div class="pm-meta">Next due: <strong>${p.next_due||'Not set'}</strong>${p.last_completed?' · Last done: '+p.last_completed:''}</div>
      ${p.description?`<div style="font-size:12px;color:var(--text3);font-family:sans-serif;margin-top:3px">${p.description}</div>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;flex-shrink:0">
      ${sb(p.status)}
      ${p.status!=='Done'?`<button class="btn btn-success btn-sm" onclick="markPMDone('${p.id}')">✓ Done</button>`:''}
      <button class="btn btn-edit btn-sm" onclick="editPM('${p.id}')">Edit</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDeletePM('${p.id}')">Del</button>
    </div>
  </div>`).join('');
}

// ---- RENDER CONTACTS ----
function renderContacts(){
  const el=document.getElementById('contacts-list');
  if(!el)return;
  const typePlural={Contractor:'Contractors',Staff:'Staff',Volunteer:'Volunteers'};
  const typeLabel=typePlural[currentContactType]||'Directory';
  const titleEl=document.getElementById('contacts-title');
  if(titleEl)titleEl.textContent=typeLabel;
  const btnEl=document.getElementById('contacts-add-btn');
  if(btnEl)btnEl.textContent='+ Add '+currentContactType;
  const filtered=contacts.filter(c=>c.type===currentContactType);
  if(!filtered.length){el.innerHTML=`<div class="empty-state"><p>No ${typeLabel.toLowerCase()} yet.</p><small>Click "+ Add ${currentContactType}" to add one.</small></div>`;return;}
  const now=new Date();
  el.innerHTML=`
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><div class="card-title">${typeLabel}</div></div>
      ${filtered.map(c=>{
        const coiExp=c.coi_expiry?new Date(c.coi_expiry):null;
        const coiExpired=coiExp&&coiExp<now;
        const coiSoon=coiExp&&!coiExpired&&coiExp<new Date(now.getTime()+60*24*60*60*1000);
        return`<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border-bottom:1px solid var(--border);font-family:sans-serif">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--info-bg);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;color:var(--info);flex-shrink:0">${(c.name||'?').substring(0,2).toUpperCase()}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:bold;font-size:14px;color:var(--accent2)">${c.name}</div>
            <div style="font-size:12px;color:var(--text3)">${c.role}${c.phone?' · '+c.phone:''}${c.email?' · '+c.email:''}</div>
            ${c.notes?`<div style="font-size:12px;color:var(--text3);margin-top:2px">${c.notes}</div>`:''}
            ${c.coi_expiry?`<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="badge ${coiExpired?'b-red':coiSoon?'b-amber':'b-green'}" style="font-size:11px">
                ${coiExpired?'🚨 COI EXPIRED':'⚡ COI'}: ${c.coi_expiry}
              </span>
              ${c.coi_insurer?`<span style="font-size:11px;color:var(--text3)">${c.coi_insurer}</span>`:''}
              ${c.coi_url?`<a href="${c.coi_url}" target="_blank" style="font-size:11px;color:var(--accent)">📄 View COI</a>`:''}
            </div>`:'<div style="margin-top:4px;font-size:11px;color:var(--text3)">No COI on file</div>'}
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button class="btn btn-edit btn-sm" onclick="editContact('${c.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteContact('${c.id}','${(c.name||'').replace(/'/g,"\\'")}')">Del</button>
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

// ---- RENDER INVOICES ----
function renderInvoices(){
  const fv=document.getElementById('inv-f-vendor')?.value||'all';
  const f=invoices.filter(i=>fv==='all'||i.vendor===fv);
  const total=f.reduce((a,i)=>a+Number(i.amount||0),0);
  const yr=new Date().getFullYear();
  const yTotal=f.filter(i=>(i.date||'').includes(yr)).reduce((a,i)=>a+Number(i.amount||0),0);
  const ti=document.getElementById('inv-total');if(ti)ti.textContent=fmt(total);
  const iy=document.getElementById('inv-year');if(iy)iy.textContent=fmt(yTotal);
  const ic=document.getElementById('inv-count');if(ic)ic.textContent=f.length;
  const tb=document.getElementById('inv-table');
  if(tb)tb.innerHTML=f.length
    ?f.map(i=>`<tr onclick="editInvoice('${i.id}')" style="cursor:pointer">
      <td style="font-size:11px;color:var(--text3)">${i.invoice_number||'—'}${i.pdf_url?` <a href="${i.pdf_url}" target="_blank" onclick="event.stopPropagation()" title="View PDF" style="text-decoration:none">📄</a>`:''}</td>
      <td style="font-size:11px;color:var(--text3)">${i.date||'—'}</td>
      <td style="font-weight:bold">${i.vendor}</td>
      <td>${(i.description||'').substring(0,50)}</td>
      <td><span class="badge b-blue" style="font-size:10px">${(i.building||'').substring(0,6)}</span></td>
      <td style="font-weight:bold">${fmt(i.amount)}</td>
      <td>${sb(i.status)}</td></tr>`).join('')
    :'<tr><td colspan="7" class="loading">No invoices yet</td></tr>';
}

// ---- RENDER SERVICE HISTORY ----
function renderHistory(){
  const fy=document.getElementById('hist-f-year')?.value||'all';
  const fb=document.getElementById('hist-f-bld')?.value||'all';
  const f=serviceHistory.filter(h=>(fy==='all'||h.date.includes('/'+fy))&&(fb==='all'||h.building===fb));
  const tb=document.getElementById('hist-table');
  if(tb)tb.innerHTML=[...f].reverse().map(h=>`<tr onclick="showHistDetail('${h.inv}')" style="cursor:pointer">
    <td style="font-size:11px;color:var(--text3)">${h.inv}</td>
    <td style="font-size:11px;color:var(--text3)">${h.date}</td>
    <td style="white-space:normal;line-height:1.4;font-weight:bold;padding-top:9px;padding-bottom:9px">${h.desc.substring(0,80)}${h.desc.length>80?'…':''}</td>
    <td style="font-size:11px;color:var(--text3);white-space:normal">${h.equip.substring(0,28)}</td>
    <td><span class="badge b-blue" style="font-size:10px">${h.building.substring(0,6)}</span></td>
    <td style="font-weight:bold">${h.amount>0?fmt(h.amount):'—'}</td>
  </tr>`).join('');
}

// ---- POPULATE DROPDOWNS ----
function populateBuildingDropdowns(){
  const bldNames=buildings.map(b=>b.name);
  ['wo-f-bld','af-bld'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el)return;
    const cur=el.value;
    while(el.options.length>1)el.remove(1);
    bldNames.forEach(n=>{const o=document.createElement('option');o.value=n;o.textContent=n;el.appendChild(o);});
    if(cur)el.value=cur;
  });
  // Vendor invoice filter
  const vf=document.getElementById('inv-f-vendor');
  if(vf){
    while(vf.options.length>1)vf.remove(1);
    contacts.filter(c=>c.type==='Contractor').forEach(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=c.name;vf.appendChild(o);});
  }
}

function populateContactDropdowns(){}

function populateCategoryDropdown(){
  const el=document.getElementById('af-cat');
  if(!el)return;
  const cur=el.value;
  while(el.options.length>1)el.remove(1);
  categories.forEach(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=c.name;el.appendChild(o);});
  if(cur)el.value=cur;
}

// ---- REPORT HELPERS ----
function parseDate(str){
  if(!str)return null;
  const d=new Date(str);
  return isNaN(d.getTime())?null:d;
}
function daysBetween(a,b){return Math.floor((a.getTime()-b.getTime())/(24*60*60*1000));}
function fmtDate(d){return d?d.toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'}):'—';}

// ---- RENDER PM COMPLIANCE REPORT ----
function renderPMReport(){
  const fbEl=document.getElementById('pmr-f-bld');
  if(fbEl){
    const cur=fbEl.value;
    while(fbEl.options.length>1)fbEl.remove(1);
    buildings.forEach(b=>{const o=document.createElement('option');o.value=b.name;o.textContent=b.name;fbEl.appendChild(o);});
    if(cur)fbEl.value=cur;
  }
  const fb=fbEl?.value||'all';
  const el=document.getElementById('pmr-content');
  if(!el)return;
  const now=new Date();now.setHours(0,0,0,0);
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0);
  const in30=new Date(now.getTime()+30*24*60*60*1000);

  const active=pmTasks.filter(p=>p.status!=='Done').filter(p=>fb==='all'||p.building===fb||p.building==='All Buildings');
  const withDate=active.map(p=>({...p,_due:parseDate(p.next_due)}));

  const overdue=withDate.filter(p=>p._due&&p._due<now).sort((a,b)=>a._due-b._due);
  const dueThisMonth=withDate.filter(p=>p._due&&p._due>=now&&p._due<=monthEnd).sort((a,b)=>a._due-b._due);
  const upcoming=withDate.filter(p=>p._due&&p._due>monthEnd&&p._due<=in30).sort((a,b)=>a._due-b._due);
  const noDate=withDate.filter(p=>!p._due);

  const totalActive=active.length;
  const doneTasks=pmTasks.filter(p=>p.status==='Done');
  const onTimePct=doneTasks.length?Math.round((doneTasks.filter(p=>{
    const lc=parseDate(p.last_completed),nd=parseDate(p.next_due);
    return lc&&nd?lc<=nd:true;
  }).length/doneTasks.length)*100):null;

  const row=p=>{
    const days=p._due?daysBetween(now,p._due):null;
    const ageLabel=days===null?'—':days<0?`${-days} day${days===-1?'':'s'} overdue`:days===0?'Today':`${days} day${days===1?'':'s'} left`;
    return`<tr>
      <td style="font-weight:bold;white-space:normal">${p.title}</td>
      <td>${p.building||''}</td>
      <td>${p.frequency||''}</td>
      <td>${p.assigned_to||'Unassigned'}</td>
      <td>${fmtDate(p._due)}</td>
      <td>${p.last_completed||'—'}</td>
      <td>${ageLabel}</td>
    </tr>`;
  };

  const section=(title,rows,emptyMsg,color)=>`
    <div class="card">
      <div class="card-header"><div class="card-title" ${color?`style="color:${color}"`:''}>${title} · ${rows.length}</div></div>
      ${rows.length?`<table class="table">
        <colgroup><col style="width:26%"><col style="width:14%"><col style="width:11%"><col style="width:14%"><col style="width:11%"><col style="width:11%"><col style="width:13%"></colgroup>
        <thead><tr><th>Task</th><th>Building</th><th>Frequency</th><th>Assigned</th><th>Next Due</th><th>Last Done</th><th>Status</th></tr></thead>
        <tbody>${rows.map(row).join('')}</tbody>
      </table>`:`<div style="padding:16px;color:var(--text3);font-family:sans-serif;font-size:13px">${emptyMsg}</div>`}
    </div>`;

  el.innerHTML=`
    <div class="report-meta no-screen" style="display:none">Generated ${fmtDate(now)}${fb!=='all'?' · '+fb:''}</div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-label">Overdue</div><div class="stat-value" style="color:var(--danger)">${overdue.length}</div><div class="stat-delta">past due date</div></div>
      <div class="stat-card"><div class="stat-label">Due This Month</div><div class="stat-value" style="color:var(--warning)">${dueThisMonth.length}</div><div class="stat-delta">${fmtDate(monthStart)}–${fmtDate(monthEnd)}</div></div>
      <div class="stat-card"><div class="stat-label">Active PMs</div><div class="stat-value" style="color:var(--accent)">${totalActive}</div><div class="stat-delta">not yet done</div></div>
      <div class="stat-card"><div class="stat-label">On-time %</div><div class="stat-value" style="color:var(--success)">${onTimePct===null?'—':onTimePct+'%'}</div><div class="stat-delta">of completed</div></div>
    </div>
    ${section('Overdue',overdue,'No overdue PM tasks. ✓','var(--danger)')}
    ${section('Due this month',dueThisMonth,'Nothing due this month.')}
    ${section('Upcoming (next 30 days)',upcoming,'No tasks due in the next 30 days.')}
    ${noDate.length?section('No due date set',noDate,''):''}
  `;
}

// ---- RENDER VENDOR & COI REPORT ----
function renderCOIReport(){
  const el=document.getElementById('coir-content');
  if(!el)return;
  const now=new Date();now.setHours(0,0,0,0);
  const in60=new Date(now.getTime()+60*24*60*60*1000);

  const contractors=contacts.filter(c=>c.type==='Contractor');
  const withParsed=contractors.map(c=>({...c,_exp:parseDate(c.coi_expiry)}));

  const expired=withParsed.filter(c=>c._exp&&c._exp<now).sort((a,b)=>a._exp-b._exp);
  const expiring=withParsed.filter(c=>c._exp&&c._exp>=now&&c._exp<=in60).sort((a,b)=>a._exp-b._exp);
  const missing=withParsed.filter(c=>!c._exp);
  const current=withParsed.filter(c=>c._exp&&c._exp>in60).sort((a,b)=>a._exp-b._exp);

  const row=(c,label)=>{
    const days=c._exp?daysBetween(c._exp,now):null;
    const ageLabel=days===null?'No expiry on file':days<0?`Expired ${-days} day${days===-1?'':'s'} ago`:days===0?'Expires today':`${days} day${days===1?'':'s'} remaining`;
    return`<tr>
      <td style="font-weight:bold">${c.name}</td>
      <td>${c.role||''}</td>
      <td>${c.phone||''}</td>
      <td>${fmtDate(c._exp)}</td>
      <td>${ageLabel}</td>
      <td>${c.coi_insurer||'—'}</td>
      <td>${c.coi_policy_number||'—'}</td>
      <td class="no-print">${c.coi_url?`<a href="${c.coi_url}" target="_blank">📄</a>`:''}</td>
    </tr>`;
  };

  const section=(title,rows,emptyMsg,color)=>`
    <div class="card">
      <div class="card-header"><div class="card-title" ${color?`style="color:${color}"`:''}>${title} · ${rows.length}</div></div>
      ${rows.length?`<table class="table">
        <colgroup><col style="width:17%"><col style="width:14%"><col style="width:11%"><col style="width:11%"><col style="width:15%"><col style="width:12%"><col style="width:13%"><col style="width:7%"></colgroup>
        <thead><tr><th>Contractor</th><th>Role</th><th>Phone</th><th>COI Expiry</th><th>Status</th><th>Insurer</th><th>Policy #</th><th class="no-print">COI</th></tr></thead>
        <tbody>${rows.map(row).join('')}</tbody>
      </table>`:`<div style="padding:16px;color:var(--text3);font-family:sans-serif;font-size:13px">${emptyMsg}</div>`}
    </div>`;

  el.innerHTML=`
    <div class="report-meta no-screen" style="display:none">Generated ${fmtDate(now)}</div>
    <div class="stats-row">
      <div class="stat-card"><div class="stat-label">Contractors</div><div class="stat-value" style="color:var(--accent)">${contractors.length}</div><div class="stat-delta">total on file</div></div>
      <div class="stat-card"><div class="stat-label">Expired</div><div class="stat-value" style="color:var(--danger)">${expired.length}</div><div class="stat-delta">COI past expiry</div></div>
      <div class="stat-card"><div class="stat-label">Expiring in 60 days</div><div class="stat-value" style="color:var(--warning)">${expiring.length}</div><div class="stat-delta">needs renewal soon</div></div>
      <div class="stat-card"><div class="stat-label">No COI on file</div><div class="stat-value" style="color:var(--text3)">${missing.length}</div><div class="stat-delta">missing expiry</div></div>
    </div>
    ${section('Expired COIs',expired,'No expired COIs. ✓','var(--danger)')}
    ${section('Expiring in the next 60 days',expiring,'No COIs expiring in the next 60 days.','var(--warning)')}
    ${section('No COI on file',missing,'Every contractor has a COI expiry recorded.')}
    ${section('Current COIs',current,'No contractors with current COIs.','var(--success)')}
  `;
}

// ---- RENDER SETTINGS ----
function renderSettings(){
  const el=document.getElementById('categories-list');
  if(!el)return;
  if(!categories.length){el.innerHTML='<div class="empty-state"><p>No categories yet.</p></div>';return;}
  el.innerHTML=categories.map(c=>{
    const inUse=assets.filter(a=>a.category===c.name).length;
    return`<div style="display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid var(--border);font-family:sans-serif">
      <div style="width:38px;height:38px;border-radius:8px;background:var(--info-bg);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">${c.icon||'📦'}</div>
      <div style="flex:1;min-width:0">
        <div style="font-weight:bold;font-size:14px;color:var(--accent2)">${c.name}</div>
        <div style="font-size:12px;color:var(--text3)">${inUse} asset${inUse===1?'':'s'} using this category</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-edit btn-sm" onclick="editCategory('${c.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteCategory('${c.id}','${c.name.replace(/'/g,"\\'")}')">Del</button>
      </div>
    </div>`;
  }).join('');
}
