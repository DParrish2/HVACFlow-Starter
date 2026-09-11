const LIVE_PRICE_IDS = {
  starter: 'price_1UEdXZRzvI2im2M0SgEbVpRS',
  professional: 'price_1UEdboRzvI2im2M0NqEktGrG',
  business: 'price_1UEdb0RzvI2im2M0srFI6gfc',
};

const TEST_PRICE_IDS = {
  starter: 'price_1UDDxbRzvI2im2M0R8H80jXs',
  professional: 'price_1UDDxcRzvI2im2M0uGGDCipB',
  business: 'price_1UDDxdRzvI2im2M0orTHwQLN',
};

const SUPABASE_URL = 'https://ynavufmatbvqyzwmgxnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fSTVOqQUUXq1kOuZHYJdBg_qh4JtJPQ';
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);

function bearerFrom(req){
  const auth=String(req.headers.authorization||'');
  if(!auth.startsWith('Bearer ')) return null;
  return auth.slice(7).trim()||null;
}

async function getAuthenticatedUser(req) {
  const token=bearerFrom(req);
  if(!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  return response.json();
}

async function getCompanyIdentity(req){
  const token=bearerFrom(req);
  if(!token) return null;
  const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/hvacflow_company_subscription_identity`,{
    method:'POST',
    headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
    body:'{}',
  });
  if(!response.ok) return null;
  const rows=await response.json();
  return Array.isArray(rows)?rows[0]||null:rows;
}

async function stripeGet(secretKey, path, query = {}) {
  const url = new URL(`https://api.stripe.com/v1/${path}`);
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  });
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Stripe request failed.');
  return data;
}

async function findActiveSubscription(secretKey, email) {
  if (!email) return null;
  const customers = await stripeGet(secretKey, 'customers', { email, limit: 10 });
  for (const customer of customers.data || []) {
    const subscriptions = await stripeGet(secretKey, 'subscriptions', { customer: customer.id, status: 'all', limit: 20 });
    const active = (subscriptions.data || []).find(sub => ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status));
    if (active) return active;
  }
  return null;
}

module.exports = async function checkout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Stripe is not configured yet.' });

  let user;
  let identity;
  try {
    user = await getAuthenticatedUser(req);
    identity = await getCompanyIdentity(req);
  } catch (error) {
    console.error('Supabase auth verification failed', error.message);
    return res.status(503).json({ error: 'Account verification is temporarily unavailable.' });
  }
  if (!user?.id || !user?.email) return res.status(401).json({ error: 'Please sign in again.' });

  const { type, plan, customer, email, amount } = req.body || {};
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const params = new URLSearchParams();
  params.set('managed_payments[enabled]', 'false');
  const billingEmail=String(identity?.owner_email||user.email).toLowerCase();

  if (type === 'customer_payment') {
    let subscription;
    try { subscription = await findActiveSubscription(secretKey, billingEmail); }
    catch (error) {
      console.error('Subscription verification failed', error.message);
      return res.status(503).json({ error: 'Subscription verification is temporarily unavailable.' });
    }
    if (!subscription) return res.status(403).json({ error: 'An active HVACFlow subscription is required.' });

    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isInteger(amountCents) || amountCents < 50 || amountCents > 99999999) return res.status(400).json({ error: 'Enter a valid payment amount.' });
    const customerName = String(customer || '').trim().slice(0, 120);
    if (!customerName) return res.status(400).json({ error: 'Enter the customer name.' });
    const customerEmail=String(email||'').trim().toLowerCase().slice(0,200);

    params.set('mode', 'payment');
    params.set('line_items[0][price_data][currency]', 'usd');
    params.set('line_items[0][price_data][unit_amount]', String(amountCents));
    params.set('line_items[0][price_data][product_data][name]', `HVAC service payment — ${customerName}`);
    params.set('line_items[0][quantity]', '1');
    params.set('success_url', `${origin}/?checkout=payment-success&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${origin}/?checkout=payment-cancelled`);
    params.set('metadata[payment_type]', 'customer_payment');
    params.set('metadata[customer_name]', customerName);
    if(identity?.company_id) params.set('metadata[company_id]',String(identity.company_id));
    if(customerEmail) params.set('customer_email',customerEmail);
  } else {
    if(identity?.member_role && identity.member_role!=='owner') return res.status(403).json({error:'Only the account owner can change the company subscription.'});
    const testMode = secretKey.startsWith('sk_test_');
    const priceIds = testMode ? TEST_PRICE_IDS : LIVE_PRICE_IDS;
    const price = priceIds[plan];
    if (!price) return res.status(400).json({ error: 'Choose a valid HVACFlow plan.' });

    params.set('mode', 'subscription');
    params.set('line_items[0][price]', price);
    params.set('line_items[0][quantity]', '1');
    params.set('success_url', `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${origin}/?checkout=cancelled`);
    params.set('allow_promotion_codes', 'true');
    params.set('metadata[plan]', plan);
    params.set('customer_email', user.email);
  }

  params.set('client_reference_id', String(identity?.company_id || user.id).slice(0, 200));
  params.set('metadata[supabase_user_id]', String(user.id).slice(0, 500));
  if(identity?.company_id) params.set('metadata[company_id]',String(identity.company_id).slice(0,500));

  try {
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const session = await stripeResponse.json();
    if (!stripeResponse.ok) {
      console.error('Stripe checkout error', session.error?.type, session.error?.code);
      return res.status(502).json({ error: 'Stripe checkout is temporarily unavailable.' });
    }
    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Checkout request failed', error.message);
    return res.status(500).json({ error: 'Checkout could not be started.' });
  }
};
