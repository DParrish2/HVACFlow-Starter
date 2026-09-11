(() => {
  let source=null;

  function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function endpoint(){return `${location.origin}/api/website-lead`;}
  function formCode(token){return `<form action="${endpoint()}" method="post">
  <input type="hidden" name="token" value="${token}">
  <input type="hidden" name="source" value="Company Website">
  <label>Name <input name="name" required></label>
  <label>Phone <input name="phone" type="tel"></label>
  <label>Email <input name="email" type="email"></label>
  <label>Service needed <textarea name="issue" required></textarea></label>
  <button type="submit">Request Service</button>
</form>`;}

  async function copy(text,button){
    try{await navigator.clipboard.writeText(text);const old=button.textContent;button.textContent='Copied';setTimeout(()=>button.textContent=old,1200)}catch(_e){prompt('Copy this:',text);}
  }

  function ensureModal(){
    if(document.getElementById('websiteLeadModal')) return;
    const modal=document.createElement('div');
    modal.id='websiteLeadModal';
    modal.className='modal';
    modal.innerHTML=`<div class="box" style="width:min(760px,100%)"><div class="toolbar"><div><h2>Website Lead Intake</h2><p class="sub" style="margin:4px 0 0">Connect a contractor website so service requests automatically appear in HVACFlow Leads.</p></div><button class="btn secondary" id="closeWebsiteLeadModal">Close</button></div><div id="websiteLeadContent">Loading…</div></div>`;
    document.body.appendChild(modal);
    document.getElementById('closeWebsiteLeadModal').onclick=()=>modal.classList.remove('open');
    modal.addEventListener('click',e=>{if(e.target===modal)modal.classList.remove('open')});
  }

  async function getSource(){
    const {data,error}=await sb.rpc('hvacflow_get_or_create_website_lead_source',{p_label:'Company Website'});
    if(error) throw error;
    const row=Array.isArray(data)?data[0]:data;
    if(!row?.token) throw new Error('Website lead connection could not be created.');
    source=row;
    return row;
  }

  async function render(){
    const host=document.getElementById('websiteLeadContent');
    if(!host) return;
    host.innerHTML='Loading website connection…';
    try{
      const row=await getSource();
      const code=formCode(row.token);
      host.innerHTML=`
        <div class="msg ok"><strong>Ready:</strong> Leads submitted through this connection will appear in the Leads tab with status <strong>new</strong>.</div>
        <div class="card" style="box-shadow:none;margin-bottom:12px">
          <h3>Easy website form connection</h3>
          <p>Copy this form into the contractor's website. When a customer submits it, HVACFlow creates a lead automatically.</p>
          <textarea id="websiteLeadCode" readonly style="width:100%;min-height:230px;font-family:monospace">${esc(code)}</textarea>
          <div class="actions"><button class="btn primary" id="copyWebsiteLeadCode">Copy Website Form Code</button></div>
        </div>
        <div class="card" style="box-shadow:none;margin-bottom:12px">
          <h3>For an existing custom website form</h3>
          <p>Send a POST request to:</p>
          <input id="websiteLeadEndpoint" readonly value="${esc(endpoint())}" style="width:100%">
          <p>Include the fields <strong>token, name, phone, email, issue</strong>. The token for this company is:</p>
          <input id="websiteLeadToken" readonly value="${esc(row.token)}" style="width:100%">
          <div class="actions"><button class="btn secondary" id="copyWebsiteLeadEndpoint">Copy Endpoint</button><button class="btn secondary" id="copyWebsiteLeadToken">Copy Token</button></div>
        </div>
        <div class="card" style="box-shadow:none">
          <h3>Security</h3>
          <p class="plan-note">Treat the website lead token like a form key. If it is ever abused, rotate it and replace the token on the contractor website.</p>
          <button class="btn secondary" id="rotateWebsiteLeadToken">Rotate Website Lead Token</button>
          <div id="websiteLeadMsg"></div>
        </div>`;
      document.getElementById('copyWebsiteLeadCode').onclick=e=>copy(code,e.currentTarget);
      document.getElementById('copyWebsiteLeadEndpoint').onclick=e=>copy(endpoint(),e.currentTarget);
      document.getElementById('copyWebsiteLeadToken').onclick=e=>copy(row.token,e.currentTarget);
      document.getElementById('rotateWebsiteLeadToken').onclick=async e=>{
        if(!confirm('Rotate this token? The old website form will stop sending leads until you replace its token.')) return;
        e.currentTarget.disabled=true;
        try{
          const {data,error}=await sb.rpc('hvacflow_rotate_website_lead_token',{p_source_id:row.source_id});
          if(error) throw error;
          source={...row,token:data};
          await render();
        }catch(error){document.getElementById('websiteLeadMsg').innerHTML=`<div class="msg err">${esc(error.message)}</div>`;e.currentTarget.disabled=false;}
      };
    }catch(error){host.innerHTML=`<div class="msg err">${esc(error.message)}</div>`;}
  }

  function open(){
    if(typeof subscriptionActive!=='undefined'&&!subscriptionActive){if(typeof showBillingPage==='function')showBillingPage('An active HVACFlow subscription is required for website lead intake.');return;}
    ensureModal();
    document.getElementById('websiteLeadModal').classList.add('open');
    render();
  }

  function wire(){
    ensureModal();
    const leads=document.getElementById('leads');
    const toolbar=leads?.querySelector('.toolbar > div:last-child');
    if(toolbar&&!document.getElementById('websiteLeadButton')){
      const button=document.createElement('button');
      button.id='websiteLeadButton';
      button.className='btn secondary';
      button.style.marginRight='6px';
      button.textContent='Connect Website Leads';
      button.onclick=open;
      toolbar.insertBefore(button,toolbar.firstChild);
    }
  }

  const observer=new MutationObserver(()=>wire());
  observer.observe(document.body,{childList:true,subtree:true});
  wire();
})();
