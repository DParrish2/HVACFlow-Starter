(() => {
  function renderPlans(){
    const billing=document.getElementById('billing');
    const plans=billing?.querySelector('.plans');
    if(!plans || plans.dataset.planDescriptionsReady==='1') return;
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
})();
