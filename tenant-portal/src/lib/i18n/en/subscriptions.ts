/** Subscriptions page — mock plan history (no real billing backend yet,
 * see `BillingPage`'s doc comment for the same caveat). */
export const subscriptions = {
  pageTitle: 'Subscriptions',
  pageSubtitle: "This workspace's plan history — sample data, not yet wired to a real billing backend.",
  columns: {
    plan: 'Plan',
    price: 'Price',
    started: 'Started',
    renews: 'Renews',
  },
  statusOptions: {
    active: 'Active',
    canceled: 'Canceled',
    past_due: 'Past due',
  },
  free: 'Free',
  monthlyPrice: (amount: string) => `${amount}/mo`,
  cancelPlan: 'Cancel plan',
  cancelNotAvailable: 'Plan cancellation is not available yet.',
}
