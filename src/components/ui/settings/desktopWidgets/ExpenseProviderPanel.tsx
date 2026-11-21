import React, { useEffect, useState } from "react";
import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import {
  addWidgetExpense,
  deleteWidgetExpense,
  ExpenseLedger,
  getWidgetExpenses,
  setWidgetExpenseBudget,
} from "../../../../services/desktopWidgetsService";

interface ExpenseProviderPanelProps {
  isLightMode: boolean;
  isId: boolean;
  inputCls: string;
  labelCls: string;
  primaryBtn: string;
  secondaryBtn: string;
  hintCls: string;
  refreshNonce?: number;
  onFlash: (msg: string) => void;
}

const EMPTY_LEDGER: ExpenseLedger = { monthly_budget_idr: 0, entries: [] };

function formatIdr(amount: number): string {
  const abs = Math.max(0, Math.round(amount));
  return "Rp" + abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

export const ExpenseProviderPanel: React.FC<ExpenseProviderPanelProps> = ({
  isLightMode,
  isId,
  inputCls,
  labelCls,
  primaryBtn,
  secondaryBtn,
  hintCls,
  refreshNonce = 0,
  onFlash,
}) => {
  const [ledger, setLedger] = useState<ExpenseLedger>(EMPTY_LEDGER);
  const [budgetIdr, setBudgetIdr] = useState("3000000");
  const [entryLabel, setEntryLabel] = useState("");
  const [entryAmount, setEntryAmount] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getWidgetExpenses()
      .then((res) => {
        setLedger(res);
        if (res.monthly_budget_idr > 0) {
          setBudgetIdr(String(res.monthly_budget_idr));
        }
      })
      .catch(() => { });
  }, [refreshNonce]);

  const totalSpent = ledger.entries.reduce((sum, e) => sum + Math.max(0, e.amount_idr), 0);

  const handleAddEntry = async () => {
    const cleanLabel = entryLabel.trim();
    const numeric = Number(entryAmount.replace(/[^0-9]/g, ""));
    if (!cleanLabel || !Number.isFinite(numeric) || numeric <= 0 || busy) return;
    setBusy(true);
    try {
      const next = await addWidgetExpense(cleanLabel, Math.round(numeric));
      setLedger(next);
      setEntryLabel("");
      setEntryAmount("");
      onFlash(isId ? "Pengeluaran dicatat (terenkripsi DPAPI)." : "Expense logged (DPAPI encrypted).");
    } catch (e) {
      onFlash(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const next = await deleteWidgetExpense(id);
      setLedger(next);
    } catch (e) {
      onFlash(String(e));
    }
  };

  const rowCls = isLightMode
    ? "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[9px] border border-black/[0.07] bg-black/[0.02]"
    : "flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-[9px] border border-white/[0.07] bg-white/[0.03]";

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_138px_auto] gap-2 items-end">
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{isId ? "Nama Pengeluaran" : "Expense Label"}</span>
          <input
            type="text"
            value={entryLabel}
            onChange={(e) => setEntryLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddEntry();
              }
            }}
            placeholder={isId ? "Contoh: Kopi Susu" : "Example: Iced Coffee"}
            className={inputCls}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className={labelCls}>{isId ? "Nominal (Rp)" : "Amount (IDR)"}</span>
          <input
            type="number"
            value={entryAmount}
            onChange={(e) => setEntryAmount(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAddEntry();
              }
            }}
            placeholder="25000"
            className={inputCls}
          />
        </label>
        <button
          type="button"
          disabled={busy || !entryLabel.trim() || !entryAmount.trim()}
          onClick={() => void handleAddEntry()}
          className={`${primaryBtn} flex items-center justify-center gap-1.5 disabled:opacity-50`}
        >
          <Plus size={14} /> {isId ? "Catat" : "Log"}
        </button>
      </div>

      {ledger.entries.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-[11px] font-semibold">
            <span className={isLightMode ? "text-neutral-600" : "text-zinc-400"}>
              {isId ? "Catatan Terakhir" : "Recent Entries"} ({ledger.entries.length})
            </span>
            <span className="tabular-nums text-[#ff9f0a]">
              {isId ? "Total:" : "Total:"} {formatIdr(totalSpent)}
            </span>
          </div>
          <div className="flex flex-col gap-1 max-h-[156px] overflow-y-auto pr-0.5">
            {ledger.entries.map((entry) => (
              <div key={entry.id} className={rowCls}>
                <span className="text-[12px] font-medium truncate">{entry.label}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11.5px] font-semibold tabular-nums">
                    {formatIdr(entry.amount_idr)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDelete(entry.id)}
                    title={isId ? "Hapus catatan" : "Delete entry"}
                    className="w-6 h-6 rounded-[6px] flex items-center justify-center text-red-400 hover:bg-red-500/15 cursor-pointer"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <label className="flex flex-col gap-1 pt-2 border-t border-white/[0.06]">
        <span className={labelCls}>
          {isId ? "Anggaran Bulanan (Rupiah)" : "Monthly Budget (IDR)"}
        </span>
        <div className="flex gap-2">
          <input
            type="number"
            value={budgetIdr}
            onChange={(e) => setBudgetIdr(e.target.value)}
            placeholder="3000000"
            className={inputCls}
          />
          <button
            type="button"
            onClick={async () => {
              const num = Number(budgetIdr);
              if (!Number.isFinite(num) || num <= 0) return;
              try {
                await setWidgetExpenseBudget(Math.round(num));
                setLedger((prev) => ({ ...prev, monthly_budget_idr: Math.round(num) }));
                onFlash(
                  isId
                    ? "Anggaran bulanan tersimpan (terenkripsi DPAPI)."
                    : "Monthly budget saved (DPAPI encrypted)."
                );
              } catch (e) {
                onFlash(String(e));
              }
            }}
            className={secondaryBtn}
          >
            {isId ? "Simpan Anggaran" : "Save Budget"}
          </button>
        </div>
      </label>

      <span className={hintCls}>
        <ShieldCheck size={13} className="text-[#34c759]" />{" "}
        {isId
          ? "Data finansial dienkripsi lokal dengan Windows DPAPI, nol telemetri"
          : "Financial data is encrypted locally with Windows DPAPI, zero telemetry"}
      </span>
    </div>
  );
};
