// Set environment variables before importing anything
process.env.STRIPE_SECRET_KEY = 'sk_test_mock_key';
process.env.STRIPE_PUBLISHABLE_KEY = 'pk_test_mock_key';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_mock_secret';

// Mock Stripe SDK
jest.mock('stripe', () => {
  return jest.fn().mockImplementation(() => ({
    paymentIntents: {
      create: jest.fn(),
      retrieve: jest.fn(),
      confirm: jest.fn(),
    },
    checkout: {
      sessions: {
        create: jest.fn(),
        retrieve: jest.fn(),
      },
    },
    webhooks: {
      constructEvent: jest.fn(),
    },
    customers: {
      create: jest.fn(),
      retrieve: jest.fn(),
      update: jest.fn(),
    },
    paymentMethods: {
      attach: jest.fn(),
      list: jest.fn(),
      detach: jest.fn(),
    },
    refunds: {
      create: jest.fn(),
      retrieve: jest.fn(),
      list: jest.fn(),
      update: jest.fn(),
    },
  }));
});

// Mock dotenv
jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

// Now import the module after mocks are set up
const stripeGateway = require('../stripe-gateway');

describe('Stripe Gateway', () => {
  let mockStripe;

  beforeEach(() => {
    // Get mock Stripe instance from stripeGateway
    mockStripe = stripeGateway.stripe;
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('should create payment intent with correct amount in cents', async () => {
      const mockPaymentIntent = {
        id: 'pi_test_123',
        amount: 5000,
        currency: 'usd',
        status: 'requires_payment_method',
      };

      mockStripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent);

      const result = await stripeGateway.createPaymentIntent(50.0);

      expect(mockStripe.paymentIntents.create).toHaveBeenCalledWith({
        amount: 5000,
        currency: 'usd',
        automatic_payment_methods: {
          enabled: true,
        },
      });

      expect(result).toEqual(mockPaymentIntent);
    });

    it('should handle errors from Stripe API', async () => {
      mockStripe.paymentIntents.create.mockRejectedValue(
        new Error('Stripe API error')
      );

      await expect(stripeGateway.createPaymentIntent(50)).rejects.toThrow(
        'Payment intent creation failed: Stripe API error'
      );
    });
  });

  describe('retrievePaymentIntent', () => {
    it('should retrieve payment intent by ID', async () => {
      const mockPaymentIntent = {
        id: 'pi_test_789',
        amount: 2500,
        status: 'succeeded',
      };

      mockStripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);

      const result = await stripeGateway.retrievePaymentIntent('pi_test_789');

      expect(mockStripe.paymentIntents.retrieve).toHaveBeenCalledWith(
        'pi_test_789'
      );
      expect(result).toEqual(mockPaymentIntent);
    });
  });

  describe('confirmPaymentIntent', () => {
    it('should confirm payment intent with payment method', async () => {
      const mockConfirmedIntent = {
        id: 'pi_test_confirm',
        status: 'processing',
      };

      mockStripe.paymentIntents.confirm.mockResolvedValue(mockConfirmedIntent);

      const result = await stripeGateway.confirmPaymentIntent(
        'pi_test_confirm',
        'pm_test_123'
      );

      expect(mockStripe.paymentIntents.confirm).toHaveBeenCalledWith(
        'pi_test_confirm',
        {
          payment_method: 'pm_test_123',
        }
      );
      expect(result).toEqual(mockConfirmedIntent);
    });
  });

  describe('constructWebhookEvent', () => {
    it('should construct webhook event with valid signature', () => {
      const mockEvent = {
        id: 'evt_test_123',
        type: 'payment_intent.succeeded',
      };

      mockStripe.webhooks.constructEvent.mockReturnValue(mockEvent);

      const result = stripeGateway.constructWebhookEvent(
        'payload',
        'signature',
        'whsec_test'
      );

      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        'payload',
        'signature',
        'whsec_test'
      );
      expect(result).toEqual(mockEvent);
    });

    it('should handle invalid webhook signature', () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Invalid signature');
      });

      expect(() => {
        stripeGateway.constructWebhookEvent('payload', 'bad_sig', 'secret');
      }).toThrow('Webhook signature verification failed: Invalid signature');
    });
  });

  describe('getPublishableKey', () => {
    it('should return the publishable key from environment', () => {
      const key = stripeGateway.getPublishableKey();

      expect(key).toBe('pk_test_mock_key');
    });
  });

  describe('Customer Management', () => {
    describe('createCustomer', () => {
      it('should create customer with email', async () => {
        const mockCustomer = {
          id: 'cus_test_123',
          email: 'test@example.com',
        };

        mockStripe.customers.create.mockResolvedValue(mockCustomer);

        const result = await stripeGateway.createCustomer('test@example.com');

        expect(mockStripe.customers.create).toHaveBeenCalledWith({
          email: 'test@example.com',
          metadata: {},
        });
        expect(result).toEqual(mockCustomer);
      });
    });

    describe('retrieveCustomer', () => {
      it('should retrieve customer by ID', async () => {
        const mockCustomer = {
          id: 'cus_test_789',
          email: 'customer@example.com',
        };

        mockStripe.customers.retrieve.mockResolvedValue(mockCustomer);

        const result = await stripeGateway.retrieveCustomer('cus_test_789');

        expect(mockStripe.customers.retrieve).toHaveBeenCalledWith(
          'cus_test_789'
        );
        expect(result).toEqual(mockCustomer);
      });
    });
  });

  describe('Payment Method Management', () => {
    describe('attachPaymentMethod', () => {
      it('should attach payment method to customer', async () => {
        const mockPaymentMethod = {
          id: 'pm_test_123',
          customer: 'cus_test_123',
        };

        mockStripe.paymentMethods.attach.mockResolvedValue(mockPaymentMethod);

        const result = await stripeGateway.attachPaymentMethod(
          'pm_test_123',
          'cus_test_123'
        );

        expect(mockStripe.paymentMethods.attach).toHaveBeenCalledWith(
          'pm_test_123',
          { customer: 'cus_test_123' }
        );
        expect(result).toEqual(mockPaymentMethod);
      });
    });

    describe('listPaymentMethods', () => {
      it('should list payment methods for customer', async () => {
        const mockPaymentMethods = {
          data: [
            { id: 'pm_1', type: 'card' },
            { id: 'pm_2', type: 'card' },
          ],
        };

        mockStripe.paymentMethods.list.mockResolvedValue(mockPaymentMethods);

        const result = await stripeGateway.listPaymentMethods('cus_test_123');

        expect(mockStripe.paymentMethods.list).toHaveBeenCalledWith({
          customer: 'cus_test_123',
          type: 'card',
        });
        expect(result).toEqual(mockPaymentMethods.data);
      });
    });
  });

  describe('Refund Processing', () => {
    describe('createRefund', () => {
      it('should create full refund', async () => {
        const mockRefund = {
          id: 're_test_123',
          amount: 5000,
          status: 'succeeded',
        };

        mockStripe.refunds.create.mockResolvedValue(mockRefund);

        const result = await stripeGateway.createRefund('pi_test_123');

        expect(mockStripe.refunds.create).toHaveBeenCalledWith({
          payment_intent: 'pi_test_123',
          reason: 'requested_by_customer',
        });
        expect(result).toEqual(mockRefund);
      });

      it('should create partial refund', async () => {
        const mockRefund = {
          id: 're_test_partial',
          amount: 2500,
          status: 'succeeded',
        };

        mockStripe.refunds.create.mockResolvedValue(mockRefund);

        const result = await stripeGateway.createRefund(
          'pi_test_123',
          25,
          'duplicate'
        );

        expect(mockStripe.refunds.create).toHaveBeenCalledWith({
          payment_intent: 'pi_test_123',
          amount: 2500,
          reason: 'duplicate',
        });
        expect(result).toEqual(mockRefund);
      });
    });
  });

  describe('Braintree compatibility methods', () => {
    describe('clientToken.generate', () => {
      it('should return publishable key as client token', async () => {
        const result = await stripeGateway.clientToken.generate();

        expect(result).toEqual({
          clientToken: 'pk_test_mock_key',
        });
      });
    });

    describe('transaction.sale', () => {
      it('should create payment intent and return Braintree-like response', async () => {
        const mockPaymentIntent = {
          id: 'pi_test_sale',
          amount: 12500,
          currency: 'usd',
          status: 'requires_payment_method',
          created: 1234567890,
        };

        mockStripe.paymentIntents.create.mockResolvedValue(mockPaymentIntent);

        const result = await stripeGateway.transaction.sale({
          amount: 125.0,
          paymentMethodNonce: 'nonce_123',
        });

        expect(result).toEqual({
          success: true,
          transaction: {
            id: 'pi_test_sale',
            status: 'requires_payment_method',
            amount: '125.00',
            currency: 'usd',
            created: new Date(1234567890000),
          },
        });
      });

      it('should handle sale errors with Braintree-like error format', async () => {
        mockStripe.paymentIntents.create.mockRejectedValue(
          new Error('Insufficient funds')
        );

        const result = await stripeGateway.transaction.sale({
          amount: 100,
          paymentMethodNonce: 'nonce_456',
        });

        expect(result.success).toBe(false);
        expect(result.errors.deepErrors()).toEqual([
          {
            code: 'PAYMENT_FAILED',
            message: 'Payment intent creation failed: Insufficient funds',
          },
        ]);
      });
    });

    describe('transaction.find', () => {
      it('should retrieve and map payment intent to Braintree format', async () => {
        const mockPaymentIntent = {
          id: 'pi_test_find',
          amount: 7500,
          currency: 'usd',
          status: 'succeeded',
          created: 1234567890,
          customer: 'cus_123',
          metadata: { order_id: '456' },
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
        };

        mockStripe.paymentIntents.retrieve.mockResolvedValue(mockPaymentIntent);

        const result = await stripeGateway.transaction.find('pi_test_find');

        expect(result).toEqual({
          id: 'pi_test_find',
          status: 'Settled',
          amount: '75.00',
          currency: 'usd',
          created: new Date(1234567890000),
          paymentMethodDetails: {
            card: {
              brand: 'visa',
              last4: '4242',
            },
          },
          customer: 'cus_123',
          metadata: { order_id: '456' },
        });
      });
    });
  });
});
