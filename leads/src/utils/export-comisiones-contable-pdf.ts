import { jsPDF } from 'jspdf';
import { formatearMontoArs } from '../domain/venta';
import type { InformeComisionesContable } from '../types';

function esc(text: string | number | null | undefined) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fechaLargaEs(d = new Date()) {
  return d.toLocaleDateString('es-AR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function buildHtmlComisionesContable(opts: {
  data: InformeComisionesContable;
  periodoLabel: string;
  firmanteNombre: string;
  firmanteLogin?: string;
}) {
  const { data, periodoLabel, firmanteNombre, firmanteLogin } = opts;
  const lugarFecha = `Formosa, ${fechaLargaEs()}`;
  const salarioFijo = Number(data.salarioFijo || 800000);
  const totalALiquidar = Number(
    data.totalALiquidar != null ? data.totalALiquidar : data.totalComision + salarioFijo,
  );
  const asunto = `Liquidación de comisiones y salarios — período ${periodoLabel}`;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>${esc(asunto)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "Times New Roman", Times, Georgia, serif;
      color: #111;
      font-size: 12pt;
      line-height: 1.45;
      margin: 0;
      padding: 24px;
      background: #fff;
    }
    .sheet { max-width: 190mm; margin: 0 auto; }
    .head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #1a1a1a;
      padding-bottom: 10px;
      margin-bottom: 18px;
    }
    .empresa { font-size: 14pt; font-weight: 700; letter-spacing: 0.02em; }
    .empresa-sub { font-size: 9.5pt; color: #444; margin-top: 2px; }
    .doc-tipo { text-align: right; font-size: 10pt; color: #333; }
    .meta { margin: 14px 0 18px; font-size: 11pt; }
    .meta p { margin: 3px 0; }
    .asunto { font-weight: 700; margin: 16px 0 12px; }
    p { margin: 0 0 10px; text-align: justify; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 18px;
      font-size: 11pt;
    }
    th, td {
      border: 1px solid #333;
      padding: 7px 9px;
      vertical-align: top;
    }
    th {
      background: #f3f3f3;
      text-align: left;
      font-weight: 700;
    }
    td.num, th.num { text-align: right; white-space: nowrap; }
    .total-row td {
      font-weight: 700;
      background: #f7f7f7;
    }
    .cierre { margin-top: 22px; }
    .pie {
      margin-top: 36px;
      padding-top: 8px;
      border-top: 1px solid #ccc;
      font-size: 8.5pt;
      color: #666;
    }
    @media print {
      body { padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="sheet">
    <div class="head">
      <div>
        <div class="empresa">Mi Primer Casa S.A.</div>
        <div class="empresa-sub">Informe interno de liquidación de comisiones y salarios</div>
      </div>
      <div class="doc-tipo">
        Nota contable<br/>
        ${esc(data.periodoCodigo || periodoLabel)}
      </div>
    </div>

    <div class="meta">
      <p><strong>${esc(lugarFecha)}</strong></p>
      <p><strong>Para:</strong> Departamento Contable — Mi Primer Casa</p>
      <p><strong>De:</strong> ${esc(firmanteNombre)}${firmanteLogin ? ` &lt;${esc(firmanteLogin)}&gt;` : ''}</p>
      <p class="asunto"><strong>Asunto:</strong> ${esc(asunto)}</p>
    </div>

    <p>
      Por medio de la presente me dirijo al Departamento Contable a fin de informar el
      <strong>monto total de comisiones y salarios</strong> correspondientes al período
      <strong>${esc(periodoLabel)}</strong>, calculado conforme a las condiciones de liquidación
      vigentes: salario fijo de <strong>$800.000 (pesos ochocientos mil)</strong>;
      <strong>$2.000 (pesos dos mil)</strong> por cada Plan Inversión Joven vendido
      <strong>solo si se alcanzan 100 adhesiones</strong>; y el
      <strong>1% (uno por ciento)</strong> del total recaudado por adhesiones de terrenos
      <strong>solo si se alcanzan 30 adhesiones</strong>.
    </p>

    <p>A continuación se detallan los datos de base y el importe resultante:</p>

    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th class="num">Cantidad</th>
          <th class="num">Base / criterio</th>
          <th class="num">Importe</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>Salario fijo</strong><br/>
            <span style="font-size:10pt;color:#444">Remuneración mensual</span>
          </td>
          <td class="num">—</td>
          <td class="num">Fijo mensual</td>
          <td class="num">${esc(formatearMontoArs(salarioFijo))}</td>
        </tr>
        <tr>
          <td>
            <strong>Plan Inversión Joven</strong><br/>
            <span style="font-size:10pt;color:#444">
              Objetivo 100 · ${esc(data.pij.objetivoCumplido ? 'cumplido' : 'no alcanzado — sin comisión')}
            </span>
          </td>
          <td class="num">${esc(data.pij.cantidad)}</td>
          <td class="num">${esc(data.pij.cantidad)} × ${esc(formatearMontoArs(data.pij.unitario))}</td>
          <td class="num">${esc(formatearMontoArs(data.pij.comision))}</td>
        </tr>
        <tr>
          <td>
            <strong>Adhesiones de terrenos</strong><br/>
            <span style="font-size:10pt;color:#444">
              Objetivo 30 · ${esc(data.terrenos.objetivoCumplido ? 'cumplido' : 'no alcanzado — sin 1%')} ·
              Recaudado: ${esc(formatearMontoArs(data.terrenos.montoRecaudado))}
            </span>
          </td>
          <td class="num">${esc(data.terrenos.cantidad)}</td>
          <td class="num">1% de ${esc(formatearMontoArs(data.terrenos.montoRecaudado))}</td>
          <td class="num">${esc(formatearMontoArs(data.terrenos.comision))}</td>
        </tr>
        <tr>
          <td colspan="3"><strong>Subtotal comisiones</strong></td>
          <td class="num">${esc(formatearMontoArs(data.totalComision))}</td>
        </tr>
        <tr class="total-row">
          <td colspan="3"><strong>Total a liquidar (comisiones + salario)</strong></td>
          <td class="num">${esc(formatearMontoArs(totalALiquidar))}</td>
        </tr>
      </tbody>
    </table>

    <p>
      En resumen, para el período informado se registraron
      <strong>${esc(data.pij.cantidad)}</strong> ventas de Plan Inversión Joven
      (${esc(data.pij.objetivoCumplido ? 'objetivo 100 cumplido — comisión incluida' : 'objetivo 100 no alcanzado — comisión no incluida')})
      y <strong>${esc(data.terrenos.cantidad)}</strong> adhesiones de terrenos
      (${esc(data.terrenos.objetivoCumplido ? 'objetivo 30 cumplido — 1% incluido' : 'objetivo 30 no alcanzado — 1% no incluido')}),
      con un recaudado en adhesiones de terrenos de
      <strong>${esc(formatearMontoArs(data.terrenos.montoRecaudado))}</strong>.
      El monto total a abonar asciende a
      <strong>${esc(formatearMontoArs(totalALiquidar))}</strong>
      = salario fijo ${esc(formatearMontoArs(salarioFijo))}
      ${data.pij.objetivoCumplido ? ` + comisión PIJ ${esc(formatearMontoArs(data.pij.comision))}` : ''}
      ${data.terrenos.objetivoCumplido ? ` + comisión terrenos ${esc(formatearMontoArs(data.terrenos.comision))}` : ''}
      ${!data.pij.objetivoCumplido && !data.terrenos.objetivoCumplido ? ' (solo salario fijo; ninguna comisión alcanzó objetivo)' : ''}.
    </p>

    <p class="cierre">
      Sin otro particular, saludo atte. al Departamento Contable.
    </p>

    <div class="pie">
      Documento generado el ${esc(new Date(data.generadoEn).toLocaleString('es-AR'))}
      ${data.idEjercicioDetalle != null ? ` · idEjercicioDetalle ${esc(data.idEjercicioDetalle)}` : ''}
      · Destino: ${esc(data.destinatario)}
    </div>
  </div>
</body>
</html>`;
}

/**
 * Abre la nota formal y dispara imprimir / Guardar como PDF.
 * Usa Blob URL (más fiable que about:blank + document.write).
 */
export function abrirPdfComisionesContable(opts: {
  data: InformeComisionesContable;
  periodoLabel: string;
  firmanteNombre: string;
  firmanteLogin?: string;
}) {
  const html = buildHtmlComisionesContable(opts);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  // Sin noopener: necesitamos la referencia a la ventana.
  const w = window.open(url, '_blank');
  if (!w) {
    URL.revokeObjectURL(url);
    // Fallback: iframe oculto en la misma página.
    return imprimirViaIframe(html);
  }

  const onLoad = () => {
    try {
      w.focus();
      w.print();
    } catch {
      /* el usuario puede imprimir manualmente desde la pestaña */
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
  };

  // Chrome/Edge: el load del blob a veces ya pasó.
  try {
    if (w.document?.readyState === 'complete') {
      setTimeout(onLoad, 200);
    } else {
      w.addEventListener('load', () => setTimeout(onLoad, 200));
      setTimeout(onLoad, 800);
    }
  } catch {
    setTimeout(onLoad, 500);
  }

  return true;
}

function slugArchivo(texto: string) {
  return String(texto || 'periodo')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 60);
}

type PdfOpts = {
  data: InformeComisionesContable;
  periodoLabel: string;
  firmanteNombre: string;
  firmanteLogin?: string;
};

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

/** Genera el PDF binario de la liquidación. */
function buildPdfComisionesContable(opts: PdfOpts): jsPDF {
  const { data, periodoLabel, firmanteNombre, firmanteLogin } = opts;
  const salarioFijo = Number(data.salarioFijo || 800000);
  const totalALiquidar = Number(
    data.totalALiquidar != null ? data.totalALiquidar : data.totalComision + salarioFijo,
  );
  const lugarFecha = `Formosa, ${fechaLargaEs()}`;
  const deLinea = firmanteLogin
    ? `De: ${firmanteNombre} <${firmanteLogin}>`
    : `De: ${firmanteNombre}`;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 18;
  const contentW = pageW - marginX * 2;
  let y = 18;

  doc.setFont('times', 'bold');
  doc.setFontSize(14);
  doc.text('Mi Primer Casa S.A.', marginX, y);
  doc.setFont('times', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(70);
  doc.text('Informe interno de liquidación de comisiones y salarios', marginX, y + 6);
  doc.setTextColor(0);
  doc.setFontSize(10);
  doc.text('Nota contable', pageW - marginX, y, { align: 'right' });
  doc.text(String(data.periodoCodigo || periodoLabel), pageW - marginX, y + 5, {
    align: 'right',
  });

  y += 12;
  doc.setDrawColor(26);
  doc.setLineWidth(0.5);
  doc.line(marginX, y, pageW - marginX, y);
  y += 10;

  doc.setFontSize(11);
  doc.setFont('times', 'bold');
  doc.text(lugarFecha, marginX, y);
  y += 6;
  doc.setFont('times', 'normal');
  doc.text('Para: Departamento Contable — Mi Primer Casa', marginX, y);
  y += 5.5;
  doc.text(deLinea, marginX, y);
  y += 5.5;
  doc.setFont('times', 'bold');
  doc.text(`Asunto: Liquidación de comisiones y salarios — período ${periodoLabel}`, marginX, y);
  y += 9;

  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  const objetivoPij = data.reglas.objetivoPij ?? 100;
  const objetivoTerrenos = data.reglas.objetivoTerrenos ?? 30;
  const intro = [
    `Por medio de la presente me dirijo al Departamento Contable a fin de informar el monto total de comisiones y salarios correspondientes al período ${periodoLabel}, calculado conforme a las condiciones de liquidación vigentes: salario fijo de $800.000 (pesos ochocientos mil); $2.000 (pesos dos mil) por cada Plan Inversión Joven vendido solo si se alcanzan ${objetivoPij} adhesiones; y el 1% (uno por ciento) del total recaudado por adhesiones de terrenos solo si se alcanzan ${objetivoTerrenos} adhesiones.`,
    'A continuación se detallan los datos de base y el importe resultante:',
  ];
  for (const parrafo of intro) {
    const lines = wrapText(doc, parrafo, contentW);
    doc.text(lines, marginX, y);
    y += lines.length * 5 + 3;
  }

  // Tabla
  const colX = [marginX, marginX + 62, marginX + 82, marginX + 130];
  const colW = [62, 20, 48, contentW - 130];
  const rowH = 12;
  const headers = ['Concepto', 'Cant.', 'Base / criterio', 'Importe'];
  const rows: Array<[string, string, string, string, boolean?]> = [
    [
      'Salario fijo\nRemuneración mensual',
      '—',
      'Fijo mensual',
      formatearMontoArs(salarioFijo),
    ],
    [
      `Plan Inversión Joven\nObj. ${objetivoPij}: ${data.pij.objetivoCumplido ? 'cumplido' : 'no alcanzado'}`,
      String(data.pij.cantidad),
      `${data.pij.cantidad} × ${formatearMontoArs(data.pij.unitario)}`,
      formatearMontoArs(data.pij.comision),
    ],
    [
      `Adhesiones de terrenos\nObj. ${objetivoTerrenos}: ${data.terrenos.objetivoCumplido ? 'cumplido' : 'no alcanzado'}`,
      String(data.terrenos.cantidad),
      `1% de ${formatearMontoArs(data.terrenos.montoRecaudado)}`,
      formatearMontoArs(data.terrenos.comision),
    ],
    ['Subtotal comisiones', '', '', formatearMontoArs(data.totalComision)],
    [
      'Total a liquidar (comisiones + salario)',
      '',
      '',
      formatearMontoArs(totalALiquidar),
      true,
    ],
  ];

  // Header
  doc.setFillColor(243, 243, 243);
  doc.rect(marginX, y, contentW, 8, 'FD');
  doc.setFont('times', 'bold');
  doc.setFontSize(10);
  headers.forEach((h, i) => {
    const align = i === 0 ? 'left' : 'right';
    const x = i === 0 ? colX[i] + 2 : colX[i] + colW[i] - 2;
    doc.text(h, x, y + 5.5, { align });
  });
  y += 8;

  doc.setFont('times', 'normal');
  rows.forEach((row) => {
    const isTotal = Boolean(row[4]);
    const cellH = row[0].includes('\n') ? rowH + 2 : rowH;
    if (isTotal) {
      doc.setFillColor(247, 247, 247);
      doc.rect(marginX, y, contentW, cellH, 'FD');
      doc.setFont('times', 'bold');
    } else if (row[0].startsWith('Subtotal')) {
      doc.setFont('times', 'bold');
    } else {
      doc.setFont('times', 'normal');
    }
    doc.setDrawColor(51);
    doc.setLineWidth(0.2);
    doc.rect(marginX, y, contentW, cellH);

    const conceptoLines = String(row[0]).split('\n');
    doc.setFontSize(10);
    doc.text(conceptoLines[0], colX[0] + 2, y + 4.5);
    if (conceptoLines[1]) {
      doc.setFontSize(8.5);
      doc.setTextColor(80);
      doc.setFont('times', 'normal');
      doc.text(conceptoLines[1], colX[0] + 2, y + 9);
      doc.setTextColor(0);
      if (isTotal || row[0].startsWith('Subtotal')) doc.setFont('times', 'bold');
    }
    doc.setFontSize(10);
    if (row[1]) {
      doc.text(row[1], colX[1] + colW[1] - 2, y + 5.5, { align: 'right' });
    }
    if (row[2]) {
      doc.text(row[2], colX[2] + colW[2] - 2, y + 5.5, { align: 'right' });
    }
    doc.text(row[3], colX[3] + colW[3] - 2, y + 5.5, { align: 'right' });
    y += cellH;
  });

  y += 8;
  doc.setFont('times', 'normal');
  doc.setFontSize(11);
  const resumenPartes = [
    `salario fijo ${formatearMontoArs(salarioFijo)}`,
    data.pij.objetivoCumplido ? `comisión PIJ ${formatearMontoArs(data.pij.comision)}` : null,
    data.terrenos.objetivoCumplido
      ? `comisión terrenos ${formatearMontoArs(data.terrenos.comision)}`
      : null,
  ].filter(Boolean);
  const resumen = `En resumen, para el período informado se registraron ${data.pij.cantidad} ventas de Plan Inversión Joven (${data.pij.objetivoCumplido ? 'objetivo 100 cumplido — comisión incluida' : 'objetivo 100 no alcanzado — comisión no incluida'}) y ${data.terrenos.cantidad} adhesiones de terrenos (${data.terrenos.objetivoCumplido ? 'objetivo 30 cumplido — 1% incluido' : 'objetivo 30 no alcanzado — 1% no incluido'}), con un recaudado en adhesiones de terrenos de ${formatearMontoArs(data.terrenos.montoRecaudado)}. El monto total a abonar asciende a ${formatearMontoArs(totalALiquidar)} = ${resumenPartes.join(' + ')}${!data.pij.objetivoCumplido && !data.terrenos.objetivoCumplido ? ' (solo salario fijo)' : ''}.`;
  const resumenLines = wrapText(doc, resumen, contentW);
  doc.text(resumenLines, marginX, y);
  y += resumenLines.length * 5 + 8;

  doc.text('Sin otro particular, saludo atte. al Departamento Contable.', marginX, y);
  y += 14;

  doc.setDrawColor(200);
  doc.line(marginX, y, pageW - marginX, y);
  y += 5;
  doc.setFontSize(8);
  doc.setTextColor(100);
  const pie = [
    `Documento generado el ${new Date(data.generadoEn).toLocaleString('es-AR')}`,
    data.idEjercicioDetalle != null ? `idEjercicioDetalle ${data.idEjercicioDetalle}` : null,
    `Destino: ${data.destinatario}`,
  ]
    .filter(Boolean)
    .join(' · ');
  doc.text(pie, marginX, y);

  return doc;
}

/**
 * Descarga un PDF nativo (.pdf) de la liquidación.
 */
export function guardarDocumentoComisionesContable(opts: PdfOpts) {
  const doc = buildPdfComisionesContable(opts);
  const periodoSlug = slugArchivo(opts.data.yyyyMm || opts.data.periodoCodigo || opts.periodoLabel);
  const nombre = `liquidacion-comisiones-salarios-${periodoSlug || 'periodo'}.pdf`;
  doc.save(nombre);
  return true;
}

function imprimirViaIframe(html: string) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('title', 'Comisiones contable PDF');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    document.body.removeChild(iframe);
    alert('No se pudo abrir el PDF. Permití ventanas emergentes e intentá de nuevo.');
    return false;
  }

  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } finally {
      setTimeout(() => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      }, 1000);
    }
  }, 300);

  return true;
}
