'use client';

interface StatsCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  color?: 'blue' | 'green' | 'yellow' | 'red' | 'purple';
}

const colorClasses = {
  blue: {
    bg: 'bg-info/10',
    icon: 'bg-info/20 text-info',
    trend: 'text-info',
  },
  green: {
    bg: 'bg-success/10',
    icon: 'bg-success/20 text-success',
    trend: 'text-success',
  },
  yellow: {
    bg: 'bg-warning/10',
    icon: 'bg-warning/20 text-warning',
    trend: 'text-warning',
  },
  red: {
    bg: 'bg-danger/10',
    icon: 'bg-danger/20 text-danger',
    trend: 'text-danger',
  },
  purple: {
    bg: 'bg-purple/10',
    icon: 'bg-purple/20 text-purple',
    trend: 'text-purple',
  },
};

export function StatsCard({ title, value, icon, trend, color = 'blue' }: StatsCardProps) {
  const colors = colorClasses[color];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-text-muted">{title}</p>
          <p className="mt-2 text-3xl font-heading font-bold text-body-dark">{value}</p>
          {trend && (
            <div className="mt-2 flex items-center text-sm">
              {trend.isPositive ? (
                <svg className="h-4 w-4 text-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                </svg>
              ) : (
                <svg className="h-4 w-4 text-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                </svg>
              )}
              <span className={trend.isPositive ? 'text-success' : 'text-danger'}>
                {trend.value}%
              </span>
              <span className="ml-1 text-text-muted">vs last week</span>
            </div>
          )}
        </div>
        <div className={`rounded-lg p-3 ${colors.icon}`}>{icon}</div>
      </div>
    </div>
  );
}

export default StatsCard;
