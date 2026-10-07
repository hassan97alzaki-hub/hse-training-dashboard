# Trial operations runbook

One customer, seven days, local mode. Every step below is manual and is done by
the person running the trial.

## 1. Before the trial

- [ ] Agree the window with the customer: a start day and an end day, written
      as `YYYY-MM-DD`. Seven days means the start day plus six.
- [ ] Agree the trial owner on the customer side **by job role**, not by
      personal name (for example "HSE Supervisor").
- [ ] Say in writing what the trial is: the current product, in local mode, with
      no accounts, no cloud storage and no alerts.
- [ ] Say in writing what the trial is not: not a commitment to a delivery date
      and not a promise of a future feature.
- [ ] Build with `VITE_TRIAL_MODE=true` and the agreed dates
      (`docs/TRIAL_BUILD_AND_RUN.md` §2).
- [ ] Host privately behind an access policy that expires on the end day
      (§4 of the same document). **The dates inside the build do not close
      access; the hosting policy does.**
- [ ] Open the build yourself once, in Arabic and in English, and confirm the
      banner shows the right company, window and remaining days.

## 2. Receiving a file

- [ ] Ask for a **redacted** extract: employee number, department code, job
      title code, course code, completion date, expiry date, status.
- [ ] Ask explicitly for **no** names where possible, and for **no** national id,
      iqama number, date of birth, nationality, email address or phone number.
      The application refuses those columns, but the request has to be made
      before the file is sent, not after.
- [ ] **Contact data is not accepted during a trial.** `HSE-CONTACT-1.0` exists
      and is validated in code, but no contact file is collected, stored or
      processed in a trial. If the customer offers one, decline and explain that
      the alerting feature does not exist yet.
- [ ] Receive the file through a channel the customer chooses. Do not ask for it
      by email if they prefer something else.
- [ ] Keep the file only on the machine that needs it, in one folder you can
      delete in one step. Do not copy it into the repository, into a screenshot,
      or into a message.

## 3. During the trial

- [ ] Walk the customer through the three quick-start steps: demonstration
      data, their own file, review and export.
- [ ] When the preview reports issues, read them back by code, sheet, row and
      field. Never read employee names out of the file.
- [ ] If the requirements matrix is not approved by their training owner, point
      at the test-requirements banner and say plainly that the numbers are a
      technical demonstration, not a compliance result.
- [ ] Record questions and defects in `docs/BACKLOG.md`, without customer data.
- [ ] Do not promise a feature. Write down the request instead.

## 4. What counts as a successful trial

Agreed before the trial starts, measured at the end:

- [ ] The customer imported at least one of their own files and reached a
      dashboard without a blocking issue they could not resolve.
- [ ] The preview caught at least one real data problem they did not know about,
      or they confirmed their file is clean.
- [ ] They exported a CSV or a PDF and found it usable as it stands.
- [ ] They can state, in their own words, what the tool does and what it does
      not do yet.
- [ ] A written decision at the end: continue, extend, or stop.

## 5. Closing

- [ ] On the end day, remove the deployment, or let the access policy expire and
      then remove it. Do not rely on the dates inside the bundle.
- [ ] Delete the temporary copies: the customer file, any generated workbook,
      any screenshot that shows their data, and the release archive if it was
      shared from your machine.
- [ ] Confirm the deletion to the customer in writing, listing what was deleted.
- [ ] Keep only the non-personal outcome: the decision, the defects found and
      the feature requests.
- [ ] If the trial is extended, build again with the new dates. Do not hand out
      a build whose window has already passed.

## 6. Things that end a trial early

- A request to send employee contact data, or any identity column, that the
  customer will not withdraw.
- A request to deploy publicly or to integrate with a live system.
- Any need for accounts, permissions or an audit trail, which the current
  product does not have.

In all three cases, stop, say which part does not exist yet, and offer the next
step as a separate piece of work.
