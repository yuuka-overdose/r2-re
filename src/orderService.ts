import type { OrderInit } from "./orderImpl";

import { EventEmitter } from "events";

import { injectable, inject } from "inversify";
import _ from "lodash";

import OrderImpl from "./orderImpl";
import symbols from "./symbols";
import { HistoricalOrderStore } from "./types";


@injectable()
export default class OrderService extends EventEmitter {
  orders: OrderImpl[] = [];

  constructor(@inject(symbols.HistoricalOrderStore) private readonly historicalOrderStore: HistoricalOrderStore) {
    super();
  }

  createOrder(init: OrderInit): OrderImpl {
    const order = new OrderImpl(init);
    this.orders.push(order);
    this.emit("orderCreated", order);
    return order;
  }

  emitOrderUpdated(order: OrderImpl) {
    this.emit("orderUpdated", order);
  }

  async finalizeOrder(order: OrderImpl): Promise<void> {
    await this.historicalOrderStore.put(order);
    _.pull(this.orders, order);
    this.emit("orderFinalized", order);
  }
} /* istanbul ignore next */
