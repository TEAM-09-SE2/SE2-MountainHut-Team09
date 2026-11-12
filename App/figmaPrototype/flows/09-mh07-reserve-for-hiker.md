# 09 - MH-07 Prenotazione per un ospite

## Schermate

- [Scelta ospite e ingresso rapido](../exports/screens/FirstDesignPrototype/16-PrenotaPerOspite.svg)
- [Ricerca ospite esistente](../exports/screens/FirstDesignPrototype/25-RicercaOspite.svg)
- [Nuovo account e email già utilizzata](../exports/screens/FirstDesignPrototype/17-NuovoAccountOspite.svg)
- [Riepilogo staff](../exports/screens/FirstDesignPrototype/18-RiepilogoStaff.svg)
- [Esito staff](../exports/screens/FirstDesignPrototype/19-EsitoPrenotazioneStaff.svg)
- [Lista staff](../exports/screens/FirstDesignPrototype/12-PrenotazioniStaff.svg)
- [Recupero password](../exports/screens/FirstDesignPrototype/20-RecuperoPassword.svg), [nuova password](../exports/screens/FirstDesignPrototype/21-NuovaPassword.svg), [conferma](../exports/screens/FirstDesignPrototype/27-PasswordAggiornata.svg)

Lo staff parte dall'ingresso rapido per un ospite temporaneo oppure cerca un ospite esistente o crea un account completo. Nome e cognome sono obbligatori; il temporaneo non ha email né accesso. Per un account completo, l'email è obbligatoria e un'email già utilizzata suggerisce la ricerca dell'ospite esistente.

Il percorso prosegue con data, turno, gruppo, esigenze e riepilogo. La prenotazione staff è possibile fino all'inizio del turno, in presenza di posti. Lo staff vede chi l'ha inserita e gli ospiti temporanei. Dopo la conferma, il temporaneo non riceve email; per un nuovo account la password temporanea è mostrata una sola volta allo staff, che deve comunicarla all'ospite. Non è inviata per email e va cambiata al primo accesso.

Il recupero password presenta sempre lo stesso messaggio, senza rivelare se l'account esiste. Il link è monouso e valido un'ora; uno scaduto o non valido permette di richiederne un altro.
