"use strict";

require("dotenv").config();

const {
  isEmailConfigured,
  verifyEmailConnection,
  sendEmail
} = require("../email");

async function main() {
  if (!isEmailConfigured()) {
    throw new Error("SMTP is not configured. Set SMTP_USER and SMTP_PASS in your local .env first.");
  }

  const recipient = String(
    process.env.SMTP_TEST_TO ||
    process.env.CONTACT_RECIPIENT ||
    ""
  ).trim();
  if (!recipient) {
    throw new Error("Set SMTP_TEST_TO or CONTACT_RECIPIENT to an inbox you can access.");
  }

  console.log("Checking SMTP connection and authentication...");
  await verifyEmailConnection();
  console.log("SMTP connection verified.");

  const result = await sendEmail({
    to: recipient,
    subject: "FLIGALIGA SMTP test — no order created",
    idempotencyKey: "smtp-manual-test/" + new Date().toISOString(),
    html:
      "<!doctype html><html><body style=\"font-family:Arial,sans-serif;line-height:1.5\">" +
      "<h1>FLIGALIGA email test</h1>" +
      "<p>This is a test email sent directly through the configured SMTP server.</p>" +
      "<p><strong>No order was created, no payment was attempted, and no stock or database records were changed.</strong></p>" +
      "<p>If you received this message, SMTP delivery is working from the environment where the test was run.</p>" +
      "</body></html>"
  });

  if (!result.sent) {
    throw new Error("SMTP test email was skipped: " + String(result.reason || "unknown reason"));
  }

  console.log("SMTP test message accepted by the mail server.");
  console.log("Recipient: " + recipient);
  console.log("Message ID: " + String(result.id || "(not provided by server)"));
  console.log("Check the inbox and spam folder.");
}

main().catch(err => {
  console.error("SMTP test failed:", err.message);
  process.exitCode = 1;
});
