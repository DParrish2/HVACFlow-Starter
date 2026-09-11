const SUPABASE_URL = 'https://ynavufmatbvqyzwmgxnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fSTVOqQUUXq1kOuZHYJdBg_qh4JtJPQ';
const EXTRA_SEAT_PRICE_ID = 'price_1UEQxXRzvI2im2M0FROnmKZn';
const BUSINESS_PRICE_IDS = new Set(['price_1UClfyRzvI2im2M02XxWncbd','price_1UDDxdRzvI2im2M0orTHwQLN']);
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active','trialing']);

function bearerFrom(req){
  const auth=String(req.headers.authorization||'');
  if(!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim()||null;
}

async function supabaseRpc(token,name,body={}){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:JSON.stringify(body),
  });
  const data=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(data?.message||data?.error||'Workspace lookup failed.');
  return data;
}

async function patchCompany(token,companyId,values){
  const response=await fetch(`${SUPABASE_URL}/rest/v1/Companies?id=eq.${encodeURIComponent(companyId)}`,{
    method:'PATCH',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json',Prefer:'return=minimal'},
    body:JSON.stringify(values),
  });
  if(!response.ok){
    const data=await response.json().catch(()=>null);
    throw new Error(data?.message||'Seat count could not be saved.');
  }
}

async function stripeRequest(secretKey,path,{method='GET',params={}}={}){
  const url=new URL(`https://api.stripe.com/v1/${path}`);
  let body;
  if(method==='GET'||method==='DELETE') Object.entries(params).forEach(([k,v])=>url.searchParams.set(k,String(v)));
  else { body=new URLSearchParams(); Object.entries(params).forEach(([k,v])=>body.set(k,String(v))); }
  const response=await fetch(url,{method,headers:{Authorization:`Bearer ${secretKey}`,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},body});
  const data=await response.json().catch(()=>({}));
  if(!response.ok) throw new Error(data.error?.message||'Stripe request failed.');
  return data;
}

async function findSubscription(secretKey,email){
  const customers=await stripeRequest(secretKey,'customers',{params:{email,limit:10}});
  for(const customer of customers.data||[]){
    const subs=await stripeRequest(secretKey,'subscriptions',{params:{customer:customer.id,status:'all',limit:20}});
    const active=(subs.data||[]).find(s=>ACTIVE_SUBSCRIPTION_STATUSES.has(s.status));
    if(active) return active;
  }
  return null;
}

module.exports=async function teamSeats(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json({error:'Method not allowed.'});
  }
  const token=bearerFrom(req);
  if(!token) return res.status(401).json({error:'Please sign in again.'});
  const extraSeats=Math.max(0,Math.min(200,Number.parseInt(req.body?.extra_seats,10)||0));
  const secretKey=process.env.STRIPE_SECRET_KEY;
  if(!secretKey) return res.status(500).json({error:'Stripe is not configured yet.'});
  if(secretKey.startsWith('sk_test_')) return res.status(400).json({error:'Extra-seat billing is configured for live mode only.'});

  try{
    const rows=await supabaseRpc(token,'hvacflow_company_subscription_identity');
    const identity=Array.isArray(rows)?rows[0]:rows;
    if(!identity?.company_id) return res.status(400).json({error:'No company workspace is linked to this account.'});
    if(identity.member_role!=='owner') return res.status(403).json({error:'Only the account owner can change paid seat capacity.'});

    const subscription=await findSubscription(secretKey,String(identity.owner_email||'').toLowerCase());
    if(!subscription) return res.status(403).json({error:'An active HVACFlow subscription is required.'});
    const businessItem=(subscription.items?.data||[]).find(i=>BUSINESS_PRICE_IDS.has(i.price?.id));
    if(!businessItem) return res.status(400).json({error:'Additional seats are available on the Business plan.'});
    const seatItem=(subscription.items?.data||[]).find(i=>i.price?.id===EXTRA_SEAT_PRICE_ID);

    if(extraSeats===0 && seatItem){
      await stripeRequest(secretKey,`subscription_items/${seatItem.id}`,{method:'DELETE',params:{proration_behavior:'create_prorations'}});
    }else if(extraSeats>0 && seatItem){
      await stripeRequest(secretKey,`subscription_items/${seatItem.id}`,{method:'POST',params:{quantity:extraSeats,proration_behavior:'create_prorations'}});
    }else if(extraSeats>0){
      await stripeRequest(secretKey,'subscription_items',{method:'POST',params:{subscription:subscription.id,price:EXTRA_SEAT_PRICE_ID,quantity:extraSeats,proration_behavior:'create_prorations'}});
    }

    await patchCompany(token,identity.company_id,{subscription_plan:'business',included_user_limit:15,extra_user_limit:extraSeats});
    return res.status(200).json({ok:true,extra_seats:extraSeats,total_seats:15+extraSeats,monthly_extra_cost:extraSeats*8});
  }catch(error){
    console.error('Team seat update failed',error.message);
    return res.status(400).json({error:error.message||'Seat capacity could not be updated.'});
  }
};
