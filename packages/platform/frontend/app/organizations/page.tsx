'use client';

import { useEffect, useState } from 'react';
import AuthGuard from '@/components/AuthGuard';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import PageTitle from '@/components/PageTitle';
import OrganizationCard from '@/components/OrganizationCard';
import { getToken } from '@/lib/auth';
import { API_BASE_URL, authenticatedFetch } from '@/lib/api';

type Organization = {
  id: number;
  name: string;
  industry?: string | null;
  website?: string | null;
};

export default function OrganizationsPage() {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [form, setForm] = useState({ name: '', industry: '', website: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!getToken()) return;
    void loadOrganizations();
  }, []);

  async function loadOrganizations() {
    const token = localStorage.getItem('lotus_token') || '';
    setLoading(true);
    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/organizations/`, {
        credentials: 'include',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json().catch(() => []);
      if (response.ok) {
        setOrganizations(Array.isArray(data) ? data : []);
      } else {
        throw new Error(data.message || 'Unable to load organizations');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load organizations');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const response = await authenticatedFetch(`${API_BASE_URL}/api/v1/organizations/`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('lotus_token') || ''}`,
        },
        body: JSON.stringify({
          name: form.name,
          industry: form.industry || null,
          website: form.website || null,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Unable to create organization');
      }

      setForm({ name: '', industry: '', website: '' });
      await loadOrganizations();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create organization');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthGuard><div className="flex min-h-screen bg-slate-50">
      <Sidebar />

      <div className="flex min-h-screen flex-1 flex-col">
        <Header title="Organizations" subtitle="Create and manage your customer organizations." />

        <main className="flex-1 p-6">
          <PageTitle title="Client portfolio" subtitle="Add a new organization and review the current list.">
            <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-medium text-slate-700">
              {organizations.length} organizations
            </span>
          </PageTitle>

          <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <form onSubmit={onSubmit} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Create organization</h3>
              <p className="mt-1 text-sm text-slate-600">Back your growth workflows with a structured client record.</p>

              <div className="mt-5 space-y-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Name</label>
                  <input
                    value={form.name}
                    onChange={(event) => setForm({ ...form, name: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 caret-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    placeholder="Organization name"
                    required
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Industry</label>
                  <input
                    value={form.industry}
                    onChange={(event) => setForm({ ...form, industry: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 caret-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    placeholder="Industry"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Website</label>
                  <input
                    value={form.website}
                    onChange={(event) => setForm({ ...form, website: event.target.value })}
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 caret-slate-900 outline-none placeholder:text-slate-400 focus:border-sky-500 focus:ring-2 focus:ring-sky-100"
                    placeholder="https://example.com"
                  />
                </div>
              </div>

              {error ? <p className="mt-4 text-sm text-rose-500">{error}</p> : null}

              <button
                type="submit"
                disabled={submitting}
                className="mt-6 rounded-xl bg-sky-700 px-4 py-3 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? 'Creating...' : 'Create organization'}
              </button>
            </form>

            <div className="space-y-4">
              {loading ? <p className="text-sm text-slate-600">Loading organizations…</p> : null}
              {organizations.map((organization) => (
                <OrganizationCard key={organization.id} organization={organization} />
              ))}
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </div></AuthGuard>
  );
}
