(() => {
  const PLAN_LIMITS={starter:1,professional:5,business:15};
  const MAX_EXTRA_SEATS={starter:3,professional:4,business:200};
  const STATES=['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];
  let acceptingInvite=false;

  function escapeHtml(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function title(v){return String(v||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());}

  function ensureStyles(){
    if(document.getElementById('teamStyles')) return;
    const style=document.createElement('style');
    style.id='teamStyles';
    style.textContent=`
      .team-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
      .team-stat{background:#fff;border:1px solid #e3e8ef;border-radius:12px;padding:14px}.team-stat small{color:#667085}.team-stat strong{display:block;font-size:24px;margin-top:5px;color:#0d47a1}
      .team-form{display:grid;grid-template-columns:2fr 1fr auto;gap:10px;align-items:end}.team-form label{display:flex;flex-direction:column;gap:5px}
      .team-member-row,.team-invite-row{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px 0;border-bottom:1px solid #e9edf2}.team-member-row:last-child,.team-invite-row:last-child{border-bottom:0}
      .team-actions{display:flex;gap:7px;flex-wrap:wrap}.team-seat-box{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.team-seat-box label{display:flex;flex-direction:column;gap:5px}.team-seat-box input{width:110px}.team-seat-box select{min-width:120px}
      .team-role{display:inline-block;padding:4px 8px;background:#eef4fb;border-radius:999px;font-size:12px;font-weight:700;margin-left:6px}
      @media(max-width:760px){.team-grid{grid-template-columns:1fr 1fr}.team-form{grid-template-columns:1fr}.team-member-row,.team-invite-row{align-items:flex-start;flex-direction:column}}
    `;
    document.head.appendChild(style);
  }

  function activateTeam(){
    if(typeof subscriptionActive!=='undefined'&&!subscriptionActive){if(typeof showBillingPage==='function')showBillingPage('Choose an HVACFlow plan to unlock team access.');return;}
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
    document.getElementById('team')?.classList.add('active');
    document.querySelector('#nav button[data-page="team"]')?.classList.add('active');
    loadTeam();
  }

  function ensureTeamUI(){
    ensureStyles();
    const nav=document.getElementById('nav');
    if(nav&&!nav.querySelector('[data-page="team"]')){
      const button=document.createElement('button');
      button.dataset.page='team';button.textContent='Team Members';button.onclick=activateTeam;
      const billing=nav.querySelector('[data-page="billing"]');
      nav.insertBefore(button,billing||null);
    }
    const host=document.getElementById('modulePages')||document.querySelector('main');
    if(host&&!document.getElementById('team')){
      const page=document.createElement('section');page.className='page';page.id='team';
      page.innerHTML='<h1>Team Members</h1><p class="sub">Manage employee logins and paid seats for your HVACFlow company.</p><div id="teamContent" class="card">Loading…</div>';
      host.appendChild(page);
    }
    const teamButton=nav?.querySelector('[data-page="team"]');
    if(teamButton&&typeof subscriptionActive!=='undefined')teamButton.classList.toggle('hidden',!subscriptionActive);
  }

  async function syncPlanEntitlement(){
    if(!currentCompany?.id||currentCompany.role!=='owner') return;
    const {data:{session}}=await sb.auth.getSession();
    if(!session) return;
    try{
      const response=await fetch('/api/subscription',{headers:{Authorization:`Bearer ${session.access_token}`}});
      const data=await response.json();
      if(!response.ok||!data.active||!PLAN_LIMITS[data.plan]) return;
      await sb.from('Companies').update({subscription_plan:data.plan,included_user_limit:PLAN_LIMITS[data.plan],extra_user_limit:Number(data.extra_seats||0)}).eq('id',currentCompany.id);
    }catch(_e){}
  }

  async function rpc(name,args={}){
    const {data,error}=await sb.rpc(name,args);
    if(error) throw error;
    return data;
  }

  function inviteUrl(token){return `${location.origin}${location.pathname}?invite=${encodeURIComponent(token)}`;}

  async function copyText(text,button){
    try{await navigator.clipboard.writeText(text);const old=button.textContent;button.textContent='Copied';setTimeout(()=>button.textContent=old,1200)}catch(_e){prompt('Copy this invitation link:',text);}
  }

  function seatGuidance(plan){
    if(plan==='starter') return 'Starter includes 1 user. Add up to 3 extra seats for $8 each (4 total). At 5 users, upgrade to Professional.';
    if(plan==='professional') return 'Professional includes 5 users. Add up to 4 extra seats for $8 each (9 total). At 10 users, Business is the same base price as 5 extra seats and includes 15 users.';
    return 'Business includes 15 users. Add additional seats for $8 each with no forced upgrade.';
  }

  async function loadTeam(){
    ensureTeamUI();
    const host=document.getElementById('teamContent');
    if(!host) return;
    host.innerHTML='Loading team…';
    try{
      await syncPlanEntitlement();
      const summaryRows=await rpc('hvacflow_team_summary');
      const summary=Array.isArray(summaryRows)?summaryRows[0]:summaryRows;
      const members=await rpc('hvacflow_team_members');
      let invites=[];
      if(['owner','admin'].includes(summary.member_role)){
        try{invites=await rpc('hvacflow_team_invites');}catch(_e){invites=[];}
      }
      const canManage=['owner','admin'].includes(summary.member_role);
      const isOwner=summary.member_role==='owner';
      const plan=String(summary.subscription_plan||'starter');
      const activeMembers=Number(summary.member_count||0);
      const totalSeats=Number(summary.seat_limit||1);
      const extraSeats=Number(summary.extra_user_limit||0);
      const maxExtra=MAX_EXTRA_SEATS[plan]??0;
      host.innerHTML=`
        <div class="team-grid">
          <div class="team-stat"><small>Plan</small><strong>${escapeHtml(title(plan))}</strong></div>
          <div class="team-stat"><small>Active users</small><strong>${activeMembers}</strong></div>
          <div class="team-stat"><small>Total seats</small><strong>${totalSeats}</strong></div>
          <div class="team-stat"><small>Available</small><strong>${Math.max(0,totalSeats-activeMembers)}</strong></div>
        </div>
        ${canManage?`<div class="card" style="box-shadow:none;margin-bottom:14px"><h3>Invite a team member</h3><p class="sub">Each employee gets their own login and shares this company's customers, jobs, estimates, appointments and payments.</p><form id="teamInviteForm" class="team-form"><label>Email<input name="email" type="email" required placeholder="employee@example.com"></label><label>Role<select name="role"><option value="technician">Technician</option><option value="dispatcher">Dispatcher</option><option value="admin">Admin</option></select></label><button class="btn primary" type="submit">Create Invite</button></form><div id="teamInviteMsg"></div></div>`:''}
        <div class="card" style="box-shadow:none;margin-bottom:14px"><h3>Current team</h3><div id="teamMembersList">${(members||[]).map(m=>`<div class="team-member-row"><div><strong>${escapeHtml(m.email||'User')}</strong><span class="team-role">${escapeHtml(title(m.role))}</span></div><div class="team-actions">${isOwner&&m.role!=='owner'?`<button class="btn danger team-remove" data-user="${m.user_id}">Remove</button>`:''}</div></div>`).join('')||'<div class="empty">No team members yet.</div>'}</div></div>
        ${canManage?`<div class="card" style="box-shadow:none;margin-bottom:14px"><h3>Pending invitations</h3><div id="teamInvitesList">${(invites||[]).map(i=>`<div class="team-invite-row"><div><strong>${escapeHtml(i.email)}</strong><span class="team-role">${escapeHtml(title(i.role))}</span><div class="sub" style="margin:4px 0 0">Expires ${new Date(i.expires_at).toLocaleDateString()}</div></div><div class="team-actions"><button class="btn secondary team-copy" data-token="${i.token}">Copy Link</button><button class="btn danger team-cancel" data-id="${i.id}">Cancel</button></div></div>`).join('')||'<div class="empty">No pending invitations.</div>'}</div></div>`:''}
        <div class="card" style="box-shadow:none"><h3>Seats & pricing</h3><p>Starter includes <strong>1</strong> user, Professional includes <strong>5</strong>, and Business includes <strong>15</strong>. Additional seats are <strong>$8 per user/month</strong> on every plan.</p><p>${escapeHtml(seatGuidance(plan))}</p>${isOwner?`<div class="team-seat-box"><label>Extra paid seats<input id="extraSeats" type="number" min="0" max="${maxExtra}" value="${extraSeats}"></label><label>Billing state<select id="billingState"><option value="">Choose state</option>${STATES.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></label><label>Billing ZIP<input id="billingZip" inputmode="numeric" autocomplete="postal-code" placeholder="12345" maxlength="10"></label><button class="btn primary" id="updateExtraSeats">Update Paid Seats</button></div><div id="seatMsg"></div><p class="plan-note">Extra seats are $8 each before applicable tax. Stripe calculates tax from the billing state and ZIP and may also create a prorated charge or credit.</p>`:''}</div>`;

      const inviteForm=document.getElementById('teamInviteForm');
      if(inviteForm)inviteForm.onsubmit=async e=>{
        e.preventDefault();const fd=new FormData(e.target);const msg=document.getElementById('teamInviteMsg');msg.innerHTML='';
        try{const token=await rpc('hvacflow_create_team_invite',{p_email:String(fd.get('email')||'').trim(),p_role:String(fd.get('role')||'technician')});const url=inviteUrl(token);msg.innerHTML=`<div class="msg ok">Invitation created. <button type="button" class="btn secondary" id="copyNewInvite">Copy invitation link</button></div>`;document.getElementById('copyNewInvite').onclick=e=>copyText(url,e.currentTarget);await loadTeam();}catch(error){msg.innerHTML=`<div class="msg err">${escapeHtml(error.message)}</div>`;}
      };
      host.querySelectorAll('.team-copy').forEach(b=>b.onclick=()=>copyText(inviteUrl(b.dataset.token),b));
      host.querySelectorAll('.team-cancel').forEach(b=>b.onclick=async()=>{if(!confirm('Cancel this invitation?'))return;try{await rpc('hvacflow_cancel_team_invite',{p_invite_id:b.dataset.id});await loadTeam();}catch(e){alert(e.message)}});
      host.querySelectorAll('.team-remove').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this user from the company account?'))return;try{await rpc('hvacflow_remove_team_member',{p_user_id:b.dataset.user});await loadTeam();}catch(e){alert(e.message)}});
      const seatButton=document.getElementById('updateExtraSeats');
      if(seatButton)seatButton.onclick=async()=>{
        const count=Math.max(0,Number.parseInt(document.getElementById('extraSeats').value,10)||0);const cost=count*8;
        const billingState=String(document.getElementById('billingState')?.value||'').trim().toUpperCase();
        const billingZip=String(document.getElementById('billingZip')?.value||'').trim();
        if(count>maxExtra){alert(seatGuidance(plan));return;}
        if(count>0&&!/^[A-Z]{2}$/.test(billingState)){alert('Choose your billing state so Stripe can calculate the correct tax.');return;}
        if(count>0&&!/^\d{5}(?:-\d{4})?$/.test(billingZip)){alert('Enter a valid billing ZIP code so Stripe can calculate the correct tax.');return;}
        if(!confirm(`Set ${count} extra paid seat${count===1?'':'s'} for $${cost}/month before applicable tax in addition to the ${title(plan)} plan? Stripe will calculate tax from ${billingState} ${billingZip}. Proration may apply.`))return;
        const msg=document.getElementById('seatMsg');seatButton.disabled=true;seatButton.textContent='Updating…';msg.innerHTML='';
        try{const {data:{session}}=await sb.auth.getSession();const response=await fetch('/api/team-seats',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({extra_seats:count,billing_state:billingState,billing_zip:billingZip})});const data=await response.json();if(!response.ok)throw new Error(data.error||'Seat update failed.');msg.innerHTML=`<div class="msg ok">Seat capacity updated to ${data.total_seats}. Extra seat cost: $${data.monthly_extra_cost}/month before applicable tax.${data.upgrade_recommended?` Consider upgrading to ${title(data.upgrade_recommended)} before adding another user.`:''}</div>`;setTimeout(loadTeam,900);}catch(error){msg.innerHTML=`<div class="msg err">${escapeHtml(error.message)}</div>`;}finally{seatButton.disabled=false;seatButton.textContent='Update Paid Seats';}
      };
    }catch(error){host.innerHTML=`<div class="msg err">${escapeHtml(error.message)}</div>`;}
  }

  async function acceptInviteFromUrl(){
    if(acceptingInvite) return;
    const token=new URLSearchParams(location.search).get('invite');
    if(!token) return;
    const {data:{session}}=await sb.auth.getSession();
    if(!session){const msg=document.getElementById('authMsg');if(msg)msg.innerHTML='<div class="msg ok">Team invitation detected. Sign in or create an account using the invited email address.</div>';return;}
    acceptingInvite=true;
    try{
      await rpc('hvacflow_accept_team_invite',{p_token:token});
      const url=new URL(location.href);url.searchParams.delete('invite');history.replaceState({},document.title,url.pathname+url.search);
      alert('You joined the HVACFlow company account. Your team workspace is ready.');
      location.reload();
    }catch(error){
      const msg=document.getElementById('authMsg');
      if(msg)msg.innerHTML=`<div class="msg err">${escapeHtml(error.message)}</div>`;
      console.error('Invitation acceptance failed',error.message);
    }finally{acceptingInvite=false;}
  }

  const observer=new MutationObserver(()=>ensureTeamUI());
  observer.observe(document.body,{childList:true,subtree:true});
  ensureTeamUI();
  setTimeout(()=>{ensureTeamUI();acceptInviteFromUrl();},100);
  sb.auth.onAuthStateChange(()=>setTimeout(acceptInviteFromUrl,100));
})();
