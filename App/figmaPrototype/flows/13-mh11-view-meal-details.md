# 13 - MH-11 Consulta orari e menù

Task di design assegnato: **MH-185**. Attori: visitatori, anche senza accesso, ed escursionisti autenticati.

## Schermata e percorso

La [vista dei pasti](../exports/screens/FirstDesignPrototype/30-DettagliPasti.svg) parte dal rifugio e permette di scegliere una data. Ogni turno mostra orario, disponibilità e menù associato; il menù assente è indicato chiaramente. I contenuti formattati seguono [MH-10](./12-mh10-define-menus.md), senza interpretare HTML.

**Verifica disponibilità** conduce al [controllo disponibilità](./06-mh04-check-availability.md), dove si specificano data, turno e dimensione del gruppo. La lettura non prenota posti. Il percorso di prenotazione richiede l'accesso secondo il flusso esistente; i posti vanno ricontrollati prima della conferma.

## Stati

- Nessun turno nella data: messaggio chiaro e possibilità di cambiare data.
- Menù non definito: **Menù non ancora disponibile**; non riutilizzare implicitamente quello di un altro turno.
- Turno pieno o non prenotabile: mostrare lo stato senza suggerire che posti siano riservabili. Non promettere liste d'attesa non ancora disponibili.
- Caricamento e errore di rete: indicare lo stato e offrire una nuova prova, senza sostituire l'errore con una lista vuota.
- In mobile, mostrare prima selezione della data e turni, poi il pannello informativo; le informazioni non devono dipendere dal solo colore.

La disponibilità e il contenuto mostrati sono esempi di design; la presenza del menù nell'API pubblica è una proposta nel branch `origin/docs/api-db-mh09-mh10-mh11-mh20`, non una funzionalità già disponibile.
