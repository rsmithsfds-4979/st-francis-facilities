// Supabase connection and shared globals
const SUPABASE_URL='https://yhwqncrdvgmontpxlgng.supabase.co';
const SUPABASE_ANON_KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlod3FuY3Jkdmdtb250cHhsZ25nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2ODkwNjgsImV4cCI6MjA5MjI2NTA2OH0.p_7IteIQ3MUI7ttwES60pJqI8E7aJJf3flEovUBtJT0';
const{createClient}=supabase;
const db=createClient(SUPABASE_URL,SUPABASE_ANON_KEY);

// Shared state
let workOrders=[],assets=[],pmTasks=[],contacts=[],invoices=[],buildings=[],rooms=[];
let editingAssetId=null,editingContactId=null,editingPMId=null,editingInvId=null,editingBldId=null,editingRoomId=null;
let currentBuildingId=null,currentRoomId=null;

// Shared formatters / badge helpers
const catIcon={'HVAC':'❄️','Kitchen':'🍳','Safety':'🚒','AV & Tech':'📽️','Liturgical':'⛪','Grounds':'🌿','Plumbing':'🔧','Electrical':'💡','Other':'📦'};
const fmt=n=>'$'+Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const pb=p=>{const m={Critical:'b-red',High:'b-red',Medium:'b-amber',Low:'b-gray'};return`<span class="badge ${m[p]||'b-gray'}">${p}</span>`};
const sb=s=>{const m={Open:'b-amber','In Progress':'b-blue',Completed:'b-green',Active:'b-green',Maintenance:'b-amber',Retired:'b-gray',Upcoming:'b-blue',Overdue:'b-red',Done:'b-green',Paid:'b-green',Unpaid:'b-amber'};return`<span class="badge ${m[s]||'b-gray'}">${s}</span>`};
