import { useState } from 'react';
import { useApp, genId } from '../context/AppContext';

export default function DeleteRequestModal({ type, targetId, label, onClose }) {
  const { state, dispatch } = useApp();
  const [reason, setReason] = useState('');

  function submit() {
    if (!reason.trim()) return;
    dispatch({
      type: 'REQUEST_DELETE',
      payload: {
        id: genId('DR'),
        type,
        targetId,
        label,
        reason,
        requestedBy: state.user?.name,
        branch: state.branch,
        requestedAt: new Date().toISOString(),
        status: 'pending',
      },
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="font-syne font-semibold text-white">Request Delete Approval</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
            <div>
              <p className="text-amber-400 font-medium text-sm">Admin Approval Required</p>
              <p className="text-amber-400/70 text-xs mt-0.5">This delete request will be sent to the admin for review.</p>
            </div>
          </div>
          <div>
            <p className="text-gray-400 text-xs font-medium mb-1">Item to delete</p>
            <p className="text-white text-sm font-medium">{label}</p>
          </div>
          <div>
            <label className="text-gray-400 text-xs font-medium block mb-1.5">Reason for deletion <span className="text-red-400">*</span></label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              rows={3}
              placeholder="Explain why this record should be deleted..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3.5 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
            <button
              onClick={submit}
              disabled={!reason.trim()}
              className="flex-1 bg-amber-500 hover:bg-amber-400 disabled:bg-gray-700 disabled:text-gray-500 text-black text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              Submit Request
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
