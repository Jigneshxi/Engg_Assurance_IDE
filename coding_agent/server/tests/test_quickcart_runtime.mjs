// server/test_quickcart_runtime.mjs
// Comprehensive End-to-End API Runtime Validation for QuickCart

import assert from 'node:assert';

const BASE_URL = 'http://127.0.0.1:8000';

async function request(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const res = await fetch(url, {
    ...options,
    headers
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, headers: res.headers, body: json };
}

async function runTests() {
  console.log('=== QUICKCART END-TO-END RUNTIME VALIDATION ===\n');
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    process.stdout.write(`Testing: ${name}... `);
    try {
      await fn();
      console.log('✅ PASS');
      passed++;
    } catch (err) {
      console.log('❌ FAIL');
      console.error('   ', err.message);
      failed++;
    }
  }

  // 1. Health check
  await test('1. GET /health & /api/health', async () => {
    const res1 = await request('/health');
    assert.strictEqual(res1.status, 200, `Expected 200, got ${res1.status}`);
    assert.strictEqual(res1.body.status, 'ok');

    const res2 = await request('/api/health');
    assert.strictEqual(res2.status, 200, `Expected 200, got ${res2.status}`);
    assert.strictEqual(res2.body.status, 'ok');
  });

  // 2. Categories
  let sampleCategoryId;
  await test('2. Category Flow: GET /api/categories & GET /api/categories/{id}', async () => {
    const res = await request('/api/categories');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body), 'Categories should be an array');
    assert(res.body.length >= 3, `Expected at least 3 categories, got ${res.body.length}`);
    sampleCategoryId = res.body[0].id;

    const detailRes = await request(`/api/categories/${sampleCategoryId}`);
    assert.strictEqual(detailRes.status, 200);
    assert.strictEqual(detailRes.body.id, sampleCategoryId);
  });

  // 3. Products
  let sampleProductId;
  await test('3. Product Flow: GET /api/products & GET /api/products/{id}', async () => {
    const res = await request('/api/products');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body), 'Products should be an array');
    assert(res.body.length >= 5, `Expected at least 5 products, got ${res.body.length}`);
    sampleProductId = res.body[0].id;

    const detailRes = await request(`/api/products/${sampleProductId}`);
    assert.strictEqual(detailRes.status, 200);
    assert.strictEqual(detailRes.body.id, sampleProductId);
    assert(detailRes.body.title, 'Product should have title');
    assert(detailRes.body.price > 0, 'Product should have positive price');
  });

  // 4. Search
  await test('4. Search Flow: GET /api/search?query=laptop', async () => {
    const res = await request('/api/search?query=laptop');
    assert.strictEqual(res.status, 200);
    assert(Array.isArray(res.body), 'Search result should be an array');
    assert(res.body.length >= 1, 'Should find at least 1 product matching laptop');
    assert.strictEqual(res.body[0].title, 'Laptop');
  });

  // 5. Authentication Flow
  const testUserEmail = `buyer_${Date.now()}@example.com`;
  const testUserPass = 'securePassword123';
  let buyerToken = null;
  let _buyerId = null;

  await test('5. Auth Flow: POST /api/register', async () => {
    const res = await request('/api/register', {
      method: 'POST',
      body: JSON.stringify({
        email: testUserEmail,
        password: testUserPass,
        full_name: 'Test Buyer',
        is_admin: 0
      })
    });
    assert.strictEqual(res.status, 201, `Register returned status ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.access_token, 'Register response should contain access_token');
    buyerToken = res.body.access_token;
    _buyerId = res.body.id;
  });

  await test('6. Auth Flow: POST /api/login', async () => {
    const res = await request('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        email: testUserEmail,
        password: testUserPass
      })
    });
    assert.strictEqual(res.status, 200, `Login returned status ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.access_token, 'Login response should contain access_token');
    buyerToken = res.body.access_token;
  });

  await test('7. Auth Flow: GET /api/me with Bearer token', async () => {
    const res = await request('/api/me', {
      headers: {
        Authorization: `Bearer ${buyerToken}`
      }
    });
    assert.strictEqual(res.status, 200, `GET /me returned ${res.status}`);
    assert.strictEqual(res.body.email, testUserEmail);
  });

  // 8. Admin Auth
  let adminToken = null;
  await test('8. Admin Auth: Login as admin@example.com', async () => {
    const res = await request('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        email: 'admin@example.com',
        password: 'adminpassword'
      })
    });
    assert.strictEqual(res.status, 200, `Admin login returned ${res.status}: ${JSON.stringify(res.body)}`);
    assert(res.body.access_token, 'Admin login response should contain access_token');
    assert.strictEqual(res.body.is_admin, 1, 'User should be admin');
    adminToken = res.body.access_token;
  });

  // 9. Cart Flow
  let addedCartItemId = null;
  await test('9. Cart Flow: POST /api/cart & GET /api/cart', async () => {
    // Add product to cart
    const addRes = await request('/api/cart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerToken}` },
      body: JSON.stringify({
        product_id: sampleProductId,
        quantity: 2
      })
    });
    assert([200, 201].includes(addRes.status), `Add to cart failed with ${addRes.status}: ${JSON.stringify(addRes.body)}`);
    addedCartItemId = addRes.body.id;

    // Read cart
    const cartRes = await request('/api/cart', {
      headers: { Authorization: `Bearer ${buyerToken}` }
    });
    assert.strictEqual(cartRes.status, 200);
    assert(Array.isArray(cartRes.body), 'Cart should be an array');
    const item = cartRes.body.find(i => i.id === addedCartItemId || i.product_id === sampleProductId);
    assert(item, 'Added item should be in cart');
  });

  await test('10. Cart Flow: PUT /api/cart/{id} & DELETE /api/cart/{id}', async () => {
    // Update quantity
    const updateRes = await request(`/api/cart/${addedCartItemId}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${buyerToken}` },
      body: JSON.stringify({
        product_id: sampleProductId,
        quantity: 3
      })
    });
    assert.strictEqual(updateRes.status, 200);
    assert.strictEqual(updateRes.body.quantity, 3);

    // Delete item
    const delRes = await request(`/api/cart/${addedCartItemId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${buyerToken}` }
    });
    assert([200, 204].includes(delRes.status), `Delete from cart failed with ${delRes.status}`);

    // Verify empty
    const cartRes = await request('/api/cart', {
      headers: { Authorization: `Bearer ${buyerToken}` }
    });
    assert.strictEqual(cartRes.status, 200);
    const item = cartRes.body.find(i => i.id === addedCartItemId);
    assert(!item, 'Item should no longer be in cart');
  });

  // 11. Checkout and Order Flow
  let createdOrderId = null;
  await test('11. Checkout & Orders: Add item, Checkout, Verify order', async () => {
    // Add item to cart for checkout
    const addRes = await request('/api/cart', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerToken}` },
      body: JSON.stringify({
        product_id: sampleProductId,
        quantity: 1
      })
    });
    assert([200, 201].includes(addRes.status));

    // Checkout
    const checkoutRes = await request('/api/orders/checkout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${buyerToken}` },
      body: JSON.stringify({
        name: 'Test Buyer',
        address: '123 Market St'
      })
    });
    assert([200, 201].includes(checkoutRes.status), `Checkout failed with ${checkoutRes.status}: ${JSON.stringify(checkoutRes.body)}`);
    assert(checkoutRes.body.id, 'Checkout should return an order with id');
    createdOrderId = checkoutRes.body.id;

    // Verify order history
    const historyRes = await request('/api/orders/history', {
      headers: { Authorization: `Bearer ${buyerToken}` }
    });
    assert.strictEqual(historyRes.status, 200);
    assert(Array.isArray(historyRes.body), 'Order history should be an array');
    const order = historyRes.body.find(o => o.id === createdOrderId);
    assert(order, 'Created order should be in order history');

    // Verify single order
    const singleOrderRes = await request(`/api/orders/${createdOrderId}`, {
      headers: { Authorization: `Bearer ${buyerToken}` }
    });
    assert.strictEqual(singleOrderRes.status, 200);
    assert.strictEqual(singleOrderRes.body.id, createdOrderId);
  });

  // 12. Admin Flow
  await test('12. Admin Flow: List products, orders, users, and update status', async () => {
    // Admin list products
    const prodRes = await request('/api/admin/products', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(prodRes.status, 200, `Admin list products failed: ${prodRes.status}`);
    assert(Array.isArray(prodRes.body));

    // Admin list orders
    const ordRes = await request('/api/admin/orders', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(ordRes.status, 200, `Admin list orders failed: ${ordRes.status}`);
    assert(Array.isArray(ordRes.body));

    // Admin list users
    const userRes = await request('/api/admin/users', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    assert.strictEqual(userRes.status, 200, `Admin list users failed: ${userRes.status}`);
    assert(Array.isArray(userRes.body));
    assert(userRes.body.length >= 2, 'Should have at least 2 users');

    // Admin update order status
    const updateRes = await request(`/api/orders/${createdOrderId}/status`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        status: 'shipped'
      })
    });
    assert.strictEqual(updateRes.status, 200, `Admin update status failed: ${updateRes.status}`);
    assert.strictEqual(updateRes.body.status, 'shipped');
  });

  console.log(`\nValidation complete: ${passed} passed, ${failed} failed.`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  process.exit(1);
});
