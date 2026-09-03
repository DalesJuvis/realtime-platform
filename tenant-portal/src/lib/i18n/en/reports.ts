/** Reports page — mock generated-report list (no report-generation
 * backend yet). */
export const reports = {
  pageTitle: 'Reports',
  pageSubtitle: 'Exportable activity and usage reports — sample data, not yet wired to a real report generator.',
  columns: {
    name: 'Report',
    type: 'Type',
    period: 'Period',
    generated: 'Generated',
  },
  typeFilterLabel: 'Type',
  typeOptions: {
    usage: 'Usage',
    activity: 'Activity',
    billing: 'Billing',
  },
  statusOptions: {
    ready: 'Ready',
    processing: 'Processing',
    failed: 'Failed',
  },
  download: 'Download',
  downloadNotAvailable: 'Report downloads are not available yet.',
}
