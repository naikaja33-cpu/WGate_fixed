import { useRef, useState } from 'react';
import { Upload, Download, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { wgate } from '@/api/wgateClient';
import { toast } from 'sonner';

// Bulk-add members from a spreadsheet (.xlsx or .csv).
// Columns are found by their heading, in any order. Only Flat Number and Phone are required.
const COLUMN_ALIASES = {
  flat_number: ['flat', 'flat no', 'flat number', 'flat num', 'flatno', 'unit', 'unit no', 'house no', 'apartment', 'apartment no'],
  full_name: ['name', 'member name', 'owner name', 'resident name', 'resident', 'owner', 'full name', 'member'],
  phone: ['phone', 'phone no', 'phone number', 'mobile', 'mobile no', 'mobile number', 'contact', 'contact no', 'contact number', 'contact details'],
  email: ['email', 'email id', 'e mail', 'mail', 'email address'],
  area_sqft: ['area', 'sqft', 'sq ft', 'area sqft', 'area sq ft', 'total area', 'total sqft', 'total sq ft', 'total area sq ft', 'built up area', 'super built up area', 'flat area'],
  rate_per_sqft: ['rate', 'maintenance rate', 'maintenance', 'rate per sqft', 'rate per sq ft', 'maintenance rate per sq ft', 'maintenance rate per sqft'],
  role: ['type', 'role', 'resident type', 'occupancy', 'owner tenant', 'owner or tenant'],
};
const FIELD_LABELS = {
  flat_number: 'Flat', full_name: 'Name', phone: 'Phone', email: 'Email',
  area_sqft: 'Area', rate_per_sqft: 'Rate', role: 'Type',
};
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const TEMPLATE_CSV = [
  'Flat Number,Name,Phone,Email,Type,Area (sq ft),Maintenance Rate',
  'A-101,Example Owner,9876543210,,Owner,1250,3.5',
  'A-102,Example Tenant,9876543211,tenant@example.com,Tenant,950,3.5',
].join('\r\n');

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const src = String(text).replace(/^﻿/, '');
  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

async function readSheetRows(file) {
  if (/\.csv$/i.test(file.name)) return parseCsv(await file.text());
  const { default: readXlsxFile } = await import('read-excel-file');
  return readXlsxFile(file);
}

// Turns the sheet into [{ flat_number, full_name, phone, ... }] and says which columns were found.
function mapRows(sheet) {
  const filled = sheet.filter((r) => Array.isArray(r) && r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
  if (filled.length < 2) return { rows: [], found: {}, error: 'The file needs a heading row and at least one member row.' };
  const headers = filled[0].map(norm);
  const found = {};
  for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
    const wanted = aliases.map(norm);
    const index = headers.findIndex((h) => wanted.includes(h));
    if (index >= 0) found[field] = index;
  }
  if (found.flat_number === undefined) return { rows: [], found, error: 'No "Flat Number" column found. Check the heading row.' };
  if (found.phone === undefined) return { rows: [], found, error: 'No "Phone" column found. Check the heading row.' };
  const text = (v) => (v === null || v === undefined ? '' : String(v).trim());
  const rows = filled.slice(1).map((r) => {
    const out = {};
    for (const [field, index] of Object.entries(found)) {
      const v = r[index];
      out[field] = typeof v === 'number' && field === 'phone' ? String(Math.round(v)) : text(v);
    }
    return out;
  });
  return { rows, found, error: '' };
}

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function downloadFile(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATUS_STYLE = {
  new: 'text-emerald-700', created: 'text-emerald-700', skipped: 'text-amber-700', error: 'text-red-600',
};

export default function ImportMembersModal({ society, onClose }) {
  const fileRef = useRef(null);
  const [step, setStep] = useState('pick'); // pick, preview, done
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const [rows, setRows] = useState([]);
  const [found, setFound] = useState({});
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    setBusy(true);
    try {
      const mapped = mapRows(await readSheetRows(file));
      if (mapped.error) { setError(mapped.error); return; }
      if (mapped.rows.length > 1000) { setError('Please upload at most 1000 members at a time.'); return; }
      setFileName(file.name);
      setRows(mapped.rows);
      setFound(mapped.found);
      setResult(await wgate.superadmin.importMembers(society.id, mapped.rows, true));
      setStep('preview');
    } catch (err) {
      setError(err?.message || 'Could not read that file. Use the .xlsx or .csv template.');
    } finally {
      setBusy(false);
    }
  };

  const handleImport = async () => {
    setError('');
    setBusy(true);
    try {
      const done = await wgate.superadmin.importMembers(society.id, rows, false);
      setResult(done);
      setStep('done');
      toast.success(`${done.summary.created} members added`);
    } catch (err) {
      setError(err?.message || 'Import failed. Nothing is lost: check the list and try again.');
    } finally {
      setBusy(false);
    }
  };

  const credentialRows = (result?.rows || []).filter((r) => r.status === 'created');

  const downloadCredentials = () => {
    const head = ['Society', 'Flat', 'Name', 'Phone', 'Type', 'Login ID', 'Temporary password', 'Sign-in link'];
    const lines = [head.map(csvCell).join(',')];
    for (const r of credentialRows) {
      lines.push([society.name, r.flat_number, r.full_name, r.phone, r.role, r.login, r.password, result.login_url].map(csvCell).join(','));
    }
    downloadFile(`${society.name.replace(/[^a-z0-9]+/gi, '-')}-member-logins.csv`, `﻿${lines.join('\r\n')}`, 'text/csv;charset=utf-8');
  };

  const copyCredentials = async () => {
    const text = credentialRows.map((r) => `Flat ${r.flat_number} | ${r.full_name} | Login: ${r.login} | Password: ${r.password}`).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard unavailable: use the download */ }
  };

  const summary = result?.summary;
  const foundText = Object.keys(found).map((f) => FIELD_LABELS[f]).join(', ');

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center">
      <div className="bg-card w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl p-6 space-y-4">
        <h2 className="text-lg font-semibold">Import members: {society.name}</h2>

        {step === 'pick' && (
          <>
            <p className="text-sm text-muted-foreground">
              Upload an Excel (.xlsx) or CSV file with one row per flat. Required columns: <b>Flat Number</b> and <b>Phone</b>.
              Optional: Name, Email, Type (Owner or Tenant), Area (sq ft), Maintenance Rate.
            </p>
            <ul className="text-xs text-muted-foreground list-disc pl-5 space-y-1">
              <li>Each member gets a login and a one-time password. They must choose a new password the first time they sign in.</li>
              <li>If there is no Email, the login ID is made from the phone number, like <span className="font-mono">9876543210@m.wwgate.in</span>.</li>
              <li>Area and Rate are saved against the flat, ready for billing.</li>
              <li>Members who already exist are skipped, so you can upload a corrected file again.</li>
            </ul>
            <Button variant="outline" size="sm" onClick={() => downloadFile('wgate-members-template.csv', `﻿${TEMPLATE_CSV}`, 'text/csv;charset=utf-8')}>
              <Download className="w-4 h-4 mr-1.5" /> Download template
            </Button>
            <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" onChange={handleFile} />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button className="flex-1" disabled={busy} onClick={() => fileRef.current?.click()}>
                <Upload className="w-4 h-4 mr-1.5" /> {busy ? 'Reading...' : 'Choose file'}
              </Button>
            </div>
          </>
        )}

        {step === 'preview' && summary && (
          <>
            <p className="text-sm text-muted-foreground">File: {fileName}. Columns found: {foundText}.</p>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              <div className="rounded-xl bg-emerald-50 p-2"><div className="text-lg font-semibold text-emerald-700">{summary.created}</div>to add</div>
              <div className="rounded-xl bg-amber-50 p-2"><div className="text-lg font-semibold text-amber-700">{summary.skipped}</div>skipped</div>
              <div className="rounded-xl bg-red-50 p-2"><div className="text-lg font-semibold text-red-600">{summary.failed}</div>errors</div>
            </div>
            <p className="text-xs text-muted-foreground">Flat sizes saved or updated: {summary.areas_saved}. Nothing has been added yet.</p>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted text-left"><tr><th className="p-2">#</th><th className="p-2">Flat</th><th className="p-2">Name</th><th className="p-2">Login ID</th><th className="p-2">Result</th></tr></thead>
                <tbody>
                  {result.rows.map((r) => (
                    <tr key={r.row} className="border-t border-border">
                      <td className="p-2">{r.row}</td>
                      <td className="p-2">{r.flat_number}</td>
                      <td className="p-2">{r.full_name}</td>
                      <td className="p-2 font-mono break-all">{r.login || ''}</td>
                      <td className={`p-2 ${STATUS_STYLE[r.status] || ''}`}>{r.status === 'new' ? 'Will add' : r.status === 'skipped' ? 'Skipped' : 'Error'}{r.note ? `: ${r.note}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" disabled={busy} onClick={() => { setStep('pick'); setResult(null); }}>Choose another file</Button>
              <Button className="flex-1" disabled={busy || summary.created + summary.areas_saved === 0} onClick={handleImport}>
                {busy ? 'Importing...' : `Import ${summary.created} members`}
              </Button>
            </div>
          </>
        )}

        {step === 'done' && summary && (
          <>
            <p className="text-sm">
              <b>{summary.created}</b> members added, {summary.skipped} skipped, {summary.failed} with errors. Flat sizes saved: {summary.areas_saved}.
            </p>
            <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">
              Save the login list now. The passwords are not kept in readable form, so this is the only time they are shown.
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" disabled={credentialRows.length === 0} onClick={downloadCredentials}>
                <Download className="w-4 h-4 mr-1.5" /> Download logins (CSV)
              </Button>
              <Button variant="outline" className="flex-1" disabled={credentialRows.length === 0} onClick={copyCredentials}>
                {copied ? <Check className="w-4 h-4 mr-1.5" /> : <Copy className="w-4 h-4 mr-1.5" />} {copied ? 'Copied' : 'Copy all'}
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-xl border border-border">
              <table className="w-full text-xs">
                <thead className="bg-muted text-left"><tr><th className="p-2">Flat</th><th className="p-2">Name</th><th className="p-2">Login ID</th><th className="p-2">Password</th></tr></thead>
                <tbody>
                  {credentialRows.map((r) => (
                    <tr key={r.row} className="border-t border-border">
                      <td className="p-2">{r.flat_number}</td>
                      <td className="p-2">{r.full_name}</td>
                      <td className="p-2 font-mono break-all">{r.login}</td>
                      <td className="p-2 font-mono">{r.password}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button className="w-full" onClick={onClose}>Done</Button>
          </>
        )}
      </div>
    </div>
  );
}