import { useApp } from '../context/AppContext';

const ACTION_MAP = {
  sale: 'DELETE_SALE',
  customer: 'DELETE_CUSTOMER',
  expense: 'DELETE_EXPENSE',
  inventory: 'DELETE_ITEM',
  booking: 'DELETE_BOOKING',
  purchase: 'DELETE_PURCHASE',
  supplier: 'DELETE_SUPPLIER',
  commission: 'DELETE_COMMISSION',
};

export default function DeleteRequestModal({ type, targetId, label, onClose }) {
  const { dispatch } = useApp();

  function confirm() {
    const actionType = ACTION_MAP[type];
    if (!actionType) return;
    dispatch({ type: actionType, payload: targetId });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <h2 className="font-syne font-semibold text-white">Delete Item</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/></svg>
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-400 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            <div>
              <p className="text-red-400 font-medium text-sm">Item will be moved to Recycle Bin</p>
              <p className="text-red-400/70 text-xs mt-0.5">You can restore it later from the Recycle Bin page.</p>
            </div>
          </div>
          <div>
            <p className="text-gray-400 text-xs font-medium mb-1">Item to delete</p>
            <p className="text-white text-sm font-medium">{label}</p>
          </div>
          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium px-4 py-2.5 rounded-xl transition-colors">Cancel</button>
            <button
              onClick={confirm}
              className="flex-1 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
