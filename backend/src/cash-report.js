const PDFDocument = require('pdfkit');

function money(cents) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format((cents || 0) / 100);
}

function dateTime(value) {
  if (!value) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo'
  }).format(new Date(`${value.replace(' ', 'T')}Z`));
}

function generateCashReport({ session, payments, products }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 48, info: {
      Title: `Fechamento de Caixa #${session.id}`,
      Author: 'PDV-PRO LIVRARIA'
    } });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const navy = '#17233c';
    const blue = '#315fcb';
    const muted = '#758096';
    const line = '#e6e9ef';

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(20).text('PDV-PRO LIVRARIA');
    doc.fillColor(blue).fontSize(10).text('RELATORIO DE FECHAMENTO DE CAIXA');
    doc.moveDown(1.4);
    doc.fillColor(navy).fontSize(15).text(`Caixa #${session.id}`);
    doc.moveDown(.4);
    doc.fillColor(muted).font('Helvetica').fontSize(9)
      .text(`Abertura: ${dateTime(session.opened_at)}`)
      .text(`Fechamento: ${dateTime(session.closed_at)}`)
      .text(`Aberto por: ${session.opened_by_name}`)
      .text(`Fechado por: ${session.closed_by_name}`);

    doc.moveDown(1.3);
    const cards = [
      ['Faturamento', money(session.revenue_cents)],
      ['Vendas', String(session.sales_count)],
      ['Itens vendidos', String(session.items_sold)],
      ['Lucro bruto', money(session.gross_profit_cents)]
    ];
    const cardWidth = 118;
    const startX = 48;
    const cardY = doc.y;
    cards.forEach(([label, value], index) => {
      const x = startX + index * (cardWidth + 10);
      doc.roundedRect(x, cardY, cardWidth, 62, 7).fillAndStroke('#f6f8fc', line);
      doc.fillColor(muted).font('Helvetica').fontSize(8).text(label, x + 10, cardY + 12, { width: cardWidth - 20 });
      doc.fillColor(navy).font('Helvetica-Bold').fontSize(12).text(value, x + 10, cardY + 32, { width: cardWidth - 20 });
    });
    doc.y = cardY + 82;
    doc.x = 48;

    doc.fillColor(navy).font('Helvetica-Bold').fontSize(12).text('Resumo financeiro');
    doc.moveDown(.7);
    const rows = [
      ['Faturamento bruto', money(session.revenue_cents + session.discounts_cents)],
      ['Descontos concedidos', money(session.discounts_cents)],
      ['Faturamento liquido', money(session.revenue_cents)],
      ['Lucro bruto estimado', money(session.gross_profit_cents)]
    ];
    rows.forEach(([label, value]) => {
      const y = doc.y;
      doc.fillColor(muted).font('Helvetica').fontSize(9).text(label, 48, y);
      doc.fillColor(navy).font('Helvetica-Bold').text(value, 360, y, { width: 185, align: 'right' });
      doc.y = y + 20;
      doc.x = 48;
      doc.moveTo(48, doc.y).lineTo(547, doc.y).strokeColor(line).stroke();
      doc.y += 8;
    });

    doc.y += 8;
    doc.x = 48;
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(12).text('Formas de pagamento');
    doc.moveDown(.6);
    const paymentNames = {
      cash: 'Dinheiro', pix: 'Pix', credit_card: 'Cartao de credito',
      debit_card: 'Cartao de debito', other: 'Outro'
    };
    if (!payments.length) {
      doc.fillColor(muted).font('Helvetica').fontSize(9).text('Nenhum pagamento registrado.');
    } else {
      payments.forEach((payment) => {
        const y = doc.y;
        doc.fillColor(muted).font('Helvetica').fontSize(9)
          .text(`${paymentNames[payment.payment_method] || payment.payment_method} (${payment.sales_count})`, 48, y);
        doc.fillColor(navy).font('Helvetica-Bold')
          .text(money(payment.total_cents), 360, y, { width: 185, align: 'right' });
        doc.y = y + 18;
        doc.x = 48;
      });
    }

    doc.y += 10;
    doc.x = 48;
    doc.fillColor(navy).font('Helvetica-Bold').fontSize(12).text('Produtos vendidos');
    doc.moveDown(.6);
    if (!products.length) {
      doc.fillColor(muted).font('Helvetica').fontSize(9).text('Nenhum produto vendido neste caixa.');
    } else {
      products.slice(0, 25).forEach((product) => {
        if (doc.y > 720) doc.addPage();
        const y = doc.y;
        doc.fillColor(navy).font('Helvetica-Bold').fontSize(9)
          .text(product.product_name, 48, y, { width: 310 });
        doc.fillColor(muted).font('Helvetica')
          .text(`${product.quantity} un.`, 365, y, { width: 65, align: 'right' });
        doc.fillColor(navy).font('Helvetica-Bold')
          .text(money(product.revenue_cents), 440, y, { width: 105, align: 'right' });
        doc.y = y + 18;
        doc.x = 48;
      });
    }

    if (session.closing_notes) {
      doc.y += 10;
      doc.x = 48;
      doc.fillColor(navy).font('Helvetica-Bold').fontSize(10).text('Observacoes');
      doc.fillColor(muted).font('Helvetica').fontSize(9).text(session.closing_notes);
    }

    doc.fillColor('#9aa3b2').font('Helvetica').fontSize(7)
      .text(`Gerado pelo PDV-PRO LIVRARIA - Caixa #${session.id}`, 48, 765, {
        width: 499, align: 'center', lineBreak: false
      });
    doc.end();
  });
}

module.exports = { generateCashReport };
