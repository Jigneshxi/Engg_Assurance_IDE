import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
function App() {
  const [cart, setCart] = useState([]);
  const [error, setError] = useState('');
  const headers = { 'X-Fixture-User': '1', 'Content-Type': 'application/json' };
  async function load() {
    const response = await fetch('/api/cart', { headers });
    if (!response.ok) throw new Error('Cart request failed');
    setCart(await response.json());
  }
  useEffect(() => { load().catch(e => setError(e.message)); }, []);
  async function add() {
    const response = await fetch('/api/cart', { method: 'POST', headers, body: JSON.stringify({ product_id: 1, quantity: 1 }) });
    if (!response.ok) { setError('Unable to add item'); return; }
    await load();
  }
  return <main><h1>Validation cart</h1><button onClick={add}>Add fixture product</button><p data-testid="quantity">{cart.reduce((n, item) => n + item.quantity, 0)}</p>{error && <p role="alert">{error}</p>}</main>;
}
createRoot(document.getElementById('root')).render(<App />);
