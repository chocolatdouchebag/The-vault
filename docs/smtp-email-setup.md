# FLIGALIGA SMTP email setup

This project sends transactional email through SMTP using Nodemailer. It does not require Resend. STRATO is the default SMTP server, but the SMTP host can be changed through environment variables.

## Configure the STRATO mailbox

Create a mailbox such as \`orders@fligaliga.nl\` in your STRATO package. Use the mailbox password, not the STRATO customer-account password.

Add these values to your **local** \`.env\` file:

\`\`\`dotenv
SMTP_HOST=smtp.strato.de
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=orders@fligaliga.nl
SMTP_PASS=your-mailbox-password
SMTP_FROM=FLIGALIGA <orders@fligaliga.nl>
SMTP_TEST_TO=fligaliga@hotmail.com
CONTACT_RECIPIENT=fligaliga@hotmail.com
\`\`\`

Port 465 uses implicit SSL/TLS. The username is the full email address. Leave TLS certificate validation enabled. Never commit \`.env\` or share the mailbox password.

If your STRATO package shows that DNS email authentication needs attention, follow the records shown in the STRATO dashboard. Do not replace existing MX, SPF, DKIM, or DMARC records blindly.

## Test delivery without checkout

After pulling this branch and installing dependencies, run:

\`\`\`bash
npm ci
npm run email:test
\`\`\`

This command verifies SMTP authentication and sends one clearly labelled test message to \`SMTP_TEST_TO\` (or \`CONTACT_RECIPIENT\` if the former is empty). It does **not** create an order, call Mollie, touch the database, or change product stock. It sends a real email, so only run it once you are ready to send that test message.

To run template regression tests without sending real email, use:

\`\`\`bash
npm run test:email
\`\`\`

## Checkout remains separate

Keep \`PAYMENTS_ENABLED=false\` while the current purchase flow is broken. SMTP testing confirms only that mail can be sent; it does not validate checkout, payment creation, payment webhooks, stock reservation, or order lifecycle.

Once checkout is repaired, test those flows separately in Mollie test mode before enabling live payments.

## Delivery and duplicate notes

SMTP confirmation means the mail server accepted the message, not that it reached the inbox. Check spam/junk folders and test delivery from the actual hosting environment too; some hosting providers restrict outbound SMTP.

SMTP has no universal equivalent to Resend's API idempotency key. FLIGALIGA continues to use its database sent timestamps to suppress normal repeat notifications; the custom notification header is for tracing, not a guarantee that an SMTP server will deduplicate concurrent sends. A durable outbox/retry worker can be added later if stronger delivery guarantees become necessary.
