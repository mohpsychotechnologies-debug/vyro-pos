/**
 * receiptPDF.js
 * Generates styled PDF receipts with Vyro POS branding using jsPDF.
 * Shares them natively via the Web Share API (mobile) or downloads (desktop).
 */
import { jsPDF } from 'jspdf';

const fmt = (n, currency = 'KSh') =>
  `${currency} ${Number(n || 0).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Brand colors
const NAVY    = [15, 21, 53];     // #0f1535
const VIOLET  = [108, 79, 246];   // #6c4ff6
const CORAL   = [240, 79, 68];    // #f04f44
const GREEN   = [34, 197, 94];    // #22c55e
const AMBER   = [245, 166, 35];   // #f5a623
const MUTED   = [107, 114, 128];  // #6b7280
const LINE    = [229, 231, 240];  // #e5e7f0

// Cache the logo as base64 so we only fetch once
let _logoBase64 = null;

async function loadLogo() {
  if (_logoBase64 !== null) return _logoBase64;
  try {
    const resp = await fetch('/logo.png');
    if (!resp.ok) throw new Error('logo not found');
    const blob = await resp.blob();
    _logoBase64 = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    _logoBase64 = null; // logo not available — header falls back to text
  }
  return _logoBase64;
}

// ── Core PDF builder ──────────────────────────────────────────
class ReceiptDoc {
  constructor(title) {
    this.doc = new jsPDF({ unit: 'mm', format: [80, 200], orientation: 'portrait' });
    this.y = 0;
    this.w = 80;
    this.margin = 5;
    this.title = title;
  }

  // Colored line (horizontal rule)
  hr(color = LINE, thickness = 0.3, dashed = false) {
    this.doc.setDrawColor(...color);
    this.doc.setLineWidth(thickness);
    if (dashed) this.doc.setLineDashPattern([1, 0.5], 0);
    this.doc.line(this.margin, this.y, this.w - this.margin, this.y);
    this.doc.setLineDashPattern([], 0);
    this.y += 2.5;
    return this;
  }

  // Colored header bar
  headerBar(color = NAVY) {
    this.doc.setFillColor(...color);
    this.doc.rect(0, 0, this.w, 14, 'F');
    this.y = 10;
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'bold');
    this.doc.text(this.title, this.w / 2, this.y, { align: 'center' });
    this.y = 18;
    this.doc.setTextColor(30, 32, 53);
    this.doc.setFont('helvetica', 'normal');
    return this;
  }

  // Logo + store name header
  async logoHeader(storeName, storePhone, logoBase64) {
    const logoH = 10;
    const logoW = 10;

    if (logoBase64) {
      try {
        this.doc.addImage(logoBase64, 'PNG', this.w / 2 - logoW / 2, this.y, logoW, logoH);
        this.y += logoH + 1.5;
      } catch { /* fall through to text logo */ }
    }

    this.doc.setTextColor(...NAVY);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(13);
    this.doc.text(storeName, this.w / 2, this.y, { align: 'center' });
    this.y += 5;

    if (storePhone) {
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(8);
      this.doc.setTextColor(...MUTED);
      this.doc.text(storePhone, this.w / 2, this.y, { align: 'center' });
      this.y += 4;
    }

    this.doc.setTextColor(30, 32, 53);
    return this;
  }

  text(text, align = 'left', size = 8, color = [30, 32, 53], bold = false) {
    this.doc.setFontSize(size);
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
    this.doc.setTextColor(...color);
    const x = align === 'center' ? this.w / 2 : align === 'right' ? this.w - this.margin : this.margin;
    this.doc.text(String(text || ''), x, this.y, { align });
    this.y += size * 0.42 + 1;
    this.doc.setTextColor(30, 32, 53);
    this.doc.setFont('helvetica', 'normal');
    return this;
  }

  row(left, right, opts = {}) {
    const { bold = false, size = 8, color = [30, 32, 53], leftColor = null } = opts;
    this.doc.setFontSize(size);
    this.doc.setFont('helvetica', bold ? 'bold' : 'normal');
    this.doc.setTextColor(...(leftColor || color));
    this.doc.text(String(left || ''), this.margin, this.y);
    this.doc.setTextColor(...color);
    this.doc.text(String(right || ''), this.w - this.margin, this.y, { align: 'right' });
    this.y += size * 0.42 + 1.2;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(30, 32, 53);
    return this;
  }

  totalRow(left, right, color = VIOLET) {
    this.hr(color, 0.5);
    this.doc.setFontSize(12);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(...color);
    this.doc.text(String(left), this.margin, this.y);
    this.doc.text(String(right), this.w - this.margin, this.y, { align: 'right' });
    this.y += 6;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(30, 32, 53);
    return this;
  }

  badge(text, color = MUTED) {
    this.doc.setFontSize(7.5);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setTextColor(...color);
    const tw = this.doc.getTextWidth(text) + 4;
    const x = this.margin;
    this.doc.setFillColor(...color);
    this.doc.roundedRect(x, this.y - 3, tw, 4.5, 1, 1, 'F');
    this.doc.setTextColor(255, 255, 255);
    this.doc.text(text, x + 2, this.y, { align: 'left' });
    this.y += 5;
    this.doc.setFont('helvetica', 'normal');
    this.doc.setTextColor(30, 32, 53);
    return this;
  }

  space(mm = 3) { this.y += mm; return this; }

  footer(storeName) {
    this.space(2);
    this.hr(LINE, 0.3, true);
    this.text('Thank you!', 'center', 9, NAVY, true);
    this.text(`Powered by Vyro POS`, 'center', 7, MUTED);
    this.text('Sell · Track · Grow', 'center', 7, VIOLET, true);
  }

  async shareOrDownload(filename, phone = null) {
    const pdfBlob = this.doc.output('blob');
    const file = new File([pdfBlob], filename, { type: 'application/pdf' });

    // ── If we have a specific phone number: download PDF + open that chat ──
    // WhatsApp's wa.me deep link opens the exact customer's chat directly,
    // but can't attach files — so we download first, then open the chat.
    if (phone) {
      const cleanPhone = phone.replace(/\D/g, '');
      const intlPhone = cleanPhone.startsWith('0') ? '254' + cleanPhone.slice(1) : cleanPhone;

      // Download the PDF so it's ready to attach
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();

      // Brief delay so download starts, then open the customer's WhatsApp chat
      setTimeout(() => {
        URL.revokeObjectURL(url);
        window.open(`https://wa.me/${intlPhone}`, '_blank');
      }, 800);
      return;
    }

    // ── No phone: use native share sheet (user picks contact) ──
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ title: this.title, files: [file] });
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }

    // ── Fallback: just download ──
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  }
}

// ── Restaurant Order Receipt ──────────────────────────────────
export async function shareOrderReceiptPDF({ order, items, table, paymentMethod, customerName, customerPhone, storeName, storePhone, taxRate = 16, currency = 'KSh' }) {
  const money = (n) => fmt(n, currency);
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
  const logo = await loadLogo();

  const r = new ReceiptDoc('RESTAURANT RECEIPT');

  // Header bar
  r.headerBar(NAVY);
  await r.logoHeader(storeName, storePhone, logo);

  r.text(`${dateStr}  ${timeStr}`, 'center', 7.5, MUTED);
  r.hr(LINE, 0.3, true);

  r.row('Order #', `#${order.order_number || String(order.id).slice(-6)}`);
  r.row('Table', table?.table_number ?? '—');
  if (customerName) r.row('Customer', customerName);

  r.hr(LINE, 0.3, true);

  // Items
  items.forEach(i => {
    r.row(`${i.quantity}x ${i.item_name}`, money(i.subtotal));
    if (i.notes) r.text(`   Note: ${i.notes}`, 'left', 7, MUTED);
  });

  r.hr(LINE, 0.3, true);
  r.row('Subtotal', money(order.subtotal || 0));
  r.row(`Tax (${taxRate}%)`, money(order.tax || 0));
  r.totalRow('TOTAL', money(order.total || 0), VIOLET);
  r.badge(`PAID VIA ${paymentMethod}`, GREEN);

  r.footer(storeName);
  await r.shareOrDownload(`receipt-${order.order_number || String(order.id).slice(-6)}.pdf`, customerPhone);
}

// ── Room Booking Confirmation ─────────────────────────────────
export async function shareBookingConfirmationPDF({ booking, room, storeName, storePhone = '', currency = 'KSh' }) {
  const money = (n) => fmt(n, currency);
  const checkIn  = new Date(booking.check_in_date).toLocaleDateString('en-GB',  { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  const checkOut = new Date(booking.check_out_date).toLocaleDateString('en-GB', { weekday:'short', day:'numeric', month:'short', year:'numeric' });
  const logo = await loadLogo();

  const r = new ReceiptDoc('BOOKING CONFIRMATION');

  r.headerBar(VIOLET);
  await r.logoHeader(storeName, storePhone, logo);

  r.hr(LINE, 0.3, true);

  r.row('Booking #', booking.booking_number, { bold: true });
  r.row('Guest', booking.guest_name);
  r.row('Phone', booking.guest_phone || '—');

  r.hr(LINE, 0.3, true);

  r.row('Room', `${room?.room_number || 'N/A'} — ${room?.room_type || ''}`);
  r.row('Check-in', checkIn);
  r.row('Check-out', checkOut);
  r.row('Nights', String(booking.nights));
  r.row('Guests', `${booking.adults} adult${booking.adults !== 1 ? 's' : ''}${booking.children ? ` + ${booking.children} child` : ''}`);

  r.hr(LINE, 0.3, true);

  r.row('Rate / night', money(booking.room_rate));
  r.totalRow('TOTAL', money(booking.total), VIOLET);
  r.row('Deposit paid', money(booking.deposit_paid));

  if (booking.balance > 0) {
    r.badge(`BALANCE DUE: ${money(booking.balance)}`, CORAL);
  } else {
    r.badge('FULLY PAID', GREEN);
  }

  if (booking.special_requests) {
    r.hr(LINE, 0.3, true);
    r.text('Special requests:', 'left', 7.5, MUTED, true);
    r.text(booking.special_requests, 'left', 7.5, MUTED);
  }

  r.hr(LINE, 0.3, true);
  r.text('Check-in: 2:00 PM  |  Check-out: 11:00 AM', 'center', 7, MUTED);
  r.text('Bring valid ID at check-in', 'center', 7, MUTED);

  r.footer(storeName);
  await r.shareOrDownload(`booking-${booking.booking_number}.pdf`, booking.guest_phone);
}

// ── Room Check-Out Receipt ────────────────────────────────────
export async function shareCheckOutReceiptPDF({ booking, room, storeName, storePhone = '', extras = [], currency = 'KSh' }) {
  const money = (n) => fmt(n, currency);
  const extrasTotal = extras.reduce((s, e) => s + Number(e.total || 0), 0);
  const grandTotal  = Number(booking.total || 0) + extrasTotal;
  const paid        = Number(booking.deposit_paid || 0);
  const checkIn  = new Date(booking.check_in_date).toLocaleDateString('en-GB');
  const checkOut = new Date(booking.check_out_date).toLocaleDateString('en-GB');
  const now = new Date();
  const logo = await loadLogo();

  const r = new ReceiptDoc('CHECK-OUT RECEIPT');

  r.headerBar(GREEN);
  await r.logoHeader(storeName, storePhone, logo);

  r.text(`${now.toLocaleDateString('en-GB')}  ${now.toLocaleTimeString('en-KE',{hour:'2-digit',minute:'2-digit'})}`, 'center', 7.5, MUTED);
  r.hr(LINE, 0.3, true);

  r.row('Booking #', booking.booking_number);
  r.row('Guest', booking.guest_name);
  r.row('Room', room?.room_number || 'N/A');
  r.row('Stay', `${checkIn} – ${checkOut}`);
  r.row('Nights', String(booking.nights));

  r.hr(LINE, 0.3, true);

  r.row('Room charges', money(booking.total));
  extras.forEach(e => r.row(e.description, money(e.total)));
  if (extras.length > 0) r.row('Extras total', money(extrasTotal));

  r.totalRow('GRAND TOTAL', money(grandTotal), VIOLET);
  r.row('Paid', money(paid));

  if (grandTotal > paid) {
    r.badge(`BALANCE: ${money(grandTotal - paid)}`, CORAL);
  } else {
    r.badge('FULLY PAID', GREEN);
  }

  r.footer(storeName);
  await r.shareOrDownload(`checkout-${booking.booking_number}.pdf`, booking.guest_phone);
}

// ── Retail Sale Receipt ───────────────────────────────────────
export async function shareSaleReceiptPDF({ sale, settings }) {
  const currency = settings?.currency || 'KSh';
  const money = (n) => fmt(n, currency);
  const storeName = settings?.storeName || 'Store';
  const storePhone = settings?.storePhone || '';
  const logo = await loadLogo();

  const r = new ReceiptDoc('SALES RECEIPT');

  r.headerBar(NAVY);
  await r.logoHeader(storeName, storePhone, logo);

  r.text(`${sale.date || ''}  ${sale.cashier ? '· ' + sale.cashier : ''}`, 'center', 7.5, MUTED);
  r.hr(LINE, 0.3, true);

  r.row('Receipt #', `#${String(sale.id).slice(-6)}`);
  if (sale.customer && sale.customer !== 'Walk-in') r.row('Customer', sale.customer);

  r.hr(LINE, 0.3, true);

  (sale.items || []).forEach(i => r.row(`${i.qty}x ${i.name}`, money(i.price * i.qty)));

  r.hr(LINE, 0.3, true);
  r.row('Subtotal', money(sale.sub || sale.subtotal || 0));
  if (sale.discount) r.row('Discount', `-${money(sale.discount)}`, { color: GREEN });
  if (sale.tax) r.row(`Tax (${settings.taxRate || 16}%)`, money(sale.tax));

  r.totalRow('TOTAL', money(sale.total), VIOLET);
  r.badge(`PAID VIA ${sale.method || '—'}`, GREEN);

  if (sale.loyaltyEarned > 0) {
    r.text(`Loyalty earned: +${sale.loyaltyEarned} points`, 'center', 8, GREEN, true);
  }

  r.footer(storeName);
  await r.shareOrDownload(`receipt-${String(sale.id).slice(-6)}.pdf`, sale.customerPhone || sale.customer_phone || null);
}
