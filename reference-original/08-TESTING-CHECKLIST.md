# HSE Training Dashboard - Testing Checklist

**Purpose**: Verify the dashboard works correctly before management presentation

**Time Required**: ~30 minutes

**Prerequisites**: 
- Node.js installed
- React app running
- Sample data files available

---

## Phase 1: Setup & Import (10 minutes)

### Test 1.1: Application Loads
- [ ] Dashboard opens without errors
- [ ] Dark theme displays correctly
- [ ] All UI elements visible
- [ ] No console errors (F12 → Console)

**Expected Result**: Clean page with "Import Training Data to Begin" message

---

### Test 1.2: Sample Data Import
- [ ] Click "Import Training Data (CSV)"
- [ ] Select `03-SAMPLE-TRAINING-DATA.csv`
- [ ] Verify 21 records import successfully
- [ ] No error messages appear
- [ ] KPI cards populate with numbers

**Expected Result**: 
```
Training Record Compliance: [some %]
Active Employees: 10
Expiring <30: [number]
Expired: [number]
```

### Test 1.3: Requirements Data Import
- [ ] Click "Import Requirements (CSV)"
- [ ] Select `04-SAMPLE-REQUIREMENTS.csv`
- [ ] Verify 25 records import
- [ ] No error messages

**Expected Result**: No visible change (used internally for future calculations)

---

## Phase 2: KPI Validation (5 minutes)

Using sample data, verify KPI calculations are CORRECT (not random):

### Test 2.1: Training Record Compliance

**Manual Calculation**:
1. Count records where Training_Required=Yes AND Completion_Status=Completed
   - Expected: 19 records
2. Count those where Expiry_Date > TODAY (Valid)
   - Expected: ~14-15 records (depends on today's date)
3. Percentage = (Valid / Total) × 100

**Dashboard Shows**: [number]%

- [ ] Dashboard percentage matches manual calculation
- [ ] Not a random number
- [ ] Same value on reload

**Expected**: Should be 70-80% depending on current date

---

### Test 2.2: Active Employees Count

**Manual Count**: 
- Filter where Employment_Status = "Active"
- Count unique Employee_ID

**Expected in Sample Data**: 10 employees

- [ ] Dashboard shows exactly 10
- [ ] Same on reload
- [ ] Not a random number

---

### Test 2.3: Expired Records

**Manual Count**:
- Find records where Expiry_Date < TODAY

**Dashboard Shows**: [number]

- [ ] Count matches manual count
- [ ] Employee list visible somewhere
- [ ] Consistent across reloads

---

### Test 2.4: Status Breakdown

Pie chart shows:
- [ ] Valid certificates
- [ ] Expiring <30
- [ ] Expiring <60
- [ ] Expiring <90
- [ ] Expired

**Verify**: Chart totals = Total records

---

## Phase 3: Filters & Table (8 minutes)

### Test 3.1: Department Filter

- [ ] Click Department dropdown
- [ ] See: Operations, Maintenance, Logistics, Admin, Planning
- [ ] Select "Operations"
- [ ] Table shows only Operations records (should be ~10)
- [ ] KPIs update to show only Operations data
- [ ] Clear filters → All data returns

**Expected**: Filtering works correctly

---

### Test 3.2: Job Title Filter

- [ ] Select Department: "Operations"
- [ ] Select Job Title: "Field Supervisor"
- [ ] Table shows 1 record (Ahmed Al-Mansouri)
- [ ] All columns visible and correct
- [ ] Status column shows appropriate badge (color)

**Expected**: Single record matches filter

---

### Test 3.3: Course Filter

- [ ] Clear filters
- [ ] Select Course: "H2S001"
- [ ] Count visible records (should be multiple)
- [ ] All show Course_Code = "H2S001"

**Expected**: Correctly filters by course

---

### Test 3.4: Status Filter

- [ ] Select Status: "Expired"
- [ ] Table shows only expired certificates
- [ ] Manual check: Expiry_Date < TODAY for all
- [ ] Expected: EMP0003, EMP0008 (Mohammed Hassan, Layla Al-Jaber)

**Expected**: Status filtering works

---

### Test 3.5: Employee ID/Name Search

- [ ] Clear filters
- [ ] Type "EMP0001" in Employee ID field
- [ ] See only Ahmed Al-Mansouri's records (3 courses)
- [ ] Clear and type "fatima" (case-insensitive)
- [ ] See Fatima Al-Dosari's records

**Expected**: Case-insensitive partial matching

---

### Test 3.6: Combined Filters

- [ ] Set: Department=Operations, Status=Expired
- [ ] Verify only expired Operations records show
- [ ] Add: Employee ID = EMP0003
- [ ] See exactly Mohammed Hassan's expired records
- [ ] Click "Clear Filters" → All data returns

**Expected**: All filters work together

---

## Phase 4: Data Validation (5 minutes)

### Test 4.1: Invalid Date Detection

**Create test file** with one bad row:

```csv
Employee_ID,Employee_Name,Department,Job_Title,Employment_Status,Course_Name,Course_Code,Training_Required,Completion_Status,Issue_Date,Expiry_Date
EMP9999,Test Employee,Operations,Test,Active,Test Course,TST001,Yes,Completed,2024-13-45,2024-01-01
```

- [ ] Click Import
- [ ] Error appears: "Invalid Expiry_Date format"
- [ ] Row is skipped
- [ ] No data is corrupted

**Expected**: Graceful error handling

---

### Test 4.2: Missing Required Column

**Create test file** missing "Employee_Name":

```csv
Employee_ID,Department,Job_Title,...
EMP0001,Operations,Supervisor,...
```

- [ ] Click Import
- [ ] Error: "Missing required columns: Employee_Name"
- [ ] No data imported
- [ ] Clear error message

**Expected**: User knows exactly what's wrong

---

### Test 4.3: Duplicate Detection

**Create test file** with duplicate:

```csv
Employee_ID,Employee_Name,...,Course_Code,...
EMP0001,Ahmed Al-Mansouri,...,H2S001,...
EMP0001,Ahmed Al-Mansouri,...,H2S001,...
```

- [ ] Import succeeds but shows warning
- [ ] Warning lists duplicate
- [ ] One record is kept, one is flagged

**Expected**: User aware of duplicates

---

## Phase 5: Charts & Visualization (3 minutes)

### Test 5.1: Department Compliance Chart

- [ ] Clear all filters
- [ ] See bar chart showing each department
- [ ] Y-axis: 0-100%
- [ ] Each department has a bar
- [ ] Values look reasonable (not 0% or 100%)

**Expected**: Proper chart rendering

---

### Test 5.2: Status Breakdown Pie Chart

- [ ] See pie chart with colored segments
- [ ] Colors: Green (Valid), Red (<30), Orange (<60), Yellow (<90), Dark (<Expired)
- [ ] Segments have labels and percentages
- [ ] Hover shows details

**Expected**: Clear, readable visualization

---

## Phase 6: Edge Cases (3 minutes)

### Test 6.1: No Expiry Date

- [ ] Look for "Sara Al-Khalifa" with Working at Height course (In Progress)
- [ ] Status shows "In Progress" (not blank)
- [ ] No errors in console

**Expected**: Handles missing dates gracefully

---

### Test 6.2: Inactive Employees

- [ ] Look for "Ali Al-Harbi" (Employment_Status = Inactive)
- [ ] May or may not appear in table depending on filter
- [ ] KPI counts should NOT include inactive

**Expected**: Inactive employees excluded from calculations

---

### Test 6.3: Empty Filter Results

- [ ] Select Course: "PTW001"
- [ ] Set Status: "Expired"
- [ ] May result in 0 records
- [ ] Message shows "No records match your filters"
- [ ] No errors, no broken UI

**Expected**: Graceful empty state

---

## Phase 7: Real Data Test (5 minutes - Optional)

When you have your actual company data:

### Test 7.1: Import Real Data

- [ ] Prepare real CSV with correct columns
- [ ] Import file
- [ ] Verify record count
- [ ] Check KPI values make sense
- [ ] Filter by department → Results match expectation

**Expected**: Works with real data same as sample

---

## Phase 8: Management Presentation Prep

### Test 8.1: Professional Appearance

- [ ] Dashboard looks professional
- [ ] Colors consistent (Orange #FF8C00, Green #00E676)
- [ ] Text readable
- [ ] Charts clear
- [ ] No broken layouts

**Expected**: Ready for management demo

---

### Test 8.2: Performance

- [ ] Import 21 records: < 1 second
- [ ] Filter changes: Instant
- [ ] Click through filters: Smooth
- [ ] No lag or slow response

**Expected**: Responsive, fast

---

### Test 8.3: No Fake Claims

- [ ] No "AI-powered" labels
- [ ] No "predictive" claims
- [ ] Numbers are real, not random
- [ ] All claims are honest and testable

**Expected**: Audit-ready presentation

---

## Final Sign-Off

### Checklist Complete?

- [ ] All Phase 1 tests pass
- [ ] All Phase 2 tests pass
- [ ] All Phase 3 tests pass
- [ ] All Phase 4 tests pass
- [ ] All Phase 5 tests pass
- [ ] All Phase 6 tests pass
- [ ] Phase 7 passes (if using real data)
- [ ] Phase 8 passes

### Known Issues (Document Here)

```
[If any issues found, list them:]

Issue 1: [Description]
- Severity: [High/Medium/Low]
- Workaround: [How to work around it]
- Status: [Fixed/Known/Won't Fix]
```

**[None found]** ← Should be this if testing passes completely

---

## Ready for Management?

**YES** ✅ - All tests pass, no critical issues, presentation ready

**NO** ❌ - List issues that must be fixed before presenting

---

**Tested By**: ___________________  
**Date**: ___________________  
**Signed Off**: ___________________  

---

## Quick Troubleshooting During Demo

| Issue | Quick Fix |
|-------|-----------|
| "Import failed" | Check file is .csv or .xlsx |
| KPIs show 0 | Verify Employment_Status = "Active" |
| Table empty | Check filters aren't too restrictive |
| Chart not showing | Ensure data imported successfully |
| Slow performance | Reduce records imported or reload page |

---

**End of Checklist**

✅ **Complete this before management presentation**  
⏱️ **Time: ~30 minutes**  
📊 **Confidence: High**
