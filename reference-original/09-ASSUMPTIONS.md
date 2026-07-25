# HSE Training Dashboard - Assumptions & Limitations

**Critical**: Read this BEFORE presenting to management.

This document lists:
1. What we assume about your data
2. What the dashboard CAN do
3. What the dashboard CANNOT do
4. What's planned for Phase 2

---

## Section A: Data Assumptions

### Assumption 1.1: Data is in CSV or XLSX Format
- **Assumption**: You can export training data as CSV or XLSX
- **Reality Check**: If you only have email or paper records, data entry is required first
- **Mitigation**: We provide templates and sample format

### Assumption 1.2: Employee Records Have Unique IDs
- **Assumption**: Each employee has one unique Employee_ID
- **Reality Check**: If one person appears as "Ahmed", "Ahmed Al-Mansouri", "AHM001", that's 3 different people to the system
- **Mitigation**: Standardize employee IDs before import. Use 1 format only (e.g., "EMP0001")

### Assumption 1.3: Dates Are in YYYY-MM-DD Format
- **Assumption**: All dates must be "2024-01-15" not "01/15/2024" or "15-Jan-2024"
- **Reality Check**: If dates are in different formats, import will fail
- **Mitigation**: Convert dates in Excel before export: use Format > Cells > Date, choose YYYY-MM-DD

### Assumption 1.4: Course Codes Are Consistent
- **Assumption**: If a course is called "H2S001", it's ALWAYS "H2S001", never "H2S-001" or "hso001"
- **Reality Check**: Case sensitivity matters. "H2S001" ≠ "h2s001"
- **Mitigation**: Use a master list of course codes. Spell check before import.

### Assumption 1.5: Employment Status Is Standardized
- **Assumption**: Values are exactly "Active", "Inactive", or "Left" (capitalized)
- **Reality Check**: "active", "ACTIVE", "Current" will fail validation
- **Mitigation**: Excel Find & Replace to standardize before import

### Assumption 1.6: Training Status Is Either Completed, In Progress, or Not Started
- **Assumption**: No custom status values
- **Reality Check**: "Pending", "Pending Review", "Suspended" are not recognized
- **Mitigation**: Map custom statuses to the 3 allowed values before import

### Assumption 1.7: Expiry Dates Are in the Future (or Missing)
- **Assumption**: If a course expires, Expiry_Date is set. If not, field is blank.
- **Reality Check**: If Expiry_Date is "9999-12-31" or some placeholder, calculations break
- **Mitigation**: Use NULL or blank cells for courses with no expiry

### Assumption 1.8: No Massive Data Duplication
- **Assumption**: Employee X doesn't appear 100 times for the same course
- **Reality Check**: System flags duplicates but doesn't automatically merge
- **Mitigation**: Review for duplicate rows before import. System will warn you.

---

## Section B: What This Dashboard DOES

### ✅ Feature 1: Imports CSV and XLSX Files
- Reads Excel and CSV files from your computer
- Validates all data before import
- Reports which rows have errors
- Loads valid rows immediately

### ✅ Feature 2: Calculates Correct KPIs
Based on real data you import:
- Training Record Compliance (%)
- Fully Compliant Employees (%)
- Department Compliance (%)
- Course Compliance (%)
- Breakdown by expiry status

### ✅ Feature 3: Filters and Searches
- Filter by Department, Job Title, Course, Status
- Search by Employee ID or Name (partial match)
- Combine multiple filters
- Clear all filters at once

### ✅ Feature 4: Displays Data in Tables
- Shows filtered records
- 50 records per page (in MVP)
- Pagination comes in Phase 2
- Shows which columns match your filter

### ✅ Feature 5: Visualizes Data in Charts
- Department compliance as bar chart
- Training status breakdown as pie chart
- Charts update when you filter
- Colors match HSE standards

### ✅ Feature 6: Exports to PDF (Coming Soon)
- Generates a professional PDF report
- Includes KPIs, charts, department breakdown
- Ready for management presentation
- Printable on A4 paper

### ✅ Feature 7: Validates Data Quality
- Checks for missing required fields
- Detects invalid date formats
- Flags duplicate employee-course pairs
- Rejects records with errors

### ✅ Feature 8: Runs Offline
- No internet required
- No data uploaded to cloud
- Works on your computer only
- All data stays private

---

## Section C: What This Dashboard DOES NOT DO

### ❌ NOT Feature 1: AI Analysis
- **Claim**: "AI-powered analytics"
- **Reality**: No AI models connected. Calculations are basic math.
- **Phase 2**: We can add Claude API for risk assessment

### ❌ NOT Feature 2: Predictive Analytics
- **Claim**: "Predict who will fail training"
- **Reality**: We show current status only, not predictions
- **Phase 2**: ML models could predict renewal dates

### ❌ NOT Feature 3: Real-Time Sync
- **Claim**: "Live updates from your training system"
- **Reality**: Manual import only. No automatic sync.
- **Phase 2**: Google Sheets or database sync

### ❌ NOT Feature 4: Automated Email Alerts
- **Claim**: "Automatically email employees about expiring training"
- **Reality**: No email integration in MVP
- **Phase 2**: SendGrid integration for alerts

### ❌ NOT Feature 5: Multi-User Collaboration
- **Claim**: "Real-time teamwork"
- **Reality**: Single-user browser app. No sharing.
- **Phase 2**: Cloud database for team access

### ❌ NOT Feature 6: Mobile App
- **Claim**: "Works on phones"
- **Reality**: Responsive design but not optimized for mobile
- **Phase 2**: Native mobile app

### ❌ NOT Feature 7: Historical Tracking
- **Claim**: "See trends over time"
- **Reality**: Snapshot only. No historical data kept.
- **Phase 2**: Database to store snapshots over time

### ❌ NOT Feature 8: Automatic Renewals
- **Claim**: "Auto-renew training"
- **Reality**: Dashboard shows what needs renewal, you schedule manually
- **Phase 2**: Integration with training providers

### ❌ NOT Feature 9: Audit Trail
- **Claim**: "Track who changed what"
- **Reality**: No change logging
- **Phase 2**: Audit trail with timestamps and user info

### ❌ NOT Feature 10: Advanced Reporting
- **Claim**: "Custom reports on demand"
- **Reality**: Fixed PDF template only
- **Phase 2**: Customizable report builder

---

## Section D: Performance Limitations

### Limitation 1: Data Size

| Records | Time | Status |
|---------|------|--------|
| < 1,000 | Instant | ✅ Smooth |
| 1,000 - 5,000 | < 1 sec | ✅ Acceptable |
| 5,000 - 10,000 | 1-2 sec | ⚠️ Noticeable |
| > 10,000 | 2-5 sec | ⚠️ Slow |

**Recommendation**: For >5,000 records, consider server-side processing (Phase 2)

### Limitation 2: Browser Memory
- Large datasets may slow browser
- Refreshing the page clears data (must re-import)
- Exporting very large reports may take time

**Mitigation**: Limit imports to 5,000 records at a time, or filter before analysis

### Limitation 3: Chart Complexity
- Too many departments/courses makes charts unreadable
- System works but visuals become crowded
- Use filters to focus on specific departments

### Limitation 4: Filter Performance
- Filtering is instant up to ~10,000 records
- Beyond that, slight delay (< 1 second)

---

## Section E: Data Quality Issues We Cannot Handle

### Issue 1: Mismatched Employee IDs
**Problem**: Same employee recorded as "EMP0001", "1", "Ahmed-123"

**What We Do**: Treat as 3 different people

**What You Must Do**: Standardize IDs before import

---

### Issue 2: Inconsistent Department Names
**Problem**: "Operations", "OPERATIONS", "Ops" are all different

**What We Do**: Create separate department in charts

**What You Must Do**: Use exact, consistent department names

---

### Issue 3: Missing Expiry Dates
**Problem**: Some courses have expiry dates, others don't

**What We Do**: Treat missing dates as "no expiry" (valid forever)

**What You Must Do**: Clarify which courses have expiry requirements

---

### Issue 4: Future Dates
**Problem**: Expiry date is "2099-12-31" (placeholder)

**What We Do**: Treat as valid until year 2099

**What You Must Do**: Use actual expiry dates or leave blank

---

### Issue 5: Inactive Employees with Expired Training
**Problem**: "Ali Al-Harbi" is marked Inactive but has expired training

**What We Do**: Exclude from compliance calculations (correct)

**What You Must Do**: Decide: should inactive employees be in the dashboard at all?

---

## Section F: What "Compliant" Means

### Our Definition

An employee is **compliant** if:
1. Their Employment_Status = "Active"
2. ALL required courses for their role are:
   - Marked as Training_Required = true
   - Completion_Status = "Completed"
   - Expiry_Date is either blank OR in the future (not expired)

### What We're NOT Calculating

- ❌ Quality of training (did they actually learn?)
- ❌ Passing test scores
- ❌ Hands-on competency
- ❌ Manager sign-off
- ❌ Recent training (e.g., refresher within last 6 months)

### Example

Employee "Ahmed" has:
- H2S Safety: Valid (expires 2025)
- PTW: Expired (expired 2024)

**Result**: NOT compliant (one course is expired)

---

## Section G: Known Bugs & Workarounds

### Bug 1: Cannot Sort Table by Clicking Headers
**Status**: Known  
**Impact**: Minor  
**Workaround**: Use filters to narrow data, or export to Excel and sort there  
**Fix**: Phase 2

---

### Bug 2: Pagination Limited to 50 Records
**Status**: Known  
**Impact**: Minor  
**Workaround**: Export to CSV/Excel for full list  
**Fix**: Phase 2 - implement server pagination

---

### Bug 3: PDF Export Not Yet Implemented
**Status**: Known  
**Impact**: Moderate  
**Workaround**: Use browser "Save as PDF" feature  
**Fix**: This sprint - real PDF generation

---

### Bug 4: No Search History
**Status**: Known  
**Impact**: Minor  
**Workaround**: Filters reset on page refresh  
**Fix**: Phase 2 - URL parameters to save filters

---

## Section H: What Success Looks Like

### For the Dashboard to Be "Working"

- ✅ Imports your CSV/XLSX without errors
- ✅ Shows correct record counts
- ✅ KPI percentages match manual calculation
- ✅ Filters work as expected
- ✅ Charts display clearly
- ✅ No console errors
- ✅ Loads in < 2 seconds

### For the Dashboard to Be "Ready for Production"

- ✅ Pass all tests in 08-TESTING-CHECKLIST.md
- ✅ Management approves KPI definitions
- ✅ Real company data imports successfully
- ✅ No data quality issues found
- ✅ Team understands limitations
- ✅ Documentation is complete

---

## Section I: What to Tell Management

### Recommended Opening

*"This is a data-driven training compliance dashboard that consolidates all your training records in one place. It's designed to reduce manual spreadsheet work and give you clear visibility into who has current, expiring, and missing training. It's not AI-powered or predictive—it's a solid data management tool that works with whatever training data you have today."*

### What to Emphasize

✅ Real, validated data  
✅ Clear, honest KPIs  
✅ Simple to use (just import CSV)  
✅ Offline and private  
✅ Professional reporting  

### What NOT to Claim

❌ "Saves 10 hours a week" (Unproven)  
❌ "AI-powered analytics" (Not true)  
❌ "Automatically prevents incidents" (Not true)  
❌ "Predictive risk assessment" (Not built)  
❌ "Replaces your training system" (It's a dashboard)  

### What to Say About Limitations

*"This MVP focuses on getting you accurate visibility. We're not doing Google Sheets sync, email automation, or predictive analytics yet. Those are Phase 2 features we can build once you confirm this solves the basic problem."*

---

## Section J: Questions to Ask Users

Before presenting, confirm:

1. **"Is your training data in Excel or another system?"**
   - If email/paper → Must do data entry first
   - If database → Must export as CSV first

2. **"How many employees do you need to track?"**
   - < 1,000 → Dashboard works perfect
   - 1,000-10,000 → Dashboard works, but Phase 2 optimization recommended
   - > 10,000 → Need database backend (Phase 2)

3. **"How often do you need to update?"**
   - Monthly → Manual import is fine
   - Weekly → May want Phase 2 auto-sync
   - Daily → Definitely needs Phase 2

4. **"What's your #1 pain point right now?"**
   - Help prioritize Phase 2 features

5. **"What would success look like?"**
   - Use their answer to shape roadmap

---

## Section K: Phase 2 Planned Features

See 10-PHASE-2-ROADMAP.md for details, but planned:

- [ ] Google Sheets or database sync
- [ ] Email alerts for expiring training
- [ ] Multi-user with login
- [ ] Historical tracking and trends
- [ ] Customizable reports
- [ ] API for third-party systems
- [ ] AI-assisted risk scoring (optional)
- [ ] Mobile app

---

## Final Checklist Before Presenting

- [ ] Read this entire document
- [ ] Understand what we CAN do
- [ ] Understand what we CANNOT do
- [ ] Know the 5 key assumptions about data
- [ ] Know what to tell management and what NOT to claim
- [ ] Have sample data ready to demo
- [ ] Have testing checklist results
- [ ] Have this document open during Q&A

---

**Created**: July 2026  
**Last Updated**: Today  
**Next Review**: After first customer uses dashboard  

**If you have questions, refer back to this document first.**
