// All modal open/submit/edit/delete-confirm functions

// ---- WORK ORDER MODAL ----
// Opens the Work Order modal. Pass presetRoomId/presetBldId to pre-fill for a new WO, or
// pass an existing wo object to edit it. (Callers disambiguate by argument type.)
function openWOModal(presetRoomId,presetBldId){
  // Argument overload: if the first arg is a work-order object, treat as edit.
  const wo=(presetRoomId&&typeof presetRoomId==='object'&&presetRoomId.id)?presetRoomId:null;
  if(wo){presetRoomId=wo.room_id||null;presetBldId=null;}
  editingWOId=wo?wo.id:null;
  document.getElementById('wo-modal-h').textContent=wo?'Edit Work Order':'New Work Order';
  const presetRoom=presetRoomId?rooms.find(r=>r.id===presetRoomId):null;
  const presetBld=presetBldId?buildings.find(b=>b.id===presetBldId):null;
  const presetBldName=wo?.building||presetBld?.name||presetRoom?.building_name||'';
  const bldRooms=presetBldName?rooms.filter(r=>r.building_name===presetBldName):[];
  const checkedAssetIds=wo?.asset_ids||[];

  document.getElementById('wo-body').innerHTML=`
    <div class="fg"><label>Issue description *</label><input type="text" class="fi" id="f-issue" placeholder="Brief description of the problem" value="${wo?.issue?wo.issue.replace(/"/g,'&quot;'):''}"></div>
    <div class="form-row">
      <div class="fg"><label>Building *</label>
        <select class="fi" id="f-bld" onchange="updateRoomDropdown()">
          <option value="">Select...</option>
          <option ${presetBldName==='All Buildings'?'selected':''}>All Buildings</option>
          ${buildings.map(b=>`<option ${b.name===presetBldName?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label>Room / Location</label>
        <select class="fi" id="f-room">
          <option value="">Select room...</option>
          ${bldRooms.map(r=>`<option value="${r.id}" ${r.id===(wo?.room_id||presetRoomId)?'selected':''}>${r.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Priority *</label><select class="fi" id="f-pri"><option value="">Select...</option>${['Low','Medium','High','Critical'].map(p=>`<option ${wo?.priority===p?'selected':''}>${p}</option>`).join('')}</select></div>
      <div class="fg"><label>Due date</label><input type="text" class="fi" id="f-due" placeholder="e.g. May 15 2025" value="${wo?.due_date||''}"></div>
    </div>
    <div class="fg"><label>Assign to *</label>
      <select class="fi" id="f-assign" onchange="handleAssignChange(this)">
        <option value="">Select...</option>
        ${contacts.map(c=>`<option ${wo?.assignee===c.name?'selected':''}>${c.name}</option>`).join('')}
        <option value="__add_new__">+ Add new contact…</option>
        <option ${wo?.assignee==='Other'?'selected':''}>Other</option>
      </select>
    </div>
    <div class="fg">
      <label>Assets being serviced</label>
      ${assetPickerFiltersHTML('asset-select-list')}
    </div>
    <div class="form-row">
      <div class="fg"><label>Status</label>
        <select class="fi" id="f-status">
          ${['Open','In Progress','Completed'].map(s=>`<option ${(wo?.status||'Open')===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label>Completed date</label><input type="text" class="fi" id="f-completed" placeholder="e.g. Apr 22 2026" value="${wo?.completed_date||''}"></div>
    </div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="f-notes" placeholder="Any additional details...">${wo?.notes||''}</textarea></div>
    <div class="fg"><label>Photos (optional)</label>
      <div class="photo-gallery" id="wo-photo-gallery"></div>
      <div class="photo-upload" onclick="document.getElementById('wo-photo-input').click()">📷 Click or drag photos here<input type="file" id="wo-photo-input" accept="image/*" multiple style="display:none" onchange="addPendingPhotos('wo',event,'wo-photo-gallery')"></div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('wo-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitWO()">${wo?'Save Changes':'Save Work Order'}</button>
    </div>`;
  initPhotoState('wo',wo?allPhotos(wo):[]);
  renderPhotoGallery('wo','wo-photo-gallery');
  // "All Buildings" means show everything; specific building filters; no building → hint
  const pickerFilter=presetBldName==='All Buildings'?'all':(presetBldName||'all');
  const needBuildingGate=!presetBldName; // hint only if nothing picked yet
  initAssetPicker('asset-select-list',checkedAssetIds,pickerFilter,needBuildingGate);
  const bldSel=document.getElementById('asset-select-list-bld');
  if(bldSel)bldSel.value=pickerFilter;
  renderAssetPicker('asset-select-list');
  document.getElementById('wo-modal').classList.add('open');
}

function updateRoomDropdown(){
  const bldName=document.getElementById('f-bld')?.value;
  const isAll=bldName==='All Buildings';
  const roomSel=document.getElementById('f-room');
  if(roomSel){
    if(!bldName||isAll){
      // No single-building context — a specific room doesn't make sense here
      roomSel.innerHTML='<option value="">—</option>';
    }else{
      const bldRooms=rooms.filter(r=>r.building_name===bldName);
      roomSel.innerHTML='<option value="">Select room...</option>'+bldRooms.map(r=>`<option value="${r.id}">${r.name}${r.floor?' ('+r.floor+')':''}</option>`).join('');
    }
  }
  // Any explicit building pick (including "All Buildings") lifts the requireBuilding hint
  const state=_pickerState['asset-select-list'];
  if(state)state.requireBuilding=!bldName;
  const pickerBld=document.getElementById('asset-select-list-bld');
  if(pickerBld){
    pickerBld.value=(bldName&&!isAll)?bldName:'all';
    renderAssetPicker('asset-select-list');
  }
}

function toggleAssetSelect(el,id){
  el.classList.toggle('selected');
  const cb=el.querySelector('input[type=checkbox]');
  if(cb)cb.checked=!cb.checked;
}

// ---- ASSET PICKER (shared between WO and Invoice modals) ----
// State per list id: checked = Set<assetId>
const _pickerState={};

function initAssetPicker(listId,initialCheckedIds,initialBuilding,requireBuilding){
  _pickerState[listId]={
    checked:new Set(initialCheckedIds||[]),
    initialBuilding:initialBuilding||'all',
    requireBuilding:!!requireBuilding,
  };
}

function renderAssetPicker(listId){
  const state=_pickerState[listId];
  if(!state)return;
  const search=(document.getElementById(listId+'-search')?.value||'').toLowerCase();
  const building=document.getElementById(listId+'-bld')?.value||'all';
  const category=document.getElementById(listId+'-cat')?.value||'all';

  const el=document.getElementById(listId);
  if(!el)return;

  // When requireBuilding is set (Work Order flow), don't show assets until a building is picked.
  if(state.requireBuilding&&building==='all'){
    el.innerHTML=`
      <div class="asset-select-item" onclick="handleAddAssetInline('${listId}')" style="color:var(--accent);font-weight:bold;justify-content:center">+ Add new asset…</div>
      <div style="font-size:12px;color:var(--text3);font-family:sans-serif;padding:20px;text-align:center">Select a building above to see its assets.</div>`;
    return;
  }

  const filtered=assets.filter(a=>{
    if(building!=='all'&&a.building!==building)return false;
    if(category!=='all'&&a.category!==category)return false;
    if(search){
      const hay=[a.description,a.serial,a.room_number,a.location,a.manufacturer].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(search))return false;
    }
    return true;
  }).sort((a,b)=>
    (a.building||'').localeCompare(b.building||'')||
    (a.category||'').localeCompare(b.category||'')||
    (a.description||'').localeCompare(b.description||'')
  );

  el.innerHTML=`
    <div class="asset-select-item" onclick="handleAddAssetInline('${listId}')" style="color:var(--accent);font-weight:bold;justify-content:center">+ Add new asset…</div>
    ${filtered.length?filtered.map(a=>{
      const isChecked=state.checked.has(a.id);
      return`<div class="asset-select-item ${isChecked?'selected':''}" onclick="togglePickerItem('${listId}','${a.id}',this)">
        <input type="checkbox" ${isChecked?'checked':''} onclick="event.stopPropagation();togglePickerItem('${listId}','${a.id}',this.closest('.asset-select-item'))">
        <span style="font-size:14px">${catIcon[a.category]||'📦'}</span>
        <div><div style="font-weight:bold">${a.description}</div><div style="font-size:11px;color:var(--text3)">${a.building} · ${a.room_number||a.location||''} · ${a.category||''}</div></div>
      </div>`;
    }).join(''):'<div style="font-size:12px;color:var(--text3);font-family:sans-serif;padding:12px;text-align:center">No assets match.</div>'}`;
  updatePickerCount(listId);
}

function togglePickerItem(listId,assetId,rowEl){
  const state=_pickerState[listId];
  if(!state)return;
  if(state.checked.has(assetId))state.checked.delete(assetId);
  else state.checked.add(assetId);
  const isNow=state.checked.has(assetId);
  if(rowEl){
    rowEl.classList.toggle('selected',isNow);
    const cb=rowEl.querySelector('input[type=checkbox]');
    if(cb)cb.checked=isNow;
  }
  updatePickerCount(listId);
}

function getPickerChecked(listId){
  const state=_pickerState[listId];
  return state?[...state.checked]:[];
}

// Returns the HTML for the filter bar + list container. Caller assigns listId.
function assetPickerFiltersHTML(listId){
  return`
    <div style="display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap">
      <input type="text" class="fi" id="${listId}-search" placeholder="Search assets…" style="flex:1;min-width:140px;padding:6px 10px;font-size:12px" oninput="renderAssetPicker('${listId}')">
      <select class="fi" id="${listId}-bld" style="flex:0 0 auto;padding:6px 10px;font-size:12px" onchange="renderAssetPicker('${listId}')">
        <option value="all">All buildings</option>
        ${buildings.map(b=>`<option>${b.name}</option>`).join('')}
      </select>
      <select class="fi" id="${listId}-cat" style="flex:0 0 auto;padding:6px 10px;font-size:12px" onchange="renderAssetPicker('${listId}')">
        <option value="all">All categories</option>
        ${categories.map(c=>`<option>${c.name}</option>`).join('')}
      </select>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:6px;align-items:center;flex-wrap:wrap">
      <button type="button" class="btn btn-sm" onclick="selectAllVisibleAssets('${listId}')" style="padding:3px 8px;font-size:11px">Select all visible</button>
      <button type="button" class="btn btn-sm" onclick="clearPickerSelection('${listId}')" style="padding:3px 8px;font-size:11px">Clear</button>
      <span id="${listId}-count" style="font-family:sans-serif;color:var(--text3);font-size:11px;margin-left:4px"></span>
    </div>
    <div id="${listId}" style="max-height:260px;overflow-y:auto;border:1px solid var(--border2);border-radius:6px;padding:6px"></div>`;
}

// Filters the assets list with the same logic renderAssetPicker uses, and returns matches.
function pickerVisibleAssets(listId){
  const state=_pickerState[listId];
  if(!state)return[];
  const search=(document.getElementById(listId+'-search')?.value||'').toLowerCase();
  const building=document.getElementById(listId+'-bld')?.value||'all';
  const category=document.getElementById(listId+'-cat')?.value||'all';
  if(state.requireBuilding&&building==='all')return[];
  return assets.filter(a=>{
    if(building!=='all'&&a.building!==building)return false;
    if(category!=='all'&&a.category!==category)return false;
    if(search){
      const hay=[a.description,a.serial,a.room_number,a.location,a.manufacturer].filter(Boolean).join(' ').toLowerCase();
      if(!hay.includes(search))return false;
    }
    return true;
  });
}

function selectAllVisibleAssets(listId){
  const state=_pickerState[listId];
  if(!state)return;
  const visible=pickerVisibleAssets(listId);
  if(!visible.length){showToast('No assets visible to select');return;}
  visible.forEach(a=>state.checked.add(a.id));
  renderAssetPicker(listId);
}

function clearPickerSelection(listId){
  const state=_pickerState[listId];
  if(!state)return;
  state.checked.clear();
  renderAssetPicker(listId);
}

function updatePickerCount(listId){
  const state=_pickerState[listId];
  const el=document.getElementById(listId+'-count');
  if(!el||!state)return;
  const n=state.checked.size;
  el.textContent=n?`${n} selected`:'';
}

// Opens the Asset modal from another modal (e.g. WO or Invoice). After save, adds the new
// asset to the picker's checked set and re-renders. Stacks on top of the originating modal.
function handleAddAssetInline(listId){
  afterAssetSave=(newAsset)=>{
    const state=_pickerState[listId];
    if(state)state.checked.add(newAsset.id);
    renderAssetPicker(listId);
    const el=document.getElementById(listId);
    if(el)el.scrollTop=el.scrollHeight;
  };
  openAssetModal();
}

// Opens the contact modal from the WO assign dropdown; after save, insert new name and select it.
function handleAssignChange(sel){
  if(sel.value!=='__add_new__')return;
  sel.value='';
  afterContactSave=(newContact)=>{
    const opt=document.createElement('option');
    opt.textContent=newContact.name;
    opt.value=newContact.name;
    // Insert before the "+ Add new contact" option
    const anchor=sel.querySelector('option[value="__add_new__"]');
    if(anchor)sel.insertBefore(opt,anchor);
    else sel.appendChild(opt);
    sel.value=newContact.name;
  };
  openContactModal();
}

async function submitWO(){
  const issue=document.getElementById('f-issue')?.value.trim();
  const building=document.getElementById('f-bld')?.value;
  const priority=document.getElementById('f-pri')?.value;
  const assignee=document.getElementById('f-assign')?.value;
  if(!issue||!building||!priority||!assignee){showToast('Please fill in all required fields');return;}
  const roomId=document.getElementById('f-room')?.value||null;
  const room=roomId?rooms.find(r=>r.id===roomId):null;
  const selectedAssets=getPickerChecked('asset-select-list');
  const photo_urls=await finalizePhotos('wo','work-orders');
  const status=document.getElementById('f-status')?.value||'Open';
  let completed_date=document.getElementById('f-completed')?.value.trim();
  // Auto-stamp completed_date when status flips to Completed without one set
  if(status==='Completed'&&!completed_date)completed_date=new Date().toLocaleDateString();
  saveWO({
    issue,building,
    location:room?room.name:document.getElementById('f-room')?.value||'',
    room_id:roomId,
    due_date:document.getElementById('f-due')?.value.trim(),
    priority,assignee,
    notes:document.getElementById('f-notes')?.value.trim(),
    status,
    completed_date:status==='Completed'?completed_date:null,
    photo_urls,photo_url:photo_urls[0]||null,
    asset_ids:selectedAssets,
  });
}

async function openWODetail(id){
  const w=workOrders.find(x=>x.id===id);if(!w)return;
  document.getElementById('wod-h').textContent=w.issue;
  document.getElementById('wod-sub').textContent=w.building+(w.location?' · '+w.location:'');
  let comments=[];
  try{const{data}=await db.from('wo_comments').select('*').eq('work_order_id',id).order('created_at');comments=data||[];}catch(e){}
  // Get linked assets + invoices
  const linkedAssets=w.asset_ids?.length?assets.filter(a=>w.asset_ids.includes(a.id)):[];
  const linkedInvoices=w.invoice_ids?.length?invoices.filter(i=>w.invoice_ids.includes(i.id)):[];
  document.getElementById('wod-body').innerHTML=`
    <div class="dr"><div class="dl">Priority</div><div>${pb(w.priority)}</div></div>
    <div class="dr"><div class="dl">Status</div><div>${sb(w.status)}</div></div>
    <div class="dr"><div class="dl">Assigned to</div><div style="font-family:sans-serif">${w.assignee}</div></div>
    <div class="dr"><div class="dl">Due date</div><div style="font-family:sans-serif">${w.due_date||'Not set'}</div></div>
    <div class="dr"><div class="dl">Completed</div><div style="font-family:sans-serif">${w.completed_date||'—'}</div></div>
    ${linkedAssets.length?`<div class="dr"><div class="dl">Assets</div><div style="font-family:sans-serif;display:flex;flex-wrap:wrap;gap:4px">${linkedAssets.map(a=>`<span class="badge b-blue">${catIcon[a.category]||'📦'} ${a.description}</span>`).join('')}</div></div>`:''}
    ${linkedInvoices.length?`<div class="dr"><div class="dl">Invoices</div><div style="font-family:sans-serif;display:flex;flex-wrap:wrap;gap:6px">${linkedInvoices.map(i=>`<span class="badge b-green" style="cursor:pointer" onclick="editInvoice('${i.id}');closeModal('wo-detail-modal')">${i.invoice_number||'(no #)'} · ${i.vendor} · ${fmt(i.amount)}${i.pdf_url?' 📄':''}</span>`).join('')}</div></div>`:''}
    ${w.notes?`<div class="dr"><div class="dl">Notes</div><div style="font-family:sans-serif;white-space:normal;line-height:1.5">${w.notes}</div></div>`:''}
    ${allPhotos(w).length?`<div style="margin:12px 0"><div class="photo-gallery">${allPhotos(w).map(u=>`<div class="photo-thumb" style="width:110px;height:110px"><img src="${u}" onclick="openLightbox('${u}')"></div>`).join('')}</div></div>`:''}
    <div style="margin-top:16px;font-size:11px;font-family:sans-serif;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);margin-bottom:8px">Comments & Updates</div>
    <div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:12px">
      ${comments.length?comments.map(c=>`<div class="comment"><div class="comment-author">${c.author}</div><div class="comment-text">${c.comment}</div><div class="comment-time">${new Date(c.created_at).toLocaleString()}</div></div>`).join(''):'<div style="padding:12px 14px;font-size:13px;color:var(--text3);font-family:sans-serif">No comments yet</div>'}
    </div>
    <div class="fg"><label>Add a comment</label>
      <select class="fi" id="cmt-author" style="margin-bottom:8px"><option value="">Your name...</option>${contacts.map(c=>`<option>${c.name}</option>`).join('')}</select>
      <textarea class="fi" id="cmt-text" placeholder="Update on this work order..."></textarea>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('wo-detail-modal')">Close</button>
      <button class="btn btn-edit" onclick="editWO('${w.id}')">Edit</button>
      ${w.status!=='Completed'?`<button class="btn btn-success" onclick="updateWOStatus('${w.id}','Completed');closeModal('wo-detail-modal')">✓ Mark Done</button>`:''}
      <button class="btn btn-primary" onclick="submitComment('${w.id}')">Add Comment</button>
    </div>`;
  document.getElementById('wo-detail-modal').classList.add('open');
}

function editWO(id){
  const w=workOrders.find(x=>x.id===id);
  if(!w)return;
  closeModal('wo-detail-modal');
  openWOModal(w);
}

function submitComment(woId){
  const author=document.getElementById('cmt-author')?.value;
  const comment=document.getElementById('cmt-text')?.value.trim();
  if(!author||!comment){showToast('Please enter name and comment');return;}
  addComment(woId,author,comment);
}

// ---- ASSET MODAL ----
function openAssetModal(asset,presetRoomId){
  editingAssetId=asset?asset.id:null;
  document.getElementById('asset-modal-h').textContent=asset?'Edit Asset':'Add Asset';
  const v=k=>asset?.[k]||'';
  const sel=(k,val)=>asset?.[k]===val?'selected':'';
  const presetRoom=presetRoomId?rooms.find(r=>r.id===presetRoomId):null;
  const presetBldName=presetRoom?.building_name||'';
  const bldRooms=presetBldName?rooms.filter(r=>r.building_name===presetBldName):[];
  document.getElementById('asset-body').innerHTML=`
    <div class="fg"><label>Name / Description *</label><input type="text" class="fi" id="a-desc" placeholder="e.g. Trane Package Unit, Fire Panel" value="${v('description')}"></div>
    <div class="form-row">
      <div class="fg"><label>Building *</label>
        <select class="fi" id="a-bld" onchange="updateAssetRoomDropdown()">
          <option value="">Select...</option>
          ${buildings.map(b=>`<option ${b.name===(v('building')||presetBldName)?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label>Category *</label>
        <select class="fi" id="a-cat"><option value="">Select...</option>
          ${categories.map(c=>`<option ${sel('category',c.name)}>${c.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Room</label>
        <select class="fi" id="a-room-sel">
          <option value="">Select room...</option>
          ${(asset?.building?rooms.filter(r=>r.building_name===asset.building):bldRooms).map(r=>`<option value="${r.id}" ${r.id===(asset?.room_id||presetRoomId)?'selected':''}>${r.name}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label>Location detail</label><input type="text" class="fi" id="a-loc" placeholder="e.g. Ceiling, Rooftop" value="${v('location')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Serial number</label><input type="text" class="fi" id="a-serial" value="${v('serial')}"></div>
      <div class="fg"><label>Manufacturer</label><input type="text" class="fi" id="a-mfr" value="${v('manufacturer')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Size / Capacity</label><input type="text" class="fi" id="a-size" placeholder="e.g. 3 Ton" value="${v('size')}"></div>
      <div class="fg"><label>Expected life</label><input type="text" class="fi" id="a-life" value="${v('expected_life')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Install date</label><input type="text" class="fi" id="a-install" value="${v('install_date')}"></div>
      <div class="fg"><label>Warranty expiry</label><input type="text" class="fi" id="a-warranty" value="${v('warranty_expiry')}"></div>
    </div>
    <div class="fg"><label>Status</label>
      <select class="fi" id="a-status">
        <option ${!asset||asset.status==='Active'?'selected':''}>Active</option>
        <option ${sel('status','Maintenance')}>Maintenance</option>
        <option ${sel('status','Retired')}>Retired</option>
      </select>
    </div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="a-notes">${v('notes')}</textarea></div>
    <div class="fg"><label>Photos</label>
      <div class="photo-gallery" id="a-photo-gallery"></div>
      <div class="photo-upload" onclick="document.getElementById('a-photo-input').click()">📷 Click or drag photos here<input type="file" id="a-photo-input" accept="image/*" multiple style="display:none" onchange="addPendingPhotos('asset',event,'a-photo-gallery')"></div>
    </div>
    ${asset?renderAssetServiceRecord(asset.id):''}
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('asset-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitAsset()">${asset?'Save Changes':'Add Asset'}</button>
    </div>`;
  initPhotoState('asset',allPhotos(asset));
  renderPhotoGallery('asset','a-photo-gallery');
  document.getElementById('asset-modal').classList.add('open');
}

function updateAssetRoomDropdown(){
  const bldName=document.getElementById('a-bld')?.value;
  const sel=document.getElementById('a-room-sel');
  if(sel&&bldName){
    const bldRooms=rooms.filter(r=>r.building_name===bldName);
    sel.innerHTML='<option value="">Select room...</option>'+bldRooms.map(r=>`<option value="${r.id}">${r.name}${r.floor?' ('+r.floor+')':''}</option>`).join('');
  }
}

async function submitAsset(){
  const description=document.getElementById('a-desc')?.value.trim();
  const building=document.getElementById('a-bld')?.value;
  const category=document.getElementById('a-cat')?.value;
  if(!description||!building||!category){showToast('Please fill in name, building, and category');return;}
  const roomId=document.getElementById('a-room-sel')?.value||null;
  const room=roomId?rooms.find(r=>r.id===roomId):null;
  const photo_urls=await finalizePhotos('asset','assets');
  saveAsset({description,building,category,
    room_id:roomId,room_number:room?room.name:document.getElementById('a-loc')?.value.trim(),
    location:document.getElementById('a-loc')?.value.trim(),
    serial:document.getElementById('a-serial')?.value.trim(),
    manufacturer:document.getElementById('a-mfr')?.value.trim(),
    size:document.getElementById('a-size')?.value.trim(),
    expected_life:document.getElementById('a-life')?.value.trim(),
    install_date:document.getElementById('a-install')?.value.trim(),
    warranty_expiry:document.getElementById('a-warranty')?.value.trim(),
    status:document.getElementById('a-status')?.value,
    notes:document.getElementById('a-notes')?.value.trim(),
    photo_urls,
    photo_url:photo_urls[0]||null,
  });
}

function editAsset(id){const a=assets.find(x=>x.id===id);if(a)openAssetModal(a);}

// ---- BUILDING MODAL ----
function openBuildingModal(bld){
  editingBldId=bld?bld.id:null;
  document.getElementById('bld-modal-h').textContent=bld?'Edit Building':'Add Building';
  const v=k=>bld?.[k]||'';
  document.getElementById('bld-body').innerHTML=`
    <div class="fg"><label>Building name *</label><input type="text" class="fi" id="bld-name" placeholder="e.g. Parish Hall, School Gymnasium" value="${v('name')}"></div>
    <div class="fg"><label>Description</label><input type="text" class="fi" id="bld-desc" placeholder="Brief description" value="${v('description')}"></div>
    <div class="fg"><label>Street address</label><input type="text" class="fi" id="bld-addr" placeholder="123 Main St" value="${v('address')}"></div>
    <div class="form-row">
      <div class="fg"><label>City</label><input type="text" class="fi" id="bld-city" value="${v('city')}"></div>
      <div class="fg"><label>State</label><input type="text" class="fi" id="bld-state" value="${v('state')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Zip</label><input type="text" class="fi" id="bld-zip" value="${v('zip')}"></div>
      <div class="fg"><label>Year built</label><input type="number" class="fi" id="bld-year" placeholder="e.g. 1958" value="${v('year_built')||''}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Square footage</label><input type="number" class="fi" id="bld-sqft" placeholder="e.g. 18000" value="${v('square_footage')||''}"></div>
      <div class="fg"><label>Floors / Levels</label><input type="text" class="fi" id="bld-floors" placeholder="e.g. Basement, 1st, 2nd, Roof" value="${v('floors')}"></div>
    </div>
    <div style="background:var(--bg3);border-radius:8px;padding:14px;margin-bottom:12px">
      <div style="font-size:13px;font-weight:bold;color:var(--accent2);font-family:sans-serif;margin-bottom:10px">Emergency contact</div>
      <div class="form-row">
        <div class="fg"><label>Name</label><input type="text" class="fi" id="bld-em-name" placeholder="On-site contact after hours" value="${v('emergency_contact_name')}"></div>
        <div class="fg"><label>Phone</label><input type="text" class="fi" id="bld-em-phone" value="${v('emergency_contact_phone')}"></div>
      </div>
    </div>
    <div class="fg"><label>Key systems / shutoff locations</label><textarea class="fi" id="bld-systems" placeholder="e.g. Water main: rear janitor's closet. Gas shutoff: south exterior wall. Main electrical panel: Room 110.">${v('key_systems')}</textarea></div>
    <div class="fg"><label>Utilities tracked at this building</label>
      <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px;background:var(--bg3);border-radius:6px">
        ${COMMON_UTILITIES.map(u=>{
          const tracked=buildingTrackedUtilities(bld);
          const checked=tracked.includes(u);
          return`<label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer;font-family:sans-serif">
            <input type="checkbox" class="ut-check" value="${u}" ${checked?'checked':''}>${u}
          </label>`;
        }).join('')}
      </div>
      <div style="font-size:11px;color:var(--text3);margin-top:4px;font-family:sans-serif">Uncheck any that don't apply here (e.g. Water if on a well, Gas if all-electric).</div>
    </div>
    <div class="fg"><label>Photos</label>
      <div class="photo-gallery" id="bld-photo-gallery"></div>
      <div class="photo-upload" onclick="document.getElementById('bld-photo-input').click()">📷 Click or drag photos here<input type="file" id="bld-photo-input" accept="image/*" multiple style="display:none" onchange="addPendingPhotos('building',event,'bld-photo-gallery')"></div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('building-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitBuilding()">${bld?'Save Changes':'Add Building'}</button>
    </div>`;
  initPhotoState('building',bld?allPhotos(bld):[]);
  renderPhotoGallery('building','bld-photo-gallery');
  document.getElementById('building-modal').classList.add('open');
}

async function submitBuilding(){
  const name=document.getElementById('bld-name')?.value.trim();
  if(!name){showToast('Please enter a building name');return;}
  const photo_urls=await finalizePhotos('building','buildings');
  const yearVal=document.getElementById('bld-year')?.value;
  const sqftVal=document.getElementById('bld-sqft')?.value;
  const tracked_utilities=[...document.querySelectorAll('.ut-check:checked')].map(cb=>cb.value);
  saveBuilding({
    name,
    description:document.getElementById('bld-desc')?.value.trim(),
    address:document.getElementById('bld-addr')?.value.trim(),
    city:document.getElementById('bld-city')?.value.trim(),
    state:document.getElementById('bld-state')?.value.trim(),
    zip:document.getElementById('bld-zip')?.value.trim(),
    year_built:yearVal?Number(yearVal):null,
    square_footage:sqftVal?Number(sqftVal):null,
    floors:document.getElementById('bld-floors')?.value.trim(),
    emergency_contact_name:document.getElementById('bld-em-name')?.value.trim(),
    emergency_contact_phone:document.getElementById('bld-em-phone')?.value.trim(),
    key_systems:document.getElementById('bld-systems')?.value.trim(),
    tracked_utilities,
    photo_urls,
  });
  closeModal('building-modal');
}

function editBuilding(id){const b=buildings.find(x=>x.id===id);if(b)openBuildingModal(b);}

// ---- ROOM MODAL ----
function openRoomModal(room){
  editingRoomId=room?room.id:null;
  document.getElementById('room-modal-h').textContent=room?'Edit Room':'Add Room / Space';
  const v=k=>room?.[k]||'';
  const bld=buildings.find(b=>b.id===currentBuildingId);
  // Pull floor suggestions from the building's comma-separated floors list (if present),
  // plus any floors already used by rooms in this building (so even custom ones show up).
  const bldFloorText=bld?.floors||'';
  const suggestedFloors=[
    ...bldFloorText.split(',').map(s=>s.trim()).filter(Boolean),
    ...rooms.filter(r=>r.building_id===currentBuildingId).map(r=>r.floor).filter(Boolean),
  ];
  const uniqueFloors=[...new Set(suggestedFloors)];
  const sel=(val)=>room?.room_type===val?'selected':'';
  document.getElementById('room-body').innerHTML=`
    <div class="form-row">
      <div class="fg"><label>Room / Space name *</label><input type="text" class="fi" id="room-name" placeholder="e.g. Classroom, Boiler Room" value="${v('name')}"></div>
      <div class="fg"><label>Room number</label><input type="text" class="fi" id="room-number" placeholder="e.g. 209, 105B" value="${v('room_number')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Floor / Level</label>
        <input type="text" class="fi" id="room-floor" list="room-floor-options" placeholder="Pick or type a floor" value="${v('floor')||''}">
        <datalist id="room-floor-options">
          ${uniqueFloors.map(f=>`<option value="${f.replace(/"/g,'&quot;')}">`).join('')}
        </datalist>
      </div>
      <div class="fg"><label>Room type</label>
        <select class="fi" id="room-type">
          <option value="">Select...</option>
          ${roomTypes.map(t=>`<option ${sel(t.name)}>${t.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div style="font-size:11px;color:var(--text3);font-family:sans-serif;margin:-4px 0 10px">
      Floor suggestions come from the building's <em>Floors / Levels</em> field. Room type options are managed in <strong>Settings → Room Types</strong>.
    </div>
    <div class="form-row">
      <div class="fg"><label>Capacity</label><input type="number" class="fi" id="room-capacity" placeholder="Max occupants" value="${v('capacity')||''}"></div>
      <div class="fg"><label>Square footage</label><input type="number" class="fi" id="room-sqft" placeholder="e.g. 320" value="${v('square_footage')||''}"></div>
    </div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="room-notes" placeholder="Any relevant notes about this space...">${v('notes')}</textarea></div>
    <div class="fg"><label>Photos</label>
      <div class="photo-gallery" id="room-photo-gallery"></div>
      <div class="photo-upload" onclick="document.getElementById('room-photo-input').click()">📷 Click or drag photos here<input type="file" id="room-photo-input" accept="image/*" multiple style="display:none" onchange="addPendingPhotos('room',event,'room-photo-gallery')"></div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('room-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitRoom()">${room?'Save Changes':'Add Room'}</button>
    </div>`;
  initPhotoState('room',allPhotos(room));
  renderPhotoGallery('room','room-photo-gallery');
  document.getElementById('room-modal').classList.add('open');
}

async function submitRoom(){
  const name=document.getElementById('room-name')?.value.trim();
  if(!name){showToast('Please enter a room name');return;}
  const bld=buildings.find(b=>b.id===currentBuildingId);
  const photo_urls=await finalizePhotos('room','rooms');
  const capVal=document.getElementById('room-capacity')?.value;
  const sqftVal=document.getElementById('room-sqft')?.value;
  saveRoom({
    name,
    room_number:document.getElementById('room-number')?.value.trim()||null,
    floor:document.getElementById('room-floor')?.value.trim(),
    room_type:document.getElementById('room-type')?.value||null,
    capacity:capVal?Number(capVal):null,
    square_footage:sqftVal?Number(sqftVal):null,
    notes:document.getElementById('room-notes')?.value.trim(),
    building_id:currentBuildingId,
    building_name:bld?.name||'',
    photo_urls,
  });
  closeModal('room-modal');
}

function editRoom(id){const r=rooms.find(x=>x.id===id);if(r)openRoomModal(r);}

// ---- PM MODAL ----
function openPMModal(pm){
  editingPMId=pm?pm.id:null;
  document.getElementById('pm-modal-h').textContent=pm?'Edit PM Task':'Add PM Task';
  const v=k=>pm?.[k]||'';
  document.getElementById('pm-body').innerHTML=`
    <div class="fg"><label>Title *</label><input type="text" class="fi" id="pm-title" value="${v('title')}" placeholder="e.g. Trimark Spring PM"></div>
    <div class="form-row">
      <div class="fg"><label>Building *</label>
        <select class="fi" id="pm-bld">
          <option value="">Select...</option>
          <option ${v('building')==='All Buildings'?'selected':''}>All Buildings</option>
          ${buildings.map(b=>`<option ${v('building')===b.name?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label>Frequency *</label>
        <select class="fi" id="pm-freq">
          <option value="">Select...</option>
          <option ${v('frequency')==='Monthly'?'selected':''}>Monthly</option>
          <option ${v('frequency')==='Quarterly'?'selected':''}>Quarterly</option>
          <option ${v('frequency')==='Semi-Annual'?'selected':''}>Semi-Annual</option>
          <option ${v('frequency')==='Annual'?'selected':''}>Annual</option>
          <option ${v('frequency')==='As Needed'?'selected':''}>As Needed</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Next due date</label><input type="text" class="fi" id="pm-due" placeholder="e.g. Apr 2025" value="${v('next_due')}"></div>
      <div class="fg"><label>Assign to</label>
        <select class="fi" id="pm-assign">
          <option value="">Select...</option>
          ${contacts.map(c=>`<option ${v('assigned_to')===c.name?'selected':''}>${c.name}</option>`).join('')}
          <option>Other</option>
        </select>
      </div>
    </div>
    <div class="fg"><label>Description</label><textarea class="fi" id="pm-desc">${v('description')}</textarea></div>
    <div class="fg"><label>Assets covered by this PM</label>
      ${assetPickerFiltersHTML('pm-asset-list')}
      <div style="font-size:11px;color:var(--text3);font-family:sans-serif;margin-top:4px">Group multiple assets under one PM — e.g. "HVAC PM" covers every HVAC unit, "Fire Inspection" covers extinguishers + kitchen suppression.</div>
    </div>
    <div class="fg"><label>Status</label>
      <select class="fi" id="pm-status">
        <option ${!pm||pm.status==='Upcoming'?'selected':''}>Upcoming</option>
        <option ${v('status')==='Overdue'?'selected':''}>Overdue</option>
        <option ${v('status')==='Done'?'selected':''}>Done</option>
      </select>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('pm-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitPM()">${pm?'Save Changes':'Add PM Task'}</button>
    </div>`;
  const pmBld=pm?.building&&pm.building!=='All Buildings'?pm.building:'all';
  initAssetPicker('pm-asset-list',pm?.asset_ids||[],pmBld,false);
  const pmBldSel=document.getElementById('pm-asset-list-bld');
  if(pmBldSel&&pmBld!=='all')pmBldSel.value=pmBld;
  renderAssetPicker('pm-asset-list');
  document.getElementById('pm-modal').classList.add('open');
}

function submitPM(){
  const title=document.getElementById('pm-title')?.value.trim();
  const building=document.getElementById('pm-bld')?.value;
  const frequency=document.getElementById('pm-freq')?.value;
  if(!title||!building||!frequency){showToast('Please fill in title, building, frequency');return;}
  const asset_ids=getPickerChecked('pm-asset-list');
  savePM({
    title,building,frequency,
    next_due:document.getElementById('pm-due')?.value.trim(),
    assigned_to:document.getElementById('pm-assign')?.value,
    description:document.getElementById('pm-desc')?.value.trim(),
    status:document.getElementById('pm-status')?.value,
    asset_ids,
  });
}

function editPM(id){const p=pmTasks.find(x=>x.id===id);if(p)openPMModal(p);}

// ---- SCHEDULE PM MODAL ----
// Two-step contact picker: pick a contact (vendor/contractor/staff), then pick a specific
// person at that company from their people[] list (or add one inline).
let _pmSchedContactId=null;    // selected contact id
let _pmSchedPerson='';         // selected person name at that contact
let _pmSchedPMId=null;

function openPMScheduleModal(pmId){
  const pm=pmTasks.find(p=>p.id===pmId);
  if(!pm)return;
  _pmSchedPMId=pmId;
  // Pre-fill company from scheduled_with, falling back to pm.assigned_to
  const preferName=pm.scheduled_with||pm.assigned_to||'';
  const preferContact=contacts.find(c=>c.name===preferName);
  _pmSchedContactId=preferContact?.id||'';
  _pmSchedPerson=pm.scheduled_contact_person||'';

  document.getElementById('pm-schedule-modal-h').textContent=pm.scheduled_date?'Edit Schedule':'Schedule PM';
  document.getElementById('pm-schedule-body').innerHTML=`
    <div style="padding:10px 12px;background:var(--info-bg);border-radius:6px;margin-bottom:14px;font-family:sans-serif;font-size:12px">
      Scheduling <strong>${pm.title}</strong> — ${pm.building} · ${pm.frequency||'—'}
      ${pm.next_due?`<div style="font-size:11px;color:var(--text3);margin-top:2px">Normally due: ${pm.next_due}</div>`:''}
    </div>
    <div class="form-row">
      <div class="fg"><label>Scheduled date *</label><input type="date" class="fi" id="pm-sched-date" value="${pm.scheduled_date||''}"></div>
      <div class="fg"><label>Time (optional)</label><input type="time" class="fi" id="pm-sched-time" value="${pm.scheduled_time||''}"></div>
    </div>
    <div class="fg"><label>Scheduled with (company / person)</label>
      <select class="fi" id="pm-sched-company" onchange="onPMSchedCompanyChange(this.value)">
        <option value="">—</option>
        ${[...contacts].sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option value="${c.id}" ${c.id===_pmSchedContactId?'selected':''}>${c.name}${c.type&&c.type!=='Staff'?' ('+c.type+')':''}</option>`).join('')}
      </select>
    </div>
    <div id="pm-sched-person-wrap"></div>
    <div class="fg"><label>Notes about the call / email</label>
      <textarea class="fi" id="pm-sched-notes" placeholder="e.g. Called Mike 4/23, confirmed Spring PM, will bring new filters">${pm.scheduled_notes||''}</textarea>
    </div>
    <div class="fg" style="display:flex;align-items:center;gap:8px;font-family:sans-serif;font-size:13px;padding:8px 12px;background:var(--bg3);border-radius:6px">
      <input type="checkbox" id="pm-sched-create-wo" ${pm.scheduled_date?'':'checked'} style="width:16px;height:16px;cursor:pointer">
      <label for="pm-sched-create-wo" style="cursor:pointer;margin:0">Also create a Work Order for this visit${pm.scheduled_date?' (already scheduled — check to create another)':''}</label>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('pm-schedule-modal')">Cancel</button>
      ${pm.scheduled_date?`<button class="btn btn-danger" onclick="clearPMSchedule('${pmId}')">Clear schedule</button>`:''}
      <button class="btn btn-primary" onclick="submitPMSchedule('${pmId}')">${pm.scheduled_date?'Save changes':'Save schedule'}</button>
    </div>`;
  renderPMSchedulePersonPicker();
  document.getElementById('pm-schedule-modal').classList.add('open');
}

function onPMSchedCompanyChange(contactId){
  _pmSchedContactId=contactId;
  _pmSchedPerson=''; // reset person when company changes
  renderPMSchedulePersonPicker();
}

function renderPMSchedulePersonPicker(){
  const wrap=document.getElementById('pm-sched-person-wrap');
  if(!wrap)return;
  const contact=contacts.find(c=>c.id===_pmSchedContactId);
  if(!contact){wrap.innerHTML='';return;}
  const isOrg=contact.type==='Contractor'||contact.type==='Vendor';
  const people=Array.isArray(contact.people)?contact.people:[];
  if(!isOrg){
    // Staff/Volunteer: the contact IS the person, no sub-picker needed
    wrap.innerHTML=`<div style="font-size:11px;color:var(--text3);font-family:sans-serif;margin:-6px 0 12px;padding-left:2px">You'll be scheduling with ${contact.name} directly.</div>`;
    _pmSchedPerson='';
    return;
  }
  wrap.innerHTML=`
    <div class="fg"><label>Contact at ${contact.name}</label>
      <select class="fi" id="pm-sched-person" onchange="onPMSchedPersonChange(this.value)">
        <option value="">— (company only)</option>
        ${people.map(p=>`<option value="${(p.name||'').replace(/"/g,'&quot;')}" ${_pmSchedPerson===p.name?'selected':''}>${p.name}${p.title?' — '+p.title:''}</option>`).join('')}
        <option value="__add__">+ Add new contact at ${contact.name}…</option>
      </select>
    </div>
    <div id="pm-sched-new-person" style="display:none;padding:10px 12px;background:var(--bg3);border-radius:6px;margin-bottom:12px">
      <div style="font-size:11px;font-weight:bold;color:var(--accent2);font-family:sans-serif;margin-bottom:8px;text-transform:uppercase;letter-spacing:.06em">Add new contact at ${contact.name}</div>
      <div class="form-row">
        <div class="fg"><label>Name *</label><input type="text" class="fi" id="new-person-name" placeholder="Full name"></div>
        <div class="fg"><label>Title</label><input type="text" class="fi" id="new-person-title" placeholder="Sales Rep, A/P, Service Manager…"></div>
      </div>
      <div class="form-row">
        <div class="fg"><label>Cell phone</label><input type="text" class="fi" id="new-person-phone"></div>
        <div class="fg"><label>Email</label><input type="text" class="fi" id="new-person-email"></div>
      </div>
      <div class="form-row">
        <div class="fg"><label>Office phone</label><input type="text" class="fi" id="new-person-phone-office"></div>
        <div class="fg" style="max-width:120px"><label>Extension</label><input type="text" class="fi" id="new-person-phone-office-ext"></div>
      </div>
      <div style="display:flex;gap:6px;justify-content:flex-end">
        <button type="button" class="btn btn-sm" onclick="cancelAddSchedPerson()">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" onclick="saveNewSchedPerson('${contact.id}')">Save person</button>
      </div>
    </div>`;
}

function onPMSchedPersonChange(val){
  if(val==='__add__'){
    const box=document.getElementById('pm-sched-new-person');
    if(box){box.style.display='block';document.getElementById('new-person-name')?.focus();}
  }else{
    _pmSchedPerson=val;
  }
}

function cancelAddSchedPerson(){
  const box=document.getElementById('pm-sched-new-person');
  if(box)box.style.display='none';
  const sel=document.getElementById('pm-sched-person');
  if(sel)sel.value=_pmSchedPerson||'';
}

async function saveNewSchedPerson(contactId){
  const name=document.getElementById('new-person-name')?.value.trim();
  if(!name){showToast('Name is required');return;}
  const person={
    name,
    title:document.getElementById('new-person-title')?.value.trim()||'',
    phone:document.getElementById('new-person-phone')?.value.trim()||'',
    phone_office:document.getElementById('new-person-phone-office')?.value.trim()||'',
    phone_office_ext:document.getElementById('new-person-phone-office-ext')?.value.trim()||'',
    email:document.getElementById('new-person-email')?.value.trim()||'',
  };
  const saved=await addPersonToContact(contactId,person);
  if(!saved)return;
  _pmSchedPerson=name;
  renderPMSchedulePersonPicker();
  showToast('Contact added');
}

function submitPMSchedule(pmId){
  const date=document.getElementById('pm-sched-date')?.value;
  if(!date){showToast('Please pick a scheduled date');return;}
  const company=contacts.find(c=>c.id===_pmSchedContactId)?.name||'';
  schedulePM(pmId,{
    date,
    time:document.getElementById('pm-sched-time')?.value||'',
    withWhom:company,
    contactPerson:_pmSchedPerson||'',
    notes:document.getElementById('pm-sched-notes')?.value.trim()||'',
    createWO:!!document.getElementById('pm-sched-create-wo')?.checked,
  });
}

// ---- INVOICE MODAL ----
function openInvoiceModal(inv){
  editingInvId=inv?inv.id:null;
  document.getElementById('inv-modal-h').textContent=inv?'Edit Invoice':'Add Invoice';
  const v=k=>inv?.[k]||'';
  document.getElementById('inv-body').innerHTML=`
    <div class="form-row">
      <div class="fg"><label>Invoice number</label><input type="text" class="fi" id="inv-num" placeholder="e.g. 118436" value="${v('invoice_number')}"></div>
      <div class="fg"><label>Date</label><input type="text" class="fi" id="inv-date" placeholder="e.g. 09/09/2020" value="${v('date')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Vendor *</label>
        <select class="fi" id="inv-vendor">
          <option value="">Select...</option>
          ${contacts.filter(c=>c.type==='Contractor'||c.type==='Vendor').sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option ${v('vendor')===c.name?'selected':''}>${c.name}</option>`).join('')}
          <option ${v('vendor')==='Other'?'selected':''}>Other</option>
        </select>
      </div>
      <div class="fg"><label>Building</label>
        <select class="fi" id="inv-bld">
          <option value="">Select...</option>
          <option ${v('building')==='All Buildings'?'selected':''}>All Buildings</option>
          ${buildings.map(b=>`<option ${v('building')===b.name?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="fg"><label>Description *</label><input type="text" class="fi" id="inv-desc" placeholder="Brief description of work performed" value="${v('description')}"></div>
    <div class="form-row">
      <div class="fg"><label>Amount *</label><input type="number" class="fi" id="inv-amount" placeholder="0.00" value="${v('amount')}"></div>
      <div class="fg"><label>Status</label>
        <select class="fi" id="inv-status">
          <option ${!inv||inv.status==='Paid'?'selected':''}>Paid</option>
          <option ${v('status')==='Unpaid'?'selected':''}>Unpaid</option>
        </select>
      </div>
    </div>
    <div class="fg"><label>Invoice PDFs</label>
      <div id="inv-pdf-list"></div>
      <div class="photo-upload" onclick="document.getElementById('inv-pdf-input').click()">📄 Click or drag PDFs here<input type="file" id="inv-pdf-input" accept=".pdf" multiple style="display:none" onchange="addPendingPDFs('invoice',event,'inv-pdf-list')"></div>
    </div>
    <div class="fg"><label>Assets this invoice covers</label>
      ${assetPickerFiltersHTML('inv-asset-list')}
    </div>
    <div class="fg"><label>Related work orders
      <span style="font-weight:normal;font-size:11px;color:var(--text3);margin-left:6px">
        <input type="checkbox" id="inv-wo-showall" onchange="renderInvoiceWOPicker()" style="vertical-align:middle"> Show all (including already-invoiced)
      </span>
    </label>
      <div id="inv-wo-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border2);border-radius:6px;padding:6px"></div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('invoice-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitInvoice()">${inv?'Save Changes':'Add Invoice'}</button>
    </div>`;
  initAssetPicker('inv-asset-list',inv?.asset_ids||[],inv?.building||'all');
  const pickerBld=document.getElementById('inv-asset-list-bld');
  if(pickerBld&&inv?.building)pickerBld.value=inv.building;
  renderAssetPicker('inv-asset-list');
  initPhotoState('invoice',allPDFs(inv));
  renderPDFList('invoice','inv-pdf-list');
  _invWoCheckedState=new Set(inv?.work_order_ids||[]);
  _invWoEditingId=editingInvId;
  renderInvoiceWOPicker();
  document.getElementById('invoice-modal').classList.add('open');
}

// Work-order picker state for the invoice modal
let _invWoCheckedState=new Set();
let _invWoEditingId=null;

function renderInvoiceWOPicker(){
  const el=document.getElementById('inv-wo-list');
  if(!el)return;
  const showAll=document.getElementById('inv-wo-showall')?.checked;
  // Filter: include a WO if (a) show-all is on, (b) it's checked on this invoice,
  // (c) it has no linked invoices yet, or (d) the only linked invoice is the one being edited.
  const visible=workOrders.filter(w=>{
    if(showAll)return true;
    if(_invWoCheckedState.has(w.id))return true;
    const ids=Array.isArray(w.invoice_ids)?w.invoice_ids:[];
    if(!ids.length)return true;
    if(_invWoEditingId&&ids.length===1&&ids[0]===_invWoEditingId)return true;
    return false;
  }).sort((a,b)=>{
    // Completed first, then Open, then In Progress — so recently-done work surfaces
    const order={Completed:0,'In Progress':1,Open:2};
    return(order[a.status]??9)-(order[b.status]??9)||(a.issue||'').localeCompare(b.issue||'');
  });
  el.innerHTML=visible.length?visible.map(w=>{
    const checked=_invWoCheckedState.has(w.id);
    const otherInvCount=(Array.isArray(w.invoice_ids)?w.invoice_ids.filter(id=>id!==_invWoEditingId):[]).length;
    const linkHint=otherInvCount>0?`<span class="badge b-gray" style="font-size:9px;margin-left:6px">${otherInvCount} other invoice${otherInvCount>1?'s':''}</span>`:'';
    return`<div class="asset-select-item ${checked?'selected':''}" onclick="toggleInvWO('${w.id}',this)">
      <input type="checkbox" ${checked?'checked':''} onclick="event.stopPropagation();toggleInvWO('${w.id}',this.closest('.asset-select-item'))">
      <div style="flex:1;min-width:0"><div style="font-weight:bold">${w.issue}${linkHint}</div><div style="font-size:11px;color:var(--text3)">${w.building} · ${w.status}${w.assignee?' · '+w.assignee:''}${w.completed_date?' · done '+w.completed_date:''}</div></div>
    </div>`;
  }).join(''):'<div style="font-size:12px;color:var(--text3);font-family:sans-serif;padding:12px;text-align:center">No matching work orders.</div>';
}

function toggleInvWO(id,rowEl){
  if(_invWoCheckedState.has(id))_invWoCheckedState.delete(id);
  else _invWoCheckedState.add(id);
  const isNow=_invWoCheckedState.has(id);
  if(rowEl){
    rowEl.classList.toggle('selected',isNow);
    const cb=rowEl.querySelector('input[type=checkbox]');
    if(cb)cb.checked=isNow;
  }
}


function editInvoice(id){const i=invoices.find(x=>x.id===id);if(i)openInvoiceModal(i);}

async function submitInvoice(){
  const vendor=document.getElementById('inv-vendor')?.value;
  const description=document.getElementById('inv-desc')?.value.trim();
  const amount=parseFloat(document.getElementById('inv-amount')?.value||0);
  if(!vendor||!description){showToast('Please fill in vendor and description');return;}
  const pdf_urls=await finalizePhotos('invoice','invoices');
  const asset_ids=getPickerChecked('inv-asset-list');
  const work_order_ids=[..._invWoCheckedState];
  saveInvoice({
    invoice_number:document.getElementById('inv-num')?.value.trim(),
    date:document.getElementById('inv-date')?.value.trim(),
    vendor,building:document.getElementById('inv-bld')?.value,
    description,amount,
    status:document.getElementById('inv-status')?.value,
    pdf_urls,
    pdf_url:pdf_urls[0]||null,
    asset_ids:asset_ids.length?asset_ids:[],
    work_order_ids:work_order_ids.length?work_order_ids:[],
  });
  closeModal('invoice-modal');
}

// ---- CONTACT MODAL ----
function openContactModal(contact){
  editingContactId=contact?contact.id:null;
  document.getElementById('contact-modal-h').textContent=contact?'Edit Contact':'Add Contact';
  const v=k=>contact?.[k]||'';
  const sel=(k,val)=>contact?.[k]===val?'selected':'';
  document.getElementById('contact-body').innerHTML=`
    <div class="form-row">
      <div class="fg"><label>Name *</label><input type="text" class="fi" id="ct-name" placeholder="Full name or company" value="${v('name')}"></div>
      <div class="fg"><label>Role *</label><input type="text" class="fi" id="ct-role" placeholder="e.g. HVAC Contractor" value="${v('role')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Type *</label>
        <select class="fi" id="ct-type" onchange="toggleTypeSections(this.value)">
          <option ${sel('type','Contractor')||(!contact&&currentContactType==='Contractor'?'selected':'')}>Contractor</option>
          <option ${sel('type','Vendor')||(!contact&&currentContactType==='Vendor'?'selected':'')}>Vendor</option>
          <option ${sel('type','Staff')||(!contact&&currentContactType==='Staff'?'selected':'')}>Staff</option>
          <option ${sel('type','Volunteer')||(!contact&&currentContactType==='Volunteer'?'selected':'')}>Volunteer</option>
        </select>
      </div>
      <div class="fg"><label id="ct-phone-label">Cell phone</label><input type="text" class="fi" id="ct-phone" value="${v('phone')}"></div>
    </div>
    <div id="ct-phones-section" style="background:var(--bg3);border-radius:8px;padding:14px;margin-bottom:12px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:13px;font-weight:bold;color:var(--accent2);font-family:sans-serif">Additional phone numbers</div>
        <button type="button" class="btn btn-sm" onclick="addContactPhone()">+ Add phone</button>
      </div>
      <div id="ct-phones-list"></div>
      <datalist id="ct-phone-label-opts">
        <option value="Home"><option value="Work"><option value="2nd Cell"><option value="Office"><option value="Pager"><option value="Fax">
      </datalist>
    </div>
    <div class="fg"><label>Email</label><input type="text" class="fi" id="ct-email" value="${v('email')}"></div>
    <div class="fg"><label>Website</label><input type="text" class="fi" id="ct-website" placeholder="https://example.com" value="${v('website')}"></div>
    <div class="fg"><label>Street address</label><input type="text" class="fi" id="ct-address" placeholder="123 Main St" value="${v('address')}"></div>
    <div class="form-row">
      <div class="fg"><label>City</label><input type="text" class="fi" id="ct-city" value="${v('city')}"></div>
      <div class="fg"><label>State</label><input type="text" class="fi" id="ct-state" value="${v('state')}"></div>
    </div>
    <div class="fg"><label>Zip</label><input type="text" class="fi" id="ct-zip" value="${v('zip')}"></div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="ct-notes">${v('notes')}</textarea></div>
    <div id="people-section" style="background:var(--bg3);border-radius:8px;padding:14px;margin-bottom:12px;display:${((contact?.type||currentContactType)==='Contractor'||(contact?.type||currentContactType)==='Vendor')?'block':'none'}">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div style="font-size:13px;font-weight:bold;color:var(--accent2);font-family:sans-serif">Points of Contact</div>
        <button type="button" class="btn btn-sm" onclick="addPerson()">+ Add Person</button>
      </div>
      <div id="people-list"></div>
    </div>
    <div id="coi-section" style="background:var(--bg3);border-radius:8px;padding:14px;margin-bottom:12px;display:${((contact?.type||currentContactType)==='Contractor')?'block':'none'}">
      <div style="font-size:13px;font-weight:bold;color:var(--accent2);font-family:sans-serif;margin-bottom:10px">Certificate of Insurance</div>
      <div class="form-row">
        <div class="fg"><label>COI Expiry date</label><input type="text" class="fi" id="ct-coi-exp" placeholder="e.g. Dec 31 2025" value="${v('coi_expiry')}"></div>
        <div class="fg"><label>Insurance company</label><input type="text" class="fi" id="ct-coi-ins" placeholder="e.g. State Farm" value="${v('coi_insurer')}"></div>
      </div>
      <div class="fg"><label>Policy number</label><input type="text" class="fi" id="ct-coi-pol" placeholder="Policy number" value="${v('coi_policy_number')}"></div>
      <div class="fg"><label>COI Document</label>
        ${contact?.coi_url?`<div style="margin-bottom:8px"><a href="${contact.coi_url}" target="_blank" style="color:var(--accent);font-family:sans-serif;font-size:13px">📄 View current COI</a></div>`:''}
        <div class="photo-upload" onclick="document.getElementById('coi-file-input').click()">📄 ${contact?.coi_url?'Upload new COI (replaces current)':'Upload COI document (PDF or image)'}<input type="file" id="coi-file-input" accept=".pdf,image/*" style="display:none" onchange="previewCOI(event)"></div>
        <div id="coi-preview" style="font-size:12px;color:var(--success);font-family:sans-serif;margin-top:6px"></div>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('contact-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitContact()">${contact?'Save Changes':'Add Contact'}</button>
    </div>`;
  peopleDraft=Array.isArray(contact?.people)?contact.people.map(p=>({...p})):[];
  renderPeopleList();
  phonesDraft=Array.isArray(contact?.additional_phones)?contact.additional_phones.map(p=>({...p})):[];
  renderContactPhonesList();
  // Sync visibility of COI + people + phone rows based on the initially selected type
  toggleTypeSections(document.getElementById('ct-type')?.value||'');
  document.getElementById('contact-modal').classList.add('open');
}

// Local draft of the points-of-contact list while the contact modal is open.
// Persisted to contact.people on save.
let peopleDraft=[];

function renderPeopleList(){
  const el=document.getElementById('people-list');
  if(!el)return;
  if(!peopleDraft.length){el.innerHTML='<div style="font-size:12px;color:var(--text3);font-family:sans-serif;padding:4px 0">No points of contact yet.</div>';return;}
  el.innerHTML=peopleDraft.map((p,i)=>`
    <div class="person-row" data-i="${i}" style="display:grid;grid-template-columns:1fr 1fr auto;gap:6px;margin-bottom:8px;padding:8px;border:1px solid var(--border);border-radius:6px;background:var(--bg2)">
      <input type="text" class="fi person-name" placeholder="Name" value="${(p.name||'').replace(/"/g,'&quot;')}">
      <input type="text" class="fi person-title" placeholder="Title (Sales Rep, A/P, etc.)" value="${(p.title||'').replace(/"/g,'&quot;')}">
      <button type="button" class="btn btn-danger btn-sm" onclick="removePerson(${i})" title="Remove">✕</button>
      <input type="text" class="fi person-phone" placeholder="Phone" value="${(p.phone||'').replace(/"/g,'&quot;')}" style="grid-column:1">
      <input type="text" class="fi person-email" placeholder="Email" value="${(p.email||'').replace(/"/g,'&quot;')}" style="grid-column:2/4">
      <input type="text" class="fi person-notes" placeholder="Notes (optional)" value="${(p.notes||'').replace(/"/g,'&quot;')}" style="grid-column:1/4">
    </div>`).join('');
}

function capturePeopleDraft(){
  peopleDraft=[...document.querySelectorAll('#people-list .person-row')].map(r=>({
    name:r.querySelector('.person-name')?.value.trim()||'',
    title:r.querySelector('.person-title')?.value.trim()||'',
    phone:r.querySelector('.person-phone')?.value.trim()||'',
    email:r.querySelector('.person-email')?.value.trim()||'',
    notes:r.querySelector('.person-notes')?.value.trim()||'',
  }));
}

function addPerson(){capturePeopleDraft();peopleDraft.push({});renderPeopleList();}
function removePerson(i){capturePeopleDraft();peopleDraft.splice(i,1);renderPeopleList();}

function previewCOI(event){
  const file=event.target.files[0];
  if(file)document.getElementById('coi-preview').textContent='✓ '+file.name+' ready to upload';
}

function toggleTypeSections(type){
  const coi=document.getElementById('coi-section');
  if(coi)coi.style.display=type==='Contractor'?'block':'none';
  const people=document.getElementById('people-section');
  if(people)people.style.display=(type==='Contractor'||type==='Vendor')?'block':'none';
  // Additional phone list only applies to individuals (Staff / Volunteer).
  const phonesSection=document.getElementById('ct-phones-section');
  if(phonesSection)phonesSection.style.display=(type==='Staff'||type==='Volunteer')?'':'none';
  // The primary phone is a Main business number for orgs, a Cell for individuals.
  const phoneLabel=document.getElementById('ct-phone-label');
  if(phoneLabel)phoneLabel.textContent=(type==='Contractor'||type==='Vendor')?'Main phone':'Cell phone';
}

// Local draft of the additional-phones list while the contact modal is open.
let phonesDraft=[];

function renderContactPhonesList(){
  const el=document.getElementById('ct-phones-list');
  if(!el)return;
  if(!phonesDraft.length){el.innerHTML='<div style="font-size:12px;color:var(--text3);font-family:sans-serif;padding:4px 0">None yet.</div>';return;}
  el.innerHTML=phonesDraft.map((ph,i)=>`
    <div class="phone-row" data-i="${i}" style="display:grid;grid-template-columns:160px 1fr auto;gap:6px;margin-bottom:6px;padding:6px;border:1px solid var(--border);border-radius:6px;background:var(--bg2)">
      <input type="text" class="fi phone-label-input" list="ct-phone-label-opts" placeholder="Label" value="${(ph.label||'').replace(/"/g,'&quot;')}">
      <input type="text" class="fi phone-number-input" placeholder="Number" value="${(ph.number||'').replace(/"/g,'&quot;')}">
      <button type="button" class="btn btn-danger btn-sm" onclick="removeContactPhone(${i})" title="Remove">✕</button>
    </div>`).join('');
}

function captureContactPhonesDraft(){
  phonesDraft=[...document.querySelectorAll('#ct-phones-list .phone-row')].map(r=>({
    label:r.querySelector('.phone-label-input')?.value.trim()||'',
    number:r.querySelector('.phone-number-input')?.value.trim()||'',
  }));
}

function addContactPhone(){captureContactPhonesDraft();phonesDraft.push({label:'',number:''});renderContactPhonesList();}
function removeContactPhone(i){captureContactPhonesDraft();phonesDraft.splice(i,1);renderContactPhonesList();}

async function submitContact(){
  const name=document.getElementById('ct-name')?.value.trim();
  const role=document.getElementById('ct-role')?.value.trim();
  const type=document.getElementById('ct-type')?.value;
  if(!name||!role){showToast('Please fill in name and role');return;}
  // COI fields only persisted for Contractors; wiped for other types to keep data clean.
  const isContractor=type==='Contractor';
  let coi_url=null;
  if(isContractor){
    coi_url=editingContactId?contacts.find(c=>c.id===editingContactId)?.coi_url:null;
    const coiFile=document.getElementById('coi-file-input')?.files[0];
    if(coiFile)coi_url=await uploadFile(coiFile,'coi');
  }
  // Capture latest person-row input values before saving
  capturePeopleDraft();
  const isVendor=type==='Vendor';
  // People only apply to Contractor/Vendor; wiped for Staff/Volunteer. Drop empty rows.
  const people=(isContractor||isVendor)
    ?peopleDraft.filter(p=>p.name||p.title||p.phone||p.email||p.notes)
    :[];
  const isIndividual=type==='Staff'||type==='Volunteer';
  // Capture any in-progress phone-row inputs and drop rows with neither a label nor number
  captureContactPhonesDraft();
  const additional_phones=isIndividual?phonesDraft.filter(p=>p.label||p.number):[];
  saveContact({
    name,role,type,
    phone:document.getElementById('ct-phone')?.value.trim(),
    phone_office:null,
    phone_office_ext:null,
    phone_home:null, // superseded by additional_phones for Staff/Volunteer
    additional_phones,
    email:document.getElementById('ct-email')?.value.trim(),
    website:document.getElementById('ct-website')?.value.trim(),
    address:document.getElementById('ct-address')?.value.trim(),
    city:document.getElementById('ct-city')?.value.trim(),
    state:document.getElementById('ct-state')?.value.trim(),
    zip:document.getElementById('ct-zip')?.value.trim(),
    notes:document.getElementById('ct-notes')?.value.trim(),
    people,
    coi_expiry:isContractor?document.getElementById('ct-coi-exp')?.value.trim():null,
    coi_insurer:isContractor?document.getElementById('ct-coi-ins')?.value.trim():null,
    coi_policy_number:isContractor?document.getElementById('ct-coi-pol')?.value.trim():null,
    coi_url:isContractor?coi_url:null,
  });
  closeModal('contact-modal');
}

function editContact(id){const c=contacts.find(x=>x.id===id);if(c)openContactModal(c);}

// ---- POINT-OF-CONTACT MODAL (add + edit + delete, no-full-contact-edit) ----
// personIndex === undefined/null or < 0 means "add new". Otherwise edit that entry.
function openPersonModal(contactId,personIndex){
  const contact=contacts.find(c=>c.id===contactId);
  if(!contact)return;
  const isEdit=personIndex!==undefined&&personIndex!==null&&personIndex>=0;
  const person=isEdit&&Array.isArray(contact.people)?contact.people[personIndex]:null;
  if(isEdit&&!person)return;
  const v=k=>(person&&person[k])||'';
  document.getElementById('add-person-modal-h').textContent=isEdit?'Edit Point of Contact':'Add Point of Contact';
  document.getElementById('add-person-modal-sub').textContent=isEdit
    ?`Editing ${person.name||'contact'} at ${contact.name}.`
    :`Appending a new contact to ${contact.name}.`;
  document.getElementById('add-person-body').innerHTML=`
    <div class="form-row">
      <div class="fg"><label>Name *</label><input type="text" class="fi" id="ap-name" placeholder="Full name" value="${v('name').replace(/"/g,'&quot;')}"></div>
      <div class="fg"><label>Title</label><input type="text" class="fi" id="ap-title" placeholder="Sales Rep, A/P, Service Manager…" value="${v('title').replace(/"/g,'&quot;')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Cell phone</label><input type="text" class="fi" id="ap-phone" value="${v('phone').replace(/"/g,'&quot;')}"></div>
      <div class="fg"><label>Email</label><input type="text" class="fi" id="ap-email" value="${v('email').replace(/"/g,'&quot;')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Office phone</label><input type="text" class="fi" id="ap-phone-office" value="${v('phone_office').replace(/"/g,'&quot;')}"></div>
      <div class="fg" style="max-width:120px"><label>Extension</label><input type="text" class="fi" id="ap-phone-office-ext" value="${v('phone_office_ext').replace(/"/g,'&quot;')}"></div>
    </div>
    <div class="fg"><label>Notes</label><input type="text" class="fi" id="ap-notes" placeholder="Optional — best time to reach, preferences, etc." value="${v('notes').replace(/"/g,'&quot;')}"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('add-person-modal')">Cancel</button>
      ${isEdit?`<button class="btn btn-danger" onclick="confirmDeletePerson('${contactId}',${personIndex})">Delete</button>`:''}
      <button class="btn btn-primary" onclick="submitPerson('${contactId}',${isEdit?personIndex:-1})">${isEdit?'Save Changes':'Add Contact'}</button>
    </div>`;
  document.getElementById('add-person-modal').classList.add('open');
  setTimeout(()=>document.getElementById('ap-name')?.focus(),50);
}

// Backwards-compat alias (used by inline "+ Add Contact" buttons in earlier code paths)
function openAddPersonModal(contactId){openPersonModal(contactId);}

async function submitPerson(contactId,personIndex){
  const name=document.getElementById('ap-name')?.value.trim();
  if(!name){showToast('Name is required');return;}
  const person={
    name,
    title:document.getElementById('ap-title')?.value.trim()||'',
    phone:document.getElementById('ap-phone')?.value.trim()||'',
    phone_office:document.getElementById('ap-phone-office')?.value.trim()||'',
    phone_office_ext:document.getElementById('ap-phone-office-ext')?.value.trim()||'',
    email:document.getElementById('ap-email')?.value.trim()||'',
    notes:document.getElementById('ap-notes')?.value.trim()||'',
  };
  const isEdit=personIndex>=0;
  const ok=isEdit
    ?await updatePersonOnContact(contactId,personIndex,person)
    :await addPersonToContact(contactId,person);
  if(!ok)return;
  closeModal('add-person-modal');
  showToast(isEdit?'Point of contact updated':'Point of contact added');
  renderContacts();
}

function confirmDeletePerson(contactId,personIndex){
  const c=contacts.find(x=>x.id===contactId);
  const person=c?.people?.[personIndex];
  if(!person)return;
  document.getElementById('conf-h').textContent='Delete point of contact?';
  document.getElementById('conf-msg').textContent=`"${person.name||'Contact'}" will be removed from ${c.name}. Historical records (PMs, work orders, invoices) that reference this person by name are preserved.`;
  document.getElementById('conf-ok').onclick=()=>{
    deletePersonFromContact(contactId,personIndex);
    closeConfirm();
    closeModal('add-person-modal');
  };
  document.getElementById('confirm-overlay').classList.add('open');
}

// ---- HISTORY DETAIL MODAL ----
function showHistDetail(inv){
  const h=serviceHistory.find(x=>x.inv===inv);if(!h)return;
  document.getElementById('hm-h').textContent='Invoice '+h.inv;
  document.getElementById('hm-sub').textContent=h.date+' · '+h.building;
  document.getElementById('hm-body').innerHTML=`
    <div class="dr"><div class="dl">Equipment</div><div style="font-family:sans-serif">${h.equip}</div></div>
    <div class="dr"><div class="dl">Amount</div><div style="font-family:sans-serif;font-weight:bold">${h.amount>0?fmt(h.amount):'No charge / Proposal'}</div></div>
    <div style="margin-top:12px;font-size:11px;color:var(--text3);font-family:sans-serif;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px">Work performed</div>
    <div class="notes-box">${h.desc}</div>
    <div class="modal-actions"><button class="btn" onclick="closeModal('hist-modal')">Close</button></div>`;
  document.getElementById('hist-modal').classList.add('open');
}

// ---- PHOTO / LIGHTBOX ----
function previewPhoto(event,previewId){
  const file=event.target.files[0];if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{const img=document.getElementById(previewId);if(img){img.src=e.target.result;img.style.display='block';}};
  reader.readAsDataURL(file);
}

function openLightbox(url){document.getElementById('lightbox-img').src=url;document.getElementById('lightbox').classList.add('open');}

// ---- DELETE CONFIRMATIONS ----
function confirmDeleteAsset(id,name){
  document.getElementById('conf-h').textContent='Delete asset?';
  document.getElementById('conf-msg').textContent=`"${name}" will be permanently removed.`;
  document.getElementById('conf-ok').onclick=()=>{deleteAsset(id);closeConfirm();};
  document.getElementById('confirm-overlay').classList.add('open');
}
function confirmDeleteWO(id){
  document.getElementById('conf-h').textContent='Delete work order?';
  document.getElementById('conf-msg').textContent='This work order will be permanently removed.';
  document.getElementById('conf-ok').onclick=()=>{deleteWO(id);closeConfirm();};
  document.getElementById('confirm-overlay').classList.add('open');
}
function confirmDeletePM(id){
  document.getElementById('conf-h').textContent='Delete PM task?';
  document.getElementById('conf-msg').textContent='This PM task will be permanently removed.';
  document.getElementById('conf-ok').onclick=()=>{deletePM(id);closeConfirm();};
  document.getElementById('confirm-overlay').classList.add('open');
}
function confirmDeleteContact(id,name){
  const c=contacts.find(x=>x.id===id);
  const pocCount=Array.isArray(c?.people)?c.people.length:0;
  const extras=pocCount>0?` This also removes ${pocCount} linked point${pocCount===1?'':'s'} of contact.`:'';
  document.getElementById('conf-h').textContent='Delete contact?';
  document.getElementById('conf-msg').textContent=`"${name}" will be permanently removed.${extras} This cannot be undone.`;
  document.getElementById('conf-ok').onclick=()=>{deleteContact(id);closeConfirm();};
  document.getElementById('confirm-overlay').classList.add('open');
}
function confirmDeleteBuilding(id,name){
  document.getElementById('conf-h').textContent='Delete building?';
  document.getElementById('conf-msg').textContent=`"${name}" and all its rooms will be permanently removed.`;
  document.getElementById('conf-ok').onclick=async()=>{
    try{await db.from('buildings').delete().eq('id',id);buildings=buildings.filter(b=>b.id!==id);rooms=rooms.filter(r=>r.building_id!==id);showToast('Building deleted');renderBuildings();renderBuildingNav();populateBuildingDropdowns();}catch(e){showToast('Error deleting');}
    closeConfirm();
  };
  document.getElementById('confirm-overlay').classList.add('open');
}
function confirmDeleteRoom(id,name){
  document.getElementById('conf-h').textContent='Delete room?';
  document.getElementById('conf-msg').textContent=`"${name}" will be permanently removed.`;
  document.getElementById('conf-ok').onclick=async()=>{
    try{await db.from('rooms').delete().eq('id',id);rooms=rooms.filter(r=>r.id!==id);showToast('Room deleted');renderRooms();}catch(e){showToast('Error deleting');}
    closeConfirm();
  };
  document.getElementById('confirm-overlay').classList.add('open');
}

// ---- CATEGORY MODAL ----
function openCategoryModal(cat){
  editingCategoryId=cat?cat.id:null;
  document.getElementById('cat-modal-h').textContent=cat?'Edit Category':'Add Category';
  const v=k=>cat?.[k]||'';
  document.getElementById('cat-body').innerHTML=`
    <div class="form-row">
      <div class="fg"><label>Name *</label><input type="text" class="fi" id="cat-name" placeholder="e.g. Landscaping" value="${v('name')}"></div>
      <div class="fg"><label>Icon (emoji)</label><input type="text" class="fi" id="cat-icon" placeholder="📦" value="${v('icon')}" maxlength="4"></div>
    </div>
    <div style="font-size:12px;color:var(--text3);font-family:sans-serif;margin-bottom:12px">
      ${cat?'Renaming will update every asset using this category.':'Paste any emoji or leave blank for the default 📦.'}
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('category-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitCategory()">${cat?'Save Changes':'Add Category'}</button>
    </div>`;
  document.getElementById('category-modal').classList.add('open');
}

function submitCategory(){
  const name=document.getElementById('cat-name')?.value.trim();
  if(!name){showToast('Please enter a category name');return;}
  const icon=document.getElementById('cat-icon')?.value.trim()||'📦';
  saveCategory({name,icon});
}

function editCategory(id){const c=categories.find(x=>x.id===id);if(c)openCategoryModal(c);}

// ---- CALENDAR EVENT MODAL ----
function openCalendarEventModal(ev){
  editingEventId=ev?ev.id:null;
  document.getElementById('calendar-event-modal-h').textContent=ev?'Edit Event':'Add Event';
  // start/end are stored as YYYY-MM-DD (all-day) or full ISO timestamps (timed).
  const allDay=ev?!!ev.allDay:true;
  let startDate='',startTime='',endDate='',endTime='';
  if(ev){
    if(ev.allDay){
      startDate=ev.start||'';
      endDate=ev.end||'';
    }else{
      const s=ev.start?new Date(ev.start):null;
      const e=ev.end?new Date(ev.end):null;
      const ymd=d=>d?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';
      const hm=d=>d?`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`:'';
      startDate=ymd(s);startTime=hm(s);
      endDate=ymd(e);endTime=hm(e);
    }
  }else{
    const t=new Date();
    startDate=`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,'0')}-${String(t.getDate()).padStart(2,'0')}`;
  }
  const v=k=>ev?.[k]||'';
  document.getElementById('calendar-event-body').innerHTML=`
    <div class="fg"><label>Title *</label><input type="text" class="fi" id="ev-title" placeholder="e.g. Roof inspection visit" value="${v('title').replace(/"/g,'&quot;')}"></div>
    <div class="fg" style="display:flex;align-items:center;gap:8px;font-family:sans-serif;font-size:13px">
      <input type="checkbox" id="ev-allday" ${allDay?'checked':''} onchange="toggleEventTimes()" style="width:16px;height:16px;cursor:pointer">
      <label for="ev-allday" style="cursor:pointer;margin:0">All-day</label>
    </div>
    <div class="form-row">
      <div class="fg"><label>Start date *</label><input type="date" class="fi" id="ev-start-date" value="${startDate}"></div>
      <div class="fg" id="ev-start-time-wrap" style="${allDay?'display:none':''}"><label>Start time</label><input type="time" class="fi" id="ev-start-time" value="${startTime}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>End date</label><input type="date" class="fi" id="ev-end-date" value="${endDate}"></div>
      <div class="fg" id="ev-end-time-wrap" style="${allDay?'display:none':''}"><label>End time</label><input type="time" class="fi" id="ev-end-time" value="${endTime}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Building</label>
        <select class="fi" id="ev-bld">
          <option value="">—</option>
          ${buildings.map(b=>`<option ${v('building')===b.name?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label>Location</label><input type="text" class="fi" id="ev-loc" placeholder="Specific room or area" value="${v('location').replace(/"/g,'&quot;')}"></div>
    </div>
    <div class="fg"><label>Description</label><textarea class="fi" id="ev-desc">${v('description')}</textarea></div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="ev-notes">${v('notes')}</textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('calendar-event-modal')">Cancel</button>
      ${ev?`<button class="btn btn-danger" onclick="confirmDeleteCalendarEvent('${ev.id}')">Delete</button>`:''}
      <button class="btn btn-primary" onclick="submitCalendarEvent()">${ev?'Save Changes':'Add Event'}</button>
    </div>`;
  document.getElementById('calendar-event-modal').classList.add('open');
}

function toggleEventTimes(){
  const allDay=document.getElementById('ev-allday')?.checked;
  const sw=document.getElementById('ev-start-time-wrap');
  const ew=document.getElementById('ev-end-time-wrap');
  if(sw)sw.style.display=allDay?'none':'';
  if(ew)ew.style.display=allDay?'none':'';
}

function submitCalendarEvent(){
  const title=document.getElementById('ev-title')?.value.trim();
  const sd=document.getElementById('ev-start-date')?.value;
  if(!title){showToast('Please enter a title');return;}
  if(!sd){showToast('Please pick a start date');return;}
  const allDay=document.getElementById('ev-allday')?.checked;
  const ed=document.getElementById('ev-end-date')?.value||sd;
  let start_at,end_at;
  if(allDay){
    start_at=sd;
    end_at=ed;
  }else{
    const st=document.getElementById('ev-start-time')?.value||'00:00';
    const et=document.getElementById('ev-end-time')?.value||st;
    start_at=`${sd}T${st}`;
    end_at=`${ed}T${et}`;
  }
  saveCalendarEvent({
    title,
    description:document.getElementById('ev-desc')?.value.trim()||null,
    start_at,end_at,
    all_day:allDay,
    building:document.getElementById('ev-bld')?.value||null,
    location:document.getElementById('ev-loc')?.value.trim()||null,
    notes:document.getElementById('ev-notes')?.value.trim()||null,
  });
}

function editCalendarEvent(id){
  const e=calendarEvents.find(x=>x.id===id);
  if(e)openCalendarEventModal(e);
}

function confirmDeleteCalendarEvent(id){
  document.getElementById('conf-h').textContent='Delete event?';
  document.getElementById('conf-msg').textContent='This calendar event will be permanently removed.';
  document.getElementById('conf-ok').onclick=()=>{deleteCalendarEvent(id);closeConfirm();closeModal('calendar-event-modal');};
  document.getElementById('confirm-overlay').classList.add('open');
}

// ---- QUOTE MODAL ----
function openQuoteModal(quote){
  editingQuoteId=quote?quote.id:null;
  document.getElementById('quote-modal-h').textContent=quote?'Edit Quote':'Add Quote';
  const v=k=>quote?.[k]||'';
  const sel=(val)=>quote?.status===val?'selected':'';
  document.getElementById('quote-body').innerHTML=`
    <div class="form-row">
      <div class="fg"><label>Quote number</label><input type="text" class="fi" id="qt-num" placeholder="e.g. BID-2026-01" value="${v('quote_number')}"></div>
      <div class="fg"><label>Date received</label><input type="text" class="fi" id="qt-date" placeholder="e.g. 04/22/2026" value="${v('date')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Vendor *</label>
        <select class="fi" id="qt-vendor">
          <option value="">Select...</option>
          ${contacts.filter(c=>c.type==='Contractor'||c.type==='Vendor').sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option ${v('vendor')===c.name?'selected':''}>${c.name}</option>`).join('')}
          <option ${v('vendor')==='Other'?'selected':''}>Other</option>
        </select>
      </div>
      <div class="fg"><label>Building</label>
        <select class="fi" id="qt-bld">
          <option value="">Select...</option>
          <option ${v('building')==='All Buildings'?'selected':''}>All Buildings</option>
          ${buildings.map(b=>`<option ${v('building')===b.name?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="fg"><label>Description *</label><input type="text" class="fi" id="qt-desc" placeholder="Scope of work being quoted" value="${v('description')}"></div>
    <div class="form-row">
      <div class="fg"><label>Amount *</label><input type="number" step="0.01" class="fi" id="qt-amount" placeholder="0.00" value="${v('amount')}"></div>
      <div class="fg"><label>Valid until</label><input type="text" class="fi" id="qt-valid" placeholder="e.g. 06/30/2026" value="${v('valid_until')}"></div>
    </div>
    <div class="fg"><label>Status</label>
      <select class="fi" id="qt-status">
        <option ${!quote||quote.status==='Pending'?'selected':''}>Pending</option>
        <option ${sel('Accepted')}>Accepted</option>
        <option ${sel('Declined')}>Declined</option>
        <option ${sel('Expired')}>Expired</option>
      </select>
    </div>
    <div class="fg"><label>Quote PDFs</label>
      <div id="qt-pdf-list"></div>
      <div class="photo-upload" onclick="document.getElementById('qt-pdf-input').click()">📄 Click or drag PDFs here<input type="file" id="qt-pdf-input" accept=".pdf" multiple style="display:none" onchange="addPendingPDFs('quote',event,'qt-pdf-list')"></div>
    </div>
    <div class="fg"><label>Related assets</label>
      ${assetPickerFiltersHTML('qt-asset-list')}
    </div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="qt-notes">${v('notes')}</textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('quote-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitQuote()">${quote?'Save Changes':'Save Quote'}</button>
    </div>`;
  initAssetPicker('qt-asset-list',quote?.asset_ids||[],quote?.building||'all');
  const pickerBld=document.getElementById('qt-asset-list-bld');
  if(pickerBld&&quote?.building)pickerBld.value=quote.building;
  renderAssetPicker('qt-asset-list');
  initPhotoState('quote',allPDFs(quote));
  renderPDFList('quote','qt-pdf-list');
  document.getElementById('quote-modal').classList.add('open');
}

async function submitQuote(){
  const vendor=document.getElementById('qt-vendor')?.value;
  const description=document.getElementById('qt-desc')?.value.trim();
  const amount=parseFloat(document.getElementById('qt-amount')?.value||0);
  if(!vendor||!description){showToast('Please fill in vendor and description');return;}
  const pdf_urls=await finalizePhotos('quote','quotes');
  const asset_ids=getPickerChecked('qt-asset-list');
  saveQuote({
    quote_number:document.getElementById('qt-num')?.value.trim()||null,
    date:document.getElementById('qt-date')?.value.trim()||null,
    vendor,
    building:document.getElementById('qt-bld')?.value||null,
    description,
    amount,
    valid_until:document.getElementById('qt-valid')?.value.trim()||null,
    status:document.getElementById('qt-status')?.value||'Pending',
    pdf_urls,
    pdf_url:pdf_urls[0]||null,
    asset_ids,
    notes:document.getElementById('qt-notes')?.value.trim()||null,
  });
}

function editQuote(id){const q=quotes.find(x=>x.id===id);if(q)openQuoteModal(q);}

function confirmDeleteQuote(id){
  document.getElementById('conf-h').textContent='Delete quote?';
  document.getElementById('conf-msg').textContent='This quote will be permanently removed.';
  document.getElementById('conf-ok').onclick=()=>{deleteQuote(id);closeConfirm();};
  document.getElementById('confirm-overlay').classList.add('open');
}

// ---- SUPPLY MODAL ----
function openSupplyModal(supply){
  editingSupplyId=supply?supply.id:null;
  document.getElementById('supply-modal-h').textContent=supply?'Edit Supply':'Add Supply';
  const v=k=>supply?.[k]||'';
  const sel=(k,val)=>supply?.[k]===val?'selected':'';
  document.getElementById('supply-body').innerHTML=`
    <div class="fg"><label>Item name *</label><input type="text" class="fi" id="sup-name" placeholder="e.g. Toilet paper, Hand soap" value="${v('name')}"></div>
    <div class="form-row">
      <div class="fg"><label>Category</label>
        <select class="fi" id="sup-cat">
          <option value="">Select...</option>
          <option ${sel('category','Restroom')}>Restroom</option>
          <option ${sel('category','Kitchen')}>Kitchen</option>
          <option ${sel('category','Cleaning')}>Cleaning</option>
          <option ${sel('category','General')}>General</option>
        </select>
      </div>
      <div class="fg"><label>Unit</label><input type="text" class="fi" id="sup-unit" placeholder="case, box, bottle" value="${v('unit')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Unit size</label><input type="text" class="fi" id="sup-size" placeholder="e.g. 48 rolls, 1 gal" value="${v('unit_size')}"></div>
      <div class="fg"><label>Preferred vendor</label>
        <select class="fi" id="sup-vendor">
          <option value="">—</option>
          ${contacts.filter(c=>c.type==='Contractor'||c.type==='Vendor').sort((a,b)=>a.name.localeCompare(b.name)).map(c=>`<option ${v('vendor')===c.name?'selected':''}>${c.name}</option>`).join('')}
          ${supply?.vendor&&!contacts.find(c=>c.name===supply.vendor)?`<option selected>${supply.vendor}</option>`:''}
          <option ${v('vendor')==='Other'?'selected':''}>Other</option>
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Current stock *</label><input type="number" step="0.01" class="fi" id="sup-stock" value="${supply?.current_stock??0}"></div>
      <div class="fg"><label>Reorder when ≤</label><input type="number" step="0.01" class="fi" id="sup-reorder" value="${supply?.reorder_level??0}"></div>
    </div>
    <div class="fg"><label>Last ordered</label><input type="text" class="fi" id="sup-ordered" placeholder="e.g. Apr 15 2026" value="${v('last_ordered_date')}"></div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="sup-notes">${v('notes')}</textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('supply-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitSupply()">${supply?'Save Changes':'Add Supply'}</button>
    </div>`;
  document.getElementById('supply-modal').classList.add('open');
}

function submitSupply(){
  const name=document.getElementById('sup-name')?.value.trim();
  if(!name){showToast('Please enter a supply name');return;}
  saveSupply({
    name,
    category:document.getElementById('sup-cat')?.value,
    unit:document.getElementById('sup-unit')?.value.trim(),
    unit_size:document.getElementById('sup-size')?.value.trim(),
    vendor:document.getElementById('sup-vendor')?.value,
    current_stock:parseFloat(document.getElementById('sup-stock')?.value)||0,
    reorder_level:parseFloat(document.getElementById('sup-reorder')?.value)||0,
    last_ordered_date:document.getElementById('sup-ordered')?.value.trim(),
    notes:document.getElementById('sup-notes')?.value.trim(),
  });
}

function editSupply(id){const s=supplies.find(x=>x.id===id);if(s)openSupplyModal(s);}

function confirmDeleteSupply(id,name){
  document.getElementById('conf-h').textContent='Delete supply?';
  document.getElementById('conf-msg').textContent=`"${name}" will be permanently removed.`;
  document.getElementById('conf-ok').onclick=()=>{deleteSupply(id);closeConfirm();};
  document.getElementById('confirm-overlay').classList.add('open');
}

// ---- UTILITY READING MODAL ----
function openUtilityModal(reading){
  editingUtilityId=reading?reading.id:null;
  document.getElementById('utility-modal-h').textContent=reading?'Edit Utility Reading':'Add Utility Reading';
  const v=k=>reading?.[k]??'';
  const defaultBldId=reading?.building_id||currentBuildingId||buildings[0]?.id;
  document.getElementById('utility-body').innerHTML=`
    <div class="form-row">
      <div class="fg"><label>Building *</label>
        <select class="fi" id="ur-bld" onchange="refreshUtilityTypeOptions()">
          ${buildings.map(b=>`<option value="${b.id}" ${defaultBldId===b.id?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label>Utility *</label>
        <select class="fi" id="ur-type" onchange="onUtilityTypeChange()"></select>
      </div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Period start</label><input type="date" class="fi" id="ur-start" value="${v('period_start')}"></div>
      <div class="fg"><label>Period end</label><input type="date" class="fi" id="ur-end" value="${v('period_end')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Usage</label><input type="number" step="0.01" class="fi" id="ur-usage" value="${v('usage')}"></div>
      <div class="fg"><label>Unit</label><input type="text" class="fi" id="ur-unit" placeholder="kWh, gal, therm, CCF" value="${v('usage_unit')||defaultUnit}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Cost ($)</label><input type="number" step="0.01" class="fi" id="ur-cost" value="${v('cost')}"></div>
      <div class="fg"><label>Meter reading (optional)</label><input type="number" step="0.01" class="fi" id="ur-meter" value="${v('meter_reading')}"></div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Provider</label><input type="text" class="fi" id="ur-provider" placeholder="e.g. Duke Energy" value="${v('provider')}"></div>
      <div class="fg"><label>Account number</label><input type="text" class="fi" id="ur-account" value="${v('account_number')}"></div>
    </div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="ur-notes">${v('notes')}</textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('utility-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitUtility()">${reading?'Save Changes':'Save Reading'}</button>
    </div>`;
  refreshUtilityTypeOptions(reading?.utility_type);
  document.getElementById('utility-modal').classList.add('open');
}

// Rebuilds the Utility-type dropdown based on the currently selected building's tracked list.
// Preserves the reading's existing type on edit even if it's no longer in the tracked list.
function refreshUtilityTypeOptions(preferredType){
  const typeSel=document.getElementById('ur-type');
  const bldId=document.getElementById('ur-bld')?.value;
  if(!typeSel)return;
  const b=buildings.find(x=>x.id===bldId);
  const tracked=buildingTrackedUtilities(b);
  const prior=preferredType||typeSel.value;
  // Ensure the currently-selected type stays in the list (for editing readings whose type
  // has since been untracked).
  const options=[...tracked];
  if(prior&&!options.includes(prior))options.push(prior);
  if(!options.includes('Other'))options.push('Other');
  typeSel.innerHTML=options.map(o=>`<option ${prior===o?'selected':''}>${o}</option>`).join('');
  onUtilityTypeChange();
}

function onUtilityTypeChange(){
  const type=document.getElementById('ur-type')?.value;
  const unitEl=document.getElementById('ur-unit');
  if(!unitEl)return;
  const knownDefaults=Object.values(UTILITY_UNIT_DEFAULTS);
  if(!unitEl.value||knownDefaults.includes(unitEl.value))unitEl.value=UTILITY_UNIT_DEFAULTS[type]||'';
}

function submitUtility(){
  const building_id=document.getElementById('ur-bld')?.value;
  const utility_type=document.getElementById('ur-type')?.value;
  if(!building_id||!utility_type){showToast('Building and utility type are required');return;}
  saveUtility({
    building_id,utility_type,
    period_start:document.getElementById('ur-start')?.value||null,
    period_end:document.getElementById('ur-end')?.value||null,
    usage:parseFloat(document.getElementById('ur-usage')?.value)||null,
    usage_unit:document.getElementById('ur-unit')?.value.trim()||null,
    cost:parseFloat(document.getElementById('ur-cost')?.value)||0,
    meter_reading:parseFloat(document.getElementById('ur-meter')?.value)||null,
    provider:document.getElementById('ur-provider')?.value.trim()||null,
    account_number:document.getElementById('ur-account')?.value.trim()||null,
    notes:document.getElementById('ur-notes')?.value.trim()||null,
  });
}

function editUtility(id){const r=utilityReadings.find(x=>x.id===id);if(r)openUtilityModal(r);}

function confirmDeleteUtility(id){
  document.getElementById('conf-h').textContent='Delete utility reading?';
  document.getElementById('conf-msg').textContent='This reading will be permanently removed.';
  document.getElementById('conf-ok').onclick=()=>{deleteUtility(id);closeConfirm();};
  document.getElementById('confirm-overlay').classList.add('open');
}

// ---- GOOGLE CALENDAR SETTINGS MODAL ----
function openGCalSettingsModal(){
  const apiKey=appSettings.gcal_api_key||'';
  const calId=appSettings.gcal_calendar_id||'';
  document.getElementById('gcal-modal-h').textContent='Google Calendar Integration';
  document.getElementById('gcal-body').innerHTML=`
    <div style="background:var(--info-bg);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-family:sans-serif;font-size:12px;color:var(--text2);line-height:1.5">
      Paste your Google Cloud API key and the parish calendar ID. The calendar must be set to <strong>public</strong> in Google Calendar settings. For security, restrict the API key in Google Cloud Console to HTTP referrers from this site.
    </div>
    <div class="fg"><label>Google API key *</label><input type="text" class="fi" id="gcal-key" placeholder="AIzaSy..." value="${apiKey}"></div>
    <div class="fg"><label>Calendar ID *</label><input type="text" class="fi" id="gcal-id" placeholder="parishcalendar@example.org" value="${calId}"></div>
    <div id="gcal-test-result" style="font-size:12px;font-family:sans-serif;margin-bottom:12px"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('gcal-modal')">Cancel</button>
      <button class="btn" onclick="testGCalConnection()">Test Connection</button>
      <button class="btn btn-primary" onclick="submitGCalSettings()">Save</button>
    </div>`;
  document.getElementById('gcal-modal').classList.add('open');
}

async function testGCalConnection(){
  const apiKey=document.getElementById('gcal-key')?.value.trim();
  const calendarId=document.getElementById('gcal-id')?.value.trim();
  const result=document.getElementById('gcal-test-result');
  if(!apiKey||!calendarId){result.innerHTML='<span style="color:var(--danger)">Enter both fields first.</span>';return;}
  result.innerHTML='<span style="color:var(--text3)">Testing…</span>';
  try{
    const params=new URLSearchParams({key:apiKey,maxResults:'1',timeMin:new Date().toISOString()});
    const res=await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    const data=await res.json();
    if(data.error)throw new Error(data.error.message);
    result.innerHTML=`<span style="color:var(--success)">✓ Connection works. Found ${data.items?.length||0} upcoming event${data.items?.length===1?'':'s'} in test call.</span>`;
  }catch(e){
    result.innerHTML=`<span style="color:var(--danger)">✗ ${e.message||'Connection failed'}</span>`;
  }
}

async function submitGCalSettings(){
  const apiKey=document.getElementById('gcal-key')?.value.trim();
  const calendarId=document.getElementById('gcal-id')?.value.trim();
  if(!apiKey||!calendarId){showToast('Enter both API key and calendar ID');return;}
  try{
    await saveSetting('gcal_api_key',apiKey);
    await saveSetting('gcal_calendar_id',calendarId);
    await loadGCalEvents();
    closeModal('gcal-modal');
    showToast('Calendar connected!');
    renderSettings();renderDash();renderPM();
  }catch(e){/* saveSetting already toasted */}
}

// ---- ROOM TYPE MODAL ----
function openRoomTypeModal(rt){
  editingRoomTypeId=rt?rt.id:null;
  document.getElementById('room-type-modal-h').textContent=rt?'Edit Room Type':'Add Room Type';
  document.getElementById('room-type-body').innerHTML=`
    <div class="fg"><label>Name *</label><input type="text" class="fi" id="rt-name" placeholder="e.g. Nursery, Library, Vestibule" value="${rt?.name||''}"></div>
    <div style="font-size:12px;color:var(--text3);font-family:sans-serif;margin-bottom:12px">
      ${rt?'Renaming will update every room using this type.':'Used in the Room modal dropdown across all buildings.'}
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('room-type-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitRoomType()">${rt?'Save Changes':'Add Room Type'}</button>
    </div>`;
  document.getElementById('room-type-modal').classList.add('open');
}

function submitRoomType(){
  const name=document.getElementById('rt-name')?.value.trim();
  if(!name){showToast('Please enter a name');return;}
  saveRoomType({name});
}

function editRoomType(id){const rt=roomTypes.find(x=>x.id===id);if(rt)openRoomTypeModal(rt);}

function confirmDeleteRoomType(id,name){
  const rt=roomTypes.find(x=>x.id===id);
  const inUse=rt?rooms.filter(r=>r.room_type===rt.name).length:0;
  document.getElementById('conf-h').textContent='Delete room type?';
  document.getElementById('conf-msg').textContent=inUse>0
    ?`"${name}" is used by ${inUse} room${inUse>1?'s':''}. Reassign them before deleting.`
    :`"${name}" will be permanently removed.`;
  document.getElementById('conf-ok').onclick=()=>{deleteRoomType(id);closeConfirm();};
  document.getElementById('confirm-overlay').classList.add('open');
}

// ---- BUDGET MODAL ----
function openBudgetModal(){
  const year=new Date().getFullYear();
  const existing=budgets.find(b=>b.year===year);
  editingBudgetId=existing?existing.id:null;
  document.getElementById('budget-modal-h').textContent=existing?`Edit Budget (${year})`:`Set Budget (${year})`;
  document.getElementById('budget-body').innerHTML=`
    <div class="fg"><label>Year</label><input type="number" class="fi" id="budget-year" value="${year}" readonly style="background:var(--bg3)"></div>
    <div class="fg"><label>Budget amount ($) *</label><input type="number" step="0.01" class="fi" id="budget-amount" placeholder="e.g. 60000" value="${existing?existing.amount:''}"></div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="budget-notes" placeholder="Optional context (funding source, carry-over, etc.)">${existing?.notes||''}</textarea></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('budget-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitBudget()">${existing?'Save Changes':'Set Budget'}</button>
    </div>`;
  document.getElementById('budget-modal').classList.add('open');
}

function submitBudget(){
  const year=Number(document.getElementById('budget-year')?.value);
  const amount=parseFloat(document.getElementById('budget-amount')?.value);
  if(!year||isNaN(amount)||amount<0){showToast('Enter a valid budget amount');return;}
  saveBudget({year,amount,notes:document.getElementById('budget-notes')?.value.trim()||null});
}

function confirmDeleteCategory(id,name){
  const c=categories.find(x=>x.id===id);
  const inUse=c?assets.filter(a=>a.category===c.name).length:0;
  document.getElementById('conf-h').textContent='Delete category?';
  document.getElementById('conf-msg').textContent=inUse>0
    ?`"${name}" is used by ${inUse} asset${inUse>1?'s':''}. Reassign them before deleting.`
    :`"${name}" will be permanently removed.`;
  document.getElementById('conf-ok').onclick=()=>{deleteCategory(id);closeConfirm();};
  document.getElementById('confirm-overlay').classList.add('open');
}

// ---- MODAL HELPERS ----
function closeConfirm(){document.getElementById('confirm-overlay').classList.remove('open');}
function closeModal(id){document.getElementById(id)?.classList.remove('open');}
function outsideClose(e,id){if(e.target.id===id)closeModal(id);}
