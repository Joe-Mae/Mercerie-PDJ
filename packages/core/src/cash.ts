import { assertNonNegativeXof, subtractXof, sumXof, type Xof } from './money';
import type { PaymentInput } from './pricing';

export interface CashTotalsInput {
  readonly openingFloat: Xof;
  readonly cashSales: Xof;
  readonly cashRefunds: Xof;
  readonly deposits: Xof;
  readonly withdrawals: Xof;
}

export function expectedCash(input: CashTotalsInput): Xof {
  assertNonNegativeXof(input.openingFloat, 'Le fond de caisse');
  assertNonNegativeXof(input.cashSales, 'Les ventes en espèces');
  assertNonNegativeXof(input.cashRefunds, 'Les remboursements en espèces');
  assertNonNegativeXof(input.deposits, 'Les dépôts');
  assertNonNegativeXof(input.withdrawals, 'Les retraits');

  const inflows = sumXof([input.openingFloat, input.cashSales, input.deposits]);
  const outflows = sumXof([input.cashRefunds, input.withdrawals]);

  return subtractXof(inflows, outflows);
}

// Montants appliqués à la vente, et non l’espèce tendue par le client.
export function cashFromPayments(payments: readonly PaymentInput[]): Xof {
  const cashPayments = payments
    .filter((payment) => payment.method === 'cash')
    .map((payment) => {
      assertNonNegativeXof(payment.amountXof, 'Un paiement en espèces');
      return payment.amountXof;
    });

  return sumXof(cashPayments);
}

export function cashGap(countedXof: Xof, expectedXof: Xof): Xof {
  assertNonNegativeXof(countedXof, 'Le montant compté');
  return subtractXof(countedXof, expectedXof);
}

export function hasCashGap(gapXof: Xof): boolean {
  return gapXof !== 0;
}
