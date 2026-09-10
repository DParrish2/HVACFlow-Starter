const LIVE_PRICE_IDS = {
  starter: 'price_1UClfwRzvI2im2M050ltFOac',
  professional: 'price_1UClfxRzvI2im2M0iFYPmAsi',
  business: 'price_1UClfyRzvI2im2M02XxWncbd',
};

const TEST_PRICE_IDS = {
  starter: 'price_1UDDxbRzvI2im2M0R8H80jXs',
  professional: 'price_1UDDxcRzvI2im2M0uGGDCipB',
  business: 'price_1UDDxdRzvI2im2M0orTHwQLN',
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

  const { type, plan, email, userId, customer, amount } = req.body || {};
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const params = new URLSearchParams();
  params.set('managed_payments[enabled]', 'false');

  if (type === 'customer_payment') {
    const amountCents = Math.round(Number(amount) * 100);
    if (!Number.isInteger(amountCents) || amountCents < 50 || amountCents > 99999999) {
      return res.status(400).json({ error: 'Enter a valid payment amount.' });
    }
    const customerName = String(customer || '').trim().slice(0, 120);
    if (!customerName) {
      return res.status(400).json({ error: 'Enter the customer name.' });
    }
    params.set('mode', 'payment');
    params.set('line_items[0][price_data][currency]', 'usd');
    params.set('line_items[0][price_data][unit_amount]', String(amountCents));
    params.set('line_items[0][price_data][product_data][name]', `HVAC service payment — ${customerName}`);
    params.set('line_items[0][quantity]', '1');
    params.set('success_url', `${origin}/?checkout=payment-success&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${origin}/?checkout=payment-cancelled`);
    params.set('metadata[payment_type]', 'customer_payment');
    params.set('metadata[customer_name]', customerName);
  } else {
    const priceIds = secretKey.startsWith('sk_test_') ? TEST_PRICE_IDS : LIVE_PRICE_IDS;
    const price = priceIds[plan];
    if (!price) {
      return res.status(400).json({ error: 'Choose a valid HVACFlow plan.' });
    }
    params.set('mode', 'subscription');
    params.set('line_items[0][price]', price);
    params.set('line_items[0][quantity]', '1');
    params.set('success_url', `${origin}/?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    params.set('cancel_url', `${origin}/?checkout=cancelled`);
    params.set('allow_promotion_codes', 'true');
    params.set('metadata[plan]', plan);
  }

  if (email) params.set('customer_email', String(email).trim().slice(0, 254));
  if (userId) {
    params.set('client_reference_id', String(userId).slice(0, 200));
    params.set('metadata[supabase_user_id]', String(userId).slice(0, 500));
  }

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
