import { makeId, sleep } from './utils.mjs';

export class SimulatorAdapter {
  constructor() {
    this.mode = 'simulator';
  }

  async execute(action, caseState) {
    await sleep(8);
    if (action.tool === 'create_payment_link') {
      const linkId = makeId('plink');
      return {
        provider: 'simulator',
        externalId: linkId,
        url: `https://rzp.io/i/${linkId.slice(-10)}`,
        status: 'created',
        amount: action.arguments.amount,
        expiresAt: action.arguments.expires_at
      };
    }
    if (action.tool === 'issue_refund') {
      return {
        provider: 'simulator',
        externalId: makeId('rfnd'),
        status: 'processed',
        paymentId: caseState.payment_id,
        amount: action.arguments.amount,
        recipient: action.arguments.recipient
      };
    }
    if (action.tool === 'send_customer_message') {
      return {
        provider: 'simulator',
        externalId: makeId('msg'),
        status: 'sent',
        channel: action.arguments.channel || 'whatsapp',
        preview: String(action.arguments.message).slice(0, 120)
      };
    }
    throw new Error(`No adapter registered for tool: ${action.tool}`);
  }
}

export class RazorpayTestAdapter extends SimulatorAdapter {
  constructor({ keyId, keySecret }) {
    super();
    this.mode = 'razorpay_test';
    this.keyId = keyId;
    this.keySecret = keySecret;
    if (!keyId?.startsWith('rzp_test_') || !keySecret) {
      throw new Error('Razorpay test credentials are missing or are not test-mode credentials.');
    }
  }

  async execute(action, caseState) {
    if (action.tool !== 'create_payment_link') {
      const simulated = await super.execute(action, caseState);
      return { ...simulated, provider: 'simulator', note: 'Only Payment Links are enabled for the bounded test-mode adapter.' };
    }

    const expiresAt = Math.floor(Date.parse(action.arguments.expires_at) / 1000);
    const credentials = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    const response = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        amount: Math.round(Number(action.arguments.amount) * 100),
        currency: caseState.currency,
        accept_partial: false,
        expire_by: expiresAt,
        reference_id: `agentproof_${caseState.order_id}`.slice(0, 40),
        description: `Recovery for ${caseState.order_id}`,
        customer: { name: caseState.customer_name },
        notes: { agentproof_case_id: caseState.id }
      }),
      signal: AbortSignal.timeout(12000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`Razorpay test API rejected the link (${response.status}): ${data.error?.description || 'unknown error'}`);
    }
    return {
      provider: 'razorpay_test',
      externalId: data.id,
      url: data.short_url,
      status: data.status,
      amount: Number(data.amount) / 100,
      expiresAt: new Date(Number(data.expire_by) * 1000).toISOString()
    };
  }
}

export function createPaymentAdapter() {
  if (process.env.PAYMENT_ADAPTER === 'razorpay_test') {
    return new RazorpayTestAdapter({
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET
    });
  }
  return new SimulatorAdapter();
}
