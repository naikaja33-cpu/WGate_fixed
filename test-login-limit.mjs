// test-login-limit.mjs
// Quick check of the login lockout. Run with the API running:
//   node test-login-limit.mjs
// (set API=https://your-backend.onrender.com/api to test the live server)
const API = process.env.API || 'http://localhost:4400/api';

const societies = await (await fetch(`${API}/public/societies`)).json();
if (!societies.length) throw new Error('No societies found to test with');
const society_id = societies[0].id;

// A made-up email, so no real account is ever locked.
const email = `lockout-test-${Date.now()}@example.com`;
const codes = [];
for (let i = 1; i <= 10; i++) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: `wrong-${i}`, society_id }),
  });
  codes.push(res.status);
}
console.log('Responses:', codes.join(' '));
console.log(
  codes.slice(0, 8).every((c) => c === 401) && codes.slice(8).every((c) => c === 429)
    ? 'PASS: 8 wrong passwords answered 401, then locked out with 429.'
    : 'CHECK: expected eight 401 followed by 429 (is the new code deployed?).'
);