type DorjeReportActionsProps = {
  onGenerateReport: () => void;
  onDownloadPdf: () => void;
  onDownloadDocx: () => void;
  onGenerateImage: () => void;
  loading: boolean;
};

export default function DorjeReportActions({
  onGenerateReport,
  onDownloadPdf,
  onDownloadDocx,
  onGenerateImage,
  loading,
}: DorjeReportActionsProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onGenerateReport}
        disabled={loading}
        className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        Generate Report
      </button>
      <button
        type="button"
        onClick={onDownloadPdf}
        className="rounded-full border border-pink-400/20 bg-pink-500/10 px-4 py-2 text-sm font-semibold text-pink-200 transition hover:bg-pink-500/20"
      >
        Download PDF
      </button>
      <button
        type="button"
        onClick={onDownloadDocx}
        className="rounded-full border border-sky-400/20 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-200 transition hover:bg-sky-500/20"
      >
        Download DOCX
      </button>
      <button
        type="button"
        onClick={onGenerateImage}
        className="rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-sm font-semibold text-violet-200 transition hover:bg-violet-500/20"
      >
        Generate Image
      </button>
    </div>
  );
}
