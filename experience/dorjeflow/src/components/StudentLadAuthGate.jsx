import { useEffect, useState } from 'react';
import { ShieldCheck, WifiOff } from 'lucide-react';
import { studentLadApi } from '@/services/studentLadApi';
import './runtime-auth.css';

export default function StudentLadAuthGate({ children }) {
  const [state, setState] = useState('checking');
  const [registering, setRegistering] = useState(false);
  const [form, setForm] = useState({ fullName: '', email: '', password: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    if (window.sessionStorage.getItem('dorje.offline-demo') === 'true') { setState('offline'); return; }
    studentLadApi.auth.me().then(() => setState('ready')).catch(() => setState('signin'));
  }, []);

  if (state === 'ready' || state === 'offline') return children;
  if (state === 'checking') return <main className="runtime-auth"><p>Connecting to the local Student-LAD core…</p></main>;

  const submit = async (event) => {
    event.preventDefault();
    setError('');
    setState('checking');
    try {
      if (registering) {
        await studentLadApi.auth.register(form);
      }
      await studentLadApi.auth.login(form.email, form.password);
      setState('ready');
    } catch (cause) {
      setError(cause?.message || 'Could not connect to Student-LAD.');
      setState('signin');
    }
  };

  const continueOffline = () => {
    window.sessionStorage.setItem('dorje.offline-demo', 'true');
    setState('offline');
  };

  return (
    <main className="runtime-auth">
      <section className="runtime-auth-card">
        <div className="runtime-auth-mark"><ShieldCheck /></div>
        <h1>Dorje MVP</h1>
        <p>Sign in to connect DorjeFlow to the authoritative Student-LAD local database.</p>
        <form onSubmit={submit}>
          {registering && <label>Name<input required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>}
          <label>Email<input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label>Password<input required minLength="8" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          {error && <p className="runtime-auth-error" role="alert">{error}</p>}
          <button className="runtime-auth-primary" type="submit">{registering ? 'Create local account' : 'Sign in'}</button>
        </form>
        <button className="runtime-auth-link" onClick={() => setRegistering(!registering)}>{registering ? 'I already have an account' : 'Create a local account'}</button>
        <button className="runtime-auth-offline" onClick={continueOffline}><WifiOff size={16} /> Continue in offline demo</button>
        <small>Offline demo changes stay in this browser and are not reported as verified.</small>
      </section>
    </main>
  );
}
