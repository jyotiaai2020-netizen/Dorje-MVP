type DorjeFileUploaderProps = {
  onUpload: (file: File) => void;
  selectedFiles: string[];
};

const acceptedTypes = ".txt,.pdf,.docx,.py,.js,.ts,.tsx,.csv,.md,.json,.png,.jpg,.jpeg";

export default function DorjeFileUploader({ onUpload, selectedFiles }: DorjeFileUploaderProps) {
  return (
    <div className="rounded-3xl border border-slate-800 bg-slate-900/70 p-4 shadow-xl shadow-slate-950/30">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-emerald-300">Files & Media</p>
          <p className="mt-1 text-sm text-slate-400">Upload text, code, docs, PDFs, and images.</p>
        </div>
      </div>

      <label className="mt-4 flex cursor-pointer items-center justify-center rounded-2xl border border-dashed border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm font-semibold text-emerald-200 transition hover:bg-emerald-500/20">
        <input
          type="file"
          className="hidden"
          accept={acceptedTypes}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) {
              onUpload(file);
            }
          }}
        />
        Upload file
      </label>

      <div className="mt-4 space-y-2">
        {selectedFiles.length === 0 ? (
          <p className="text-sm text-slate-500">No files uploaded yet.</p>
        ) : (
          selectedFiles.map((fileName) => (
            <div key={fileName} className="rounded-xl border border-slate-800 bg-slate-950/70 px-3 py-2 text-sm text-slate-300">
              {fileName}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
