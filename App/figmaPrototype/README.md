# Design Prototype (Figma-style)

This folder contains design flow documents and static screen exports. The technical flow notes are mainly in English; several screen walkthroughs and exported frames are in Italian. These artifacts describe intended interactions, not proof that every flow is implemented. See the [implementation status](../../documentation/implementation-status.md) and [frontend guide](../frontend/README.md) for the current branch behavior.

## Core screens

- [00 - Home](./flows/00-home.md)
- [01 - Login](./flows/01-login.md)
- [02 - Registration](./flows/02-registration.md)

## Booking and slot lifecycle flows available in this repository

- [03 - MH-01 Book a table](./flows/03-mh01-book-a-table.md)
- [04 - MH-02 Define slot capacity](./flows/04-mh02-define-slot-capacity.md)
- [05 - MH-03 Receive confirmation](./flows/05-mh03-receive-confirmation.md)
- [06 - MH-04 Check availability](./flows/06-mh04-check-availability.md)
- [07 - MH-05 Party requirements](./flows/07-mh05-party-requirements.md)
- [08 - MH-06 Change booking](./flows/08-mh06-change-booking.md)
- [MH-06 technical interaction notes](./flows/07-mh06-change-booking.md)
- [09 - MH-07 Reserve for hiker](./flows/09-mh07-reserve-for-hiker.md)
- [MH-07 technical interaction notes](./flows/08-mh07-reserve-for-a-hiker.md)
- [MH-07 Password recovery](./flows/09-mh07-password-recovery.md)
- [10 - MH-08 Cancel booking](./flows/10-mh08-cancel-booking.md)

## Sprint 3 design proposals

- [11 - MH-09 Repeat a weekly schedule (MH-180)](./flows/11-mh09-repeat-weekly-schedule.md)
- [12 - MH-10 Define menus (MH-182)](./flows/12-mh10-define-menus.md)
- [13 - MH-11 View meal details (MH-185)](./flows/13-mh11-view-meal-details.md)
- [14 - MH-20 Register a hike (board MH-167 / task MH-187)](./flows/14-mh20-register-hike.md)

These are static design proposals, not implemented application features or an interactive Figma prototype. The story mapping for hike registration and the rules from the separate `origin/docs/api-db-mh09-mh10-mh11-mh20` proposal should be confirmed with the team. Other MH-09 through MH-19 topics remain product requirements.

MH-07 uses single-use recovery links valid for **24 hours**. Staff see a new full account's temporary password once. The hiker changes it at first login. MH-08 frames show booking cancellation.

Use the [application guide](../README.md) to run the implementation and the [test results](../../documentation/testing.md#latest-validation) to see which flows were verified in the browser.

## HCI baseline (strict, applied to every screen)

1. Visibility of status
2. Error prevention
3. Recognition over recall
4. Consistency and standards
5. User control and safe undo/confirm paths
6. Accessible contrast and keyboard order
7. Progressive disclosure
8. Explicit feedback after every critical action

## Visual screen exports

- [00 - Homepage](./exports/screens/FirstDesignPrototype/00-HomePage.jpg)
- [01 - Logged-in user](./exports/screens/FirstDesignPrototype/01-PaginaUtenteLoggato.jpg)
- [02 - Bookings](./exports/screens/FirstDesignPrototype/02-PaginaPrenotazioni.jpg)
- [03 - Daily services](./exports/screens/FirstDesignPrototype/03-ServiziDelGiorno.jpg)
- [04 - Weekly planning](./exports/screens/FirstDesignPrototype/04-PianificazioneSettimanale.jpg)
- [05 - Login](./exports/screens/FirstDesignPrototype/05-Login.jpg)
- [06 - Registration](./exports/screens/FirstDesignPrototype/06-Registrazione.jpg)
- [07 - Define slot capacity](./exports/screens/FirstDesignPrototype/07-DefinizioneCapacita.svg)
- [08 - Booking confirmation](./exports/screens/FirstDesignPrototype/08-ConfermaPrenotazione.svg)
- [09 - Check availability](./exports/screens/FirstDesignPrototype/09-VerificaDisponibilita.svg)

### New screens: requirements, changes, staff reservations and cancellation

The following are static SVG design frames, suitable for import into Figma. They are not an interactive Figma prototype. Panels labelled **stato alternativo** show a separate UI state, not simultaneous live feedback. The flows above explain the transitions.

- [10 - Party requirements](./exports/screens/FirstDesignPrototype/10-EsigenzeGruppo.svg)
- [11 - Booking review](./exports/screens/FirstDesignPrototype/11-RiepilogoEsigenze.svg)
- [12 - Staff bookings](./exports/screens/FirstDesignPrototype/12-PrenotazioniStaff.svg)
- [13 - My bookings](./exports/screens/FirstDesignPrototype/13-LeMiePrenotazioni.svg)
- [14 - Change booking](./exports/screens/FirstDesignPrototype/14-ModificaPrenotazione.svg)
- [15 - Change result](./exports/screens/FirstDesignPrototype/15-EsitoModifica.svg)
- [16 - Reserve for a hiker](./exports/screens/FirstDesignPrototype/16-PrenotaPerOspite.svg)
- [17 - New hiker account](./exports/screens/FirstDesignPrototype/17-NuovoAccountOspite.svg)
- [18 - Staff booking review](./exports/screens/FirstDesignPrototype/18-RiepilogoStaff.svg)
- [19 - Staff booking result](./exports/screens/FirstDesignPrototype/19-EsitoPrenotazioneStaff.svg)
- [20 - Password recovery](./exports/screens/FirstDesignPrototype/20-RecuperoPassword.svg)
- [21 - Set new password](./exports/screens/FirstDesignPrototype/21-NuovaPassword.svg)
- [22 - Confirm cancellation](./exports/screens/FirstDesignPrototype/22-ConfermaAnnullamento.svg)
- [23 - Cancellation result](./exports/screens/FirstDesignPrototype/23-EsitoAnnullamento.svg)
- [24 - Booking confirmation with requirements](./exports/screens/FirstDesignPrototype/24-ConfermaConEsigenze.svg)
- [25 - Search hikers](./exports/screens/FirstDesignPrototype/25-RicercaOspite.svg)
- [26 - Changes closed](./exports/screens/FirstDesignPrototype/26-ModificheChiuse.svg)
- [27 - Password updated](./exports/screens/FirstDesignPrototype/27-PasswordAggiornata.svg)

### Sprint 3 screens

- [28 - Repeat a week](./exports/screens/FirstDesignPrototype/28-RipetiSettimana.svg)
- [29 - Define a slot menu](./exports/screens/FirstDesignPrototype/29-DefinisciMenu.svg)
- [30 - Meal times and menus](./exports/screens/FirstDesignPrototype/30-DettagliPasti.svg)
- [31 - Register a hike](./exports/screens/FirstDesignPrototype/31-RegistraEscursione.svg)
- [32 - Confirm the week copy](./exports/screens/FirstDesignPrototype/32-ConfermaRipetizione.svg)
- [33 - Choose a predefined hike](./exports/screens/FirstDesignPrototype/33-PercorsiProposti.svg)
- [34 - Reuse a previous menu](./exports/screens/FirstDesignPrototype/34-MenuPrecedenti.svg)
- [35 - Hike registration confirmation](./exports/screens/FirstDesignPrototype/35-EscursioneRegistrata.svg)

These SVGs are individual importable frames. Screen transitions and alternate/error states are described in the linked flows; they are not interactive until connected in Figma.

The repository's story identifiers MH-05–MH-08 correspond to the four requested topics; the issue-board identifiers in the supplied screenshots differ.
