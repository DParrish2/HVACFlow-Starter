const SUPABASE_URL='https://ynavufmatbvqyzwmgxnb.supabase.co';
const SUPABASE_KEY='sb_publishable_fSTVOqQUUXq1kOuZHYJdBg_qh4JtJPQ';
const BUSINESS_PRICE_ID='price_1UEdb0RzvI2im2M0srFI6gfc';
const EXTRA_SEAT_PRICE_ID='price_1UEQxXRzvI2im2M0FROnmKZn';

function bearerFrom(req){const auth=String(req.headers.authorization||'');return auth.startsWith('Bearer ')?auth.slice(7).trim():null;}
async function getUser(req){const token=bearerFrom(req);if(!token)return null;const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`}});return r.ok?r.json():null;}
async function getIdentity(req){const token=bearerFrom(req);if(!token)return null;const r=await fetch(`${SUPABASE_URL}/rest/v1/rpc/hvacflow_company_subscription_identity`,{method:'POST',headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:'{}'});if(!r.ok)return null;const rows=await r.json();return Array.isArray(rows)?rows[0]||null:rows;}
async function stripeGet(secretKey,path,query={}){const url=new URL(`https://api.stripe.com/v1/${path}`);Object.entries(query).forEach(([k,v])=>{if(v!==undefined&&v!==null&&v!=='')url.searchParams.set(k,String(v));});const r=await fetch(url,{headers:{Authorization:`Bearer ${secretKey}`}});const data=await r.json();if(!r.ok)throw new Error(data.error?.message||'Stripe request failed.');return data;}
async function findCustomer(secretKey,email){const customers=await stripeGet(secretKey,'customers',{email,limit:10});return (customers.data||[])[0]||null;}

module.exports=async function businessPlusCheckout(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json({error:'Method not allowed.'});}
  const secretKey=process.env.STRIPE_SECRET_KEY;
  if(!secretKey)return res.status(500).json({error:'Stripe is not configured yet.'});
  if(secretKey.startsWith('sk_test_'))return res.status(400).json({error:'Business Plus checkout is available in live mode only.'});
  let user,identity;
  try{user=await getUser(req);identity=await getIdentity(req);}catch(error){return res.status(503).json({error:'Account verification is temporarily unavailable.'});}
  if(!user?.id||!user?.email)return res.status(401).json({error:'Please sign in again.'});
  if(identity?.member_role&&identity.member_role!=='owner')return res.status(403).json({error:'Only the account owner can change the company subscription.'});
  const origin=`https://${req.headers['x-forwarded-host']||req.headers.host}`;
  const billingEmail=String(identity?.owner_email||user.email).toLowerCase();
  let customer=null;
  try{customer=await findCustomer(secretKey,billingEmail);}catch(_e){}
  const p=new URLSearchParams();
  p.set('mode','subscription');
  p.set('line_items[0][price]',BUSINESS_PRICE_ID);
  p.set('line_items[0][quantity]','1');
  p.set('line_items[1][price]',EXTRA_SEAT_PRICE_ID);
  p.set('line_items[1][quantity]','1');
  p.set('success_url',`${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  p.set('cancel_url',`${origin}/?checkout=cancelled`);
  p.set('allow_promotion_codes','true');
  p.set('billing_address_collection','required');
  p.set('automatic_tax[enabled]','true');
  p.set('metadata[plan]','business_plus');
  p.set('metadata[supabase_user_id]',String(user.id).slice(0,500));
  if(identity?.company_id){p.set('metadata[company_id]',String(identity.company_id).slice(0,500));p.set('client_reference_id',String(identity.company_id).slice(0,200));}else p.set('client_reference_id',String(user.id).slice(0,200));
  if(customer?.id){p.set('customer',customer.id);p.set('customer_update[address]','auto');p.set('customer_update[name]','auto');}else p.set('customer_email',billingEmail);
  try{
    const r=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:`Bearer ${secretKey}`,'Content-Type':'application/x-www-form-urlencoded'},body:p});
    const data=await r.json();
    if(!r.ok)return res.status(502).json({error:data.error?.message||'Stripe checkout is temporarily unavailable.'});
    return res.status(200).json({url:data.url});
  }catch(error){return res.status(500).json({error:'Checkout could not be started.'});}
};
