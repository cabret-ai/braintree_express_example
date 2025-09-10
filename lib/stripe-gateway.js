const Stripe = require('stripe');
const dotenv = require('dotenv');

dotenv.config();

if (!process.env.STRIPE_SECRET_KEY || !process.env.STRIPE_PUBLISHABLE_KEY) {
  throw new Error(
    'Cannot find necessary environment variables. See https://github.com/stripe/stripe_express_example#setup-instructions for instructions'
  );
}

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

const stripeGateway = {
  stripe,

  async createPaymentIntent(amount, currency = 'usd') {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Stripe uses cents
        currency,

        automatic_payment_methods: {
          enabled: true,
        },
      });

      return paymentIntent;
    } catch (error) {
      throw new Error(`Payment intent creation failed: ${error.message}`);
    }
  },

  async retrievePaymentIntent(paymentIntentId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(
        paymentIntentId
      );

      return paymentIntent;
    } catch (error) {
      throw new Error(`Payment intent retrieval failed: ${error.message}`);
    }
  },

  async confirmPaymentIntent(paymentIntentId, paymentMethodId) {
    try {
      const paymentIntent = await stripe.paymentIntents.confirm(
        paymentIntentId,
        {
          payment_method: paymentMethodId,
        }
      );

      return paymentIntent;
    } catch (error) {
      throw new Error(`Payment confirmation failed: ${error.message}`);
    }
  },

  async createCheckoutSession(amount, successUrl, cancelUrl) {
    try {
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],

        line_items: [
          {
            price_data: {
              currency: 'usd',

              product_data: {
                name: 'Payment',
              },

              unit_amount: Math.round(amount * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',

        success_url: successUrl,

        cancel_url: cancelUrl,
      });

      return session;
    } catch (error) {
      throw new Error(`Checkout session creation failed: ${error.message}`);
    }
  },

  async retrieveSession(sessionId) {
    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      return session;
    } catch (error) {
      throw new Error(`Session retrieval failed: ${error.message}`);
    }
  },

  constructWebhookEvent(payload, signature, webhookSecret) {
    try {
      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      throw new Error(
        `Webhook signature verification failed: ${error.message}`
      );
    }
  },

  getPublishableKey() {
    return process.env.STRIPE_PUBLISHABLE_KEY;
  },

  // Customer Management
  async createCustomer(email, name = null, metadata = {}) {
    try {
      const customerData = {
        email,
        metadata,
      };

      if (name) {
        customerData.name = name;
      }
      const customer = await stripe.customers.create(customerData);

      return customer;
    } catch (error) {
      throw new Error(`Customer creation failed: ${error.message}`);
    }
  },

  async retrieveCustomer(customerId) {
    try {
      const customer = await stripe.customers.retrieve(customerId);

      return customer;
    } catch (error) {
      throw new Error(`Customer retrieval failed: ${error.message}`);
    }
  },

  async updateCustomer(customerId, updates) {
    try {
      const customer = await stripe.customers.update(customerId, updates);

      return customer;
    } catch (error) {
      throw new Error(`Customer update failed: ${error.message}`);
    }
  },

  // Payment Method Management
  async attachPaymentMethod(paymentMethodId, customerId) {
    try {
      const paymentMethod = await stripe.paymentMethods.attach(
        paymentMethodId,
        { customer: customerId }
      );

      return paymentMethod;
    } catch (error) {
      throw new Error(`Payment method attachment failed: ${error.message}`);
    }
  },

  async listPaymentMethods(customerId, type = 'card') {
    try {
      const paymentMethods = await stripe.paymentMethods.list({
        customer: customerId,
        type,
      });

      return paymentMethods.data;
    } catch (error) {
      throw new Error(`Payment method listing failed: ${error.message}`);
    }
  },

  async detachPaymentMethod(paymentMethodId) {
    try {
      const paymentMethod = await stripe.paymentMethods.detach(paymentMethodId);

      return paymentMethod;
    } catch (error) {
      throw new Error(`Payment method detachment failed: ${error.message}`);
    }
  },

  async setDefaultPaymentMethod(customerId, paymentMethodId) {
    try {
      const customer = await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId,
        },
      });

      return customer;
    } catch (error) {
      throw new Error(
        `Setting default payment method failed: ${error.message}`
      );
    }
  },

  // One-Click Checkout Support
  async createPaymentIntentWithCustomer(
    amount,
    customerId,
    paymentMethodId = null,
    currency = 'usd'
  ) {
    try {
      const paymentIntentData = {
        amount: Math.round(amount * 100),
        currency,
        customer: customerId,

        payment_method_types: ['card', 'paypal'],

        automatic_payment_methods: {
          enabled: false,
        },
      };

      if (paymentMethodId) {
        paymentIntentData.payment_method = paymentMethodId;
        paymentIntentData.confirm = true;
      }

      const paymentIntent = await stripe.paymentIntents.create(
        paymentIntentData
      );

      return paymentIntent;
    } catch (error) {
      throw new Error(
        `Payment intent with customer creation failed: ${error.message}`
      );
    }
  },

  // Refund Processing
  async createRefund(
    paymentIntentId,
    amount = null,
    reason = 'requested_by_customer'
  ) {
    try {
      const refundData = {
        payment_intent: paymentIntentId,
        reason,
      };

      if (amount !== null) {
        refundData.amount = Math.round(amount * 100);
      }

      const refund = await stripe.refunds.create(refundData);

      return refund;
    } catch (error) {
      throw new Error(`Refund creation failed: ${error.message}`);
    }
  },

  async retrieveRefund(refundId) {
    try {
      const refund = await stripe.refunds.retrieve(refundId);

      return refund;
    } catch (error) {
      throw new Error(`Refund retrieval failed: ${error.message}`);
    }
  },

  async listRefunds(paymentIntentId = null, limit = 10) {
    try {
      const params = { limit };

      if (paymentIntentId) {
        params.payment_intent = paymentIntentId;
      }
      const refunds = await stripe.refunds.list(params);

      return refunds.data;
    } catch (error) {
      throw new Error(`Refund listing failed: ${error.message}`);
    }
  },

  async updateRefund(refundId, metadata) {
    try {
      const refund = await stripe.refunds.update(refundId, { metadata });

      return refund;
    } catch (error) {
      throw new Error(`Refund update failed: ${error.message}`);
    }
  },

  // Compatibility methods to match Braintree gateway interface
  clientToken: {
    async generate() {
      // Stripe doesn't use client tokens like Braintree
      // Return the publishable key instead
      return {
        clientToken: process.env.STRIPE_PUBLISHABLE_KEY,
      };
    },
  },

  transaction: {
    // eslint-disable-next-line no-unused-vars
    async sale({ amount, paymentMethodNonce, options = {} }) {
      try {
        // Create a payment intent with the amount
        const paymentIntent = await stripeGateway.createPaymentIntent(amount);

        // In Stripe, confirmation happens client-side or with a separate call
        // For compatibility, we'll return a structure similar to Braintree
        return {
          success: true,
          transaction: {
            id: paymentIntent.id,
            status: paymentIntent.status,
            amount: (paymentIntent.amount / 100).toFixed(2),
            currency: paymentIntent.currency,
            created: new Date(paymentIntent.created * 1000),
          },
        };
      } catch (error) {
        return {
          success: false,
          errors: {
            deepErrors: () => [
              {
                code: 'PAYMENT_FAILED',
                message: error.message,
              },
            ],
          },
        };
      }
    },

    async find(transactionId) {
      try {
        const paymentIntent = await stripeGateway.retrievePaymentIntent(
          transactionId
        );

        // Map Stripe payment intent to Braintree-like transaction format
        return {
          id: paymentIntent.id,
          status: mapStripeStatusToBraintree(paymentIntent.status),
          amount: (paymentIntent.amount / 100).toFixed(2),
          currency: paymentIntent.currency,
          created: new Date(paymentIntent.created * 1000),
          paymentMethodDetails:
            paymentIntent.charges?.data[0]?.payment_method_details,
          customer: paymentIntent.customer,
          metadata: paymentIntent.metadata,
        };
      } catch (error) {
        throw new Error(`Transaction not found: ${error.message}`);
      }
    },
  },
};

// Helper function to map Stripe status to Braintree-like status
function mapStripeStatusToBraintree(stripeStatus) {
  /* eslint-disable camelcase */
  const statusMap = {
    requires_payment_method: 'Authorizing',
    requires_confirmation: 'Authorizing',
    requires_action: 'Authorizing',
    processing: 'SubmittedForSettlement',
    requires_capture: 'Authorized',
    canceled: 'Voided',
    succeeded: 'Settled',
  };
  /* eslint-enable camelcase */

  return statusMap[stripeStatus] || stripeStatus;
}

module.exports = stripeGateway;
