type ReportCardProps = {
  report: {
    company: string;
    report_type: string;
    report: string;
  };
};

export default function ReportCard({ report }: ReportCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-sky-700">
            {report.report_type}
          </p>
          <h3 className="mt-1 text-xl font-semibold text-slate-900">{report.company}</h3>
        </div>
        <span className="rounded-full bg-violet-50 px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-violet-700">
          Ready
        </span>
      </div>
      <pre className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700">
        {report.report}
      </pre>
    </div>
  );
}
