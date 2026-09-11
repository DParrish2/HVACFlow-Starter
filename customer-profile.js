(() => {
  const relatedTables = ['Jobs','Estimates','Appointments','Payments','Leads'];

  function ensureStyles(){
    if(document.getElementById('customerProfileStyles')) return;
    const style=document.createElement('style');
    style.id='customerProfileStyles';
    style.textContent=`
      #bodyCustomers td:first-child{color:#0d47a1;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:2px}
      .profile-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap;margin-bottom:16px}
      .profile-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-bottom:16px}
      .profile-card{background:#fff;border:1px solid #e3e8ef;border-radius:12px;padding:17px;box-shadow:0 2px 8px #0f172a0d}
      .profile-card h3{margin:0 0 12px}.profile-list{display:grid;grid-template-columns:140px 1fr;gap:8px 12px}.profile-list strong{color:#667085}
      .profile-section{margin-top:16px}.profile-section h2{margin-bottom:10px}.profile-table{overflow:auto;background:#fff;border:1px solid #e3e8ef;border-radius:12px}
      .payment-pill{display:inline-block;padding:5px 9px;border-radius:999px;background:#eef4fb;font-weight:700;text-transform:capitalize}
      .profile-edit-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.profile-edit-grid label{display:flex;flex-direction:column;gap:5px}.profile-edit-grid .full{grid-column:1/-1}
      @media(max-width:720px){.profile-grid,.profile-edit-grid{grid-template-columns:1fr}.profile-edit-grid .full{grid-column:auto}.profile-list{grid-template-columns:1fr}}
    `;
    document.head.appendChild(style);
  }

  function ensureProfilePage(){
    let page=document.getElementById('customerProfile');
    if(page) return page;
    page=document.createElement('section');
    page.className='page';
    page.id='customerProfile';
    const host=document.getElementById('modulePages') || document.querySelector('main');
    host.appendChild(page);
    return page;
  }

  function money(v){return '$'+Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
  function safe(v){return esc(v==null||v===''?'—':v)}

  async function loadRelated(table, customer){
    let {data,error}=await sb.from(table).select('*').eq('customer_id',customer.id).order('created_at',{ascending:false});
    if(error) throw error;
    if(data?.length) return data;
    const fallback=await sb.from(table).select('*').eq('customer_name',customer.name).order('created_at',{ascending:false});
    if(fallback.error) throw fallback.error;
    return fallback.data||[];
  }

  function rowsFor(table, rows){
    if(!rows.length) return '<div class="empty">No records for this customer yet.</div>';
    if(table==='Jobs') return `<div class="profile-table"><table><thead><tr><th>Service</th><th>Scheduled</th><th>Status</th><th>Amount</th><th>Notes</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${safe(r.service_type)}</td><td>${format('scheduled_for',r.scheduled_for)}</td><td>${safe(r.status)}</td><td>${money(r.amount)}</td><td>${safe(r.notes)}</td></tr>`).join('')}</tbody></table></div>`;
    if(table==='Estimates') return `<div class="profile-table"><table><thead><tr><th>Amount</th><th>Status</th><th>Created</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${money(r.amount)}</td><td>${safe(r.status)}</td><td>${format('created_at',r.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
    if(table==='Appointments') return `<div class="profile-table"><table><thead><tr><th>Scheduled</th><th>Status</th><th>Notes</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${format('scheduled_for',r.scheduled_for)}</td><td>${safe(r.status)}</td><td>${safe(r.notes)}</td></tr>`).join('')}</tbody></table></div>`;
    if(table==='Payments') return `<div class="profile-table"><table><thead><tr><th>Amount</th><th>Status</th><th>Method</th><th>Reference</th><th>Recorded</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${money(r.amount)}</td><td>${safe(r.status)}</td><td>${safe(r.method)}</td><td>${safe(r.reference)}</td><td>${format('created_at',r.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
    if(table==='Leads') return `<div class="profile-table"><table><thead><tr><th>Service needed</th><th>Source</th><th>Status</th><th>Created</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${safe(r.issue)}</td><td>${safe(r.source)}</td><td>${safe(r.status)}</td><td>${format('created_at',r.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
    return '';
  }

  async function openCustomerProfile(customerId){
    if(typeof subscriptionActive!=='undefined' && !subscriptionActive){showBillingPage('Choose an HVACFlow plan to unlock customer profiles.');return;}
    ensureStyles();
    const page=ensureProfilePage();
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('#nav button').forEach(b=>b.classList.remove('active'));
    page.classList.add('active');
    page.innerHTML='<div class="card">Loading customer profile…</div>';
    try{
      const {data:customer,error}=await sb.from('Customers').select('*').eq('id',customerId).single();
      if(error) throw error;
      const results=await Promise.all(relatedTables.map(t=>loadRelated(t,customer)));
      const related=Object.fromEntries(relatedTables.map((t,i)=>[t,results[i]]));
      const paidTotal=related.Payments.filter(p=>p.status==='paid'||p.status==='recorded').reduce((s,p)=>s+Number(p.amount||0),0);
      page.innerHTML=`
        <div class="profile-head"><div><button class="btn secondary" id="backCustomers">← Customers</button><h1 style="margin-top:12px">${safe(customer.name)}</h1><p class="sub">Customer profile and service history</p></div><button class="btn primary" id="editCustomerProfile">Edit Customer</button></div>
        <div id="customerProfileMsg"></div>
        <div class="profile-grid">
          <div class="profile-card"><h3>Customer Information</h3><div class="profile-list"><strong>Phone</strong><span>${safe(customer.phone)}</span><strong>Email</strong><span>${safe(customer.email)}</span><strong>Address</strong><span>${safe([customer.address,customer.city,customer.state,customer.zip_code].filter(Boolean).join(', '))}</span><strong>Notes</strong><span>${safe(customer.notes)}</span></div></div>
          <div class="profile-card"><h3>Payment Status</h3><p><span class="payment-pill">${safe((customer.payment_status||'unknown').replaceAll('_',' '))}</span></p><div class="profile-list"><strong>Total recorded</strong><span>${money(paidTotal)}</span><strong>Payment notes</strong><span>${safe(customer.payment_notes)}</span></div></div>
        </div>
        <div id="customerEditPanel" class="profile-card hidden"></div>
        <div class="profile-section"><h2>Jobs</h2>${rowsFor('Jobs',related.Jobs)}</div>
        <div class="profile-section"><h2>Estimates</h2>${rowsFor('Estimates',related.Estimates)}</div>
        <div class="profile-section"><h2>Appointments</h2>${rowsFor('Appointments',related.Appointments)}</div>
        <div class="profile-section"><h2>Payments</h2>${rowsFor('Payments',related.Payments)}</div>
        <div class="profile-section"><h2>Lead History</h2>${rowsFor('Leads',related.Leads)}</div>`;
      document.getElementById('backCustomers').onclick=()=>{
        document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
        document.getElementById('customers').classList.add('active');
        const btn=document.querySelector('#nav button[data-page="customers"]');if(btn)btn.classList.add('active');
      };
      document.getElementById('editCustomerProfile').onclick=()=>showEdit(customer);
    }catch(error){page.innerHTML=`<button class="btn secondary" id="backCustomers">← Customers</button><div class="msg err" style="margin-top:12px">${safe(error.message)}</div>`;document.getElementById('backCustomers').onclick=()=>document.querySelector('#nav button[data-page="customers"]')?.click();}
  }

  function showEdit(customer){
    const panel=document.getElementById('customerEditPanel');
    panel.classList.remove('hidden');
    panel.innerHTML=`<h3>Edit Customer</h3><form id="customerProfileForm"><div class="profile-edit-grid">
      <label><span>Name</span><input name="name" required value="${safe(customer.name==='—'?'':customer.name)}"></label>
      <label><span>Phone</span><input name="phone" value="${safe(customer.phone==='—'?'':customer.phone||'')}"></label>
      <label><span>Email</span><input name="email" type="email" value="${safe(customer.email==='—'?'':customer.email||'')}"></label>
      <label><span>Address</span><input name="address" value="${safe(customer.address||'')}"></label>
      <label><span>City</span><input name="city" value="${safe(customer.city||'')}"></label>
      <label><span>State</span><input name="state" maxlength="2" value="${safe(customer.state||'')}"></label>
      <label><span>ZIP Code</span><input name="zip_code" value="${safe(customer.zip_code||'')}"></label>
      <label><span>Payment status</span><select name="payment_status">${['unknown','current','partial','past_due','paid_in_full','payment_plan','collections'].map(v=>`<option value="${v}" ${v===(customer.payment_status||'unknown')?'selected':''}>${v.replaceAll('_',' ')}</option>`).join('')}</select></label>
      <label class="full"><span>Customer notes</span><textarea name="notes">${safe(customer.notes||'')}</textarea></label>
      <label class="full"><span>Payment notes</span><textarea name="payment_notes" placeholder="Example: Deposit received, balance due after installation">${safe(customer.payment_notes||'')}</textarea></label>
    </div><div class="actions"><button type="button" class="btn secondary" id="cancelCustomerEdit">Cancel</button><button class="btn primary" type="submit">Save Changes</button></div></form>`;
    document.getElementById('cancelCustomerEdit').onclick=()=>panel.classList.add('hidden');
    document.getElementById('customerProfileForm').onsubmit=async e=>{
      e.preventDefault();
      const updates=Object.fromEntries(new FormData(e.target).entries());
      updates.state=(updates.state||'').toUpperCase();
      const {error}=await sb.from('Customers').update(updates).eq('id',customer.id);
      if(error){message(document.getElementById('customerProfileMsg'),error.message,true);return;}
      message(document.getElementById('customerProfileMsg'),'Customer information updated.');
      await openCustomerProfile(customer.id);
      if(typeof loadModule==='function') loadModule('Customers');
    };
  }

  document.addEventListener('click',event=>{
    const cell=event.target.closest('#bodyCustomers tr td:first-child');
    if(!cell) return;
    const row=cell.closest('tr');
    const id=row?.querySelector('.del')?.dataset.id;
    if(id){event.preventDefault();openCustomerProfile(id);}
  });

  ensureStyles();
})();
