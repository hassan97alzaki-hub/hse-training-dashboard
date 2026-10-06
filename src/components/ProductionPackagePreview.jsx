import { useState } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Info, FileSpreadsheet, ChevronDown, ChevronRight } from 'lucide-react';
import { SEVERITY, groupIssuesByCode } from '../lib/contract/productionPackage.js';

const SEVERITY_STYLE = {
  [SEVERITY.BLOCK]: { icon: XCircle, color: 'var(--critical)' },
  [SEVERITY.WARN]: { icon: AlertTriangle, color: 'var(--warning)' },
  [SEVERITY.INFO]: { icon: Info, color: 'var(--info)' },
};

const IMPACT_ROWS = [
  ['ppActiveEmployees', 'activeEmployees'],
  ['ppMandatoryItems', 'mandatoryItems'],
  ['ppRequirementCompliance', 'requirementCompliance'],
  ['ppFullyCompliant', 'fullyCompliantCount'],
  ['statusValid', 'valid'],
  ['statusExpiring30', 'expiring30'],
  ['statusExpired', 'expired'],
  ['statusMissing', 'missing'],
];

/**
 * Pre-approval preview of an `HSE-DC-1.0` production package.
 *
 * The summary carries counts, codes, sheet names, row numbers and field names
 * only. The technical details are closed by default and may additionally show an
 * `employee_code` or a `source_record_id`; names, certificate numbers and
 * contact values are never rendered, not even in a hidden element.
 */
export default function ProductionPackagePreview({
  preview,
  fileName,
  approverRole,
  onApproverRoleChange,
  onApprove,
  onCancel,
  isApplying,
  t,
}) {
  const [showDetails, setShowDetails] = useState(false);
  const { validated, plan, impact } = preview;
  const contract = validated.contract;
  const counts = plan.counts;
  const grouped = groupIssuesByCode(plan.issues);
  const roleValid = String(approverRole ?? '').trim().length >= 2;
  const blocked = !plan.ok;
  const canApprove = !blocked && roleValid && !isApplying;

  const sheetRows = Object.entries(validated.sheetRowCounts);
  const stagedSheets = Object.entries(plan.sheets ?? {});

  return (
    <div
      className="section"
      role="region"
      aria-label={t('ppTitle')}
      data-testid="production-preview"
    >
      <div className="section-header">
        <span className="section-title"><FileSpreadsheet size={18} /> {t('ppTitle')}</span>
        <span
          className="badge-count"
          style={{ background: blocked ? 'var(--critical)' : 'var(--success)' }}
        >
          {blocked ? `${t('ppBlocks')}: ${counts.blocking}` : t('ppNoIssues')}
        </span>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card"><div className="kpi-label">{t('ppPackageType')}</div><div className="kpi-value">{contract.package_type ?? '—'}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t('ppOrganization')}</div><div className="kpi-value">{contract.organization_code ?? '—'}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t('ppExtractDate')}</div><div className="kpi-value">{contract.extract_date ?? '—'}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t('asOfDate')}</div><div className="kpi-value">{validated.asOfDate}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t('ppPreparedByRole')}</div><div className="kpi-value" style={{ fontSize: 14 }}>{contract.prepared_by_role ?? '—'}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t('ppFileName')}</div><div className="kpi-value" style={{ fontSize: 13, wordBreak: 'break-all' }}>{fileName}</div></div>
      </div>

      <div className="table-wrap" style={{ marginBottom: 16 }} data-testid="pp-sheets">
        <table>
          <caption className="text-muted text-sm" style={{ textAlign: 'start', marginBottom: 6 }}>{t('ppSheets')}</caption>
          <thead>
            <tr><th>{t('ppEntity')}</th><th>{t('ppCount')}</th></tr>
          </thead>
          <tbody>
            {sheetRows.map(([name, rows]) => (
              <tr key={name}>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>
                  {name}
                  {validated.ignoredSheets.includes(name) && (
                    <span className="text-muted text-sm"> · {t('ppIgnoredSheets')}</span>
                  )}
                </td>
                <td>{rows}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <div className="kpi-card"><div className="kpi-label">{t('ppBlocks')}</div><div className="kpi-value" style={{ color: counts.blocking > 0 ? 'var(--critical)' : undefined }}>{counts.blocking}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t('ppWarnings')}</div><div className="kpi-value" style={{ color: counts.warnings > 0 ? 'var(--warning)' : undefined }}>{counts.warnings}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t('ppInfo')}</div><div className="kpi-value" style={{ color: counts.info > 0 ? 'var(--info)' : undefined }}>{counts.info}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t('ppAcceptedRows')}</div><div className="kpi-value">{validated.counts.accepted}</div></div>
        <div className="kpi-card"><div className="kpi-label">{t('ppRejectedRows')}</div><div className="kpi-value">{validated.counts.rejected}</div></div>
      </div>

      <div className="table-wrap" style={{ marginBottom: 16 }}>
        <table>
          <caption className="text-muted text-sm" style={{ textAlign: 'start', marginBottom: 6 }}>{t('ppValidationTitle')}</caption>
          <thead>
            <tr><th>{t('ppSeverity')}</th><th>{t('ppIssueCode')}</th><th>{t('ppCount')}</th></tr>
          </thead>
          <tbody>
            {grouped.length === 0 && (
              <tr><td colSpan={3} className="text-muted">{t('ppNoIssues')}</td></tr>
            )}
            {grouped.map((group) => {
              const style = SEVERITY_STYLE[group.severity] ?? SEVERITY_STYLE[SEVERITY.INFO];
              const Icon = style.icon;
              return (
                <tr key={group.code}>
                  <td style={{ color: style.color }}><Icon size={14} /> {group.severity}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{group.code}</td>
                  <td>{group.count}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="table-wrap" style={{ marginBottom: 16 }} data-testid="pp-changes">
        <table>
          <caption className="text-muted text-sm" style={{ textAlign: 'start', marginBottom: 6 }}>{t('ppChangesTitle')}</caption>
          <thead>
            <tr>
              <th>{t('ppEntity')}</th><th>{t('ppNew')}</th><th>{t('ppChanged')}</th>
              <th>{t('ppUnchanged')}</th><th>{t('ppConflict')}</th>
            </tr>
          </thead>
          <tbody>
            {stagedSheets.map(([name, staged]) => (
              <tr key={name}>
                <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{name}</td>
                <td>{staged.counts.new}</td>
                <td>{staged.counts.changed}</td>
                <td>{staged.counts.unchanged}</td>
                <td style={{ color: staged.counts.conflict > 0 ? 'var(--critical)' : undefined }}>{staged.counts.conflict}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} className="text-muted">{t('ppRowsToClose')}</td>
              <td>{counts.rowsToClose ?? 0}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="section" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 8 }}>{t('ppImpactTitle')}</div>
        {!impact.after ? (
          <p className="text-muted text-sm">{t('ppImpactBlocked')}</p>
        ) : (
          <div className="table-wrap" data-testid="pp-impact">
            <table>
              <thead>
                <tr><th>{t('ppImpactMetric')}</th><th>{t('ppBefore')}</th><th>{t('ppAfter')}</th></tr>
              </thead>
              <tbody>
                {IMPACT_ROWS.map(([key, field]) => (
                  <tr key={field}>
                    <td>{t(key)}</td>
                    <td>{impact.before[field]}</td>
                    <td><strong>{impact.after[field]}</strong></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={{ marginBottom: 16 }}>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => setShowDetails((value) => !value)}
          aria-expanded={showDetails}
          aria-controls="pp-technical-details"
          data-testid="pp-details-toggle"
        >
          {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {showDetails ? t('ppDetailsHide') : t('ppDetailsShow')}
        </button>
        {showDetails && (
          <div id="pp-technical-details" data-testid="pp-details">
            <p className="text-muted text-sm" style={{ margin: '8px 0' }}>{t('ppDetailsNote')}</p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{t('ppIssueCode')}</th><th>{t('ppSeverity')}</th><th>{t('ppDetailSheet')}</th>
                    <th>{t('ppDetailRow')}</th><th>{t('ppDetailField')}</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.issues.slice(0, 200).map((entry, index) => (
                    <tr key={`${entry.code}-${entry.sheet}-${entry.row ?? 'x'}-${index}`}>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.code}</td>
                      <td>{entry.severity}</td>
                      <td>{entry.sheet}</td>
                      <td>{entry.row ?? '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{entry.field ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {blocked && (
        <div className="dq-card" style={{ '--dq-accent': 'var(--critical)', marginBottom: 16 }}>
          <div className="dq-card-header" style={{ color: 'var(--critical)' }}><XCircle size={16} />{t('ppBlockedNote')}</div>
        </div>
      )}

      <div style={{ marginBottom: 12, maxWidth: 420 }}>
        <label className="kpi-label" htmlFor="pp-approver-role">{t('ppApproverRoleLabel')}</label>
        <input
          id="pp-approver-role"
          type="text"
          value={approverRole}
          onChange={(event) => onApproverRoleChange(event.target.value)}
          aria-required="true"
          aria-describedby="pp-approver-role-hint"
          data-testid="pp-approver-role"
          style={{ width: '100%', padding: '6px 8px', marginTop: 4 }}
        />
        <p id="pp-approver-role-hint" className="text-muted text-sm" style={{ marginTop: 4 }}>
          {t('ppApproverRoleHint')}
        </p>
        {!roleValid && <p className="text-sm" style={{ color: 'var(--warning)' }}>{t('ppApproverRoleRequired')}</p>}
      </div>

      <p className="text-muted text-sm" style={{ marginBottom: 8 }}>{t('ppDecisionNote')}</p>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onApprove}
          disabled={!canApprove}
          data-testid="pp-approve"
        >
          <CheckCircle2 size={14} /> {isApplying ? t('ppApplying') : t('ppApprove')}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={isApplying} data-testid="pp-cancel">
          {t('ppCancel')}
        </button>
      </div>
    </div>
  );
}
