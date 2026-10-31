# excerpt

**Integrity.** Always on, always an error, and it cannot be turned off.

An `excerpt()` does not line up with its file. A range is out of order or past the end, or the shown text differs from the source.

**Fix.** Ranges are inclusive, ascending and in the file's own line numbers. When a file changes, update the ranges with it. The message prints the first line that differs.
