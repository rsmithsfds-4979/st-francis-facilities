// Load/save/delete helpers, CSV import/export, navigation, init

// ---- LOAD ----
async function loadAll(){
  // Categories must load before assets so catIcon is populated when renderAssets runs.
  await loadCategories();
  await loadSettings();
  await Promise.all([loadBuildings(),loadWorkOrders(),loadAssets(),loadPM(),loadContacts(),loadInvoices(),loadBudgets(),loadGCalEvents(),loadSupplies(),loadUtilities(),loadRoomTypes(),loadQuotes(),loadCalendarEvents()]);
  renderHistory();renderDash();
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
      const{data,error}=await db.from('calendar_events').update({...d,updated_at:new Date().toISOString()}).eq('id',editingEventId).select();
      if(error)throw error;
      showToast('Event updated!');
    }else{
      const{data,error}=await db.from('calendar_events').insert([d]).select();
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
      description:[p.building,p.frequency,p.assigned_to&&'Assigned: '+p.assigned_to,scheduled&&p.scheduled_time&&'Time: '+p.scheduled_time,scheduled&&p.scheduled_with&&'With: '+p.scheduled_with].filter(Boolean).join(' · '),
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

  // Pending quotes by expiry
  (quotes||[]).filter(q=>q.status==='Pending'&&q.valid_until).forEach(q=>{
    const d=parseDate(q.valid_until);
    if(!d)return;
    const k=ymd(d);
    out.push({
      id:'q-'+q.id,
      title:'💰 '+(q.vendor||'Quote')+' expires',
      start:k,end:k,allDay:true,
      description:[q.description,q.amount&&fmt(q.amount)].filter(Boolean).join(' · '),
      location:q.building||'',
      source:'quote',_ref:{type:'quote',id:q.id},
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
    quotes=(data||[]).map(q=>({...q,asset_ids:normalizeIdArray(q.asset_ids),pdf_urls:normalizeIdArray(q.pdf_urls)}));
  }catch(e){console.error(e);quotes=[];}
}

async function saveQuote(d){
  try{
    if(editingQuoteId){
      const{data,error}=await db.from('quotes').update({...d,updated_at:new Date().toISOString()}).eq('id',editingQuoteId).select();
      if(error)throw error;
      const i=quotes.findIndex(q=>q.id===editingQuoteId);
      if(i>-1)quotes[i]={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),pdf_urls:normalizeIdArray(data[0].pdf_urls)};
      showToast('Quote updated!');
    }else{
      const{data,error}=await db.from('quotes').insert([d]).select();
      if(error)throw error;
      quotes.unshift({...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),pdf_urls:normalizeIdArray(data[0].pdf_urls)});
      showToast('Quote saved!');
    }
    editingQuoteId=null;closeModal('quote-modal');renderQuotes();
  }catch(e){console.error(e);showToast('Error saving quote');}
}

async function deleteQuote(id){
  try{
    const{error}=await db.from('quotes').delete().eq('id',id);
    if(error)throw error;
    quotes=quotes.filter(q=>q.id!==id);
    showToast('Quote deleted');renderQuotes();
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
      const{data,error}=await db.from('room_types').update(d).eq('id',editingRoomTypeId).select();
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
      const{data,error}=await db.from('room_types').insert([{...d,sort_order}]).select();
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

async function loadUtilities(){
  try{
    const{data,error}=await db.from('utility_readings').select('*').order('period_end',{ascending:false});
    if(error)throw error;
    utilityReadings=data||[];
  }catch(e){console.error(e);utilityReadings=[];}
}

async function saveUtility(d){
  try{
    if(editingUtilityId){
      const{data,error}=await db.from('utility_readings').update(d).eq('id',editingUtilityId).select();
      if(error)throw error;
      const i=utilityReadings.findIndex(u=>u.id===editingUtilityId);
      if(i>-1)utilityReadings[i]=data[0];
      showToast('Utility reading updated!');
    }else{
      const{data,error}=await db.from('utility_readings').insert([d]).select();
      if(error)throw error;
      utilityReadings.unshift(data[0]);
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
      const{data,error}=await db.from('supplies').update({...d,updated_at:new Date().toISOString()}).eq('id',editingSupplyId).select();
      if(error)throw error;
      const i=supplies.findIndex(s=>s.id===editingSupplyId);
      if(i>-1)supplies[i]=data[0];
      showToast('Supply updated!');
    }else{
      const{data,error}=await db.from('supplies').insert([d]).select();
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
    contacts=(data||[]).map(c=>({...c,people:normalizeIdArray(c.people)}));
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
      const{data,error}=await db.from('buildings').update(d).eq('id',editingBldId).select();
      if(error)throw error;
      const i=buildings.findIndex(b=>b.id===editingBldId);
      if(i>-1)buildings[i]={...data[0],photo_urls:normalizeIdArray(data[0].photo_urls),tracked_utilities:data[0].tracked_utilities==null?null:normalizeIdArray(data[0].tracked_utilities)};
      showToast('Building updated!');
    }else{
      const{data,error}=await db.from('buildings').insert([d]).select();
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
      const{data,error}=await db.from('rooms').update(d).eq('id',editingRoomId).select();
      if(error)throw error;
      const i=rooms.findIndex(r=>r.id===editingRoomId);
      if(i>-1)rooms[i]=data[0];
      showToast('Room updated!');
    }else{
      const{data,error}=await db.from('rooms').insert([d]).select();
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
      const{data,error}=await db.from('assets').update(d).eq('id',editingAssetId).select();
      if(error)throw error;
      const i=assets.findIndex(a=>a.id===editingAssetId);
      if(i>-1)assets[i]=data[0];
      saved=data[0];
      showToast('Asset updated!');
    }else{
      const{data,error}=await db.from('assets').insert([d]).select();
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
      const{data,error}=await db.from('work_orders').update(d).eq('id',editingWOId).select();
      if(error)throw error;
      const i=workOrders.findIndex(w=>w.id===editingWOId);
      if(i>-1)workOrders[i]={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),invoice_ids:normalizeIdArray(data[0].invoice_ids),photo_urls:normalizeIdArray(data[0].photo_urls)};
      showToast('Work order updated!');
    }else{
      const{data,error}=await db.from('work_orders').insert([d]).select();
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
    const{error}=await db.from('wo_comments').insert([{work_order_id:woId,author,comment}]);
    if(error)throw error;
    showToast('Comment added!');openWODetail(woId);
  }catch(e){showToast('Error adding comment');}
}

async function savePM(d){
  try{
    if(editingPMId){
      const{data,error}=await db.from('pm_schedule').update(d).eq('id',editingPMId).select();
      if(error)throw error;
      const i=pmTasks.findIndex(p=>p.id===editingPMId);
      if(i>-1)pmTasks[i]={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids)};
      showToast('PM task updated!');
    }else{
      const{data,error}=await db.from('pm_schedule').insert([d]).select();
      if(error)throw error;
      pmTasks.push({...data[0],asset_ids:normalizeIdArray(data[0].asset_ids)});
      showToast('PM task added!');
    }
    editingPMId=null;closeModal('pm-modal');renderPM();renderDash();
  }catch(e){console.error(e);showToast('Error saving PM task');}
}

// Logs a scheduled date/time/contact against a PM and optionally auto-creates a Work Order
// to track the actual visit. PM remains Upcoming until marked Done.
async function schedulePM(id,{date,time,withWhom,notes,createWO}){
  const pm=pmTasks.find(p=>p.id===id);
  if(!pm)return;
  try{
    const upd={scheduled_date:date||null,scheduled_time:time||null,scheduled_with:withWhom||null,scheduled_notes:notes||null};
    const{error}=await db.from('pm_schedule').update(upd).eq('id',id);
    if(error)throw error;
    Object.assign(pm,upd);
    let toastMsg='PM scheduled';
    if(createWO){
      const dueStr=date?(time?`${date} ${time}`:date):'';
      const woData={
        issue:pm.title+' (Scheduled PM)',
        building:pm.building||'All Buildings',
        priority:'Medium',
        assignee:withWhom||pm.assigned_to||'—',
        due_date:dueStr,
        status:'Open',
        notes:`Auto-created from PM schedule${notes?'. '+notes:''}`,
        asset_ids:Array.isArray(pm.asset_ids)?pm.asset_ids:[],
      };
      try{
        const{data:woRes,error:woErr}=await db.from('work_orders').insert([woData]).select();
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
    const upd={scheduled_date:null,scheduled_time:null,scheduled_with:null,scheduled_notes:null};
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
      const{data:woRes,error:woErr}=await db.from('work_orders').insert([woData]).select();
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
      const{data,error}=await db.from('contacts').update(d).eq('id',editingContactId).select();
      if(error)throw error;
      const i=contacts.findIndex(c=>c.id===editingContactId);
      if(i>-1)contacts[i]=data[0];
      saved=data[0];
      showToast('Contact updated!');
    }else{
      const{data,error}=await db.from('contacts').insert([d]).select();
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
      const{data,error}=await db.from('vendor_invoices').update(d).eq('id',editingInvId).select();
      if(error)throw error;
      const normalized={...data[0],asset_ids:normalizeIdArray(data[0].asset_ids),work_order_ids:normalizeIdArray(data[0].work_order_ids),pdf_urls:normalizeIdArray(data[0].pdf_urls)};
      const i=invoices.findIndex(x=>x.id===editingInvId);
      if(i>-1)invoices[i]=normalized;
      saved=normalized;
      showToast('Invoice updated!');
    }else{
      const{data,error}=await db.from('vendor_invoices').insert([d]).select();
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
      const{data,error}=await db.from('categories').update(d).eq('id',editingCategoryId).select();
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
      const{data,error}=await db.from('categories').insert([{...d,sort_order}]).select();
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
    ...kept.map(u=>`<div class="photo-thumb"><img src="${u}" onclick="openLightbox('${u}')"><button type="button" onclick="removeExistingPhoto('${key}','${u}','${galleryId}')">×</button></div>`),
    ...s.pendingPreviews.map((p,i)=>`<div class="photo-thumb"><img src="${p}"><button type="button" onclick="removePendingPhoto('${key}',${i},'${galleryId}')">×</button></div>`),
  ];
  el.innerHTML=thumbs.join('')||'<div style="font-size:12px;color:var(--text3);font-family:sans-serif;padding:4px 0">No photos yet</div>';
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

// Returns the first available photo URL from either photo_urls[] or legacy photo_url.
function firstPhoto(obj){
  if(obj?.photo_urls&&Array.isArray(obj.photo_urls)&&obj.photo_urls.length>0)return obj.photo_urls[0];
  return obj?.photo_url||null;
}
function photoCount(obj){
  if(obj?.photo_urls&&Array.isArray(obj.photo_urls))return obj.photo_urls.length;
  return obj?.photo_url?1:0;
}
function allPhotos(obj){
  if(obj?.photo_urls&&Array.isArray(obj.photo_urls)&&obj.photo_urls.length>0)return obj.photo_urls;
  return obj?.photo_url?[obj.photo_url]:[];
}

// Same pattern for PDFs: pdf_urls[] with fallback to single pdf_url
function allPDFs(obj){
  if(obj?.pdf_urls&&Array.isArray(obj.pdf_urls)&&obj.pdf_urls.length>0)return obj.pdf_urls;
  return obj?.pdf_url?[obj.pdf_url]:[];
}

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
  kept.forEach((u,i)=>{
    const filename=decodeURIComponent((u.split('/').pop()||'document.pdf').split('?')[0]);
    rows.push(`<div class="pdf-row">
      <a href="${u}" target="_blank" class="pdf-link" onclick="event.stopPropagation()">📄 ${escape(filename)}</a>
      <button type="button" class="btn btn-danger btn-sm" onclick="removePDFExisting('${key}',${i},'${listId}')">✕</button>
    </div>`);
  });
  s.pending.forEach((f,i)=>{
    rows.push(`<div class="pdf-row">
      <span class="pdf-link pdf-pending">📄 ${escape(f.name)} <span style="color:var(--success);font-size:11px">(ready to upload)</span></span>
      <button type="button" class="btn btn-danger btn-sm" onclick="removePDFPending('${key}',${i},'${listId}')">✕</button>
    </div>`);
  });
  el.innerHTML=rows.length?rows.join(''):'<div style="font-size:12px;color:var(--text3);font-family:sans-serif;padding:4px 0">No PDFs attached.</div>';
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
      const{data,error}=await db.from('budgets').insert([d]).select();
      if(error)throw error;
      budgets.push(data[0]);
      showToast('Budget saved!');
    }
    editingBudgetId=null;closeModal('budget-modal');
    renderFinance();
  }catch(e){console.error(e);showToast('Error saving budget');}
}

async function uploadFile(file,folder){
  try{
    const ext=file.name.split('.').pop();
    const path=`${folder}/${Date.now()}-${Math.random().toString(36).slice(2,8)}.${ext}`;
    const bucket=(folder==='coi'||folder==='invoices'||folder==='quotes')?'documents':'asset-photos';
    const{error}=await db.storage.from(bucket).upload(path,file);
    if(error)throw error;
    const{data}=db.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }catch(e){console.error(e);showToast('Error uploading file');return null;}
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
  if(el)el.classList.add('active');
  if(name==='buildings')renderBuildings();
  if(name==='settings')renderSettings();
  if(name==='contacts')renderContacts();
  if(name==='pm-report')renderPMReport();
  if(name==='coi-report')renderCOIReport();
  if(name==='finance')renderFinance();
  if(name==='calendar')loadCalEvents();
  if(name==='supplies')renderSupplies();
  if(name==='quotes')renderQuotes();
  renderHistory();
}

function goContacts(type,el){
  currentContactType=type;
  go('contacts',el);
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

// ---- INIT ----
setupDragDropUploads();
loadAll();
