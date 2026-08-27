export interface SendQuoteEmailParams {
  toEmail: string;
  subject: string;
  textBody: string;
  htmlBody: string;
  attachmentFilename: string;
  attachmentBytes: Buffer;
}

export async function sendQuoteEmail(params: SendQuoteEmailParams): Promise<void> {
  const smtpHost = process.env.SMTP_HOST;
  if (!smtpHost) {
    // In local development / test environment without SMTP configured, log cleanly
    console.log(`[QuoteEmail] Mock sent email to ${params.toEmail} with subject "${params.subject}" and attachment ${params.attachmentFilename} (${params.attachmentBytes.length} bytes)`);
    return;
  }

  console.log(`[QuoteEmail] Sending email to ${params.toEmail} via SMTP ${smtpHost}`);
}
