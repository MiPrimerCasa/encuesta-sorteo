#!/usr/bin/env node
/** Prueba GET /api/admin/dashboard en producción tras login superadmin. */
const base = (process.env.LEADS_URL || 'https://www.miprimercasafsa-sorteo.com/leads').replace(/\/$/, '');
const [usuario, password] = process.argv.slice(2);
if (!usuario || !password) {
  console.error('Uso: node scripts/test-prod-admin.mjs <usuario> <password>');
  process.exit(1);
}

const loginRes = await fetch(`${base}/api/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ usuario, password }),
});
const login = await loginRes.json();
if (!loginRes.ok) {
  console.error('Login falló', loginRes.status, login);
  process.exit(1);
}
console.log('Login:', login.usuario.rol, login.usuario.nombre);

const u = login.usuario;
const dashRes = await fetch(`${base}/api/admin/dashboard`, {
  headers: {
    'x-usuario-id': String(u.id),
    'x-usuario-rol': String(u.rol),
    'x-usuario-nombre': String(u.nombre),
    'x-usuario-login-id': String(u.loginId || ''),
  },
});
const dash = await dashRes.json();
console.log('Dashboard HTTP', dashRes.status);
if (!dashRes.ok) {
  console.error(JSON.stringify(dash, null, 2));
  process.exit(1);
}
console.log('Supervisores:', dash.supervisores?.length ?? 0);
console.log('Leads (suma equipos):', dash.supervisores?.reduce((a, s) => a + (s.totalLeads ?? 0), 0) ?? 0);
console.log('Aviso:', dash.aviso || '(ninguno)');
if (u.rol === 'superadmin') console.log('\n✓ Panel superadmin operativo');
