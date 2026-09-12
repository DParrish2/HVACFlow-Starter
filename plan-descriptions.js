(() => {
  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function formatDate(unix){
    if(!unix) return '';
    const d=new Date(Number(unix)*1000);
    return Number.isNaN(d.getTime())?'':d.toLocaleDateString();
  }

  async function refreshSubscriptionManagement(){
    const host=document.getElementById('subscriptionManagement');
    if(!host||typeof sb==='undefined') return;
    const {data:{session}}=await sb.auth.getSession();
    if(!session){host.innerHTML='';return;}
    try{
      const response=await fetch('/api/subscription',{headers:{Authorization:`Bearer ${session.access_token}`}});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'Subscription status could not be loaded.');
      if(data.member_role&&data.member_role!=='owner'){host.innerHTML='';return;}
      if(data.test_account){host.innerHTML='<div class="card" style="margin-top:16px"><h3>Subscription management</h3><p class="sub" style="margin:0">Test accounts do not have a cancellable live subscription.</p></div>';return;}
      if(!data.active){host.innerHTML='';return;}
      const endDate=formatDate(data.current_period_end);
      if(data.cancel_at_period_end){
        host.innerHTML=`<div class="card" style="margin-top:16px"><h3>Subscription cancellation scheduled</h3><p>Your HVACFlow access remains active${endDate?` through <strong>${esc(endDate)}</strong>`:''}. After that date, the subscription will end and you will not be billed for another period.</p><button class="btn secondary" id="resumeSubscription">Keep My Subscription</button><div id="subscriptionManageMsg"></div></div>`;
        document.getElementById('resumeSubscription').onclick=()=>manageSubscription('resume');
      }else{
        host.innerHTML=`<div class="card" style="margin-top:16px"><h3>Manage subscription</h3><p class="sub">Need to stop your plan? You can cancel future renewal and keep access through the end of your current billing period.</p><button class="btn danger" id="cancelSubscription">Cancel Subscription</button><div id="subscriptionManageMsg"></div></div>`;
        document.getElementById('cancelSubscription').onclick=()=>manageSubscription('cancel');
      }
    }catch(error){
      host.innerHTML=`<div class="msg err">${esc(error.message)}</div>`;
    }
  }

  async function manageSubscription(action){
    const msg=document.getElementById('subscriptionManageMsg');
    const button=document.getElementById(action==='cancel'?'cancelSubscription':'resumeSubscription');
    if(action==='cancel'&&!confirm('Cancel your HVACFlow subscription at the end of the current billing period? You will keep access until then.')) return;
    if(action==='resume'&&!confirm('Keep your HVACFlow subscription active and continue future renewals?')) return;
    try{
      if(button){button.disabled=true;button.textContent=action==='cancel'?'Scheduling cancellation…':'Restoring subscription…';}
      const {data:{session}}=await sb.auth.getSession();
      if(!session) throw new Error('Please sign in again.');
      const response=await fetch('/api/manage-subscription',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},body:JSON.stringify({action})});
      const data=await response.json();
      if(!response.ok) throw new Error(data.error||'Subscription could not be updated.');
      if(msg)msg.innerHTML=`<div class="msg ok">${action==='cancel'?'Cancellation scheduled. You will keep access until the end of the current billing period.':'Your subscription will continue renewing normally.'}</div>`;
      setTimeout(refreshSubscriptionManagement,500);
    }catch(error){
      if(msg)msg.innerHTML=`<div class="msg err">${esc(error.message)}</div>`;
      if(button){button.disabled=false;button.textContent=action==='cancel'?'Cancel Subscription':'Keep My Subscription';}
    }
  }

  function renderPlans(){
    const billing=document.getElementById('billing');
    const plans=billing?.querySelector('.plans');
    if(!plans) return;
    if(plans.dataset.planDescriptionsReady!=='1'){
      plans.dataset.planDescriptionsReady='1';
      plans.style.gridTemplateColumns='repeat(3,minmax(0,1fr))';
      plans.innerHTML=`
        <div class="card plan">
          <h2>Starter</h2>
          <div class="price">$29.99 <small>/ month</small></div>
          <p><strong>1 user included.</strong></p>
          <p><strong>Unlocks:</strong> The complete HVACFlow core platform — customers, customer profiles, leads, jobs, estimates, appointments, scheduling, payments, and dashboard tools.</p>
          <p><strong>Extra seats:</strong> $8/user/month. Add up to 3 extra seats (4 total users). At 5 users, Professional is the better value.</p>
          <button class="btn primary subscribe" data-plan="starter">Choose Starter</button>
        </div>
        <div class="card plan">
          <h2>Professional</h2>
          <div class="price">$59.99 <small>/ month</small></div>
          <p><strong>Up to 5 users included.</strong></p>
          <p><strong>Unlocks:</strong> Everything in Starter, plus shared company access with individual team-member logins.</p>
          <p><strong>Extra seats:</strong> $8/user/month. Add up to 4 extra seats (9 total users). At 10 users, Business costs the same and includes 15 users.</p>
          <button class="btn primary subscribe" data-plan="professional">Choose Professional</button>
        </div>
        <div class="card plan">
          <h2>Business</h2>
          <div class="price">$99.99 <small>/ month</small></div>
          <p><strong>Up to 15 users included.</strong></p>
          <p><strong>Unlocks:</strong> Everything in Professional, with team capacity expanded for larger crews, office staff, dispatchers, and technicians.</p>
          <p><strong>Extra seats:</strong> $8/user/month above 15, with no forced upgrade.</p>
          <button class="btn primary subscribe" data-plan="business">Choose Business</button>
        </div>`;
    }

    if(billing&&!document.getElementById('subscriptionManagement')){
      const host=document.createElement('div');
      host.id='subscriptionManagement';
      billing.appendChild(host);
      setTimeout(refreshSubscriptionManagement,100);
    }

    if(!document.getElementById('planGridResponsive')){
      const style=document.createElement('style');
      style.id='planGridResponsive';
      style.textContent='@media(max-width:950px){#billing .plans{grid-template-columns:1fr!important}}';
      document.head.appendChild(style);
    }
  }

  const observer=new MutationObserver(renderPlans);
  observer.observe(document.body,{childList:true,subtree:true});
  renderPlans();
  if(typeof sb!=='undefined') sb.auth.onAuthStateChange(()=>setTimeout(refreshSubscriptionManagement,200));
})();
