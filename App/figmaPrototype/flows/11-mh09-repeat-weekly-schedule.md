# 11 - MH-09 Ripeti la pianificazione settimanale

Task di design assegnato: **MH-180**. Attori: dipendenti e gestore.

## Schermate e percorso

1. Dalla [pianificazione settimanale](../exports/screens/FirstDesignPrototype/04-PianificazioneSettimanale.jpg), lo staff apre **Ripeti settimana**.
2. Nella [scelta delle settimane](../exports/screens/FirstDesignPrototype/28-RipetiSettimana.svg) seleziona la settimana di partenza, il primo lunedì di destinazione e il numero di settimane consecutive.
3. Il [riepilogo](../exports/screens/FirstDesignPrototype/32-ConfermaRipetizione.svg) identifica le settimane coinvolte e richiede una conferma esplicita. **Torna alle scelte** conserva la selezione; **Annulla** torna alla pianificazione senza modifiche.
4. Dopo la conferma, un esito positivo indica le settimane create e i turni sostituiti, con accesso alla pianificazione. Non mostrare il successo finché il salvataggio non è confermato.

## Stati e prevenzione degli errori

- Mostrare errori accanto ai campi: data non valida o non lunedì, destinazione non futura o comprendente la settimana originale, numero fuori intervallo. Una settimana originale senza turni non è copiabile.
- Un turno di destinazione con prenotazioni, anche annullate, blocca tutta la copia. Mostrare la settimana interessata se disponibile, mantenere le scelte e permettere di correggerle. Anche una sovrapposizione ai confini della settimana o un errore di rete deve produrre un messaggio esplicito, non un successo.
- Avvisare prima della conferma che i turni esistenti nelle destinazioni saranno sostituiti; l'operazione è atomica. Se la verifica fallisce, nulla viene modificato.
- Si copiano giorni, orari locali e tavoli, non prenotazioni né menù. I nuovi turni sono modificabili singolarmente; i menù si impostano in [MH-10](./12-mh10-define-menus.md).
- Durante il salvataggio mostrare lo stato di caricamento e impedire conferme duplicate. Per schermate piccole, le card passano in colonna; ordine di tabulazione, etichette, errori testuali e focus devono seguire l'ordine visivo.

Le regole sopra, incluso il limite di 12 settimane, seguono la proposta non ancora integrata nel branch `origin/docs/api-db-mh09-mh10-mh11-mh20`; sono da confermare con il team prima dell'implementazione.
