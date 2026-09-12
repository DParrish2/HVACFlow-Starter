(() => {
  const STATES=['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY','DC'];

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}

  function install(){
    const button=document.getElementById('updateExtraSeats');
    const seats=document.getElementById('extraSeats');
    if(!button||!seats||button.dataset.taxLocationReady==='1') return;
    button.dataset.taxLocationReady='1';

    const box=button.closest('.team-seat-box');
    if(box&&!document.getElementById('billingState')){
      const stateLabel=document.createElement('label');
      stateLabel.innerHTML=`Billing state<select id="billingState" required><option value="">Choose state</option>${STATES.map(s=>`<option value="${s}">${s}</option>`).join('')}</select>`;
      const zipLabel=document.createElement('label');
      zipLabel.innerHTML='Billing ZIP<input id="billingZip" inputmode="numeric" autocomplete="postal-code" placeholder="12345" maxlength="10" required>';
      box.insertBefore(stateLabel,button);
      box.insertBefore(zipLabel,button);
    }

    button.onclick=async()=>{
      const count=Math.max(0,Number.parseInt(seats.value,10)||0);
      const maxExtra=Number.parseInt(seats.max,10);
      const state=String(document.getElementById('billingState')?.value||'').trim().toUpperCase();
      const zip=String(document.getElementById('billingZip')?.value||'').trim();
      const msg=document.getElementById('seatMsg');
      if(Number.isFinite(maxExtra)&&count>maxExtra){
        if(msg)msg.innerHTML='<div class="msg err">This seat count is above the limit for your current plan.</div>';
        return;
      }
      if(count>0&&!/^[A-Z]{2}$/.test(state)){
        if(msg)msg.innerHTML='<div class="msg err">Choose the billing state used for this subscription.</div>';
        return;
      }
      if(count>0&&!/^\d{5}(?:-\d{4})?$/.test(zip)){
        if(msg)msg.innerHTML='<div class="msg err">Enter a valid billing ZIP code so Stripe can calculate the correct tax.</div>';
        return;
      }
      const cost=count*8;
      if(!confirm(`Set ${count} extra paid seat${count===1?'':'s'} for $${cost}/month before applicable tax? Stripe will calculate tax from the billing state and ZIP. Proration may apply.`))return;
      button.disabled=true;button.textContent='Updating…';if(msg)msg.innerHTML='';
      try{
        const {data:{session}}=await sb.auth.getSession();
        if(!session)throw new Error('Please sign in again.');
        const response=await fetch('/api/team-seats',{
          method:'POST',
          headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`},
          body:JSON.stringify({extra_seats:count,billing_state:state,billing_zip:zip}),
        });
        const data=await response.json();
        if(!response.ok)throw new Error(data.error||'Seat update failed.');
        if(msg)msg.innerHTML=`<div class="msg ok">Seat capacity updated to ${data.total_seats}. Extra seats are $${data.monthly_extra_cost}/month before applicable tax. Stripe will calculate tax using ${esc(data.billing_state||state)} ${esc(data.billing_zip||zip)}.</div>`;
        if(typeof loadTeam==='function')setTimeout(()=>loadTeam(),700);
      }catch(error){
        if(msg)msg.innerHTML=`<div class="msg err">${esc(error.message)}</div>`;
      }finally{
        button.disabled=false;button.textContent='Update Paid Seats';
      }
    };
  }

  const observer=new MutationObserver(()=>install());
  observer.observe(document.body,{childList:true,subtree:true});
  install();
})();
