/**
 * Returns the currently active meal session based on time:
 * breakfast 06:00-10:00, lunch 12:00-15:00, supper 18:00-21:00
 */
export const getActiveSession = (date = new Date()) => {
  const hours = date.getHours();
  if (hours >= 6 && hours < 10) return 'breakfast';
  if (hours >= 12 && hours < 15) return 'lunch';
  if (hours >= 18 && hours < 21) return 'supper';
  return 'closed';
};

export const SESSION_SCHEDULE = [
  { id: 'breakfast', label: 'Breakfast', time: '06:00 – 10:00', icon: '🌅' },
  { id: 'lunch', label: 'Lunch', time: '12:00 – 15:00', icon: '☀️' },
  { id: 'supper', label: 'Supper', time: '18:00 – 21:00', icon: '🌙' },
];

export const formatKES = (amount) =>
  `KES ${Number(amount).toLocaleString('en-KE', { minimumFractionDigits: 0 })}`;

export const formatDate = (d) =>
  new Date(d).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const STATUS_STYLES = {
  pending:   { color: 'var(--amber)',   bg: 'var(--amber-light)',   label: 'Pending'   },
  paid:      { color: 'var(--accent)',  bg: 'var(--accent-light)',  label: 'Paid'      },
  preparing: { color: 'var(--teal)',    bg: 'var(--teal-light)',    label: 'Preparing' },
  ready:     { color: 'var(--green)',   bg: 'var(--green-light)',   label: 'Ready'     },
  served:    { color: 'var(--gray)',    bg: 'var(--gray-light)',    label: 'Served'    },
  expired:   { color: 'var(--red)',     bg: 'var(--red-light)',     label: 'Expired'   },
};
