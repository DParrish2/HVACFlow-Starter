const SUPABASE_URL='https://ynavufmatbvqyzwmgxnb.supabase.co';
const SUPABASE_KEY='sb_publishable_fSTVOqQUUXq1kOuZHYJdBg_qh4JtJPQ';

function parseBody(req){
  if(req.body && typeof req.body==='object') return req.body;
  const raw=String(req.body||'');
  const type=String(req.headers['content-type']||'');
  if(type.includes('application/json')){ try{return JSON.parse(raw||'{}')}catch(_e){return {}} }
  return Object.fromEntries(new URLSearchParams(raw));
}

function sendHtml(res,status,message){
  res.status(status).setHeader('Content-Type','text/html; charset=utf-8');
  return res.end(`<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Service Request</title><body style="font-family:Arial;padding:40px;max-width:650px;margin:auto"><h2>${status<400?'Request received':'Request could not be sent'}</h2><p>${String(message).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}</p></body></html>`);
}

module.exports=async function websiteLead(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Access-Control-Allow-Methods','POST,OPTIONS');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='POST'){
    res.setHeader('Allow','POST, OPTIONS');
    return res.status(405).json({error:'Method not allowed.'});
  }

  const body=parseBody(req);
  if(body.website || body.company_website) return res.status(200).json({ok:true});
  const token=String(body.token||body.lead_token||'').trim();
  if(!token) return res.status(400).json({error:'Missing HVACFlow website lead token.'});

  const payload={
    p_token:token,
    p_customer_name:String(body.name||body.customer_name||'').trim().slice(0,160)||null,
    p_phone:String(body.phone||'').trim().slice(0,60)||null,
    p_email:String(body.email||'').trim().toLowerCase().slice(0,254)||null,
    p_issue:String(body.issue||body.service||body.message||'').trim().slice(0,4000)||null,
    p_source:String(body.source||'Website').trim().slice(0,120)||'Website'
  };

  try{
    const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/hvacflow_submit_website_lead`,{
      method:'POST',
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,'Content-Type':'application/json'},
      body:JSON.stringify(payload)
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok){
      const msg=data?.message||'Service request could not be submitted.';
      if(String(req.headers.accept||'').includes('text/html')) return sendHtml(res,400,msg);
      return res.status(400).json({error:msg});
    }
    if(String(req.headers.accept||'').includes('text/html')) return sendHtml(res,200,'Thank you. Your service request has been sent.');
    return res.status(200).json({ok:true,lead_id:data});
  }catch(error){
    console.error('Website lead intake failed',error.message);
    if(String(req.headers.accept||'').includes('text/html')) return sendHtml(res,503,'Service request is temporarily unavailable.');
    return res.status(503).json({error:'Service request is temporarily unavailable.'});
  }
};
