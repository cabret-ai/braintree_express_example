const supertest = require('supertest');

process.env.USE_STRIPE = 'true';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_mock';
process.env.STRIPE_PUBLISHABLE_KEY =
  process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_mock';
process.env.STRIPE_WEBHOOK_SECRET =
  process.env.STRIPE_WEBHOOK_SECRET || 'whsec_test_mock';

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn().mockResolvedValue({
        id: 'pi_test_integration',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
        client_secret: 'pi_test_integration_secret',
        created: Math.floor(Date.now() / 1000),
      }),
      retrieve: jest.fn().mockImplementation((id) => {
        if (id === 'pi_test_succeeded') {
          return Promise.resolve({
            id: 'pi_test_succeeded',
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
                    },
                  },
                },
              ],
            },
          });
        }
        if (id === 'pi_test_failed') {
          return Promise.resolve({
            id: 'pi_test_failed',
            amount: 5000,
            currency: 'usd',
            status: 'canceled',
            created: Math.floor(Date.now() / 1000),
          });
        }

        return Promise.reject(new Error('Payment intent not found'));
      }),
      confirm: jest.fn().mockResolvedValue({
        id: 'pi_test_confirmed',
        status: 'processing',
      }),
    },
    checkout: {
      sessions: {
        create: jest.fn().mockResolvedValue({
          id: 'cs_test_integration',
          url: 'https://checkout.stripe.com/test',
        }),
        retrieve: jest.fn().mockResolvedValue({
          id: 'cs_test_integration',
          payment_status: 'paid',
        }),
      },
    },
    webhooks: {
      constructEvent: jest.fn().mockImplementation((payload, sig) => {
        if (sig === 'invalid_signature' || !sig || !sig.includes('t=')) {
          throw new Error('Invalid signature');
        }

        return {
          id: 'evt_test_webhook',
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test_webhook',
              amount: 5000,
              status: 'succeeded',
            },
          },
        };
      }),
    },
    customers: {
      create: jest.fn().mockResolvedValue({
        id: 'cus_test_integration',
        email: 'test@example.com',
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 'cus_test_integration',
        email: 'test@example.com',
      }),
      update: jest.fn().mockResolvedValue({
        id: 'cus_test_integration',
        email: 'updated@example.com',
      }),
    },
    paymentMethods: {
      attach: jest.fn().mockResolvedValue({
        id: 'pm_test_attached',
        customer: 'cus_test_integration',
      }),
      list: jest.fn().mockResolvedValue({
        data: [
          { id: 'pm_test_1', type: 'card' },
          { id: 'pm_test_2', type: 'card' },
        ],
      }),
      detach: jest.fn().mockResolvedValue({
        id: 'pm_test_detached',
        customer: null,
      }),
    },
    refunds: {
      create: jest.fn().mockResolvedValue({
        id: 're_test_integration',
        amount: 2500,
        status: 'succeeded',
      }),
      retrieve: jest.fn().mockResolvedValue({
        id: 're_test_integration',
        amount: 2500,
        status: 'succeeded',
      }),
      list: jest.fn().mockResolvedValue({
        data: [
          { id: 're_test_1', amount: 1000 },
          { id: 're_test_2', amount: 2000 },
        ],
      }),
      update: jest.fn().mockResolvedValue({
        id: 're_test_integration',
        metadata: { updated: 'true' },
      }),
    },
  }));
});

const app = require('../../app');
const stripeGateway = require('../../lib/stripe-gateway');
const { get, post } = supertest(app);

describe('Stripe integration tests', () => {
  beforeAll(() => {
    process.env.USE_STRIPE = 'true';
  });

  afterAll(() => {
    delete process.env.USE_STRIPE;
  });

  describe('Checkout flow with Stripe', () => {
    describe('GET /checkouts/new', () => {
      it('should render checkout page with Stripe publishable key', async () => {
        const response = await get('/checkouts/new');

        expect(response.status).toBe(200);
        expect(response.text).toContain('pk_test_mock');
      });
    });

    describe('POST /api/create-payment-intent', () => {
      it('should create a payment intent', async () => {
        const response = await post('/api/create-payment-intent')
          .send({ amount: 50.0 })
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('clientSecret');
        expect(response.body).toHaveProperty('paymentIntentId');
        expect(response.body.paymentIntentId).toBe('pi_test_integration');
      });

      it('should handle errors when creating payment intent', async () => {
        const mockCreate = stripeGateway.stripe.paymentIntents.create;

        mockCreate.mockRejectedValueOnce(new Error('Insufficient funds'));

        const response = await post('/api/create-payment-intent')
          .send({ amount: 50.0 })
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Payment intent creation failed');
      });
    });

    describe('GET /checkouts/complete', () => {
      it('should handle successful payment redirect', async () => {
        const response = await get('/checkouts/complete').query({
          payment_intent: 'pi_test_succeeded',
          redirect_status: 'succeeded',
        });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/checkouts/pi_test_succeeded');
      });

      it('should handle failed payment redirect', async () => {
        const response = await get('/checkouts/complete').query({
          payment_intent: 'pi_test_failed',
          redirect_status: 'failed',
        });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/checkouts/new');
      });
    });

    describe('GET /checkouts/:id', () => {
      it('should display successful Stripe payment', async () => {
        const response = await get('/checkouts/pi_test_succeeded');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Sweet Success!');
        expect(response.text).toContain('100.00');
      });

      it('should display failed Stripe payment', async () => {
        const response = await get('/checkouts/pi_test_failed');

        expect(response.status).toBe(200);
        expect(response.text).toContain('Transaction Failed');
        expect(response.text).toContain('Voided');
      });

      it('should handle non-existent payment intent', async () => {
        const response = await get('/checkouts/pi_nonexistent');

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/checkouts/new');
      });
    });

    describe('POST /checkouts', () => {
      it('should process Stripe payment confirmation', async () => {
        const mockRetrieve = stripeGateway.stripe.paymentIntents.retrieve;

        mockRetrieve.mockResolvedValueOnce({
          id: 'pi_test_checkout',
          status: 'succeeded',
          amount: 5000,
          currency: 'usd',
          created: Math.floor(Date.now() / 1000),
        });

        const response = await post('/checkouts').send({
          payment_intent_id: 'pi_test_checkout',
        });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/checkouts/pi_test_checkout');
      });

      it('should handle payment requiring action', async () => {
        const mockRetrieve = stripeGateway.stripe.paymentIntents.retrieve;

        mockRetrieve.mockResolvedValueOnce({
          id: 'pi_test_action',
          status: 'requires_action',
        });

        const response = await post('/checkouts').send({
          payment_intent_id: 'pi_test_action',
        });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('checkouts/new');
      });

      it('should handle missing payment intent ID', async () => {
        const response = await post('/checkouts').send({});

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('checkouts/new');
      });
    });
  });

  describe('Webhook endpoint', () => {
    describe('POST /stripe/webhooks', () => {
      it('should handle valid webhook events', async () => {
        const response = await post('/stripe/webhooks')
          .send({
            id: 'evt_test',
            type: 'payment_intent.succeeded',
            data: {
              object: {
                id: 'pi_webhook_test',
                amount: 5000,
              },
            },
          })
          .set('stripe-signature', 't=1234567890,v1=valid_signature')
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ received: true });
      });

      it('should reject invalid webhook signatures', async () => {
        const response = await post('/stripe/webhooks')
          .send({
            id: 'evt_test',
            type: 'payment_intent.succeeded',
          })
          .set('stripe-signature', 'invalid_signature')
          .set('Content-Type', 'application/json');

        expect(response.status).toBe(400);
        expect(response.text).toContain(
          'Webhook signature verification failed'
        );
      });

      it('should handle missing webhook secret', async () => {
        const originalSecret = process.env.STRIPE_WEBHOOK_SECRET;

        delete process.env.STRIPE_WEBHOOK_SECRET;

        const response = await post('/stripe/webhooks')
          .send({})
          .set('stripe-signature', 'any_signature');

        expect(response.status).toBe(500);
        expect(response.text).toBe('Webhook secret not configured');

        process.env.STRIPE_WEBHOOK_SECRET = originalSecret;
      });

      it('should handle different event types', async () => {
        const eventTypes = [
          'payment_intent.payment_failed',
          'payment_method.attached',
          'customer.created',
          'charge.refunded',
        ];

        for (const eventType of eventTypes) {
          const mockConstruct = stripeGateway.stripe.webhooks.constructEvent;

          mockConstruct.mockReturnValueOnce({
            id: `evt_${eventType}`,
            type: eventType,
            data: {
              object: {
                id: `obj_${eventType}`,
              },
            },
          });

          const response = await post('/stripe/webhooks')
            .send({ type: eventType })
            .set('stripe-signature', 'valid_signature')
            .set('Content-Type', 'application/json');

          expect(response.status).toBe(200);
          expect(response.body).toEqual({ received: true });
        }
      });
    });
  });

  describe('Stripe gateway functions', () => {
    it('should create customers', async () => {
      const customer = await stripeGateway.createCustomer(
        'test@example.com',
        'Test User'
      );

      expect(customer.id).toBe('cus_test_integration');
      expect(customer.email).toBe('test@example.com');
    });

    it('should handle payment methods', async () => {
      const attached = await stripeGateway.attachPaymentMethod(
        'pm_test',
        'cus_test'
      );

      expect(attached.id).toBe('pm_test_attached');

      const methods = await stripeGateway.listPaymentMethods('cus_test');

      expect(methods).toHaveLength(2);

      const detached = await stripeGateway.detachPaymentMethod('pm_test');

      expect(detached.customer).toBeNull();
    });

    it('should process refunds', async () => {
      const refund = await stripeGateway.createRefund('pi_test', 25);

      expect(refund.id).toBe('re_test_integration');
      expect(refund.amount).toBe(2500);

      const retrieved = await stripeGateway.retrieveRefund(
        're_test_integration'
      );

      expect(retrieved.status).toBe('succeeded');

      const refunds = await stripeGateway.listRefunds();

      expect(refunds).toHaveLength(2);
    });

    it('should provide Braintree compatibility', async () => {
      const clientToken = await stripeGateway.clientToken.generate();

      expect(clientToken.clientToken).toBe('pk_test_mock');

      const sale = await stripeGateway.transaction.sale({
        amount: 50.0,
        paymentMethodNonce: 'test_nonce',
      });

      expect(sale.success).toBe(true);
      expect(sale.transaction.id).toBe('pi_test_integration');

      const transaction = await stripeGateway.transaction.find(
        'pi_test_succeeded'
      );

      expect(transaction.status).toBe('Settled');
      expect(transaction.amount).toBe('100.00');
    });
  });
});
