# reserved-route

**Integrity.** Always on, always an error, and it cannot be turned off.

A demo route clashes with an address the deck serves itself, such as `/s`, `/present`, `/speaker`, `/_health`, `/demos` or `/live-ish`, or two demos claim the same address. Frames and the presenter share one namespace on one origin.

**Fix.** Give the route a name of its own, such as `/orders`.
