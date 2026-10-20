"use strict";

// Test-only global.fetch preload. Never call the real Mollie API for this test.
const originalFetch = globalThis.fetch.bind(globalThis);
const state = { amount: null, metadata: null };
const paymentId = "tr_mysql_migration_checkout_test";

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === "string"
    ? input
    : input instanceof URL
      ? input.toString()
      : String(input?.url || "");
  if (!url.startsWith("https://api.mollie.com/v2/payments")) {
    return originalFetch(input, init);
  }

  const method = String(init.method || "GET").toUpperCase();
  if (method === "POST" && url === "https://api.mollie.com/v2/payments") {
    try {
      const body = JSON.parse(String(init.body || "{}"));
      state.amount = body.amount;
      state.metadata = body.metadata || {};
    } catch {
      return new Response(JSON.stringify({ error: "invalid synthetic test payload" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      id: paymentId,
      status: "open",
      amount: state.amount,
      metadata: state.metadata,
      _links: { checkout: { href: "https://checkout.invalid/" + paymentId } }
    }), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  }

  if (method === "GET" && url === "https://api.mollie.com/v2/payments/" + paymentId) {
    return new Response(JSON.stringify({
      id: paymentId,
      status: "failed",
      amount: state.amount || { currency: "EUR", value: "19.99" },
      metadata: state.metadata || {}
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }

  if (method === "DELETE" && url === "https://api.mollie.com/v2/payments/" + paymentId) {
    return new Response(JSON.stringify({
      id: paymentId,
      status: "canceled",
      amount: state.amount || { currency: "EUR", value: "19.99" },
      metadata: state.metadata || {}
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ error: "unexpected synthetic Mollie API request" }), {
    status: 404,
    headers: { "content-type": "application/json" }
  });
};
