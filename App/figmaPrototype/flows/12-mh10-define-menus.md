# 12 - MH-10 Definisci i menù

Task di design assegnato: **MH-182**. Attori: dipendenti e gestore.

## Schermate e percorso

1. Dalla pianificazione o dal servizio del giorno lo staff apre il menù di un turno identificato da data e orario.
2. Nell'[editor](../exports/screens/FirstDesignPrototype/29-DefinisciMenu.svg) scrive il testo e controlla l'anteprima. Grassetto, corsivo, elenchi e sottoelementi corrispondono alla formattazione Markdown prevista; l'anteprima non interpreta HTML.
3. In alternativa apre i [menù precedenti](../exports/screens/FirstDesignPrototype/34-MenuPrecedenti.svg), ne sceglie uno e torna all'editor con una copia modificabile. L'originale e gli altri turni non cambiano.
4. **Salva menù** salva solo il turno selezionato. **Annulla** abbandona le modifiche, chiedendo conferma se ci sono modifiche non salvate. **Rimuovi menù** richiede conferma esplicita e rende il menù non disponibile per quel turno.
5. Al salvataggio riuscito mostrare un messaggio di conferma; la vista pubblica è descritta in [MH-11](./13-mh11-view-meal-details.md).

## Stati

- Nessun menù per il turno: editor vuoto e indicazione che non è ancora disponibile. Nessun menù precedente: stato vuoto e ritorno all'editor.
- Mostrare lunghezza e limite di 5.000 caratteri; un errore di validazione conserva il testo. Un errore di rete non deve far credere che il menù sia stato salvato.
- Un turno terminato è in sola lettura; se termina durante la modifica, indicare il motivo del mancato salvataggio conservando il testo.
- Confermare prima di sostituire modifiche non salvate con un menù precedente. La scelta del menù non salva automaticamente.
- Anteprima e controlli devono essere accessibili da tastiera; su schermi piccoli l'anteprima segue l'editor.

Il formato e i vincoli riprendono la proposta nel branch `origin/docs/api-db-mh09-mh10-mh11-mh20`, non ancora integrata o implementata in questo branch.
