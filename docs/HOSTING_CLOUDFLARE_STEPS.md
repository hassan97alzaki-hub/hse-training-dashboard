# Hosting the trial on Cloudflare Pages with Cloudflare Access

Status: preparation only. Nothing here has been run. The owner performs every
login and every deploy step.

Why this option: hosting is free, the site is static, and Cloudflare Access
closes the link to a list of email addresses. The trial dates inside the build
only change what the page shows. Access is what actually ends the trial.

Plan details change. Check the Cloudflare pricing pages before starting.

## 0. Before you start

- A Cloudflare account (free). A payment card may be requested for Zero Trust
  even on the free plan.
- The company name and the real trial start and end dates.
- The email addresses allowed to open the trial.
- A decision on the contact channel for `landing/index.html` (it has none yet).

## 1. Build the release

```
node scripts/build-trial-release.mjs --trial --company "<name>" \
  --start YYYY-MM-DD --end YYYY-MM-DD --name <release-name>
```

The script scans the output and refuses to produce an archive that contains a
home path, an account name, a secret, a real email domain or a non-demo data
file. Read `release/<release-name>/MANIFEST.txt` afterwards.

The folder to upload is `release/<release-name>/app/`.

## 2. Create the Pages project (direct upload)

1. Cloudflare dashboard, Workers & Pages, Create, Pages, Upload assets.
2. Name the project. Do not use the customer's name if the link may be seen by
   others; the name becomes part of the address.
3. Upload the `app/` folder. Deploy.
4. The site is now at `https://<project>.pages.dev`. It is public until step 3
   is done. Do not share the address yet.

Alternative with the CLI: `npx wrangler pages deploy release/<release-name>/app --project-name <project>`.

## 3. Close it with Access (before sharing anything)

1. Zero Trust, Access, Applications, Add an application, Self-hosted.
2. Application domain: `<project>.pages.dev`. Also cover preview deployments
   (`*.<project>.pages.dev`), or disable preview URLs for the project.
3. Policy: Action Allow, Include, Emails, then the allowed addresses.
4. Login method: One-time PIN. The user types the email and receives a code.
5. Session duration: short (for example 24 hours).
6. Save.

## 4. Test as a stranger

- Open the address in a private window. The Access login must appear, not the
  application.
- Try an email that is not on the list. It must be refused.
- Try an allowed email. The application must open and show the trial banner.
- Load the demo data and confirm the test-requirements banner appears.

## 5. Share

Send the address and a short note: use the allowed email, a code arrives by
mail, files are read inside the browser and are not uploaded. Data policy is in
`docs/TRIAL_OPERATIONS_RUNBOOK.md`.

## 6. End of trial

Remove the email from the Access policy, then delete the Pages project (or the
deployment). Remove the customer's files from your own machine if you received
any. Record the end in the runbook log.

## Limits to remember

- Dates in the build are a UX gate, not security.
- The host sees the interface files, never the customer's data.
- Free-plan limits (user count, build count) can change.
