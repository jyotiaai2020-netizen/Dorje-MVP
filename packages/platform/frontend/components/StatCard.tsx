type StatCardProps = {
  title: string;
  value: string;
  subtitle: string;
  accent?: string;
};

export default function StatCard({ title, value, subtitle, accent = "bg-sky-500" }: StatCardProps) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className={`mb-4 h-2 w-14 rounded-full ${accent}`} />
      <p className="text-sm font-medium text-slate-500">{title}</p>
      <p className="mt-2 text-3xl font-semibold text-slate-900">{value}</p>
      <p className="mt-2 text-sm text-slate-600">{subtitle}</p>
    </div>
  );
}
