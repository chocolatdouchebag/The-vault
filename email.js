"use strict";

const RESEND_API_URL = "https://api.resend.com/emails";

function isEmailConfigured() {
  return Boolean(
    String(process.env.RESEND_API_KEY || "").trim() &&
    String(process.env.RESEND_FROM || "").trim()
  );
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

async function sendEmail({
  to,
  subject,
  html,
  idempotencyKey,
  fetchImpl = globalThis.fetch
}) {
  if (!isEmailConfigured()) {
    return { sent: false, skipped: true, reason: "email_not_configured" };
  }

  const response = await fetchImpl(RESEND_API_URL, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + process.env.RESEND_API_KEY,
      "Content-Type": "application/json",
      "Accept": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {})
    },
    signal: AbortSignal.timeout(10000),
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [to],
      subject,
      html
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.message || payload?.error || "Email provider rejected the request";
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return { sent: true, skipped: false, id: payload?.id || null };
}

async function sendOrderReceivedEmail(order, fetchImpl = globalThis.fetch) {
  const orderId = Number(order.id);
  const customerName = escapeHtml(order.customer_name || "traveller");
  const total = Number(order.total).toFixed(2);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const statusUrl = baseUrl
    ? baseUrl + "/payment-result?order=" + encodeURIComponent(String(orderId))
    : "/payment-result?order=" + encodeURIComponent(String(orderId));

  return sendEmail({
    to: order.customer_email,
    subject: "FLIGALIGA — Order #" + orderId + " received",
    idempotencyKey: "order-received/" + orderId,
    html:
      "<!doctype html><html><body>" +
      "<h1>FLIGALIGA</h1>" +
      "<p>Dear " + customerName + ",</p>" +
      "<p>Your order <strong>#" + orderId + "</strong> has been received.</p>" +
      "<p>Total: <strong>€" + escapeHtml(total) + "</strong></p>" +
      "<p>Your payment is being handled securely. You can check the latest status here:</p>" +
      "<p><a href="" + escapeHtml(statusUrl) + "">View order status</a></p>" +
      "<p>Thank you for travelling with FLIGALIGA.</p>" +
      "</body></html>"
  }, fetchImpl);
}

async function sendPaymentConfirmationEmail(order, fetchImpl = globalThis.fetch) {
  const orderId = Number(order.id);
  const customerName = escapeHtml(order.customer_name || "traveller");
  const total = Number(order.total).toFixed(2);
  const baseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const statusUrl = baseUrl
    ? baseUrl + "/payment-result?order=" + encodeURIComponent(String(orderId))
    : "/payment-result?order=" + encodeURIComponent(String(orderId));

  return sendEmail({
    to: order.customer_email,
    subject: "FLIGALIGA — Payment received for order #" + orderId,
    idempotencyKey: "payment-confirmed/" + orderId,
    html:
      "<!doctype html><html><body>" +
      "<h1>FLIGALIGA</h1>" +
      "<p>Dear " + customerName + ",</p>" +
      "<p>Payment for order <strong>#" + orderId + "</strong> has been received.</p>" +
      "<p>Total paid: <strong>€" + escapeHtml(total) + "</strong></p>" +
      "<p><a href="" + escapeHtml(statusUrl) + "">View your order</a></p>" +
      "<p>Your treasure is now confirmed for processing.</p>" +
      "</body></html>"
  }, fetchImpl);
}

async function sendWithdrawalConfirmationEmail(request, fetchImpl = globalThis.fetch) {
  const requestId = Number(request.id);
  const orderText = request.order_id ? " for order <strong>#" + escapeHtml(request.order_id) + "</strong>" : "";
  const baseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const withdrawalUrl = baseUrl ? baseUrl + "/withdrawal" : "/withdrawal";

  return sendEmail({
    to: request.email,
    subject: "FLIGALIGA — Withdrawal request #" + requestId + " received",
    idempotencyKey: "withdrawal-received/" + requestId,
    html:
      "<!doctype html><html><body>" +
      "<h1>FLIGALIGA</h1>" +
      "<p>We have received your withdrawal request" + orderText + ".</p>" +
      "<p>Request number: <strong>#" + requestId + "</strong></p>" +
      "<p>We will review the request and contact you about the next steps.</p>" +
      "<p>You can revisit the withdrawal information here: <a href="" + escapeHtml(withdrawalUrl) + "">Withdrawal information</a></p>" +
      "</body></html>"
  }, fetchImpl);
}

module.exports = {
  isEmailConfigured,
  sendEmail,
  sendOrderReceivedEmail,
  sendPaymentConfirmationEmail,
  sendWithdrawalConfirmationEmail
};
