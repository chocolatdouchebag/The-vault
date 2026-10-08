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
  replyTo,
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
      html,
      ...(replyTo ? { reply_to: [replyTo] } : {})
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
  const items = Array.isArray(order.items) ? order.items : [];
  const itemRows = items.length
    ? items.map(item => {
        const name = escapeHtml(item.name || "Treasure");
        const quantity = Number(item.quantity) || 0;
        const price = Number(item.price || 0).toFixed(2);
        const lineTotal = (quantity * Number(item.price || 0)).toFixed(2);
        return "<tr>" +
          "<td style=\"padding:8px 12px;border-bottom:1px solid #ddd\">" + name + "</td>" +
          "<td style=\"padding:8px 12px;text-align:center;border-bottom:1px solid #ddd\">" + quantity + "</td>" +
          "<td style=\"padding:8px 12px;text-align:right;border-bottom:1px solid #ddd\">€" + escapeHtml(price) + "</td>" +
          "<td style=\"padding:8px 12px;text-align:right;border-bottom:1px solid #ddd\">€" + escapeHtml(lineTotal) + "</td>" +
          "</tr>";
      }).join("")
    : "<tr><td colspan=\"4\" style=\"padding:10px 12px\">Your order details are available from your order-status page.</td></tr>";
  const addressParts = [
    order.shipping_address_line1,
    [order.shipping_postcode, order.shipping_city].filter(Boolean).join(" "),
    order.shipping_country
  ].filter(Boolean).map(escapeHtml);
  const addressHtml = addressParts.length ? addressParts.join("<br>") : "Delivery details are available from your order.";
  const baseUrl = String(process.env.PUBLIC_BASE_URL || "").replace(/\/$/, "");
  const statusUrl = baseUrl
    ? baseUrl + "/payment-result?order=" + encodeURIComponent(String(orderId))
    : "/payment-result?order=" + encodeURIComponent(String(orderId));

  return sendEmail({
    to: order.customer_email,
    subject: "FLIGALIGA — Order #" + orderId + " received",
    idempotencyKey: "order-received/" + orderId,
    html:
      "<!doctype html><html><body style=\"font-family:Arial,sans-serif;color:#2b261f;line-height:1.5\">" +
      "<h1>FLIGALIGA</h1>" +
      "<p>Dear " + customerName + ",</p>" +
      "<p>Your order <strong>#" + orderId + "</strong> has been received.</p>" +
      "<h2>Order summary</h2>" +
      "<table style=\"border-collapse:collapse;width:100%;max-width:700px\">" +
      "<thead><tr>" +
      "<th style=\"padding:8px 12px;text-align:left\">Item</th>" +
      "<th style=\"padding:8px 12px;text-align:center\">Qty</th>" +
      "<th style=\"padding:8px 12px;text-align:right\">Price</th>" +
      "<th style=\"padding:8px 12px;text-align:right\">Total</th>" +
      "</tr></thead><tbody>" +
      itemRows +
      "</tbody></table>" +
      "<p><strong>Order total: €" + escapeHtml(total) + "</strong></p>" +
      "<h2>Delivery address</h2>" +
      "<p>" + addressHtml + "</p>" +
      "<p>Your payment is being handled securely. You can check the latest order status here:</p>" +
      "<p><a href=\"" + escapeHtml(statusUrl) + "\">View order status</a></p>" +
      "<p>Thank you for travelling with FLIGALIGA.</p>" +
      "</body></html>",
    fetchImpl
  });
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
      "<p><a href=\"" + escapeHtml(statusUrl) + "\">View your order</a></p>" +
      "<p>Your treasure is now confirmed for processing.</p>" +
      "</body></html>",
    fetchImpl
  });
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
      "<p>You can revisit the withdrawal information here: <a href=\"" + escapeHtml(withdrawalUrl) + "\">Withdrawal information</a></p>" +
      "</body></html>",
    fetchImpl
  });
}

async function sendContactMessageEmail(message, fetchImpl = globalThis.fetch) {
  const name = escapeHtml(message.name || "Visitor");
  const email = String(message.email || "").trim().toLowerCase();
  const text = escapeHtml(message.message || "").replace(/\n/g, "<br>");
  const recipient = String(process.env.CONTACT_RECIPIENT || "fligaliga@hotmail.com").trim();

  return sendEmail({
    to: recipient,
    subject: "FLIGALIGA — Contact message from " + name,
    replyTo: email,
    idempotencyKey: "contact-message/" + String(message.idempotencyKey),
    html:
      "<!doctype html><html><body>" +
      "<h1>FLIGALIGA — Contact message</h1>" +
      "<p><strong>From:</strong> " + name + "</p>" +
      "<p><strong>Email:</strong> " + escapeHtml(email) + "</p>" +
      "<hr>" +
      "<p>" + text + "</p>" +
      "</body></html>",
    fetchImpl
  });
}

module.exports = {
  isEmailConfigured,
  sendEmail,
  sendOrderReceivedEmail,
  sendPaymentConfirmationEmail,
  sendWithdrawalConfirmationEmail,
  sendContactMessageEmail
};
