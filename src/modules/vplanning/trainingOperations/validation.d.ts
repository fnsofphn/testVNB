export type TrainingInputValidation = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  data: Record<string, unknown> & { classes?: Array<{ code: string }>; learners?: Array<Record<string, unknown>> };
  summary?: { rowCount: number; classCount: number; errorCount: number; warningCount: number };
};

export function validateRosterRows(rows: Array<Record<string, unknown>>, expectedClassCodes?: string[]): TrainingInputValidation;
export function validateContentInput(fields: Record<string, unknown>, file?: File | null): TrainingInputValidation;

