# Trial build, local run and private hosting

How to produce the seven-day trial build, how to look at it locally, and how to
host it for one customer. Nothing here publishes anything.

## 0. What a trial build is, and what it is not

A trial build is the ordinary production bundle with four extra build-time
variables. It shows the company name, the agreed window and the days left, and
it switches off importing customer data once the window has passed.

**The dates are a user-experience gate, not access control.** They are compiled
into the bundle and evaluated in the browser, so a changed device clock, an
edited file or a saved copy defeats them. Whoever can open the page can use it.

**Access is closed where the files are served**, by one of:

- Cloudflare Access (or an equivalent identity proxy) in front of the site;
- a signed URL with an expiry, issued by the object store;
- HTTP basic authentication on a private host;
- removing the deployment at the end of the trial, which is the simplest and
  the one the runbook uses.

`src/lib/trial.js` carries the same warning next to the code.

## 1. Variables

| Variable | Meaning | Example |
|---|---|---|
| `VITE_TRIAL_MODE` | `true` turns the trial presentation on. Anything else keeps the application exactly as it is without a trial. | `true` |
| `VITE_TRIAL_COMPANY` | The company the build is prepared for, as it should appear on screen. | `Example Contracting Company` |
| `VITE_TRIAL_START_DATE` | First day of the window, `YYYY-MM-DD`, inclusive. | `2027-01-05` |
| `VITE_TRIAL_END_DATE` | Last day of the window, `YYYY-MM-DD`, inclusive. | `2027-01-11` |

Days are calendar days in `Asia/Riyadh`, the same rule the As Of Date uses, so
the countdown does not depend on the device time zone. Seven days means the
start day plus six.

A build that is enabled but whose dates are missing, unreadable or reversed is
**misconfigured**: the banner says so and nothing is switched off, because a
broken build must not lock a customer out.

Copy `.env.trial.example` to `.env.trial` and edit it. `.env.trial` is ignored
by git. Never put a secret, a token or a personal address in either file.

## 2. Build

```bash
npm ci
npm test
npm run build                       # ordinary build, no trial
```

With a trial:

```bash
cp .env.trial.example .env.trial    # then edit the four values
npm run build -- --mode trial       # Vite reads .env.trial
```

or, without a file:

```bash
VITE_TRIAL_MODE=true \
VITE_TRIAL_COMPANY="Example Contracting Company" \
VITE_TRIAL_START_DATE=2027-01-05 \
VITE_TRIAL_END_DATE=2027-01-11 \
npm run build
```

The bundle lands in `dist/`. It is a set of static files: HTML, JavaScript, CSS
and the demonstration CSVs under `dist/data/`.

## 3. Look at it locally

```bash
npm run preview                     # serves dist/ on http://localhost:4173
```

`vite preview` is a developer convenience. **It is not a production server**: no
authentication, no TLS termination, no access log, no rate limit, and it binds
to the machine it runs on. Use it to check a build, never to give a customer a
link.

Any static server works the same way, for example:

```bash
python3 -m http.server --directory dist 8080
```

The landing page is a single self-contained file and needs no server at all:
open `landing/index.html` directly, or serve the copy that
`scripts/build-trial-release.mjs` places in `release/`.

## 4. Private hosting for one customer

The recommended shape, in order of preference:

1. **Static host behind an identity proxy.** Upload `dist/` to a private
   bucket or a static host, and put Cloudflare Access (or the equivalent) in
   front of it with the customer's email domain on the allow list. Set the
   access policy to expire on the last day of the trial. The policy, not the
   bundle, ends the trial.
2. **Signed URL with a deadline.** Serve `dist/` from an object store and hand
   out a URL that the store itself refuses after the end date.
3. **Basic authentication on a private host.** Acceptable for a short trial if
   the credentials are given out of band and rotated afterwards.
4. **A local copy.** Send the release archive and let the customer run it from
   their own machine. The file then lives with them; say so explicitly, and say
   that the trial dates no longer end anything.

In every case:

- serve over HTTPS;
- do not index the site (the landing page already sends `noindex, nofollow`);
- keep the deployment out of any public listing;
- delete the deployment at the end of the trial, as the runbook requires.

## 5. What the build never does

- No analytics, no telemetry, no error reporting service.
- No cookie, no `localStorage`, no `sessionStorage`.
- No network request of its own: every file is read in the browser.
- No employee contact data is accepted in a trial.

Automated guards assert these properties; see `tests/trialMode.test.js` and
`scripts/build-trial-release.mjs`.
