const SUPABASE_URL = 'https://ynavufmatbvqyzwmgxnb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_fSTVOqQUUXq1kOuZHYJdBg_qh4JtJPQ';
const ACTIVE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing']);
const TEST_ACCOUNT_EMAILS = new Set(['david.parrish@libertyenergy.com','shedtoshelf@gmail.com']);
const EXTRA_SEAT_PRICE_ID = 'price_1UEQxXRzvI2im2M0FROnmKZn';

const PLAN_BY_PRICE = {
  price_1UEdXZRzvI2im2M0SgEbVpRS: 'starter',
  price_1UEdboRzvI2im2M0NqEktGrG: 'professional',
  price_1UEdb0RzvI2im2M0srFI6gfc: 'business',
  price_1UClfwRzvI2im2M050ltFOac: 'starter',
  price_1UClfxRzvI2im2M0iFYPmAsi: 'professional',
  price_1UClfyRzvI2im2M02XxWncbd: 'business',
  price_1UDDxbRzvI2im2M0R8H80jXs: 'starter',
  price_1UDDxcRzvI2im2M0uGGDCipB: 'professional',
  price_1UDDxdRzvI2im2M0orTHwQLN: 'business',
};

function bearerFrom(req) {
  const auth = String(req.headers.authorization || '');
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.slice(7).trim();
  return token || null;
}

async function getAuthenticatedUser(req) {
  const token = bearerFrom(req);
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  return response.json();
}

async function getCompanyIdentity(req) {
  const token = bearerFrom(req);
  if (!token) return null;
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hvacflow_company_subscription_identity`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });
  if (!response.ok) return null;
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : rows;
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
  const customers = await stripeGet(secretKey, 'customers', { email, limit: 10 });
  for (const customer of customers.data || []) {
    const subscriptions = await stripeGet(secretKey, 'subscriptions', {
      customer: customer.id,
      status: 'all',
      limit: 20,
    });
    const active = (subscriptions.data || []).find(sub => ACTIVE_SUBSCRIPTION_STATUSES.has(sub.status));
    if (active) return active;
  }
  return null;
}

function subscriptionDetails(subscription) {
  const items = subscription?.items?.data || [];
  let plan = null;
  let extraSeats = 0;
  for (const item of items) {
    const id = item?.price?.id || '';
    if (id === EXTRA_SEAT_PRICE_ID) extraSeats = Number(item.quantity || 0);
    if (!plan && PLAN_BY_PRICE[id]) plan = PLAN_BY_PRICE[id];
  }
  return { plan, extraSeats };
}

module.exports = async function subscription(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let user;
  let identity;
  try {
    user = await getAuthenticatedUser(req);
    identity = await getCompanyIdentity(req);
  } catch (error) {
    console.error('Supabase account verification failed', error.message);
    return res.status(503).json({ error: 'Account verification is temporarily unavailable.' });
  }
  if (!user?.id || !user?.email) return res.status(401).json({ error: 'Please sign in again.' });

  const billingEmail = String(identity?.owner_email || user.email).toLowerCase();
  if (TEST_ACCOUNT_EMAILS.has(billingEmail)) {
    return res.status(200).json({
      active: true,
      status: 'test_account',
      plan: 'business',
      extra_seats: 0,
      test_account: true,
      company_id: identity?.company_id || null,
      member_role: identity?.member_role || null,
    });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) return res.status(500).json({ error: 'Stripe is not configured yet.' });

  try {
    const subscription = await findActiveSubscription(secretKey, billingEmail);
    if (!subscription) {
      return res.status(200).json({ active: false, status: 'inactive', plan: null, extra_seats: 0, company_id: identity?.company_id || null, member_role: identity?.member_role || null });
    }
    const details=subscriptionDetails(subscription);
    return res.status(200).json({
      active: true,
      status: subscription.status,
      plan: details.plan,
      extra_seats: details.extraSeats,
      current_period_end: subscription.current_period_end || null,
      company_id: identity?.company_id || null,
      member_role: identity?.member_role || null,
    });
  } catch (error) {
    console.error('Subscription lookup failed', error.message);
    return res.status(503).json({ error: 'Subscription verification is temporarily unavailable.' });
  }
};
