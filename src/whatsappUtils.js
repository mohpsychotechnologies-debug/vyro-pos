// WhatsApp Utilities

export function sendWhatsApp(phone, message) {
  // Remove non-digits and ensure it starts with country code
  const cleanPhone = phone.replace(/\D/g, '');
  // If starts with 0, replace with 254 (Kenya)
  const intlPhone = cleanPhone.startsWith('0') ? '254' + cleanPhone.slice(1) : cleanPhone;
  const encoded = encodeURIComponent(message);
  window.open(`https://wa.me/${intlPhone}?text=${encoded}`, '_blank');
}

export function formatBookingConfirmation(booking, room, storeName) {
  const checkIn = new Date(booking.check_in_date).toLocaleDateString('en-GB', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });
  const checkOut = new Date(booking.check_out_date).toLocaleDateString('en-GB', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short', 
    year: 'numeric' 
  });

  return `🏨 *Booking Confirmation*

Dear ${booking.guest_name},

Your room booking at *${storeName}* has been confirmed! ✅

*Booking Details:*
📋 Booking #: ${booking.booking_number}
🚪 Room: ${room?.room_number || 'N/A'} (${room?.room_type || 'N/A'})
📅 Check-in: ${checkIn}
📅 Check-out: ${checkOut}
🌙 Nights: ${booking.nights}
👥 Guests: ${booking.adults} adult(s)${booking.children ? `, ${booking.children} children` : ''}

*Payment Summary:*
💵 Total: KSh ${Number(booking.total || 0).toLocaleString()}
✅ Paid: KSh ${Number(booking.deposit_paid || 0).toLocaleString()}
${booking.balance > 0 ? `⚠️ Balance: KSh ${Number(booking.balance || 0).toLocaleString()}` : ''}

${booking.special_requests ? `*Special Requests:*
📝 ${booking.special_requests}

` : ''}*Important:*
• Check-in: 2:00 PM
• Check-out: 11:00 AM
• Bring valid ID

We look forward to welcoming you! 🎉

*${storeName}*`;
}

export function formatCheckInConfirmation(booking, room, storeName) {
  return `✅ *Check-In Confirmed*

Welcome to *${storeName}*, ${booking.guest_name}!

You have successfully checked in.

*Your Stay:*
🚪 Room: ${room?.room_number || 'N/A'} (${room?.room_type || 'N/A'})
📅 Check-out: ${new Date(booking.check_out_date).toLocaleDateString('en-GB')}

${booking.balance > 0 ? `*Balance Due:* KSh ${Number(booking.balance).toLocaleString()}\n` : ''}
Enjoy your stay! 🎉

Need anything? Contact our reception.`;
}

export function formatCheckOutReceipt(booking, room, storeName, extras = []) {
  const extrasTotal = extras.reduce((sum, e) => sum + Number(e.total || 0), 0);
  const grandTotal = Number(booking.total || 0) + extrasTotal;
  const totalPaid = Number(booking.deposit_paid || 0);

  return `🧾 *Check-Out Receipt*

Thank you for staying at *${storeName}*!

*Guest:* ${booking.guest_name}
*Booking #:* ${booking.booking_number}
*Room:* ${room?.room_number || 'N/A'}
*Stay:* ${new Date(booking.check_in_date).toLocaleDateString('en-GB')} - ${new Date(booking.check_out_date).toLocaleDateString('en-GB')}

*Charges:*
🛏️ Room (${booking.nights} nights): KSh ${Number(booking.total || 0).toLocaleString()}
${extras.length > 0 ? extras.map(e => `${e.description}: KSh ${Number(e.total).toLocaleString()}`).join('\n') : ''}
${extras.length > 0 ? `\n💵 Extras Total: KSh ${extrasTotal.toLocaleString()}\n` : ''}
━━━━━━━━━━━━━━━━
💰 Grand Total: KSh ${grandTotal.toLocaleString()}
✅ Paid: KSh ${totalPaid.toLocaleString()}
${grandTotal > totalPaid ? `⚠️ Balance: KSh ${(grandTotal - totalPaid).toLocaleString()}` : '✅ Fully Paid'}

Thank you for choosing us! 
We hope to see you again soon. 🙏`;
}
