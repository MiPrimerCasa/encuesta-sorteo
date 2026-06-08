#!/usr/bin/env node
/** Prueba login en producción (o URL base por env). */
const base = (process.env.LEADS_URL || 'https://www.miprimercasafsa-sorteo.com/leads').replace(/\/$/, '');
const [usuario, password] = process.argv.slice(2);
if (!usuario || !password) {
  console.error('Uso: node scripts/test-prod-login.mjs <usuario> <password>');
  process.exit(1);
}

const res = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ usuario, password }),
});
const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  console.error('HTTP', res.status, text.slice(0, 500));
  process.exit(1);
}
console.log('HTTP', res.status);
console.log(JSON.stringify(data, null, 2));
if (data?.usuario?.rol === 'superadmin') {
  console.log('\n✓ Rol superadmin OK');
} else if (res.ok) {
  console.log(`\n⚠ Rol actual: ${data?.usuario?.rol} (esperado: superadmin si SUPERADMIN_LOGIN_IDS está en VPS)`);
}
