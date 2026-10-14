import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Push / inbox wording per language. The site's UI is translated in the browser; these are the
 * texts the server writes on someone's behalf (notifications), so they are written in the
 * language the person chose (user_notification_prefs.lang, saved by the app — migration 0111).
 */
export type Lang = 'en' | 'it' | 'ro' | 'es';
type Entry = { title: Record<Lang, string>; body: Record<Lang, string> };

export const TEXTS: Record<string, Entry> = {
  booking_confirmed: {
    title: { en: 'Booking confirmed', it: 'Prenotazione confermata', ro: 'Rezervare confirmată', es: 'Reserva confirmada' },
    body: { en: 'Your {car} is booked for {date}.', it: 'La tua {car} è prenotata per il {date}.', ro: '{car} este rezervată pentru {date}.', es: 'Tu {car} está reservado para el {date}.' },
  },
  booking_new: {
    title: { en: 'New booking', it: 'Nuova prenotazione', ro: 'Rezervare nouă', es: 'Nueva reserva' },
    body: { en: '{name} booked your {car}.', it: '{name} ha prenotato la tua {car}.', ro: '{name} a rezervat {car}.', es: '{name} ha reservado tu {car}.' },
  },
  booking_cancelled_renter: {
    title: { en: 'Booking cancelled', it: 'Prenotazione annullata', ro: 'Rezervare anulată', es: 'Reserva cancelada' },
    body: { en: 'Your {car} booking ({ref}) was cancelled.', it: 'La prenotazione della {car} ({ref}) è stata annullata.', ro: 'Rezervarea pentru {car} ({ref}) a fost anulată.', es: 'La reserva de tu {car} ({ref}) fue cancelada.' },
  },
  booking_cancelled_host: {
    title: { en: 'Booking cancelled', it: 'Prenotazione annullata', ro: 'Rezervare anulată', es: 'Reserva cancelada' },
    body: { en: 'The {car} booking ({ref}) was cancelled.', it: 'La prenotazione della {car} ({ref}) è stata annullata.', ro: 'Rezervarea pentru {car} ({ref}) a fost anulată.', es: 'La reserva del {car} ({ref}) fue cancelada.' },
  },
  booking_refunded: {
    title: { en: 'Refund issued', it: 'Rimborso effettuato', ro: 'Rambursare efectuată', es: 'Reembolso emitido' },
    body: { en: "You've been refunded for your {car} booking ({ref}).", it: 'Ti abbiamo rimborsato la prenotazione della {car} ({ref}).', ro: 'Ai primit rambursarea pentru rezervarea {car} ({ref}).', es: 'Te hemos reembolsado la reserva del {car} ({ref}).' },
  },
  pickup_tomorrow: {
    title: { en: 'Pick-up is tomorrow', it: 'Il ritiro è domani', ro: 'Ridicarea este mâine', es: 'La recogida es mañana' },
    body: { en: 'Your {car} is ready for pick-up tomorrow.', it: 'La tua {car} è pronta per il ritiro domani.', ro: '{car} este gata de ridicare mâine.', es: 'Tu {car} estará lista para recoger mañana.' },
  },
  handover_tomorrow: {
    title: { en: 'Hand-over is tomorrow', it: 'La consegna è domani', ro: 'Predarea este mâine', es: 'La entrega es mañana' },
    body: { en: '{car} goes out tomorrow ({ref}).', it: 'La {car} esce domani ({ref}).', ro: '{car} pleacă mâine ({ref}).', es: 'El {car} sale mañana ({ref}).' },
  },
  return_tomorrow: {
    title: { en: 'Return is tomorrow', it: 'La riconsegna è domani', ro: 'Returnarea este mâine', es: 'La devolución es mañana' },
    body: { en: 'Your {car} is due back tomorrow.', it: 'La tua {car} va riconsegnata domani.', ro: '{car} trebuie returnată mâine.', es: 'Tu {car} debe devolverse mañana.' },
  },
  share_trip: {
    title: { en: 'Your trip is over — share it', it: 'Il viaggio è finito — condividilo', ro: 'Călătoria s-a terminat — împărtășește-o', es: 'Tu viaje terminó — compártelo' },
    body: { en: 'Turn your {car} trip into a card on SIGNAL.', it: 'Trasforma il viaggio con la {car} in una card su SIGNAL.', ro: 'Transformă călătoria cu {car} într-un card pe SIGNAL.', es: 'Convierte tu viaje con el {car} en una tarjeta en SIGNAL.' },
  },
  return_expected: {
    title: { en: 'Your car comes back tomorrow', it: 'La tua auto torna domani', ro: 'Mașina ta revine mâine', es: 'Tu coche vuelve mañana' },
    body: { en: '{car} is due back tomorrow ({ref}).', it: 'La {car} torna domani ({ref}).', ro: '{car} revine mâine ({ref}).', es: 'El {car} vuelve mañana ({ref}).' },
  },
  deposit_released: {
    title: { en: 'Your deposit was released', it: 'Il tuo deposito è stato rilasciato', ro: 'Garanția ta a fost eliberată', es: 'Tu depósito fue liberado' },
    body: {
      en: 'The hold for booking {ref} is back with you. How was the trip? Leave a review.',
      it: 'Il blocco per la prenotazione {ref} è tornato disponibile. Com\'è andato il viaggio? Lascia una recensione.',
      ro: 'Blocarea pentru rezervarea {ref} a fost eliberată. Cum a fost călătoria? Lasă o recenzie.',
      es: 'La retención de la reserva {ref} ha vuelto a ti. ¿Cómo fue el viaje? Deja una reseña.',
    },
  },
  payout_sent: {
    title: { en: 'Payout on its way', it: 'Pagamento in arrivo', ro: 'Plata este pe drum', es: 'Pago en camino' },
    body: { en: '€{amount} is being sent to your bank.', it: '{amount} € in arrivo sul tuo conto.', ro: '{amount} € sunt trimiși în contul tău.', es: '{amount} € van camino de tu banco.' },
  },
  payout_blocked: {
    title: { en: 'Finish your payout setup', it: 'Completa la configurazione dei pagamenti', ro: 'Finalizează configurarea plăților', es: 'Termina la configuración de cobros' },
    body: {
      en: 'A €{amount} payout is waiting — add your bank details to receive it.',
      it: 'Un pagamento di {amount} € è in attesa: aggiungi i dati bancari per riceverlo.',
      ro: 'O plată de {amount} € așteaptă — adaugă datele bancare pentru a o primi.',
      es: 'Un pago de {amount} € está esperando: añade tus datos bancarios para recibirlo.',
    },
  },
  message_fallback: {
    title: { en: '', it: '', ro: '', es: '' },
    body: { en: 'Sent you a message', it: 'Ti ha inviato un messaggio', ro: 'Ți-a trimis un mesaj', es: 'Te ha enviado un mensaje' },
  },
  listing_submitted: {
    title: { en: 'New listing to review', it: 'Nuovo annuncio da rivedere', ro: 'Anunț nou de verificat', es: 'Nuevo anuncio por revisar' },
    body: {
      en: '{car} — goes live in 5 minutes unless you take a look.',
      it: '{car}: va online tra 5 minuti se nessuno lo guarda.',
      ro: '{car} — devine live în 5 minute dacă nu îl verifici.',
      es: '{car}: sale en 5 minutos si nadie lo revisa.',
    },
  },
  verif_ok_identity: {
    title: { en: 'Your identity is verified ✓', it: 'La tua identità è verificata ✓', ro: 'Identitatea ta este verificată ✓', es: 'Tu identidad está verificada ✓' },
    body: { en: 'Your profile now has the verified badge.', it: 'Il tuo profilo ora ha il badge di verifica.', ro: 'Profilul tău are acum insigna de verificare.', es: 'Tu perfil ya tiene la insignia de verificado.' },
  },
  verif_ok_licence: {
    title: { en: 'Your driving licence is verified ✓', it: 'La tua patente è verificata ✓', ro: 'Permisul tău de conducere este verificat ✓', es: 'Tu carnet de conducir está verificado ✓' },
    body: { en: 'You are ready to rent.', it: 'Sei pronto a noleggiare.', ro: 'Ești gata să închiriezi.', es: 'Ya puedes alquilar.' },
  },
  verif_no_identity: {
    title: { en: 'Your identity needs a new photo', it: 'La tua identità ha bisogno di una nuova foto', ro: 'Identitatea ta are nevoie de o fotografie nouă', es: 'Tu identidad necesita una foto nueva' },
    body: { en: '{reason}', it: '{reason}', ro: '{reason}', es: '{reason}' },
  },
  verif_no_licence: {
    title: { en: 'Your driving licence needs a new photo', it: 'La tua patente ha bisogno di una nuova foto', ro: 'Permisul tău de conducere are nevoie de o fotografie nouă', es: 'Tu carnet de conducir necesita una foto nueva' },
    body: { en: '{reason}', it: '{reason}', ro: '{reason}', es: '{reason}' },
  },
  saved_car: {
    title: { en: 'Your saved {car} is still free', it: 'La {car} che hai salvato è ancora libera', ro: '{car} salvată de tine este încă liberă', es: 'El {car} que guardaste sigue libre' },
    body: { en: 'Available in {city} this week. Book it before someone else does.', it: 'Disponibile a {city} questa settimana. Prenotala prima che lo faccia qualcun altro.', ro: 'Disponibilă în {city} săptămâna aceasta. Rezerv-o înainte să o facă altcineva.', es: 'Disponible en {city} esta semana. Resérvalo antes de que lo haga otra persona.' },
  },
  listing_live: {
    title: { en: 'Your {car} is live', it: 'Il tuo annuncio {car} è online', ro: 'Anunțul {car} este live', es: 'Tu anuncio de {car} está en línea' },
    body: { en: 'Renters can find it now.', it: 'Ora i clienti possono trovarlo.', ro: 'Chiriașii îl pot găsi acum.', es: 'Los clientes ya pueden encontrarlo.' },
  },
  listing_rejected: {
    title: { en: 'Your {car} needs changes', it: 'Il tuo annuncio {car} richiede modifiche', ro: 'Anunțul {car} necesită modificări', es: 'Tu anuncio de {car} necesita cambios' },
    body: { en: '{reason}', it: '{reason}', ro: '{reason}', es: '{reason}' },
  },
};

const fill = (s: string, vars: Record<string, string | number>) => s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));

export function text(key: string, lang: Lang, vars: Record<string, string | number> = {}): { title: string; body: string } | null {
  const e = TEXTS[key];
  if (!e) return null;
  return { title: fill(e.title[lang] ?? e.title.en, vars), body: fill(e.body[lang] ?? e.body.en, vars) };
}

/** The language a person chose in the app (en when unknown). */
export async function getUserLang(supabase: SupabaseClient, userId: string): Promise<Lang> {
  try {
    const { data } = await supabase.from('user_notification_prefs').select('lang').eq('user_id', userId).maybeSingle();
    const l = (data as { lang?: string } | null)?.lang;
    if (l === 'it' || l === 'ro' || l === 'es') return l;
  } catch {
    /* column not there yet */
  }
  return 'en';
}
