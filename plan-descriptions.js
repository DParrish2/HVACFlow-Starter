(() => {
  function renderPlans(){
    const billing=document.getElementById('billing');
    const plans=billing?.querySelector('.plans');
    if(!plans || plans.dataset.planDescriptionsReady==='1') return;
    plans.dataset.planDescriptionsReady='1';
    plans.style.gridTemplateColumns='repeat(4,minmax(0,1fr))';
    plans.innerHTML=`
      <div class="card plan">
        <h2>Starter</h2>
        <div class="price">$29 <small>/ month</small></div>
        <p><strong>1 user included.</strong></p>
        <p>For a solo contractor. Includes customer management, jobs, estimates, scheduling, and payment tools.</p>
        <button class="btn primary subscribe" data-plan="starter">Choose Starter</button>
      </div>
      <div class="card plan">
        <h2>Professional</h2>
        <div class="price">$59 <small>/ month</small></div>
        <p><strong>Up to 5 users included.</strong></p>
        <p>For small contractor teams that need shared customers, jobs, estimates, appointments, and payments.</p>
        <button class="btn primary subscribe" data-plan="professional">Choose Professional</button>
      </div>
      <div class="card plan">
        <h2>Business</h2>
        <div class="price">$99 <small>/ month</small></div>
        <p><strong>Up to 15 users included.</strong></p>
        <p>For established contractor companies with office staff, dispatchers, and multiple technicians.</p>
        <button class="btn primary subscribe" data-plan="business">Choose Business</button>
      </div>
      <div class="card plan">
        <h2>Professional Plus</h2>
        <div class="price">$107 <small>/ month starting</small></div>
        <p><strong>16+ users.</strong></p>
        <p>Business includes the first 15 users. Professional Plus starts with user 16, then each employee over 15 is <strong>$8/month</strong>.</p>
        <button class="btn primary subscribe" data-plan="professional_plus">Choose Professional Plus</button>
      </div>`;

    if(!document.getElementById('planGridResponsive')){
      const style=document.createElement('style');
      style.id='planGridResponsive';
      style.textContent='@media(max-width:1100px){#billing .plans{grid-template-columns:repeat(2,minmax(0,1fr))!important}}@media(max-width:650px){#billing .plans{grid-template-columns:1fr!important}}';
      document.head.appendChild(style);
    }
  }

  const observer=new MutationObserver(renderPlans);
  observer.observe(document.body,{childList:true,subtree:true});
  renderPlans();
})();
