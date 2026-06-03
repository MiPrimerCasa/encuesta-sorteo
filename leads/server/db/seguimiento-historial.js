/**
 * Historial append-only de estados de seguimiento (SQLite hoy; misma forma para SQL Server).
 */

const RESULTADO_LABEL = {
  sin_interes: 'Sin interés',
  reagenda: 'Reagenda',
  no_compro: 'No compró',
  compro: 'Compró',
  derivar_terreno: 'Derivó interés terreno',
};

const PESTANA_LABEL = {
  entrevista: 'Prioridad',
  contacto: 'Contactado',
  seguimiento: 'En seguimiento',
  compro: 'Cierres',
};

/** Pestaña CRM alineada a src/domain/leads.ts → tabIdListaLead (sin importar frontend). */
export function pestanaDesdeSeguimiento(seguimiento, lead = {}) {
  const r = seguimiento?.resultadoEntrevista;
  if (r === 'compro') return 'compro';
  if (r === 'no_compro' || r === 'sin_interes') return 'contacto';
  if (r === 'reagenda') return 'seguimiento';
  if (r === 'derivar_terreno') return 'entrevista';
  const lista = lead.lista;
  const horario = lead.horarioEntrevista || lead.fechaAlta;
  const placeholder = horario && /T09:00:00$/.test(String(horario));
  const entrevistaPendiente =
    lista === 'entrevista' && r !== 'reagenda' && r !== 'compro' && horario && !placeholder;
  if (r === 'derivar_terreno' || entrevistaPendiente) return 'entrevista';
  if (seguimiento?.canal != null || seguimiento?.huboEntrevista != null) return 'contacto';
  return 'entrevista';
}

export function etiquetaEstadoSeguimiento(seguimiento, lead = {}) {
  const partes = [];
  const r = seguimiento?.resultadoEntrevista;

  if (r) {
    let texto = RESULTADO_LABEL[r] || r;
    if (r === 'reagenda' && seguimiento.seguimientoPijPromotor) {
      texto = 'Reagenda PIJ (tras no compró)';
    }
    partes.push(texto);
  } else if (seguimiento?.huboEntrevista === true) {
    partes.push('Entrevista registrada');
  } else if (seguimiento?.huboEntrevista === false) {
    partes.push('Sin entrevista');
  } else if (seguimiento?.canal) {
    partes.push(`Contacto por ${seguimiento.canal}`);
  } else if (seguimiento?.confirmoEntrevista === false) {
    partes.push('No confirmó entrevista');
  } else if (seguimiento?.confirmoEntrevista === true) {
    partes.push('Confirmó entrevista');
  } else {
    partes.push('Actualización');
  }

  if (seguimiento?.fechaReagenda) {
    partes.push(`próx. ${seguimiento.fechaReagenda.replace('T', ' ')}`);
  }
  if (seguimiento?.horarioEntrevistaPropuesto?.trim()) {
    partes.push(`cita terreno ${seguimiento.horarioEntrevistaPropuesto.replace('T', ' ')}`);
  }
  if (r === 'compro' && seguimiento?.idProducto) {
    partes.push(seguimiento.idProducto);
    if (seguimiento.estadoPago) partes.push(seguimiento.estadoPago);
  }

  const pestana = pestanaDesdeSeguimiento(seguimiento, lead);
  partes.push(`→ ${PESTANA_LABEL[pestana] || pestana}`);

  return partes.join(' · ');
}

export function normalizarOperadorHistorial(usuario, usuarioIdFallback) {
  if (!usuario) {
    return {
      operadorId: usuarioIdFallback ?? null,
      operadorRol: null,
      operadorNombre: 'Sistema',
    };
  }
  return {
    operadorId: String(usuario.id ?? usuarioIdFallback ?? ''),
    operadorRol: usuario.rol ?? null,
    operadorNombre: usuario.nombre ?? 'Operador',
  };
}

export function filaHistorialDesdeEstado({
  leadId,
  seguimiento,
  lead,
  operador,
}) {
  const pestana = pestanaDesdeSeguimiento(seguimiento, lead);
  return {
    leadId: String(leadId),
    operadorId: operador.operadorId,
    operadorRol: operador.operadorRol,
    operadorNombre: operador.operadorNombre,
    estadoEtiqueta: etiquetaEstadoSeguimiento(seguimiento, lead),
    resultadoEntrevista: seguimiento?.resultadoEntrevista ?? null,
    pestana,
    seguimientoSnapshot: { ...seguimiento },
  };
}
