# terminal-token

**Integrity.** Always on, always an error, and it cannot be turned off.

A recording goes on a projector and into a repository, so it must not hold a credential. This rule scans every line of every file under `recordings/`, including hand-written `example: true` lines. It matches registry tokens, `_authToken=` settings, GitHub, GitLab and Slack tokens, AWS access keys, `sk-` API keys and private key headers. `live-ish record` applies the same scan and stops before it writes anything.

**Fix.** If the token is real, revoke it, because a recording that reached a repository or a screen counts as leaked. Change the command so it prints no secret, then run `live-ish record <id>` again. A value that only looks like a token still fails, so change it in the session.
