# code

**Integrity.** Always on, always an error, and it cannot be turned off.

A step's `code` does not fit the page. It names a file the page does not show, a line past the end, too many lines to read at once, or an elision line.

**Fix.** `code.file` must be one of the page's `files`. `code.lines` counts shown lines: an `excerpt()` joins its ranges with elision lines, so shown line 2 can be source line 14. Twelve highlighted lines at most, within a span of 20.
