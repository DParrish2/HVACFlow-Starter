const SUPABASE_URL='https://ynavufmatbvqyzwmgxnb.supabase.co';
const SUPABASE_KEY='sb_publishable_fSTVOqQUUXq1kOuZHYJdBg_qh4JtJPQ';
const ACTIVE_STATUSES=new Set(['active','trialing']);
const TEST_ACCOUNT_EMAILS=new Set(['david.parrish@libertyenergy.com','shedtoshelf@gmail.com']);

function bearerFrom(req){
  const auth=String(req.headers.authorization||'');
  if(!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim()||null;
}

async function getUser(token){
  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});
  if(!r.ok) return null;
  return r.json();
}

async function getIdentity(token){
  const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/hvacflow_company_subscription_identity`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:'{}',
  });
  if(!r.ok) return null;
  const rows=await r.json();
  return Array.isArray(rows)?rows[0]||null:rows;
}

async function stripeRequest(secret,path,{method='GET',params={}}={}){
  const url=new URL(`https://api.stripe.com/v1/${path}`);
  let body;
  if(method==='GET'){
    Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  }else{
    body=new URLSearchParams();
    Object.entries(params).forEach(([k,v])=>body.set(k,String(v)));
  }
  const r=await fetch(url,{method,headers:{Authorization:`Bearer ${secret}`,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body});
  const data=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error?.message||'Stripe request failed.');
  return data;
}

async function findActiveSubscription(secret,email){
  const customers=await stripeRequest(secret,'customers',{params:{email,limit:10}});
  for(const customer of customers.data||[]){
    const subs=await stripeRequest(secret,'subscriptions',{params:{customer:customer.id,status:'all',limit:20}});
    const sub=(subs.data||[]).find(s=>ACTIVE_STATUSES.has(s.status));
    if(sub) return sub;
  }
  return null;
}

module.exports=async function manageSubscription(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Method not allowed.'});
  }

  const token=bearerFrom(req);
  if(!token) return res.status(401).json({error:'Please sign in again.'});

  let user,identity;
  try{
    [user,identity]=await Promise.all([getUser(token),getIdentity(token)]);
  }catch(error){
    console.error('Subscription account lookup failed',error.message);
    return res.status(503).json({error:'Account verification is temporarily unavailable.'});
  }
  if(!user?.email) return res.status(401).json({error:'Please sign in again.'});
  if(identity?.member_role&&identity.member_role!=='owner') return res.status(403).json({error:'Only the account owner can manage the company subscription.'});

  const email=String(identity?.owner_email||user.email).toLowerCase();
  if(TEST_ACCOUNT_EMAILS.has(email)) return res.status(400).json({error:'Test accounts do not have a cancellable live subscription.'});

  const action=String(req.body?.action||'').toLowerCase();
  if(!['cancel','resume'].includes(action)) return res.status(400).json({error:'Choose cancel or resume.'});

  const secret=process.env.STRIPE_SECRET_KEY;
  if(!secret) return res.status(500).json({error:'Stripe is not configured yet.'});

  try{
    const subscription=await findActiveSubscription(secret,email);
    if(!subscription) return res.status(404).json({error:'No active subscription was found.'});

    const updated=await stripeRequest(secret,`subscriptions/${subscription.id}`,{
      method:'POST',
      params:{cancel_at_period_end:action==='cancel'?'true':'false'},
    });

    return res.status(200).json({
      ok:true,
      cancel_at_period_end:!!updated.cancel_at_period_end,
      current_period_end:updated.current_period_end||null,
      status:updated.status,
    });
  }catch(error){
    console.error('Subscription management failed',error.message);
    return res.status(400).json({error:error.message||'Subscription could not be updated.'});
  }
};
