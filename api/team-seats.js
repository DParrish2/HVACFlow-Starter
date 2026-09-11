const SUPABASE_URL = 'https://ynavufmatbvqyzwmgxnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fSTVOqQUUXq1kOuZHYJdBg_qh4JtJPQ';
const EXTRA_SEAT_PRICE_ID = 'price_1UEQxXRzvI2im2M0FROnmKZn';
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active','trialing']);
const PLAN_BY_PRICE = {
  price_1UEdXZRzvI2im2M0SgEbVpRS:'starter',
  price_1UEdboRzvI2im2M0NqEktGrG:'professional',
  price_1UEdb0RzvI2im2M0srFI6gfc:'business',
  price_1UClfwRzvI2im2M050ltFOac:'starter',
  price_1UClfxRzvI2im2M0iFYPmAsi:'professional',
  price_1UClfyRzvI2im2M02XxWncbd:'business',
  price_1UDDxbRzvI2im2M0R8H80jXs:'starter',
  price_1UDDxcRzvI2im2M0uGGDCipB:'professional',
  price_1UDDxdRzvI2im2M0orTHwQLN:'business',
};
const PLAN_LIMITS={starter:1,professional:5,business:15};
const MAX_EXTRA_SEATS={starter:3,professional:4,business:200};

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

function basePlanFromSubscription(subscription){
  for(const item of subscription.items?.data||[]){
    const plan=PLAN_BY_PRICE[item.price?.id];
    if(plan) return plan;
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
  const requested=Number.parseInt(req.body?.extra_seats,10);
  if(!Number.isInteger(requested)||requested<0) return res.status(400).json({error:'Enter a valid number of extra seats.'});
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
    const plan=basePlanFromSubscription(subscription);
    if(!plan) return res.status(400).json({error:'The active HVACFlow plan could not be identified.'});

    const maxExtra=MAX_EXTRA_SEATS[plan];
    if(requested>maxExtra){
      if(plan==='starter') return res.status(400).json({error:'Starter supports up to 4 total users. Upgrade to Professional for 5 or more users.'});
      if(plan==='professional') return res.status(400).json({error:'Professional supports up to 9 total users. Upgrade to Business at 10 users for the same monthly price and 15 included users.'});
      return res.status(400).json({error:'The requested seat quantity is too high.'});
    }

    const seatItem=(subscription.items?.data||[]).find(i=>i.price?.id===EXTRA_SEAT_PRICE_ID);
    if(requested===0 && seatItem){
      await stripeRequest(secretKey,`subscription_items/${seatItem.id}`,{method:'DELETE',params:{proration_behavior:'create_prorations'}});
    }else if(requested>0 && seatItem){
      await stripeRequest(secretKey,`subscription_items/${seatItem.id}`,{method:'POST',params:{quantity:requested,proration_behavior:'create_prorations'}});
    }else if(requested>0){
      await stripeRequest(secretKey,'subscription_items',{method:'POST',params:{subscription:subscription.id,price:EXTRA_SEAT_PRICE_ID,quantity:requested,proration_behavior:'create_prorations'}});
    }

    const included=PLAN_LIMITS[plan];
    await patchCompany(token,identity.company_id,{subscription_plan:plan,included_user_limit:included,extra_user_limit:requested});
    return res.status(200).json({
      ok:true,
      plan,
      included_seats:included,
      extra_seats:requested,
      total_seats:included+requested,
      monthly_extra_cost:requested*8,
      upgrade_recommended:(plan==='starter'&&included+requested>=4)?'professional':(plan==='professional'&&included+requested>=9)?'business':null,
    });
  }catch(error){
    console.error('Team seat update failed',error.message);
    return res.status(400).json({error:error.message||'Seat capacity could not be updated.'});
  }
};
