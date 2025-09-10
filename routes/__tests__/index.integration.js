const supertest = require('supertest');
const app = require('../../app');

process.env.USE_STRIPE = 'true';
process.env.STRIPE_SECRET_KEY =
  process.env.STRIPE_SECRET_KEY || 'sk_test_mock_key';
process.env.STRIPE_PUBLISHABLE_KEY =
  process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_mock_key';
process.env.STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_secret';

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockImplementation((params) => {
        const amount = params.amount;

        if (amount < 0 || isNaN(amount)) {
          return Promise.reject(new Error('Invalid amount'));
        }

        return Promise.resolve({
          id: 'pi_test_' + Date.now(),
          amount: amount,
          currency: params.currency || 'usd',
          status: 'requires_payment_method',
          client_secret: 'pi_test_secret_' + Date.now(),
          created: Math.floor(Date.now() / 1000),
        });
      }),
      retrieve: jest.fn().mockImplementation((id) => {
        if (id === 'pi_test_succeeded' || id.startsWith('pi_test_success')) {
          return Promise.resolve({
            id: id,
            amount: 10000,
            currency: 'usd',
            status: 'succeeded',
            created: Math.floor(Date.now() / 1000),
            charges: {
              data: [
                {
                  payment_method_details: {
                    card: {
                      brand: 'visa',
                      last4: '4242',
                      exp_month: 12,
                      exp_year: 2025,
                    },
                  },
                },
              ],
            },
          });
        }
        if (id === 'pi_test_failed' || id === 'pi_declined_test') {
          return Promise.resolve({
            id: id,
            amount: 5000,
            currency: 'usd',
            status: 'canceled',
            cancellation_reason: 'failed',
            created: Math.floor(Date.now() / 1000),
          });
        }
        if (id === 'pi_insufficient_funds') {
          return Promise.reject(new Error('Your card has insufficient funds.'));
        }
        if (id === 'pi_3ds_required') {
          return Promise.resolve({
            id: id,
            amount: 5000,
            currency: 'usd',
            status: 'requires_action',
            client_secret: id + '_secret',
            next_action: {
              type: 'use_stripe_sdk',
            },
          });
        }
        if (id === 'pi_3ds2_required') {
          return Promise.resolve({
            id: id,
            amount: 10000,
            currency: 'usd',
            status: 'requires_action',
            client_secret: id + '_secret',
            next_action: {
              type: 'use_stripe_sdk',
              use_stripe_sdk: {
                type: 'three_d_secure_redirect',
              },
            },
          });
        }
        if (id === 'pi_paypal_test' || id === 'pi_paypal_cancelled') {
          return Promise.resolve({
            id: id,
            amount: 2500,
            currency: 'usd',
            status: id === 'pi_paypal_test' ? 'succeeded' : 'canceled',
            payment_method_types: ['card', 'paypal'],
          });
        }
        return Promise.resolve({
          id: id,
          amount: 1000,
          currency: 'usd',
          status: 'requires_payment_method',
        });
      }),
      confirm: jest.fn().mockImplementation((id) => {
        return Promise.resolve({
          id: id,
          status: 'succeeded',
          amount: 5000,
        });
      }),
      cancel: jest.fn().mockImplementation((id) => {
        return Promise.resolve({
          id: id,
          status: 'canceled',
        });
      }),
    },
    customers: {
      create: jest.fn().mockResolvedValue({
        id: 'cus_test_123',
        email: 'test@example.com',
      }),
      update: jest.fn().mockResolvedValue({
        id: 'cus_test_123',
        invoice_settings: {
          default_payment_method: 'pm_test_123',
        },
      }),
    },
    paymentMethods: {
      attach: jest.fn().mockResolvedValue({
        id: 'pm_test_123',
        customer: 'cus_test_123',
      }),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test_123',
          url: 'https://checkout.stripe.com/test',
        }),
      },
    },
    refunds: {
      create: jest.fn().mockResolvedValue({
        id: 'ref_test_123',
        amount: 1000,
        status: 'succeeded',
      }),
      list: jest.fn().mockResolvedValue({
        data: [
          {
            id: 'ref_test_123',
            amount: 1000,
          },
        ],
      }),
    },
    webhookEndpoints: {
      create: jest.fn(),
      list: jest.fn().mockResolvedValue({ data: [] }),
    },
    webhooks: {
      constructEvent: jest.fn().mockImplementation((payload, sig) => {
        if (!sig || sig === 'invalid_signature' || !sig.includes('t=')) {
          throw new Error('Invalid signature');
        }
        return payload;
      }),
    },
  }));
});

const { get, post } = supertest(app);

const TEST_CARDS = {
  SUCCESS: '4242424242424242',
  DECLINE: '4000000000000002',
  INSUFFICIENT_FUNDS: '4000000000009995',
  REQUIRE_3DS: '4000002500003155',
  REQUIRE_3DS2: '4000000000003220',
  PAYPAL_TEST: 'paypal_test_account',
};

describe('Stripe payment integration tests', () => {
  describe('index page', () => {
    it('redirects to the checkouts new page', () =>
      get('/').then(({ header }) => {
        expect(header.location).toBe('/checkouts/new');
      }));
  });

  describe('Checkouts new page', () => {
    it('responds with 200', () =>
      get('/checkouts/new').then(({ status }) => {
        expect(status).toBe(200);
      }));

    it('includes Stripe elements', () =>
      get('/checkouts/new').then(({ text }) => {
        expect(text).toMatch(/stripe-payment-wrapper/);
        expect(text).toMatch(/<script src="https:\/\/js.stripe.com\/v3\//);
      }));
  });

  describe('Payment Intent creation', () => {
    it('creates a payment intent via API', async () => {
      const response = await post('/api/create-payment-intent')
        .send({ amount: '50.00' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('clientSecret');
      expect(response.body.clientSecret).toMatch(/^pi_test/);
    });

    it('handles invalid amount in payment intent', async () => {
      const response = await post('/api/create-payment-intent')
        .send({ amount: 'invalid' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });
  });

  describe('Checkouts with Stripe test cards', () => {
    it('processes successful payment with test card', async () => {
      const response = await post('/checkouts').send({
        amount: '10.00',
        payment_intent_id: 'pi_test_success',
        payment_method_type: 'card',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/\/checkouts\/pi_test_success/);
    });

    it('handles declined card properly', async () => {
      const response = await post('/checkouts').send({
        amount: '10.00',
        payment_intent_id: 'pi_declined_test',
        payment_method_type: 'card',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('checkouts/new');
    });

    it('handles missing payment intent ID', async () => {
      const response = await post('/checkouts').send({
        amount: '10.00',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('checkouts/new');
    });
  });

  describe('3D Secure authentication tests', () => {
    it('handles 3D Secure required card', async () => {
      const response = await post('/checkouts').send({
        amount: '50.00',
        payment_intent_id: 'pi_3ds_required',
        payment_method_type: 'card',
        test_card: TEST_CARDS.REQUIRE_3DS,
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/checkouts/);
    });

    it('handles 3D Secure 2 authentication', async () => {
      const response = await post('/checkouts').send({
        amount: '100.00',
        payment_intent_id: 'pi_3ds2_required',
        payment_method_type: 'card',
        test_card: TEST_CARDS.REQUIRE_3DS2,
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/checkouts/);
    });
  });

  describe('PayPal integration tests', () => {
    it('handles PayPal payment completion', async () => {
      const response = await get('/checkouts/complete').query({
        payment_intent: 'pi_paypal_test',
        redirect_status: 'succeeded',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toMatch(/\/checkouts\/pi_paypal_test/);
    });

    it('handles PayPal payment cancellation', async () => {
      const response = await get('/checkouts/complete').query({
        payment_intent: 'pi_paypal_cancelled',
        redirect_status: 'cancelled',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/checkouts/new');
    });
  });

  describe('Checkouts show page with Stripe', () => {
    it('displays transaction details for successful payment', async () => {
      const response = await get('/checkouts/pi_test_succeeded');

      expect(response.status).toBe(200);
      expect(response.text).toMatch(/Sweet Success!/);
      expect(response.text).toMatch(/100\.00/);
    });

    it('displays appropriate message for failed payment', async () => {
      const response = await get('/checkouts/pi_test_failed');

      expect(response.status).toBe(200);
      expect(response.text).toMatch(/Transaction Failed/);
    });
  });

  describe('Webhook handling', () => {
    it('processes Stripe webhook events', async () => {
      const mockWebhookPayload = JSON.stringify({
        id: 'evt_test',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_webhook_test',
            amount: 5000,
            currency: 'usd',
            status: 'succeeded',
          },
        },
      });

      const mockSignature = 't=' + Date.now() + ',v1=mock_signature';

      const response = await post('/stripe/webhooks')
        .send(mockWebhookPayload)
        .set('stripe-signature', mockSignature)
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
    });

    it('rejects invalid webhook signatures', async () => {
      const response = await post('/stripe/webhooks')
        .send({ fake: 'data' })
        .set('stripe-signature', 'invalid_signature')
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
    });
  });

  describe('Error handling', () => {
    it('handles invalid amount format', async () => {
      const response = await post('/checkouts').send({
        amount: 'not_a_number',
        payment_intent_id: 'pi_test',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('checkouts/new');
    });

    it('handles insufficient funds error', async () => {
      const response = await post('/checkouts').send({
        amount: '10.00',
        payment_intent_id: 'pi_insufficient_funds',
      });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('checkouts/new');
    });
  });

  describe('Stripe response format assertions', () => {
    it('returns correct Stripe payment intent format', async () => {
      const response = await post('/api/create-payment-intent')
        .send({ amount: '42.00' })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('clientSecret');
      expect(response.body).toHaveProperty('paymentIntentId');
      expect(response.body.paymentIntentId).toMatch(/^pi_test/);
    });

    it('includes proper error format for Stripe errors', async () => {
      const response = await post('/api/create-payment-intent')
        .send({ amount: -10 })
        .set('Content-Type', 'application/json');

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(typeof response.body.error).toBe('string');
    });
  });
});
