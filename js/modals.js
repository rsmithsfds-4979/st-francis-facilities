// All modal open/submit/edit/delete-confirm functions

// ---- WORK ORDER MODAL ----
function openWOModal(presetRoomId,presetBldId){
  document.getElementById('wo-modal-h').textContent='New Work Order';
  const presetRoom=presetRoomId?rooms.find(r=>r.id===presetRoomId):null;
  const presetBld=presetBldId?buildings.find(b=>b.id===presetBldId):null;
  const presetBldName=presetBld?.name||presetRoom?.building_name||'';
  const bldRooms=presetBldName?rooms.filter(r=>r.building_name===presetBldName):[];

  document.getElementById('wo-body').innerHTML=`
    <div class="fg"><label>Issue description *</label><input type="text" class="fi" id="f-issue" placeholder="Brief description of the problem"></div>
    <div class="form-row">
      <div class="fg"><label>Building *</label>
        <select class="fi" id="f-bld" onchange="updateRoomDropdown()">
          <option value="">Select...</option>
          ${buildings.map(b=>`<option ${b.name===presetBldName?'selected':''}>${b.name}</option>`).join('')}
        </select>
      </div>
      <div class="fg"><label>Room / Location</label>
        <select class="fi" id="f-room">
          <option value="">Select room...</option>
          ${bldRooms.map(r=>`<option value="${r.id}" ${r.id===presetRoomId?'selected':''}>${r.name}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="form-row">
      <div class="fg"><label>Priority *</label><select class="fi" id="f-pri"><option value="">Select...</option><option>Low</option><option>Medium</option><option>High</option><option>Critical</option></select></div>
      <div class="fg"><label>Due date</label><input type="text" class="fi" id="f-due" placeholder="e.g. May 15 2025"></div>
    </div>
    <div class="fg"><label>Assign to *</label>
      <select class="fi" id="f-assign" onchange="handleAssignChange(this)">
        <option value="">Select...</option>
        ${contacts.map(c=>`<option>${c.name}</option>`).join('')}
        <option value="__add_new__">+ Add new contact…</option>
        <option>Other</option>
      </select>
    </div>
    <div class="fg">
      <label>Assets being serviced</label>
      <div id="asset-select-list" style="max-height:200px;overflow-y:auto;border:1px solid var(--border2);border-radius:6px;padding:6px">
        <div class="asset-select-item" onclick="handleAddAssetInline('asset-select-list')" style="color:var(--accent);font-weight:bold;justify-content:center">+ Add new asset…</div>
        ${assets.filter(a=>!presetBldName||a.building===presetBldName).map(a=>`
          <div class="asset-select-item" onclick="toggleAssetSelect(this,'${a.id}')">
            <input type="checkbox" value="${a.id}" onclick="event.stopPropagation()">
            <span style="font-size:14px">${catIcon[a.category]||'📦'}</span>
            <div><div style="font-weight:bold">${a.description}</div><div style="font-size:11px;color:var(--text3)">${a.room_number||a.location}</div></div>
          </div>`).join('')}
      </div>
    </div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="f-notes" placeholder="Any additional details..."></textarea></div>
    <div class="fg"><label>Photos (optional)</label>
      <div class="photo-gallery" id="wo-photo-gallery"></div>
      <div class="photo-upload" onclick="document.getElementById('wo-photo-input').click()">📷 Click to attach photos<input type="file" id="wo-photo-input" accept="image/*" multiple style="display:none" onchange="addPendingPhotos('wo',event,'wo-photo-gallery')"></div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('wo-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitWO()">Save Work Order</button>
    </div>`;
  initPhotoState('wo',[]);
  renderPhotoGallery('wo','wo-photo-gallery');
  document.getElementById('wo-modal').classList.add('open');
}

function updateRoomDropdown(){
  const bldName=document.getElementById('f-bld')?.value;
  const roomSel=document.getElementById('f-room');
  const assetList=document.getElementById('asset-select-list');
  if(roomSel){
    const bldRooms=bldName?rooms.filter(r=>r.building_name===bldName):[];
    roomSel.innerHTML='<option value="">Select room...</option>'+bldRooms.map(r=>`<option value="${r.id}">${r.name}${r.floor?' ('+r.floor+')':''}</option>`).join('');
  }
  if(assetList&&bldName){
    const bldAssets=assets.filter(a=>a.building===bldName);
    const addRow=`<div class="asset-select-item" onclick="handleAddAssetInline('asset-select-list')" style="color:var(--accent);font-weight:bold;justify-content:center">+ Add new asset…</div>`;
    assetList.innerHTML=addRow+(bldAssets.length
      ?bldAssets.map(a=>`<div class="asset-select-item" onclick="toggleAssetSelect(this,'${a.id}')"><input type="checkbox" value="${a.id}" onclick="event.stopPropagation()"><span style="font-size:14px">${catIcon[a.category]||'📦'}</span><div><div style="font-weight:bold">${a.description}</div><div style="font-size:11px;color:var(--text3)">${a.room_number||a.location}</div></div></div>`).join('')
      :'<div style="font-size:12px;color:var(--text3);font-family:sans-serif;padding:8px">No assets found for this building</div>');
  }
}

function toggleAssetSelect(el,id){
  el.classList.toggle('selected');
  const cb=el.querySelector('input[type=checkbox]');
  if(cb)cb.checked=!cb.checked;
}

// Opens the Asset modal from another modal (e.g. WO or Invoice). After save, appends the
// new asset to the given select list and auto-checks it. Stacks on top of the originating modal.
function handleAddAssetInline(listId){
  afterAssetSave=(newAsset)=>{
    const list=document.getElementById(listId);
    if(!list)return;
    const div=document.createElement('div');
    div.className='asset-select-item selected';
    div.innerHTML=`
      <input type="checkbox" value="${newAsset.id}" checked onclick="event.stopPropagation()">
      <span style="font-size:14px">${catIcon[newAsset.category]||'📦'}</span>
      <div><div style="font-weight:bold">${newAsset.description}</div><div style="font-size:11px;color:var(--text3)">${newAsset.room_number||newAsset.location||''}</div></div>`;
    div.onclick=()=>toggleAssetSelect(div,newAsset.id);
    list.appendChild(div);
    div.scrollIntoView({behavior:'smooth',block:'nearest'});
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
  // Get selected asset IDs
  const selectedAssets=[...document.querySelectorAll('#asset-select-list input[type=checkbox]:checked')].map(cb=>cb.value);
  const photo_urls=await finalizePhotos('wo','work-orders');
  saveWO({issue,building,location:room?room.name:document.getElementById('f-room')?.value||'',
    room_id:roomId,due_date:document.getElementById('f-due')?.value.trim(),
    priority,assignee,notes:document.getElementById('f-notes')?.value.trim(),
    status:'Open',photo_urls,photo_url:photo_urls[0]||null,asset_ids:selectedAssets.length?selectedAssets:null});
  closeModal('wo-modal');
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
      ${w.status!=='Completed'?`<button class="btn btn-success" onclick="updateWOStatus('${w.id}','Completed');closeModal('wo-detail-modal')">✓ Mark Done</button>`:''}
      <button class="btn btn-primary" onclick="submitComment('${w.id}')">Add Comment</button>
    </div>`;
  document.getElementById('wo-detail-modal').classList.add('open');
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
      <div class="photo-upload" onclick="document.getElementById('a-photo-input').click()">📷 Click to add photos<input type="file" id="a-photo-input" accept="image/*" multiple style="display:none" onchange="addPendingPhotos('asset',event,'a-photo-gallery')"></div>
    </div>
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
    <div class="fg"><label>Address</label><input type="text" class="fi" id="bld-addr" placeholder="Street address" value="${v('address')}"></div>
    <div class="fg"><label>Floors / Levels</label><input type="text" class="fi" id="bld-floors" placeholder="e.g. Basement, 1st Floor, 2nd Floor, Roof" value="${v('floors')}"></div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('building-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitBuilding()">${bld?'Save Changes':'Add Building'}</button>
    </div>`;
  document.getElementById('building-modal').classList.add('open');
}

function submitBuilding(){
  const name=document.getElementById('bld-name')?.value.trim();
  if(!name){showToast('Please enter a building name');return;}
  saveBuilding({name,description:document.getElementById('bld-desc')?.value.trim(),address:document.getElementById('bld-addr')?.value.trim(),floors:document.getElementById('bld-floors')?.value.trim()});
  closeModal('building-modal');
}

function editBuilding(id){const b=buildings.find(x=>x.id===id);if(b)openBuildingModal(b);}

// ---- ROOM MODAL ----
function openRoomModal(room){
  editingRoomId=room?room.id:null;
  document.getElementById('room-modal-h').textContent=room?'Edit Room':'Add Room / Space';
  const v=k=>room?.[k]||'';
  const bld=buildings.find(b=>b.id===currentBuildingId);
  document.getElementById('room-body').innerHTML=`
    <div class="fg"><label>Room / Space name *</label><input type="text" class="fi" id="room-name" placeholder="e.g. Classroom 209, Server Room, Boiler Room" value="${v('name')}"></div>
    <div class="fg"><label>Floor / Level</label><input type="text" class="fi" id="room-floor" placeholder="e.g. 1st Floor, Basement, Roof" value="${v('floor')||''}"></div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="room-notes" placeholder="Any relevant notes about this space...">${v('notes')}</textarea></div>
    <div class="fg"><label>Photos</label>
      <div class="photo-gallery" id="room-photo-gallery"></div>
      <div class="photo-upload" onclick="document.getElementById('room-photo-input').click()">📷 Click to add photos<input type="file" id="room-photo-input" accept="image/*" multiple style="display:none" onchange="addPendingPhotos('room',event,'room-photo-gallery')"></div>
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
  saveRoom({name,floor:document.getElementById('room-floor')?.value.trim(),notes:document.getElementById('room-notes')?.value.trim(),building_id:currentBuildingId,building_name:bld?.name||'',photo_urls});
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
  document.getElementById('pm-modal').classList.add('open');
}

function submitPM(){
  const title=document.getElementById('pm-title')?.value.trim();
  const building=document.getElementById('pm-bld')?.value;
  const frequency=document.getElementById('pm-freq')?.value;
  if(!title||!building||!frequency){showToast('Please fill in title, building, frequency');return;}
  savePM({title,building,frequency,next_due:document.getElementById('pm-due')?.value.trim(),assigned_to:document.getElementById('pm-assign')?.value,description:document.getElementById('pm-desc')?.value.trim(),status:document.getElementById('pm-status')?.value});
}

function editPM(id){const p=pmTasks.find(x=>x.id===id);if(p)openPMModal(p);}

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
          ${contacts.filter(c=>c.type==='Contractor').map(c=>`<option ${v('vendor')===c.name?'selected':''}>${c.name}</option>`).join('')}
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
    <div class="fg"><label>Invoice PDF</label>
      ${inv?.pdf_url?`<div style="margin-bottom:8px"><a href="${inv.pdf_url}" target="_blank" style="color:var(--accent);font-family:sans-serif;font-size:13px">📄 View current PDF</a></div>`:''}
      <div class="photo-upload" onclick="document.getElementById('inv-pdf-input').click()">📄 ${inv?.pdf_url?'Upload new PDF (replaces current)':'Upload PDF (optional)'}<input type="file" id="inv-pdf-input" accept=".pdf" style="display:none" onchange="previewInvoicePDF(event)"></div>
      <div id="inv-pdf-preview" style="font-size:12px;color:var(--success);font-family:sans-serif;margin-top:6px"></div>
    </div>
    <div class="fg"><label>Assets this invoice covers</label>
      <div id="inv-asset-list" style="max-height:180px;overflow-y:auto;border:1px solid var(--border2);border-radius:6px;padding:6px">
        <div class="asset-select-item" onclick="handleAddAssetInline('inv-asset-list')" style="color:var(--accent);font-weight:bold;justify-content:center">+ Add new asset…</div>
        ${assets.map(a=>{
          const checked=inv?.asset_ids?.includes(a.id);
          return`<div class="asset-select-item ${checked?'selected':''}" onclick="toggleAssetSelect(this,'${a.id}')">
            <input type="checkbox" value="${a.id}" ${checked?'checked':''} onclick="event.stopPropagation()">
            <span style="font-size:14px">${catIcon[a.category]||'📦'}</span>
            <div><div style="font-weight:bold">${a.description}</div><div style="font-size:11px;color:var(--text3)">${a.building} · ${a.room_number||a.location||''}</div></div>
          </div>`;
        }).join('')}
      </div>
    </div>
    <div class="fg"><label>Related work orders</label>
      <div id="inv-wo-list" style="max-height:180px;overflow-y:auto;border:1px solid var(--border2);border-radius:6px;padding:6px">
        ${workOrders.length?workOrders.map(w=>{
          const checked=inv?.work_order_ids?.includes(w.id);
          return`<div class="asset-select-item ${checked?'selected':''}" onclick="toggleAssetSelect(this,'${w.id}')">
            <input type="checkbox" value="${w.id}" ${checked?'checked':''} onclick="event.stopPropagation()">
            <div style="flex:1;min-width:0"><div style="font-weight:bold">${w.issue}</div><div style="font-size:11px;color:var(--text3)">${w.building} · ${w.status}${w.assignee?' · '+w.assignee:''}</div></div>
          </div>`;
        }).join(''):'<div style="font-size:12px;color:var(--text3);font-family:sans-serif;padding:8px">No work orders yet</div>'}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn" onclick="closeModal('invoice-modal')">Cancel</button>
      <button class="btn btn-primary" onclick="submitInvoice()">${inv?'Save Changes':'Add Invoice'}</button>
    </div>`;
  document.getElementById('invoice-modal').classList.add('open');
}

function previewInvoicePDF(event){
  const file=event.target.files[0];
  if(file)document.getElementById('inv-pdf-preview').textContent='✓ '+file.name+' ready to upload';
}

function editInvoice(id){const i=invoices.find(x=>x.id===id);if(i)openInvoiceModal(i);}

async function submitInvoice(){
  const vendor=document.getElementById('inv-vendor')?.value;
  const description=document.getElementById('inv-desc')?.value.trim();
  const amount=parseFloat(document.getElementById('inv-amount')?.value||0);
  if(!vendor||!description){showToast('Please fill in vendor and description');return;}
  let pdf_url=editingInvId?invoices.find(x=>x.id===editingInvId)?.pdf_url:null;
  const pdfFile=document.getElementById('inv-pdf-input')?.files[0];
  if(pdfFile)pdf_url=await uploadFile(pdfFile,'invoices');
  const asset_ids=[...document.querySelectorAll('#inv-asset-list input[type=checkbox]:checked')].map(cb=>cb.value);
  const work_order_ids=[...document.querySelectorAll('#inv-wo-list input[type=checkbox]:checked')].map(cb=>cb.value);
  saveInvoice({
    invoice_number:document.getElementById('inv-num')?.value.trim(),
    date:document.getElementById('inv-date')?.value.trim(),
    vendor,building:document.getElementById('inv-bld')?.value,
    description,amount,
    status:document.getElementById('inv-status')?.value,
    pdf_url,
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
        <select class="fi" id="ct-type">
          <option ${sel('type','Contractor')||(!contact&&currentContactType==='Contractor'?'selected':'')}>Contractor</option>
          <option ${sel('type','Staff')||(!contact&&currentContactType==='Staff'?'selected':'')}>Staff</option>
          <option ${sel('type','Volunteer')||(!contact&&currentContactType==='Volunteer'?'selected':'')}>Volunteer</option>
        </select>
      </div>
      <div class="fg"><label>Phone</label><input type="text" class="fi" id="ct-phone" value="${v('phone')}"></div>
    </div>
    <div class="fg"><label>Email</label><input type="text" class="fi" id="ct-email" value="${v('email')}"></div>
    <div class="fg"><label>Notes</label><textarea class="fi" id="ct-notes">${v('notes')}</textarea></div>
    <div style="background:var(--bg3);border-radius:8px;padding:14px;margin-bottom:12px">
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
  document.getElementById('contact-modal').classList.add('open');
}

function previewCOI(event){
  const file=event.target.files[0];
  if(file)document.getElementById('coi-preview').textContent='✓ '+file.name+' ready to upload';
}

async function submitContact(){
  const name=document.getElementById('ct-name')?.value.trim();
  const role=document.getElementById('ct-role')?.value.trim();
  const type=document.getElementById('ct-type')?.value;
  if(!name||!role){showToast('Please fill in name and role');return;}
  let coi_url=editingContactId?contacts.find(c=>c.id===editingContactId)?.coi_url:null;
  const coiFile=document.getElementById('coi-file-input')?.files[0];
  if(coiFile)coi_url=await uploadFile(coiFile,'coi');
  saveContact({name,role,type,phone:document.getElementById('ct-phone')?.value.trim(),email:document.getElementById('ct-email')?.value.trim(),notes:document.getElementById('ct-notes')?.value.trim(),coi_expiry:document.getElementById('ct-coi-exp')?.value.trim(),coi_insurer:document.getElementById('ct-coi-ins')?.value.trim(),coi_policy_number:document.getElementById('ct-coi-pol')?.value.trim(),coi_url});
  closeModal('contact-modal');
}

function editContact(id){const c=contacts.find(x=>x.id===id);if(c)openContactModal(c);}

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
  document.getElementById('conf-h').textContent='Delete contact?';
  document.getElementById('conf-msg').textContent=`"${name}" will be permanently removed.`;
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
          ${contacts.filter(c=>c.type==='Contractor').map(c=>`<option ${v('vendor')===c.name?'selected':''}>${c.name}</option>`).join('')}
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
