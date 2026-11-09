import { formatXof, xof } from '@mercerie/core';

export function money(value: number): string {
  return formatXof(xof(value));
}
