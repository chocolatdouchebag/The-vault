"use strict";

async function releaseReservedStock(pool, orderId, status = "payment_failed") {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const order = await client.query(
      "SELECT status, stock_released_at FROM orders WHERE id = $1 FOR UPDATE",
      [orderId]
    );

    if (!order.rows.length) {
      await client.query("ROLLBACK");
      return { released: false, reason: "not_found" };
    }

    if (order.rows[0].stock_released_at || order.rows[0].status === "paid") {
      await client.query("COMMIT");
      return { released: false, reason: "already_final" };
    }

    const items = await client.query(
      "SELECT product_id, quantity FROM order_items WHERE order_id = $1",
      [orderId]
    );

    for (const item of items.rows) {
      await client.query(
        "UPDATE products SET stock = stock + $1 WHERE id = $2",
        [item.quantity, item.product_id]
      );
    }

    await client.query(
      "UPDATE orders SET status = $1, stock_released_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
      [status, orderId]
    );

    await client.query("COMMIT");
    return { released: true, reason: "released" };
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

async function fetchMolliePayment(paymentId, apiKey, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(
    "https://api.mollie.com/v2/payments/" + encodeURIComponent(paymentId),
    {
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(10000)
    }
  );

  const payment = await response.json().catch(() => null);
  if (!response.ok || !payment?.id) return null;
  return payment;
}

async function cancelMolliePayment(paymentId, apiKey, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(
    "https://api.mollie.com/v2/payments/" + encodeURIComponent(paymentId),
    {
      method: "DELETE",
      headers: {
        "Authorization": "Bearer " + apiKey,
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(10000)
    }
  );

  const payment = await response.json().catch(() => null);
  if (!response.ok || !payment?.id) return null;
  return payment;
}

async function cleanupExpiredPaymentReservations({
  pool,
  apiKey,
  fetchImpl = globalThis.fetch,
  limit = 25,
  onPaid = null
}) {
  if (!apiKey) return { scanned: 0, released: 0, paid: 0 };

  const expired = await pool.query(
    "SELECT id, payment_id, total FROM orders " +
    "WHERE status = 'payment_pending' " +
    "AND stock_released_at IS NULL " +
    "AND payment_expires_at <= CURRENT_TIMESTAMP " +
    "ORDER BY id LIMIT $1",
    [limit]
  );

  let released = 0;
  let paid = 0;

  for (const order of expired.rows) {
    try {
      if (!order.payment_id) {
        const result = await releaseReservedStock(pool, order.id, "payment_expired");
        if (result.released) released++;
        continue;
      }

      const payment = await fetchMolliePayment(order.payment_id, apiKey, fetchImpl);

      if (!payment) continue;

      const paymentAmount =
        payment.amount?.currency === "EUR" ? Number(payment.amount.value) : NaN;

      if (
        !Number.isFinite(paymentAmount) ||
        Math.abs(paymentAmount - Number(order.total)) > 0.005
      ) {
        continue;
      }

      if (payment.status === "paid") {
        const result = await pool.query(
          "UPDATE orders SET status = 'paid', " +
          "paid_at = COALESCE(paid_at, CURRENT_TIMESTAMP), " +
          "updated_at = CURRENT_TIMESTAMP " +
          "WHERE id = $1 AND status = 'payment_pending' AND stock_released_at IS NULL",
          [order.id]
        );
        if (result.rowCount === 1) {
          paid++;
          if (typeof onPaid === "function") {
            try {
              await onPaid(order.id);
            } catch (emailErr) {
              console.error("Payment confirmation email failed for order", order.id, emailErr);
            }
          }
        }
        continue;
      }

      if (["failed", "canceled", "expired"].includes(payment.status)) {
        const result = await releaseReservedStock(
          pool,
          order.id,
          "payment_" + payment.status
        );
        if (result.released) released++;
        continue;
      }

      if (payment.isCancelable === true) {
        const canceledPayment = await cancelMolliePayment(
          order.payment_id,
          apiKey,
          fetchImpl
        );

        if (canceledPayment?.status === "canceled") {
          const result = await releaseReservedStock(
            pool,
            order.id,
            "payment_expired"
          );
          if (result.released) released++;
        }
      }
    } catch (err) {
      console.error("Payment reservation cleanup failed for order", order.id, err);
    }
  }

  return { scanned: expired.rows.length, released, paid };
}

module.exports = {
  releaseReservedStock,
  fetchMolliePayment,
  cancelMolliePayment,
  cleanupExpiredPaymentReservations
};
