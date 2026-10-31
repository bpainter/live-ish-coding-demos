A terminal step reveals a range of recorded lines. Lines are numbered from 1 in `recordings/session.json`, the way `live-ish record` wrote them.

The rule fails in three cases:

- A range ends past the last line of the recording. The step would reveal nothing, or only part of what it promises. This usually means the session got shorter after the steps were written.
- A range starts past the line after the previous step's range. The lines between never show on stage, while the code beside them still claims they ran.
- The recording file is missing or does not parse.

To fix it, map each step to the range it should reveal, starting at line 1 and carrying on from the last step's end. After you edit `session.txt`, run `live-ish record <id>` and check the ranges again.
