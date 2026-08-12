type Organization = {
  id: number;
  name: string;
  industry?: string | null;
  website?: string | null;
};

export default function OrganizationCard({ organization }: { organization: Organization }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{organization.name}</h3>
          <p className="mt-1 text-sm text-slate-600">
            {organization.industry ?? "Industry not set"}
          </p>
        </div>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-emerald-700">
          Active
        </span>
      </div>
      {organization.website ? (
        <a
          href={organization.website}
          target="_blank"
          rel="noreferrer"
          className="mt-4 inline-flex text-sm font-medium text-sky-700"
        >
          Visit website
        </a>
      ) : null}
    </div>
  );
}
