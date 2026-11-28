# 14 - MH-20 Registra un'escursione

Task di design assegnato: **MH-187**, sotto la storia **MH-167** sulla board. La proposta tecnica nel repository identifica la funzionalità come **MH-20**: l'associazione è basata sui rispettivi titoli, da confermare con il team. Attore: escursionista autenticato.

## Schermate e percorso

1. L'escursionista accede e apre [Registra un'escursione](../exports/screens/FirstDesignPrototype/31-RegistraEscursione.svg). L'ingresso **Le mie escursioni** nella navigazione è una proposta di design, non una pagina già implementata.
2. Può compilare destinazione e descrizione del percorso e aggiungere punti di passaggio nell'ordine previsto, oppure scegliere tra i [percorsi proposti](../exports/screens/FirstDesignPrototype/33-PercorsiProposti.svg). I nomi delle schermate sono dati di esempio, non un catalogo reale.
3. La scelta di un percorso proposto precompila una copia modificabile; non registra automaticamente e non modifica il modello. Se il modulo contiene già modifiche, chiedere conferma prima di sostituirle. L'utente può anche tornare al modulo senza scegliere.
4. **Registra escursione** salva il percorso dell'utente autenticato. Solo dopo risposta positiva mostrare la [conferma](../exports/screens/FirstDesignPrototype/35-EscursioneRegistrata.svg) con il riepilogo dei dati effettivamente salvati.
5. **Annulla** torna all'ingresso senza salvare, con conferma se il modulo è stato modificato.

## Stati e vincoli

- Destinazione e descrizione sono obbligatorie; punti di passaggio facoltativi. Secondo la proposta: destinazione fino a 200 caratteri, descrizione fino a 1.000, massimo 20 punti da 100 caratteri ciascuno, non vuoti. Mostrare gli errori accanto ai campi, preservando i dati inseriti.
- Il catalogo può essere vuoto o non raggiungibile: distinguere i due stati e consentire la compilazione manuale. Un errore di salvataggio mantiene il modulo e offre una nuova prova; evitare invii duplicati durante il caricamento.
- In assenza di accesso, indirizzare al login senza far credere che l'escursione sia stata salvata. Gli errori e le etichette sono testuali e accessibili da tastiera; su mobile i pannelli passano in colonna.
- La registrazione aiuta lo staff a comprendere l'itinerario ma non garantisce sicurezza e non sostituisce le procedure di soccorso. Data e ora di partenza/rientro non sono incluse nella proposta tecnica consultata: non inventare scadenze, monitoraggio automatico o notifiche.

Campi e limiti provengono dalla proposta nel branch `origin/docs/api-db-mh09-mh10-mh11-mh20`; non sono prova di implementazione. Confermare con il team eventuali requisiti aggiuntivi della storia sulla board.
