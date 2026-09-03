export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {description ? (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}

export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}
    >
      {children}
    </div>
  );
}

export function Forbidden() {
  return (
    <Card className="border-red-200 bg-red-50">
      <h2 className="text-sm font-semibold text-red-800">Access denied</h2>
      <p className="mt-1 text-sm text-red-700">
        Your account does not have permission to view this module. If you
        believe this is a mistake, ask a partner to review your permissions.
      </p>
    </Card>
  );
}

export function ComingSoon({
  module,
  phase,
}: {
  module: string;
  phase: number;
}) {
  return (
    <Card>
      <h2 className="text-sm font-semibold text-gray-900">{module}</h2>
      <p className="mt-1 text-sm text-gray-500">
        You have permission to use this module. It is delivered in phase {phase}{" "}
        of the build and is not available yet.
      </p>
    </Card>
  );
}

export function StatTile({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <div className="text-2xl font-semibold text-gray-900">{value}</div>
      <div className="mt-1 text-xs uppercase tracking-wide text-gray-500">
        {label}
      </div>
    </Card>
  );
}
