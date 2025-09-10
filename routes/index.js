const express = require('express');
const { Router } = express;
const logger = require('debug');
const stripeGateway = require('../lib/stripe-gateway');

const router = Router();
const debug = logger('stripe_example:router');

const TRANSACTION_SUCCESS_STATUSES = [
  'succeeded',
  'processing',
  'requires_capture',
  'Settled',
  'Authorized',
  'SubmittedForSettlement',
];

function createResultObject({ status }) {
  let result;

  if (TRANSACTION_SUCCESS_STATUSES.indexOf(status) !== -1) {
    result = {
      header: 'Sweet Success!',
      icon: 'success',
      message:
        'Your test transaction has been successfully processed. See the Stripe API response and try again.',
    };
  } else {
    result = {
      header: 'Transaction Failed',
      icon: 'fail',
      message: `Your test transaction has a status of ${status}. See the Stripe API response and try again.`,
    };
  }

  return result;
}

router.get('/', (req, res) => {
  res.redirect('/checkouts/new');
});

router.get('/checkouts/new', (req, res) => {
  res.render('checkouts/new', {
    clientToken: stripeGateway.getPublishableKey(),
    messages: req.flash('error'),
    useStripe: true,
  });
});

router.get('/checkouts/complete', async (req, res) => {
  const { payment_intent, redirect_status } = req.query;

  debug(
    'Checkout complete - payment_intent: %s, redirect_status: %s',
    payment_intent,
    redirect_status
  );

  if (redirect_status === 'succeeded' && payment_intent) {
    res.redirect(`/checkouts/${payment_intent}`);
  } else {
    req.flash('error', { msg: 'Payment was not completed' });
    res.redirect('/checkouts/new');
  }
});

router.get('/checkouts/:id', async (req, res) => {
  let result;
  const transactionId = req.params.id;

  try {
    const transaction = await stripeGateway.transaction.find(transactionId);

    result = createResultObject(transaction);
    res.render('checkouts/show', { transaction, result });
  } catch (error) {
    debug('Error retrieving transaction: %O', error);
    req.flash('error', { msg: 'Transaction not found' });
    res.redirect('/checkouts/new');
  }
});

router.post('/api/create-payment-intent', async (req, res) => {
  const { amount } = req.body;

  try {
    const paymentIntent = await stripeGateway.createPaymentIntent(amount);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
    });
  } catch (error) {
    debug('Error creating payment intent: %O', error);
    res.status(400).json({
      error: 'Payment intent creation failed. Please try again.',
    });
  }
});

router.post('/checkouts', async (req, res) => {
  const { payment_intent_id: paymentIntentId } = req.body;

  if (!paymentIntentId) {
    req.flash('error', { msg: 'Payment intent ID is required' });

    return res.redirect('checkouts/new');
  }

  try {
    const paymentIntent = await stripeGateway.retrievePaymentIntent(
      paymentIntentId
    );

    if (paymentIntent.status === 'succeeded') {
      res.redirect(`/checkouts/${paymentIntentId}`);
    } else if (
      paymentIntent.status === 'requires_action' ||
      paymentIntent.status === 'requires_confirmation'
    ) {
      req.flash('error', { msg: 'Payment requires additional verification' });
      res.redirect('checkouts/new');
    } else {
      req.flash('error', {
        msg: `Payment failed with status: ${paymentIntent.status}`,
      });
      res.redirect('checkouts/new');
    }
  } catch (error) {
    debug('Error processing Stripe payment: %O', error);
    req.flash('error', { msg: 'Payment processing failed' });
    res.redirect('checkouts/new');
  }
});

router.post('/stripe/webhooks', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    debug('Webhook secret not configured');

    return res.status(500).send('Webhook secret not configured');
  }

  let event;

  try {
    event = stripeGateway.constructWebhookEvent(req.body, sig, webhookSecret);
  } catch (err) {
    debug('Webhook signature verification failed: %O', err);
    return res.status(400).send('Webhook signature verification failed');
  }

  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;

        debug('PaymentIntent succeeded: %s', paymentIntent.id);
        break;
      }

      case 'payment_intent.payment_failed': {
        const failedPayment = event.data.object;

        debug('PaymentIntent failed: %s', failedPayment.id);
        break;
      }

      case 'payment_method.attached': {
        const paymentMethod = event.data.object;

        debug('PaymentMethod attached: %s', paymentMethod.id);
        break;
      }

      case 'customer.created': {
        const customer = event.data.object;

        debug('Customer created: %s', customer.id);
        break;
      }

      case 'charge.refunded': {
        const charge = event.data.object;

        debug('Charge refunded: %s', charge.id);
        break;
      }

      default:
        debug('Unhandled event type: %s', event.type);
    }

    res.json({ received: true });
  } catch (error) {
    debug('Error handling webhook event: %O', error);
    res.status(500).send('Webhook handler error');
  }
});

module.exports = router;
