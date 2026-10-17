# Prova generale prima del lancio

Servono **due account di prova** (non reali): un **host** (con almeno un'auto pubblicata) e un **cliente**.
Carta di prova Stripe: `4242 4242 4242 4242`, qualsiasi data futura, qualsiasi CVC.
Spunta ogni riga. Se una non funziona, annota cosa hai visto (screenshot) e dove.

## 1. Host
- [ ] Registrazione e accesso come host.
- [ ] Verifica identità e patente (foto), il team la approva da Admin → Verifiche.
- [ ] Pubblicare un'auto: scelta dal catalogo, foto di profilo con la camera, punto di ritiro, prezzo.
- [ ] L'auto compare in Admin → Review queue e dopo 5 minuti è pubblica.
- [ ] Collegamento Stripe Connect (onboarding link) completato in modalità test.

## 2. Cliente: cercare e scrivere
- [ ] Home → "Find a car near you" da disconnesso: si vede la mappa bloccata con i prezzi e la card "Sign in".
- [ ] Registrazione cliente, verifica identità e patente approvate.
- [ ] Mappa: tocco su un pin → la scheda dell'auto compare sopra il pannello della lista.
- [ ] Pagina auto → "Message host": si apre la chat DIRETTA con l'host (non CX).
- [ ] L'host riceve la notifica e risponde; il pipistrello sotto il messaggio si riempie di verde quando viene letto.
- [ ] La chat si apre sempre sull'ultimo messaggio (anche con foto).
- [ ] Il filtro contatti blocca numeri/email nel messaggio.

## 3. Prenotazione e pagamento
- [ ] Prenotare con la carta di prova: prezzi, commissione e protezione corretti.
- [ ] Schermata di conferma con il boarding pass; email di conferma (se Resend è collegato).
- [ ] La prenotazione compare a cliente (My trips) e host (richieste/viaggi).

## 4. Consegna e chiusura
- [ ] Giorno del ritiro: cliente e host si scansionano il CX Pass → il viaggio parte; l'host viene pagato subito.
- [ ] Annulla scansione entro 5 minuti.
- [ ] Riconsegna: seconda scansione → viaggio chiuso, rilascio del deposito.
- [ ] Il timbro compare nel Keychain; toccandolo si vede il boarding pass strappato e "Confirmed".

## 5. Messaggi (gesti, su iPhone vero)
- [ ] Spostare la riga a sinistra → Elimina (con avviso); a destra → Archivia.
- [ ] Tenere premuto → menu, senza selezione del testo.
- [ ] Archivio sempre visibile; una chat archiviata che riceve un messaggio mostra il puntino.
- [ ] Bloccare una persona dalla scheda info: sparisce, e l'altra non può più scriverti. Sbloccare da Impostazioni → Sicurezza.
- [ ] Cancellare e poi riscrivere all'host dalla pagina auto: la chat torna.

## 6. App installata (Home Screen)
- [ ] Eliminare l'app e aggiungerla di nuovo da Safari.
- [ ] Barra di stato (ora, batteria) con lo stesso colore della pagina, in SIGNAL e nelle pagine chiare.
- [ ] Le intestazioni non finiscono sotto l'ora.
- [ ] Notifiche push su iPhone dall'app installata.

## 7. Casi con il team
- [ ] "Parla con una persona" da X → caso con investigatore, stesso nome e ritratto in Messaggi e nella dashboard.
- [ ] Il team risponde da Admin → Cases; chiude il caso; il cliente lo vede chiuso.
