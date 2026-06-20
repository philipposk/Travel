// Group trips + Splitwise-style expense splitter.
// All persistence in Firestore. Functions exposed are pure logic;
// CRUD wiring lives in index.ts (createGroupTrip, addExpense, etc.).

export interface GroupMember {
  uid: string;
  displayName: string;
  email: string;
  role: "owner" | "editor" | "viewer";
  joinedAt: string;
}

export interface GroupTrip {
  id: string;
  name: string;
  destination: string;
  startDate: string;
  endDate: string;
  ownerUid: string;
  members: GroupMember[];
  baseCurrency: string;
  itineraryId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  tripId: string;
  paidBy: string;            // uid
  description: string;
  amount: number;
  currency: string;
  amountBaseCurrency: number; // after FX
  splitMethod: "equal" | "shares" | "exact" | "percent";
  splits: Array<{ uid: string; share: number }>; // shares/percent/exact value
  category?: string;
  date: string;
  createdAt: string;
}

export interface Balance {
  uid: string;
  net: number; // positive = owed, negative = owes
}

export interface Settlement {
  from: string; // uid who pays
  to: string;   // uid who receives
  amount: number;
}

// Compute per-member net balance in trip base currency.
export function computeBalances(members: GroupMember[], expenses: Expense[]): Balance[] {
  const totals = new Map<string, number>();
  for (const m of members) totals.set(m.uid, 0);

  for (const e of expenses) {
    // Payer receives full amount as credit
    totals.set(e.paidBy, (totals.get(e.paidBy) || 0) + e.amountBaseCurrency);

    // Each participant owes their share
    const shares = resolveShares(e);
    for (const [uid, owed] of shares) {
      totals.set(uid, (totals.get(uid) || 0) - owed);
    }
  }

  return Array.from(totals, ([uid, net]) => ({ uid, net: round2(net) }));
}

function resolveShares(e: Expense): Map<string, number> {
  const out = new Map<string, number>();
  const total = e.amountBaseCurrency;
  const splits = e.splits || [];
  if (!splits.length) return out; // nothing to split → no debt (avoids /0 → NaN)

  if (e.splitMethod === "equal") {
    const each = total / splits.length;
    for (const s of splits) out.set(s.uid, each);
  } else if (e.splitMethod === "percent") {
    for (const s of splits) out.set(s.uid, total * (s.share / 100));
  } else if (e.splitMethod === "shares") {
    const sum = splits.reduce((x, y) => x + y.share, 0);
    // A non-positive share sum is invalid; fall back to an equal split rather
    // than dumping the whole amount on the first member (the old `|| 1` bug).
    if (sum > 0) {
      for (const s of splits) out.set(s.uid, total * (s.share / sum));
    } else {
      const each = total / splits.length;
      for (const s of splits) out.set(s.uid, each);
    }
  } else if (e.splitMethod === "exact") {
    // Exact amounts may not sum to the expense total; scale them so balances
    // still net to zero and settlements reconcile.
    const sum = splits.reduce((x, y) => x + y.share, 0);
    if (sum > 0 && Math.abs(sum - total) > 0.005) {
      const k = total / sum;
      for (const s of splits) out.set(s.uid, s.share * k);
    } else {
      for (const s of splits) out.set(s.uid, s.share);
    }
  }
  return out;
}

function round2(n: number): number { return Math.round(n * 100) / 100; }

// Minimize transactions for settle-up (greedy creditor/debtor matching).
export function minimalSettlements(balances: Balance[]): Settlement[] {
  const debtors = balances
    .filter((b) => b.net < -0.005)
    .map((b) => ({ ...b, remaining: -b.net }))
    .sort((a, b) => b.remaining - a.remaining);
  const creditors = balances
    .filter((b) => b.net > 0.005)
    .map((b) => ({ ...b, remaining: b.net }))
    .sort((a, b) => b.remaining - a.remaining);

  const out: Settlement[] = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].remaining, creditors[j].remaining);
    out.push({ from: debtors[i].uid, to: creditors[j].uid, amount: round2(pay) });
    debtors[i].remaining -= pay;
    creditors[j].remaining -= pay;
    if (debtors[i].remaining < 0.005) i++;
    if (creditors[j].remaining < 0.005) j++;
  }
  return out;
}
