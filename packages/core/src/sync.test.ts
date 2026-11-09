import { describe, expect, it } from 'vitest';
import { DomainError } from './errors';
import {
  dedupeById,
  filterNewOperations,
  markApplied,
  orderOperations,
  syncStatusLabel,
  type OutboxOperation,
} from './sync';

function operation(
  id: string,
  deviceId = 'device-a',
  deviceSequence = 1,
  occurredAt = '2026-11-07T10:00:00.000Z',
): OutboxOperation {
  return { id, deviceId, deviceSequence, occurredAt };
}

describe('file d’attente hors ligne', () => {
  it('supprime les doublons par identifiant', () => {
    const result = dedupeById([
      operation('a', 'device-a', 1),
      operation('b', 'device-a', 2),
      operation('a', 'device-a', 1),
    ]);

    expect(result.unique.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.duplicates.map((item) => item.id)).toEqual(['a']);
  });

  it('remet les opérations d’un appareil dans l’ordre', () => {
    const ordered = orderOperations([
      operation('c', 'device-a', 3),
      operation('a', 'device-a', 1),
      operation('b', 'device-a', 2),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('groupe les appareils et conserve leur ordre d’apparition', () => {
    const ordered = orderOperations([
      operation('b1', 'device-b', 1),
      operation('a2', 'device-a', 2),
      operation('a1', 'device-a', 1),
      operation('b2', 'device-b', 2),
    ]);

    expect(ordered.map((item) => item.id)).toEqual(['b1', 'b2', 'a1', 'a2']);
  });

  it('refuse deux opérations différentes avec la même séquence', () => {
    expect(() =>
      orderOperations([operation('a', 'device-a', 1), operation('b', 'device-a', 1)]),
    ).toThrow(DomainError);
  });

  it('refuse les opérations invalides', () => {
    expect(() => orderOperations([operation('', 'device-a', 1)])).toThrow(DomainError);
    expect(() => orderOperations([operation('a', '   ', 1)])).toThrow(DomainError);
    expect(() => orderOperations([operation('a', 'device-a', 0)])).toThrow(DomainError);
    expect(() => orderOperations([operation('a', 'device-a', 1, 'pas-une-date')])).toThrow(
      DomainError,
    );
  });

  it('filtre les opérations déjà appliquées', () => {
    const applied = new Set(['b']);
    const remaining = filterNewOperations(
      [operation('c', 'device-a', 3), operation('b', 'device-a', 2), operation('a', 'device-a', 1)],
      applied,
    );

    expect(remaining.map((item) => item.id)).toEqual(['a', 'c']);
  });

  it('marque une opération une seule fois', () => {
    const applied = new Set<string>();

    expect(markApplied(applied, 'a')).toBe(true);
    expect(markApplied(applied, 'a')).toBe(false);
  });
});

describe('indicateur de synchronisation', () => {
  it('affiche un libellé clair', () => {
    expect(syncStatusLabel(0)).toBe('À jour');
    expect(syncStatusLabel(1)).toBe('1 opération en attente');
    expect(syncStatusLabel(3)).toBe('3 opérations en attente');
  });

  it('refuse un nombre invalide', () => {
    expect(() => syncStatusLabel(-1)).toThrow(DomainError);
    expect(() => syncStatusLabel(1.5)).toThrow(DomainError);
  });
});
