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


// ---- Languages ---------------------------------------------------------------------------------
// Emails are written in the language the person chose in the app (en / it / ro / es). English is the
// key; {placeholders} are filled from vars. Anything without an entry stays English.
export type EmailLang = 'en' | 'it' | 'ro' | 'es';
const LANG_INDEX: Record<EmailLang, number> = { en: -1, it: 0, ro: 1, es: 2 };
const M: Record<string, [string, string, string]> = {
  'Booking': ['Prenotazione', 'Rezervare', 'Reserva'],
  'Car': ['Auto', 'Mașină', 'Coche'],
  'Pick-up': ['Ritiro', 'Ridicare', 'Recogida'],
  'Return': ['Riconsegna', 'Returnare', 'Devolución'],
  'Location': ['Luogo', 'Locație', 'Lugar'],
  'Delivery to': ['Consegna a', 'Livrare la', 'Entrega en'],
  'Deliver to': ['Consegna a', 'Livrare la', 'Entrega en'],
  'Total paid': ['Totale pagato', 'Total plătit', 'Total pagado'],
  'Payout': ['Pagamento', 'Plată', 'Pago'],
  'Refunded': ['Rimborsato', 'Rambursat', 'Reembolsado'],
  "You're receiving this because of activity on your account.": ["Ricevi questa email per un'attività sul tuo account.", 'Primești acest e-mail din cauza unei activități din contul tău.', 'Recibes este correo por actividad en tu cuenta.'],
  "You're all set 🎉": ['È tutto pronto 🎉', 'Totul este gata 🎉', 'Todo listo 🎉'],
  'Your booking is confirmed and your host, {name}, has been notified.': ['La tua prenotazione è confermata e il tuo host, {name}, è stato avvisato.', 'Rezervarea ta este confirmată, iar gazda ta, {name}, a fost anunțată.', 'Tu reserva está confirmada y tu anfitrión, {name}, ha sido avisado.'],
  'View my trip': ['Vedi il mio viaggio', 'Vezi călătoria mea', 'Ver mi viaje'],
  'View my trips': ['Vedi i miei viaggi', 'Vezi călătoriile mele', 'Ver mis viajes'],
  'Booking confirmed — {car}': ['Prenotazione confermata — {car}', 'Rezervare confirmată — {car}', 'Reserva confirmada — {car}'],
  'Your booking {ref} is confirmed.': ['La tua prenotazione {ref} è confermata.', 'Rezervarea ta {ref} este confirmată.', 'Tu reserva {ref} está confirmada.'],
  'New booking 🚗': ['Nuova prenotazione 🚗', 'Rezervare nouă 🚗', 'Nueva reserva 🚗'],
  '{name} just booked your {car}.': ['{name} ha appena prenotato la tua {car}.', '{name} tocmai a rezervat {car}.', '{name} acaba de reservar tu {car}.'],
  'View booking': ['Vedi la prenotazione', 'Vezi rezervarea', 'Ver la reserva'],
  'New booking — {car}': ['Nuova prenotazione — {car}', 'Rezervare nouă — {car}', 'Nueva reserva — {car}'],
  '{name} booked your {car}.': ['{name} ha prenotato la tua {car}.', '{name} a rezervat {car}.', '{name} ha reservado tu {car}.'],
  'Pick-up is tomorrow': ['Il ritiro è domani', 'Ridicarea este mâine', 'La recogida es mañana'],
  'A reminder that your {car} is ready for pick-up tomorrow.': ['Un promemoria: la tua {car} è pronta per il ritiro domani.', 'Un memento: {car} este gata de ridicare mâine.', 'Un recordatorio: tu {car} estará lista para recoger mañana.'],
  'Reminder: pick-up tomorrow — {car}': ['Promemoria: ritiro domani — {car}', 'Memento: ridicare mâine — {car}', 'Recordatorio: recogida mañana — {car}'],
  'Your {car} is ready tomorrow.': ['La tua {car} è pronta domani.', '{car} este gata mâine.', 'Tu {car} estará lista mañana.'],
  'Booking cancelled': ['Prenotazione annullata', 'Rezervare anulată', 'Reserva cancelada'],
  '{name} cancelled the trip below.': ['{name} ha annullato il viaggio qui sotto.', '{name} a anulat călătoria de mai jos.', '{name} ha cancelado el viaje de abajo.'],
  'This booking was cancelled for the trip below.': ['Questa prenotazione è stata annullata per il viaggio qui sotto.', 'Această rezervare a fost anulată pentru călătoria de mai jos.', 'Esta reserva fue cancelada para el viaje de abajo.'],
  'Booking cancelled — {car}': ['Prenotazione annullata — {car}', 'Rezervare anulată — {car}', 'Reserva cancelada — {car}'],
  'Booking {ref} was cancelled.': ['La prenotazione {ref} è stata annullata.', 'Rezervarea {ref} a fost anulată.', 'La reserva {ref} fue cancelada.'],
  "You've been refunded": ['Hai ricevuto un rimborso', 'Ai primit o rambursare', 'Te han reembolsado'],
  '{amount} has been refunded to your original payment method. It can take a few business days to show up on your statement.': ['{amount} sono stati rimborsati sul metodo di pagamento originale. Possono volerci alcuni giorni lavorativi perché compaiano sull\'estratto conto.', '{amount} au fost rambursați pe metoda de plată inițială. Pot dura câteva zile lucrătoare până apar în extras.', '{amount} se han reembolsado en tu método de pago original. Pueden tardar unos días laborables en aparecer en tu extracto.'],
  'Refund issued — {car}': ['Rimborso effettuato — {car}', 'Rambursare efectuată — {car}', 'Reembolso emitido — {car}'],
  'Booking {ref} was refunded.': ['La prenotazione {ref} è stata rimborsata.', 'Rezervarea {ref} a fost rambursată.', 'La reserva {ref} fue reembolsada.'],
  'Return is tomorrow': ['La riconsegna è domani', 'Returnarea este mâine', 'La devolución es mañana'],
  'A reminder that your {car} is due back tomorrow.': ['Un promemoria: la tua {car} va riconsegnata domani.', 'Un memento: {car} trebuie returnată mâine.', 'Un recordatorio: tu {car} debe devolverse mañana.'],
  'Reminder: return tomorrow — {car}': ['Promemoria: riconsegna domani — {car}', 'Memento: returnare mâine — {car}', 'Recordatorio: devolución mañana — {car}'],
  'Your {car} is due back tomorrow.': ['La tua {car} va riconsegnata domani.', '{car} trebuie returnată mâine.', 'Tu {car} debe devolverse mañana.'],
  'Your identity is verified ✓': ['La tua identità è verificata ✓', 'Identitatea ta este verificată ✓', 'Tu identidad está verificada ✓'],
  'Your driving licence is verified ✓': ['La tua patente è verificata ✓', 'Permisul tău de conducere este verificat ✓', 'Tu carnet de conducir está verificado ✓'],
  'Your profile now carries the verified badge — and you can post on SIGNAL under your own name.': ['Il tuo profilo ora ha il badge di verifica e puoi pubblicare su SIGNAL con il tuo nome.', 'Profilul tău are acum insigna de verificare — și poți posta pe SIGNAL sub numele tău.', 'Tu perfil ya tiene la insignia de verificado y puedes publicar en SIGNAL con tu nombre.'],
  'You are ready to rent. Pick a car and go.': ['Sei pronto a noleggiare. Scegli un\'auto e parti.', 'Ești gata să închiriezi. Alege o mașină și pornește.', 'Ya puedes alquilar. Elige un coche y en marcha.'],
  'View my profile': ['Vedi il mio profilo', 'Vezi profilul meu', 'Ver mi perfil'],
  'Browse cars': ['Sfoglia le auto', 'Răsfoiește mașinile', 'Ver coches'],
  'We need a new photo of your identity': ['Serve una nuova foto della tua identità', 'Avem nevoie de o fotografie nouă a identității tale', 'Necesitamos una foto nueva de tu identidad'],
  'We need a new photo of your driving licence': ['Serve una nuova foto della tua patente', 'Avem nevoie de o fotografie nouă a permisului tău de conducere', 'Necesitamos una foto nueva de tu carnet de conducir'],
  'We could not accept it this time:': ['Questa volta non abbiamo potuto accettarla:', 'De data aceasta nu am putut-o accepta:', 'Esta vez no pudimos aceptarlo:'],
  'The document could not be read.': ['Il documento non era leggibile.', 'Documentul nu a putut fi citit.', 'No se pudo leer el documento.'],
  'It only takes a minute to send it again.': ['Ci vuole solo un minuto per inviarla di nuovo.', 'Durează doar un minut să o trimiți din nou.', 'Solo lleva un minuto volver a enviarlo.'],
  'Send it again': ['Invia di nuovo', 'Trimite din nou', 'Enviar de nuevo'],
  'Your identity is verified': ['La tua identità è verificata', 'Identitatea ta este verificată', 'Tu identidad está verificada'],
  'Your driving licence is verified': ['La tua patente è verificata', 'Permisul tău de conducere este verificat', 'Tu carnet de conducir está verificado'],
  'Action needed: your identity': ['Serve un tuo intervento: la tua identità', 'Este nevoie de o acțiune: identitatea ta', 'Acción necesaria: tu identidad'],
  'Action needed: your driving licence': ['Serve un tuo intervento: la tua patente', 'Este nevoie de o acțiune: permisul tău de conducere', 'Acción necesaria: tu carnet de conducir'],
};
export function tx(en: string, lang: EmailLang | undefined, vars: Record<string, string | number> = {}): string {
  const i = LANG_INDEX[lang ?? 'en'];
  const base = i >= 0 && M[en] ? M[en][i] : en;
  return base.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

function layout(preheader: string, bodyHtml: string, lang?: EmailLang): string {
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
                <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#00a63e;">CX</p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 28px 28px;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
          <p style="margin:16px 0 0 0;font-size:12px;color:#8a8578;">${tx("You're receiving this because of activity on your account.", lang)}</p>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function row(label: string, value: string, lang?: EmailLang): string {
  label = tx(label, lang);
  return `<tr>
    <td style="padding:6px 0;font-size:14px;color:#6b6656;">${label}</td>
    <td style="padding:6px 0;font-size:14px;color:#15140f;font-weight:600;text-align:right;">${value}</td>
  </tr>`;
}

function button(href: string, label: string, lang?: EmailLang): string {
  label = tx(label, lang);
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 20px;background:#15140f;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;border-radius:10px;">${label}</a>`;
}

const DATE_TAGS: Record<string, string> = { en: 'en-GB', it: 'it-IT', ro: 'ro-RO', es: 'es-ES' };
const fmtDate = (iso: string, lang?: EmailLang) => new Date(iso).toLocaleDateString(DATE_TAGS[lang ?? 'en'], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

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
  /** Language of the person receiving the email (user_notification_prefs.lang). */
  lang?: EmailLang;
  /** See supabase/migrations/0027_delivery_options.sql. Optional so
   *  every existing call site (pickup reminders, cancellation, refund)
   *  keeps working unchanged — only the booking-confirmed templates
   *  pass this. */
  fulfillmentType?: 'pickup' | 'delivery';
  deliveryAddress?: string;
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

const H1 = 'margin:0 0 6px 0;font-size:20px;font-weight:700;';
const P = 'margin:0 0 20px 0;font-size:14px;line-height:1.6;color:#3d3a30;';
const TABLE = 'border-top:1px solid #e7e5df;border-bottom:1px solid #e7e5df;padding:4px 0;';

export async function sendBookingConfirmedEmail(to: string, trip: TripEmailData) {
  const l = trip.lang;
  const body = `
    <h1 style="${H1}">${tx("You're all set 🎉", l)}</h1>
    <p style="${P}">${tx('Your booking is confirmed and your host, {name}, has been notified.', l, { name: trip.otherPartyName ?? '' })}</p>
    <table role="presentation" width="100%" style="${TABLE}">
      ${row('Booking', trip.reference, l)}
      ${row('Car', trip.carLabel, l)}
      ${row('Pick-up', fmtDate(trip.startDate, l), l)}
      ${row('Return', fmtDate(trip.endDate, l), l)}
      ${trip.fulfillmentType === 'delivery' ? row('Delivery to', trip.deliveryAddress || '', l) : row('Location', trip.pickupLocation, l)}
      ${row('Total paid', eur(trip.totalPrice), l)}
    </table>
    ${button(`${SITE_URL}/dashboard#trips`, 'View my trip', l)}
  `;
  await send(to, tx('Booking confirmed — {car}', l, { car: trip.carLabel }), layout(tx('Your booking {ref} is confirmed.', l, { ref: trip.reference }), body, l));
}

export async function sendNewBookingHostEmail(to: string, trip: TripEmailData) {
  const l = trip.lang;
  const who = trip.otherPartyName ?? '';
  const body = `
    <h1 style="${H1}">${tx('New booking 🚗', l)}</h1>
    <p style="${P}">${tx('{name} just booked your {car}.', l, { name: who, car: trip.carLabel })}</p>
    <table role="presentation" width="100%" style="${TABLE}">
      ${row('Booking', trip.reference, l)}
      ${row('Pick-up', fmtDate(trip.startDate, l), l)}
      ${row('Return', fmtDate(trip.endDate, l), l)}
      ${trip.fulfillmentType === 'delivery' ? row('Deliver to', trip.deliveryAddress || '', l) : row('Location', trip.pickupLocation, l)}
      ${row('Payout', eur(trip.totalPrice), l)}
    </table>
    ${button(`${SITE_URL}/host#bookings`, 'View booking', l)}
  `;
  await send(to, tx('New booking — {car}', l, { car: trip.carLabel }), layout(tx('{name} booked your {car}.', l, { name: who, car: trip.carLabel }), body, l));
}

export async function sendPickupReminderEmail(to: string, trip: TripEmailData) {
  const l = trip.lang;
  const body = `
    <h1 style="${H1}">${tx('Pick-up is tomorrow', l)}</h1>
    <p style="${P}">${tx('A reminder that your {car} is ready for pick-up tomorrow.', l, { car: trip.carLabel })}</p>
    <table role="presentation" width="100%" style="${TABLE}">
      ${row('Booking', trip.reference, l)}
      ${row('Pick-up', fmtDate(trip.startDate, l), l)}
      ${row('Location', trip.pickupLocation, l)}
    </table>
    ${button(`${SITE_URL}/dashboard#trips`, 'View my trip', l)}
  `;
  await send(to, tx('Reminder: pick-up tomorrow — {car}', l, { car: trip.carLabel }), layout(tx('Your {car} is ready tomorrow.', l, { car: trip.carLabel }), body, l));
}

export async function sendBookingCancelledEmail(to: string, trip: TripEmailData) {
  const l = trip.lang;
  const body = `
    <h1 style="${H1}">${tx('Booking cancelled', l)}</h1>
    <p style="${P}">${trip.otherPartyName ? tx('{name} cancelled the trip below.', l, { name: trip.otherPartyName }) : tx('This booking was cancelled for the trip below.', l)}</p>
    <table role="presentation" width="100%" style="${TABLE}">
      ${row('Booking', trip.reference, l)}
      ${row('Car', trip.carLabel, l)}
      ${row('Pick-up', fmtDate(trip.startDate, l), l)}
      ${row('Return', fmtDate(trip.endDate, l), l)}
    </table>
    ${button(`${SITE_URL}/dashboard#trips`, 'View my trips', l)}
  `;
  await send(to, tx('Booking cancelled — {car}', l, { car: trip.carLabel }), layout(tx('Booking {ref} was cancelled.', l, { ref: trip.reference }), body, l));
}

export async function sendBookingRefundedEmail(to: string, trip: TripEmailData) {
  const l = trip.lang;
  const body = `
    <h1 style="${H1}">${tx("You've been refunded", l)}</h1>
    <p style="${P}">${tx('{amount} has been refunded to your original payment method. It can take a few business days to show up on your statement.', l, { amount: eur(trip.totalPrice) })}</p>
    <table role="presentation" width="100%" style="${TABLE}">
      ${row('Booking', trip.reference, l)}
      ${row('Car', trip.carLabel, l)}
      ${row('Refunded', eur(trip.totalPrice), l)}
    </table>
    ${button(`${SITE_URL}/dashboard#trips`, 'View my trips', l)}
  `;
  await send(to, tx('Refund issued — {car}', l, { car: trip.carLabel }), layout(tx('Booking {ref} was refunded.', l, { ref: trip.reference }), body, l));
}

export async function sendReturnReminderEmail(to: string, trip: TripEmailData) {
  const l = trip.lang;
  const body = `
    <h1 style="${H1}">${tx('Return is tomorrow', l)}</h1>
    <p style="${P}">${tx('A reminder that your {car} is due back tomorrow.', l, { car: trip.carLabel })}</p>
    <table role="presentation" width="100%" style="${TABLE}">
      ${row('Booking', trip.reference, l)}
      ${row('Return', fmtDate(trip.endDate, l), l)}
      ${row('Location', trip.pickupLocation, l)}
    </table>
    ${button(`${SITE_URL}/dashboard#trips`, 'View my trip', l)}
  `;
  await send(to, tx('Reminder: return tomorrow — {car}', l, { car: trip.carLabel }), layout(tx('Your {car} is due back tomorrow.', l, { car: trip.carLabel }), body, l));
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Result of a document review — sent to the person whose identity / driving licence was checked. */
export async function sendVerificationDecisionEmail(
  to: string,
  d: { kind: 'identity' | 'licence'; decision: 'approved' | 'rejected'; reason?: string; lang?: EmailLang },
) {
  const l = d.lang;
  const approved = d.decision === 'approved';
  const isId = d.kind === 'identity';
  const okTitle = isId ? 'Your identity is verified ✓' : 'Your driving licence is verified ✓';
  const noTitle = isId ? 'We need a new photo of your identity' : 'We need a new photo of your driving licence';
  const body = approved
    ? `
    <h1 style="${H1}">${tx(okTitle, l)}</h1>
    <p style="margin:0 0 4px 0;font-size:14px;line-height:1.6;color:#3d3a30;">
      ${isId ? tx('Your profile now carries the verified badge — and you can post on SIGNAL under your own name.', l) : tx('You are ready to rent. Pick a car and go.', l)}
    </p>
    ${button(`${SITE_URL}${isId ? '/settings#verification' : '/browse'}`, isId ? 'View my profile' : 'Browse cars', l)}
  `
    : `
    <h1 style="${H1}">${tx(noTitle, l)}</h1>
    <p style="margin:0 0 14px 0;font-size:14px;line-height:1.6;color:#3d3a30;">${tx('We could not accept it this time:', l)}</p>
    <p style="margin:0 0 4px 0;padding:12px 14px;border-radius:10px;background:#fdecee;font-size:14px;line-height:1.5;color:#b3261e;">
      ${esc(d.reason || tx('The document could not be read.', l))}
    </p>
    <p style="margin:14px 0 0 0;font-size:14px;line-height:1.6;color:#3d3a30;">${tx('It only takes a minute to send it again.', l)}</p>
    ${button(`${SITE_URL}/settings#${isId ? 'verification' : 'licence'}`, 'Send it again', l)}
  `;
  await send(
    to,
    approved ? tx(isId ? 'Your identity is verified' : 'Your driving licence is verified', l) : tx(isId ? 'Action needed: your identity' : 'Action needed: your driving licence', l),
    layout(tx(approved ? okTitle : noTitle, l), body, l),
  );
}
