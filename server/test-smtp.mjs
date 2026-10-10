// test-smtp.mjs
// Run this on the SAME machine/host where your wgate-server.mjs runs (same env vars).
//   node test-smtp.mjs you@example.com
//
// It will print exactly what's wrong: missing env vars, auth failure, or
// network/port blocked.

import nodemailer from 'nodemailer';

const to = process.argv[2];
if (!to) {
  console.error('Usage: node test-smtp.mjs recipient@example.com');
  process.exit(1);
}

console.log('--- Checking env vars ---');
console.log('SMTP_USER:', process.env.SMTP_USER ? `set (${process.env.SMTP_USER})` : 'MISSING');
console.log('SMTP_PASS:', process.env.SMTP_PASS ? `set (length ${process.env.SMTP_PASS.length})` : 'MISSING');
console.log('SMTP_FROM:', process.env.SMTP_FROM || '(not set, will fall back to SMTP_USER)');

if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
  console.error('\n❌ SMTP_USER or SMTP_PASS is not set in this process\'s environment.');
  console.error('   That alone is enough to make sendEmail() silently no-op in your app.');
  process.exit(1);
}

console.log('\n--- Creating transporter ---');
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

console.log('--- Verifying connection/auth (transporter.verify) ---');
try {
  await transporter.verify();
  console.log('✅ SMTP connection + auth OK');
} catch (err) {
  console.error('❌ SMTP verify failed:');
  console.error('   code:', err.code);
  console.error('   responseCode:', err.responseCode);
  console.error('   message:', err.message);
  process.exit(1);
}

console.log(`\n--- Sending a real test email to ${to} ---`);
try {
  const info = await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject: 'WGate SMTP test',
    text: 'If you got this, SMTP sending works from this server.',
  });
  console.log('✅ Sent. messageId:', info.messageId);
  console.log('   accepted:', info.accepted);
  console.log('   rejected:', info.rejected);
} catch (err) {
  console.error('❌ sendMail failed:');
  console.error('   code:', err.code);
  console.error('   responseCode:', err.responseCode);
  console.error('   command:', err.command);
  console.error('   message:', err.message);
  process.exit(1);
}
