"use strict";

const assert = require("node:assert/strict");

process.env.RESEND_API_KEY = "re_test";
process.env.RESEND_FROM = "FLIGALIGA <verified@example.com>";
process.env.PUBLIC_BASE_URL = "https://fligaliga.example";

const {
  isEmailConfigured,
  sendOrderReceivedEmail,
  sendPaymentConfirmationEmail,
  sendWithdrawalConfirmationEmail
} = require("../email");

assert.equal(isEmailConfigured(), true);

const calls = [];
const fakeFetch = async (url, options) => {
  calls.push({ url, options });
  return {
    ok: true,
    status: 200,
    async json() {
      return { id: "email-test-id" };
    }
  };
};

(async () => {
  const order = {
    id: 123,
    total: 14.99,
    customer_name: "Test Customer <script>",
    customer_email: "customer@example.com"
  };

  const received = await sendOrderReceivedEmail(order, fakeFetch);
  assert.equal(received.sent, true);
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers["Idempotency-Key"], "order-received/123");

  const receivedPayload = JSON.parse(calls[0].options.body);
  assert.equal(receivedPayload.to[0], "customer@example.com");
  assert.match(receivedPayload.html, /Test Customer &lt;script&gt;/);

  await sendPaymentConfirmationEmail(order, fakeFetch);
  assert.equal(calls[1].options.headers["Idempotency-Key"], "payment-confirmed/123");

  const request = {
    id: 77,
    order_id: 123,
    email: "customer@example.com"
  };
  await sendWithdrawalConfirmationEmail(request, fakeFetch);
  assert.equal(calls[2].options.headers["Idempotency-Key"], "withdrawal-received/77");

  delete process.env.RESEND_API_KEY;
  const skipped = await sendWithdrawalConfirmationEmail(request, fakeFetch);
  assert.equal(skipped.sent, false);
  assert.equal(skipped.skipped, true);

  console.log("Transactional email regression tests passed.");
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
