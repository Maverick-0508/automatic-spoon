import { Client, Property, WorkOrder } from './types.js';

export interface QuotePackage {
  textBody: string;
  htmlBody: string;
  pdfFilename: string;
  pdfBytes: Buffer;
}

export function isQuoteRequest(title: string, description?: string | null): boolean {
  const haystack = `${title}\n${description || ''}`.toLowerCase();
  return ['quote', 'estimate', 'quotation'].some(keyword => haystack.includes(keyword));
}

function extractTasks(title: string, description?: string | null): string[] {
  const tasks: string[] = [];
  if (description) {
    for (const rawLine of description.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      if (line.startsWith('- ') || line.startsWith('* ')) {
        tasks.push(line.slice(2).trim());
        continue;
      }
      if (line.length > 2 && /^\d+[.)]/.test(line)) {
        tasks.push(line.replace(/^\d+[.)]\s*/, '').trim());
        continue;
      }
      tasks.push(line);
    }
  }

  if (tasks.length === 0) {
    tasks.push(title);
  }

  return tasks.filter(Boolean);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function buildQuoteDocument(params: {
  client: Client;
  property?: Property | null;
  workOrder: WorkOrder;
}): string {
  const { client, property, workOrder } = params;
  const tasks = extractTasks(workOrder.title, workOrder.description);
  const createdAt = workOrder.createdAt ? new Date(workOrder.createdAt) : new Date();
  const propertyAddress = property?.address ?? 'Not provided';
  const propertyZone = property?.zone ? property.zone : 'Not provided';

  const dateStr = createdAt.toISOString().replace('T', ' ').substring(0, 16) + ' UTC';

  const lines = [
    'LawnCraft Detailed Quote',
    `Quote reference: WO-${String(workOrder.id).padStart(6, '0')}`,
    `Prepared on: ${dateStr}`,
    '',
    'Customer Details',
    `Name: ${client.fullName}`,
    `Email: ${client.email || 'Not provided'}`,
    `Phone: ${client.phone || 'Not provided'}`,
    '',
    'Property Details',
    `Address: ${propertyAddress}`,
    `Zone: ${propertyZone}`,
    '',
    'Requested Scope',
    `Summary: ${workOrder.title}`,
  ];

  if (workOrder.description) {
    lines.push('', 'Request Notes', workOrder.description.trim());
  }

  lines.push('', 'Task Breakdown');
  tasks.forEach((task, index) => {
    lines.push(`${index + 1}. ${task}`);
  });

  lines.push(
    '',
    'Quote Notes',
    '- Pricing is subject to final site inspection and material selection.',
    '- If additional tasks are requested on site, the scope should be updated before work begins.',
    '- Reply to this email to approve the quote or request changes.'
  );

  return lines.join('\n');
}

export function buildQuoteHtmlDocument(params: {
  client: Client;
  property?: Property | null;
  workOrder: WorkOrder;
}): string {
  const { client, property, workOrder } = params;
  const tasks = extractTasks(workOrder.title, workOrder.description);
  const createdAt = workOrder.createdAt ? new Date(workOrder.createdAt) : new Date();
  const propertyAddress = property?.address ?? 'Not provided';
  const propertyZone = property?.zone ? property.zone : 'Not provided';
  const dateStr = createdAt.toISOString().replace('T', ' ').substring(0, 16) + ' UTC';

  const taskItems = tasks.map(task => `<li>${escapeHtml(task)}</li>`).join('');
  let notesBlock = '';
  if (workOrder.description) {
    notesBlock = `
      <section class="card">
        <h2>Request Notes</h2>
        <pre>${escapeHtml(workOrder.description.trim())}</pre>
      </section>
    `;
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <style>
      body { font-family: Arial, sans-serif; color: #1f2937; line-height: 1.5; }
      .page { max-width: 760px; margin: 0 auto; padding: 24px; }
      h1 { margin-bottom: 0.25rem; }
      h2 { margin-top: 1.5rem; margin-bottom: 0.5rem; }
      .meta { color: #6b7280; margin-top: 0; }
      .card { background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 12px; padding: 16px; margin-bottom: 16px; }
      ul, ol { margin-top: 0.5rem; }
      pre { white-space: pre-wrap; font-family: inherit; margin: 0; }
    </style>
  </head>
  <body>
    <main class="page">
      <h1>LawnCraft Detailed Quote</h1>
      <p class="meta">Quote reference: WO-${String(workOrder.id).padStart(6, '0')} | Prepared on: ${dateStr}</p>

      <section class="card">
        <h2>Customer Details</h2>
        <p><strong>Name:</strong> ${escapeHtml(client.fullName)}</p>
        <p><strong>Email:</strong> ${escapeHtml(client.email || 'Not provided')}</p>
        <p><strong>Phone:</strong> ${escapeHtml(client.phone || 'Not provided')}</p>
      </section>

      <section class="card">
        <h2>Property Details</h2>
        <p><strong>Address:</strong> ${escapeHtml(propertyAddress)}</p>
        <p><strong>Zone:</strong> ${escapeHtml(propertyZone)}</p>
      </section>

      <section class="card">
        <h2>Requested Scope</h2>
        <p><strong>Summary:</strong> ${escapeHtml(workOrder.title)}</p>
      </section>

      ${notesBlock}

      <section class="card">
        <h2>Task Breakdown</h2>
        <ol>${taskItems}</ol>
      </section>

      <section class="card">
        <h2>Quote Notes</h2>
        <ul>
          <li>Pricing is subject to final site inspection and material selection.</li>
          <li>If additional tasks are requested on site, the scope should be updated before work begins.</li>
          <li>Reply to this email to approve the quote or request changes.</li>
        </ul>
      </section>
    </main>
  </body>
</html>`;
}

function escapePdfText(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function wrapPdfLines(lines: string[], width: number = 92): string[] {
  const wrapped: string[] = [];
  for (const line of lines) {
    if (!line) {
      wrapped.push('');
      continue;
    }
    if (line.length <= width) {
      wrapped.push(line);
      continue;
    }
    const words = line.split(' ');
    let current = '';
    for (const w of words) {
      if ((current + (current ? ' ' : '') + w).length <= width) {
        current += (current ? ' ' : '') + w;
      } else {
        if (current) wrapped.push(current);
        current = w;
      }
    }
    if (current) wrapped.push(current);
  }
  return wrapped;
}

export function buildQuotePdfDocument(params: {
  client: Client;
  property?: Property | null;
  workOrder: WorkOrder;
}): Buffer {
  const textBody = buildQuoteDocument(params);
  const lines = wrapPdfLines(textBody.split('\n'));

  const contentLines = ['BT', '/F1 10 Tf', '72 760 Td'];
  lines.forEach((line, index) => {
    if (index > 0) {
      contentLines.push('0 -14 Td');
    }
    contentLines.push(`(${escapePdfText(line)}) Tj`);
  });
  contentLines.push('ET');

  const stream = Buffer.from(contentLines.join('\n'), 'latin1');
  const objects: Buffer[] = [];

  const addObject = (content: string | Buffer) => {
    if (typeof content === 'string') {
      objects.push(Buffer.from(content, 'latin1'));
    } else {
      objects.push(content);
    }
  };

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObject(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>'
  );
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  addObject(
    Buffer.concat([
      Buffer.from(`<< /Length ${stream.length} >>\nstream\n`, 'ascii'),
      stream,
      Buffer.from('\nendstream', 'ascii'),
    ])
  );

  const pdfChunks: Buffer[] = [Buffer.from('%PDF-1.4\n', 'ascii')];
  const offsets: number[] = [0];

  let currentLength = pdfChunks[0].length;
  objects.forEach((obj, index) => {
    offsets.push(currentLength);
    const header = Buffer.from(`${index + 1} 0 obj\n`, 'ascii');
    const footer = Buffer.from('\nendobj\n', 'ascii');
    pdfChunks.push(header, obj, footer);
    currentLength += header.length + obj.length + footer.length;
  });

  const xrefOffset = currentLength;
  let xrefStr = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    xrefStr += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  const trailerStr = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  pdfChunks.push(Buffer.from(xrefStr, 'ascii'), Buffer.from(trailerStr, 'ascii'));
  return Buffer.concat(pdfChunks);
}

export function buildQuotePackage(params: {
  client: Client;
  property?: Property | null;
  workOrder: WorkOrder;
}): QuotePackage {
  return {
    textBody: buildQuoteDocument(params),
    htmlBody: buildQuoteHtmlDocument(params),
    pdfFilename: `quote-wo-${String(params.workOrder.id).padStart(6, '0')}.pdf`,
    pdfBytes: buildQuotePdfDocument(params),
  };
}
