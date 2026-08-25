type ActivityBarsTone = 'blue' | 'amber' | 'green' | 'neutral';
type ActivityBarsSize = 'sm' | 'md';

type ActivityBarsProps = {
  active?: boolean;
  tone?: ActivityBarsTone;
  size?: ActivityBarsSize;
  label?: string;
  className?: string;
};

export function ActivityBars({
  active = true,
  tone = 'blue',
  size = 'md',
  label,
  className = '',
}: ActivityBarsProps) {
  const classes = [
    'activity-bars',
    `activity-bars-${tone}`,
    `activity-bars-${size}`,
    active ? 'is-active' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <span className={classes} role={label ? 'status' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <span />
      <span />
      <span />
      <span />
    </span>
  );
}
