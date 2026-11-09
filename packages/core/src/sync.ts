import { DomainError } from './errors';

export interface OutboxOperation {
  readonly id: string;
  readonly deviceId: string;
  readonly deviceSequence: number;
  readonly occurredAt: string;
}

export interface DedupeResult<T> {
  readonly unique: T[];
  readonly duplicates: T[];
}

function assertOperation(operation: OutboxOperation): void {
  if (!operation.id.trim()) {
    throw new DomainError('Une opération sans identifiant ne peut pas être synchronisée.');
  }

  if (!operation.deviceId.trim()) {
    throw new DomainError('Une opération doit indiquer l’appareil qui l’a créée.');
  }

  if (!Number.isSafeInteger(operation.deviceSequence) || operation.deviceSequence <= 0) {
    throw new DomainError('Le numéro de séquence d’une opération doit être un entier positif.');
  }

  if (Number.isNaN(Date.parse(operation.occurredAt))) {
    throw new DomainError('La date d’une opération est invalide.');
  }
}

export function dedupeById<T extends { readonly id: string }>(
  items: readonly T[],
): DedupeResult<T> {
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicates: T[] = [];

  for (const item of items) {
    if (seen.has(item.id)) {
      duplicates.push(item);
      continue;
    }

    seen.add(item.id);
    unique.push(item);
  }

  return { unique, duplicates };
}

export function orderOperations<T extends OutboxOperation>(operations: readonly T[]): T[] {
  const { unique } = dedupeById(operations);
  const groups = new Map<string, T[]>();

  for (const operation of unique) {
    assertOperation(operation);
    const group = groups.get(operation.deviceId);

    if (group) {
      group.push(operation);
    } else {
      groups.set(operation.deviceId, [operation]);
    }
  }

  const ordered: T[] = [];

  for (const group of groups.values()) {
    group.sort((left, right) => left.deviceSequence - right.deviceSequence);

    let lastSequence: number | null = null;

    for (const operation of group) {
      if (lastSequence !== null && operation.deviceSequence === lastSequence) {
        throw new DomainError(
          'Deux opérations différentes portent le même numéro de séquence sur un appareil.',
        );
      }

      lastSequence = operation.deviceSequence;
    }

    ordered.push(...group);
  }

  return ordered;
}

export function filterNewOperations<T extends OutboxOperation>(
  operations: readonly T[],
  appliedIds: ReadonlySet<string>,
): T[] {
  return orderOperations(operations).filter((operation) => !appliedIds.has(operation.id));
}

export function markApplied(appliedIds: Set<string>, operationId: string): boolean {
  if (appliedIds.has(operationId)) {
    return false;
  }

  appliedIds.add(operationId);
  return true;
}

export function syncStatusLabel(pendingCount: number): string {
  if (!Number.isSafeInteger(pendingCount) || pendingCount < 0) {
    throw new DomainError('Le nombre d’opérations en attente est invalide.');
  }

  if (pendingCount === 0) {
    return 'À jour';
  }

  if (pendingCount === 1) {
    return '1 opération en attente';
  }

  return `${pendingCount} opérations en attente`;
}
