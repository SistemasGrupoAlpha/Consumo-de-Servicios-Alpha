import { readingMonth, readingNumber } from '../lib/registro-lecturas.mjs';

const navy = [22, 50, 67];
const muted = [70, 92, 107];
const line = [211, 221, 228];
const pale = [234, 242, 246];
const quantities = new Intl.NumberFormat('es-HN', { maximumFractionDigits: 9 });
const monthFormat = new Intl.DateTimeFormat('es-HN', { month: 'long', timeZone: 'UTC' });
const capitalize = value => value.charAt(0).toUpperCase() + value.slice(1);

export function reportMonthLabel(month) {
  const date = new Date(`${month}-01T12:00:00Z`);
  return `${capitalize(monthFormat.format(date))} ${month.slice(0, 4)}`;
}

function dateLabel(value) {
  const date = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return '—';
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.valueOf())) return '—';
  return `${parsed.getUTCDate()} ${monthFormat.format(parsed)} ${parsed.getUTCFullYear()}`;
}

function storedValue(value) {
  const number = readingNumber(value);
  if (number !== null) return quantities.format(number);
  return String(value ?? '').trim() || '—';
}

export function createReadingReport(jsPDF, entries) {
  const pdf = new jsPDF({ format: 'a4', unit: 'mm', compress: true });
  pdf.setProperties({ title: 'Informe de consumo', subject: 'Lecturas del medidor' });

  function print(value, x, y, size, bold = false, color = navy, maxWidth, align = 'left') {
    pdf.setTextColor(...color);
    pdf.setFont('helvetica', bold ? 'bold' : 'normal');
    pdf.setFontSize(size);
    pdf.text(String(value), x, y, { maxWidth, align });
  }

  function rule(y) {
    pdf.setDrawColor(...line);
    pdf.line(15, y, 195, y);
  }

  entries.forEach(({ row, evidence }, index) => {
    if (index) pdf.addPage();
    const month = readingMonth(row);
    const label = reportMonthLabel(month);
    const meter = row.Medidor || row.NumeroSerie || row.MedidorHistorialId;
    const service = row.TipoMedidor || 'Servicio';
    pdf.setFillColor(...navy);
    pdf.rect(0, 0, 210, 45, 'F');
    print(`INFORME DE CONSUMO DE ${service.toUpperCase()}`, 15, 17, 20, true, [255, 255, 255], 180);
    print(`Detalle de lectura | ${label}`, 15, 27, 12, false, [216, 231, 240]);
    print(`Medidor ${meter}`, 15, 37, 12, true, [255, 255, 255], 180);
    print('DATOS DEL REGISTRO', 15, 57, 11, true);

    const fields = [
      ['Fecha de lectura', dateLabel(row.FechaLectura), 15, 68],
      ['Periodo', row.Periodo || month, 109, 68],
      ['Tipo de medidor', service, 15, 86],
      ['Mes / Año', `${label.slice(0, -5)} / ${month.slice(0, 4)}`, 109, 86],
    ];
    for (const [name, value, x, y] of fields) {
      print(name, x, y, 10, false, muted);
      print(value, x, y + 7, 12, true, navy, 84);
    }

    rule(102);
    print('LECTURAS Y COBRO', 15, 112, 11, true);
    print('EVIDENCIA FOTOGRÁFICA', 111, 112, 11, true);
    const amounts = [
      ['Lectura inicial', row.LecturaInicial], ['Lectura final', row.LecturaFinal],
      ['Consumo registrado', row.Consumo], ['Cuota aplicada', row.CuotaAplicada],
    ];
    amounts.forEach(([name, value], i) => {
      const y = 123 + i * 14;
      print(name, 15, y, 11, false, muted);
      print(storedValue(value), 80, y, 12, true, navy, 18);
    });
    pdf.setFillColor(...pale);
    pdf.roundedRect(15, 179, 83, 15, 2.5, 2.5, 'F');
    print('Total a pagar', 19, 188.6, 11, true);
    print(storedValue(row.TotalPagar), 96, 189.3, 15, true, navy, 33, 'right');
    print('Valores conservados del registro original.', 15, 204, 8, false, muted);

    if (evidence?.image) {
      const { image, width, height } = evidence;
      const scale = Math.min(84 / width, 145 / height);
      pdf.addImage(image, 'JPEG', 111 + (84 - width * scale) / 2, 191 - height * scale / 2, width * scale, height * scale);
      print(`Fotografía del medidor ${meter}`, 111, 270, 9, false, muted, 84);
    } else {
      print(evidence?.unavailable ? 'No se pudo cargar la fotografía.' : 'No se adjuntó fotografía.', 111, 126, 10, false, muted, 84);
    }

    rule(278);
    print('Consumo de Servicios', 15, 284, 9, false, muted);
    print(`Página ${index + 1}`, 177, 284, 9, false, muted);
  });
  return pdf;
}

async function loadEvidence(row, request, enabled) {
  if (!enabled) return { unavailable: true };
  try {
    const { photos } = await request(`/api/fotos?kind=lecturas&id=${encodeURIComponent(row.id)}`);
    if (!photos?.length) return {};
    for (const { url } of photos) {
      try {
        const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) continue;
        const source = await createImageBitmap(await response.blob());
        try {
          const factor = Math.min(1, 1400 / Math.max(source.width, source.height));
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(source.width * factor));
          canvas.height = Math.max(1, Math.round(source.height * factor));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
          return { image: canvas.toDataURL('image/jpeg', .85), width: canvas.width, height: canvas.height };
        } finally {
          source.close();
        }
      } catch {
        // The next attachment can still provide the evidence.
      }
    }
  } catch {
    return { unavailable: true };
  }
  return { unavailable: true };
}

export async function downloadReadingReport(rows, request, photosEnabled) {
  const { jsPDF } = await import('jspdf');
  const entries = [];
  for (let start = 0; start < rows.length; start += 4) {
    const batch = rows.slice(start, start + 4);
    entries.push(...await Promise.all(batch.map(async row => ({ row, evidence: await loadEvidence(row, request, photosEnabled) }))));
  }
  const { row } = entries[0];
  const filenamePart = value => String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9-]+/gi, '_').slice(0, 64);
  const months = [...new Set(rows.map(readingMonth))];
  const period = months.length > 1 ? `${months[0]}_a_${months.at(-1)}` : months[0];
  const name = `Informe_Consumo_${filenamePart(row.TipoMedidor || 'Servicio')}_${filenamePart(row.Medidor || row.MedidorHistorialId)}_${period}.pdf`;
  createReadingReport(jsPDF, entries).save(name);
}
