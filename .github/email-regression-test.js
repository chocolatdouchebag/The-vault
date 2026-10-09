"use strict";

const assert = require("node:assert/strict");

process.env.SMTP_HOST = "smtp.strato.de";
process.env.SMTP_PORT = "465";
process.env.SMTP_SECURE = "true";
process.env.SMTP_USER = "orders@fligaliga.nl";
process.env.SMTP_PASS = "test-mailbox-password";
process.env.SMTP_FROM = "FLIGALIGA <orders@fligaliga.nl>";
process.env.CONTACT_RECIPIENT = "fligaliga@hotmail.com";
process.env.PUBLIC_BASE_URL = "https://fligaliga.example";

const {
  isEmailConfigured,
  sendOrderReceivedEmail,
  sendPaymentConfirmationEmail,
  sendWithdrawalConfirmationEmail,
  sendContactMessageEmail
} = require("../email");

assert.equal(isEmailConfigured(), true);

const calls = [];
const fakeTransport = {
  async sendMail(message) {
    calls.push(message);
    return { messageId: "smtp-test-message-id", response: "250 Message accepted" };
  },
  async verify() {
    calls.push({ verification: true });
    return true;
  }
};

(async () => {
  const order = {
    id: 123,
    total: 29.98,
    customer_name: "Test Customer <script>",
    customer_email: "customer@example.com",
    shipping_address_line1: "12 Treasure Lane",
    shipping_postcode: "1234 AB",
    shipping_city: "Haarlem",
    shipping_country: "NL",
    items: [
      { product_id: 20, name: "Compass <script>", quantity: 2, price: 14.99 }
    ]
  };

  const received = await sendOrderReceivedEmail(order, fakeTransport);
  assert.equal(received.sent, true);
  assert.equal(received.skipped, false);
  assert.equal(received.id, "smtp-test-message-id");
  assert.equal(calls[0].from, "FLIGALIGA <orders@fligaliga.nl>");
  assert.equal(calls[0].to, "customer@example.com");
  assert.equal(calls[0].subject, "FLIGALIGA — Order #123 received");
  assert.equal(calls[0].headers["X-FLIGALIGA-Notification-Key"], "order-received/123");
  assert.match(calls[0].html, /Test Customer &lt;script&gt;/);
  assert.match(calls[0].html, /Compass &lt;script&gt;/);
  assert.match(calls[0].html, /Order summary/);
  assert.match(calls[0].html, /€29\.98/);
  assert.match(calls[0].html, /Treasure Lane/);
  assert.match(calls[0].html, /1234 AB/);
  assert.match(calls[0].html, /Haarlem/);

  await sendPaymentConfirmationEmail(order, fakeTransport);
  assert.equal(calls[1].subject, "FLIGALIGA — Payment received for order #123");
  assert.equal(calls[1].headers["X-FLIGALIGA-Notification-Key"], "payment-confirmed/123");

  const request = {
    id: 77,
    order_id: 123,
    email: "customer@example.com"
  };
  await sendWithdrawalConfirmationEmail(request, fakeTransport);
  assert.equal(calls[2].to, "customer@example.com");
  assert.equal(calls[2].headers["X-FLIGALIGA-Notification-Key"], "withdrawal-received/77");

  await sendContactMessageEmail({
    name: "A Curious Traveller <script>",
    email: "traveller@example.com",
    message: "Hello <world>",
    idempotencyKey: "test-contact-1"
  }, fakeTransport);
  assert.equal(calls[3].to, "fligaliga@hotmail.com");
  assert.equal(calls[3].replyTo, "traveller@example.com");
  assert.equal(calls[3].headers["X-FLIGALIGA-Notification-Key"], "contact-message/test-contact-1");
  assert.match(calls[3].html, /A Curious Traveller &lt;script&gt;/);
  assert.match(calls[3].html, /Hello &lt;world&gt;/);

  delete process.env.SMTP_PASS;
  const skipped = await sendWithdrawalConfirmationEmail(request, fakeTransport);
  assert.equal(skipped.sent, false);
  assert.equal(skipped.skipped, true);
  assert.equal(skipped.reason, "email_not_configured");
  assert.equal(calls.length, 4, "missing SMTP credentials must not call the transport");

  console.log("SMTP transactional email regression tests passed.");
})().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
