# terminal-range

**Integrity.** Always on, always an error, and it cannot be turned off.

A `terminal` action reveals recorded lines, numbered from 1 in `recordings/session.json`. This rule fails when a range runs past the last line, when a range starts past the line after the step before it stopped, or when the recording does not parse. The first means the session got shorter after the steps were written. The second leaves lines that never show on stage, while the code beside them still claims they ran.

**Fix.** The message names the step and the last line. Map each step to the lines it reveals, starting at line 1 and carrying on from where the step before stopped. After you edit `session.txt`, run `live-ish record <id>` and check the ranges again.
