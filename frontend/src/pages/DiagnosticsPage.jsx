import React, { useState, useEffect } from 'react';
import {
  Activity,
  Server,
  Zap,
  CheckCircle2,
  AlertTriangle,
  Play,
  FileCode,
  Layers,
  Copy,
  Check,
} from 'lucide-react';
import { checkHealth, getExplain } from '../services/api';
import { LoadingSpinner } from '../components/LoadingSpinner';

export const DiagnosticsPage = ({ onNotify }) => {
  // Health ping state
  const [healthStatus, setHealthStatus] = useState(null);
  const [pingLatency, setPingLatency] = useState(null);
  const [healthLoading, setHealthLoading] = useState(false);

  // Explain endpoint explorer state
  const [endpoint, setEndpoint] = useState('attendance_list');
  const [params, setParams] = useState({
    emp_code: 'EMP001',
    month: '2026-03',
    department: 'Engineering',
    limit: 10,
    from: '2026-03-01',
    to: '2026-03-07',
  });
  const [explainResult, setExplainResult] = useState(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainError, setExplainError] = useState(null);
  const [copied, setCopied] = useState(false);

  const testConnection = async () => {
    setHealthLoading(true);
    const start = performance.now();
    try {
      const res = await checkHealth();
      const end = performance.now();
      setPingLatency(Math.round(end - start));
      setHealthStatus(res);
    } catch (err) {
      setHealthStatus({ status: 'unreachable', error: err.message });
      setPingLatency(null);
    } finally {
      setHealthLoading(false);
    }
  };

  useEffect(() => {
    testConnection();
  }, []);

  const runExplainQuery = async (e) => {
    if (e) e.preventDefault();
    setExplainLoading(true);
    setExplainError(null);
    setExplainResult(null);

    try {
      let queryParams = {};
      if (endpoint === 'attendance_list') {
        if (params.emp_code) queryParams.emp_code = params.emp_code;
        queryParams.page = 1;
        queryParams.page_size = 10;
      } else if (endpoint === 'employee_monthly') {
        queryParams = { emp_code: params.emp_code, month: params.month };
      } else if (endpoint === 'department_summary') {
        queryParams = { month: params.month };
        if (params.department) queryParams.department = params.department;
      } else if (endpoint === 'late_leaderboard') {
        queryParams = { month: params.month, limit: params.limit };
        if (params.department) queryParams.department = params.department;
      } else if (endpoint === 'department_trend') {
        queryParams = { department: params.department, from: params.from, to: params.to };
      }

      const res = await getExplain(endpoint, queryParams);
      setExplainResult(res);
    } catch (err) {
      setExplainError(err.message);
    } finally {
      setExplainLoading(false);
    }
  };

  // Helper to extract stages
  const extractStages = (obj) => {
    const stages = new Set();
    const traverse = (o) => {
      if (!o) return;
      if (typeof o === 'object') {
        if (o.stage) stages.add(o.stage);
        Object.values(o).forEach(traverse);
      }
    };
    traverse(obj);
    return Array.from(stages);
  };

  const stagesFound = explainResult?.explain ? extractStages(explainResult.explain) : [];
  const hasIxScan = stagesFound.some((s) => s.includes('IXSCAN') || s === 'ixseek' || s.toLowerCase().includes('ixscan'));
  const hasCollScan = stagesFound.some((s) => s.includes('COLLSCAN'));

  const handleCopyJSON = () => {
    if (!explainResult) return;
    navigator.clipboard.writeText(JSON.stringify(explainResult, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl mx-auto">
      {/* Title */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
          <Activity className="w-5 h-5 text-brand-600" />
          <span>System Diagnostics & MongoDB Explainability</span>
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Verify backend connectivity, test MongoDB query execution plans (executionStats), and
          verify index usage (IXSCAN vs COLLSCAN).
        </p>
      </div>

      {/* Connectivity & Health Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700 border border-slate-200">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <span>FastAPI Backend & MongoDB Atlas Connection</span>
                {healthStatus?.status === 'ok' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                    Healthy (200 OK)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                    <AlertTriangle className="w-3 h-3 text-rose-500" />
                    Unavailable (503 / Offline)
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                Endpoint: <span className="font-mono text-slate-700">GET /health</span> • Server selection timeout: 5000ms
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 self-start sm:self-auto">
            {pingLatency !== null && (
              <div className="flex items-center gap-1 text-xs font-mono px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700">
                <Zap className="w-3.5 h-3.5 text-amber-500" />
                <span>{pingLatency} ms ping</span>
              </div>
            )}
            <button
              onClick={testConnection}
              disabled={healthLoading}
              className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white transition-colors disabled:opacity-50"
            >
              {healthLoading ? 'Pinging...' : 'Re-ping'}
            </button>
          </div>
        </div>
      </div>

      {/* Query Explainability Explorer Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-600" />
            <span>MongoDB Explain Explorer (GET /admin/explain/{'{endpoint}'})</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Runs MongoDB explain with verbosity=executionStats on the actual main query of the selected endpoint.
          </p>
        </div>

        <form onSubmit={runExplainQuery} className="space-y-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
          <div>
            <label className="block text-slate-700 font-semibold mb-1">Target Endpoint</label>
            <select
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full sm:w-auto px-3 py-2 rounded-lg border border-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
            >
              <option value="attendance_list">attendance_list (GET /attendance)</option>
              <option value="employee_monthly">employee_monthly (GET /analytics/employees/{'{emp_code}'}/monthly)</option>
              <option value="department_summary">department_summary (GET /analytics/departments/summary)</option>
              <option value="late_leaderboard">late_leaderboard (GET /analytics/leaderboard/late)</option>
              <option value="department_trend">department_trend (GET /analytics/departments/{'{dept}'}/trend)</option>
            </select>
          </div>

          {/* Dynamic Inputs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {(endpoint === 'attendance_list' || endpoint === 'employee_monthly') && (
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Employee Code</label>
                <input
                  type="text"
                  value={params.emp_code}
                  onChange={(e) => setParams({ ...params, emp_code: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 font-mono bg-white"
                />
              </div>
            )}

            {(endpoint === 'employee_monthly' || endpoint === 'department_summary' || endpoint === 'late_leaderboard') && (
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Month (YYYY-MM)</label>
                <input
                  type="month"
                  value={params.month}
                  onChange={(e) => setParams({ ...params, month: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                />
              </div>
            )}

            {(endpoint === 'department_summary' || endpoint === 'late_leaderboard' || endpoint === 'department_trend') && (
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Department</label>
                <input
                  type="text"
                  value={params.department}
                  onChange={(e) => setParams({ ...params, department: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                />
              </div>
            )}

            {endpoint === 'late_leaderboard' && (
              <div>
                <label className="block text-slate-600 font-semibold mb-1">Limit</label>
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={params.limit}
                  onChange={(e) => setParams({ ...params, limit: Number(e.target.value) })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                />
              </div>
            )}

            {endpoint === 'department_trend' && (
              <>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">From Date</label>
                  <input
                    type="date"
                    value={params.from}
                    onChange={(e) => setParams({ ...params, from: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-slate-600 font-semibold mb-1">To Date</label>
                  <input
                    type="date"
                    value={params.to}
                    onChange={(e) => setParams({ ...params, to: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
                  />
                </div>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={explainLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-bold bg-brand-600 hover:bg-brand-700 text-white disabled:opacity-50 transition-colors shadow-sm"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{explainLoading ? 'Executing Explain...' : 'Run MongoDB Explain'}</span>
          </button>
        </form>

        {explainError && (
          <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{explainError}</span>
          </div>
        )}

        {/* Explain Results Analysis */}
        {explainResult && (
          <div className="space-y-4 pt-2">
            {/* Top Analysis Badges */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="text-slate-400 block text-[10px]">Target Collection</span>
                <span className="text-sm font-bold font-mono text-slate-900">{explainResult.collection}</span>
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="text-slate-400 block text-[10px]">Index Scan (IXSCAN)</span>
                {hasIxScan ? (
                  <span className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>IXSCAN Active</span>
                  </span>
                ) : (
                  <span className="text-sm font-bold text-amber-600">No IXSCAN detected</span>
                )}
              </div>

              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                <span className="text-slate-400 block text-[10px]">Collection Scan (COLLSCAN)</span>
                {!hasCollScan ? (
                  <span className="text-sm font-bold text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Zero COLLSCAN (Optimal)</span>
                  </span>
                ) : (
                  <span className="text-sm font-bold text-rose-600 flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4" />
                    <span>COLLSCAN Present!</span>
                  </span>
                )}
              </div>
            </div>

            {/* Stages Tag List */}
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <span className="font-semibold text-slate-700 block mb-2">Detected Execution Stages:</span>
              <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                {stagesFound.map((stage) => (
                  <span
                    key={stage}
                    className={`px-2 py-0.5 rounded font-semibold border ${
                      stage.includes('IXSCAN') || stage === 'ixseek'
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : stage.includes('COLLSCAN')
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {stage}
                  </span>
                ))}
              </div>
            </div>

            {/* Raw JSON Inspector */}
            <div className="rounded-xl border border-slate-800 bg-slate-900 text-slate-200 p-4 text-xs font-mono overflow-hidden">
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800 text-slate-400">
                <span className="flex items-center gap-1.5 font-sans font-bold text-slate-300">
                  <FileCode className="w-4 h-4 text-brand-400" />
                  <span>Raw MongoDB Explain Output</span>
                </span>
                <button
                  onClick={handleCopyJSON}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Copied' : 'Copy JSON'}</span>
                </button>
              </div>

              <pre className="max-h-96 overflow-y-auto leading-relaxed text-[11px] text-slate-300">
                {JSON.stringify(explainResult.explain, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
