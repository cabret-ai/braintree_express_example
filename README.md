# Stripe Express Example

An example Stripe integration for Node in the Express framework.

## Setup Instructions

1. Install packages:

   ```sh
   npm install
   ```

2. Copy the contents of `example.env` into a new file named `.env` and fill in your Stripe API credentials. Credentials can be found in the Stripe Dashboard under Developers > API keys. Full instructions can be [found in the Stripe documentation](https://stripe.com/docs/keys).

3. Start the server:

   ```sh
   npm start
   ```

   By default, this runs the app on port `3000`. You can configure the port by setting the environmental variable `PORT`.

## Running tests

To run unit tests, use `npm run test:unit`. These do not require a server and do not make API calls.

To run all tests, run `npm test`. This requires the server be up (in a separate shell using `npm run dev` or `npm start`) to make the relevant API calls to Stripe. `npm test` requires that your _test mode_ Stripe credentials be set up [as detailed above](#setup-instructions).

## Supported Payment Methods

This integration supports the following payment methods:

- **Credit/Debit Cards**: All major card networks (Visa, Mastercard, American Express, Discover)

## Testing Transactions

Test mode transactions must be made with [test credit card numbers](https://stripe.com/docs/testing#cards). Different card numbers can be used to trigger specific responses and test various scenarios.

## Disclaimer

This code is provided as is and is only intended to be used for illustration purposes. This code is not production-ready and is not meant to be used in a production environment. This repository is to be used as a tool to help merchants learn how to integrate with Stripe. Any use of this repository or any of its code in a production environment is highly discouraged.
