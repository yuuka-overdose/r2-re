import type {
  SpreadAnalysisResult,
  Quote,
  OrderPair,
  OrderType } from "./types";

import { EventEmitter } from "events";

import { getLogger } from "@bitr/logger";
import { injectable, inject } from "inversify";
import _ from "lodash";

import BrokerAdapterRouter from "./brokerAdapterRouter";
import { findBrokerConfig } from "./config";
import t from "./i18n";
import OrderImpl from "./orderImpl";
import * as OrderUtil from "./orderUtil";
import { calcProfit } from "./pnl";
import SingleLegHandler from "./singleLegHandler";
import symbols from "./symbols";
import {
  ConfigStore,
  ActivePairStore
} from "./types";
import { delay, formatQuote } from "./util";

@injectable()
export default class PairTrader extends EventEmitter {
  private readonly log = getLogger(this.constructor.name);

  constructor(
    @inject(symbols.ConfigStore) private readonly configStore: ConfigStore,
    private readonly brokerAdapterRouter: BrokerAdapterRouter,
    @inject(symbols.ActivePairStore) private readonly activePairStore: ActivePairStore,
    private readonly singleLegHandler: SingleLegHandler
  ) {
    super();
  }

  set status(value: string) {
    this.emit("status", value);
  }

  async trade(spreadAnalysisResult: SpreadAnalysisResult, closable: boolean): Promise<void> {
    const { bid, ask, targetVolume } = spreadAnalysisResult;
    const sendTasks = [ask, bid].map(q => this.sendOrder(q, targetVolume, "Limit"));
    const orders = await Promise.all(sendTasks);
    this.status = "Sent";
    await this.checkOrderState(orders, closable);
  }

  private async checkOrderState(orders: OrderImpl[], closable: boolean): Promise<void> {
    const { config } = this.configStore;
    for(const i of _.range(1, config.maxRetryCount + 1)){
      await delay(config.orderStatusCheckInterval);
      this.log.info(t`OrderCheckAttempt`, i);
      this.log.info(t`CheckingIfBothLegsAreDoneOrNot`);
      try{
        const refreshTasks = orders.map(o => this.brokerAdapterRouter.refresh(o));
        await Promise.all(refreshTasks);
      } catch(ex){
        this.log.warn(ex.message);
        this.log.debug(ex.stack);
      }

      this.printOrderSummary(orders);

      if(orders.every(o => o.filled)){
        this.log.info(t`BothLegsAreSuccessfullyFilled`);
        if(closable){
          this.status = "Closed";
        }else{
          this.status = "Filled";
          if(orders[0].size === orders[1].size){
            this.log.debug(`Putting pair ${JSON.stringify(orders)}.`);
            await this.activePairStore.put(orders as OrderPair);
          }
        }
        this.printProfit(orders);
        break;
      }

      if(i === config.maxRetryCount){
        this.status = "MaxRetryCount breached";
        this.log.warn(t`MaxRetryCountReachedCancellingThePendingOrders`);
        const cancelTasks = orders.filter(o => !o.filled).map(o => this.brokerAdapterRouter.cancel(o));
        await Promise.all(cancelTasks);
        if(
          orders.some(o => !o.filled)
          && _(orders).sumBy(o => o.filledSize * (o.side === "Buy" ? -1 : 1)) !== 0
        ){
          const subOrders = await this.singleLegHandler.handle(orders as OrderPair, closable);
          if(subOrders.length !== 0 && subOrders.every(o => o.filled)){
            this.printProfit(_.concat(orders, subOrders));
          }
        }
        break;
      }
    }
  }

  private async sendOrder(quote: Quote, targetVolume: number, orderType: OrderType): Promise<OrderImpl> {
    this.log.info(t`SendingOrderTargettingQuote`, formatQuote(quote));
    const brokerConfig = findBrokerConfig(quote.broker);
    const { config } = this.configStore;
    const { cashMarginType, leverageLevel } = brokerConfig;
    const orderSide = quote.side === "Ask" ? "Buy" : "Sell";
    const orderPrice
     = quote.side === "Ask" && config.acceptablePriceRange !== undefined
       ? _.round(quote.price * (1 + config.acceptablePriceRange / 100))
       : quote.side === "Bid" && config.acceptablePriceRange !== undefined
         ? _.round(quote.price * (1 - config.acceptablePriceRange / 100))
         : quote.price;
    const order = new OrderImpl({
      symbol: this.configStore.config.symbol,
      broker: quote.broker,
      side: orderSide,
      size: targetVolume,
      price: orderPrice,
      cashMarginType,
      type: orderType,
      leverageLevel,
    });
    await this.brokerAdapterRouter.send(order);
    return order;
  }

  private printOrderSummary(orders: OrderImpl[]) {
    orders.forEach(o => {
      if(o.filled){
        this.log.info(OrderUtil.toExecSummary(o));
      }else{
        this.log.warn(OrderUtil.toExecSummary(o));
      }
    });
  }

  private printProfit(orders: OrderImpl[]): void {
    const { profit, commission } = calcProfit(orders);
    this.log.info(t`ProfitIs`, _.round(profit));
    if(commission !== 0){
      this.log.info(t`CommissionIs`, _.round(commission));
    }
  }
} /* istanbul ignore next */
