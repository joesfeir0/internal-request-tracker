import { BadRequestException } from '@nestjs/common';

// These are demo routing rules, not verified organization memberships.
export const ROUTABLE_DEPARTMENTS = ['IT', 'HR', 'FINANCE'] as const;
export const DEPARTMENTS = [...ROUTABLE_DEPARTMENTS, 'UNDETERMINED'] as const;

export const INTAKE_CONTEXT = {
  departments: [
    { code: 'IT', handles: 'Computers, software, shared drives and application access.', needed: 'Affected device or application, symptoms or error, and when it started.' },
    { code: 'HR', handles: 'Leave, employment letters and employment policy questions.', needed: 'Type of document or policy question, and relevant dates.' },
    { code: 'FINANCE', handles: 'Expense reimbursements, invoices and payment questions.', needed: 'Expense or payment type, date, and whether supporting evidence is available. Never request bank details.' },
  ],
  unresolvedRouting: 'UNDETERMINED: insufficient information, multiple departments, or outside the supported services.',
} as const;

export interface IntakeCandidate {
  suggestedDepartment: typeof DEPARTMENTS[number];
  summary: string;
  missingInformation: string[];
  suggestedNextStep: string;
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

export function intakeText(body: unknown): string {
  if (!isObject(body) || Object.keys(body).length !== 1 || !validText(body.text, 4000)) {
    throw new BadRequestException('Enter an issue of 1 to 4000 characters. Send only the text field.');
  }
  return body.text.trim();
}

export function validateCandidate(value: unknown): IntakeCandidate {
  if (!isObject(value) || !DEPARTMENTS.some(code => code === value.suggestedDepartment)
    || !validText(value.summary, 600) || !validText(value.suggestedNextStep, 600)
    || !Array.isArray(value.missingInformation) || value.missingInformation.length > 5
    || !value.missingInformation.every(item => validText(item, 200))) {
    throw new Error('Invalid intake candidate');
  }
  // Return only product-approved fields, even if the provider included extras.
  return {
    suggestedDepartment: value.suggestedDepartment as IntakeCandidate['suggestedDepartment'],
    summary: value.summary.trim(),
    // Add a question if routing is uncertain and the model supplied none.
    missingInformation: value.suggestedDepartment === 'UNDETERMINED' && value.missingInformation.length === 0
      ? ['Which issue should this request cover?']
      : value.missingInformation.map((item: string) => item.trim()),
    suggestedNextStep: value.suggestedNextStep.trim(),
  };
}

export const CANDIDATE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    suggestedDepartment: { type: 'STRING', enum: [...DEPARTMENTS] },
    summary: { type: 'STRING' },
    missingInformation: { type: 'ARRAY', items: { type: 'STRING' } },
    suggestedNextStep: { type: 'STRING' },
  },
  required: ['suggestedDepartment', 'summary', 'missingInformation', 'suggestedNextStep'],
};
