// Render functions for dashboard, buildings, rooms, assets, work orders, PM, contacts, invoices, history

// ---- ROOM HELPERS ----
const ROOM_TYPE_ICONS={Worship:'⛪',Classroom:'📚',Office:'💼',Kitchen:'🍳',Restroom:'🚻',Storage:'📦',Mechanical:'⚙️',Meeting:'🪑',Hall:'🏛️',Exterior:'🌳',Other:'🏠'};
function roomTypeIcon(type){return ROOM_TYPE_ICONS[type]||'🏠';}

// ---- CALENDAR HELPERS ----
function eventDate(e){
  if(!e?.start)return null;
  if(e.allDay){
    // "YYYY-MM-DD" — parse as local date (not UTC) so all-day events land on the right calendar day
    const[y,m,d]=e.start.split('-').map(Number);
    return new Date(y,m-1,d);
  }
  return new Date(e.start);
}
function eventsOnDate(date,events){
  if(!date)return[];
  const list=events||gcalEvents;
  const y=date.getFullYear(),m=date.getMonth(),d=date.getDate();
  return list.filter(e=>{
    const ed=eventDate(e);
    return ed&&ed.getFullYear()===y&&ed.getMonth()===m&&ed.getDate()===d;
  });
}
function fmtEventWhen(e){
  const d=eventDate(e);
  if(!d)return'';
  const dateStr=d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
  if(e.allDay)return dateStr+' · All day';
  return dateStr+' · '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}

// ---- FULL CALENDAR PAGE ----
function renderCalendar(){
  const contentEl=document.getElementById('cal-content');
  const titleEl=document.getElementById('cal-title');
  if(!contentEl)return;
  ['day','week','month','quarter'].forEach(v=>{
    const btn=document.getElementById('cv-'+v);
    if(btn)btn.classList.toggle('btn-primary',calView===v);
  });
  if(titleEl)titleEl.textContent=calTitle();
  const configured=appSettings.gcal_api_key&&appSettings.gcal_calendar_id;
  if(!configured){
    contentEl.innerHTML='<div class="empty-state"><p>Google Calendar not configured.</p><small>Go to Settings → Google Calendar → Configure.</small></div>';
    return;
  }
  if(calView==='day')renderCalDay(contentEl);
  else if(calView==='week')renderCalWeek(contentEl);
  else if(calView==='month')renderCalMonth(contentEl);
  else renderCalQuarter(contentEl);
}

function calTitle(){
  const d=calDate;
  if(calView==='day')return d.toLocaleDateString('en-US',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
  if(calView==='week'){
    const start=new Date(d.getFullYear(),d.getMonth(),d.getDate()-d.getDay());
    const end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+6);
    const sameMo=start.getMonth()===end.getMonth();
    return sameMo
      ?`Week of ${start.toLocaleDateString('en-US',{month:'long'})} ${start.getDate()}–${end.getDate()}, ${start.getFullYear()}`
      :`Week of ${start.toLocaleDateString('en-US',{month:'short',day:'numeric'})} – ${end.toLocaleDateString('en-US',{month:'short',day:'numeric'})}, ${start.getFullYear()}`;
  }
  if(calView==='month')return d.toLocaleDateString('en-US',{year:'numeric',month:'long'});
  const q=Math.floor(d.getMonth()/3)+1;
  const s=new Date(d.getFullYear(),(q-1)*3,1);
  const e=new Date(d.getFullYear(),(q-1)*3+2,1);
  return `Q${q} ${d.getFullYear()} (${s.toLocaleDateString('en-US',{month:'long'})} – ${e.toLocaleDateString('en-US',{month:'long'})})`;
}

function sameDay(a,b){return a&&b&&a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate();}

function fmtEventTime(e){
  if(e.allDay)return'All day';
  const s=new Date(e.start);
  const end=e.end?new Date(e.end):null;
  const sStr=s.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  if(end)return sStr+' – '+end.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
  return sStr;
}

function sortEvents(events){return[...events].sort((a,b)=>(new Date(a.start))-(new Date(b.start)));}

function renderCalDay(el){
  const all=combinedCalendarEvents();
  const events=sortEvents(eventsOnDate(calDate,all));
  if(!events.length){el.innerHTML='<div class="empty-state"><p>No events on this day.</p></div>';return;}
  el.innerHTML=events.map(e=>{
    const src=e.source||'gcal';
    const clickable=e._ref?`onclick="dispatchCalEvent('${e._ref.type}','${e._ref.id}')" style="cursor:pointer"`:'';
    return`<div class="card cal-src-${src}-card" ${clickable} style="margin-bottom:12px;border-left:4px solid ${calSourceColor(src)}">
      <div style="padding:14px 18px;display:flex;gap:14px;align-items:flex-start">
        <div style="font-size:12px;color:${calSourceColor(src)};font-weight:bold;min-width:100px;flex-shrink:0">${fmtEventTime(e)}<div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-top:2px;font-weight:normal">${calSourceLabel(src)}</div></div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:bold;font-size:15px;color:var(--accent2)">${e.title}</div>
          ${e.location?`<div style="font-size:12px;color:var(--text3);margin-top:4px">📍 ${e.location}</div>`:''}
          ${e.description?`<div style="font-size:13px;color:var(--text2);margin-top:8px;white-space:pre-wrap;line-height:1.5">${e.description}</div>`:''}
        </div>
      </div>
    </div>`;
  }).join('');
}

function calSourceColor(src){
  return{gcal:'var(--accent)',pm:'var(--warning)',wo:'var(--danger)',quote:'#6b3fa0',custom:'var(--success)'}[src]||'var(--text3)';
}
function calSourceLabel(src){
  return{gcal:'Parish',pm:'PM',wo:'Work order',quote:'Quote',custom:'Event'}[src]||'';
}

function renderCalWeek(el){
  const d=calDate;
  const weekStart=new Date(d.getFullYear(),d.getMonth(),d.getDate()-d.getDay());
  const today=new Date();
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const all=combinedCalendarEvents();
  const cols=[];
  for(let i=0;i<7;i++){
    const day=new Date(weekStart.getFullYear(),weekStart.getMonth(),weekStart.getDate()+i);
    const events=sortEvents(eventsOnDate(day,all));
    const isToday=sameDay(day,today);
    cols.push(`<div class="cal-week-col ${isToday?'cal-today':''}">
      <div class="cal-week-head" onclick="calJumpToDay('${day.toISOString()}')">
        <div class="cal-week-dayname">${dayNames[i]}</div>
        <div class="cal-week-daynum">${day.getDate()}</div>
      </div>
      <div class="cal-week-body">
        ${events.length
          ?events.map(e=>{
            const src=e.source||'gcal';
            const click=e._ref?`onclick="event.stopPropagation();dispatchCalEvent('${e._ref.type}','${e._ref.id}')"`:'';
            return`<div class="cal-chip cal-chip-big cal-src-${src}" ${click}>
              <div class="cal-chip-time">${fmtEventTime(e)}</div>
              <div class="cal-chip-title">${e.title}</div>
              ${e.location?`<div class="cal-chip-loc">📍 ${e.location}</div>`:''}
            </div>`;
          }).join('')
          :'<div class="cal-week-empty">—</div>'}
      </div>
    </div>`);
  }
  el.innerHTML=`<div class="cal-week">${cols.join('')}</div>`;
}

function renderCalMonth(el){
  const d=calDate;
  const year=d.getFullYear();
  const month=d.getMonth();
  const firstDay=new Date(year,month,1);
  const gridStart=new Date(year,month,1-firstDay.getDay());
  const today=new Date();
  const dayNames=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const all=combinedCalendarEvents();
  const cells=[];
  for(let i=0;i<42;i++){
    const day=new Date(gridStart.getFullYear(),gridStart.getMonth(),gridStart.getDate()+i);
    const inMonth=day.getMonth()===month;
    const isToday=sameDay(day,today);
    const events=sortEvents(eventsOnDate(day,all));
    const shown=events.slice(0,3);
    const extra=events.length-shown.length;
    const chips=shown.map(e=>{
      const src=e.source||'gcal';
      const click=e._ref?`onclick="event.stopPropagation();dispatchCalEvent('${e._ref.type}','${e._ref.id}')"`:'';
      return`<div class="cal-chip cal-chip-mini cal-src-${src}" ${click} title="${(e.title+(e.location?' — '+e.location:'')).replace(/"/g,'&quot;')}">${e.allDay?'':fmtEventTime(e).split(' – ')[0]+' '}${e.title}</div>`;
    }).join('');
    cells.push(`<div class="cal-month-cell ${inMonth?'':'cal-month-other'} ${isToday?'cal-today':''}" onclick="calJumpToDay('${day.toISOString()}')">
      <div class="cal-month-daynum">${day.getDate()}</div>
      ${chips}
      ${extra>0?`<div class="cal-more">+${extra} more</div>`:''}
    </div>`);
    if((i+1)%7===0&&i>=27&&day>=new Date(year,month+1,0))break; // trim 6th row if not needed
  }
  el.innerHTML=`<div class="cal-month-grid">
    ${dayNames.map(n=>`<div class="cal-month-head">${n}</div>`).join('')}
    ${cells.join('')}
  </div>`;
}

function renderCalQuarter(el){
  const d=calDate;
  const year=d.getFullYear();
  const qStartMonth=Math.floor(d.getMonth()/3)*3;
  const today=new Date();
  const dayNames=['S','M','T','W','T','F','S'];
  const all=combinedCalendarEvents();
  const months=[];
  for(let m=0;m<3;m++){
    const monthDate=new Date(year,qStartMonth+m,1);
    const firstDay=monthDate.getDay();
    const gridStart=new Date(year,qStartMonth+m,1-firstDay);
    const cells=[];
    for(let i=0;i<42;i++){
      const day=new Date(gridStart.getFullYear(),gridStart.getMonth(),gridStart.getDate()+i);
      const inMonth=day.getMonth()===qStartMonth+m;
      const isToday=sameDay(day,today);
      const events=eventsOnDate(day,all);
      const titles=events.slice(0,5).map(e=>e.title).join('\n').replace(/"/g,'&quot;');
      cells.push(`<div class="cal-mini-cell ${inMonth?'':'cal-mini-other'} ${isToday?'cal-today':''}" onclick="calJumpToDay('${day.toISOString()}')" title="${titles}">
        <div class="cal-mini-num">${day.getDate()}</div>
        ${events.length?`<div class="cal-mini-events">${events.length>3?events.length:'•'.repeat(events.length)}</div>`:''}
      </div>`);
    }
    months.push(`<div class="cal-mini-month">
      <div class="cal-mini-title">${monthDate.toLocaleDateString('en-US',{month:'long',year:'numeric'})}</div>
      <div class="cal-mini-grid">
        ${dayNames.map(n=>`<div class="cal-mini-head">${n}</div>`).join('')}
        ${cells.join('')}
      </div>
    </div>`);
  }
  el.innerHTML=`<div class="cal-quarter">${months.join('')}</div>`;
}

function calJumpToDay(iso){
  calDate=new Date(iso);
  calView='day';
  loadCalEvents();
}

// ---- WEATHER WIDGET ----
function weatherEmoji(code){
  const c=Number(code);
  if(c===113)return'☀️';
  if(c===116)return'⛅';
  if(c===119||c===122)return'☁️';
  if([143,248,260].includes(c))return'🌫️';
  if(c===200||c===386||c===389||c===392||c===395)return'⛈️';
  if(c>=176&&c<=377)return'🌧️';
  if(c>=179&&c<=374)return'❄️';
  return'🌡️';
}

function renderDashWeather(){
  const el=document.getElementById('d-weather');
  if(!el)return;
  const loc=appSettings.weather_location;
  if(!loc){el.innerHTML='';return;}
  if(!_weatherData){
    el.innerHTML=`<div class="card" style="margin-bottom:16px"><div style="padding:12px 16px;font-size:12px;color:var(--text3)">Loading weather for ${loc}…</div></div>`;
    return;
  }
  const cur=_weatherData.current_condition?.[0];
  const today=_weatherData.weather?.[0];
  const area=_weatherData.nearest_area?.[0]?.areaName?.[0]?.value||loc;
  if(!cur){el.innerHTML='';return;}
  const emoji=weatherEmoji(cur.weatherCode);
  const desc=cur.weatherDesc?.[0]?.value||'';
  const tempF=cur.temp_F;
  const hi=today?.maxtempF;
  const lo=today?.mintempF;
  const wind=cur.windspeedMiles;
  el.innerHTML=`<div class="card" style="margin-bottom:16px">
    <div style="display:flex;align-items:center;gap:18px;padding:12px 18px">
      <div style="font-size:40px;line-height:1">${emoji}</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:20px;font-weight:bold;color:var(--accent2)">${tempF}°F · ${desc}</div>
        <div style="font-size:11px;color:var(--text3);margin-top:2px">${area}${hi&&lo?` · H ${hi}° / L ${lo}°`:''}${wind?` · Wind ${wind} mph`:''}</div>
      </div>
      <button class="btn btn-sm" onclick="refreshWeather()" title="Refresh">↻</button>
    </div>
  </div>`;
}

async function refreshWeather(){
  await loadWeather(true);
  renderDashWeather();
}

// ---- RENDER DASHBOARD ----
function renderDash(){
  // Run after all inner HTML is populated so collapsible data-ids pick up localStorage state
  setTimeout(initCollapsibleCards,0);
  renderDashWeather();
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
    if(c.type!=='Contractor')return false;
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
  if(wa)wa.innerHTML=warningA.map(a=>`<div style="background:var(--warning-bg);border:1px solid #f0d060;border-radius:8px;padding:10px 14px;margin-bottom:8px;font-size:13px;display:flex;align-items:center;gap:10px">⚠️ <strong>${a.description}</strong> warranty expires ${a.warranty_expiry}</div>`).join('');

  const sa=document.getElementById('d-supply-alerts');
  const lowSupplies=supplies.filter(s=>supplyStockStatus(s).label!=='Stocked');
  if(sa){
    if(!lowSupplies.length){sa.innerHTML='';}
    else{
      sa.innerHTML=`<div class="card collapsible" data-collapse-id="dash-supplies-low" style="margin-bottom:16px">
        <div class="card-header" onclick="toggleCard(this.parentNode)">
          <div class="card-title"><span class="cc-chevron">▼</span>Supplies running low · ${lowSupplies.length}</div>
          <button class="card-link" onclick="event.stopPropagation();go('supplies')">View all →</button>
        </div>
        <div style="max-height:260px;overflow-y:auto">
          ${lowSupplies.map(s=>{
            const st=supplyStockStatus(s);
            const emoji=st.label==='Out'?'🚨':'⚠️';
            const badgeCls=st.label==='Out'?'b-red':'b-amber';
            return`<div style="display:flex;align-items:center;gap:10px;padding:8px 18px;border-bottom:1px solid var(--border);font-size:13px">
              <span style="font-size:14px">${emoji}</span>
              <div style="flex:1;min-width:0">
                <div style="font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${s.name}</div>
                <div style="font-size:11px;color:var(--text3)">${Number(s.current_stock)||0} on hand · reorder at ${Number(s.reorder_level)||0}</div>
              </div>
              <span class="badge ${badgeCls}" style="font-size:10px">${st.label}</span>
              <button class="btn btn-sm" onclick="editSupply('${s.id}')">Update</button>
            </div>`;
          }).join('')}
        </div>
      </div>`;
    }
  }

  const wr=document.getElementById('d-wo-rows');
  if(wr)wr.innerHTML=workOrders.slice(0,5).length
    ?workOrders.slice(0,5).map(w=>`<tr onclick="openWODetail('${w.id}')" style="cursor:pointer"><td style="font-weight:bold">${w.issue}</td><td>${w.building}</td><td>${sb(w.status)}</td></tr>`).join('')
    :'<tr><td colspan="3" class="loading">No work orders yet</td></tr>';

  const pr=document.getElementById('d-pm-rows');
  if(pr){
    const upcoming=pmTasks.filter(p=>p.status!=='Done').slice(0,4);
    pr.innerHTML=upcoming.length
      ?upcoming.map(p=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 18px;border-bottom:1px solid var(--border);font-size:13px">
        <span style="font-size:16px">🔧</span>
        <div style="flex:1;min-width:0"><div style="font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.title}</div><div style="font-size:11px;color:var(--text3)">${p.next_due||'No date'} · ${p.assigned_to||'Unassigned'}</div></div>
        ${sb(p.status)}</div>`).join('')
      :'<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">No upcoming PM tasks</div>';
  }

  const gc=document.getElementById('d-gcal-rows');
  if(gc){
    const configured=appSettings.gcal_api_key&&appSettings.gcal_calendar_id;
    if(!configured){
      gc.innerHTML='<div style="padding:16px 18px;color:var(--text3);font-size:13px">Not configured. Go to <a onclick="go(\'settings\')" style="color:var(--accent);cursor:pointer">Settings</a> to connect a Google Calendar.</div>';
    }else if(!gcalEvents.length){
      gc.innerHTML='<div style="padding:16px 18px;color:var(--text3);font-size:13px">No upcoming events in the next 90 days.</div>';
    }else{
      gc.innerHTML=gcalEvents.slice(0,6).map(e=>`<div style="display:flex;align-items:center;gap:10px;padding:9px 18px;border-bottom:1px solid var(--border);font-size:13px">
        <span style="font-size:16px">📅</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${e.title}</div>
          <div style="font-size:11px;color:var(--text3)">${fmtEventWhen(e)}${e.location?' · '+e.location:''}</div>
        </div>
      </div>`).join('');
    }
  }

  const aa=document.getElementById('d-asset-alerts');
  const attnA=assets.filter(a=>a.status==='Maintenance');
  if(aa)aa.innerHTML=attnA.length
    ?attnA.slice(0,5).map(a=>{
      const pic=firstPhoto(a);
      return`<div style="display:flex;align-items:center;gap:10px;padding:9px 18px;border-bottom:1px solid var(--border);font-size:13px">
      ${pic?`<img src="${pic}" style="width:32px;height:32px;border-radius:6px;object-fit:cover;cursor:pointer" onclick="openLightbox('${pic}')">`:`<span style="font-size:17px">${catIcon[a.category]||'📦'}</span>`}
      <div style="flex:1;min-width:0"><div style="font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${a.description}</div><div style="font-size:11px;color:var(--text3)">${a.room_number||a.location} · ${a.building}</div></div>
      ${sb(a.status)}</div>`;
    }).join('')
    :'<div style="text-align:center;padding:20px;color:var(--text3);font-size:13px">All assets operational ✓</div>';
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
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  document.getElementById('view-building-detail').classList.add('active');
  renderBuildingHeader();
  renderBuildingUtilities();
  renderRooms();
}

function editCurrentBuilding(){
  const b=buildings.find(x=>x.id===currentBuildingId);
  if(b)openBuildingModal(b);
}

function renderBuildingHeader(){
  const b=buildings.find(x=>x.id===currentBuildingId);
  if(!b)return;
  const photos=allPhotos(b);
  const photoEl=document.getElementById('bld-photo-area');
  if(photoEl){
    photoEl.innerHTML=photos.length
      ?`<div class="photo-gallery">${photos.map(u=>`<div class="photo-thumb" style="width:140px;height:140px"><img src="${u}" onclick="openLightbox('${u}')"></div>`).join('')}</div>`
      :'';
  }

  const addrLine=[b.address,[b.city,b.state,b.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  const infoEl=document.getElementById('bld-info-area');
  if(infoEl){
    const spec=[
      b.year_built?`Built ${b.year_built}`:null,
      b.square_footage?`${Number(b.square_footage).toLocaleString()} sq ft`:null,
      b.floors?b.floors:null,
    ].filter(Boolean).join(' · ');
    infoEl.innerHTML=`<div class="card"><div style="padding:14px 18px">
      ${b.description?`<div style="font-size:13px;color:var(--text2);margin-bottom:10px">${b.description}</div>`:''}
      ${addrLine?`<div style="font-size:13px;color:var(--text2)">📍 ${addrLine}</div>`:''}
      ${spec?`<div style="font-size:13px;color:var(--text3);margin-top:4px">🏛️ ${spec}</div>`:''}
      ${b.emergency_contact_name||b.emergency_contact_phone?`<div style="font-size:13px;color:var(--text2);margin-top:8px">🚨 <strong>Emergency:</strong> ${b.emergency_contact_name||''}${b.emergency_contact_phone?' · '+b.emergency_contact_phone:''}</div>`:''}
      ${b.key_systems?`<div style="margin-top:10px;padding:10px 12px;background:var(--bg3);border-radius:6px;font-size:12px;color:var(--text2);white-space:pre-wrap">🔧 ${b.key_systems}</div>`:''}
    </div></div>`;
  }
}

// ---- BUILDING UTILITIES ----
let _utilChart=null;
let _utilTab='All'; // 'All' | 'Electric' | 'Water' | 'Gas'

function renderBuildingUtilities(){
  const b=buildings.find(x=>x.id===currentBuildingId);
  const el=document.getElementById('bld-utilities-area');
  if(!b||!el)return;
  const tracked=buildingTrackedUtilities(b);
  // If the building isn't tracking any utilities, show a gentle prompt instead of an empty card.
  if(!tracked.length){
    el.innerHTML=`<div class="card"><div class="card-header"><div class="card-title">Utilities</div><button class="btn btn-sm" onclick="editCurrentBuilding()">Configure</button></div>
      <div style="padding:14px 18px;color:var(--text3);font-size:13px">No utilities configured for this building. Click <strong>Configure</strong> to pick which ones to track.</div>
    </div>`;
    return;
  }
  // Reset tab if the previously-selected one is no longer tracked
  if(_utilTab!=='All'&&!tracked.includes(_utilTab))_utilTab='All';
  const tabs=['All',...tracked];
  el.innerHTML=`<div class="card">
    <div class="card-header">
      <div class="card-title">Utilities</div>
      <div style="display:flex;gap:4px;flex-wrap:wrap">
        ${tabs.map(t=>`<button class="btn btn-sm ${_utilTab===t?'btn-primary':''}" onclick="setUtilityTab('${t}')">${t}</button>`).join('')}
        <button class="btn btn-primary btn-sm" style="margin-left:6px" onclick="openUtilityModal()">+ Add Reading</button>
      </div>
    </div>
    <div style="padding:10px 18px">
      <div style="height:200px;position:relative"><canvas id="util-chart"></canvas></div>
    </div>
    <div id="util-table"></div>
  </div>`;
  renderUtilityChart();
  renderUtilityTable();
}

function setUtilityTab(t){_utilTab=t;renderBuildingUtilities();}

function renderUtilityChart(){
  const canvas=document.getElementById('util-chart');
  if(!canvas)return;
  if(_utilChart){_utilChart.destroy();_utilChart=null;}
  const b=buildings.find(x=>x.id===currentBuildingId);
  const tracked=buildingTrackedUtilities(b);
  const readings=utilityReadings.filter(u=>u.building_id===currentBuildingId&&(_utilTab==='All'?tracked.includes(u.utility_type):u.utility_type===_utilTab));
  if(!readings.length){
    canvas.getContext('2d').clearRect(0,0,canvas.width,canvas.height);
    return;
  }
  // Bucket by month of period_end
  const bucket={}; // key = YYYY-MM-utility
  readings.forEach(r=>{
    const d=parseDate(r.period_end||r.period_start);
    if(!d)return;
    const k=`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const sub=bucket[k]||(bucket[k]={});
    sub[r.utility_type]=(sub[r.utility_type]||0)+(Number(r.cost)||0);
  });
  const months=Object.keys(bucket).sort();
  const types=_utilTab==='All'?tracked:[_utilTab];
  const palette={Electric:'#2d5a8e',Water:'#1a4a8a',Gas:'#8a4400',Sewer:'#666',Propane:'#8a6200',Trash:'#5c5c58',Internet:'#2d7a4a'};
  const datasets=types.map(t=>({
    label:t+' ($)',
    data:months.map(m=>(bucket[m]||{})[t]||0),
    backgroundColor:palette[t]||'#5c5c58',
  }));
  _utilChart=new Chart(canvas.getContext('2d'),{
    type:'bar',
    data:{labels:months,datasets},
    options:{
      responsive:true,maintainAspectRatio:false,
      plugins:{legend:{position:'bottom',labels:{font:{family:'sans-serif',size:11}}},
        tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`}}},
      scales:{
        x:{stacked:_utilTab==='All',ticks:{font:{family:'sans-serif',size:10}}},
        y:{stacked:_utilTab==='All',beginAtZero:true,ticks:{font:{family:'sans-serif',size:10},callback:v=>'$'+Number(v).toLocaleString()}},
      },
    },
  });
}

function renderUtilityTable(){
  const el=document.getElementById('util-table');
  if(!el)return;
  const b=buildings.find(x=>x.id===currentBuildingId);
  const tracked=buildingTrackedUtilities(b);
  const readings=utilityReadings.filter(u=>u.building_id===currentBuildingId&&(_utilTab==='All'?tracked.includes(u.utility_type):u.utility_type===_utilTab))
    .sort((a,b)=>{const da=parseDate(a.period_end),db=parseDate(b.period_end);return(db||0)-(da||0);});
  if(!readings.length){el.innerHTML='<div style="padding:14px 18px;color:var(--text3);font-size:13px">No readings logged yet.</div>';return;}
  el.innerHTML=`<div class="table-wrap"><table class="table">
    <colgroup><col style="width:10%"><col style="width:15%"><col style="width:13%"><col style="width:12%"><col style="width:14%"><col style="width:13%"><col style="width:8%"><col style="width:15%"></colgroup>
    <thead><tr><th>Type</th><th>Period</th><th>Usage</th><th>Cost</th><th>Provider</th><th>Account</th><th>Bill</th><th>Actions</th></tr></thead>
    <tbody>${readings.slice(0,24).map(r=>{
      const pdfs=Array.isArray(r.pdf_urls)?r.pdf_urls:[];
      const pdfCell=pdfs.length
        ?pdfs.map((u,i)=>`<a href="${u}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;margin-right:6px" title="Open bill PDF">📄${pdfs.length>1?' '+(i+1):''}</a>`).join('')
        :'<span style="color:var(--text3)">—</span>';
      return`<tr>
      <td>${r.utility_type}</td>
      <td style="font-size:12px">${r.period_start||'—'} → ${r.period_end||'—'}</td>
      <td>${r.usage?Number(r.usage).toLocaleString()+' '+(r.usage_unit||''):'—'}</td>
      <td style="font-weight:bold">${r.cost?fmt(r.cost):'—'}</td>
      <td style="font-size:12px">${r.provider||'—'}</td>
      <td style="font-size:12px;color:var(--text3)">${r.account_number||'—'}</td>
      <td style="font-size:12px">${pdfCell}</td>
      <td style="white-space:nowrap">
        <button class="btn btn-edit btn-sm" onclick="editUtility('${r.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteUtility('${r.id}')">Del</button>
      </td>
    </tr>`;}).join('')}</tbody>
  </table></div>`;
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
    <div style="grid-column:1/-1;font-size:11px;font-weight:bold;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-top:8px;margin-bottom:4px">${floor}</div>
    ${roomList.map(r=>{
      const aCount=assets.filter(a=>a.room_id===r.id).length;
      const wCount=workOrders.filter(w=>w.room_id===r.id&&w.status!=='Completed').length;
      const metaBits=[
        r.capacity?`👥 ${r.capacity}`:null,
        r.square_footage?`📐 ${Number(r.square_footage).toLocaleString()} sq ft`:null,
      ].filter(Boolean);
      const pic=firstPhoto(r);
      const header=pic
        ?`<div class="room-card-photo" style="background-image:url('${pic}')"></div>`
        :`<div class="room-card-icon">${roomTypeIcon(r.room_type)}</div>`;
      return`<div class="room-card" onclick="openRoom('${r.id}')">
        ${header}
        <div class="room-card-body">
          <div class="room-card-header">
            <div class="room-card-title">${r.name}</div>
            ${r.room_number?`<div class="room-card-num">${r.room_number}</div>`:''}
          </div>
          ${r.room_type?`<div class="room-card-type">${roomTypeIcon(r.room_type)} ${r.room_type}</div>`:''}
          ${metaBits.length?`<div class="room-card-meta">${metaBits.join('<span style="color:var(--border)">·</span>')}</div>`:''}
          ${r.notes?`<div class="room-card-note">${r.notes}</div>`:''}
          <div class="room-card-badges">
            ${aCount?`<span class="badge b-blue" style="font-size:10px">${aCount} asset${aCount>1?'s':''}</span>`:''}
            ${wCount?`<span class="badge b-amber" style="font-size:10px">${wCount} open WO</span>`:''}
          </div>
          <div class="room-card-actions">
            <button class="btn btn-edit btn-sm" style="font-size:10px;padding:3px 8px" onclick="event.stopPropagation();editRoom('${r.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" style="font-size:10px;padding:3px 8px" onclick="event.stopPropagation();confirmDeleteRoom('${r.id}','${r.name.replace(/'/g,"\\'")}')">Del</button>
          </div>
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
  document.getElementById('room-detail-title').textContent=r.name+(r.room_number?` · ${r.room_number}`:'');
  const metaParts=[
    r.floor||null,
    r.room_type||null,
    r.capacity?`Capacity ${r.capacity}`:null,
    r.square_footage?`${Number(r.square_footage).toLocaleString()} sq ft`:null,
    r.notes||null,
  ].filter(Boolean);
  document.getElementById('room-detail-meta').textContent=metaParts.join(' · ');
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
    ?roomWOs.map(w=>`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:8px;cursor:pointer" onclick="openWODetail('${w.id}')">
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
  // Force the user to pick a building before adding an asset, so every new
  // asset is born tied to a building (no "which one was that for?" later).
  const addBtn=document.querySelector('#view-assets .topbar-actions .btn-primary');
  if(addBtn)addBtn.style.display=fb==='all'?'none':'';
  const filtered=assets.filter(a=>{
    const m=!q||(a.description||'').toLowerCase().includes(q)||(a.serial||'').toLowerCase().includes(q)||(a.location||'').toLowerCase().includes(q)||(a.manufacturer||'').toLowerCase().includes(q)||(a.room_number||'').toLowerCase().includes(q);
    return m&&(fb==='all'||a.building===fb)&&(fc==='all'||a.category===fc)&&(fs==='all'||a.status===fs);
  });
  const el=document.getElementById('asset-list');
  if(!el)return;
  if(!filtered.length){el.innerHTML='<div class="empty-state"><p>No assets match.</p>'+(fb==='all'?'<small>Pick a building filter above to enable + Add Asset.</small>':'')+'</div>';return;}
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

// ---- ASSET SERVICE RECORD ----
// Read-only block shown in the Asset edit modal: PMs covering this asset,
// completed WOs that serviced it, and vendor invoices tied to it.
function renderAssetServiceRecord(assetId){
  if(!assetId)return'';
  const pms=pmTasks.filter(p=>Array.isArray(p.asset_ids)&&p.asset_ids.includes(assetId))
    .sort((a,b)=>((parseDate(b.next_due)||new Date(0))-(parseDate(a.next_due)||new Date(0))));
  const wos=workOrders.filter(w=>Array.isArray(w.asset_ids)&&w.asset_ids.includes(assetId))
    .sort((a,b)=>((parseDate(b.completed_date)||parseDate(b.created_at)||new Date(0))-(parseDate(a.completed_date)||parseDate(a.created_at)||new Date(0))));
  const invs=invoices.filter(i=>Array.isArray(i.asset_ids)&&i.asset_ids.includes(assetId))
    .sort((a,b)=>((parseDate(b.date)||new Date(0))-(parseDate(a.date)||new Date(0))));

  if(!pms.length&&!wos.length&&!invs.length){
    return`<div style="margin-top:12px;padding:12px 14px;background:var(--bg3);border-radius:8px;font-size:12px;color:var(--text3)">
      No PMs, work orders, or invoices linked to this asset yet.
    </div>`;
  }

  const pmRow=p=>`<div style="font-size:12px;padding:4px 0;display:flex;gap:8px;align-items:baseline">
    <span>🔧</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:bold;color:var(--text)">${p.title}</div>
      <div style="color:var(--text3);font-size:11px">${p.frequency||''} · Next due: ${p.next_due||'—'}${p.last_completed?' · Last done: '+p.last_completed:''}</div>
    </div>
    ${sb(p.status||'Upcoming')}
  </div>`;
  const woRow=w=>`<div style="font-size:12px;padding:4px 0;display:flex;gap:8px;align-items:baseline">
    <span>🛠</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:bold;color:var(--text)">${w.issue}</div>
      <div style="color:var(--text3);font-size:11px">${w.completed_date?'Completed '+w.completed_date:'Status: '+(w.status||'Open')}${w.assignee?' · '+w.assignee:''}</div>
    </div>
    ${sb(w.status||'Open')}
  </div>`;
  const invRow=i=>`<div style="font-size:12px;padding:4px 0;display:flex;gap:8px;align-items:baseline">
    <span>💵</span>
    <div style="flex:1;min-width:0">
      <div style="font-weight:bold;color:var(--text)">${i.vendor||'—'}${i.invoice_number?' #'+i.invoice_number:''}</div>
      <div style="color:var(--text3);font-size:11px">${i.date||'—'}${i.description?' · '+i.description:''}</div>
    </div>
    <div style="font-weight:bold;font-size:12px">${fmt(i.amount)}</div>
  </div>`;

  const section=(title,rows,emptyMsg)=>`
    <div style="margin-top:10px">
      <div style="font-size:11px;font-weight:bold;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">${title}${rows.length?` · ${rows.length}`:''}</div>
      ${rows.length?rows:`<div style="font-size:11px;color:var(--text3);padding:2px 0">${emptyMsg}</div>`}
    </div>`;

  return`<div style="margin-top:16px;padding:14px;background:var(--bg3);border-radius:8px">
    <div style="font-size:13px;font-weight:bold;color:var(--accent2);margin-bottom:4px">Service Record</div>
    ${section('Preventive maintenance',pms.map(pmRow),'No PMs cover this asset yet.')}
    ${section('Work orders',wos.slice(0,10).map(woRow),'No work orders have touched this asset yet.')}
    ${section('Invoices',invs.slice(0,10).map(invRow),'No invoices reference this asset yet.')}
  </div>`;
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
        <button class="btn btn-edit btn-sm" style="margin-left:4px" onclick="editWO('${w.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" style="margin-left:4px" onclick="confirmDeleteWO('${w.id}')">Del</button>
      </td></tr>`).join('')
    :'<tr><td colspan="8" class="loading">No work orders match this filter</td></tr>';
}

// ---- RENDER PM ----
function renderPM(){
  const el=document.getElementById('pm-list');
  if(!el)return;

  renderPMStats();
  renderPMConflicts();
  renderPMControls();

  // Populate Building filter from actual data
  const blds=[...new Set(pmTasks.map(p=>p.building).filter(Boolean))].sort();
  syncDropdown('pm-f-bld',blds,'All buildings');

  const fs=document.getElementById('pm-f-status')?.value||'all';
  const fb=document.getElementById('pm-f-bld')?.value||'all';
  const sort=document.getElementById('pm-sort')?.value||(pmMode==='history'?'last-desc':'due-asc');
  const q=(document.getElementById('pm-search')?.value||'').toLowerCase();

  const now=new Date();now.setHours(0,0,0,0);
  const in30=new Date(now.getTime()+30*24*60*60*1000);
  const monthStart=new Date(now.getFullYear(),now.getMonth(),1);
  const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59);
  const qStart=new Date(now.getFullYear(),Math.floor(now.getMonth()/3)*3,1);
  const qEnd=new Date(qStart.getFullYear(),qStart.getMonth()+3,0,23,59,59);
  const yStart=new Date(pmYear,0,1);
  const yEnd=new Date(pmYear,11,31,23,59,59);

  let filtered=pmTasks.filter(p=>{
    // Mode: upcoming (active) vs history (completed)
    if(pmMode==='upcoming'&&p.status==='Done')return false;
    if(pmMode==='history'&&p.status!=='Done')return false;

    if(fs!=='all'&&p.status!==fs)return false;
    if(fb!=='all'&&p.building!==fb)return false;
    if(q){
      const hay=[p.title,p.building,p.assigned_to,p.description,p.frequency,p.status,p.next_due,p.last_completed].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }

    // Time window
    if(pmMode==='upcoming'){
      if(pmWindow==='current'){
        // Overdue + anything due within 30 days + no date set (still actionable)
        const due=parseDate(p.next_due);
        if(!due)return true; // undated but active → keep visible
        return due<=in30;
      }
      if(pmWindow==='month'){
        const due=parseDate(p.next_due);
        return due&&due>=monthStart&&due<=monthEnd;
      }
      if(pmWindow==='quarter'){
        const due=parseDate(p.next_due);
        return due&&due>=qStart&&due<=qEnd;
      }
      if(pmWindow==='year'){
        const due=parseDate(p.next_due);
        return due&&due>=yStart&&due<=yEnd;
      }
      // 'all' — no time filter
      return true;
    }
    // History mode
    if(pmWindow==='year'){
      const done=parseDate(p.last_completed);
      return done&&done>=yStart&&done<=yEnd;
    }
    // 'all-done' — no time filter
    return true;
  });

  // Sort
  const FAR=new Date(9999,0);
  const NEAR=new Date(0);
  const statusOrder={Overdue:0,Upcoming:1,Done:2};
  const byTitle=(a,b)=>(a.title||'').localeCompare(b.title||'');
  const cmps={
    'due-asc':(a,b)=>((parseDate(a.next_due)||FAR)-(parseDate(b.next_due)||FAR))||byTitle(a,b),
    'due-desc':(a,b)=>((parseDate(b.next_due)||NEAR)-(parseDate(a.next_due)||NEAR))||byTitle(a,b),
    'last-desc':(a,b)=>((parseDate(b.last_completed)||NEAR)-(parseDate(a.last_completed)||NEAR))||byTitle(a,b),
    'last-asc':(a,b)=>((parseDate(a.last_completed)||FAR)-(parseDate(b.last_completed)||FAR))||byTitle(a,b),
    'title':byTitle,
    'building':(a,b)=>(a.building||'').localeCompare(b.building||'')||byTitle(a,b),
    'assigned':(a,b)=>(a.assigned_to||'').localeCompare(b.assigned_to||'')||byTitle(a,b),
    'status':(a,b)=>((statusOrder[a.status]??9)-(statusOrder[b.status]??9))||byTitle(a,b),
  };
  filtered.sort(cmps[sort]||cmps[pmMode==='history'?'last-desc':'due-asc']);

  if(!filtered.length){
    const hint=pmMode==='upcoming'
      ?'No upcoming PM tasks match these filters. Try widening the time window.'
      :'No completed PM tasks match these filters.';
    el.innerHTML=pmTasks.length
      ?`<div class="empty-state"><p>${hint}</p></div>`
      :'<div class="empty-state"><p>No PM tasks yet.</p></div>';
    return;
  }

  el.innerHTML=filtered.map(pmCardHTML).join('');
}

function pmCardHTML(p){
  // Prefer scheduled_date for conflict checks if one is set
  const schedDate=parseDate(p.scheduled_date);
  const due=schedDate||parseDate(p.next_due);
  const conflicts=due?eventsOnDate(due):[];
  const assetIds=Array.isArray(p.asset_ids)?p.asset_ids:[];
  const linkedAssets=assetIds.map(id=>assets.find(a=>a.id===id)).filter(Boolean);
  const isScheduled=!!p.scheduled_date&&p.status!=='Done';
  const schedWith=[p.scheduled_with,p.scheduled_contact_person].filter(Boolean).join(' — ');
  const schedLine=isScheduled
    ?`<div class="pm-scheduled">📅 Scheduled ${p.scheduled_date}${p.scheduled_time?' at '+p.scheduled_time:''}${schedWith?' · '+schedWith:''}</div>`
    :'';
  return`<div class="pm-card${isScheduled?' pm-card-scheduled':''}">
    <div style="width:38px;height:38px;border-radius:8px;background:var(--warning-bg);display:flex;align-items:center;justify-content:center;font-size:17px;flex-shrink:0">🔧</div>
    <div class="pm-info">
      <div class="pm-title">${p.title}</div>
      <div class="pm-meta">${p.building} · ${p.frequency} · ${p.assigned_to||'Unassigned'}</div>
      <div class="pm-meta">Next due: <strong>${p.next_due||'Not set'}</strong>${p.last_completed?' · Last done: '+p.last_completed:''}</div>
      ${schedLine}
      ${p.description?`<div style="font-size:12px;color:var(--text3);margin-top:3px">${p.description}</div>`:''}
      ${linkedAssets.length?`<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${linkedAssets.slice(0,6).map(a=>`<span class="badge b-blue" style="font-size:10px">${catIcon[a.category]||'📦'} ${a.description}</span>`).join('')}${linkedAssets.length>6?`<span class="badge b-gray" style="font-size:10px">+${linkedAssets.length-6} more</span>`:''}</div>`:''}
      ${conflicts.length?`<div class="pm-conflict">⚠️ Parish event that day: ${conflicts.map(e=>e.title).join(', ')}</div>`:''}
    </div>
    <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end;flex-shrink:0">
      ${sb(p.status)}
      ${p.status!=='Done'?`<button class="btn btn-sm" style="background:var(--info-bg);color:var(--info);border-color:#c0d8f0" onclick="openPMScheduleModal('${p.id}')">📅 ${isScheduled?'Reschedule':'Schedule'}</button>`:''}
      ${p.status!=='Done'?`<button class="btn btn-success btn-sm" onclick="markPMDone('${p.id}')">✓ Done</button>`:''}
      <button class="btn btn-edit btn-sm" onclick="editPM('${p.id}')">Edit</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDeletePM('${p.id}')">Del</button>
    </div>
  </div>`;
}

function setPMMode(m){
  pmMode=m;
  // Default to a sensible window for each mode
  if(m==='upcoming'&&!['current','month','quarter','year','all'].includes(pmWindow))pmWindow='current';
  if(m==='history'&&!['all-done','year'].includes(pmWindow))pmWindow='year';
  renderPM();
}
function setPMWindow(w){pmWindow=w;renderPM();}
function setPMYear(y){pmYear=Number(y)||new Date().getFullYear();renderPM();}

// Populates the mode buttons, window dropdown, and year dropdown based on current state.
function renderPMControls(){
  const upBtn=document.getElementById('pm-mode-upcoming');
  const hiBtn=document.getElementById('pm-mode-history');
  if(upBtn)upBtn.classList.toggle('btn-primary',pmMode==='upcoming');
  if(hiBtn)hiBtn.classList.toggle('btn-primary',pmMode==='history');

  const win=document.getElementById('pm-window');
  if(win){
    const opts=pmMode==='upcoming'
      ?[['current','Current (overdue + next 30 days)'],['month','This month'],['quarter','This quarter'],['year','Pick year'],['all','All upcoming']]
      :[['year','Pick year'],['all-done','All completed']];
    // If current window isn't valid for the mode, snap to first option
    const validKeys=opts.map(o=>o[0]);
    if(!validKeys.includes(pmWindow))pmWindow=validKeys[0];
    win.innerHTML=opts.map(([v,l])=>`<option value="${v}" ${pmWindow===v?'selected':''}>${l}</option>`).join('');
  }

  const yp=document.getElementById('pm-year-pick');
  if(yp){
    const showYear=pmWindow==='year';
    yp.style.display=showYear?'':'none';
    if(showYear){
      // Build year options from actual PM data + current +/- 2 years
      const fromData=pmTasks.flatMap(p=>[p.next_due,p.last_completed].map(parseDate).filter(Boolean).map(d=>d.getFullYear()));
      const thisYear=new Date().getFullYear();
      const yearSet=new Set([thisYear-2,thisYear-1,thisYear,thisYear+1,thisYear+2,...fromData,pmYear]);
      const years=[...yearSet].sort((a,b)=>b-a);
      yp.innerHTML=years.map(y=>`<option value="${y}" ${y===pmYear?'selected':''}>${y}</option>`).join('');
    }
  }
}

function renderPMStats(){
  const el=document.getElementById('pm-stats');
  if(!el)return;
  const now=new Date();now.setHours(0,0,0,0);
  const monthEnd=new Date(now.getFullYear(),now.getMonth()+1,0,23,59,59);
  const qStart=new Date(now.getFullYear(),Math.floor(now.getMonth()/3)*3,1);
  const qEnd=new Date(qStart.getFullYear(),qStart.getMonth()+3,0,23,59,59);
  const year=now.getFullYear();

  const active=pmTasks.filter(p=>p.status!=='Done');
  const overdue=active.filter(p=>{const d=parseDate(p.next_due);return d&&d<now;});
  const dueMonth=active.filter(p=>{const d=parseDate(p.next_due);return d&&d>=now&&d<=monthEnd;});
  const dueQuarter=active.filter(p=>{const d=parseDate(p.next_due);return d&&d>=qStart&&d<=qEnd;});
  const doneYTD=pmTasks.filter(p=>p.status==='Done'&&(()=>{const d=parseDate(p.last_completed);return d&&d.getFullYear()===year;})());

  el.innerHTML=`
    <div class="stat-card"><div class="stat-label">Overdue</div><div class="stat-value" style="color:var(--danger)">${overdue.length}</div><div class="stat-delta">past due date</div></div>
    <div class="stat-card"><div class="stat-label">Due This Month</div><div class="stat-value" style="color:var(--warning)">${dueMonth.length}</div><div class="stat-delta">${now.toLocaleDateString('en-US',{month:'long'})}</div></div>
    <div class="stat-card"><div class="stat-label">Due This Quarter</div><div class="stat-value" style="color:var(--accent)">${dueQuarter.length}</div><div class="stat-delta">Q${Math.floor(now.getMonth()/3)+1} ${year}</div></div>
    <div class="stat-card"><div class="stat-label">Completed YTD</div><div class="stat-value" style="color:var(--success)">${doneYTD.length}</div><div class="stat-delta">this year</div></div>
  `;
}

function renderPMConflicts(){
  const el=document.getElementById('pm-conflicts');
  if(!el)return;
  const activePMs=pmTasks.filter(p=>p.status!=='Done');
  const conflictRows=[];
  activePMs.forEach(p=>{
    const d=parseDate(p.next_due);
    if(!d)return;
    const evts=eventsOnDate(d);
    if(evts.length)conflictRows.push({pm:p,date:d,events:evts});
  });
  if(!conflictRows.length){el.innerHTML='';return;}
  conflictRows.sort((a,b)=>a.date-b.date);
  el.innerHTML=`<div class="card" style="margin-bottom:16px;border-left:4px solid var(--warning)">
    <div class="card-header"><div class="card-title">⚠️ Parish event conflicts · ${conflictRows.length}</div></div>
    <div>
      ${conflictRows.slice(0,8).map(r=>`<div style="display:flex;gap:10px;align-items:baseline;padding:8px 18px;border-bottom:1px solid var(--border);font-size:13px">
        <span style="font-weight:bold;color:var(--accent2);min-width:110px">${fmtDate(r.date)}</span>
        <div style="flex:1;min-width:0">
          <div style="font-weight:bold"><a onclick="editPM('${r.pm.id}')" style="color:inherit;cursor:pointer;text-decoration:underline">${r.pm.title}</a></div>
          <div style="font-size:11px;color:var(--text3)">Parish event that day: ${r.events.map(e=>e.title).join(', ')}</div>
        </div>
      </div>`).join('')}
      ${conflictRows.length>8?`<div style="padding:8px 18px;font-size:12px;color:var(--text3)">+${conflictRows.length-8} more conflicts…</div>`:''}
    </div>
  </div>`;
}

// ---- RENDER CONTACTS ----
function renderContacts(){
  const el=document.getElementById('contacts-list');
  if(!el)return;
  const typePlural={Contractor:'Contractors',Vendor:'Vendors',Staff:'Staff',Volunteer:'Volunteers'};
  const typeLabel=typePlural[currentContactType]||'Directory';
  const titleEl=document.getElementById('contacts-title');
  if(titleEl)titleEl.textContent=typeLabel;
  const btnEl=document.getElementById('contacts-add-btn');
  if(btnEl)btnEl.textContent='+ Add '+currentContactType;

  // Populate Role filter with every role scoped to the current contact type
  const scopedRoles=contactRoles.filter(r=>r.type_scope===currentContactType).map(r=>r.name).sort();
  syncDropdown('contacts-f-role',scopedRoles,'All roles');

  const fr=document.getElementById('contacts-f-role')?.value||'all';
  const q=(document.getElementById('contacts-search')?.value||'').toLowerCase();

  const filtered=contacts.filter(c=>{
    if(c.type!==currentContactType)return false;
    if(fr!=='all'){
      const cRoles=Array.isArray(c.roles)&&c.roles.length?c.roles:(c.role?[c.role]:[]);
      if(!cRoles.includes(fr))return false;
    }
    if(q){
      const rolesHay=(Array.isArray(c.roles)?c.roles:[]).join(' ');
      const phonesHay=[c.phone,c.phone_home,(Array.isArray(c.additional_phones)?c.additional_phones.map(p=>p.number+' '+(p.label||'')).join(' '):''),(Array.isArray(c.people)?c.people.map(p=>p.name+' '+(p.phone||'')+' '+(p.phone_office||'')).join(' '):'')].filter(Boolean).join(' ');
      const hay=[c.name,c.role,rolesHay,c.email,c.notes,c.address,c.city,c.state,phonesHay].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });
  if(!filtered.length){el.innerHTML=`<div class="empty-state"><p>No ${typeLabel.toLowerCase()} yet.</p><small>Click "+ Add ${currentContactType}" to add one.</small></div>`;return;}
  const now=new Date();
  el.innerHTML=`
    <div class="card" style="margin-bottom:16px">
      <div class="card-header"><div class="card-title">${typeLabel}</div></div>
      ${filtered.map(c=>{
        const coiExp=c.coi_expiry?new Date(c.coi_expiry):null;
        const coiExpired=coiExp&&coiExp<now;
        const coiSoon=coiExp&&!coiExpired&&coiExp<new Date(now.getTime()+60*24*60*60*1000);
        const addrParts=[c.address,c.city,c.state,c.zip].filter(Boolean);
        const addrLine=addrParts.length?(c.address?c.address+', ':'')+[c.city,c.state,c.zip].filter(Boolean).join(' '):'';
        const isContractor=c.type==='Contractor';
        const isVendor=c.type==='Vendor';
        const websiteHref=c.website?(c.website.match(/^https?:\/\//i)?c.website:'https://'+c.website):'';
        const websiteLabel=c.website?c.website.replace(/^https?:\/\//i,''):'';
        const people=Array.isArray(c.people)?c.people:[];
        return`<div style="display:flex;align-items:flex-start;gap:14px;padding:14px 18px;border-bottom:1px solid var(--border)">
          <div style="width:40px;height:40px;border-radius:50%;background:var(--info-bg);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;color:var(--info);flex-shrink:0">${(c.name||'?').substring(0,2).toUpperCase()}</div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:bold;font-size:14px;color:var(--accent2)">${c.name}</div>
            ${(()=>{const rs=Array.isArray(c.roles)&&c.roles.length?c.roles:(c.role?[c.role]:[]);return rs.length?`<div style="margin-top:3px;display:flex;gap:3px;flex-wrap:wrap">${rs.map(r=>`<span class="badge b-blue" style="font-size:10px">${r}</span>`).join('')}</div>`:'';})()}
            ${c.email?`<div style="font-size:12px;color:var(--text3);margin-top:2px">${c.email}</div>`:''}
            ${(()=>{
              const phones=[];
              const isOrg=c.type==='Contractor'||c.type==='Vendor';
              if(c.phone)phones.push((isOrg?'📞':'📱')+' '+c.phone);
              if(!isOrg){
                const extras=Array.isArray(c.additional_phones)?c.additional_phones:[];
                extras.forEach(p=>{if(p.number)phones.push('📞 '+(p.label?p.label+': ':'')+p.number);});
              }
              return phones.length?`<div style="font-size:12px;color:var(--text3);margin-top:2px">${phones.join(' · ')}</div>`:'';
            })()}
            ${addrLine?`<div style="font-size:12px;color:var(--text3);margin-top:2px">📍 ${addrLine}</div>`:''}
            ${c.website?`<div style="font-size:12px;margin-top:2px">🌐 <a href="${websiteHref}" target="_blank" style="color:var(--accent)">${websiteLabel}</a></div>`:''}
            ${c.notes?`<div style="font-size:12px;color:var(--text3);margin-top:2px">${c.notes}</div>`:''}
            ${(isContractor||isVendor)?`<div style="margin-top:8px;padding:8px 10px;background:var(--bg3);border-radius:6px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
                <div style="font-size:10px;font-weight:bold;text-transform:uppercase;color:var(--text3);letter-spacing:.08em">Points of Contact${people.length?` · ${people.length}`:''}</div>
                <button class="btn btn-sm" style="font-size:10px;padding:2px 8px" onclick="openAddPersonModal('${c.id}')">+ Add Contact</button>
              </div>
              ${people.length?people.map((p,i)=>{
                const phoneBits=[];
                if(p.phone)phoneBits.push('📱 '+p.phone);
                if(p.phone_office){const ext=p.phone_office_ext?' x'+p.phone_office_ext:'';phoneBits.push('📞 '+p.phone_office+ext);}
                const phonesStr=phoneBits.length?' · '+phoneBits.join(' · '):'';
                return`<div style="font-size:12px;color:var(--text2);padding:4px 0;display:flex;gap:8px;align-items:flex-start">
                <div style="flex:1;min-width:0">
                  <strong>${p.name||'—'}</strong>${p.title?` — ${p.title}`:''}${phonesStr}${p.email?` · ✉ <a href="mailto:${p.email}" style="color:var(--accent)">${p.email}</a>`:''}
                  ${p.notes?`<div style="font-size:11px;color:var(--text3);margin-left:8px">${p.notes}</div>`:''}
                </div>
                <div style="display:flex;gap:4px;flex-shrink:0">
                  <button class="btn btn-edit btn-sm" style="font-size:10px;padding:2px 8px" onclick="openPersonModal('${c.id}',${i})">Edit</button>
                  <button class="btn btn-danger btn-sm" style="font-size:10px;padding:2px 8px" onclick="confirmDeletePerson('${c.id}',${i})">Del</button>
                </div>
              </div>`;}).join(''):'<div style="font-size:11px;color:var(--text3);font-style:italic;padding:2px 0">No points of contact yet.</div>'}
            </div>`:''}
            ${isContractor?(c.coi_expiry?`<div style="margin-top:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span class="badge ${coiExpired?'b-red':coiSoon?'b-amber':'b-green'}" style="font-size:11px">
                ${coiExpired?'🚨 COI EXPIRED':'⚡ COI'}: ${c.coi_expiry}
              </span>
              ${c.coi_insurer?`<span style="font-size:11px;color:var(--text3)">${c.coi_insurer}</span>`:''}
              ${c.coi_url?`<a href="${coiUrl(c)}" target="_blank" style="font-size:11px;color:var(--accent)">📄 View COI</a>`:''}
              <button class="btn btn-sm" style="font-size:10px;padding:2px 8px" onclick="openCOIModal('${c.id}')">Update</button>
            </div>`:`<div style="margin-top:4px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">
              <span style="font-size:11px;color:var(--text3)">No COI on file</span>
              <button class="btn btn-primary btn-sm" style="font-size:10px;padding:2px 8px" onclick="openCOIModal('${c.id}')">+ Add COI</button>
            </div>`):''}
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
  // Populate filter dropdowns dynamically from the invoice dataset
  const years=[...new Set(invoices.map(i=>{const d=parseDate(i.date);return d?d.getFullYear():null;}).filter(Boolean))].sort((a,b)=>b-a);
  const blds=[...new Set(invoices.map(i=>i.building).filter(Boolean))].sort();
  syncDropdown('inv-f-year',years,'All years');
  syncDropdown('inv-f-bld',blds,'All buildings');

  const fv=document.getElementById('inv-f-vendor')?.value||'all';
  const fy=document.getElementById('inv-f-year')?.value||'all';
  const fb=document.getElementById('inv-f-bld')?.value||'all';

  const f=invoices.filter(i=>{
    if(fv!=='all'&&i.vendor!==fv)return false;
    if(fb!=='all'&&i.building!==fb)return false;
    if(fy!=='all'){
      const d=parseDate(i.date);
      if(!d||String(d.getFullYear())!==fy)return false;
    }
    return true;
  });

  const total=f.reduce((a,i)=>a+Number(i.amount||0),0);
  // "This Year" shows the selected year when one is picked, else the current calendar year
  const displayYear=fy==='all'?new Date().getFullYear():Number(fy);
  const yTotal=f.filter(i=>{const d=parseDate(i.date);return d&&d.getFullYear()===displayYear;}).reduce((a,i)=>a+Number(i.amount||0),0);
  const ti=document.getElementById('inv-total');if(ti)ti.textContent=fmt(total);
  const iy=document.getElementById('inv-year');if(iy)iy.textContent=fmt(yTotal);
  const iyl=document.getElementById('inv-year-label');if(iyl)iyl.textContent=String(displayYear);
  const iysl=document.getElementById('inv-year-stat-label');if(iysl)iysl.textContent=fy==='all'?'This Year':`Year Total`;
  const itl=document.getElementById('inv-total-label');if(itl){
    const parts=[];
    if(fy!=='all')parts.push(fy);
    if(fb!=='all')parts.push(fb);
    if(fv!=='all')parts.push(fv);
    itl.textContent=parts.length?parts.join(' · '):'all matching';
  }
  const ic=document.getElementById('inv-count');if(ic)ic.textContent=f.length;
  const tb=document.getElementById('inv-table');
  if(tb)tb.innerHTML=f.length
    ?f.map(i=>{
      const aCount=i.asset_ids?.length||0;
      const wCount=i.work_order_ids?.length||0;
      const links=[aCount?`${aCount} asset${aCount>1?'s':''}`:null,wCount?`${wCount} WO${wCount>1?'s':''}`:null].filter(Boolean).join(' · ');
      const pdfs=allPDFs(i);
      const pdfBadge=pdfs.length
        ?(pdfs.length===1
          ?`<a href="${pdfs[0]}" target="_blank" onclick="event.stopPropagation()" title="View PDF" style="text-decoration:none">📄</a>`
          :`<span title="${pdfs.length} PDFs attached" style="color:var(--accent);font-size:11px;font-weight:bold">📄×${pdfs.length}</span>`)
        :'';
      return`<tr onclick="editInvoice('${i.id}')" style="cursor:pointer">
      <td style="font-size:11px;color:var(--text3)">${i.invoice_number||'—'}${pdfBadge?' '+pdfBadge:''}</td>
      <td style="font-size:11px;color:var(--text3)">${i.date||'—'}</td>
      <td style="font-weight:bold">${i.vendor}</td>
      <td>${i.description||''}${links?`<div style="font-size:11px;color:var(--text3);margin-top:2px">🔗 ${links}</div>`:''}</td>
      <td><span class="badge b-blue" style="font-size:10px">${i.building||''}</span></td>
      <td style="font-weight:bold">${fmt(i.amount)}</td>
      <td>${sb(i.status)}</td></tr>`;
    }).join('')
    :'<tr><td colspan="7" class="loading">No invoices yet</td></tr>';
}

// ---- RENDER PROJECTS ----
function renderProjects(){
  const el=document.getElementById('proj-list');
  const statsEl=document.getElementById('proj-stats');
  if(!el)return;

  // Populate filter dropdowns from data
  const years=[...new Set(projects.map(p=>p.target_year).filter(Boolean))].sort((a,b)=>a-b);
  const blds=[...new Set(projects.map(p=>p.building).filter(Boolean))].sort();
  syncDropdown('proj-f-year',years,'All years');
  syncDropdown('proj-f-bld',blds,'All buildings');

  const fs=document.getElementById('proj-f-status')?.value||'all';
  const fp=document.getElementById('proj-f-priority')?.value||'all';
  const fy=document.getElementById('proj-f-year')?.value||'all';
  const fb=document.getElementById('proj-f-bld')?.value||'all';
  const q=(document.getElementById('proj-search')?.value||'').toLowerCase();

  const filtered=projects.filter(p=>{
    if(fs!=='all'&&p.status!==fs)return false;
    if(fp!=='all'&&p.priority!==fp)return false;
    if(fy!=='all'&&String(p.target_year)!==fy)return false;
    if(fb!=='all'&&p.building!==fb)return false;
    if(q){
      const hay=[p.title,p.description,p.public_description,p.notes,p.funding_source,p.building].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });

  // Stats
  const activeStatuses=['Proposed','Approved','Funded','Scheduled'];
  const active=filtered.filter(p=>activeStatuses.includes(p.status));
  const activeTotal=active.reduce((a,p)=>a+(Number(p.estimated_cost)||0),0);
  const approvedFunded=filtered.filter(p=>p.status==='Approved'||p.status==='Funded'||p.status==='Scheduled');
  const approvedFundedTotal=approvedFunded.reduce((a,p)=>a+(Number(p.estimated_cost)||0),0);
  const completeTotal=filtered.filter(p=>p.status==='Complete').reduce((a,p)=>a+(Number(p.actual_cost)||p.estimated_cost||0),0);
  if(statsEl){
    statsEl.innerHTML=`
      <div class="stat-card"><div class="stat-label">Active Projects</div><div class="stat-value" style="color:var(--accent)">${active.length}</div><div class="stat-delta">Proposed + Approved + Funded + Scheduled</div></div>
      <div class="stat-card"><div class="stat-label">Active Total</div><div class="stat-value" style="color:var(--accent2)">${fmt(activeTotal)}</div><div class="stat-delta">estimated</div></div>
      <div class="stat-card"><div class="stat-label">Approved+ Pipeline</div><div class="stat-value" style="color:var(--warning)">${fmt(approvedFundedTotal)}</div><div class="stat-delta">committed / in progress</div></div>
      <div class="stat-card"><div class="stat-label">Completed Spend</div><div class="stat-value" style="color:var(--success)">${fmt(completeTotal)}</div><div class="stat-delta">actual where set, else estimate</div></div>
    `;
  }

  if(!filtered.length){
    el.innerHTML=projects.length?'<div class="empty-state"><p>No projects match these filters.</p></div>':'<div class="empty-state"><p>No projects yet. Click <strong>+ Add Project</strong> to start planning.</p></div>';
    return;
  }

  // Group by status for scannability
  const statusOrder=['Proposed','Approved','Funded','Scheduled','Complete','Declined'];
  const groups={};
  filtered.forEach(p=>{(groups[p.status]=groups[p.status]||[]).push(p);});
  el.innerHTML=statusOrder.filter(s=>groups[s]?.length).map(s=>{
    const groupTotal=groups[s].reduce((a,p)=>a+(Number(p.estimated_cost)||0),0);
    return`
      <div style="font-size:11px;font-weight:bold;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin:14px 0 6px;display:flex;justify-content:space-between">
        <span>${s} · ${groups[s].length}</span>
        <span style="color:var(--text2)">${fmt(groupTotal)}</span>
      </div>
      ${groups[s].map(projectCardHTML).join('')}
    `;
  }).join('');
}

function projectCardHTML(p){
  const prioColor={Critical:'b-red',High:'b-red',Medium:'b-amber',Low:'b-gray'}[p.priority]||'b-gray';
  const linked=[];
  if(p.asset_ids?.length)linked.push(`${p.asset_ids.length} asset${p.asset_ids.length>1?'s':''}`);
  if(p.quote_ids?.length)linked.push(`${p.quote_ids.length} quote${p.quote_ids.length>1?'s':''}`);
  if(p.work_order_ids?.length)linked.push(`${p.work_order_ids.length} WO${p.work_order_ids.length>1?'s':''}`);
  const canApprove=p.status==='Proposed';
  const canFund=p.status==='Approved';
  const canSchedule=p.status==='Funded';
  const canComplete=p.status==='Scheduled';
  const canCreateWO=['Approved','Funded','Scheduled'].includes(p.status);
  return`<div class="card" style="margin-bottom:10px">
    <div style="padding:14px 16px;display:flex;gap:14px;align-items:flex-start">
      <div style="font-size:24px;line-height:1;flex-shrink:0">🏗️</div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap">
          <div style="font-size:15px;font-weight:bold;color:var(--accent2)">${p.title}</div>
          <span class="badge ${prioColor}" style="font-size:10px">${p.priority||'Medium'}</span>
          ${sb(p.status||'Proposed')}
        </div>
        <div style="font-size:12px;color:var(--text3);margin-top:3px">${[p.building,p.target_year&&`Target ${p.target_year}`,p.funding_source].filter(Boolean).join(' · ')||'—'}</div>
        <div style="font-size:14px;font-weight:bold;margin-top:4px">${fmt(p.estimated_cost)}${p.actual_cost&&p.status==='Complete'?` <span style="font-size:12px;color:var(--text3)">· actual ${fmt(p.actual_cost)}</span>`:''}</div>
        ${p.description?`<div style="font-size:12px;color:var(--text2);margin-top:6px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">${p.description}</div>`:''}
        ${linked.length?`<div style="font-size:11px;color:var(--text3);margin-top:4px">🔗 ${linked.join(' · ')}</div>`:''}
      </div>
      <div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0;align-items:flex-end">
        ${canApprove?`<button class="btn btn-success btn-sm" onclick="openProjectApproveModal('${p.id}','Approved')">✓ Approve</button>`:''}
        ${canFund?`<button class="btn btn-sm" style="background:var(--warning-bg);color:var(--warning);border-color:#f0d060" onclick="openProjectApproveModal('${p.id}','Funded')">💰 Mark Funded</button>`:''}
        ${canSchedule?`<button class="btn btn-sm" style="background:var(--info-bg);color:var(--info);border-color:#a6c8e8" onclick="openProjectApproveModal('${p.id}','Scheduled')">📅 Mark Scheduled</button>`:''}
        ${canComplete?`<button class="btn btn-success btn-sm" onclick="openProjectApproveModal('${p.id}','Complete')">✓ Mark Complete</button>`:''}
        ${canCreateWO?`<button class="btn btn-sm" style="background:var(--accent);color:#fff;border-color:var(--accent)" onclick="createWOFromProject('${p.id}')">+ Work Order</button>`:''}
        <button class="btn btn-edit btn-sm" onclick="editProject('${p.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteProject('${p.id}','${(p.title||'').replace(/'/g,"\\'")}')">Del</button>
      </div>
    </div>
    <div style="padding:0 16px 12px">${metaFooter(p)}</div>
  </div>`;
}

// ---- RENDER VENDOR QUOTES ----
function renderQuotes(){
  // Populate filter dropdowns
  const years=[...new Set(quotes.map(q=>{const d=parseDate(q.date);return d?d.getFullYear():null;}).filter(Boolean))].sort((a,b)=>b-a);
  const blds=[...new Set(quotes.map(q=>q.building).filter(Boolean))].sort();
  const vendors=[...new Set(quotes.map(q=>q.vendor).filter(Boolean))].sort();
  syncDropdown('qt-f-year',years,'All years');
  syncDropdown('qt-f-bld',blds,'All buildings');
  syncDropdown('qt-f-vendor',vendors,'All vendors');

  const fs=document.getElementById('qt-f-status')?.value||'all';
  const fy=document.getElementById('qt-f-year')?.value||'all';
  const fb=document.getElementById('qt-f-bld')?.value||'all';
  const fv=document.getElementById('qt-f-vendor')?.value||'all';
  const q=(document.getElementById('qt-search')?.value||'').toLowerCase();

  const filtered=quotes.filter(qq=>{
    if(fs!=='all'&&qq.status!==fs)return false;
    if(fb!=='all'&&qq.building!==fb)return false;
    if(fv!=='all'&&qq.vendor!==fv)return false;
    if(fy!=='all'){
      const d=parseDate(qq.date);
      if(!d||String(d.getFullYear())!==fy)return false;
    }
    if(q){
      const hay=[qq.quote_number,qq.vendor,qq.description,qq.building,qq.notes].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });

  // Stats
  const pendingTotal=filtered.filter(qq=>qq.status==='Pending').reduce((a,qq)=>a+Number(qq.amount||0),0);
  const displayYear=fy==='all'?new Date().getFullYear():Number(fy);
  const acceptedTotal=filtered.filter(qq=>{
    if(qq.status!=='Accepted')return false;
    const d=parseDate(qq.date);
    return d&&d.getFullYear()===displayYear;
  }).reduce((a,qq)=>a+Number(qq.amount||0),0);

  const pEl=document.getElementById('qt-pending');if(pEl)pEl.textContent=fmt(pendingTotal);
  const aEl=document.getElementById('qt-accepted');if(aEl)aEl.textContent=fmt(acceptedTotal);
  const aLbl=document.getElementById('qt-accepted-label');if(aLbl)aLbl.textContent=`in ${displayYear}`;
  const cEl=document.getElementById('qt-count');if(cEl)cEl.textContent=filtered.length;

  // Table
  const tb=document.getElementById('qt-table');
  if(tb)tb.innerHTML=filtered.length?filtered.map(qq=>{
    const aCount=(qq.asset_ids||[]).length;
    const pdfs=allPDFs(qq);
    const pdfBadge=pdfs.length
      ?(pdfs.length===1
        ?`<a href="${pdfs[0]}" target="_blank" onclick="event.stopPropagation()" title="View PDF" style="text-decoration:none">📄</a>`
        :`<span title="${pdfs.length} PDFs attached" style="color:var(--accent);font-size:11px;font-weight:bold">📄×${pdfs.length}</span>`)
      :'';
    const typeBadge=qq.quote_type?`<span class="badge b-gray" style="font-size:10px;margin-right:6px">${qq.quote_type}</span>`:'';
    const woCount=(qq.work_order_ids||[]).length;
    const woNote=woCount?`<div style="font-size:11px;color:var(--text3);margin-top:2px">🔧 ${woCount} WO${woCount>1?'s':''}</div>`:'';
    const acceptedAction=qq.status==='Accepted'
      ?`<button class="btn btn-sm" style="background:var(--accent);color:#fff;border-color:var(--accent);margin-top:4px;padding:3px 8px;font-size:10px" onclick="event.stopPropagation();createWOFromQuote('${qq.id}')">+ WO</button>`
      :'';
    return`<tr onclick="editQuote('${qq.id}')" style="cursor:pointer">
      <td style="font-size:11px;color:var(--text3)">${qq.quote_number||'—'}${pdfBadge?' '+pdfBadge:''}</td>
      <td style="font-size:11px;color:var(--text3)">${qq.date||'—'}</td>
      <td style="font-weight:bold">${qq.vendor||'—'}</td>
      <td>${typeBadge}${qq.description||''}${aCount?`<div style="font-size:11px;color:var(--text3);margin-top:2px">🔗 ${aCount} asset${aCount>1?'s':''}</div>`:''}${woNote}</td>
      <td><span class="badge b-blue" style="font-size:10px">${qq.building||''}</span></td>
      <td style="font-weight:bold">${fmt(qq.amount)}</td>
      <td style="font-size:11px;color:var(--text3)">${qq.valid_until||'—'}</td>
      <td>${sb(qq.status||'Pending')}${acceptedAction}</td>
    </tr>`;
  }).join(''):'<tr><td colspan="8" class="loading">No quotes match these filters.</td></tr>';
}

// ---- RENDER SERVICE HISTORY ----
function renderHistory(){
  // Build a unified history list from static Trimark records + completed work orders.
  const entries=[];
  (typeof serviceHistory!=='undefined'?serviceHistory:[]).forEach(h=>{
    entries.push({
      kind:'legacy',
      ref:h.inv,
      date:h.date,
      desc:h.desc,
      equip:h.equip,
      building:h.building,
      vendor:'Trimark Mechanical',
      amount:h.amount,
      click:`showHistDetail('${h.inv}')`,
    });
  });
  workOrders.filter(w=>w.status==='Completed').forEach(w=>{
    const linkedInvs=Array.isArray(w.invoice_ids)?invoices.filter(i=>w.invoice_ids.includes(i.id)):[];
    const linkedAssets=Array.isArray(w.asset_ids)?assets.filter(a=>w.asset_ids.includes(a.id)):[];
    const totalCost=linkedInvs.reduce((a,i)=>a+(Number(i.amount)||0),0);
    entries.push({
      kind:'wo',
      ref:'WO',
      date:w.completed_date||'—',
      desc:w.issue+(w.notes?' — '+w.notes:''),
      equip:linkedAssets.map(a=>a.description).join(', ')||(w.location||'—'),
      building:w.building,
      vendor:w.assignee||'—',
      amount:totalCost,
      click:`openWODetail('${w.id}')`,
    });
  });

  // Populate filter dropdowns from the data
  const years=[...new Set(entries.map(e=>{const d=parseDate(e.date);return d?d.getFullYear():null;}).filter(Boolean))].sort((a,b)=>b-a);
  const bldSet=[...new Set(entries.map(e=>e.building).filter(Boolean))].sort();
  const vendorSet=[...new Set(entries.map(e=>e.vendor).filter(Boolean))].sort();
  syncDropdown('hist-f-year',years,'All years');
  syncDropdown('hist-f-bld',bldSet,'All buildings');
  syncDropdown('hist-f-vendor',vendorSet,'All vendors');

  const fy=document.getElementById('hist-f-year')?.value||'all';
  const fb=document.getElementById('hist-f-bld')?.value||'all';
  const fv=document.getElementById('hist-f-vendor')?.value||'all';
  const q=(document.getElementById('hist-search')?.value||'').toLowerCase();

  const filtered=entries.filter(e=>{
    const d=parseDate(e.date);
    const yr=d?d.getFullYear():null;
    if(fy!=='all'&&String(yr)!==fy)return false;
    if(fb!=='all'&&e.building!==fb)return false;
    if(fv!=='all'&&e.vendor!==fv)return false;
    if(q){
      const hay=[e.ref,e.date,e.desc,e.equip,e.building,e.vendor].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(q))return false;
    }
    return true;
  });
  filtered.sort((a,b)=>{
    const da=parseDate(a.date),db=parseDate(b.date);
    if(da&&db)return db-da;
    if(db)return 1;
    if(da)return -1;
    return 0;
  });

  const tb=document.getElementById('hist-table');
  if(tb)tb.innerHTML=filtered.length?filtered.map(e=>`<tr onclick="${e.click}" style="cursor:pointer">
    <td style="font-size:11px;color:var(--text3)">${e.ref}</td>
    <td style="font-size:11px;color:var(--text3)">${e.date}</td>
    <td style="line-height:1.4;font-weight:bold;padding-top:9px;padding-bottom:9px">${e.desc}</td>
    <td style="font-size:11px;color:var(--text3)">${e.equip}</td>
    <td><span class="badge b-blue" style="font-size:10px">${e.building||''}</span></td>
    <td style="font-size:11px;color:var(--text3)">${e.vendor}</td>
    <td style="font-weight:bold">${e.amount>0?fmt(e.amount):'—'}</td>
  </tr>`).join(''):'<tr><td colspan="7" class="loading">No service history yet.</td></tr>';
}

// Replaces an option list while preserving the current selection if still valid.
function syncDropdown(id,values,allLabel){
  const el=document.getElementById(id);
  if(!el)return;
  const cur=el.value;
  el.innerHTML=`<option value="all">${allLabel}</option>`+values.map(v=>`<option>${v}</option>`).join('');
  if(cur&&(cur==='all'||values.includes(cur)||values.map(String).includes(cur)))el.value=cur;
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
    contacts.filter(c=>c.type==='Contractor'||c.type==='Vendor').sort((a,b)=>a.name.localeCompare(b.name)).forEach(c=>{const o=document.createElement('option');o.value=c.name;o.textContent=c.name;vf.appendChild(o);});
  }
}

function populateContactDropdowns(){}

function renderContactRolesList(){
  const el=document.getElementById('contact-roles-list');
  if(!el)return;
  if(!contactRoles.length){el.innerHTML='<div class="empty-state"><p>No roles yet.</p></div>';return;}
  // Group by scope for readability
  const scopes=['Contractor','Vendor','Staff','Volunteer'];
  const byScope={};
  contactRoles.forEach(r=>{(byScope[r.type_scope]=byScope[r.type_scope]||[]).push(r);});
  el.innerHTML=scopes.filter(s=>byScope[s]?.length).map(s=>`
    <div style="font-size:11px;font-weight:bold;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;padding:10px 16px 4px;background:var(--bg3)">${s} · ${byScope[s].length}</div>
    ${byScope[s].map(r=>{
      const inUse=contacts.filter(c=>c.role===r.name&&c.type===r.type_scope).length;
      return`<div style="display:flex;align-items:center;gap:14px;padding:8px 16px;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-weight:bold;font-size:13px;color:var(--accent2)">${r.name}</div>
          <div style="font-size:11px;color:var(--text3)">${inUse} contact${inUse===1?'':'s'} using this role</div>
        </div>
        <div style="display:flex;gap:6px;flex-shrink:0">
          <button class="btn btn-edit btn-sm" onclick="editContactRole('${r.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteContactRole('${r.id}','${r.name.replace(/'/g,"\\'")}')">Del</button>
        </div>
      </div>`;
    }).join('')}`).join('');
}

function renderRoomTypesList(){
  const el=document.getElementById('room-types-list');
  if(!el)return;
  if(!roomTypes.length){el.innerHTML='<div class="empty-state"><p>No room types yet.</p></div>';return;}
  el.innerHTML=roomTypes.map(rt=>{
    const inUse=rooms.filter(r=>r.room_type===rt.name).length;
    return`<div style="display:flex;align-items:center;gap:14px;padding:10px 16px;border-bottom:1px solid var(--border)">
      <div style="flex:1;min-width:0">
        <div style="font-weight:bold;font-size:14px;color:var(--accent2)">${rt.name}</div>
        <div style="font-size:12px;color:var(--text3)">${inUse} room${inUse===1?'':'s'} using this type</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <button class="btn btn-edit btn-sm" onclick="editRoomType('${rt.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteRoomType('${rt.id}','${rt.name.replace(/'/g,"\\'")}')">Del</button>
      </div>
    </div>`;
  }).join('');
}

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

// ---- FINANCE HELPERS ----
// Merges vendor_invoices + static Trimark serviceHistory into a uniform list of
// spending records. Drops rows whose date can't be parsed.
function allSpending(){
  const items=[];
  (invoices||[]).forEach(i=>{
    const d=parseDate(i.date);
    if(!d)return;
    items.push({date:d,amount:Number(i.amount)||0,building:i.building||'Other',source:'invoice'});
  });
  (typeof serviceHistory!=='undefined'?serviceHistory:[]).forEach(h=>{
    const d=parseDate(h.date);
    if(!d)return;
    items.push({date:d,amount:Number(h.amount)||0,building:h.building||'Other',source:'history'});
  });
  return items;
}

// Chart state
let _financeChart=null;
let _financeChartRange='24';   // '12' | '24' | 'ytd'
let _financeChartMode='stacked'; // 'stacked' (per-building) | 'total'

function renderFinance(){
  const el=document.getElementById('finance-content');
  if(!el)return;
  const year=new Date().getFullYear();
  el.innerHTML=`
    <div id="finance-budget"></div>
    <div style="font-size:13px;font-weight:bold;color:var(--accent2);text-transform:uppercase;letter-spacing:.05em;margin:20px 0 12px">Cost per building — ${year}</div>
    <div id="finance-buildings" class="stats-row" style="grid-template-columns:repeat(3,1fr)"></div>
    <div class="card" style="margin-top:20px">
      <div class="card-header">
        <div class="card-title">Spending Trends</div>
        <div class="no-print" style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="btn btn-sm" id="frange-12" onclick="setFinanceRange('12')">12 mo</button>
          <button class="btn btn-sm" id="frange-24" onclick="setFinanceRange('24')">24 mo</button>
          <button class="btn btn-sm" id="frange-ytd" onclick="setFinanceRange('ytd')">This year</button>
          <span style="width:8px"></span>
          <button class="btn btn-sm" id="fmode-stacked" onclick="setFinanceMode('stacked')">By building</button>
          <button class="btn btn-sm" id="fmode-total" onclick="setFinanceMode('total')">Total</button>
        </div>
      </div>
      <div style="padding:14px 18px;height:320px;position:relative">
        <canvas id="finance-chart"></canvas>
      </div>
    </div>
  `;
  renderBudgetProgress();
  renderBuildingCosts();
  renderSpendingChart();
  updateFinanceToolbar();
}

function renderBudgetProgress(){
  const el=document.getElementById('finance-budget');
  if(!el)return;
  const now=new Date();
  const year=now.getFullYear();
  const b=budgets.find(x=>x.year===year);
  const spent=allSpending().filter(s=>s.date.getFullYear()===year).reduce((a,s)=>a+s.amount,0);
  const daysLeft=Math.max(0,Math.ceil((new Date(year+1,0,1)-now)/(24*60*60*1000)));

  if(!b){
    el.innerHTML=`<div class="card"><div class="card-header">
      <div class="card-title">Annual Budget (${year})</div>
      <button class="btn btn-primary btn-sm no-print" onclick="openBudgetModal()">Set Budget</button>
    </div>
    <div style="padding:16px 18px;color:var(--text3);font-size:13px">
      No budget set for ${year} — click Set Budget to add one. Year-to-date spending so far: <strong>${fmt(spent)}</strong>.
    </div></div>`;
    return;
  }

  const amt=Number(b.amount)||0;
  const pct=amt>0?Math.round((spent/amt)*100):0;
  const remaining=amt-spent;
  let barColor,pctColor;
  if(pct<75){barColor='var(--success)';pctColor='var(--success)';}
  else if(pct<=100){barColor='var(--warning)';pctColor='var(--warning)';}
  else {barColor='var(--danger)';pctColor='var(--danger)';}

  el.innerHTML=`<div class="card"><div class="card-header">
    <div class="card-title">Annual Budget (${year})</div>
    <button class="btn btn-sm no-print" onclick="openBudgetModal()">Edit Budget</button>
  </div>
  <div style="padding:16px 18px">
    <div style="display:flex;align-items:baseline;gap:12px;margin-bottom:10px;flex-wrap:wrap">
      <div style="font-size:22px;font-weight:bold;color:var(--accent2)">${fmt(spent)}</div>
      <div style="font-size:13px;color:var(--text3)">of ${fmt(amt)}</div>
      <div style="margin-left:auto;font-size:14px;font-weight:bold;color:${pctColor}">${pct}% used</div>
    </div>
    <div class="progress-bar"><div class="progress-fill" style="width:${Math.min(100,pct)}%;background:${barColor}"></div></div>
    <div style="margin-top:10px;font-size:12px;color:var(--text3)">
      ${remaining>=0?`<strong>${fmt(remaining)}</strong> remaining`:`<span style="color:var(--danger);font-weight:bold">${fmt(-remaining)} over budget</span>`} · ${daysLeft} day${daysLeft===1?'':'s'} left in ${year}
    </div>
    ${b.notes?`<div style="margin-top:8px;font-size:12px;color:var(--text2);font-style:italic">${b.notes}</div>`:''}
  </div></div>`;
}

function renderBuildingCosts(){
  const el=document.getElementById('finance-buildings');
  if(!el)return;
  const now=new Date();
  const currentYear=now.getFullYear();
  const priorYear=currentYear-1;
  const all=allSpending();
  // Prefer current buildings[] as the canonical list; fall back to whatever appears in spending data.
  let bldNames=buildings.map(b=>b.name);
  if(!bldNames.length)bldNames=[...new Set(all.map(s=>s.building))];

  el.innerHTML=bldNames.map(b=>{
    const current=all.filter(s=>s.building===b&&s.date.getFullYear()===currentYear).reduce((a,s)=>a+s.amount,0);
    const prior=all.filter(s=>s.building===b&&s.date.getFullYear()===priorYear).reduce((a,s)=>a+s.amount,0);
    let yoyLabel,yoyClass;
    if(prior===0){yoyLabel='— no prior data';yoyClass='yoy-flat';}
    else{
      const yoy=Math.round(((current-prior)/prior)*100);
      if(yoy>0){yoyLabel=`▲ ${yoy}% YoY`;yoyClass='yoy-up';}
      else if(yoy<0){yoyLabel=`▼ ${-yoy}% YoY`;yoyClass='yoy-down';}
      else{yoyLabel='— flat';yoyClass='yoy-flat';}
    }
    return`<div class="stat-card">
      <div class="stat-label">${b}</div>
      <div class="stat-value" style="color:var(--accent2)">${fmt(current)}</div>
      <div class="stat-delta ${yoyClass}">${yoyLabel} · vs ${fmt(prior)} in ${priorYear}</div>
    </div>`;
  }).join('');
}

function renderSpendingChart(){
  const canvas=document.getElementById('finance-chart');
  if(!canvas)return;
  if(_financeChart){_financeChart.destroy();_financeChart=null;}

  const now=new Date();
  const thisMonth=new Date(now.getFullYear(),now.getMonth(),1);
  let startDate;
  if(_financeChartRange==='ytd'){
    startDate=new Date(now.getFullYear(),0,1);
  }else{
    const monthsBack=Number(_financeChartRange);
    startDate=new Date(now.getFullYear(),now.getMonth()-monthsBack+1,1);
  }

  const months=[];
  const cursor=new Date(startDate);
  while(cursor<=thisMonth){
    months.push(new Date(cursor));
    cursor.setMonth(cursor.getMonth()+1);
  }

  const all=allSpending();
  const bldNames=[...new Set(all.map(s=>s.building))].filter(Boolean).sort();

  const bucket={};
  const key=(y,m,b)=>`${y}-${String(m+1).padStart(2,'0')}-${b}`;
  all.forEach(s=>{
    const bStart=new Date(s.date.getFullYear(),s.date.getMonth(),1);
    if(bStart<startDate||bStart>thisMonth)return;
    const k=key(s.date.getFullYear(),s.date.getMonth(),s.building);
    bucket[k]=(bucket[k]||0)+s.amount;
  });

  const monthLabels=months.map(m=>m.toLocaleDateString('en-US',{year:'2-digit',month:'short'}));
  const palette=['#2d5a8e','#8a4400','#2d7a4a','#8a6200','#1a4a8a','#8a2020','#5c5c58'];

  let datasets;
  if(_financeChartMode==='stacked'){
    datasets=bldNames.map((b,i)=>({
      label:b,
      data:months.map(m=>bucket[key(m.getFullYear(),m.getMonth(),b)]||0),
      backgroundColor:palette[i%palette.length],
    }));
  }else{
    datasets=[{
      label:'Total',
      data:months.map(m=>bldNames.reduce((sum,b)=>sum+(bucket[key(m.getFullYear(),m.getMonth(),b)]||0),0)),
      backgroundColor:'#2d5a8e',
    }];
  }

  _financeChart=new Chart(canvas.getContext('2d'),{
    type:'bar',
    data:{labels:monthLabels,datasets},
    options:{
      responsive:true,
      maintainAspectRatio:false,
      plugins:{
        legend:{position:'bottom',labels:{font:{family:'sans-serif',size:11}}},
        tooltip:{callbacks:{label:ctx=>`${ctx.dataset.label}: ${fmt(ctx.parsed.y)}`}},
      },
      scales:{
        x:{stacked:_financeChartMode==='stacked',ticks:{font:{family:'sans-serif',size:10}}},
        y:{stacked:_financeChartMode==='stacked',beginAtZero:true,ticks:{font:{family:'sans-serif',size:10},callback:v=>'$'+Number(v).toLocaleString()}},
      },
    },
  });
}

function setFinanceRange(r){_financeChartRange=r;renderSpendingChart();updateFinanceToolbar();}
function setFinanceMode(m){_financeChartMode=m;renderSpendingChart();updateFinanceToolbar();}

function updateFinanceToolbar(){
  ['12','24','ytd'].forEach(r=>{
    const btn=document.getElementById('frange-'+r);
    if(btn)btn.classList.toggle('btn-primary',_financeChartRange===r);
  });
  ['stacked','total'].forEach(m=>{
    const btn=document.getElementById('fmode-'+m);
    if(btn)btn.classList.toggle('btn-primary',_financeChartMode===m);
  });
}

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
      ${rows.length?`<div class="table-wrap"><table class="table">
        <colgroup><col style="width:26%"><col style="width:14%"><col style="width:11%"><col style="width:14%"><col style="width:11%"><col style="width:11%"><col style="width:13%"></colgroup>
        <thead><tr><th>Task</th><th>Building</th><th>Frequency</th><th>Assigned</th><th>Next Due</th><th>Last Done</th><th>Status</th></tr></thead>
        <tbody>${rows.map(row).join('')}</tbody>
      </table></div>`:`<div style="padding:16px;color:var(--text3);font-size:13px">${emptyMsg}</div>`}
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
      <td class="no-print">${c.coi_url?`<a href="${coiUrl(c)}" target="_blank">📄</a>`:''}</td>
    </tr>`;
  };

  const section=(title,rows,emptyMsg,color)=>`
    <div class="card">
      <div class="card-header"><div class="card-title" ${color?`style="color:${color}"`:''}>${title} · ${rows.length}</div></div>
      ${rows.length?`<div class="table-wrap"><table class="table">
        <colgroup><col style="width:17%"><col style="width:14%"><col style="width:11%"><col style="width:11%"><col style="width:15%"><col style="width:12%"><col style="width:13%"><col style="width:7%"></colgroup>
        <thead><tr><th>Contractor</th><th>Role</th><th>Phone</th><th>COI Expiry</th><th>Status</th><th>Insurer</th><th>Policy #</th><th class="no-print">COI</th></tr></thead>
        <tbody>${rows.map(row).join('')}</tbody>
      </table></div>`:`<div style="padding:16px;color:var(--text3);font-size:13px">${emptyMsg}</div>`}
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

// ---- RENDER SUPPLIES ----
function supplyStockStatus(s){
  const cur=Number(s.current_stock)||0;
  const lvl=Number(s.reorder_level)||0;
  if(cur<=0)return{label:'Out',cls:'b-red'};
  if(cur<=lvl)return{label:'Low',cls:'b-amber'};
  return{label:'Stocked',cls:'b-green'};
}

function renderSupplies(){
  const el=document.getElementById('supplies-list');
  if(!el)return;
  const q=(document.getElementById('sup-search')?.value||'').toLowerCase();
  const fc=document.getElementById('sup-f-cat')?.value||'all';
  const fs=document.getElementById('sup-f-stock')?.value||'all';
  const filtered=supplies.filter(s=>{
    const status=supplyStockStatus(s);
    const matchQ=!q||(s.name||'').toLowerCase().includes(q)||(s.vendor||'').toLowerCase().includes(q)||(s.notes||'').toLowerCase().includes(q);
    const matchC=fc==='all'||s.category===fc;
    const matchS=fs==='all'||(fs==='low'&&status.label!=='Stocked')||(fs==='ok'&&status.label==='Stocked');
    return matchQ&&matchC&&matchS;
  });
  if(!filtered.length){el.innerHTML='<div class="empty-state"><p>No supplies match.</p></div>';return;}
  el.innerHTML=filtered.map(s=>{
    const status=supplyStockStatus(s);
    return`<div class="supply-card">
      <div class="supply-info">
        <div style="display:flex;align-items:baseline;gap:8px;flex-wrap:wrap">
          <div class="supply-name">${s.name}</div>
          <span class="badge ${status.cls}" style="font-size:11px">${status.label}</span>
        </div>
        <div class="supply-meta">${[s.category,s.unit,s.unit_size].filter(Boolean).join(' · ')}</div>
        <div class="supply-meta">Stock: <strong>${Number(s.current_stock)||0}</strong> · Reorder at: <strong>${Number(s.reorder_level)||0}</strong>${s.vendor?' · Vendor: '+s.vendor:''}${s.last_ordered_date?' · Last ordered: '+s.last_ordered_date:''}</div>
        ${s.notes?`<div class="supply-meta" style="margin-top:4px">${s.notes}</div>`:''}
      </div>
      <div class="supply-actions">
        <button class="btn btn-edit btn-sm" onclick="editSupply('${s.id}')">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="confirmDeleteSupply('${s.id}','${(s.name||'').replace(/'/g,"\\'")}')">Del</button>
      </div>
    </div>`;
  }).join('');
}

// ---- RENDER SETTINGS ----
function renderSettings(){
  initCollapsibleCards();
  renderUsers();
  const statusEl=document.getElementById('gcal-status');
  if(statusEl){
    const configured=appSettings.gcal_api_key&&appSettings.gcal_calendar_id;
    if(configured){
      statusEl.innerHTML=`✓ Connected to <strong>${appSettings.gcal_calendar_id}</strong>. Loaded ${gcalEvents.length} upcoming event${gcalEvents.length===1?'':'s'} for the next 90 days.`;
    }else{
      statusEl.innerHTML=`<span style="color:var(--text3)">Not configured. Click <strong>Configure</strong> to connect a Google Calendar (read-only).</span>`;
    }
  }
  const wstatus=document.getElementById('weather-status');
  if(wstatus){
    const loc=appSettings.weather_location;
    wstatus.innerHTML=loc
      ?`✓ Showing weather for <strong>${loc}</strong>.`
      :`<span style="color:var(--text3)">Not configured. Click <strong>Configure</strong> to show weather on the Dashboard.</span>`;
  }
  renderRoomTypesList();
  renderContactRolesList();
  const el=document.getElementById('categories-list');
  if(!el)return;
  if(!categories.length){el.innerHTML='<div class="empty-state"><p>No categories yet.</p></div>';return;}
  el.innerHTML=categories.map(c=>{
    const inUse=assets.filter(a=>a.category===c.name).length;
    return`<div style="display:flex;align-items:center;gap:14px;padding:12px 16px;border-bottom:1px solid var(--border)">
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

// ---- PROJECTS · FINANCE REPORT ----
// Internal report — full detail: all projects, costs (est + actual), funding
// source, approval trail, linked items, notes. Organized by status and year.
function renderProjectsFinanceReport(){
  const years=[...new Set(projects.map(p=>p.target_year).filter(Boolean))].sort((a,b)=>a-b);
  syncDropdown('pfr-f-year',years,'All years');
  const fy=document.getElementById('pfr-f-year')?.value||'all';
  const filtered=projects.filter(p=>fy==='all'||String(p.target_year)===fy);
  const el=document.getElementById('pfr-content');
  if(!el)return;
  if(!filtered.length){el.innerHTML='<div class="empty-state"><p>No projects to report.</p></div>';return;}

  const buckets={
    'In Pipeline':['Proposed','Approved','Funded','Scheduled'],
    'Complete':['Complete'],
    'Declined':['Declined'],
  };
  const sum=list=>list.reduce((a,p)=>a+(Number(p.estimated_cost)||0),0);
  const sumActual=list=>list.reduce((a,p)=>a+(Number(p.actual_cost)||Number(p.estimated_cost)||0),0);

  const pipeline=filtered.filter(p=>buckets['In Pipeline'].includes(p.status));
  const complete=filtered.filter(p=>p.status==='Complete');
  const declined=filtered.filter(p=>p.status==='Declined');

  const today=new Date().toLocaleDateString();
  const scope=fy==='all'?'All years':`Target year ${fy}`;

  const prioColor={Critical:'b-red',High:'b-red',Medium:'b-amber',Low:'b-gray'};
  const projectCard=p=>{
    const trail=Array.isArray(p.approval_trail)?p.approval_trail:[];
    const latest=trail[trail.length-1];
    const metaBits=[
      p.building&&['Building',p.building],
      p.target_year&&['Target year',p.target_year],
      p.funding_source&&['Funding',p.funding_source],
      p.priority&&['Priority',p.priority],
    ].filter(Boolean);
    return`<div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:18px 20px;margin-bottom:14px;page-break-inside:avoid">
      <!-- Title row -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:10px;padding-bottom:10px;border-bottom:1px solid var(--border)">
        <div style="flex:1;min-width:200px">
          <div style="font-size:16px;font-weight:bold;color:var(--accent2);line-height:1.3">${p.title}</div>
          <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap">
            <span class="badge ${prioColor[p.priority]||'b-gray'}" style="font-size:10px">${p.priority||'Medium'}</span>
            ${sb(p.status||'Proposed')}
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0">
          <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em">Estimated</div>
          <div style="font-size:18px;font-weight:bold;font-variant-numeric:tabular-nums">${fmt(p.estimated_cost)}</div>
          ${p.actual_cost?`<div style="font-size:11px;color:var(--text3);margin-top:6px;text-transform:uppercase;letter-spacing:.06em">Actual</div><div style="font-size:14px;font-weight:bold;color:var(--success);font-variant-numeric:tabular-nums">${fmt(p.actual_cost)}</div>`:''}
        </div>
      </div>

      <!-- Meta grid: label over value so nothing smashes together -->
      ${metaBits.length?`<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px 20px;margin-bottom:12px">
        ${metaBits.map(([k,v])=>`<div>
          <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:2px">${k}</div>
          <div style="font-size:13px">${v}</div>
        </div>`).join('')}
      </div>`:''}

      <!-- Full-width description block -->
      ${p.description?`<div style="background:var(--bg3);border-left:3px solid var(--accent);border-radius:0 6px 6px 0;padding:12px 14px;margin-bottom:${p.notes||trail.length?'12px':'0'};line-height:1.6;font-size:13px;color:var(--text)">${p.description.replace(/\n/g,'<br>')}</div>`:''}

      <!-- Optional internal notes, separate from description -->
      ${p.notes?`<div style="margin-bottom:${trail.length?'12px':'0'}">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px">Internal Notes</div>
        <div style="font-size:12.5px;line-height:1.5;color:var(--text2)">${p.notes.replace(/\n/g,'<br>')}</div>
      </div>`:''}

      <!-- Approval trail -->
      ${trail.length?`<div style="background:var(--bg3);border-radius:6px;padding:10px 14px">
        <div style="font-size:10px;color:var(--text3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px">Approval Trail</div>
        ${trail.map(t=>`<div style="font-size:12px;padding:6px 0;border-top:1px solid var(--border);line-height:1.5">
          <div><strong>${t.decision||'—'}</strong>${t.date?` <span style="color:var(--text3)">· ${t.date}</span>`:''}${t.approver?` <span style="color:var(--text3)">· by ${t.approver}</span>`:''}</div>
          ${t.notes?`<div style="color:var(--text2);margin-top:3px;font-size:11.5px">${t.notes.replace(/\n/g,'<br>')}</div>`:''}
        </div>`).join('')}
      </div>`:''}
    </div>`;
  };

  const section=(label,list,showActual)=>list.length?`
    <div style="margin-top:24px">
      <div style="display:flex;justify-content:space-between;align-items:baseline;font-size:13px;font-weight:bold;color:var(--accent2);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid var(--accent)">
        <span>${label} · ${list.length} project${list.length!==1?'s':''}</span>
        <span style="font-size:12px;color:var(--text2);letter-spacing:.04em">Estimated ${fmt(sum(list))}${showActual?` · Actual ${fmt(sumActual(list))}`:''}</span>
      </div>
      ${list.map(projectCard).join('')}
    </div>`:'';

  el.innerHTML=`
    <div>
      <div class="report-header" style="margin-bottom:18px;padding-bottom:12px;border-bottom:2px solid var(--accent)">
        <div style="font-size:20px;font-weight:bold;color:var(--accent2);letter-spacing:.01em">Capital Projects · Finance Report</div>
        <div style="font-size:12px;color:var(--text3);margin-top:4px">${scope} · generated ${today}</div>
      </div>
      <div class="stats-row" style="grid-template-columns:repeat(4,1fr);margin-bottom:6px">
        <div class="stat-card"><div class="stat-label">Pipeline</div><div class="stat-value" style="color:var(--accent)">${pipeline.length}</div><div class="stat-delta">${fmt(sum(pipeline))}</div></div>
        <div class="stat-card"><div class="stat-label">Approved+</div><div class="stat-value" style="color:var(--warning)">${fmt(sum(filtered.filter(p=>['Approved','Funded','Scheduled'].includes(p.status))))}</div><div class="stat-delta">committed / in progress</div></div>
        <div class="stat-card"><div class="stat-label">Complete</div><div class="stat-value" style="color:var(--success)">${complete.length}</div><div class="stat-delta">actual ${fmt(sumActual(complete))}</div></div>
        <div class="stat-card"><div class="stat-label">Total Estimated</div><div class="stat-value">${fmt(sum(filtered))}</div><div class="stat-delta">all statuses in scope</div></div>
      </div>
      ${section('In Pipeline',pipeline,false)}
      ${section('Complete',complete,true)}
      ${section('Declined',declined,false)}
    </div>
  `;
}

// ---- PROJECTS · PARISH REPORT ----
// Public-facing — cleaner. Shows only active/approved projects with the
// public_description (falls back to description) and estimated cost.
// Approval detail and internal notes are deliberately omitted.
function renderProjectsParishReport(){
  const years=[...new Set(projects.map(p=>p.target_year).filter(Boolean))].sort((a,b)=>a-b);
  syncDropdown('ppr-f-year',years,'All years');
  const fy=document.getElementById('ppr-f-year')?.value||'all';
  // Only show things worth sharing: not declined, not bare Proposed unless they have a public description.
  const filtered=projects.filter(p=>{
    if(fy!=='all'&&String(p.target_year)!==fy)return false;
    if(p.status==='Declined')return false;
    if(p.status==='Proposed'&&!p.public_description&&!p.description)return false;
    return true;
  });
  const el=document.getElementById('ppr-content');
  if(!el)return;
  if(!filtered.length){el.innerHTML='<div class="empty-state"><p>No projects to share yet.</p></div>';return;}

  const today=new Date().toLocaleDateString();
  const scope=fy==='all'?'':` · Target year ${fy}`;

  // Group by building for a natural parish-facing narrative
  const byBld={};
  filtered.forEach(p=>{const k=p.building||'Parish-wide';(byBld[k]=byBld[k]||[]).push(p);});

  const statusLabel={Proposed:'Under consideration',Approved:'Approved',Funded:'Funded',Scheduled:'Scheduled',Complete:'Completed'};

  const cardHTML=p=>{
    const desc=p.public_description||p.description||'';
    return`<div class="card" style="margin-bottom:10px">
      <div style="padding:14px 16px">
        <div style="display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-bottom:4px">
          <div style="font-size:15px;font-weight:bold;color:var(--accent2);flex:1;min-width:0">${p.title}</div>
          <span class="badge">${statusLabel[p.status]||p.status}</span>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-bottom:6px">
          ${[p.target_year&&'Target '+p.target_year,p.funding_source].filter(Boolean).join(' · ')||''}
        </div>
        ${desc?`<div style="font-size:13px;color:var(--text);line-height:1.5">${desc}</div>`:''}
        <div style="margin-top:10px;font-size:13px;font-weight:bold">Estimated cost: ${fmt(p.estimated_cost)}</div>
      </div>
    </div>`;
  };

  const totalEstimated=filtered.reduce((a,p)=>a+(Number(p.estimated_cost)||0),0);

  el.innerHTML=`
    <div class="report-header" style="margin-bottom:14px;text-align:center">
      <div style="font-size:20px;font-weight:bold;color:var(--accent2)">Parish Capital Projects</div>
      <div style="font-size:12px;color:var(--text3)">St. Francis de Sales${scope} · ${today}</div>
    </div>
    <div style="background:var(--bg2);border-radius:8px;padding:14px 16px;margin-bottom:14px;font-size:13px;line-height:1.5">
      The following projects have been identified by the Facilities team to maintain
      and improve our parish campus. Together they represent an estimated investment
      of <strong>${fmt(totalEstimated)}</strong>. Your prayers, feedback, and support are welcome.
    </div>
    ${Object.keys(byBld).sort().map(bld=>`
      <div style="margin-top:14px">
        <div style="font-size:14px;font-weight:bold;color:var(--accent2);margin-bottom:8px;border-bottom:2px solid var(--accent);padding-bottom:4px">${bld}</div>
        ${byBld[bld].map(cardHTML).join('')}
      </div>
    `).join('')}
  `;
}

// ---- CONFLICT CALENDAR ----
// Surfaces every scheduled facility task (PM, work order, internal calendar
// event) that lands on the same date as a parish event, so staff can see
// scheduling collisions across the whole app in one place.
function renderConflicts(){
  const el=document.getElementById('conf-content');
  if(!el)return;
  const win=document.getElementById('conf-window')?.value||'90';
  const today=new Date();today.setHours(0,0,0,0);
  const horizon=win==='all'?null:new Date(today.getTime()+Number(win)*86400000);
  const inWindow=d=>d&&d>=today&&(!horizon||d<=horizon);

  // Build the list of items to check, each: {date, title, building, kind, openHref}
  const items=[];
  pmTasks.forEach(p=>{
    if(p.status==='Done')return;
    const sched=parseDate(p.scheduled_date);
    const due=parseDate(p.next_due);
    const d=sched||due;
    if(!inWindow(d))return;
    items.push({date:d,title:p.title,building:p.building,kind:'PM',badge:'b-amber',
      open:`go('pm');setTimeout(()=>openPMScheduleModal('${p.id}'),100)`});
  });
  workOrders.forEach(w=>{
    if(w.status==='Completed')return;
    const d=parseDate(w.due_date);
    if(!inWindow(d))return;
    items.push({date:d,title:w.issue,building:w.building,kind:'Work Order',badge:'b-red',
      open:`go('workorders');setTimeout(()=>openWODetail('${w.id}'),100)`});
  });
  (calendarEvents||[]).forEach(e=>{
    const d=e.start?new Date(e.start):null;
    if(!inWindow(d))return;
    items.push({date:d,title:e.title,building:e.building||'',kind:'Internal event',badge:'b-blue',
      open:`go('calendar')`});
  });

  // For each, find parish events on the same date
  const conflicts=[];
  items.forEach(it=>{
    const overlaps=eventsOnDate(it.date);
    if(overlaps.length)conflicts.push({...it,overlaps});
  });
  conflicts.sort((a,b)=>a.date-b.date);

  const winLabel={30:'next 30 days',90:'next 90 days',365:'next year',all:'all upcoming'}[win]||win;
  if(!conflicts.length){
    el.innerHTML=`<div class="empty-state"><p>✅ No conflicts in the ${winLabel}.</p><small>Nothing on the parish calendar overlaps with scheduled PMs, work orders, or internal events.</small></div>`;
    return;
  }

  // Group by date for scannable layout
  const byDate={};
  conflicts.forEach(c=>{
    const k=c.date.toISOString().slice(0,10);
    (byDate[k]=byDate[k]||[]).push(c);
  });

  el.innerHTML=`
    <div style="margin-bottom:12px;font-size:13px;color:var(--text2)">
      ⚠️ ${conflicts.length} item${conflicts.length===1?'':'s'} scheduled during a parish event in the ${winLabel}.
    </div>
    ${Object.keys(byDate).sort().map(k=>{
      const list=byDate[k];
      const date=list[0].date;
      const dateStr=date.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
      return`<div class="card" style="margin-bottom:12px">
        <div class="card-header">
          <div class="card-title">${dateStr}</div>
          <div style="font-size:11px;color:var(--text3)">${list.length} conflict${list.length===1?'':'s'}</div>
        </div>
        <div style="padding:8px 14px">
          ${list.map(c=>`<div style="padding:10px 0;border-bottom:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
              <div style="flex:1;min-width:200px">
                <div style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap">
                  <span class="badge ${c.badge}" style="font-size:10px">${c.kind}</span>
                  <span style="font-weight:bold">${c.title}</span>
                </div>
                <div style="font-size:11px;color:var(--text3);margin-top:3px">${c.building||'—'}</div>
                <div style="font-size:12px;color:var(--warning);margin-top:6px;background:var(--warning-bg);padding:6px 10px;border-radius:6px;border:1px solid #f0d060">
                  ⚠️ Conflicts with: ${c.overlaps.map(e=>`<strong>${e.title}</strong>${e.allDay?'':' ('+(eventDate(e)?.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})||'')+')'}`).join(', ')}
                </div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0">
                <button class="btn btn-edit btn-sm" onclick="${c.open}">Open</button>
              </div>
            </div>
          </div>`).join('')}
        </div>
      </div>`;
    }).join('')}`;
}

// ---- USERS & ROLES (admin-only on Settings page) ----
function renderUsers(){
  const el=document.getElementById('users-list');
  if(!el)return;
  if(!isAdmin()){
    el.innerHTML=`<div style="padding:14px 18px;font-size:13px;color:var(--text3)">Only an Admin can manage users. Your role: <strong>${ROLE_LABELS[userRole()]||userRole()}</strong>.</div>`;
    return;
  }
  if(!profiles.length){
    el.innerHTML='<div style="padding:14px 18px;color:var(--text3)">Loading…</div>';
    return;
  }
  const sorted=[...profiles].sort((a,b)=>(a.display_name||a.email||'').localeCompare(b.display_name||b.email||''));
  el.innerHTML=sorted.map(p=>{
    const isMe=p.id===currentUserId();
    const role=p.role||'viewer';
    const ids=Array.isArray(p.assigned_building_ids)?p.assigned_building_ids:[];
    return`<div style="padding:12px 18px;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:200px">
          <div style="font-weight:bold">${p.display_name||p.email||'(no name)'}${isMe?' <span style="font-size:11px;color:var(--text3)">(you)</span>':''}</div>
          <div style="font-size:12px;color:var(--text3)">${p.email||'—'}</div>
        </div>
        <select class="fi" style="width:auto;flex:0 0 auto" onchange="updateUserRole('${p.id}',this.value)" ${isMe?'disabled title="You cannot change your own role"':''}>
          ${ROLE_LIST.map(r=>`<option value="${r}" ${role===r?'selected':''}>${ROLE_LABELS[r]}</option>`).join('')}
        </select>
      </div>
      ${role==='dept_head'?`<div style="margin-top:10px">
        <div style="font-size:11px;color:var(--text3);text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Assigned buildings</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px">
          ${buildings.length?buildings.map(b=>`<label style="font-size:12px;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid var(--border2);border-radius:6px;cursor:pointer;background:${ids.includes(b.id)?'var(--info-bg)':'transparent'}">
            <input type="checkbox" ${ids.includes(b.id)?'checked':''} onchange="toggleUserBuilding('${p.id}','${b.id}',this.checked)">
            ${b.name}
          </label>`).join(''):'<span style="font-size:12px;color:var(--text3)">No buildings yet</span>'}
        </div>
      </div>`:''}
    </div>`;
  }).join('');
}

async function updateUserRole(uid,role){
  try{
    const{error}=await db.from('profiles').update({role}).eq('id',uid);
    if(error)throw error;
    const p=profiles.find(x=>x.id===uid);
    if(p)p.role=role;
    showToast('Role updated');
    renderUsers();
    // If admin changed their own role to something less (shouldn't happen — disabled),
    // or anyone's role that affects nav, refresh nav visibility.
    applyNavVisibility();
  }catch(e){console.error(e);showToast('Could not update role');}
}

async function toggleUserBuilding(uid,bldId,checked){
  const p=profiles.find(x=>x.id===uid);
  if(!p)return;
  const ids=Array.isArray(p.assigned_building_ids)?[...p.assigned_building_ids]:[];
  if(checked&&!ids.includes(bldId))ids.push(bldId);
  if(!checked){const i=ids.indexOf(bldId);if(i>-1)ids.splice(i,1);}
  try{
    const{error}=await db.from('profiles').update({assigned_building_ids:ids}).eq('id',uid);
    if(error)throw error;
    p.assigned_building_ids=ids;
    renderUsers();
  }catch(e){console.error(e);showToast('Could not update buildings');}
}

