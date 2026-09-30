'use client';

import { AlertCircle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import {
  TOS_COGNITIVE_LEVELS,
  type TosCognitiveLevel,
  type TosPlan,
  type TosRow,
} from '../utils/tosPlan';
import {
  isTosAvailable,
  type TosApprovalStatus,
  type TosEditorIssue,
  type TosEditorValidation,
} from '../utils/tosEditorState';

export interface TosEditorProps {
  enabled: boolean;
  questionType: string;
  plan: TosPlan;
  expectedTotal: number;
  validation: TosEditorValidation;
  approvalStatus: TosApprovalStatus;
  generationError: string | null;
  isGenerating: boolean;
  onEnabledChange: (enabled: boolean) => void;
  onPlanChange: (plan: TosPlan) => void;
  onApprove: () => void;
}

function createRowId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return `tos-row-${crypto.randomUUID()}`;
  }
  return `tos-row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function updateRow(plan: TosPlan, rowId: string, update: (row: TosRow) => TosRow): TosPlan {
  return {
    version: 1,
    rows: plan.rows.map(row => (row.id === rowId ? update(row) : row)),
  };
}

function statusLabel(status: TosApprovalStatus): string {
  switch (status) {
    case 'approved':
      return 'Approved — configuration and plan are current.';
    case 'stale':
      return 'Stale — approve again after the latest change.';
    case 'invalid':
      return 'Invalid — fix the issues below before approval.';
    default:
      return 'Draft — review the plan and approve it before generating.';
  }
}

function statusIcon(status: TosApprovalStatus) {
  return status === 'approved' ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />;
}

function issueKey(issue: TosEditorIssue, index: number): string {
  return `${issue.path}-${issue.code}-${index}`;
}

export default function TosEditor({
  enabled,
  questionType,
  plan,
  expectedTotal,
  validation,
  approvalStatus,
  generationError,
  isGenerating,
  onEnabledChange,
  onPlanChange,
  onApprove,
}: TosEditorProps) {
  const available = isTosAvailable(questionType);
  const remaining = expectedTotal - validation.totalItems;

  const handleRowTextChange = (rowId: string, field: 'competency' | 'objective', value: string) => {
    onPlanChange(updateRow(plan, rowId, (row) => {
      const nextRow: TosRow = { ...row };
      if (field === 'competency') {
        nextRow.competency = value;
      } else if (value.length === 0) {
        delete nextRow.objective;
      } else {
        nextRow.objective = value;
      }
      return nextRow;
    }));
  };

  const handleAllocationChange = (rowId: string, level: TosCognitiveLevel, value: string) => {
    onPlanChange(updateRow(plan, rowId, (row) => {
      const allocations = { ...row.allocations };
      if (value === '') delete allocations[level];
      else allocations[level] = Number(value);
      return { ...row, allocations };
    }));
  };

  const handleAddRow = () => {
    if (plan.rows.length >= 20) return;
    onPlanChange({
      version: 1,
      rows: [...plan.rows, { id: createRowId(), competency: '', allocations: {} }],
    });
  };

  const handleRemoveRow = (rowId: string) => {
    onPlanChange({
      version: 1,
      rows: plan.rows.filter(row => row.id !== rowId),
    });
  };

  return (
    <div className="tos-mode-panel">
      <div className="tos-mode-toggle">
        <div>
          <label className="tos-mode-toggle__label" htmlFor="tos-mode-toggle">
            Table of Specifications
          </label>
          <p className="tos-mode-toggle__hint">
            Optional teacher-approved cognitive-level allocation for Multiple Choice items.
          </p>
        </div>
        <input
          id="tos-mode-toggle"
          type="checkbox"
          role="switch"
          checked={enabled && available}
          disabled={!available || isGenerating}
          onChange={(event) => onEnabledChange(event.target.checked && available)}
        />
      </div>

      {!available && (
        <p className="tos-mode-panel__unavailable" role="status">
          TOS generation is available only when Question Type is Multiple Choice.
        </p>
      )}

      {enabled && available && (
        <div className="tos-editor" aria-label="Table of Specifications editor">
          <div className="tos-editor__heading">
            <div>
              <h3>Build your TOS plan</h3>
              <p>Enter teacher-authoritative competencies and allocate the requested items across Bloom levels.</p>
            </div>
            <span className={`tos-editor__status tos-editor__status--${approvalStatus}`} data-status={approvalStatus}>
              {statusIcon(approvalStatus)} {statusLabel(approvalStatus)}
            </span>
          </div>

          <div className="tos-editor__metrics" role="status" aria-live="polite">
            <span>Allocated <strong>{validation.totalItems}</strong></span>
            <span>Requested <strong>{expectedTotal}</strong></span>
            <span className={remaining === 0 ? 'tos-editor__metric--complete' : remaining < 0 ? 'tos-editor__metric--over' : ''}>
              Remaining / unallocated <strong>{remaining}</strong>
            </span>
          </div>

          {validation.issues.length > 0 && (
            <div className="tos-editor__issues" role="alert">
              <strong>Fix these items before approval:</strong>
              <ul>
                {validation.issues.map((issue, index) => (
                  <li key={issueKey(issue, index)}>{issue.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="tos-editor__rows">
            {plan.rows.map((row, rowIndex) => (
              <div className="tos-editor__row" key={row.id}>
                <div className="tos-editor__row-heading">
                  <strong>Competency {rowIndex + 1}</strong>
                  <button
                    type="button"
                    className="tos-editor__remove"
                    onClick={() => handleRemoveRow(row.id)}
                    disabled={isGenerating}
                    aria-label={`Remove competency ${rowIndex + 1}`}
                  >
                    <Trash2 size={14} /> Remove
                  </button>
                </div>
                <div className="tos-editor__row-fields">
                  <input
                    className="neu-input"
                    type="text"
                    value={row.competency}
                    placeholder="Teacher-entered competency"
                    aria-label={`Competency ${rowIndex + 1}`}
                    disabled={isGenerating}
                    onChange={(event) => handleRowTextChange(row.id, 'competency', event.target.value)}
                  />
                  <input
                    className="neu-input"
                    type="text"
                    value={row.objective ?? ''}
                    placeholder="Optional objective"
                    aria-label={`Objective ${rowIndex + 1}`}
                    disabled={isGenerating}
                    onChange={(event) => handleRowTextChange(row.id, 'objective', event.target.value)}
                  />
                </div>
                <div className="tos-editor__allocations">
                  {TOS_COGNITIVE_LEVELS.map(level => (
                    <label className="tos-editor__allocation" key={level}>
                      <span>{level}</span>
                      <input
                        className="neu-input"
                        type="number"
                        min={0}
                        max={50}
                        step={1}
                        value={row.allocations[level] ?? ''}
                        aria-label={`${level} count for competency ${rowIndex + 1}`}
                        disabled={isGenerating}
                        onChange={(event) => handleAllocationChange(row.id, level, event.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="tos-editor__actions">
            <button
              type="button"
              className="neu-button"
              onClick={handleAddRow}
              disabled={plan.rows.length >= 20 || isGenerating}
            >
              <Plus size={15} /> Add competency row
            </button>
            <button
              type="button"
              className="neu-button-solid bg-ios-green"
              onClick={onApprove}
              disabled={!validation.valid || isGenerating}
            >
              <CheckCircle2 size={15} /> {approvalStatus === 'approved' ? 'Approval current' : 'Approve TOS plan'}
            </button>
          </div>

          {generationError && (
            <p className="tos-editor__generation-error" role="alert">
              {generationError}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
