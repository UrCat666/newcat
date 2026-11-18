import { jsPDF } from 'jspdf';
import { formatIDR } from '../shared/pricing';
import type { PublicReceiptView } from '../shared/types';

export function downloadReceiptPdf(
  receipt: PublicReceiptView,
  storeName: string,
  storeWhatsapp: string
): void {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const left = 44;
  const right = 550;
  let y = 52;

  // Header
  doc.setFillColor(16, 42, 67);
  doc.rect(0, 0, 595, 96, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(storeName.toUpperCase(), left, 42);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(234, 242, 250);
  doc.text('BUKTI TRANSAKSI RESMI', left, 62);

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text(receipt.orderNumber, right, 42, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(203, 213, 225);
  doc.text(
    new Date(receipt.createdAt).toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      dateStyle: 'medium',
      timeStyle: 'short',
    }) + ' WIB',
    right,
    62,
    { align: 'right' }
  );

  y = 128;
  doc.setTextColor(16, 42, 67);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Informasi Pembeli & Status', left, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Nama Pembeli: ${receipt.customerName}`, left, y);
  doc.text(`Status Pembayaran: ${receipt.paymentStatus.toUpperCase()}`, right, y, { align: 'right' });
  y += 16;
  doc.text(`WhatsApp: ${receipt.maskedWhatsapp}`, left, y);
  doc.text(`Status Pesanan: ${receipt.orderStatus.toUpperCase()}`, right, y, { align: 'right' });
  y += 16;
  doc.text(`Pengiriman Digital: ${receipt.shippingMethodName}`, left, y);
  doc.text(`Kode Resi: ${receipt.receiptTokenMasked}`, right, y, { align: 'right' });
  y += 16;
  const methodLabel =
    receipt.paymentMethod === 'WALLET' ? 'Reseller Wallet' : receipt.paymentMethod || 'QRIS';
  doc.text(`Metode Pembayaran: ${methodLabel}`, left, y);

  y += 24;
  doc.setDrawColor(229, 234, 240);
  doc.line(left, y, right, y);
  y += 18;

  // Table header
  doc.setFont('helvetica', 'bold');
  doc.text('Produk', left, y);
  doc.text('Qty', 360, y, { align: 'right' });
  doc.text('Harga', 445, y, { align: 'right' });
  doc.text('Subtotal', right, y, { align: 'right' });
  y += 10;
  doc.line(left, y, right, y);
  y += 18;

  doc.setFont('helvetica', 'normal');
  for (const item of receipt.items) {
    const label = item.variantNameSnapshot
      ? `${item.productNameSnapshot} (${item.variantNameSnapshot})`
      : item.productNameSnapshot;
    const lines = doc.splitTextToSize(label, 270) as string[];
    doc.text(lines, left, y);
    doc.text(String(item.quantity), 360, y, { align: 'right' });
    doc.text(formatIDR(item.unitPriceSnapshot), 445, y, { align: 'right' });
    doc.text(formatIDR(item.lineSubtotal), right, y, { align: 'right' });
    y += Math.max(18, lines.length * 14 + 4);
  }

  y += 8;
  doc.line(left, y, right, y);
  y += 20;

  const drawRow = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(bold ? 12 : 10);
    doc.text(label, 350, y);
    doc.text(value, right, y, { align: 'right' });
    y += bold ? 22 : 16;
  };

  drawRow('Subtotal Produk', formatIDR(receipt.subtotal));
  if (receipt.productDiscountTotal > 0) {
    drawRow('Diskon Produk', `-${formatIDR(receipt.productDiscountTotal)}`);
  }
  if ((receipt.resellerDiscountTotal || 0) > 0) {
    drawRow('Diskon Reseller (20%)', `-${formatIDR(receipt.resellerDiscountTotal || 0)}`);
  }
  if (receipt.couponDiscount > 0) {
    drawRow(`Voucher (${receipt.couponCode || 'PROMO'})`, `-${formatIDR(receipt.couponDiscount)}`);
  }
  drawRow('Pengiriman Digital', receipt.shippingCost === 0 ? 'Gratis' : formatIDR(receipt.shippingCost));
  if (receipt.taxAmount > 0) {
    drawRow('Pajak', formatIDR(receipt.taxAmount));
  }
  y += 4;
  drawRow('TOTAL PEMBAYARAN', formatIDR(receipt.totalAmount), true);

  if (receipt.rejectionReason) {
    y += 10;
    doc.setTextColor(185, 28, 28);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Catatan Penolakan: ${receipt.rejectionReason}`, left, y);
    y += 18;
  }

  y += 24;
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Dokumen ini diterbitkan secara elektronik oleh ${storeName}. Bantuan WhatsApp: +${storeWhatsapp}`,
    left,
    y
  );

  doc.save(`Resi-${receipt.orderNumber}.pdf`);
}
