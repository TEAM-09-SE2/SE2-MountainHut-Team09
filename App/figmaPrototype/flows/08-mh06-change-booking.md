# 08 - MH-06 Modifica prenotazione

## Schermate

- [Le mie prenotazioni](../exports/screens/FirstDesignPrototype/13-LeMiePrenotazioni.svg)
- [Modifiche chiuse](../exports/screens/FirstDesignPrototype/26-ModificheChiuse.svg)
- [Modulo precompilato](../exports/screens/FirstDesignPrototype/14-ModificaPrenotazione.svg)
- [Esito modifica e posti insufficienti](../exports/screens/FirstDesignPrototype/15-EsitoModifica.svg)

La lista mostra data, orario, gruppo, esigenze e stato; le prenotazioni passate e annullate sono attenuate. Mostrare **Modifica** solo quando la prenotazione è modificabile: le modifiche chiudono 48 ore prima dell'inizio del turno attuale. L'annullamento ha una scadenza diversa.

Il modulo permette di cambiare turno, gruppo ed esigenze con gli stessi controlli della prenotazione. Se non ci sono posti sufficienti, mostrare l'errore e mantenere la prenotazione originale. Dopo il salvataggio, mostrare il riepilogo aggiornato e l'esito effettivo dell'email; un errore di invio non annulla la modifica.
