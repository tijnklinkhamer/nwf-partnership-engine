# ADR 0003 — The ECHE source resolver fails closed across redirects

- **Status:** Accepted
- **Date:** 2026-08-24
- **Phase:** post-Phase-1D security hardening. Adds no data source, no schema
  change, no migration, no dependency and no capability.
- **Supersedes in part:**
  `docs/adr/0002-website-claims-and-fr-official-verification.md` §11, which
  recorded this as outstanding.

---

## 1. The weakness

`src/ingest/eche/source.ts` issued both of its requests as:

```ts
await fetch(url, { redirect: 'follow' });
```

`assertOfficialUrl` validated the URL that was about to be requested, and that
validation was sound. It was also the only one that ever ran.

`redirect: 'follow'` hands redirect handling to the runtime. The runtime issues
the request to the target **before any code in this repository can look at it**.
So an official URL answering

```
302 Location: https://elsewhere.example/list.xlsx
```

would already have been fetched from `elsewhere.example` by the time
`fetchOrExplain` returned — outside the allow-list, with
`ingest_runs.resolved_file_url` and `organisation_sources.source_url` still
naming the official URL that was asked for. Inspecting `Response.url` afterwards
cannot un-issue a request that has already happened.

Two paths were affected: the official document page fetch in
`resolveFromOfficialPage`, and the spreadsheet download reached from both that
function and `resolveFromUrl`.

This was Phase 1A behaviour, written before the pattern that ADR 0001 §11a
established for the EWP catalogue and ADR 0002 applied to the French register.
It was the last resolver still following redirects.

## 2. Decision

**No redirect is followed. Every 3xx is a fail-closed error.**

```ts
res = await fetch(url, { redirect: 'manual' });
if (REDIRECT_STATUSES.has(res.status)) throw new SourceResolutionError(/* names the target */);
```

`REDIRECT_STATUSES` is `301, 302, 303, 307, 308`. The error names the refused
`Location`, states that the target was **not** requested, says nothing was
ingested, and points at the two recovery paths that already exist.

This is deliberately the same rule as EWP and the French register, not a
variation on it. Three official sources now share one boundary, and
`phase1d.firewall.test.ts` asserts that repository-wide rather than per file.

### 2a. Same-host redirects are refused too

This is a decision, not an oversight, and it is the one place where a narrower
policy was genuinely available.

A hop from `/sites/default/files/2026-08/…xlsx` to
`/sites/default/files/2026-09/…xlsx` on the approved host reaches no new host
and crosses no allow-list. It would still leave `resolved_file_url` naming a URL
that did not serve these bytes, so the artifact's SHA-256 — the thing that
actually identifies an ECHE artifact in this repository — would belong to a
location nothing recorded. Provenance that is _nearly_ right is the failure mode
this repository exists to avoid.

The recovery path is already safe and already documented: the operator passes
the new URL with `--url`, where it is validated in its own right, or supplies
the bytes with `--file`. Rule 6 ("fail closed on source resolution") describes
exactly this shape of recovery.

### 2b. What was NOT built

No redirect-following mechanism, bounded or otherwise. No hop counter — there
are no hops to count, so a redirect loop terminates at the first response by
construction rather than by a limit. No generic URL-safety framework, no
address classifier, no allow-list expansion: the set of reachable hosts is
strictly smaller after this change than before it, and identical on the happy
path.

## 3. What was not verified, and why it did not block the decision

**UNKNOWN: whether the live ECHE endpoints redirect at all.** No live probe was
possible from the environment this change was made in — the host was
unreachable, so `erasmus-plus.ec.europa.eu` was never contacted. Nothing here
should be read as a measurement of the EC's live behaviour.

The decision does not depend on the answer:

- If the endpoints answer `200` directly, as the French register's export
  endpoint does, the change costs nothing.
- If one of them redirects, discovery now stops with an error that names the
  target and tells the operator what to do, instead of silently downloading from
  wherever the hop pointed. That is the correct outcome under rule 6, and it is
  strictly better than the previous behaviour, which would have followed the hop
  without recording it.

The failure mode of being wrong here is a loud, actionable error on an
operator-run command, with two working escape hatches. The failure mode of the
previous behaviour was a silent trust-boundary escape with falsified provenance.

## 4. Origin validation, tightened

`assertOfficialUrl` kept every gate it had (https, host allow-list, the
`/sites/default/files/` prefix, `.xlsx`) and its exact error messages. The gates
common to every ECHE request moved into `assertOfficialOrigin`, which added two:

- **Userinfo is refused.** `https://user:pw@erasmus-plus.ec.europa.eu/…` passes
  a hostname check and still transmits credentials this repository has no
  business holding; it is also the standard disguise for a look-alike host. The
  password is never echoed into the error message.
- **An explicit port is refused.** The approved source contract is default
  https. A port on an allow-listed host reaches a service that was never
  approved.

`assertOfficialPageUrl` applies that same origin gate to the document page,
which lives outside the uploads prefix. The page URL is a module constant today;
validating a constant is what keeps it one if somebody later makes it an
argument.

**SSRF is closed by the host allow-list, not by a new classifier.** `localhost`,
loopback and private IP literals, and look-alike hosts all fail
`ALLOWED_HOSTS.has(url.hostname)`, and the tests assert that they are refused
with **zero** requests issued.

## 5. Provenance is unchanged

No field was added, renamed or repurposed. `ResolvedSource` already separated
the concepts this change touches:

| field         | meaning                                        |
| ------------- | ---------------------------------------------- |
| `pageUrl`     | the official page the file was DISCOVERED from |
| `fileUrl`     | the URL the bytes were READ from               |
| `filePath`    | the local path the bytes were read from        |
| `sha256`      | the artifact's identity                        |
| `retrievedAt` | when this run read the bytes                   |

Because no redirect is ever followed, `fileUrl` is now **provably** the URL that
was validated and requested: the two can no longer diverge. There is no redirect
chain to record, because there is never a chain. `ingest.ts`, the schema and
every consumer are untouched.

## 6. Tests

`src/test/unit/source.test.ts` proves the boundary against a stubbed `fetch`,
with no live network — which is also the only way to prove the thing that
matters, that a refused target **was never requested**. The stub records every
URL it is asked for and asserts on each call that the caller passed
`redirect: 'manual'`.

Covered: a 200 on an operator URL; the full discovery path over two
non-redirecting hops; a 302 to a hostile host; every redirect status
(301/302/303/307/308); an `https → http` downgrade; a target carrying userinfo;
a same-host hop; a missing `Location`; a malformed `Location`; a
self-referential redirect; a redirecting document page (no file is requested);
a redirecting file URL (no third request); and six unapproved candidates —
hostile host, http, userinfo, explicit port, `127.0.0.1`, `localhost` — refused
before any request at all. One further test strips comments and asserts the
module has a single `fetch` call site and never names `redirect: 'follow'`.

`phase1d.firewall.test.ts` gains one repository-wide assertion: every
official-source resolver passes `redirect: 'manual'` at every fetch call site
and refuses 3xx explicitly. It is only there because it is now true of all
three.
