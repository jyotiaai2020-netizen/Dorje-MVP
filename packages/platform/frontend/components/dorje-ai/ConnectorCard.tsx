import BrandIcon from './BrandIcon';

type ConnectorCardProps = { provider: string; name: string; status: 'connected' | 'not_connected'; accountEmail?: string | null; busy?: boolean; onConnect: () => void; onTest?: () => void; onDisconnect?: () => void; onReconnect?: () => void };

export default function ConnectorCard({ provider, name, status, accountEmail, busy = false, onConnect, onTest, onDisconnect, onReconnect }: ConnectorCardProps) {
  const connected = status === 'connected';
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
      <div className="flex items-start justify-between gap-2"><BrandIcon provider={provider} /><span className={`rounded-full px-2 py-1 text-[10px] font-semibold uppercase ${connected ? 'bg-emerald-500/10 text-emerald-300' : 'bg-slate-800 text-slate-400'}`}>{connected ? 'Connected' : 'Not connected'}</span></div>
      <h3 className="mt-2 text-sm font-semibold text-white">{name}</h3>
      {accountEmail ? <p className="mt-1 truncate text-[11px] text-slate-400" title={accountEmail}>{accountEmail}</p> : null}
      <div className="mt-3 flex gap-2">
        {!connected ? <button type="button" disabled={busy} onClick={onConnect} className="flex-1 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-40">Connect</button> : null}
        {connected && onTest ? <button type="button" disabled={busy} onClick={onTest} className="flex-1 rounded-lg bg-emerald-500/10 px-2 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-40">Test</button> : null}
        {connected && onReconnect ? <button type="button" disabled={busy} onClick={onReconnect} className="flex-1 rounded-lg bg-sky-500/10 px-2 py-1.5 text-xs font-semibold text-sky-300 disabled:opacity-40">Reconnect</button> : null}
        {connected && onDisconnect ? <button type="button" disabled={busy} onClick={onDisconnect} className="rounded-lg border border-rose-400/20 px-2 py-1.5 text-xs text-rose-300 disabled:opacity-40">Disconnect</button> : null}
      </div>
    </div>
  );
}
