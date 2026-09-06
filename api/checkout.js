const PRICE_IDS = {
  starter: 'price_1UClfwRzvI2im2M050ltFOac',
  professional: 'price_1UClfxRzvI2im2M0iFYPmAsi',
  business: 'price_1UClfyRzvI2im2M02XxWncbd',
};

module.exports = async function checkout(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: 'Stripe is not configured yet.' });
  }

  const { plan, email, userId } = req.body || {};
  const price = PRICE_IDS[plan];
  if (!price) {
    return res.status(400).json({ error: 'Choose a valid HVACFlow plan.' });
  }

  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('line_items[0][price]', price);
  params.set('line_items[0][quantity]', '1');
  params.set('success_url', `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  params.set('cancel_url', `${origin}/?checkout=cancelled`);
  params.set('allow_promotion_codes', 'true');
  params.set('integration_identifier', 'hvacflow_checkout_qxnrptaz');
  if (email) params.set('customer_email', String(email).slice(0, 254));
  if (userId) params.set('client_reference_id', String(userId).slice(0, 200));
  params.set('metadata[plan]', plan);
  if (userId) params.set('metadata[supabase_user_id]', String(userId).slice(0, 500));

  try {
    const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
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
