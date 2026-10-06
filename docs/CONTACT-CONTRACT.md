# HSE Contact Contract — `HSE-CONTACT-1.0`

**Status:** specification for Phase 2A implementation. Not yet implemented.
**Plan:** `docs/PHASE_2A_PLAN.md` §7. **Training data:** `docs/DATA-CONTRACT.md` (`HSE-DC-1.0`). **Open decisions:** `docs/DECISIONS.md` (P-01 – P-06).

Contact data is personal data. This contract is separate from `HSE-DC-1.0` so that training data can be exchanged without contact details, and so that contact data can follow its own privacy rules.

## 0. Conventions

MUST, SHOULD and MAY have the meaning defined in `docs/DATA-CONTRACT.md` §0. Severities `block`, `warn` and `info` are the same.

## 1. Scope and limits

| Item | Phase 2A |
|---|---|
| Validating a contact file | Yes |
| Computing an eligibility **count** | Yes (§5) |
| Sending email, WhatsApp or any message | **No.** Phase 2A contains no network code for messaging; an automated test asserts that no request is made |
| Cloud storage of contact data | **No.** Out of scope for Phase 2A |
| Keeping contact data after the browser session (local mode) | No *(default, decision P-03)* |
| Storing or moving contact files | Local machine only *(default, decision P-06)* |

The legal basis for communication, consent, retention and allowed channels are decisions of HR / Privacy / Legal / IT (P-01 – P-06). Phase 2A defaults are technical safeguards, not approvals.

## 2. Package

- One `.xlsx` file. It MUST NOT be combined with a `HSE-DC-1.0` package.
- Sheets: `_Contract` and `Contacts`. Other sheets → `SHEET_UNEXPECTED` (`warn`, ignored).
- Header, normalisation and date rules: `docs/DATA-CONTRACT.md` §1.1 and §2.

### 2.1 `_Contract`

| Field | Required | Rule |
|---|---|---|
| `contract_version` | MUST | Literal `HSE-CONTACT-1.0` |
| `organization_code` | MUST | MUST equal the bound organization (`ORG_MISMATCH`); no organization bound → `ORG_NOT_LOADED` |
| `extract_date` | MUST | Date, not after the As Of Date |
| `prepared_by_role` | MUST | Role, not a personal name |

## 3. Sheet `Contacts`

| Field | Required | Rule |
|---|---|---|
| `employee_code` | MUST | Approved employee (`REF_UNKNOWN`); unique in the file (`KEY_DUPLICATE`) |
| `email` | MAY | Lower-cased; basic pattern `local@domain.tld`; otherwise `CONTACT_EMAIL_INVALID` (`block`) |
| `phone_e164` | MAY | `^\+[1-9][0-9]{7,14}$`; otherwise `CONTACT_PHONE_INVALID` (`block`) |
| `preferred_language` | MAY | `ar` / `en` |
| `email_allowed` | MUST | `Yes` / `No` / `Unknown` |
| `whatsapp_allowed` | MUST | `Yes` / `No` / `Unknown` |
| `communication_authorization_basis` | MUST | Code from the list approved under P-01. **Until P-01 is approved the only accepted value is `not_defined`**; any other value → `CONTACT_BASIS_UNKNOWN` (`block`) |
| `authorization_reference` | MUST when the basis is not `not_defined` | Text; missing → `CONTACT_BASIS_EVIDENCE_MISSING` (`block`) |
| `authorization_recorded_at` | MUST when the basis is not `not_defined` | Date, not after `extract_date`; missing → `CONTACT_BASIS_EVIDENCE_MISSING` |
| `contact_status` | MUST | `unverified` / `verified` / `invalid` / `withdrawn` |
| `verified_at` | MAY | Date, not after `extract_date` |

Additional checks:

| Code | Severity | Condition |
|---|---|---|
| `CONTACT_CHANNEL_WITHOUT_VALUE` | warn | `email_allowed = Yes` without `email`, or `whatsapp_allowed = Yes` without `phone_e164` |
| `CONTACT_FOR_INACTIVE` | info | contact of a non-active employee; never eligible |
| `FORBIDDEN_COLUMN` | block | as in `HSE-DC-1.0` §3.10 |

Generic codes (`CONTRACT_VERSION`, `CONTRACT_FIELD`, `SHEET_MISSING`, `COLUMN_MISSING`, `COLUMN_UNKNOWN`, `KEY_MISSING`, `DATE_INVALID`, `DATE_FUTURE`, `REQUIRED_EMPTY`, `VALUE_INVALID`) have the meaning given in `HSE-DC-1.0` §4.

## 4. Privacy rules

- Summary and details views MUST NOT show email addresses, phone numbers or names. The details view MAY show `employee_code`, row number, field name and issue code.
- Contact values MUST NOT be written to console output, logs, error messages, exports or test snapshots.
- Contact data MUST NOT be included in training CSV/PDF exports.
- Test fixtures MUST use reserved values only: emails in the `example.invalid` domain, phones `+999…` (country code 999 is not assigned).
- Approval of a contact batch follows `HSE-DC-1.0` §7 (stage, preview, approve or cancel); absence of an employee from the file MUST NOT remove that employee's existing contact data.

## 5. Eligibility (calculation only)

An employee is counted as **eligible for a channel** only if all conditions hold:

1. The employee is approved and `employment_status = Active`.
2. The channel flag (`email_allowed` / `whatsapp_allowed`) is `Yes` and the matching value (`email` / `phone_e164`) is present and valid.
3. `communication_authorization_basis` is in the list approved under P-01, with its evidence fields present.
4. `contact_status` is allowed by P-05 *(default: `verified` only)*.
5. The employee has at least one **counted** mandatory compliance item (engine status `EXPIRING_30`, from the preparation layer of `HSE-DC-1.0` §8) whose expiry is 0–15 days after the As Of Date, both bounds inclusive.

Output: counts per channel ("N employees would be eligible for an email alert today"). No list of recipients is produced in the summary; nothing is sent.

**While P-01 is not approved, condition 3 cannot be met, so every eligibility count MUST be 0.** An implementation that shows a non-zero count before P-01 is approved is defective.

## 6. Example (fictional)

```csv
employee_code,email,phone_e164,preferred_language,email_allowed,whatsapp_allowed,communication_authorization_basis,authorization_reference,authorization_recorded_at,contact_status,verified_at
TST-0001,test.employee001@example.invalid,+999000000001,ar,Yes,Unknown,not_defined,,,unverified,
TST-0002,,+999000000002,en,No,Yes,not_defined,,,verified,2027-01-04
```

With these rows the eligibility counts are 0 (basis `not_defined`).
