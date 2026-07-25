// Deterministic test fixtures — all dates relative to AS_OF = 2026-07-26

export const AS_OF = '2026-07-26';

// Normalised training records matching sample-training-data.csv
export const TRAINING_RECORDS = [
  { Employee_ID: 'EMP0001', Employee_Name: 'Ahmed Al-Mansouri', Department: 'Operations', Job_Title: 'Field Supervisor', Employment_Status: 'Active', Course_Name: 'H2S Safety', Course_Code: 'H2S001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-10-25', Expiry_Date: '2026-10-25', Certificate_Number: 'CERT001-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0001', Employee_Name: 'Ahmed Al-Mansouri', Department: 'Operations', Job_Title: 'Field Supervisor', Employment_Status: 'Active', Course_Name: 'PTW', Course_Code: 'PTW001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-10-20', Expiry_Date: '2026-10-20', Certificate_Number: 'CERT002-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0001', Employee_Name: 'Ahmed Al-Mansouri', Department: 'Operations', Job_Title: 'Field Supervisor', Employment_Status: 'Active', Course_Name: 'Working at Height', Course_Code: 'WAH001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-09-15', Expiry_Date: '2026-09-15', Certificate_Number: 'CERT003-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0002', Employee_Name: 'Fatima Al-Dosari', Department: 'Operations', Job_Title: 'Equipment Operator', Employment_Status: 'Active', Course_Name: 'H2S Safety', Course_Code: 'H2S001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-07-20', Expiry_Date: '2026-08-20', Certificate_Number: 'CERT004-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0002', Employee_Name: 'Fatima Al-Dosari', Department: 'Operations', Job_Title: 'Equipment Operator', Employment_Status: 'Active', Course_Name: 'PTW', Course_Code: 'PTW001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-04-30', Expiry_Date: '2026-04-30', Certificate_Number: 'CERT005-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0002', Employee_Name: 'Fatima Al-Dosari', Department: 'Operations', Job_Title: 'Equipment Operator', Employment_Status: 'Active', Course_Name: 'Confined Space', Course_Code: 'CS001', Training_Required: true, Completion_Status: 'Not Started', Issue_Date: '', Expiry_Date: '', Certificate_Number: '', Training_Provider: '', Remarks: '' },
  { Employee_ID: 'EMP0003', Employee_Name: 'Mohammed Hassan', Department: 'Operations', Job_Title: 'Site Coordinator', Employment_Status: 'Active', Course_Name: 'H2S Safety', Course_Code: 'H2S001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2024-08-20', Expiry_Date: '2025-08-20', Certificate_Number: 'CERT006-2025', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0003', Employee_Name: 'Mohammed Hassan', Department: 'Operations', Job_Title: 'Site Coordinator', Employment_Status: 'Active', Course_Name: 'PTW', Course_Code: 'PTW001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-07-26', Expiry_Date: '2026-07-26', Certificate_Number: 'CERT007-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0004', Employee_Name: 'Sara Al-Khalifa', Department: 'Maintenance', Job_Title: 'Technician', Employment_Status: 'Active', Course_Name: 'H2S Safety', Course_Code: 'H2S001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2026-01-10', Expiry_Date: '2027-01-10', Certificate_Number: 'CERT008-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0004', Employee_Name: 'Sara Al-Khalifa', Department: 'Maintenance', Job_Title: 'Technician', Employment_Status: 'Active', Course_Name: 'PTW', Course_Code: 'PTW001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2026-02-08', Expiry_Date: '2027-02-08', Certificate_Number: 'CERT009-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0004', Employee_Name: 'Sara Al-Khalifa', Department: 'Maintenance', Job_Title: 'Technician', Employment_Status: 'Active', Course_Name: 'Working at Height', Course_Code: 'WAH001', Training_Required: true, Completion_Status: 'In Progress', Issue_Date: '', Expiry_Date: '', Certificate_Number: '', Training_Provider: '', Remarks: '' },
  { Employee_ID: 'EMP0005', Employee_Name: 'Omar Al-Shehri', Department: 'Maintenance', Job_Title: 'Maintenance Lead', Employment_Status: 'Active', Course_Name: 'H2S Safety', Course_Code: 'H2S001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-08-10', Expiry_Date: '2026-08-10', Certificate_Number: 'CERT010-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0005', Employee_Name: 'Omar Al-Shehri', Department: 'Maintenance', Job_Title: 'Maintenance Lead', Employment_Status: 'Active', Course_Name: 'Confined Space', Course_Code: 'CS001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2026-01-20', Expiry_Date: '2027-01-20', Certificate_Number: 'CERT011-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0005', Employee_Name: 'Omar Al-Shehri', Department: 'Maintenance', Job_Title: 'Maintenance Lead', Employment_Status: 'Active', Course_Name: 'Confined Space', Course_Code: 'CS001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-01-15', Expiry_Date: '2026-01-15', Certificate_Number: 'CERT011-OLD-2025', Training_Provider: 'SafetyPlus Training', Remarks: 'Historical duplicate' },
  { Employee_ID: 'EMP0006', Employee_Name: 'Amira Al-Otaibi', Department: 'Logistics', Job_Title: 'Warehouse Manager', Employment_Status: 'Active', Course_Name: 'H2S Safety', Course_Code: 'H2S001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2026-01-05', Expiry_Date: '2027-01-05', Certificate_Number: 'CERT012-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0006', Employee_Name: 'Amira Al-Otaibi', Department: 'Logistics', Job_Title: 'Warehouse Manager', Employment_Status: 'Active', Course_Name: 'Fire Fighting', Course_Code: 'FF001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-09-01', Expiry_Date: '2026-09-01', Certificate_Number: 'CERT013-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0006', Employee_Name: 'Amira Al-Otaibi', Department: 'Logistics', Job_Title: 'Warehouse Manager', Employment_Status: 'Active', Course_Name: 'PTW', Course_Code: 'PTW001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-05-30', Expiry_Date: '2026-05-30', Certificate_Number: 'CERT014-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0007', Employee_Name: 'Hassan Al-Nasser', Department: 'Logistics', Job_Title: 'Driver', Employment_Status: 'Active', Course_Name: 'H2S Safety', Course_Code: 'H2S001', Training_Required: false, Completion_Status: 'Completed', Issue_Date: '2026-01-01', Expiry_Date: '2027-01-01', Certificate_Number: 'CERT015-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0007', Employee_Name: 'Hassan Al-Nasser', Department: 'Logistics', Job_Title: 'Driver', Employment_Status: 'Active', Course_Name: 'PTW', Course_Code: 'PTW001', Training_Required: false, Completion_Status: 'Not Started', Issue_Date: '', Expiry_Date: '', Certificate_Number: '', Training_Provider: '', Remarks: '' },
  { Employee_ID: 'EMP0008', Employee_Name: 'Layla Al-Jaber', Department: 'Admin', Job_Title: 'Safety Officer', Employment_Status: 'Active', Course_Name: 'H2S Safety', Course_Code: 'H2S001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2024-06-10', Expiry_Date: '2025-06-10', Certificate_Number: 'CERT016-2025', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0008', Employee_Name: 'Layla Al-Jaber', Department: 'Admin', Job_Title: 'Safety Officer', Employment_Status: 'Active', Course_Name: 'Fire Fighting', Course_Code: 'FF001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2026-01-30', Expiry_Date: '2027-01-30', Certificate_Number: 'CERT017-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0008', Employee_Name: 'Layla Al-Jaber', Department: 'Admin', Job_Title: 'Safety Officer', Employment_Status: 'Active', Course_Name: 'PTW', Course_Code: 'PTW001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2026-03-01', Expiry_Date: '2027-03-01', Certificate_Number: 'CERT018-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0009', Employee_Name: 'Khalid Al-Malik', Department: 'Admin', Job_Title: 'Manager', Employment_Status: 'Active', Course_Name: 'H2S Safety', Course_Code: 'H2S001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-10-01', Expiry_Date: '2026-10-01', Certificate_Number: 'CERT019-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0010', Employee_Name: 'Zainab Al-Rashid', Department: 'Planning', Job_Title: 'Safety Consultant', Employment_Status: 'Active', Course_Name: 'H2S Safety', Course_Code: 'H2S001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2026-02-01', Expiry_Date: '2027-02-01', Certificate_Number: 'CERT020-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0010', Employee_Name: 'Zainab Al-Rashid', Department: 'Planning', Job_Title: 'Safety Consultant', Employment_Status: 'Active', Course_Name: 'PTW', Course_Code: 'PTW001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2026-03-01', Expiry_Date: '2027-03-01', Certificate_Number: 'CERT021-2026', Training_Provider: 'SafetyPlus Training', Remarks: '' },
  { Employee_ID: 'EMP0011', Employee_Name: 'Ali Al-Harbi', Department: 'Operations', Job_Title: 'Field Supervisor', Employment_Status: 'Inactive', Course_Name: 'H2S Safety', Course_Code: 'H2S001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2025-10-10', Expiry_Date: '2026-10-10', Certificate_Number: 'CERT022-2026', Training_Provider: 'SafetyPlus Training', Remarks: 'Inactive' },
  { Employee_ID: 'EMP0012', Employee_Name: 'Nora Al-Ghamdi', Department: 'Human Resources', Job_Title: 'HR Officer', Employment_Status: 'Active', Course_Name: 'Basic Safety Awareness', Course_Code: 'BSA001', Training_Required: true, Completion_Status: 'Completed', Issue_Date: '2026-01-15', Expiry_Date: '2027-01-15', Certificate_Number: 'CERT023-2026', Training_Provider: 'SafetyPlus Training', Remarks: 'No requirements configured' },
];

export const REQUIREMENTS = [
  { Department: 'Operations', Job_Title: 'Field Supervisor',    Course_Code: 'H2S001', Course_Name: 'H2S Safety',        Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Operations', Job_Title: 'Field Supervisor',    Course_Code: 'PTW001', Course_Name: 'PTW',               Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Operations', Job_Title: 'Field Supervisor',    Course_Code: 'WAH001', Course_Name: 'Working at Height', Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Operations', Job_Title: 'Equipment Operator',  Course_Code: 'H2S001', Course_Name: 'H2S Safety',        Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Operations', Job_Title: 'Equipment Operator',  Course_Code: 'PTW001', Course_Name: 'PTW',               Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Operations', Job_Title: 'Equipment Operator',  Course_Code: 'CS001',  Course_Name: 'Confined Space',    Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Operations', Job_Title: 'Site Coordinator',    Course_Code: 'H2S001', Course_Name: 'H2S Safety',        Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Operations', Job_Title: 'Site Coordinator',    Course_Code: 'PTW001', Course_Name: 'PTW',               Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Maintenance', Job_Title: 'Technician',         Course_Code: 'H2S001', Course_Name: 'H2S Safety',        Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Maintenance', Job_Title: 'Technician',         Course_Code: 'PTW001', Course_Name: 'PTW',               Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Maintenance', Job_Title: 'Technician',         Course_Code: 'WAH001', Course_Name: 'Working at Height', Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Maintenance', Job_Title: 'Maintenance Lead',   Course_Code: 'H2S001', Course_Name: 'H2S Safety',        Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Maintenance', Job_Title: 'Maintenance Lead',   Course_Code: 'CS001',  Course_Name: 'Confined Space',    Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Maintenance', Job_Title: 'Maintenance Lead',   Course_Code: 'WAH001', Course_Name: 'Working at Height', Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Logistics',   Job_Title: 'Warehouse Manager',  Course_Code: 'H2S001', Course_Name: 'H2S Safety',        Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Logistics',   Job_Title: 'Warehouse Manager',  Course_Code: 'FF001',  Course_Name: 'Fire Fighting',     Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Logistics',   Job_Title: 'Warehouse Manager',  Course_Code: 'PTW001', Course_Name: 'PTW',               Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Logistics',   Job_Title: 'Driver',             Course_Code: 'H2S001', Course_Name: 'H2S Safety',        Mandatory: false, Validity_Months: 0,  Description: '' },
  { Department: 'Logistics',   Job_Title: 'Driver',             Course_Code: 'PTW001', Course_Name: 'PTW',               Mandatory: false, Validity_Months: 0,  Description: '' },
  { Department: 'Admin',       Job_Title: 'Safety Officer',     Course_Code: 'H2S001', Course_Name: 'H2S Safety',        Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Admin',       Job_Title: 'Safety Officer',     Course_Code: 'FF001',  Course_Name: 'Fire Fighting',     Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Admin',       Job_Title: 'Safety Officer',     Course_Code: 'PTW001', Course_Name: 'PTW',               Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Admin',       Job_Title: 'Manager',            Course_Code: 'H2S001', Course_Name: 'H2S Safety',        Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Planning',    Job_Title: 'Safety Consultant',  Course_Code: 'H2S001', Course_Name: 'H2S Safety',        Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Planning',    Job_Title: 'Safety Consultant',  Course_Code: 'PTW001', Course_Name: 'PTW',               Mandatory: true,  Validity_Months: 12, Description: '' },
  { Department: 'Planning',    Job_Title: 'Safety Consultant',  Course_Code: 'CS001',  Course_Name: 'Confined Space',    Mandatory: true,  Validity_Months: 12, Description: '' },
];

// Expected results as of 2026-07-26 (see docs/EXPECTED-RESULTS.md for derivation)
export const EXPECTED = {
  totalActiveEmployees: 11,       // EMP0001–EMP0010 + EMP0012
  inactiveEmployees: 1,           // EMP0011
  employeesWithMandatoryReqs: 9,  // excludes EMP0007 (no mandatory) and EMP0012 (not configured)
  employeesNoMandatoryReqs: 1,    // EMP0007 (Driver — all non-mandatory)
  employeesNotConfigured: 1,      // EMP0012 (HR Officer — no rows in matrix)
  totalMandatoryReqs: 24,
  compliantReqs: 16,
  requirementCompliance: 66.7,    // 16/24 = 66.666...% → 66.7%
  fullyCompliantCount: 2,         // EMP0001, EMP0009
  empWithMandatoryReqs: 9,
  fullyCompliantPct: 22.2,        // 2/9 = 22.222...% → 22.2%
  statusCounts: {
    VALID: 9,
    EXPIRING_90: 2,
    EXPIRING_60: 2,
    EXPIRING_30: 3,
    EXPIRED: 4,
    IN_PROGRESS: 1,
    NOT_STARTED: 1,
    MISSING: 2,
    NOT_REQUIRED: 2,              // EMP0007 H2S001 + PTW001
  },
  duplicateGroups: 1,             // EMP0005/CS001
};
