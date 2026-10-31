# config

**Integrity.** Always on, always an error, and it cannot be turned off.

`deck.config.ts` has a wrong field. A misspelled name, a wrong type or a missing required field stops the deck before anything renders, because a wrong setting should fail in words and never as a blank frame on stage.

**Fix.** Read the path in the message. It names the field, the type expected there and the nearest valid name. Four fields are required: `schemaVersion`, `title`, `speaker.name` and `order`.
