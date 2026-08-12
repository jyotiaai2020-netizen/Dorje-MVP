type PageTitleProps = {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
};

export default function PageTitle({ title, subtitle, children }: PageTitleProps) {
  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
      </div>
      {children ? <div>{children}</div> : null}
    </div>
  );
}
