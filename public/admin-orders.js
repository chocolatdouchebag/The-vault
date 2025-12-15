async function loadOrders() {
  const res = await fetch("/api/admin/orders");

  if (!res.ok) {
    alert("Admin only!");
    return;
  }

  const data = await res.json();
  const list = document.getElementById("orders");
  list.innerHTML = "";

  data.forEach(order => {
    const li = document.createElement("li");

    let itemsHtml = order.items.map(i =>
      `${i.name} x ${i.quantity} (€${i.price_each})`
    ).join("<br>");

    li.innerHTML = `
      <strong>Order #${order.id}</strong><br>
      User: ${order.username}<br>
      Total: €${order.total}<br>
      Date: ${order.created_at}<br>
      <details>
        <summary>Items</summary>
        ${itemsHtml}
      </details>
      <hr>
    `;

    list.appendChild(li);
  });
}

// load immediately
loadOrders();
