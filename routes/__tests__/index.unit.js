const supertest = require('supertest');

process.env.USE_STRIPE = 'true';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_mock_key';
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';

jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      confirm: jest.fn(),
    },
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
      list: jest.fn(),
    },
    paymentMethods: {
      attach: jest.fn(),
      detach: jest.fn(),
      list: jest.fn(),
    },
    refunds: {
      create: jest.fn(),
    },
    webhookEndpoints: {
      create: jest.fn(),
      list: jest.fn(),
    },
  }));
});

const app = require('../../app');
const stripeGateway = require('../../lib/stripe-gateway');

const { get, post } = supertest(app);

describe('Stripe demo routes', () => {
  describe('index', () => {
    it('redirects to the checkouts drop-in page', () =>
      get('/').then(({ header, statusCode }) => {
        expect(header.location).toBe('/checkouts/new');
        expect(statusCode).toBe(302);
      }));
  });

  describe('Checkouts new page', () => {
    it('responds with 200', () =>
      get('/checkouts/new').then(({ statusCode }) => {
        expect(statusCode).toBe(200);
      }));

    it('includes the Stripe publishable key', () =>
      get('/checkouts/new').then(({ text }) => {
        expect(text).toMatch(
          '<span hidden id="client-token">pk_test_mock_key</span>'
        );
      }));

    it('includes the checkout form', () =>
      get('/checkouts/new').then(({ text }) => {
        expect(text).toMatch(/<form id="payment-form"/);
      }));

    it('includes the Stripe payment element container', () =>
      get('/checkouts/new').then(({ text }) => {
        const hasCardElement = /<div id="card-element"/.test(text);
        const hasStripeErrors = /<div id="stripe-errors"/.test(text);

        expect(hasCardElement).toBe(true);
        expect(hasStripeErrors).toBe(true);
      }));

    it('includes the amount field', () =>
      get('/checkouts/new').then(({ text }) => {
        expect(text).toMatch(/<label for="amount/);
        expect(text).toMatch(
          /<input id="amount" name="amount" type="tel" min="1" value="10">/
        );
      }));
  });

  describe('Checkouts show page', () => {
    beforeEach(() => {
      stripeGateway.stripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_test_success',
        amount: 1000,
        currency: 'usd',
        status: 'succeeded',
        payment_method: 'pm_test_card',
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
    });

    it('respond with 200 for Stripe payment intent', async () => {
      const res = await get('/checkouts/pi_test_success');

      expect(res.statusCode).toBe(200);
    });

    it("displays the payment intent's fields", async () => {
      const res = await get('/checkouts/pi_test_success');

      expect(res.text).toMatch('pi_test_success');
      expect(res.text).toMatch('10.00');
      expect(res.text).toMatch('Settled');
      expect(res.text).toMatch('4242');
      expect(res.text).toMatch('visa');
    });

    it('displays a success page when payment succeeded', async () => {
      const res = await get('/checkouts/pi_test_success');

      expect(res.text).toMatch('Sweet Success!');
    });

    it('displays a failure page when payment failed', async () => {
      stripeGateway.stripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_test_failed',
        amount: 1000,
        currency: 'usd',
        status: 'canceled',
        payment_method: 'pm_test_card',
      });

      const res = await get('/checkouts/pi_test_failed');

      expect(res.text).toMatch('Transaction Failed');
      expect(res.text).toMatch('Your test transaction has a status of Voided');
    });
  });

  describe('Checkouts create', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('handles successful payment and redirects to checkout show', async () => {
      stripeGateway.stripe.paymentIntents.retrieve.mockResolvedValue({
        id: 'pi_test_success',
        status: 'succeeded',
      });

      const res = await post('/checkouts').send({
        payment_intent_id: 'pi_test_success',
      });

      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe('/checkouts/pi_test_success');
    });

    describe('when the payment is not successful', () => {
      it('redirects to new page when payment intent ID is missing', async () => {
        const res = await post('/checkouts').send({});

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('checkouts/new');
      });

      it('displays error for missing payment intent ID', async () => {
        const res = await post('/checkouts').send({});

        const req = get('/checkouts/new');
        const cookie = res.headers['set-cookie'];

        req.set('Cookie', cookie);

        const response = await req;

        expect(response.text).toMatch('Payment intent ID is required');
      });

      it('handles payment that requires additional action', async () => {
        stripeGateway.stripe.paymentIntents.retrieve.mockResolvedValue({
          id: 'pi_test_action',
          status: 'requires_action',
        });

        const res = await post('/checkouts').send({
          payment_intent_id: 'pi_test_action',
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('checkouts/new');
      });

      it('handles failed payment', async () => {
        stripeGateway.stripe.paymentIntents.retrieve.mockResolvedValue({
          id: 'pi_test_failed',
          status: 'canceled',
        });

        const res = await post('/checkouts').send({
          payment_intent_id: 'pi_test_failed',
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('checkouts/new');
      });

      it('handles Stripe API errors', async () => {
        stripeGateway.stripe.paymentIntents.retrieve.mockRejectedValue(
          new Error('Stripe API error')
        );

        const res = await post('/checkouts').send({
          payment_intent_id: 'pi_test_error',
        });

        expect(res.statusCode).toBe(302);
        expect(res.headers.location).toBe('checkouts/new');
      });
    });
  });

  describe('Payment Intent Creation', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('creates payment intent for card payment', async () => {
      stripeGateway.stripe.paymentIntents.create.mockResolvedValue({
        id: 'pi_test_card',
        client_secret: 'pi_test_card_secret',
        amount: 1000,
        currency: 'usd',
      });

      const res = await post('/api/create-payment-intent').send({ amount: 10 });

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({
        clientSecret: 'pi_test_card_secret',
        paymentIntentId: 'pi_test_card',
      });

      expect(stripeGateway.stripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 1000,
        currency: 'usd',
        automatic_payment_methods: { enabled: true },
      });
    });

    it('handles payment intent creation errors', async () => {
      stripeGateway.stripe.paymentIntents.create.mockRejectedValue(
        new Error('Invalid amount')
      );

      const res = await post('/api/create-payment-intent').send({
        amount: -10,
      });

      expect(res.statusCode).toBe(400);
      expect(res.body).toEqual({
        error: 'Payment intent creation failed. Please try again.',
      });
    });
  });
});
