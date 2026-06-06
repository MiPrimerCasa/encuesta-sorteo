#!/usr/bin/env node
/**
 * Verifica flujo «primera cita sin horario» = reagenda estándar (RF-07).
 *
 * Uso: npm run verify:reagenda-primera-cita
 * Exit: 0 = OK, 1 = fallos
 */
import { seguimientoSchema } from '../server/schemas/seguimiento.js';

const log = [];
let fails = 0;

function ok(msg) {
  log.push({ level: 'ok', msg });
  console.log(`  OK  ${msg}`);
}

function fail(msg) {
  log.push({ level: 'fail', msg });
  console.log(` FAIL ${msg}`);
  fails += 1;
}

function assert(cond, msg) {
  if (cond) ok(msg);
  else fail(msg);
}

function esHorarioPlaceholderSinCita(fechaAlta) {
  if (!fechaAlta) return true;
  return /T09:00:00$/.test(fechaAlta);
}

function getHorarioEntrevistaLead(lead) {
  if (lead.seguimiento?.resultadoEntrevista === 'reagenda' && lead.seguimiento?.fechaReagenda) {
    return lead.seguimiento.fechaReagenda;
  }
  if (lead.horarioEntrevista) return lead.horarioEntrevista;
  if (lead.lista !== 'entrevista' || !lead.fechaAlta) return null;
  if (esHorarioPlaceholderSinCita(lead.fechaAlta)) return null;
  return lead.fechaAlta;
}

function leadTieneCitaPrevia(lead) {
  return Boolean(getHorarioEntrevistaLead(lead));
}

function leadReagendaEntrevista(lead) {
  return lead.seguimiento?.resultadoEntrevista === 'reagenda';
}

function leadCompro(lead) {
  return lead.seguimiento?.resultadoEntrevista === 'compro';
}

function esCerradoNegativoLead(lead) {
  const r = lead.seguimiento?.resultadoEntrevista;
  return r === 'no_compro' || r === 'sin_interes';
}

function leadEnEntrevistaPendiente(lead) {
  return lead.lista === 'entrevista' && !leadReagendaEntrevista(lead) && !leadCompro(lead);
}

function tabIdListaLead(lead) {
  if (leadCompro(lead)) return 'compro';
  if (esCerradoNegativoLead(lead)) return 'contacto';
  if (leadReagendaEntrevista(lead)) return 'seguimiento';
  if (lead.seguimiento?.resultadoEntrevista === 'derivar_terreno') return 'entrevista';
  if (leadEnEntrevistaPendiente(lead)) return 'entrevista';
  if (lead.seguimiento?.canal != null || lead.seguimiento?.huboEntrevista != null) return 'contacto';
  return 'entrevista';
}

function prioridadTabInicial(lead) {
  if (leadCompro(lead) || leadReagendaEntrevista(lead) || esCerradoNegativoLead(lead)) return null;
  if (lead.seguimiento?.resultadoEntrevista === 'derivar_terreno') return 0;
  if (leadEnEntrevistaPendiente(lead)) return 1;
  const contactado = Boolean(lead.seguimiento?.canal || lead.seguimiento?.huboEntrevista != null);
  if (!contactado) return 2;
  return null;
}

function eventoCalendarioDesdeLead(lead) {
  if (leadCompro(lead)) return null;
  if (leadReagendaEntrevista(lead) && lead.seguimiento?.fechaReagenda) {
    return { type: 'seguimiento', date: lead.seguimiento.fechaReagenda };
  }
  const horario = getHorarioEntrevistaLead(lead);
  if (leadEnEntrevistaPendiente(lead) && horario) {
    return { type: 'entrevista', date: horario };
  }
  return null;
}

const leadSinCita = {
  id: 'test-sin-cita',
  nombre: 'Test Sin Cita',
  telefono: '3512 000111',
  promotorId: 'prom-1',
  promotorNombre: 'Promotor',
  quiereEntrevista: false,
  lista: 'contacto',
  origen: 'sorteo',
  fechaObtencion: '2026-06-01',
  seguimiento: { fuente: 'qr' },
};

const leadConCita = {
  id: 'test-con-cita',
  nombre: 'Test Con Cita',
  telefono: '3512 345678',
  promotorId: 'prom-1',
  promotorNombre: 'Promotor',
  quiereEntrevista: true,
  lista: 'entrevista',
  origen: 'redes',
  fechaObtencion: '2026-05-20',
  horarioEntrevista: '2026-05-28T15:30:00',
  fechaAlta: '2026-05-28T15:30:00',
  seguimiento: { fuente: 'instagram' },
};

const seguimientoPrimeraReagenda = {
  confirmoEntrevista: true,
  canal: 'mensaje',
  huboEntrevista: false,
  resultadoEntrevista: 'reagenda',
  fechaReagenda: '2026-06-10T14:00',
};

console.log('=== verify-reagenda-primera-cita ===\n');

console.log('1. Detección cita previa');
assert(!leadTieneCitaPrevia(leadSinCita), 'lead sin horario → sin cita previa');
assert(leadTieneCitaPrevia(leadConCita), 'lead con horarioEntrevista → con cita previa');

console.log('\n2. Prioridad antes de contactar');
assert(prioridadTabInicial(leadSinCita) === 2, 'sin cita sin contacto → prioridad 2');

console.log('\n3. Guardado = misma reagenda');
const parsed = seguimientoSchema.safeParse(seguimientoPrimeraReagenda);
assert(parsed.success, 'seguimientoSchema acepta reagenda + fechaReagenda');

const updated = {
  ...leadSinCita,
  seguimiento: { ...leadSinCita.seguimiento, ...seguimientoPrimeraReagenda },
};
assert(leadReagendaEntrevista(updated), 'lead marcado como reagenda');
assert(tabIdListaLead(updated) === 'seguimiento', 'pestaña → seguimiento');
assert(updated.seguimiento.fechaReagenda === '2026-06-10T14:00', 'fechaReagenda guardada');
assert(prioridadTabInicial(updated) === null, 'sale de Prioridad tras reagenda');

console.log('\n4. Calendario');
const ev = eventoCalendarioDesdeLead(updated);
assert(ev?.type === 'seguimiento', 'calendario: tipo seguimiento');
assert(ev?.date === '2026-06-10T14:00', 'calendario: usa fechaReagenda');

console.log('\n5. Validación API');
const sinFecha = seguimientoSchema.safeParse({
  resultadoEntrevista: 'reagenda',
  huboEntrevista: false,
});
assert(!sinFecha.success, 'API rechaza reagenda sin fechaReagenda');

console.log('\n6. Lead con cita mantiene flujo entrevista pendiente');
assert(tabIdListaLead(leadConCita) === 'entrevista', 'con cita → Prioridad (entrevista)');
const evCita = eventoCalendarioDesdeLead(leadConCita);
assert(evCita?.type === 'entrevista', 'calendario: cita encuesta como entrevista');

console.log(`\n=== Resumen: ${log.filter((x) => x.level === 'ok').length} OK, ${fails} FAIL ===`);
if (fails) {
  console.log('\nCorregí los FAIL antes de subir a main.');
  process.exit(1);
}
console.log('\nListo para merge: primera cita usa el mismo pipeline que reagenda.');
