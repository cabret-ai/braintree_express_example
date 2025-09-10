'use strict';

(function () {
  var amount = document.querySelector('#amount');
  var amountLabel = document.querySelector('label[for="amount"]');
  var form = document.querySelector('#payment-form');
  var submitButton = document.querySelector('button[type="submit"]');
  var publishableKey = document.getElementById('client-token').innerText;
  var stripeErrors = document.getElementById('stripe-errors');

  // Initialize Stripe
  // eslint-disable-next-line new-cap
  var stripe = window.Stripe(publishableKey);
  var elements = null;
  var cardElement = null;
  var clientSecret = null;

  // Handle amount field focus/blur
  amount.addEventListener(
    'focus',
    function () {
      amountLabel.className = 'has-focus';
    },
    false
  );

  amount.addEventListener(
    'blur',
    function () {
      amountLabel.className = '';
    },
    false
  );

  // Initialize Card Element
  function initializeCardElement() {
    elements = stripe.elements();

    var style = {
      base: {
        color: '#32325d',
        fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
        fontSmoothing: 'antialiased',
        fontSize: '16px',
        '::placeholder': {
          color: '#aab7c4',
        },
      },
      invalid: {
        color: '#fa755a',
        iconColor: '#fa755a',
      },
    };

    cardElement = elements.create('card', { style: style });
    cardElement.mount('#card-element');

    // Handle real-time validation errors from the card Element
    cardElement.on('change', function (event) {
      displayError(event.error ? event.error.message : '');
    });
  }

  // Create payment intent and get client secret
  function createPaymentIntent() {
    var amountValue = amount.value || '10';

    return fetch('/api/create-payment-intent', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountValue,
      }),
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        return response.json();
      })
      .then(function (data) {
        if (data.error) {
          throw new Error(data.error);
        }
        clientSecret = data.clientSecret;
        return data;
      });
  }

  // Handle form submission
  form.addEventListener('submit', function (event) {
    event.preventDefault();

    // Disable submit button
    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';

    // Create payment intent first
    createPaymentIntent()
      .then(function () {
        // Confirm the payment with the card element
        return stripe.confirmCardPayment(clientSecret, {
          payment_method: {
            card: cardElement,
          },
        });
      })
      .then(function (result) {
        if (result.error) {
          // Show error to customer
          displayError(result.error.message);
          submitButton.disabled = false;
          submitButton.textContent = 'Test Transaction';
        } else {
          // Payment succeeded, redirect to success page
          if (result.paymentIntent.status === 'succeeded') {
            // Store payment intent ID for the redirect
            var paymentIntentInput =
              document.getElementById('payment-intent-id');
            if (paymentIntentInput) {
              paymentIntentInput.value = result.paymentIntent.id;
            }

            // Redirect to the success page
            window.location.href = '/checkouts/' + result.paymentIntent.id;
          }
        }
      })
      .catch(function (error) {
        console.error('Error:', error);
        displayError(error.message || 'An unexpected error occurred.');
        submitButton.disabled = false;
        submitButton.textContent = 'Test Transaction';
      });
  });

  // Display error message
  function displayError(errorMessage) {
    if (stripeErrors) {
      stripeErrors.textContent = errorMessage;
      stripeErrors.style.display = errorMessage ? 'block' : 'none';
    }
  }

  // Card payment is the only option, no need for payment method selection

  // Initialize when page loads
  initializeCardElement();
})();
