// Load/save/delete helpers, CSV import/export, navigation, init

// ---- LOAD ----
async function loadAll(){
  // Categories must load before assets so catIcon is populated when renderAssets runs.
  await loadCategories();
  await loadSettings();
  await Promise.all([loadBuildings(),loadWorkOrders(),loadAssets(),loadPM(),loadContacts(),loadInvoices(),loadBudgets(),loadGCalEvents(),loadSupplies(),loadUtilities(),loadRoomTypes(),loadQuotes(),loadCalendarEvents(),loadContactRoles(),loadWeather(),loadProjects(),loadProfiles(),loadSupplyCategories(),loadSupplyRequests()]);
  // Generate signed URLs for every stored photo/pdf/coi path before anything
  // renders. Without this, images/links would point at raw paths and 404.
  await refreshSignedUrls();
  applyNavVisibility();
  renderHistory();renderDash();
}

async function loadProjects(){
  try{
    const{data,error}=await db.from('projects').select('*').order('target_year',{ascending:true}).order('created_at',{ascending:false});
    if(error)throw error;
    projects=(data||[]).map(p=>({
      ...p,
      asset_ids:normalizeIdArray(p.asset_ids),
      quote_ids:normalizeIdArray(p.quote_ids),
      work_order_ids:normalizeIdArray(p.work_order_ids),
      approval_trail:normalizeIdArray(p.approval_trail),
      pdf_urls:normalizeIdArray(p.pdf_urls),
      photo_urls:normalizeIdArray(p.photo_urls),
    }));
  }catch(e){console.error(e);projects=[];}
}

async function saveProject(d){
  try{
    if(editingProjectId){
      const{data,error}=await db.from('projects').update(stamp({...d,updated_at:new Date().toISOString()},false)).eq('id',editingProjectId).select();
      if(error)throw error;
      const normalized={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),quote_ids:normalizeIdArray(data[0].quote_ids),work_order_ids:normalizeIdArray(data[0].work_order_ids),approval_trail:normalizeIdArray(data[0].approval_trail),pdf_urls:normalizeIdArray(data[0].pdf_urls),photo_urls:normalizeIdArray(data[0].photo_urls)};
      const i=projects.findIndex(p=>p.id===editingProjectId);
      if(i>-1)projects[i]=normalized;
      showToast('Project updated!');
    }else{
      const{data,error}=await db.from('projects').insert([stamp(d,true)]).select();
      if(error)throw error;
      const normalized={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),quote_ids:normalizeIdArray(data[0].quote_ids),work_order_ids:normalizeIdArray(data[0].work_order_ids),approval_trail:normalizeIdArray(data[0].approval_trail),pdf_urls:normalizeIdArray(data[0].pdf_urls),photo_urls:normalizeIdArray(data[0].photo_urls)};
      projects.unshift(normalized);
      showToast('Project saved!');
    }
    editingProjectId=null;closeModal('project-modal');
    renderProjects();renderDash();
  }catch(e){console.error(e);showToast('Error saving project');}
}

async function deleteProject(id){
  try{
    const{error}=await db.from('projects').delete().eq('id',id);
    if(error)throw error;
    projects=projects.filter(p=>p.id!==id);
    showToast('Project deleted');renderProjects();
  }catch(e){showToast('Error deleting');}
}

async function loadCalendarEvents(){
  try{
    const{data,error}=await db.from('calendar_events').select('*').order('start_at');
    if(error)throw error;
    calendarEvents=(data||[]).map(e=>({
      id:e.id,
      title:e.title,
      start:e.start_at,
      end:e.end_at,
      allDay:!!e.all_day,
      description:e.description||'',
      building:e.building||'',
      location:e.location||'',
      notes:e.notes||'',
      source:'custom',
      _ref:{type:'custom',id:e.id},
    }));
  }catch(e){console.error(e);calendarEvents=[];}
}

async function saveCalendarEvent(d){
  try{
    if(editingEventId){
      const{data,error}=await db.from('calendar_events').update(stamp({...d,updated_at:new Date().toISOString()},false)).eq('id',editingEventId).select();
      if(error)throw error;
      showToast('Event updated!');
    }else{
      const{data,error}=await db.from('calendar_events').insert([stamp(d,true)]).select();
      if(error)throw error;
      showToast('Event added!');
    }
    editingEventId=null;closeModal('calendar-event-modal');
    await loadCalendarEvents();
    if(typeof renderCalendar==='function')renderCalendar();
  }catch(e){console.error(e);showToast('Error saving event');}
}

async function deleteCalendarEvent(id){
  try{
    const{error}=await db.from('calendar_events').delete().eq('id',id);
    if(error)throw error;
    calendarEvents=calendarEvents.filter(e=>e.id!==id);
    showToast('Event deleted');
    if(typeof renderCalendar==='function')renderCalendar();
  }catch(e){showToast('Error deleting');}
}

// Builds a unified list of calendar events from: Google parish calendar (read-only),
// PM tasks (next_due), open work orders (due_date), pending quotes (valid_until), and
// app-managed custom events. Each event carries `source` and `_ref` so the calendar
// renderer can color-code and route clicks to the originating record.
function combinedCalendarEvents(){
  const out=[];
  const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // Google
  (gcalEvents||[]).forEach(e=>out.push({...e,source:'gcal'}));

  // PM tasks not yet done. Scheduled_date takes precedence over next_due when set.
  (pmTasks||[]).filter(p=>p.status!=='Done').forEach(p=>{
    const scheduled=parseDate(p.scheduled_date);
    const d=scheduled||parseDate(p.next_due);
    if(!d)return;
    const k=ymd(d);
    const titlePrefix=scheduled?'📅 ':'🔧 ';
    out.push({
      id:'pm-'+p.id,
      title:titlePrefix+p.title+(scheduled?' (scheduled)':''),
      start:k,end:k,allDay:true,
      description:[p.building,p.frequency,p.assigned_to&&'Assigned: '+p.assigned_to,scheduled&&p.scheduled_time&&'Time: '+p.scheduled_time,scheduled&&[p.scheduled_with,p.scheduled_contact_person].filter(Boolean).join(' — ')&&'With: '+[p.scheduled_with,p.scheduled_contact_person].filter(Boolean).join(' — ')].filter(Boolean).join(' · '),
      location:p.building||'',
      source:'pm',_ref:{type:'pm',id:p.id},
    });
  });

  // Open work orders with a due date
  (workOrders||[]).filter(w=>w.status!=='Completed'&&w.due_date).forEach(w=>{
    const d=parseDate(w.due_date);
    if(!d)return;
    const k=ymd(d);
    out.push({
      id:'wo-'+w.id,
      title:'🛠 '+w.issue,
      start:k,end:k,allDay:true,
      description:[w.priority&&'Priority: '+w.priority,w.assignee&&'Assigned: '+w.assignee,w.location].filter(Boolean).join(' · '),
      location:[w.building,w.location].filter(Boolean).join(' · '),
      source:'wo',_ref:{type:'wo',id:w.id},
    });
  });

  // Custom app events
  (calendarEvents||[]).forEach(e=>out.push(e));

  return out;
}

// Routes a click on a calendar event to the originating record's modal.
function dispatchCalEvent(type,id){
  if(type==='pm'){editPM(id);return;}
  if(type==='wo'){openWODetail(id);return;}
  if(type==='quote'){editQuote(id);return;}
  if(type==='custom'){editCalendarEvent(id);return;}
  // gcal: no destination — handled inline in render with a no-op
}

async function loadQuotes(){
  try{
    const{data,error}=await db.from('quotes').select('*').order('date',{ascending:false});
    if(error)throw error;
    quotes=(data||[]).map(q=>({...q,asset_ids:normalizeIdArray(q.asset_ids),pdf_urls:normalizeIdArray(q.pdf_urls),work_order_ids:normalizeIdArray(q.work_order_ids)}));
  }catch(e){console.error(e);quotes=[];}
}

async function saveQuote(d){
  try{
    if(editingQuoteId){
      const{data,error}=await db.from('quotes').update(stamp({...d,updated_at:new Date().toISOString()},false)).eq('id',editingQuoteId).select();
      if(error)throw error;
      const i=quotes.findIndex(q=>q.id===editingQuoteId);
      if(i>-1)quotes[i]={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),pdf_urls:normalizeIdArray(data[0].pdf_urls),work_order_ids:normalizeIdArray(data[0].work_order_ids)};
      showToast('Quote updated!');
    }else{
      const{data,error}=await db.from('quotes').insert([stamp(d,true)]).select();
      if(error)throw error;
      quotes.unshift({...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),pdf_urls:normalizeIdArray(data[0].pdf_urls),work_order_ids:normalizeIdArray(data[0].work_order_ids)});
      showToast('Quote saved!');
    }
    editingQuoteId=null;closeModal('quote-modal');renderQuotes();
  }catch(e){console.error(e);showToast('Error saving quote');}
}

// Spawn a Work Order from an Accepted quote. Pre-fills issue/vendor/building/
// asset_ids/notes/amount and links the WO id back into the quote so the audit
// trail is intact (mirrors createWOFromProject).
async function createWOFromQuote(id){
  const q=quotes.find(x=>x.id===id);
  if(!q){showToast('Quote not found');return;}
  const woData={
    issue:q.description||`Work for ${q.vendor||'vendor'} quote`,
    building:q.building||null,
    priority:'Medium',
    status:'Open',
    assignee:q.vendor||null,
    notes:[q.notes,q.amount?`Quoted at ${fmt(q.amount)}`:null].filter(Boolean).join('\n\n')||null,
    asset_ids:Array.isArray(q.asset_ids)?q.asset_ids:[],
  };
  try{
    const{data,error}=await db.from('work_orders').insert([stamp(woData,true)]).select();
    if(error)throw error;
    const newWO={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),invoice_ids:normalizeIdArray(data[0].invoice_ids),photo_urls:normalizeIdArray(data[0].photo_urls)};
    workOrders.unshift(newWO);
    const linked=[...(Array.isArray(q.work_order_ids)?q.work_order_ids:[]),newWO.id];
    const{data:qd}=await db.from('quotes').update({work_order_ids:linked,updated_at:new Date().toISOString()}).eq('id',id).select();
    if(qd?.[0]){
      const i=quotes.findIndex(x=>x.id===id);
      if(i>-1)quotes[i]={...qd[0],asset_ids:normalizeIdArray(qd[0].asset_ids),pdf_urls:normalizeIdArray(qd[0].pdf_urls),work_order_ids:normalizeIdArray(qd[0].work_order_ids)};
    }
    showToast('Work Order created from quote');
    renderQuotes();renderWO();renderDash();
  }catch(e){console.error(e);showToast('Error creating work order');}
}

async function deleteQuote(id){
  try{
    const{error}=await db.from('quotes').delete().eq('id',id);
    if(error)throw error;
    quotes=quotes.filter(q=>q.id!==id);
    showToast('Quote deleted');renderQuotes();
  }catch(e){showToast('Error deleting');}
}

async function loadContactRoles(){
  try{
    const{data,error}=await db.from('contact_roles').select('*').order('type_scope').order('sort_order').order('name');
    if(error)throw error;
    if(!data||data.length===0)await seedContactRoles();
    else contactRoles=data;
  }catch(e){console.error(e);contactRoles=[];}
}

async function seedContactRoles(){
  try{
    const toInsert=defaultContactRoles.map((r,i)=>({...r,sort_order:i+1}));
    const{data,error}=await db.from('contact_roles').insert(toInsert).select();
    if(error)throw error;
    contactRoles=data||[];
  }catch(e){console.error(e);contactRoles=[];}
}

async function saveContactRole(d){
  try{
    if(editingContactRoleId){
      const old=contactRoles.find(r=>r.id===editingContactRoleId);
      const renamed=old&&old.name!==d.name;
      const{data,error}=await db.from('contact_roles').update(stamp(d,false)).eq('id',editingContactRoleId).select();
      if(error)throw error;
      const i=contactRoles.findIndex(r=>r.id===editingContactRoleId);
      if(i>-1)contactRoles[i]=data[0];
      // Rename cascade: update every contact in this scope that had the old role
      // (in either the legacy `role` column or the new `roles` jsonb array).
      if(renamed){
        const affected=contacts.filter(c=>c.type===old.type_scope&&((c.role===old.name)||(Array.isArray(c.roles)&&c.roles.includes(old.name))));
        for(const c of affected){
          const newRoles=(Array.isArray(c.roles)?c.roles:[]).map(r=>r===old.name?d.name:r);
          const newRole=c.role===old.name?d.name:c.role;
          try{
            await db.from('contacts').update({roles:newRoles,role:newRole}).eq('id',c.id);
            c.roles=newRoles;c.role=newRole;
          }catch(e){console.error(e);}
        }
      }
      showToast('Role updated!');
    }else{
      const sort_order=(contactRoles.reduce((m,r)=>Math.max(m,r.sort_order||0),0))+1;
      const{data,error}=await db.from('contact_roles').insert([stamp({...d,sort_order},true)]).select();
      if(error)throw error;
      contactRoles.push(data[0]);
      showToast('Role added!');
    }
    editingContactRoleId=null;closeModal('contact-role-modal');
    renderSettings();renderContacts();
  }catch(e){console.error(e);showToast('Error saving role');}
}

async function deleteContactRole(id){
  const r=contactRoles.find(x=>x.id===id);
  if(!r)return;
  const inUse=contacts.filter(c=>c.type===r.type_scope&&((c.role===r.name)||(Array.isArray(c.roles)&&c.roles.includes(r.name)))).length;
  if(inUse>0){showToast(`Cannot delete — ${inUse} contact${inUse>1?'s':''} still use "${r.name}"`);return;}
  try{
    const{error}=await db.from('contact_roles').delete().eq('id',id);
    if(error)throw error;
    contactRoles=contactRoles.filter(x=>x.id!==id);
    showToast('Role deleted');renderSettings();
  }catch(e){showToast('Error deleting');}
}

async function loadRoomTypes(){
  try{
    const{data,error}=await db.from('room_types').select('*').order('sort_order').order('name');
    if(error)throw error;
    if(!data||data.length===0)await seedRoomTypes();
    else roomTypes=data;
  }catch(e){console.error(e);roomTypes=[];}
}

async function seedRoomTypes(){
  try{
    const toInsert=defaultRoomTypes.map((name,i)=>({name,sort_order:i+1}));
    const{data,error}=await db.from('room_types').insert(toInsert).select();
    if(error)throw error;
    roomTypes=data||[];
  }catch(e){console.error(e);roomTypes=[];}
}

async function saveRoomType(d){
  try{
    if(editingRoomTypeId){
      const old=roomTypes.find(r=>r.id===editingRoomTypeId);
      const renamed=old&&old.name!==d.name;
      const{data,error}=await db.from('room_types').update(stamp(d,false)).eq('id',editingRoomTypeId).select();
      if(error)throw error;
      const i=roomTypes.findIndex(r=>r.id===editingRoomTypeId);
      if(i>-1)roomTypes[i]=data[0];
      // Rename cascade: update every room that used the old name
      if(renamed){
        await db.from('rooms').update({room_type:d.name}).eq('room_type',old.name);
        rooms.forEach(r=>{if(r.room_type===old.name)r.room_type=d.name;});
      }
      showToast('Room type updated!');
    }else{
      const sort_order=(roomTypes.reduce((m,r)=>Math.max(m,r.sort_order||0),0))+1;
      const{data,error}=await db.from('room_types').insert([stamp({...d,sort_order},true)]).select();
      if(error)throw error;
      roomTypes.push(data[0]);
      showToast('Room type added!');
    }
    editingRoomTypeId=null;closeModal('room-type-modal');
    renderSettings();
    if(currentBuildingId)renderRooms();
  }catch(e){console.error(e);showToast('Error saving room type');}
}

async function deleteRoomType(id){
  const rt=roomTypes.find(x=>x.id===id);
  if(!rt)return;
  const inUse=rooms.filter(r=>r.room_type===rt.name).length;
  if(inUse>0){showToast(`Cannot delete — ${inUse} room${inUse>1?'s':''} still use "${rt.name}"`);return;}
  try{
    const{error}=await db.from('room_types').delete().eq('id',id);
    if(error)throw error;
    roomTypes=roomTypes.filter(x=>x.id!==id);
    showToast('Room type deleted');renderSettings();
  }catch(e){showToast('Error deleting');}
}

// ---- SUPPLY CATEGORIES ----
// Admin-managed list of top-level supply departments (Janitorial, Office, Maintenance, …).
// `janitor_visible` flags which categories surface in the janitor supply-request dropdown.
async function loadSupplyCategories(){
  try{
    const{data,error}=await db.from('supply_categories').select('*').order('sort_order').order('name');
    if(error)throw error;
    supplyCategories=data||[];
  }catch(e){console.error(e);supplyCategories=[];}
}

async function saveSupplyCategory(d){
  try{
    if(editingSupplyCategoryId){
      const old=supplyCategories.find(c=>c.id===editingSupplyCategoryId);
      const renamed=old&&old.name!==d.name;
      const{data,error}=await db.from('supply_categories').update(stamp(d,false)).eq('id',editingSupplyCategoryId).select();
      if(error)throw error;
      const i=supplyCategories.findIndex(c=>c.id===editingSupplyCategoryId);
      if(i>-1)supplyCategories[i]=data[0];
      // Rename cascade: update every supply that used the old category name
      if(renamed){
        await db.from('supplies').update({category:d.name}).eq('category',old.name);
        supplies.forEach(s=>{if(s.category===old.name)s.category=d.name;});
      }
      showToast('Category updated!');
    }else{
      const sort_order=(supplyCategories.reduce((m,c)=>Math.max(m,c.sort_order||0),0))+1;
      const{data,error}=await db.from('supply_categories').insert([stamp({...d,sort_order},true)]).select();
      if(error)throw error;
      supplyCategories.push(data[0]);
      showToast('Category added!');
    }
    editingSupplyCategoryId=null;closeModal('supply-category-modal');
    renderSettings();
    renderSupplies();
  }catch(e){console.error(e);showToast('Error saving category');}
}

async function deleteSupplyCategory(id){
  const sc=supplyCategories.find(x=>x.id===id);
  if(!sc)return;
  const inUse=supplies.filter(s=>s.category===sc.name).length;
  if(inUse>0){showToast(`Cannot delete — ${inUse} suppl${inUse>1?'ies':'y'} still use "${sc.name}"`);return;}
  try{
    const{error}=await db.from('supply_categories').delete().eq('id',id);
    if(error)throw error;
    supplyCategories=supplyCategories.filter(x=>x.id!==id);
    showToast('Category deleted');renderSettings();
  }catch(e){showToast('Error deleting');}
}

// ---- SUPPLY REQUESTS ----
// Janitors create pending requests from the My Work page; managers approve
// (one-shot: decrements inventory + marks approved) or deny on the Supplies page.
async function loadSupplyRequests(){
  try{
    const{data,error}=await db.from('supply_requests').select('*').order('created_at',{ascending:false});
    if(error)throw error;
    supplyRequests=data||[];
  }catch(e){console.error(e);supplyRequests=[];}
}

async function createSupplyRequest(d){
  try{
    const payload=stamp({...d,status:'pending',requested_by:currentUserId()},true);
    const{data,error}=await db.from('supply_requests').insert([payload]).select();
    if(error)throw error;
    supplyRequests.unshift(data[0]);
    showToast('Request submitted');
    return data[0];
  }catch(e){console.error(e);showToast('Error submitting request');return null;}
}

async function approveSupplyRequest(id){
  const r=supplyRequests.find(x=>x.id===id);
  if(!r||r.status!=='pending')return;
  const sup=supplies.find(s=>s.id===r.supply_id);
  try{
    // One-shot: decrement inventory then mark approved
    if(sup){
      const newStock=Math.max(0,(Number(sup.current_stock)||0)-(Number(r.quantity)||0));
      const{error:e1}=await db.from('supplies').update(stamp({current_stock:newStock},false)).eq('id',sup.id);
      if(e1)throw e1;
      sup.current_stock=newStock;
    }
    const upd={status:'approved',decided_by:currentUserId(),decided_at:new Date().toISOString()};
    const{data,error}=await db.from('supply_requests').update(stamp(upd,false)).eq('id',id).select();
    if(error)throw error;
    Object.assign(r,data[0]);
    showToast('Approved — inventory updated');
    renderSupplyRequestsList?.();
    renderSupplies?.();
  }catch(e){console.error(e);showToast('Error approving');}
}

async function denySupplyRequest(id){
  const r=supplyRequests.find(x=>x.id===id);
  if(!r||r.status!=='pending')return;
  try{
    const upd={status:'denied',decided_by:currentUserId(),decided_at:new Date().toISOString()};
    const{data,error}=await db.from('supply_requests').update(stamp(upd,false)).eq('id',id).select();
    if(error)throw error;
    Object.assign(r,data[0]);
    showToast('Request denied');
    renderSupplyRequestsList?.();
  }catch(e){console.error(e);showToast('Error denying');}
}

async function loadUtilities(){
  try{
    const{data,error}=await db.from('utility_readings').select('*').order('period_end',{ascending:false});
    if(error)throw error;
    utilityReadings=(data||[]).map(u=>({...u,pdf_urls:normalizeIdArray(u.pdf_urls)}));
  }catch(e){console.error(e);utilityReadings=[];}
}

async function saveUtility(d){
  try{
    if(editingUtilityId){
      const{data,error}=await db.from('utility_readings').update(stamp(d,false)).eq('id',editingUtilityId).select();
      if(error)throw error;
      const i=utilityReadings.findIndex(u=>u.id===editingUtilityId);
      if(i>-1)utilityReadings[i]={...data[0],pdf_urls:normalizeIdArray(data[0].pdf_urls)};
      showToast('Utility reading updated!');
    }else{
      const{data,error}=await db.from('utility_readings').insert([stamp(d,true)]).select();
      if(error)throw error;
      utilityReadings.unshift({...data[0],pdf_urls:normalizeIdArray(data[0].pdf_urls)});
      showToast('Utility reading saved!');
    }
    editingUtilityId=null;closeModal('utility-modal');
    if(currentBuildingId)renderBuildingUtilities();
  }catch(e){console.error(e);showToast('Error saving reading');}
}

async function deleteUtility(id){
  try{
    const{error}=await db.from('utility_readings').delete().eq('id',id);
    if(error)throw error;
    utilityReadings=utilityReadings.filter(u=>u.id!==id);
    showToast('Reading deleted');
    if(currentBuildingId)renderBuildingUtilities();
  }catch(e){showToast('Error deleting');}
}

async function loadSupplies(){
  try{
    const{data,error}=await db.from('supplies').select('*').order('category').order('name');
    if(error)throw error;
    if(!data||data.length===0)await seedSupplies();
    else supplies=data;
  }catch(e){console.error(e);supplies=[];}
  renderSupplies();
}

async function seedSupplies(){
  try{
    const{data,error}=await db.from('supplies').insert(defaultSupplies).select();
    if(error)throw error;
    supplies=data||[];
    showToast('Default supply list loaded — '+supplies.length+' items added!');
  }catch(e){console.error(e);supplies=[];}
}

async function saveSupply(d){
  try{
    if(editingSupplyId){
      const{data,error}=await db.from('supplies').update(stamp({...d,updated_at:new Date().toISOString()},false)).eq('id',editingSupplyId).select();
      if(error)throw error;
      const i=supplies.findIndex(s=>s.id===editingSupplyId);
      if(i>-1)supplies[i]=data[0];
      showToast('Supply updated!');
    }else{
      const{data,error}=await db.from('supplies').insert([stamp(d,true)]).select();
      if(error)throw error;
      supplies.push(data[0]);
      showToast('Supply added!');
    }
    editingSupplyId=null;closeModal('supply-modal');
    renderSupplies();renderDash();
  }catch(e){console.error(e);showToast('Error saving supply');}
}

async function deleteSupply(id){
  try{
    const{error}=await db.from('supplies').delete().eq('id',id);
    if(error)throw error;
    supplies=supplies.filter(s=>s.id!==id);
    showToast('Supply deleted');renderSupplies();renderDash();
  }catch(e){showToast('Error deleting');}
}

async function loadSettings(){
  try{
    const{data,error}=await db.from('app_settings').select('*');
    if(error)throw error;
    appSettings={};
    (data||[]).forEach(r=>{appSettings[r.key]=r.value;});
  }catch(e){console.error(e);appSettings={};}
}

// In-memory cache so we don't refetch on every render
let _weatherData=null;
let _weatherLastFetch=0;
async function loadWeather(force){
  const loc=appSettings.weather_location;
  if(!loc){_weatherData=null;return;}
  // Cache for 15 minutes
  if(!force&&_weatherData&&(Date.now()-_weatherLastFetch)<15*60*1000)return;
  try{
    const res=await fetch(`https://wttr.in/${encodeURIComponent(loc)}?format=j1`);
    const data=await res.json();
    _weatherData=data;
    _weatherLastFetch=Date.now();
  }catch(e){console.error('Weather fetch failed:',e);_weatherData=null;}
}

async function saveSetting(key,value){
  try{
    const{error}=await db.from('app_settings').upsert({key,value,updated_at:new Date().toISOString()},{onConflict:'key'});
    if(error)throw error;
    appSettings[key]=value;
  }catch(e){console.error(e);showToast('Error saving setting');throw e;}
}

// Fetches events from a PUBLIC Google Calendar using a referrer-restricted API key.
// Default range is now → +90 days (for the dashboard card). Pass from/to to override.
async function loadGCalEvents(from,to){
  const apiKey=appSettings.gcal_api_key;
  const calendarId=appSettings.gcal_calendar_id;
  if(!apiKey||!calendarId){gcalEvents=[];return;}
  try{
    const timeMin=(from||new Date()).toISOString();
    const timeMax=(to||new Date(Date.now()+90*24*60*60*1000)).toISOString();
    const params=new URLSearchParams({
      key:apiKey,
      timeMin,
      timeMax,
      singleEvents:'true',
      orderBy:'startTime',
      maxResults:'500',
    });
    const url=`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;
    const res=await fetch(url);
    const data=await res.json();
    if(data.error)throw new Error(data.error.message);
    gcalEvents=(data.items||[]).map(e=>({
      id:e.id,
      title:e.summary||'(no title)',
      start:e.start?.dateTime||e.start?.date||null,
      end:e.end?.dateTime||e.end?.date||null,
      allDay:!e.start?.dateTime,
      location:e.location||'',
      description:e.description||'',
    })).filter(e=>e.start);
  }catch(e){
    console.error('GCal fetch failed:',e);
    gcalEvents=[];
  }
}

// ---- CALENDAR NAVIGATION ----
// Fetches events for the current calView / calDate window (with buffer) then re-renders.
async function loadCalEvents(){
  const[from,to]=calendarRange(calView,calDate);
  // Add a small buffer so month/quarter grids that spill into adjacent months still show events
  const buf=7*24*60*60*1000;
  await loadGCalEvents(new Date(from.getTime()-buf),new Date(to.getTime()+buf));
  renderCalendar();
}

function calendarRange(view,date){
  const d=new Date(date);
  if(view==='day'){
    const start=new Date(d.getFullYear(),d.getMonth(),d.getDate());
    const end=new Date(d.getFullYear(),d.getMonth(),d.getDate()+1);
    return[start,end];
  }
  if(view==='week'){
    const start=new Date(d.getFullYear(),d.getMonth(),d.getDate()-d.getDay());
    const end=new Date(start.getFullYear(),start.getMonth(),start.getDate()+7);
    return[start,end];
  }
  if(view==='month'){
    const start=new Date(d.getFullYear(),d.getMonth(),1);
    const end=new Date(d.getFullYear(),d.getMonth()+1,1);
    return[start,end];
  }
  // quarter
  const qStartMonth=Math.floor(d.getMonth()/3)*3;
  const start=new Date(d.getFullYear(),qStartMonth,1);
  const end=new Date(d.getFullYear(),qStartMonth+3,1);
  return[start,end];
}

function setCalView(v){calView=v;loadCalEvents();}
function calPrev(){shiftCalDate(-1);loadCalEvents();}
function calNext(){shiftCalDate(1);loadCalEvents();}
function calToday(){calDate=new Date();loadCalEvents();}

function shiftCalDate(dir){
  const d=new Date(calDate);
  if(calView==='day')d.setDate(d.getDate()+dir);
  else if(calView==='week')d.setDate(d.getDate()+7*dir);
  else if(calView==='month')d.setMonth(d.getMonth()+dir);
  else d.setMonth(d.getMonth()+3*dir);
  calDate=d;
}

async function loadBudgets(){
  try{
    const{data,error}=await db.from('budgets').select('*').order('year',{ascending:false});
    if(error)throw error;
    budgets=data||[];
  }catch(e){console.error(e);budgets=[];}
}

async function loadCategories(){
  try{
    const{data,error}=await db.from('categories').select('*').order('sort_order').order('name');
    if(error)throw error;
    if(!data||data.length===0){await seedCategories();}
    else categories=data;
  }catch(e){console.error(e);categories=[];}
  rebuildCatIcon();
  populateCategoryDropdown();
}

async function seedCategories(){
  try{
    const toInsert=defaultCategories.map((c,i)=>({...c,sort_order:i+1}));
    const{data,error}=await db.from('categories').insert(toInsert).select();
    if(error)throw error;
    categories=data||[];
  }catch(e){console.error(e);categories=[];}
}

function rebuildCatIcon(){
  catIcon={};
  categories.forEach(c=>{catIcon[c.name]=c.icon||'📦';});
}

async function loadBuildings(){
  try{
    const{data,error}=await db.from('buildings').select('*').order('name');
    if(error)throw error;
    if(!data||data.length===0){await seedBuildings();}
    else buildings=(data||[]).map(b=>({...b,photo_urls:normalizeIdArray(b.photo_urls),tracked_utilities:b.tracked_utilities==null?null:normalizeIdArray(b.tracked_utilities)}));
  }catch(e){console.error(e);buildings=[];}
  await loadRooms();
  renderBuildingNav();
  populateBuildingDropdowns();
}

async function seedBuildings(){
  try{
    const{data,error}=await db.from('buildings').insert([
      {name:'Church',description:'Main church building'},
      {name:'Education Center',description:'School and education facilities'},
      {name:'Rectory',description:'Priest residence'},
    ]).select();
    if(error)throw error;
    buildings=data||[];
    await seedRooms();
  }catch(e){console.error(e);}
}

async function loadRooms(){
  try{
    const{data,error}=await db.from('rooms').select('*').order('floor').order('name');
    if(error)throw error;
    if(!data||data.length===0)await seedRooms();
    else rooms=data;
  }catch(e){console.error(e);rooms=[];}
}

async function seedRooms(){
  const toInsert=[];
  for(const bld of buildings){
    const roomList=defaultRooms[bld.name]||[];
    roomList.forEach(r=>toInsert.push({...r,building_id:bld.id,building_name:bld.name}));
  }
  if(!toInsert.length)return;
  try{
    const{data,error}=await db.from('rooms').insert(toInsert).select();
    if(error)throw error;
    rooms=data||[];
  }catch(e){console.error(e);}
}

async function loadAssets(){
  try{
    const{data,error}=await db.from('assets').select('*').order('building').order('category').order('description');
    if(error)throw error;
    if(!data||data.length===0)await seedAssets();
    else assets=data;
  }catch(e){console.error(e);assets=[];}
  renderAssets();
}

// Coerces a jsonb / text column that should hold an array of ids into a real array.
// Supabase usually deserializes jsonb → JS array, but legacy rows or schema drift can
// surface strings or nulls — this normalizes them.
function normalizeIdArray(v){
  if(Array.isArray(v))return v;
  if(typeof v==='string'){try{const p=JSON.parse(v);return Array.isArray(p)?p:[];}catch(e){return[];}}
  return[];
}

async function loadWorkOrders(){
  try{
    const{data,error}=await db.from('work_orders').select('*').order('created_at',{ascending:false});
    if(error)throw error;
    workOrders=(data||[]).map(w=>({
      ...w,
      asset_ids:normalizeIdArray(w.asset_ids),
      invoice_ids:normalizeIdArray(w.invoice_ids),
      photo_urls:normalizeIdArray(w.photo_urls),
    }));
  }catch(e){console.error(e);workOrders=[];}
  renderWO();
}

async function loadPM(){
  try{
    const{data,error}=await db.from('pm_schedule').select('*').order('next_due');
    if(error)throw error;
    pmTasks=(data||[]).map(p=>({...p,asset_ids:normalizeIdArray(p.asset_ids)}));
  }catch(e){console.error(e);pmTasks=[];}
  renderPM();
}

async function loadContacts(){
  try{
    const{data,error}=await db.from('contacts').select('*').order('type').order('name');
    if(error)throw error;
    contacts=(data||[]).map(c=>{
      let additional_phones=normalizeIdArray(c.additional_phones);
      // One-shot migration: adopt legacy phone_home as a "Home" entry when no list exists
      if(c.phone_home&&!additional_phones.length)additional_phones=[{label:'Home',number:c.phone_home}];
      // Roles: prefer new roles[] array, fall back to legacy single role string
      let roles=normalizeIdArray(c.roles);
      if(!roles.length&&c.role)roles=[c.role];
      return{...c,people:normalizeIdArray(c.people),additional_phones,roles};
    });
  }catch(e){console.error(e);contacts=[];}
  renderContacts();populateContactDropdowns();
}

async function loadInvoices(){
  try{
    const{data,error}=await db.from('vendor_invoices').select('*').order('date',{ascending:false});
    if(error)throw error;
    invoices=(data||[]).map(i=>({
      ...i,
      asset_ids:normalizeIdArray(i.asset_ids),
      work_order_ids:normalizeIdArray(i.work_order_ids),
      pdf_urls:normalizeIdArray(i.pdf_urls),
    }));
  }catch(e){console.error(e);invoices=[];}
  renderInvoices();
}

// ---- SAVE/DELETE ----
async function saveBuilding(d){
  try{
    if(editingBldId){
      const{data,error}=await db.from('buildings').update(stamp(d,false)).eq('id',editingBldId).select();
      if(error)throw error;
      const i=buildings.findIndex(b=>b.id===editingBldId);
      if(i>-1)buildings[i]={...data[0],photo_urls:normalizeIdArray(data[0].photo_urls),tracked_utilities:data[0].tracked_utilities==null?null:normalizeIdArray(data[0].tracked_utilities)};
      showToast('Building updated!');
    }else{
      const{data,error}=await db.from('buildings').insert([stamp(d,true)]).select();
      if(error)throw error;
      buildings.push({...data[0],photo_urls:normalizeIdArray(data[0].photo_urls),tracked_utilities:data[0].tracked_utilities==null?null:normalizeIdArray(data[0].tracked_utilities)});
      showToast('Building added!');
    }
    editingBldId=null;closeModal('building-modal');
    renderBuildings();renderBuildingNav();populateBuildingDropdowns();
    if(currentBuildingId===editingBldId||currentBuildingId)openBuilding(currentBuildingId);
  }catch(e){console.error(e);showToast('Error saving building');}
}

async function saveRoom(d){
  try{
    if(editingRoomId){
      const{data,error}=await db.from('rooms').update(stamp(d,false)).eq('id',editingRoomId).select();
      if(error)throw error;
      const i=rooms.findIndex(r=>r.id===editingRoomId);
      if(i>-1)rooms[i]=data[0];
      showToast('Room updated!');
    }else{
      const{data,error}=await db.from('rooms').insert([stamp(d,true)]).select();
      if(error)throw error;
      rooms.push(data[0]);
      showToast('Room added!');
    }
    editingRoomId=null;closeModal('room-modal');
    renderRooms();
    if(currentRoomId)renderRoomDetail(currentRoomId);
  }catch(e){console.error(e);showToast('Error saving room');}
}

async function saveAsset(d){
  try{
    let saved=null;
    if(editingAssetId){
      const{data,error}=await db.from('assets').update(stamp(d,false)).eq('id',editingAssetId).select();
      if(error)throw error;
      const i=assets.findIndex(a=>a.id===editingAssetId);
      if(i>-1)assets[i]=data[0];
      saved=data[0];
      showToast('Asset updated!');
    }else{
      const{data,error}=await db.from('assets').insert([stamp(d,true)]).select();
      if(error)throw error;
      assets.unshift(data[0]);
      saved=data[0];
      showToast('Asset added!');
    }
    editingAssetId=null;closeModal('asset-modal');
    renderAssets();renderDash();
    if(currentRoomId)renderRoomDetail(currentRoomId);
    if(afterAssetSave&&saved){
      const cb=afterAssetSave;afterAssetSave=null;
      try{cb(saved);}catch(e){console.error(e);}
    }
  }catch(e){console.error(e);showToast('Error saving asset');}
}

async function deleteAsset(id){
  try{
    const{error}=await db.from('assets').delete().eq('id',id);
    if(error)throw error;
    assets=assets.filter(a=>a.id!==id);
    showToast('Asset deleted');renderAssets();renderDash();
  }catch(e){showToast('Error deleting');}
}

async function saveWO(d){
  try{
    if(editingWOId){
      const{data,error}=await db.from('work_orders').update(stamp(d,false)).eq('id',editingWOId).select();
      if(error)throw error;
      const i=workOrders.findIndex(w=>w.id===editingWOId);
      if(i>-1)workOrders[i]={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),invoice_ids:normalizeIdArray(data[0].invoice_ids),photo_urls:normalizeIdArray(data[0].photo_urls)};
      showToast('Work order updated!');
    }else{
      const{data,error}=await db.from('work_orders').insert([stamp(d,true)]).select();
      if(error)throw error;
      const row={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),invoice_ids:normalizeIdArray(data[0].invoice_ids),photo_urls:normalizeIdArray(data[0].photo_urls)};
      workOrders.unshift(row);
      showToast('Work order saved!');
    }
    editingWOId=null;closeModal('wo-modal');
    renderWO();renderDash();renderHistory();
    if(currentRoomId)renderRoomDetail(currentRoomId);
  }catch(e){console.error(e);showToast('Error saving work order');}
}

async function updateWOStatus(id,status){
  try{
    const upd={status};
    if(status==='Completed')upd.completed_date=new Date().toLocaleDateString();
    const{error}=await db.from('work_orders').update(upd).eq('id',id);
    if(error)throw error;
    const w=workOrders.find(x=>x.id===id);
    if(w)Object.assign(w,upd);
    showToast('Status updated!');renderWO();renderDash();
  }catch(e){showToast('Error updating');}
}

async function deleteWO(id){
  try{
    const{error}=await db.from('work_orders').delete().eq('id',id);
    if(error)throw error;
    workOrders=workOrders.filter(w=>w.id!==id);
    showToast('Work order deleted');renderWO();renderDash();
  }catch(e){showToast('Error deleting');}
}

async function addComment(woId,author,comment){
  try{
    // Auto-stamp the comment with the signed-in user's name + id, falling
    // back to whatever the caller passed (legacy callers may pass "You").
    const finalAuthor=currentUserName()||author||'Unknown';
    const{error}=await db.from('wo_comments').insert([stamp({work_order_id:woId,author:finalAuthor,comment},true)]);
    if(error)throw error;
    showToast('Comment added!');openWODetail(woId);
  }catch(e){showToast('Error adding comment');}
}

async function savePM(d){
  try{
    if(editingPMId){
      const{data,error}=await db.from('pm_schedule').update(stamp(d,false)).eq('id',editingPMId).select();
      if(error)throw error;
      const i=pmTasks.findIndex(p=>p.id===editingPMId);
      if(i>-1)pmTasks[i]={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids)};
      showToast('PM task updated!');
    }else{
      const{data,error}=await db.from('pm_schedule').insert([stamp(d,true)]).select();
      if(error)throw error;
      pmTasks.push({...data[0],asset_ids:normalizeIdArray(data[0].asset_ids)});
      showToast('PM task added!');
    }
    editingPMId=null;closeModal('pm-modal');renderPM();renderDash();
  }catch(e){console.error(e);showToast('Error saving PM task');}
}

// Logs a scheduled date/time/contact against a PM and optionally auto-creates a Work Order
// to track the actual visit. PM remains Upcoming until marked Done.
async function schedulePM(id,{date,time,withWhom,contactPerson,notes,createWO}){
  const pm=pmTasks.find(p=>p.id===id);
  if(!pm)return;
  try{
    const upd={scheduled_date:date||null,scheduled_time:time||null,scheduled_with:withWhom||null,scheduled_contact_person:contactPerson||null,scheduled_notes:notes||null};
    const{error}=await db.from('pm_schedule').update(upd).eq('id',id);
    if(error)throw error;
    Object.assign(pm,upd);
    let toastMsg='PM scheduled';
    if(createWO){
      const dueStr=date?(time?`${date} ${time}`:date):'';
      const whom=[withWhom,contactPerson].filter(Boolean).join(' — ');
      const woData={
        issue:pm.title+' (Scheduled PM)',
        building:pm.building||'All Buildings',
        priority:'Medium',
        assignee:whom||pm.assigned_to||'—',
        due_date:dueStr,
        status:'Open',
        notes:`Auto-created from PM schedule${contactPerson?'. Contact: '+contactPerson:''}${notes?'. '+notes:''}`,
        asset_ids:Array.isArray(pm.asset_ids)?pm.asset_ids:[],
      };
      try{
        const{data:woRes,error:woErr}=await db.from('work_orders').insert([stamp(woData,true)]).select();
        if(!woErr&&woRes?.[0]){
          workOrders.unshift({...woRes[0],asset_ids:normalizeIdArray(woRes[0].asset_ids),invoice_ids:normalizeIdArray(woRes[0].invoice_ids),photo_urls:normalizeIdArray(woRes[0].photo_urls)});
          toastMsg='PM scheduled + Work Order created';
        }
      }catch(e){console.error('PM schedule WO failed:',e);}
    }
    closeModal('pm-schedule-modal');
    showToast(toastMsg);
    renderPM();renderWO();renderDash();
  }catch(e){console.error(e);showToast('Error scheduling PM');}
}

async function clearPMSchedule(id){
  const pm=pmTasks.find(p=>p.id===id);
  if(!pm)return;
  try{
    const upd={scheduled_date:null,scheduled_time:null,scheduled_with:null,scheduled_contact_person:null,scheduled_notes:null};
    const{error}=await db.from('pm_schedule').update(upd).eq('id',id);
    if(error)throw error;
    Object.assign(pm,upd);
    closeModal('pm-schedule-modal');
    showToast('Schedule cleared');
    renderPM();
  }catch(e){console.error(e);showToast('Error');}
}

async function markPMDone(id){
  const pm=pmTasks.find(x=>x.id===id);
  if(!pm){showToast('PM not found');return;}
  const today=new Date().toLocaleDateString();
  try{
    const{error}=await db.from('pm_schedule').update({status:'Done',last_completed:today}).eq('id',id);
    if(error)throw error;
    pm.status='Done';pm.last_completed=today;

    // Auto-log to service history: create one completed WO carrying the PM's linked assets.
    // Shows up on the asset service record, the Service History page, and the WO table.
    try{
      const pmAssets=Array.isArray(pm.asset_ids)?pm.asset_ids:[];
      const woData={
        issue:pm.title+' (PM)',
        building:pm.building||'All Buildings',
        priority:'Medium',
        assignee:pm.assigned_to||'—',
        status:'Completed',
        completed_date:today,
        notes:`Auto-logged from PM completion${pm.description?': '+pm.description:''}`,
        asset_ids:pmAssets,
      };
      const{data:woRes,error:woErr}=await db.from('work_orders').insert([stamp(woData,true)]).select();
      if(!woErr&&woRes?.[0]){
        const row={...woRes[0],asset_ids:normalizeIdArray(woRes[0].asset_ids),invoice_ids:normalizeIdArray(woRes[0].invoice_ids),photo_urls:normalizeIdArray(woRes[0].photo_urls)};
        workOrders.unshift(row);
      }
    }catch(e){console.error('PM auto-log failed:',e);}

    showToast('PM marked done — service record logged');
    renderPM();renderDash();renderWO();renderHistory();
  }catch(e){console.error(e);showToast('Error');}
}

async function deletePM(id){
  try{
    const{error}=await db.from('pm_schedule').delete().eq('id',id);
    if(error)throw error;
    pmTasks=pmTasks.filter(p=>p.id!==id);
    showToast('PM task deleted');renderPM();
  }catch(e){showToast('Error deleting');}
}

async function saveContact(d){
  try{
    let saved=null;
    if(editingContactId){
      const{data,error}=await db.from('contacts').update(stamp(d,false)).eq('id',editingContactId).select();
      if(error)throw error;
      const i=contacts.findIndex(c=>c.id===editingContactId);
      if(i>-1)contacts[i]=data[0];
      saved=data[0];
      showToast('Contact updated!');
    }else{
      const{data,error}=await db.from('contacts').insert([stamp(d,true)]).select();
      if(error)throw error;
      contacts.push(data[0]);
      saved=data[0];
      showToast('Contact added!');
    }
    editingContactId=null;closeModal('contact-modal');renderContacts();populateContactDropdowns();
    if(afterContactSave&&saved){
      const cb=afterContactSave;afterContactSave=null;
      try{cb(saved);}catch(e){console.error(e);}
    }
  }catch(e){console.error(e);showToast('Error saving contact');}
}

// Appends a new point-of-contact person to a contact's people[] jsonb and persists.
// Used from inline "+ Add new contact" flows (e.g. PM scheduling modal).
async function addPersonToContact(contactId,person){
  const c=contacts.find(x=>x.id===contactId);
  if(!c)return null;
  const people=Array.isArray(c.people)?[...c.people,person]:[person];
  try{
    const{error}=await db.from('contacts').update({people}).eq('id',contactId);
    if(error)throw error;
    c.people=people;
    return person;
  }catch(e){console.error(e);showToast('Error adding contact person');return null;}
}

async function updatePersonOnContact(contactId,personIndex,newData){
  const c=contacts.find(x=>x.id===contactId);
  if(!c||!Array.isArray(c.people)||personIndex<0||personIndex>=c.people.length)return false;
  const people=[...c.people];
  people[personIndex]=newData;
  try{
    const{error}=await db.from('contacts').update({people}).eq('id',contactId);
    if(error)throw error;
    c.people=people;
    return true;
  }catch(e){console.error(e);showToast('Error updating contact person');return false;}
}

async function deletePersonFromContact(contactId,personIndex){
  const c=contacts.find(x=>x.id===contactId);
  if(!c||!Array.isArray(c.people)||personIndex<0||personIndex>=c.people.length)return;
  const people=c.people.filter((_,i)=>i!==personIndex);
  try{
    const{error}=await db.from('contacts').update({people}).eq('id',contactId);
    if(error)throw error;
    c.people=people;
    showToast('Point of contact removed');
    renderContacts();
  }catch(e){console.error(e);showToast('Error removing');}
}

async function deleteContact(id){
  try{
    const{error}=await db.from('contacts').delete().eq('id',id);
    if(error)throw error;
    contacts=contacts.filter(c=>c.id!==id);
    showToast('Contact deleted');renderContacts();
  }catch(e){showToast('Error deleting');}
}

async function saveInvoice(d){
  try{
    // Capture the invoice's OLD work_order_ids before the write, so we can
    // diff against the NEW list and keep the reciprocal links in sync.
    const oldWOIds=editingInvId?(invoices.find(x=>x.id===editingInvId)?.work_order_ids||[]):[];
    let saved;
    if(editingInvId){
      const{data,error}=await db.from('vendor_invoices').update(stamp(d,false)).eq('id',editingInvId).select();
      if(error)throw error;
      const normalized={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),work_order_ids:normalizeIdArray(data[0].work_order_ids),pdf_urls:normalizeIdArray(data[0].pdf_urls)};
      const i=invoices.findIndex(x=>x.id===editingInvId);
      if(i>-1)invoices[i]=normalized;
      saved=normalized;
      showToast('Invoice updated!');
    }else{
      const{data,error}=await db.from('vendor_invoices').insert([stamp(d,true)]).select();
      if(error)throw error;
      const normalized={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),work_order_ids:normalizeIdArray(data[0].work_order_ids),pdf_urls:normalizeIdArray(data[0].pdf_urls)};
      invoices.unshift(normalized);
      saved=normalized;
      showToast('Invoice added!');
    }
    await syncWOInvoiceLinks(saved.id,d.work_order_ids||[],oldWOIds);
    editingInvId=null;closeModal('invoice-modal');renderInvoices();renderWO();
  }catch(e){console.error(e);showToast('Error saving invoice');}
}

// Keeps work_orders.invoice_ids in sync when an invoice's work_order_ids changes.
async function syncWOInvoiceLinks(invoiceId,newIds,oldIds){
  const toAdd=newIds.filter(id=>!oldIds.includes(id));
  const toRemove=oldIds.filter(id=>!newIds.includes(id));
  for(const woId of toAdd){
    const wo=workOrders.find(w=>w.id===woId);
    if(!wo)continue;
    const ids=Array.isArray(wo.invoice_ids)?[...wo.invoice_ids]:[];
    if(!ids.includes(invoiceId))ids.push(invoiceId);
    try{await db.from('work_orders').update({invoice_ids:ids}).eq('id',woId);wo.invoice_ids=ids;}catch(e){console.error(e);}
  }
  for(const woId of toRemove){
    const wo=workOrders.find(w=>w.id===woId);
    if(!wo)continue;
    const ids=(Array.isArray(wo.invoice_ids)?wo.invoice_ids:[]).filter(x=>x!==invoiceId);
    try{await db.from('work_orders').update({invoice_ids:ids}).eq('id',woId);wo.invoice_ids=ids;}catch(e){console.error(e);}
  }
}

async function deleteInvoice(id){
  try{
    const{error}=await db.from('vendor_invoices').delete().eq('id',id);
    if(error)throw error;
    invoices=invoices.filter(x=>x.id!==id);
    showToast('Invoice deleted');renderInvoices();
  }catch(e){showToast('Error deleting');}
}

async function saveCategory(d){
  try{
    if(editingCategoryId){
      const old=categories.find(c=>c.id===editingCategoryId);
      const renamed=old&&old.name!==d.name;
      const{data,error}=await db.from('categories').update(stamp(d,false)).eq('id',editingCategoryId).select();
      if(error)throw error;
      const i=categories.findIndex(c=>c.id===editingCategoryId);
      if(i>-1)categories[i]=data[0];
      // Rename: update all assets using the old category name
      if(renamed){
        await db.from('assets').update({category:d.name}).eq('category',old.name);
        assets.forEach(a=>{if(a.category===old.name)a.category=d.name;});
      }
      showToast('Category updated!');
    }else{
      const sort_order=(categories.reduce((m,c)=>Math.max(m,c.sort_order||0),0))+1;
      const{data,error}=await db.from('categories').insert([stamp({...d,sort_order},true)]).select();
      if(error)throw error;
      categories.push(data[0]);
      showToast('Category added!');
    }
    editingCategoryId=null;closeModal('category-modal');
    rebuildCatIcon();populateCategoryDropdown();
    renderSettings();renderAssets();renderDash();
  }catch(e){console.error(e);showToast('Error saving category');}
}

async function deleteCategory(id){
  const c=categories.find(x=>x.id===id);
  if(!c)return;
  const inUse=assets.filter(a=>a.category===c.name).length;
  if(inUse>0){
    showToast(`Cannot delete — ${inUse} asset${inUse>1?'s':''} still use "${c.name}"`);
    return;
  }
  try{
    const{error}=await db.from('categories').delete().eq('id',id);
    if(error)throw error;
    categories=categories.filter(x=>x.id!==id);
    rebuildCatIcon();populateCategoryDropdown();
    showToast('Category deleted');renderSettings();
  }catch(e){showToast('Error deleting');}
}

// ---- MULTI-PHOTO HELPERS ----
// Each modal that handles photos maintains an entry in photoStates keyed by
// a short name ('asset' | 'wo' | 'room'). init on modal open, finalize on save.
const photoStates={};

function initPhotoState(key,existing){
  photoStates[key]={
    existing:(existing||[]).filter(Boolean),
    pending:[],          // File objects not yet uploaded
    pendingPreviews:[],  // data URLs for preview
    removed:[],          // URLs of existing photos marked for removal
  };
}

function renderPhotoGallery(key,galleryId){
  const s=photoStates[key];
  const el=document.getElementById(galleryId);
  if(!el||!s)return;
  const kept=s.existing.filter(u=>!s.removed.includes(u));
  const thumbs=[
    ...kept.map(p=>{
      const display=signedPhotoUrl(p);
      return`<div class="photo-thumb"><img src="${display}" onclick="openLightbox('${display}')"><button type="button" onclick="removeExistingPhoto('${key}','${p}','${galleryId}')">×</button></div>`;
    }),
    ...s.pendingPreviews.map((p,i)=>`<div class="photo-thumb"><img src="${p}"><button type="button" onclick="removePendingPhoto('${key}',${i},'${galleryId}')">×</button></div>`),
  ];
  el.innerHTML=thumbs.join('')||'<div style="font-size:12px;color:var(--text3);padding:4px 0">No photos yet</div>';
}

function addPendingPhotos(key,event,galleryId){
  const files=Array.from(event.target.files||[]);
  const s=photoStates[key];
  if(!s)return;
  files.forEach(f=>{
    s.pending.push(f);
    const reader=new FileReader();
    reader.onload=e=>{s.pendingPreviews.push(e.target.result);renderPhotoGallery(key,galleryId);};
    reader.readAsDataURL(f);
  });
  event.target.value='';
}

function removeExistingPhoto(key,url,galleryId){
  const s=photoStates[key];if(!s)return;
  s.removed.push(url);renderPhotoGallery(key,galleryId);
}

function removePendingPhoto(key,idx,galleryId){
  const s=photoStates[key];if(!s)return;
  s.pending.splice(idx,1);
  s.pendingPreviews.splice(idx,1);
  renderPhotoGallery(key,galleryId);
}

async function finalizePhotos(key,folder){
  const s=photoStates[key];
  if(!s)return[];
  const kept=s.existing.filter(u=>!s.removed.includes(u));
  const uploaded=[];
  for(const f of s.pending){
    const url=await uploadFile(f,folder);
    if(url)uploaded.push(url);
  }
  return[...kept,...uploaded];
}

// ---- SIGNED URL CACHE ----
// After the storage lockdown, every stored photo/PDF/COI value in the DB is a
// RELATIVE PATH inside a Supabase bucket (e.g. "assets/1712-abc.jpg"), not a
// full URL. We generate signed URLs for everything in memory on load and keep
// them in this cache. Display code goes through signedPhotoUrl/signedDocUrl
// so no callsite needs to know about buckets.
const _signedUrlCache=new Map();
const SIGNED_URL_TTL_SECONDS=60*60*12; // 12 hours; refreshSignedUrls runs after loadAll

// Heuristic: values that start with http are legacy rows that weren't migrated
// to paths yet. Return them as-is so nothing 404s during the transition.
function _looksLikeUrl(v){return typeof v==='string'&&v.startsWith('http');}

function signedPhotoUrl(path){
  if(!path)return'';
  if(_looksLikeUrl(path))return path;
  return _signedUrlCache.get(path)||path;
}
function signedDocUrl(path){
  if(!path)return'';
  if(_looksLikeUrl(path))return path;
  return _signedUrlCache.get(path)||path;
}

// Collects every storage path in memory and mints signed URLs in batches.
// Called by loadAll after all tables have been fetched.
async function refreshSignedUrls(){
  const photoPaths=new Set();
  const docPaths=new Set();
  const addP=v=>{if(v&&!_looksLikeUrl(v))photoPaths.add(v);};
  const addD=v=>{if(v&&!_looksLikeUrl(v))docPaths.add(v);};
  const takePhotos=arr=>{(arr||[]).forEach(o=>{(o.photo_urls||[]).forEach(addP);if(o.photo_url)addP(o.photo_url);});};
  const takePDFs=arr=>{(arr||[]).forEach(o=>{(o.pdf_urls||[]).forEach(addD);if(o.pdf_url)addD(o.pdf_url);});};
  takePhotos(assets);takePhotos(workOrders);takePhotos(rooms);takePhotos(buildings);takePhotos(projects);
  takePDFs(quotes);takePDFs(invoices);takePDFs(utilityReadings);takePDFs(projects);
  (contacts||[]).forEach(c=>{if(c.coi_url)addD(c.coi_url);});
  await Promise.all([
    _batchSign('asset-photos',[...photoPaths]),
    _batchSign('documents',[...docPaths]),
  ]);
}

async function _batchSign(bucket,paths){
  if(!paths.length)return;
  try{
    // createSignedUrls takes an array; returns one entry per path with signedUrl or error
    const{data,error}=await db.storage.from(bucket).createSignedUrls(paths,SIGNED_URL_TTL_SECONDS);
    if(error){console.error('batch sign',bucket,error);return;}
    for(const item of(data||[])){
      if(item.signedUrl&&!item.error)_signedUrlCache.set(item.path,item.signedUrl);
    }
  }catch(e){console.error('batch sign failed',bucket,e);}
}

// Mint one signed URL and pop it in the cache (used right after an upload so
// the just-saved record displays without waiting for a full cache refresh).
async function _signOne(bucket,path){
  try{
    const{data,error}=await db.storage.from(bucket).createSignedUrl(path,SIGNED_URL_TTL_SECONDS);
    if(!error&&data?.signedUrl)_signedUrlCache.set(path,data.signedUrl);
  }catch(e){console.error('sign one failed',bucket,path,e);}
}

// Returns the first available photo URL (resolved through the signed-URL cache).
function firstPhoto(obj){
  const p=obj?.photo_urls&&Array.isArray(obj.photo_urls)&&obj.photo_urls.length>0?obj.photo_urls[0]:obj?.photo_url||null;
  return p?signedPhotoUrl(p):null;
}
function photoCount(obj){
  if(obj?.photo_urls&&Array.isArray(obj.photo_urls))return obj.photo_urls.length;
  return obj?.photo_url?1:0;
}
function allPhotos(obj){
  const paths=obj?.photo_urls&&Array.isArray(obj.photo_urls)&&obj.photo_urls.length>0?obj.photo_urls:(obj?.photo_url?[obj.photo_url]:[]);
  return paths.map(signedPhotoUrl);
}

// Same pattern for PDFs: pdf_urls[] with fallback to single pdf_url
function allPDFs(obj){
  const paths=obj?.pdf_urls&&Array.isArray(obj.pdf_urls)&&obj.pdf_urls.length>0?obj.pdf_urls:(obj?.pdf_url?[obj.pdf_url]:[]);
  return paths.map(signedDocUrl);
}

// COI documents are stored as a scalar path on the contact row.
function coiUrl(obj){return obj?.coi_url?signedDocUrl(obj.coi_url):'';}

// PDF list UI (reuses photoStates for pending/existing/removed tracking)
function addPendingPDFs(key,event,listId){
  const s=photoStates[key];
  if(!s)return;
  Array.from(event.target.files||[]).forEach(f=>s.pending.push(f));
  renderPDFList(key,listId);
  event.target.value='';
}

function renderPDFList(key,listId){
  const s=photoStates[key];
  const el=document.getElementById(listId);
  if(!el||!s)return;
  const kept=s.existing.filter(u=>!s.removed.includes(u));
  const escape=str=>(str||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const rows=[];
  kept.forEach((p,i)=>{
    const display=signedDocUrl(p);
    const filename=decodeURIComponent((p.split('/').pop()||'document.pdf').split('?')[0]);
    rows.push(`<div class="pdf-row">
      <a href="${display}" target="_blank" class="pdf-link" onclick="event.stopPropagation()">📄 ${escape(filename)}</a>
      <button type="button" class="btn btn-danger btn-sm" onclick="removePDFExisting('${key}',${i},'${listId}')">✕</button>
    </div>`);
  });
  s.pending.forEach((f,i)=>{
    rows.push(`<div class="pdf-row">
      <span class="pdf-link pdf-pending">📄 ${escape(f.name)} <span style="color:var(--success);font-size:11px">(ready to upload)</span></span>
      <button type="button" class="btn btn-danger btn-sm" onclick="removePDFPending('${key}',${i},'${listId}')">✕</button>
    </div>`);
  });
  el.innerHTML=rows.length?rows.join(''):'<div style="font-size:12px;color:var(--text3);padding:4px 0">No PDFs attached.</div>';
}

function removePDFExisting(key,idx,listId){
  const s=photoStates[key];
  if(!s)return;
  const kept=s.existing.filter(u=>!s.removed.includes(u));
  if(idx>=0&&idx<kept.length)s.removed.push(kept[idx]);
  renderPDFList(key,listId);
}

function removePDFPending(key,idx,listId){
  const s=photoStates[key];
  if(!s)return;
  s.pending.splice(idx,1);
  renderPDFList(key,listId);
}

async function saveBudget(d){
  // One row per year; upsert on year.
  try{
    const existing=budgets.find(b=>b.year===d.year);
    if(existing){
      const{data,error}=await db.from('budgets').update({amount:d.amount,notes:d.notes,updated_at:new Date().toISOString()}).eq('id',existing.id).select();
      if(error)throw error;
      const i=budgets.findIndex(b=>b.id===existing.id);
      if(i>-1)budgets[i]=data[0];
      showToast('Budget updated!');
    }else{
      const{data,error}=await db.from('budgets').insert([stamp(d,true)]).select();
      if(error)throw error;
      budgets.push(data[0]);
      showToast('Budget saved!');
    }
    editingBudgetId=null;closeModal('budget-modal');
    renderFinance();
  }catch(e){console.error(e);showToast('Error saving budget');}
}

// Ref-counted spinner overlay — stays up as long as any async work is pending.
let _spinnerRefs=0;
function showSpinner(label){
  _spinnerRefs++;
  const ov=document.getElementById('spinner-overlay');
  const lb=document.getElementById('spinner-label');
  if(lb&&label)lb.textContent=label;
  if(ov)ov.classList.add('show');
}
function hideSpinner(){
  _spinnerRefs=Math.max(0,_spinnerRefs-1);
  if(_spinnerRefs===0){
    const ov=document.getElementById('spinner-overlay');
    if(ov)ov.classList.remove('show');
  }
}

async function uploadFile(file,folder){
  showSpinner(`Uploading ${file.name}…`);
  try{
    const ext=file.name.split('.').pop();
    const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const bucket=(folder==='coi'||folder==='invoices'||folder==='quotes'||folder==='utilities')?'documents':'asset-photos';
    const{error}=await db.storage.from(bucket).upload(path,file);
    if(error)throw error;
    // Pre-cache a signed URL so the just-saved record displays immediately;
    // the record in the DB stores the RELATIVE PATH only.
    await _signOne(bucket,path);
    return path;
  }catch(e){console.error(e);showToast('Error uploading file');return null;}
  finally{hideSpinner();}
}

// ---- CSV ----
function exportCSV(){
  const headers=['description','building','category','room_number','location','serial','manufacturer','size','expected_life','install_date','warranty_expiry','status','notes'];
  const rows=assets.map(a=>headers.map(h=>`"${(a[h]||'').toString().replace(/"/g,'""')}"`).join(','));
  const csv=[headers.join(','),...rows].join('\n');
  const blob=new Blob([csv],{type:'text/csv'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download='st-francis-assets.csv';a.click();
  URL.revokeObjectURL(url);showToast('CSV exported!');
}

async function importCSV(event){
  const file=event.target.files[0];if(!file)return;
  const text=await file.text();
  const lines=text.split('\n').filter(l=>l.trim());
  if(lines.length<2){showToast('CSV appears empty');return;}
  const headers=lines[0].split(',').map(h=>h.trim().replace(/^"|"$/g,'').toLowerCase());
  const rows=lines.slice(1).map(line=>{
    const vals=[];let cur='',inQ=false;
    for(const ch of line){if(ch==='"'){inQ=!inQ;}else if(ch===','&&!inQ){vals.push(cur.trim());cur='';}else cur+=ch;}
    vals.push(cur.trim());
    const obj={};headers.forEach((h,i)=>obj[h]=(vals[i]||'').replace(/^"|"$/g,''));
    return obj;
  }).filter(r=>r.description||r.name);
  if(!rows.length){showToast('No valid rows found');return;}
  try{
    const toInsert=rows.map(r=>({
      description:r.description||r.name||'',building:r.building||'Church',category:r.category||'Other',
      room_number:r.room_number||r.room||'',location:r.location||'',serial:r.serial||r.serial_number||'',
      manufacturer:r.manufacturer||'',size:r.size||'',expected_life:r.expected_life||r.life||'',
      install_date:r.install_date||'',warranty_expiry:r.warranty_expiry||r.warranty||'',
      status:r.status||'Active',notes:r.notes||'',
    }));
    const{data,error}=await db.from('assets').insert(toInsert).select();
    if(error)throw error;
    assets=[...data,...assets];
    showToast('Imported '+data.length+' assets!');renderAssets();renderDash();
  }catch(e){console.error(e);showToast('Error importing CSV');}
  event.target.value='';
}

// ---- SEED ASSETS ----
async function seedAssets(){
  try{
    const{data,error}=await db.from('assets').insert(defaultAssets).select();
    if(error)throw error;
    assets=data||[];
    showToast('Asset registry loaded — '+assets.length+' assets added!');
    // Link assets to rooms where possible
    await linkAssetsToRooms();
  }catch(e){console.error(e);assets=[];}
}

async function linkAssetsToRooms(){
  for(const a of assets){
    if(!a.room_number)continue;
    const bldRooms=rooms.filter(r=>r.building_name===a.building);
    const match=bldRooms.find(r=>r.name.toLowerCase()===a.room_number.toLowerCase()||r.name.toLowerCase().includes(a.room_number.toLowerCase()));
    if(match&&!a.room_id){
      try{
        await db.from('assets').update({room_id:match.id}).eq('id',a.id);
        a.room_id=match.id;
      }catch(e){}
    }
  }
}

// ---- NAVIGATION ----
function go(name,el){
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  const v=document.getElementById('view-'+name);
  if(v)v.classList.add('active');
  if(el){
    el.classList.add('active');
    // Auto-expand the containing nav section so the active item is visible
    const section=el.closest('.nav-section');
    if(section?.classList.contains('collapsed')){
      section.classList.remove('collapsed');
      try{localStorage.setItem('nav-'+section.dataset.nav,'0');}catch(e){}
    }
  }
  if(name==='buildings')renderBuildings();
  if(name==='settings')renderSettings();
  if(name==='contacts')renderContacts();
  if(name==='pm-report')renderPMReport();
  if(name==='coi-report')renderCOIReport();
  if(name==='finance')renderFinance();
  if(name==='calendar')loadCalEvents();
  if(name==='supplies'){renderSupplies();renderSupplyRequestsList();}
  if(name==='quotes')renderQuotes();
  if(name==='projects')renderProjects();
  if(name==='projects-finance-report')renderProjectsFinanceReport();
  if(name==='projects-parish-report')renderProjectsParishReport();
  if(name==='conflicts')renderConflicts();
  if(name==='my-work')renderMyWork();
  renderHistory();
  autoCloseMobileSidebar();
}

function goContacts(type,el){
  currentContactType=type;
  go('contacts',el);
}

// Dashboard stat card navigations — jumps to the page and pre-applies a filter.
function dashGoOpenWOs(){
  go('workorders');
  const sel=document.getElementById('wo-f-status');
  if(sel){sel.value='Open';renderWO();}
}
function dashGoPMDue(){
  pmMode='upcoming';pmWindow='current';
  go('pm');
}
function dashGoAttention(){
  go('assets');
  const sel=document.getElementById('af-status');
  if(sel){sel.value='Maintenance';renderAssets();}
}

function showToast(msg){
  const t=document.getElementById('toast');
  t.textContent=msg;t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'),3000);
}

// ---- DRAG-AND-DROP UPLOADS ----
// Routes drops onto any .photo-upload element into that zone's file input,
// then fires the input's existing onchange handler. Globally prevents the
// browser from opening a dropped file when dropped outside a dropzone.
function setupDragDropUploads(){
  ['dragenter','dragover'].forEach(type=>{
    document.addEventListener(type,e=>{
      const zone=e.target.closest?.('.photo-upload');
      e.preventDefault();
      if(zone)zone.classList.add('drag-over');
    });
  });
  document.addEventListener('dragleave',e=>{
    const zone=e.target.closest?.('.photo-upload');
    if(zone&&!zone.contains(e.relatedTarget))zone.classList.remove('drag-over');
  });
  document.addEventListener('drop',e=>{
    e.preventDefault();
    const zone=e.target.closest?.('.photo-upload');
    if(!zone)return;
    zone.classList.remove('drag-over');
    const input=zone.querySelector('input[type=file]');
    if(!input||!e.dataTransfer?.files?.length)return;
    try{
      const dt=new DataTransfer();
      for(const file of e.dataTransfer.files){
        if(!fileMatchesAccept(file,input.accept))continue;
        dt.items.add(file);
      }
      if(!dt.files.length){showToast('No matching file types');return;}
      input.files=dt.files;
      input.dispatchEvent(new Event('change'));
    }catch(err){console.error(err);showToast('Drag-drop upload failed');}
  });
}

function fileMatchesAccept(file,acceptAttr){
  if(!acceptAttr)return true;
  const accepts=acceptAttr.split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
  if(!accepts.length)return true;
  const fileType=(file.type||'').toLowerCase();
  const ext='.'+(file.name.split('.').pop()||'').toLowerCase();
  return accepts.some(a=>{
    if(a.startsWith('.'))return ext===a;
    if(a.endsWith('/*'))return fileType.startsWith(a.slice(0,-1));
    return fileType===a;
  });
}

// ---- COLLAPSIBLE CARDS ----
function toggleCard(el){
  if(!el)return;
  const collapsed=el.classList.toggle('collapsed');
  const id=el.dataset.collapseId;
  if(id){try{localStorage.setItem('card-'+id,collapsed?'1':'0');}catch(e){}}
}

function initCollapsibleCards(){
  document.querySelectorAll('.card.collapsible[data-collapse-id]').forEach(el=>{
    try{
      if(localStorage.getItem('card-'+el.dataset.collapseId)==='1')el.classList.add('collapsed');
    }catch(e){}
  });
}

// ---- COLLAPSIBLE SIDEBAR SECTIONS ----
// Keeps a persisted collapsed state per nav section so the sidebar stays tidy
// across sessions. Keyed by the section's data-nav attribute.
function toggleNavSection(labelEl){
  const section=labelEl?.closest('.nav-section');
  if(!section)return;
  const collapsed=section.classList.toggle('collapsed');
  const key=section.dataset.nav;
  if(key){try{localStorage.setItem('nav-'+key,collapsed?'1':'0');}catch(e){}}
}

function initCollapsibleNav(){
  document.querySelectorAll('.nav-section[data-nav]').forEach(section=>{
    try{
      if(localStorage.getItem('nav-'+section.dataset.nav)==='1')section.classList.add('collapsed');
    }catch(e){}
  });
}

// ---- SIDEBAR SHOW/HIDE ----
// On desktop, toggling removes the sidebar entirely (persisted). On mobile,
// toggling slides the off-canvas drawer in/out (not persisted — tap-anywhere
// closes, next visit starts closed).
function isMobileViewport(){return window.matchMedia('(max-width:768px)').matches;}

function toggleSidebar(){
  const app=document.querySelector('.app');
  if(!app)return;
  if(isMobileViewport()){
    app.classList.toggle('sidebar-open');
  }else{
    const hidden=app.classList.toggle('sidebar-hidden');
    try{localStorage.setItem('sidebar-hidden',hidden?'1':'0');}catch(e){}
  }
}

function initSidebarState(){
  const app=document.querySelector('.app');
  if(!app)return;
  if(!isMobileViewport()){
    try{
      if(localStorage.getItem('sidebar-hidden')==='1')app.classList.add('sidebar-hidden');
    }catch(e){}
  }
}

// Close the mobile drawer after the user picks a nav item.
function autoCloseMobileSidebar(){
  if(!isMobileViewport())return;
  document.querySelector('.app')?.classList.remove('sidebar-open');
}

// ---- AI DOCUMENT UPLOAD ----
// Drop a PDF on the dashboard → upload to Supabase Storage → call /api/parse-doc
// → open the matching modal pre-filled with what the AI extracted, with a banner
// telling the user to review before saving.

function handleAIDrop(event){
  const file=event?.target?.files?.[0];
  if(!file)return;
  parseAndRouteDoc(file);
  // Reset so the same file can be picked again later
  event.target.value='';
}

async function parseAndRouteDoc(file){
  if(!file||file.type!=='application/pdf'){showToast('Please drop a PDF');return;}
  showSpinner('Uploading & analyzing document…');
  try{
    // 1. Upload to Supabase Storage so the AI function can fetch it by URL.
    //    Bucket is private now, so we mint a short-lived signed URL for the
    //    serverless function to fetch. The stored DB value is just the path.
    const ext=file.name.split('.').pop()||'pdf';
    const path=`inbox/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const{error:upErr}=await db.storage.from('documents').upload(path,file);
    if(upErr)throw upErr;
    const{data:signed,error:sErr}=await db.storage.from('documents').createSignedUrl(path,60*5);
    if(sErr||!signed?.signedUrl)throw(sErr||new Error('could not sign URL'));
    const pdfUrl=signed.signedUrl;
    // Also pre-cache a longer-lived signed URL so the final record displays it
    await _signOne('documents',path);

    // 2. Build context — buildings (with utility account numbers from existing readings)
    //    and currently-open work orders, so the AI can suggest a match.
    const bldContext=buildings.map(b=>{
      const accts=[...new Set(utilityReadings.filter(u=>u.building_id===b.id&&u.account_number).map(u=>u.account_number))];
      return{id:b.id,name:b.name,utility_account_numbers:accts};
    });
    const openWOContext=workOrders
      .filter(w=>w.status!=='Completed')
      .slice(0,40)
      .map(w=>({id:w.id,vendor:w.assignee,issue:w.issue,date:w.due_date||w.created_at}));

    // 3. Call the serverless function.
    const res=await fetch('/api/parse-doc',{
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({pdfUrl,buildings:bldContext,openWOs:openWOContext}),
    });
    if(!res.ok){
      const detail=await res.text();
      console.error('parse-doc failed:',res.status,detail);
      showToast(`Analyze failed (${res.status}): ${detail.slice(0,140)}`);
      return;
    }
    const result=await res.json();
    if(result?.error){
      console.error('parse-doc error:',result);
      showToast(`AI: ${result.error} — ${(result.detail||'').toString().slice(0,140)}`);
      return;
    }
    routeParsedDoc(result,path);
  }catch(e){
    console.error(e);showToast('Error processing document');
  }finally{hideSpinner();}
}

// Takes the AI's parsed result + the stored PDF path, picks the right modal,
// opens it, then fills in fields. The PDF is attached to the new record's
// pdf_urls (as a PATH — display code resolves to a signed URL via the cache)
// so it stays linked even if the user just hits Save.
function routeParsedDoc(result,pdfPath){
  const{type,confidence,fields={},matched_wo_id,notes}=result||{};
  const buildingId=resolveBuildingId(fields.building_hint,fields.account_number);
  const buildingName=buildingId?(buildings.find(b=>b.id===buildingId)?.name||null):null;

  switch(type){
    case'invoice':
      openInvoiceModal();
      setTimeout(()=>prefillInvoiceForm({...fields,buildingName,matched_wo_id,confidence,notes,pdfPath}),120);
      break;
    case'utility_bill':
      openUtilityModal();
      setTimeout(()=>prefillUtilityForm({...fields,buildingId,confidence,notes,pdfPath}),120);
      break;
    case'quote':
      openQuoteModal();
      setTimeout(()=>prefillQuoteForm({...fields,buildingName,confidence,notes,pdfPath}),120);
      break;
    case'coi':
      showToast('Detected: Certificate of Insurance — open the contractor and use Update COI');
      break;
    default:
      showToast(`AI couldn't classify this document (${confidence||'low'} confidence)`);
  }
}

// Try to map building_hint/account_number to one of the parish buildings.
function resolveBuildingId(hint,acct){
  if(acct){
    const bldByAcct=buildings.find(b=>utilityReadings.some(u=>u.building_id===b.id&&u.account_number===acct));
    if(bldByAcct)return bldByAcct.id;
  }
  if(hint){
    const lower=hint.toLowerCase();
    const exact=buildings.find(b=>b.name.toLowerCase()===lower);
    if(exact)return exact.id;
    const partial=buildings.find(b=>lower.includes(b.name.toLowerCase())||b.name.toLowerCase().includes(lower));
    if(partial)return partial.id;
  }
  return null;
}

function aiBanner(confidence,notes){
  return`<div class="ai-prefill-banner">
    <span style="font-size:16px">✨</span>
    <div>
      <strong>AI pre-filled this from your document (${confidence||'medium'} confidence).</strong>
      Please review every field before saving.
      ${notes?`<div style="margin-top:4px;font-size:11.5px;font-style:italic">${notes}</div>`:''}
    </div>
  </div>`;
}

function setVal(id,val){
  if(val===null||val===undefined||val==='')return;
  const el=document.getElementById(id);
  if(!el)return;
  // For selects, only set if the option exists; otherwise leave blank for the user to pick
  if(el.tagName==='SELECT'){
    const opt=[...el.options].find(o=>o.value===String(val)||o.textContent===String(val));
    if(opt)el.value=opt.value;
  }else{
    el.value=val;
  }
}

function prefillInvoiceForm(d){
  const body=document.getElementById('inv-body');
  if(body&&!body.querySelector('.ai-prefill-banner')){
    body.insertAdjacentHTML('afterbegin',aiBanner(d.confidence,d.notes));
  }
  setVal('inv-num',d.invoice_number);
  setVal('inv-date',d.date);
  setVal('inv-vendor',d.vendor);
  setVal('inv-bld',d.buildingName);
  setVal('inv-desc',d.description);
  setVal('inv-amount',d.amount);
  // Attach the source PDF so saving keeps it linked
  if(d.pdfPath&&photoStates['invoice']){
    photoStates['invoice'].existing=[...(photoStates['invoice'].existing||[]),d.pdfPath];
    renderPDFList('invoice','inv-pdf-list');
  }
  // Pre-check the matched WO
  if(d.matched_wo_id&&typeof _invWoCheckedState!=='undefined'){
    _invWoCheckedState.add(d.matched_wo_id);
    if(typeof renderInvoiceWOPicker==='function')renderInvoiceWOPicker();
  }
}

function prefillUtilityForm(d){
  const body=document.getElementById('utility-body');
  if(body&&!body.querySelector('.ai-prefill-banner')){
    body.insertAdjacentHTML('afterbegin',aiBanner(d.confidence,d.notes));
  }
  if(d.buildingId)setVal('ur-bld',d.buildingId);
  if(d.utility_type){
    if(typeof refreshUtilityTypeOptions==='function')refreshUtilityTypeOptions(d.utility_type);
    setVal('ur-type',d.utility_type);
  }
  setVal('ur-start',d.period_start);
  setVal('ur-end',d.period_end);
  setVal('ur-usage',d.usage);
  setVal('ur-unit',d.usage_unit);
  setVal('ur-cost',d.cost);
  setVal('ur-provider',d.provider);
  setVal('ur-account',d.account_number);
  if(d.pdfPath&&photoStates['utility']){
    photoStates['utility'].existing=[...(photoStates['utility'].existing||[]),d.pdfPath];
    renderPDFList('utility','ur-pdf-list');
  }
}

function prefillQuoteForm(d){
  const body=document.getElementById('quote-body');
  if(body&&!body.querySelector('.ai-prefill-banner')){
    body.insertAdjacentHTML('afterbegin',aiBanner(d.confidence,d.notes));
  }
  setVal('qt-num',d.quote_number);
  setVal('qt-date',d.date);
  setVal('qt-vendor',d.vendor);
  setVal('qt-bld',d.buildingName);
  setVal('qt-desc',d.description);
  setVal('qt-amount',d.amount);
  setVal('qt-valid',d.valid_until);
  if(d.pdfPath&&photoStates['quote']){
    photoStates['quote'].existing=[...(photoStates['quote'].existing||[]),d.pdfPath];
    renderPDFList('quote','qt-pdf-list');
  }
}

// Drag-and-drop on the dashboard dropzone (in addition to click-to-pick).
document.addEventListener('DOMContentLoaded',()=>{
  const dz=document.getElementById('ai-dropzone');
  if(!dz)return;
  ['dragover','dragenter'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('dragover');}));
  ['dragleave','dragend','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('dragover');}));
  dz.addEventListener('drop',e=>{
    e.preventDefault();
    const file=e.dataTransfer?.files?.[0];
    if(file)parseAndRouteDoc(file);
  });
});

// Open asset modal pre-filling the building from the assets-page filter,
// so when you've narrowed the list to one building, the new asset starts
// there instead of forcing you to pick again.
function addAssetForFilteredBuilding(){
  openAssetModal();
  const fb=document.getElementById('af-bld')?.value;
  if(!fb||fb==='all')return;
  setTimeout(()=>{
    const bld=document.getElementById('a-bld');
    if(bld){bld.value=fb;if(typeof updateAssetRoomDropdown==='function')updateAssetRoomDropdown();}
  },80);
}

// ---- QUICK ADD DROPDOWN ----
// One Quick Add menu per page topbar, injected by injectQuickAddIntoTopbars on
// init. Uses classes (not IDs) so multiple instances coexist on the same page.
const QUICK_ADD_HTML=`
  <div class="quick-add-wrap">
    <button class="btn quick-add-btn" onclick="toggleQuickAdd(event,this)">+ Quick Add ▾</button>
    <div class="quick-add-menu">
      <div class="quick-add-item" onclick="quickAdd('utility')">💡 <span>Log Utility Reading</span></div>
      <div class="quick-add-item" onclick="quickAdd('invoice')">🧾 <span>Upload Invoice</span></div>
      <div class="quick-add-item" onclick="quickAdd('quote')">📋 <span>Add Quote</span></div>
      <div class="quick-add-item" onclick="quickAdd('pm')">🔧 <span>Complete PM Task</span></div>
      <div class="quick-add-item" onclick="quickAdd('project')">🏗️ <span>Add Project</span></div>
      <div class="quick-add-item" onclick="quickAdd('asset')">📦 <span>Add Asset</span></div>
      <div class="quick-add-item" onclick="quickAdd('contact')">👤 <span>Add Contact</span></div>
      <div class="quick-add-item" onclick="quickAdd('supply')">🧴 <span>Add Supply</span></div>
    </div>
  </div>`;

function injectQuickAddIntoTopbars(){
  document.querySelectorAll('.topbar-actions').forEach(actions=>{
    if(actions.querySelector('.quick-add-wrap'))return;
    actions.insertAdjacentHTML('beforeend',QUICK_ADD_HTML);
  });
}

function toggleQuickAdd(e,btn){
  if(e)e.stopPropagation();
  // Close any other open menus first
  document.querySelectorAll('.quick-add-menu.open').forEach(m=>{
    if(!btn||!btn.parentElement.contains(m))m.classList.remove('open');
  });
  btn?.parentElement?.querySelector('.quick-add-menu')?.classList.toggle('open');
}

function closeQuickAdd(){
  document.querySelectorAll('.quick-add-menu.open').forEach(m=>m.classList.remove('open'));
}

// Routes a quick-add choice to the right page + modal. Some entries are
// building-scoped (utility) or require a list to pick from (pm completion)
// — those navigate to the relevant page so the user sees context.
function quickAdd(kind){
  closeQuickAdd();
  const open=(fn,nav)=>{
    if(nav)go(nav);
    setTimeout(fn,80);
  };
  switch(kind){
    case'utility':
      // Modal has its own building picker (defaults to current or first) — open it in place.
      if(buildings.length){openUtilityModal();}
      else{showToast('Add a building first');}
      break;
    case'invoice':open(openInvoiceModal,'invoices');break;
    case'quote':open(openQuoteModal,'quotes');break;
    case'pm':go('pm');showToast('Pick a PM task, then click Mark Done');break;
    case'project':open(openProjectModal,'projects');break;
    case'asset':open(openAssetModal,'assets');break;
    case'contact':
      currentContactType='Contractor';
      open(openContactModal,'contacts');
      break;
    case'supply':open(openSupplyModal,'supplies');break;
  }
}

// Close any open menu when the click lands outside its wrap.
document.addEventListener('click',e=>{
  if(!e.target.closest('.quick-add-wrap'))closeQuickAdd();
});

// ---- AUTH GATE ----
// Magic-link flow via Supabase Auth. The app stays gated by an overlay until
// a valid session exists. On sign-in/sign-out we react via onAuthStateChange.
let _currentUser=null;
function isSignedIn(){return !!_currentUser;}
function currentUserId(){return _currentUser?.id||null;}
function currentUserEmail(){return _currentUser?.email||'';}
function currentUserName(){
  const md=_currentUser?.user_metadata||{};
  return md.full_name||md.name||currentUserEmail()||'';
}

// Adds created_by/updated_by to a save payload. Inserts get both stamps;
// updates only refresh updated_by so the original author is preserved.
function stamp(data,isInsert){
  const uid=currentUserId();
  if(!uid)return data;
  return isInsert?{...data,created_by:uid,updated_by:uid}:{...data,updated_by:uid};
}

// Loads the profiles table (id → display_name + role + buildings) populated
// by the auth.users trigger. Used for attribution AND access control.
async function loadProfiles(){
  try{
    const{data,error}=await db.from('profiles').select('id,email,display_name,role,assigned_building_ids,language');
    if(error)throw error;
    profiles=(data||[]).map(p=>({...p,assigned_building_ids:normalizeIdArray(p.assigned_building_ids)}));
  }catch(e){console.error(e);profiles=[];}
}

async function setMyLanguage(lang){
  const uid=currentUserId();
  if(!uid)return;
  try{
    const{error}=await db.from('profiles').update({language:lang}).eq('id',uid);
    if(error)throw error;
    const me=profiles.find(p=>p.id===uid);
    if(me)me.language=lang;
    renderMyWork?.();
  }catch(e){console.error(e);showToast('Could not save language');}
}

function userNameById(uid){
  if(!uid)return'';
  if(uid===currentUserId())return'you';
  const p=profiles.find(x=>x.id===uid);
  return p?(p.display_name||p.email||'Unknown'):'Unknown';
}

// ---- ROLES & PERMISSIONS ----
// Six roles: admin, manager, facilities, finance, dept_head, viewer.
// Permissions are nav-list + edit-list per role; a "*" in nav means everything.
const ROLE_LIST=['admin','manager','facilities','finance','dept_head','janitor','viewer'];
const ROLE_LABELS={admin:'Admin',manager:'Manager',facilities:'Facilities',finance:'Finance',dept_head:'Department Head',janitor:'Janitor',viewer:'Viewer'};

const PERMS={
  admin:{nav:['*'],canEdit:'all'},
  manager:{
    nav:['my-work','dashboard','calendar','workorders','pm','history','assets','supplies','quotes','invoices','buildings','contacts','projects','finance','pm-report','coi-report','projects-finance-report','projects-parish-report','conflicts'],
    canEdit:'all',
  },
  facilities:{
    nav:['my-work','dashboard','calendar','workorders','pm','history','assets','supplies','quotes','invoices','buildings','contacts','projects','pm-report','coi-report','projects-parish-report','conflicts'],
    canEdit:['workorders','pm','history','assets','supplies','buildings','rooms','contacts','projects','utility'],
  },
  finance:{
    nav:['dashboard','calendar','workorders','pm','history','assets','supplies','quotes','invoices','buildings','contacts','projects','finance','pm-report','coi-report','projects-finance-report','projects-parish-report','conflicts'],
    canEdit:['quotes','invoices','projects','budgets'],
  },
  dept_head:{
    nav:['dashboard','calendar','workorders','buildings','contacts','projects-parish-report'],
    canEdit:['workorders'],
  },
  janitor:{
    // Mobile-only role: lives entirely on the My Work page.
    nav:['my-work'],
    canEdit:['workorders','supply-requests'],
  },
  viewer:{
    nav:['dashboard','calendar','workorders','pm','history','assets','supplies','quotes','invoices','buildings','contacts','projects','finance','pm-report','coi-report','projects-finance-report','projects-parish-report','conflicts'],
    canEdit:[],
  },
};

function _myProfile(){return profiles.find(p=>p.id===currentUserId())||null;}
function userRole(){return _myProfile()?.role||'viewer';}
function userBuildingIds(){return _myProfile()?.assigned_building_ids||[];}
function isAdmin(){return userRole()==='admin';}

function canViewNav(name){
  const p=PERMS[userRole()];
  if(!p)return false;
  return p.nav.includes('*')||p.nav.includes(name);
}

function canEdit(module){
  const p=PERMS[userRole()];
  if(!p)return false;
  return p.canEdit==='all'||(Array.isArray(p.canEdit)&&p.canEdit.includes(module));
}

// Department Heads see only the buildings explicitly assigned to them; every
// other role sees all buildings. Used to scope renders for that role.
function buildingsVisibleToUser(){
  if(userRole()!=='dept_head')return buildings;
  const ids=userBuildingIds();
  return buildings.filter(b=>ids.includes(b.id));
}

// Hide nav items the current role can't access; hide the Settings section
// entirely for non-admins (it manages users + system config).
function applyNavVisibility(){
  document.querySelectorAll('.nav-item[onclick]').forEach(el=>{
    const m=el.getAttribute('onclick')?.match(/go(?:Contacts)?\(['"]([^'"]+)['"]/);
    if(!m)return;
    const view=m[1];
    // Contacts page uses goContacts('Contractor', ...) etc — all contact subroutes share the 'contacts' nav perm
    const navKey=el.getAttribute('onclick').includes('goContacts')?'contacts':view;
    el.style.display=canViewNav(navKey)?'':'none';
  });
  // Hide entire Admin section if not admin
  document.querySelectorAll('.nav-section[data-nav="admin"]').forEach(sec=>{
    sec.style.display=isAdmin()?'':'none';
  });
  // Hide entire My Work section for roles that don't have it
  document.querySelectorAll('.nav-section[data-nav="my-work"]').forEach(sec=>{
    sec.style.display=canViewNav('my-work')?'':'none';
  });
}

// Tiny "Created by X · 4/24/2026" footer rendered at the bottom of detail
// modals and cards. Uses created_at / updated_at if present on the row.
function metaFooter(obj){
  if(!obj)return'';
  const cBy=obj.created_by?userNameById(obj.created_by):null;
  const uBy=obj.updated_by?userNameById(obj.updated_by):null;
  const cAt=obj.created_at?new Date(obj.created_at):null;
  const uAt=obj.updated_at?new Date(obj.updated_at):null;
  const fmtD=d=>d?d.toLocaleDateString():'';
  const parts=[];
  if(cBy||cAt)parts.push(`<span>Created${cBy?` by <strong>${cBy}</strong>`:''}${cAt?` · ${fmtD(cAt)}`:''}</span>`);
  if((uBy&&uBy!==cBy)||(uAt&&cAt&&uAt.getTime()-cAt.getTime()>60000)){
    parts.push(`<span>Updated${uBy?` by <strong>${uBy}</strong>`:''}${uAt?` · ${fmtD(uAt)}`:''}</span>`);
  }
  if(!parts.length)return'';
  return`<div style="font-size:11px;color:var(--text3);margin-top:10px;padding-top:8px;border-top:1px solid var(--border);display:flex;gap:12px;flex-wrap:wrap">${parts.join('')}</div>`;
}

function showAuthOverlay(){document.getElementById('auth-overlay')?.classList.add('open');}
function hideAuthOverlay(){document.getElementById('auth-overlay')?.classList.remove('open');}

function setAuthMsg(text,kind){
  const el=document.getElementById('auth-msg');
  if(!el)return;
  el.className='auth-msg '+(kind||'');
  el.textContent=text||'';
}

async function sendMagicLink(e){
  if(e)e.preventDefault();
  const email=document.getElementById('auth-email')?.value.trim();
  if(!email)return;
  const btn=document.getElementById('auth-btn');
  if(btn){btn.disabled=true;btn.textContent='Sending…';}
  try{
    const{error}=await db.auth.signInWithOtp({
      email,
      // Allow self-signup so first-time users (you) don't need a pre-created
      // record. Real access control comes from the Supabase RLS lockdown
      // (next commit) plus the Site-URL restriction.
      options:{emailRedirectTo:window.location.origin,shouldCreateUser:true},
    });
    if(error)throw error;
    setAuthMsg('Check your email for the sign-in link. You can close this tab — clicking the link will log you in.','ok');
  }catch(err){
    console.error(err);
    setAuthMsg(err.message||'Could not send link','err');
  }finally{
    if(btn){btn.disabled=false;btn.textContent='Send sign-in link';}
  }
}

async function signOut(){
  try{await db.auth.signOut();}catch(e){console.error(e);}
  _currentUser=null;
  showAuthOverlay();
  // Hard reload so all in-memory state is cleared.
  setTimeout(()=>window.location.reload(),100);
}

function refreshSidebarUser(){
  const el=document.getElementById('sidebar-user');
  if(el)el.textContent=currentUserName()||'—';
}

// On signed-in: hide gate, populate sidebar, kick off data load (only once per session).
let _initialLoadStarted=false;
async function onSignedIn(user){
  _currentUser=user;
  hideAuthOverlay();
  refreshSidebarUser();
  if(!_initialLoadStarted){
    _initialLoadStarted=true;
    await loadAll();
    // Janitors land on My Work — they have no other nav access anyway.
    if(userRole()==='janitor'){
      const navItem=document.querySelector('.nav-item[onclick*="my-work"]');
      go('my-work',navItem||null);
    }
  }
}

async function initAuth(){
  // Pull current session on boot. Supabase parses the magic-link hash on its own.
  const{data:{session}}=await db.auth.getSession();
  if(session?.user){
    onSignedIn(session.user);
  }else{
    showAuthOverlay();
  }
  // React to logins (other tab, magic-link return) and logouts.
  db.auth.onAuthStateChange((event,sess)=>{
    if(event==='SIGNED_IN'&&sess?.user){onSignedIn(sess.user);}
    else if(event==='SIGNED_OUT'){_currentUser=null;showAuthOverlay();}
  });
}

// ---- INIT ----
setupDragDropUploads();
initCollapsibleNav();
initSidebarState();
injectQuickAddIntoTopbars();
initAuth();
