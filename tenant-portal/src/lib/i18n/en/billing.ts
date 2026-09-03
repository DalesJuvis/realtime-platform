/** Billing page — mock invoice history (no real billing backend yet, see
 * the page's own doc comment). */
export const billing = {
  pageTitle: 'Billing',
  pageSubtitle: "Invoices for this workspace's plan — sample data, not yet wired to a real billing backend.",
  columns: {
    reference: 'Reference',
    period: 'Period',
    amount: 'Amount',
    issued: 'Issued',
  },
  statusOptions: {
    paid: 'Paid',
    pending: 'Pending',
    failed: 'Failed',
  },
  downloadPdf: 'Download PDF',
  pdfNotAvailable: 'Invoice PDFs are not available yet.',
}
