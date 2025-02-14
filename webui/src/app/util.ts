import type { Order } from "./types";

import * as _ from "lodash";

export function getAverageFilledPrice(order: Order) {
  return _.isEmpty(order.executions)
    ? 0
    : _.sumBy(order.executions, x => x.size * x.price) / _.sumBy(order.executions, x => x.size);
}

// eslint-disable-next-line @typescript-eslint/ban-types
export function revive<T, K>(T: Function, o: K): T {
  const newObject = Object.create(T.prototype);
  return Object.assign(newObject, o) as T;
}

export function eRound(n: number): number {
  return _.round(n, 10);
}

export function splitSymbol(symbol: string): { baseCcy: string, quoteCcy: string } {
  const [baseCcy, quoteCcy] = symbol.split("/");
  return { baseCcy, quoteCcy };
}

