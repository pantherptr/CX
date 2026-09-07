import { Resend } from 'resend';
import { eur } from '../../src/lib/format.js';

/**
 * Transactional email for the booking lifecycle — the one part of
 * "notifications" (see the original feature list) this project does for
 * real; SMS/WhatsApp were explicitly ruled out, so email is the only
 * channel here.
 *
 * Deliberately hand-written HTML rather than a component framework
 * (react-email etc.) — these are simple, static layouts and pulling in a
 * render pipeline for four templates isn't worth the extra dependency.
 *
 * Anything under api/_lib/ is shared code the Vercel/Next convention
 * ignores as a route (only files directly under api/ become endpoints),
 * so this is safe to import from any api/*.ts handler without becoming
 * one itself.
 */

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

// Resend's sandbox sender works with zero setup (delivers only to the
// address that created the API key, which is fine for testing) — swap
// this for a verified domain address once one exists.
const FROM = process.env.RESEND_FROM_EMAIL || 'Velora <onboarding@resend.dev>';

function layout(preheader: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f5f4f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#15140f;">
    <span style="display:none;font-size:1px;color:#f5f4f0;">${preheader}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f4f0;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e7e5df;">
            <tr>
              <td style="padding:28px 28px 0 28px;">
                <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00a63e;">Velora</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 28px 28px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#8a8578;">You're receiving this because of activity on your Velora account.</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function row(label: string, value: string): string {
  return `<tr>
    <td style="padding:6px 0;font-size:14px;color:#6b6656;">${label}</td>
    <td style="padding:6px 0;font-size:14px;color:#15140f;font-weight:600;text-align:right;">${value}</td>
  </tr>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 20px;background:#15140f;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">${label}</a>`;
}

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const SITE_URL = process.env.SITE_URL || 'https://velora.example.com';

export interface TripEmailData {
  reference: string;
  carLabel: string;
  startDate: string;
  endDate: string;
  pickupLocation: string;
  totalPrice: number;
  /** Only used by the confirmation/new-booking templates. */
  otherPartyName?: string;
}

async function send(to: string, subject: string, html: string) {
  if (!resend) {
    console.warn('[email] RESEND_API_KEY not set — skipping send:', subject, 'to', to);
    return;
  }
  try {
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch (err) {
    // Never let an email failure surface as a booking/payment failure —
    // callers treat this as fire-and-forget.
    console.error('[email] send failed', subject, to, err);
  }
}

export async function sendBookingConfirmedEmail(to: string, trip: TripEmailData) {
  const body = `
    <h1 style="margin:0 0 6px 0;font-size:20px;font-weight:700;">You're all set 🎉</h1>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#3d3a30;">
      Your booking is confirmed and your host, ${trip.otherPartyName}, has been notified.
    </p>
    <table role="presentation" width="100%" style="border-top:1px solid #e7e5df;border-bottom:1px solid #e7e5df;padding:4px 0;">
      ${row('Booking', trip.reference)}
      ${row('Car', trip.carLabel)}
      ${row('Pick-up', fmtDate(trip.startDate))}
      ${row('Return', fmtDate(trip.endDate))}
      ${row('Location', trip.pickupLocation)}
      ${row('Total paid', eur(trip.totalPrice))}
    </table>
    ${button(`${SITE_URL}/dashboard#trips`, 'View my trip')}
  `;
  await send(to, `Booking confirmed — ${trip.carLabel}`, layout(`Your booking ${trip.reference} is confirmed.`, body));
}

export async function sendNewBookingHostEmail(to: string, trip: TripEmailData) {
  const body = `
    <h1 style="margin:0 0 6px 0;font-size:20px;font-weight:700;">New booking 🚗</h1>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#3d3a30;">
      ${trip.otherPartyName} just booked your ${trip.carLabel}.
    </p>
    <table role="presentation" width="100%" style="border-top:1px solid #e7e5df;border-bottom:1px solid #e7e5df;padding:4px 0;">
      ${row('Booking', trip.reference)}
      ${row('Pick-up', fmtDate(trip.startDate))}
      ${row('Return', fmtDate(trip.endDate))}
      ${row('Location', trip.pickupLocation)}
      ${row('Payout', eur(trip.totalPrice))}
    </table>
    ${button(`${SITE_URL}/host#bookings`, 'View booking')}
  `;
  await send(to, `New booking — ${trip.carLabel}`, layout(`${trip.otherPartyName} booked your ${trip.carLabel}.`, body));
}

export async function sendPickupReminderEmail(to: string, trip: TripEmailData) {
  const body = `
    <h1 style="margin:0 0 6px 0;font-size:20px;font-weight:700;">Pick-up is tomorrow</h1>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#3d3a30;">
      A reminder that your ${trip.carLabel} is ready for pick-up tomorrow.
    </p>
    <table role="presentation" width="100%" style="border-top:1px solid #e7e5df;border-bottom:1px solid #e7e5df;padding:4px 0;">
      ${row('Booking', trip.reference)}
      ${row('Pick-up', fmtDate(trip.startDate))}
      ${row('Location', trip.pickupLocation)}
    </table>
    ${button(`${SITE_URL}/dashboard#trips`, 'View my trip')}
  `;
  await send(to, `Reminder: pick-up tomorrow — ${trip.carLabel}`, layout(`Your ${trip.carLabel} is ready tomorrow.`, body));
}

export async function sendBookingCancelledEmail(to: string, trip: TripEmailData) {
  const body = `
    <h1 style="margin:0 0 6px 0;font-size:20px;font-weight:700;">Booking cancelled</h1>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#3d3a30;">
      ${trip.otherPartyName ? `${trip.otherPartyName} cancelled` : 'This booking was cancelled for'} the trip below.
    </p>
    <table role="presentation" width="100%" style="border-top:1px solid #e7e5df;border-bottom:1px solid #e7e5df;padding:4px 0;">
      ${row('Booking', trip.reference)}
      ${row('Car', trip.carLabel)}
      ${row('Pick-up', fmtDate(trip.startDate))}
      ${row('Return', fmtDate(trip.endDate))}
    </table>
    ${button(`${SITE_URL}/dashboard#trips`, 'View my trips')}
  `;
  await send(to, `Booking cancelled — ${trip.carLabel}`, layout(`Booking ${trip.reference} was cancelled.`, body));
}

export async function sendBookingRefundedEmail(to: string, trip: TripEmailData) {
  const body = `
    <h1 style="margin:0 0 6px 0;font-size:20px;font-weight:700;">You've been refunded</h1>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#3d3a30;">
      ${eur(trip.totalPrice)} has been refunded to your original payment method. It can take a few
      business days to show up on your statement.
    </p>
    <table role="presentation" width="100%" style="border-top:1px solid #e7e5df;border-bottom:1px solid #e7e5df;padding:4px 0;">
      ${row('Booking', trip.reference)}
      ${row('Car', trip.carLabel)}
      ${row('Refunded', eur(trip.totalPrice))}
    </table>
    ${button(`${SITE_URL}/dashboard#trips`, 'View my trips')}
  `;
  await send(to, `Refund issued — ${trip.carLabel}`, layout(`Booking ${trip.reference} was refunded.`, body));
}

export async function sendReturnReminderEmail(to: string, trip: TripEmailData) {
  const body = `
    <h1 style="margin:0 0 6px 0;font-size:20px;font-weight:700;">Return is tomorrow</h1>
    <p style="margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#3d3a30;">
      A reminder that your ${trip.carLabel} is due back tomorrow.
    </p>
    <table role="presentation" width="100%" style="border-top:1px solid #e7e5df;border-bottom:1px solid #e7e5df;padding:4px 0;">
      ${row('Booking', trip.reference)}
      ${row('Return', fmtDate(trip.endDate))}
      ${row('Location', trip.pickupLocation)}
    </table>
    ${button(`${SITE_URL}/dashboard#trips`, 'View my trip')}
  `;
  await send(to, `Reminder: return tomorrow — ${trip.carLabel}`, layout(`Your ${trip.carLabel} is due back tomorrow.`, body));
}
