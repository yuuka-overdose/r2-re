import type { OrderBooksResponse, CashMarginTypeStrategy } from "./types";
import type { BrokerConfigType } from "../config";
import type {
  Order,
  Execution,
  BrokerAdapter,
  Quote
} from "../types";
import type { CashMarginType } from "../types";

import { addMinutes } from "date-fns";
import _ from "lodash";
import "dotenv/config";

import BrokerApi from "./BrokerApi";
import CashStrategy from "./CashStrategy";
import MarginOpenStrategy from "./MarginOpenStrategy";
import NetOutStrategy from "./NetOutStrategy";
import { getLogger } from "../logger";
import { eRound, almostEqual, toExecution, toQuote } from "../util";

export default class BrokerAdapterImpl implements BrokerAdapter {
  private readonly brokerApi: BrokerApi;
  private readonly logger = getLogger("Coincheck.BrokerAdapter");
  readonly broker = "Coincheck";
  readonly strategyMap: Map<CashMarginType, CashMarginTypeStrategy>;

  constructor(private readonly config: BrokerConfigType) {
    this.brokerApi = new BrokerApi(process.env.COINCHECK_TOKEN, process.env.COINCHECK_SECRET);
    this.strategyMap = new Map<CashMarginType, CashMarginTypeStrategy>([
      ["Cash", new CashStrategy(this.brokerApi)],
      ["MarginOpen", new MarginOpenStrategy(this.brokerApi)],
      ["NetOut", new NetOutStrategy(this.brokerApi)],
    ]);
  }

  async getBtcPosition(): Promise<number> {
    const strategy = this.strategyMap.get(this.config.cashMarginType);
    if(strategy === undefined){
      throw new Error(`Unable to find a strategy for ${this.config.cashMarginType}.`);
    }
    return strategy.getBtcPosition();
  }

  async fetchQuotes(): Promise<Quote[]> {
    const response = await this.brokerApi.getOrderBooks();
    return this.mapToQuote(response);
  }

  private mapToQuote(orderBooksResponse: OrderBooksResponse): Quote[] {
    const asks = _(orderBooksResponse.asks)
      .take(100)
      .map(q => toQuote(this.broker, "Ask", q[0], q[1]))
      .value();
    const bids = _(orderBooksResponse.bids)
      .take(100)
      .map(q => toQuote(this.broker, "Bid", q[0], q[1]))
      .value();
    return _.concat(asks, bids);
  }

  async send(order: Order): Promise<void> {
    if(order.broker !== this.broker){
      throw new Error();
    }
    const strategy = this.strategyMap.get(order.cashMarginType);
    if(strategy === undefined){
      throw new Error(`Unable to find a strategy for ${order.cashMarginType}.`);
    }
    await strategy.send(order);
  }

  async cancel(order: Order): Promise<void> {
    const orderId = order.brokerOrderId;
    const reply = await this.brokerApi.cancelOrder(orderId);
    if(!reply.success){
      throw new Error(`Cancel ${orderId} failed.`);
    }
    order.lastUpdated = new Date();
    order.status = "Canceled";
  }

  async refresh(order: Order): Promise<void> {
    const reply = await this.brokerApi.getOpenOrders();
    const brokerOrder = _.find(reply.orders, o => o.id === order.brokerOrderId);
    if(brokerOrder !== undefined){
      if(brokerOrder.pending_amount === undefined || brokerOrder.pending_amount === 0){
        throw new Error("Unexpected reply returned.");
      }
      order.filledSize = eRound(order.size - brokerOrder.pending_amount);
      if(order.filledSize > 0){
        order.status = "PartiallyFilled";
      }
      order.lastUpdated = new Date();
      return;
    }
    const from = addMinutes(order.creationTime, -1);
    const transactions = (await this.brokerApi.getTransactionsWithStartDate(from)).filter(
      x => x.order_id === order.brokerOrderId
    );
    if(transactions.length === 0){
      this.logger.warn("The order is not found in pending orders and historical orders.");
      return;
    }
    order.executions = transactions.map(x => {
      const execution = toExecution(order);
      execution.execTime = x.created_at;
      execution.price = x.rate;
      execution.size = Math.abs(x.funds.btc);
      return execution as Execution;
    });
    order.filledSize = eRound(_.sumBy(order.executions, x => x.size));
    order.status = almostEqual(order.filledSize, order.size, 1) ? "Filled" : "Canceled";
    order.lastUpdated = new Date();
  }
} /* istanbul ignore next */
