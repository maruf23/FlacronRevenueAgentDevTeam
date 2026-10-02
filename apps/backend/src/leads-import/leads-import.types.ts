export type CsvLeadRow = {
  firstName?: string;
  lastName?: string;
  email?: string;
  companyName?: string;
  phone?: string;
  title?: string;
};

export type ProcessImportJobData = {
  jobId: string;
  workspaceId: string;
  filename: string;
  /** Base64-encoded CSV contents */
  csvBase64: string;
};

export type VerifyEmailsJobData = {
  jobId: string;
  workspaceId: string;
  contactIds: string[];
};
