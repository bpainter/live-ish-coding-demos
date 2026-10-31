A recording goes on a projector and into a repository, so it must not hold a credential. The rule scans every line of every file under `recordings/`, including hand-written `example: true` lines. `live-ish record` applies the same scan and stops before it writes anything.

It matches registry tokens, `_authToken=` settings, GitHub, GitLab and Slack tokens, AWS access keys, `sk-` API keys and private key headers.

To fix it:

1. If the token is real, revoke it. A recording that reached a repository or a screen counts as leaked.
2. Change the command so it prints no secret, or read the secret from an environment variable the command never echoes.
3. Run `live-ish record <id>` again.

A value that only looks like a token still fails. Change it in the session rather than teaching the room to ignore the rule.
