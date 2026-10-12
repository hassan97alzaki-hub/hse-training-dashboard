# Cloud backend setup (Phase 2C)

The dashboard runs in two shapes from the same code:

| | Local-only build | Cloud build |
|---|---|---|
| Storage | the browser's own database | Supabase Postgres |
| Sign-in | none | email + password |
| Data follows | the browser profile | the account |
| Configuration | none | two environment variables |

Nothing below changes the local-only build. Without the two variables the
application behaves exactly as it did before: no sign-in, no request leaves
the device.

---

## 1. Create the project

1. Open https://supabase.com and sign in.
2. **New project**. Pick a name, a strong database password, and the region
   closest to your users (`eu-central-1` or `me-central-1` for Saudi Arabia).
3. Wait for provisioning (about two minutes).

## 2. Create the tables

1. In the project, open **SQL Editor** → **New query**.
2. Paste the whole of `supabase/migrations/0001_init.sql` and run it.
3. Open **Table Editor** and confirm six tables: `courses`, `certificates`,
   `departments`, `employees`, `employee_contacts`, `reminders_sent`.
4. Each one must show **RLS enabled**. If any does not, the migration did not
   finish — run it again and read the error.

The migration gives every table an `owner_id` that defaults to `auth.uid()`
and four policies that compare `owner_id` to the signed-in user. One account
therefore never reads another account's rows, and the client cannot claim a
different owner: it never sends the column at all.

## 3. Copy the keys

1. **Project Settings** → **API**.
2. Copy the **Project URL** and the **anon / public** key.

Only ever copy the anon key into this application. The `service_role` key
bypasses row-level security; it belongs in a server environment variable and
never in anything prefixed `VITE_`, because that ships in the browser bundle.

## 4. Point the application at it

Local development:

```bash
cp .env.supabase.example .env.local
# fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Production (Vercel):

```bash
vercel env add VITE_SUPABASE_URL production
vercel env add VITE_SUPABASE_ANON_KEY production
vercel deploy --prod
```

A variable only reaches the bundle at build time, so a deployment is required
after adding or changing one.

## 5. Set the sign-in rules

**Authentication** → **Providers** → **Email**:

- **Confirm email**: on. An unconfirmed address cannot be the address a
  reminder is sent from.
- **Minimum password length**: 8 or more. The form enforces 8 as well.

**Authentication** → **URL Configuration**:

- **Site URL**: your production URL, e.g.
  `https://hse-training-dashboard.vercel.app`.
- **Redirect URLs**: add `http://localhost:5173` for development.

Without the Site URL the links in a confirmation or reset email point at
`localhost` and fail for a real user.

## 6. Verify

1. Open the application. A sign-in form appears instead of the dashboard.
2. **Create an account**, confirm the address, sign in.
3. The strip at the top names the account.
4. Add a department and a course, then open the app in a different browser
   and sign in with the same account: both are there.
5. Sign up a second account. It must see none of the first account's data.

Step 5 is the test that matters. If a second account sees the first account's
rows, row-level security is not on — stop and fix step 2 before any real data
goes in.

---

## What is not done yet

- **Sending a reminder.** The reminder screen still only previews. Real
  delivery needs a mail provider and domain verification (SPF/DKIM) so the
  message is sent from the account's own address. See `docs/BACKLOG.md`,
  BL-003.
- **Migrating existing local data.** An account starts empty. Data already in
  a browser stays in that browser; export it to CSV and import it after
  signing in.
- **More than one user per company.** `owner_id` is a single user today. A
  shared company workspace needs an organisations table and a membership
  check in the policies.
