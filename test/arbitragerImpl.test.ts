import type { FormedConfigRootType } from "../src/config";
import type QuoteAggregator from "../src/quoteAggregator";
import type {
  ConfigStore,
  Order,
  Execution } from "../src/types";

import AwaitableEventEmitter from "@bitr/awaitable-event-emitter/dist/AwaitableEventEmitter";
import { expect, spy } from "chai";

import { getActivePairStore } from "../src/activePairLevelStore";
import Arbitrager from "../src/arbitrager";
import { ChronoDB } from "../src/chrono";
import LimitCheckerFactory from "../src/limitCheckerFactory";
import OppotunitySearcher from "../src/opportunitySearcher";
import PairTrader from "../src/pairTrader";
import SingleLegHandler from "../src/singleLegHandler";
import SpreadAnalyzer from "../src/spreadAnalyzer";
import { toQuote } from "../src/util";

const chronoDB = new ChronoDB(`${__dirname}/datastore/1`);
const activePairStore = getActivePairStore(chronoDB);

let quoteAggregator: any,
  config: FormedConfigRootType,
  configStore: any,
  positionMap: any,
  positionService: any,
  baRouter: any,
  spreadAnalyzer: any,
  // @ts-ignore
  quotes: any,
  limitCheckerFactory: any;

describe("Arbitrager", function(){
  this.beforeEach(async () => {
    const aee: QuoteAggregator = new AwaitableEventEmitter() as QuoteAggregator;
    // @ts-expect-error
    aee.start = spy();
    // @ts-expect-error
    aee.stop = spy();
    quoteAggregator = aee;
    config = {
      symbol: "BTC/JPY",
      maxNetExposure: 10.0,
      minSize: 0.005,
      brokers: [
        {
          broker: "Bitflyer",
          cashMarginType: "Cash",
          leverageLevel: 1,
          maxLongPosition: 100,
          maxShortPosition: 100,
          commissionPercent: 0,
        },
        {
          broker: "Coincheck",
          cashMarginType: "MarginOpen",
          leverageLevel: 8,
          maxLongPosition: 100,
          maxShortPosition: 100,
          commissionPercent: 0,
        },
        {
          broker: "Quoine",
          cashMarginType: "NetOut",
          leverageLevel: 9,
          maxLongPosition: 100,
          maxShortPosition: 100,
          commissionPercent: 0,
        },
      ],
    } as FormedConfigRootType;
    configStore = { config } as ConfigStore;
    positionMap = {
      Coincheck: {
        allowedLongSize: 10,
        allowedShortSize: 10,
        longAllowed: true,
        shortAllowed: true,
        baseCcyPosition: 0.1,
      },
      Quoine: {
        allowedLongSize: 10,
        allowedShortSize: 10,
        longAllowed: true,
        shortAllowed: true,
        baseCcyPosition: -0.1,
      },
    };
    positionService = {
      positionMap,
      start: spy(),
      stop: spy(),
      print: spy(),
      isStarted: true,
      netExposure: 0,
    };

    baRouter = {
      send: spy(),
      refresh: spy(),
      cancel: spy(),
      getBtcPosition: spy(),
      fetchQuotes: spy(),
    };

    spreadAnalyzer = {
      analyze: spy(),
    };

    limitCheckerFactory = new LimitCheckerFactory(configStore, positionService);

    quotes = [
      toQuote("Coincheck", "Ask", 3, 1),
      toQuote("Coincheck", "Bid", 2, 2),
      toQuote("Quoine", "Ask", 3.5, 3),
      toQuote("Quoine", "Bid", 2.5, 4),
    ];

    await activePairStore.delAll();
  });

  this.afterEach(async () => {
    await activePairStore.delAll();
  });

  this.afterAll(async () => chronoDB.close());

  it("start/stop", async () => {
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    await arbitrager.start();
    expect(quoteAggregator.listenerCount("quoteUpdated")).to.equal(1);
    expect(arbitrager.status).to.equal("Started");
    await arbitrager.stop();
    expect(arbitrager.status).to.equal("Stopped");
  });

  it("stop without start", async () => {
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    await arbitrager.stop();
    expect(arbitrager.status).to.equal("Stopped");
  });

  it("SpreadAnalyzer throws", async () => {
    config.maxNetExposure = 10;
    spreadAnalyzer.analyze.mockImplementation(() => {
      throw new Error();
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);

    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(spreadAnalyzer.analyze).to.be.called();
    expect(baRouter.send).not.to.be.called();
    expect(arbitrager.status).to.equal("Spread analysis failed");
  });

  it("violate maxNetExposure", async () => {
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 400, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: -100,
        targetVolume: 1,
        targetProfit: -100,
      };
    });
    config.maxNetExposure = 0.1;
    positionService.netExposure = 0.2;
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(spreadAnalyzer.analyze).to.be.called();
    expect(baRouter.send).not.to.be.called();
    expect(arbitrager.status).to.equal("Max exposure breached");
  });

  it("Spread not inverted", async () => {
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 400, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: -100,
        targetVolume: 1,
        targetProfit: -100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(spreadAnalyzer.analyze).to.be.called();
    expect(baRouter.send).not.to.be.called();
    expect(arbitrager.status).to.equal("Spread not inverted");
  });

  it("Too small profit", async () => {
    config.minTargetProfit = 1000;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(baRouter.send).not.to.be.called();
    expect(arbitrager.status).to.equal("Too small profit");
  });

  it("Too small profit by minTargetProfitPercent", async () => {
    config.minTargetProfit = 0;
    config.minTargetProfitPercent = 18.4;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(baRouter.send).not.to.be.called();
    expect(arbitrager.status).to.equal("Too small profit");
  });

  it("Too small profit by minTargetProfit", async () => {
    config.minTargetProfit = 101;
    config.minTargetProfitPercent = 10;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(baRouter.send).not.to.be.called();
    expect(arbitrager.status).to.equal("Too small profit");
  });

  it("Too large profit by maxTargetProfit", async () => {
    config.maxTargetProfit = 99;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(baRouter.send).not.to.be.called();
    expect(arbitrager.status).to.equal("Too large profit");
  });

  it("Too large profit by maxTargetProfitPercent", async () => {
    config.maxTargetProfitPercent = 15;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(baRouter.send).not.to.be.called();
    expect(arbitrager.status).to.equal("Too large profit");
  });

  it("Demo mode", async () => {
    config.maxTargetProfitPercent = 20;
    config.demoMode = true;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(baRouter.send).not.to.be.called();
    expect(arbitrager.status).to.equal("Demo mode");
  });

  it("Send and both orders filled", async () => {
    baRouter.refresh = spy((order: any) => {
      order.status = "Filled";
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("Filled");
    expect(baRouter.refresh).to.be.called.twice;
    expect(baRouter.send).to.be.called.twice;
    expect(baRouter.cancel).not.to.be.called();
  });

  it("Send and both orders filled with different send size", async () => {
    const localChronoDB = new ChronoDB(`${__dirname}/datastore/diff_size`);
    const localActivePairStore = getActivePairStore(localChronoDB);
    baRouter.refresh = spy((order: Order) => {
      order.status = "Filled";
    });
    baRouter.send = spy((order: Order) => {
      if(order.side === "Sell"){
        order.size += 0.0015;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      localActivePairStore
    );
    const trader = new PairTrader(configStore, baRouter, localActivePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("Filled");
    expect(baRouter.refresh).to.be.called.twice;
    expect(baRouter.send).to.be.called.twice;
    expect(baRouter.cancel).to.be.called.exactly(0);
    const all = await localActivePairStore.getAll();
    expect(all.length).to.equal(0);
    await localActivePairStore.delAll();
    await localChronoDB.close();
  });

  it("Send and only buy order filled", async () => {
    baRouter.refresh = (order: Order) => {
      if(order.side === "Buy"){
        order.status = "Filled";
      }
    };
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
  });

  it("Send and only sell order filled", async () => {
    baRouter.refresh = spy((order: Order) => {
      if(order.side === "Sell"){
        order.status = "Filled";
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(6);
    expect(baRouter.send).to.be.called.exactly(2);
    expect(baRouter.cancel).to.be.called.exactly(1);
  });

  it("Send and only sell order filled -> reverse", async () => {
    config.onSingleLeg = { action: "Reverse", actionOnExit: "Reverse", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0;
      if(order.side === "Sell"){
        order.status = "Filled";
        order.filledSize = 1;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(2);
  });

  it("Send and sell order filled and buy order partial filled -> reverse", async () => {
    config.onSingleLeg = { action: "Reverse", actionOnExit: "Reverse", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0.3;
      if(order.side === "Sell"){
        order.status = "Filled";
        order.filledSize = 1;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(2);
  });

  it("Send and sell order unfilled and buy order partial filled -> reverse", async () => {
    config.onSingleLeg = { action: "Reverse", actionOnExit: "Reverse", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0.3;
      if(order.side === "Sell"){
        order.filledSize = 0;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(3);
  });

  it("Send and only buy order filled -> reverse", async () => {
    config.onSingleLeg = { action: "Reverse", actionOnExit: "Reverse", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0;
      if(order.side === "Buy"){
        order.status = "Filled";
        order.filledSize = 1;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(2);
  });

  it("Send and buy order filled and sel order partial filled -> reverse", async () => {
    config.onSingleLeg = { action: "Reverse", actionOnExit: "Reverse", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0.3;
      if(order.side === "Buy"){
        order.status = "Filled";
        order.filledSize = 1;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(2);
  });

  it("Send and buy order unfilled and sel order partial filled -> reverse", async () => {
    config.onSingleLeg = { action: "Reverse", actionOnExit: "Reverse", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0.3;
      if(order.side === "Buy"){
        order.filledSize = 0;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(3);
  });

  it("Send and both orders partial filled -> reverse", async () => {
    config.onSingleLeg = { action: "Reverse", actionOnExit: "Reverse", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0.7;
      if(order.side === "Buy"){
        order.filledSize = 0.2;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(3);
  });

  it("Send and both orders same quantity partial filled -> reverse", async () => {
    config.onSingleLeg = { action: "Reverse", actionOnExit: "Reverse", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0.8;
      if(order.side === "Buy"){
        order.filledSize = 0.8;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(6);
    expect(baRouter.send).to.be.called.exactly(2);
    expect(baRouter.cancel).to.be.called.exactly(2);
  });

  it("Send and both orders unfilled -> reverse", async () => {
    config.onSingleLeg = { action: "Reverse", actionOnExit: "Reverse", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0;
      if(order.side === "Buy"){
        order.filledSize = 0;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(6);
    expect(baRouter.send).to.be.called.exactly(2);
    expect(baRouter.cancel).to.be.called.exactly(2);
  });

  it("Send and only buy order filled -> reverse -> fill", async () => {
    config.onSingleLeg = { action: "Reverse", actionOnExit: "Reverse", options: { limitMovePercent: 10, ttl: 3000 } };
    const fillBuy = async (order: Order) => {
      order.filledSize = 0;
      if(order.side === "Buy"){
        order.status = "Filled";
        order.filledSize = 1;
      }
    };
    let count = 0;
    baRouter.refresh = spy(function(...args: any[]){
      count++;
      if(count === 1 || count === 2){
        // @ts-ignore
        fillBuy.apply(this, args);
      }else{
        args[0].status = "Filled";
      }
    });
    config.maxRetryCount = 1;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(3);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(1);
    baRouter.refresh.mockReset();
  });

  it("Send and only buy order filled -> reverse -> send throws", async () => {
    config.onSingleLeg = { action: "Reverse", actionOnExit: "Reverse", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0;
      if(order.side === "Buy"){
        order.status = "Filled";
        order.filledSize = 1;
      }
    });
    let count = 0;
    baRouter.send = spy(() => {
      count++;
      if(count === 3) throw new Error();
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockReturnValue({
      bid: toQuote("Quoine", "Bid", 600, 4),
      ask: toQuote("Coincheck", "Ask", 500, 1),
      invertedSpread: 100,
      availableVolume: 1,
      targetVolume: 1,
      targetProfit: 100,
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(6);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(1);
    baRouter.send.mockReset();
  });

  it("Send and only sell order filled -> proceed", async () => {
    config.onSingleLeg = { action: "Proceed", actionOnExit: "Proceed", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0;
      if(order.side === "Sell"){
        order.status = "Filled";
        order.filledSize = 1;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(2);
  });

  it("Send and only buy order filled -> proceed", async () => {
    config.onSingleLeg = { action: "Proceed", actionOnExit: "Proceed", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0;
      if(order.side === "Buy"){
        order.status = "Filled";
        order.filledSize = 1;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(2);
  });

  it("Send and buy order filled and sell order partial filled -> proceed", async () => {
    config.onSingleLeg = { action: "Proceed", actionOnExit: "Proceed", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0.3;
      if(order.side === "Buy"){
        order.status = "Filled";
        order.filledSize = 1;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(2);
  });

  it("Send and buy order unfilled and sell order partial filled -> proceed", async () => {
    config.onSingleLeg = { action: "Proceed", actionOnExit: "Proceed", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0.3;
      if(order.side === "Buy"){
        order.filledSize = 0;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(3);
  });

  it("Send and both orders partial filled -> proceed", async () => {
    config.onSingleLeg = { action: "Proceed", actionOnExit: "Proceed", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0.7;
      if(order.side === "Buy"){
        order.filledSize = 0.2;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(7);
    expect(baRouter.send).to.be.called.exactly(3);
    expect(baRouter.cancel).to.be.called.exactly(3);
  });

  it("Send and both orders same quantity partial filled -> proceed", async () => {
    config.onSingleLeg = { action: "Proceed", actionOnExit: "Proceed", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0.8;
      if(order.side === "Buy"){
        order.filledSize = 0.8;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(6);
    expect(baRouter.send).to.be.called.exactly(2);
    expect(baRouter.cancel).to.be.called.exactly(2);
  });

  it("Send and both orders unfilled -> proceed", async () => {
    config.onSingleLeg = { action: "Proceed", actionOnExit: "Proceed", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0;
      if(order.side === "Buy"){
        order.filledSize = 0;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
    expect(baRouter.refresh).to.be.called.exactly(6);
    expect(baRouter.send).to.be.called.exactly(2);
    expect(baRouter.cancel).to.be.called.exactly(2);
  });

  it("Send and only buy order filled -> invalid action", async () => {
    config.onSingleLeg = { action: "Cancel", actionOnExit: "Cancel", options: { limitMovePercent: 10, ttl: 3000 } };
    baRouter.refresh = spy(async (order: Order) => {
      order.filledSize = 0;
      if(order.side === "Buy"){
        order.status = "Filled";
        order.filledSize = 1;
      }
    });
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("Order send/refresh failed");
    expect(baRouter.refresh).to.be.called.exactly(6);
    expect(baRouter.send).to.be.called.exactly(2);
    expect(baRouter.cancel).to.be.called.exactly(1);
  });

  it("Send and not filled", async () => {
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
  });

  it("Send throws", async () => {
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    baRouter.send = () => {
      throw new Error("Mock refresh error.");
    };
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("Order send/refresh failed");
  });

  it("Send throws", async () => {
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    baRouter.send = () => {
      throw new Error("Mock error: insufficient balance");
    };
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager["shouldStop"]).to.equal(true);
  });

  it("Send and refresh throws", async () => {
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    baRouter.refresh = () => {
      throw new Error("Mock refresh error.");
    };
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("MaxRetryCount breached");
  });

  it("Send and filled", async () => {
    baRouter.refresh.mockImplementation((order: Order) => order.status = "Filled");
    config.maxRetryCount = 3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("Filled");
  });

  it("Send and filled with commission", async () => {
    baRouter.refresh.mockImplementation((order: Order) => order.status = "Filled");
    config.maxRetryCount = 3;
    config.brokers[0].commissionPercent = 0.1;
    config.brokers[1].commissionPercent = 0.2;
    config.brokers[2].commissionPercent = 0.3;
    spreadAnalyzer.analyze.mockImplementation(() => {
      return {
        bid: toQuote("Quoine", "Bid", 600, 4),
        ask: toQuote("Coincheck", "Ask", 500, 1),
        invertedSpread: 100,
        availableVolume: 1,
        targetVolume: 1,
        targetProfit: 100,
      };
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("Filled");
  });

  it("Close filled orders", async () => {
    const localQuotes = [
      toQuote("Quoine", "Ask", 700, 4),
      toQuote("Quoine", "Bid", 600, 4),
      toQuote("Coincheck", "Ask", 500, 1),
      toQuote("Coincheck", "Bid", 400, 1),
    ];
    baRouter.refresh.mockImplementation((order: Order) => order.status = "Filled");
    config.maxRetryCount = 3;
    config.minTargetProfit = 50;
    config.minExitTargetProfit = -1000;
    const localSpreadAnalyzer = new SpreadAnalyzer(configStore);
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      localSpreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(1);
    // closing
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Closed");
    expect((await activePairStore.getAll()).length).to.equal(0);
  });

  it("Close two sets of filled orders", async () => {
    const localQuotes = [
      toQuote("Quoine", "Ask", 700, 4),
      toQuote("Quoine", "Bid", 600, 4),
      toQuote("Coincheck", "Ask", 500, 1),
      toQuote("Coincheck", "Bid", 400, 1),
    ];
    const localQuotes2 = [
      toQuote("Quoine", "Bid", 601, 4),
      toQuote("Coincheck", "Ask", 501, 1),
    ];
    baRouter.refresh.mockImplementation((order: Order) => order.status = "Filled");
    config.maxRetryCount = 3;
    config.minTargetProfit = 50;
    config.minExitTargetProfit = -1000;
    const localSpreadAnalyzer = new SpreadAnalyzer(configStore);
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      localSpreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();

    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(1);

    await quoteAggregator.emitParallel("quoteUpdated", localQuotes2);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(2);
 
    // closing
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Closed");
    const pairs = await activePairStore.getAll();
    expect(pairs.length).to.equal(1);
    expect(pairs[0].value[0].price).to.equal(501);
 
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Closed");
    expect((await activePairStore.getAll()).length).to.equal(0);
  });

  it("Close filled orders with minExitTargetProfitPercent", async () => {
    const localQuotes = [
      toQuote("Quoine", "Ask", 700, 4),
      toQuote("Quoine", "Bid", 600, 4),
      toQuote("Coincheck", "Ask", 500, 1),
      toQuote("Coincheck", "Bid", 400, 1),
    ];
    baRouter.refresh.mockImplementation((order: Order) => order.status = "Filled");
    config.maxRetryCount = 3;
    config.minTargetProfit = 50;
    config.minExitTargetProfitPercent = -80;
    const localSpreadAnalyzer = new SpreadAnalyzer(configStore);
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      localSpreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(1);
    // closing
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Closed");
    expect((await activePairStore.getAll()).length).to.equal(0);
  });

  it("Not close filled orders with minExitTargetProfitPercent", async () => {
    const localQuotes = [
      toQuote("Quoine", "Ask", 700, 4),
      toQuote("Quoine", "Bid", 600, 4),
      toQuote("Coincheck", "Ask", 500, 1),
      toQuote("Coincheck", "Bid", 400, 1),
    ];
    baRouter.refresh.mockImplementation((order: Order) => order.status = "Filled");
    config.maxRetryCount = 3;
    config.minTargetProfit = 50;
    config.minExitTargetProfitPercent = -20;
    const localSpreadAnalyzer = new SpreadAnalyzer(configStore);
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      localSpreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(1);
    // closing
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(2);
  });

  it("Close two filled orders", async () => {
    const localQuotes = [
      toQuote("Quoine", "Ask", 700, 4),
      toQuote("Quoine", "Bid", 600, 4),
      toQuote("Coincheck", "Ask", 500, 1),
      toQuote("Coincheck", "Bid", 400, 1),
    ];
    baRouter.refresh.mockImplementation((order: Order) => order.status = "Filled");
    config.maxRetryCount = 3;
    config.minTargetProfit = 50;
    config.minExitTargetProfit = -200;
    const localSpreadAnalyzer = new SpreadAnalyzer(configStore);
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      localSpreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(1);
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(2);

    //closing
    const localQuotes2 = [
      toQuote("Quoine", "Ask", 620, 4),
      toQuote("Quoine", "Bid", 600, 4),
      toQuote("Coincheck", "Ask", 500, 1),
      toQuote("Coincheck", "Bid", 450, 1),
    ];
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes2);
    expect(arbitrager.status).to.equal("Closed");
    expect((await activePairStore.getAll()).length).to.equal(1);
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes2);
    expect(arbitrager.status).to.equal("Closed");
    expect((await activePairStore.getAll()).length).to.equal(0);
  });

  it("Closing filled orders with no lastResult in spread analyzer", async () => {
    const localQuotes = [
      toQuote("Quoine", "Ask", 700, 4),
      toQuote("Quoine", "Bid", 600, 4),
      toQuote("Coincheck", "Ask", 500, 1),
      toQuote("Coincheck", "Bid", 400, 1),
    ];
    baRouter.refresh.mockImplementation((order: Order) => order.status = "Filled");
    config.maxRetryCount = 3;
    config.minTargetProfit = 50;
    config.minExitTargetProfit = -1000;
    const localSpreadAnalyzer = new SpreadAnalyzer(configStore);
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      localSpreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(1);
    // closing
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Closed");
    expect((await activePairStore.getAll()).length).to.equal(0);
  });

  it("Closing filled orders when spread analyzer throws", async () => {
    const localQuotes = [
      toQuote("Quoine", "Ask", 700, 4),
      toQuote("Quoine", "Bid", 600, 4),
      toQuote("Coincheck", "Ask", 500, 1),
      toQuote("Coincheck", "Bid", 400, 1),
    ];
    baRouter.refresh.mockImplementation((order: Order) => order.status = "Filled");
    config.maxRetryCount = 3;
    config.minTargetProfit = 50;
    config.minExitTargetProfit = -1000;
    const localSpreadAnalyzer = new SpreadAnalyzer(configStore);
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      localSpreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(1);
    // closing
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("Spread analysis failed");
    expect((await activePairStore.getAll()).length).to.equal(1);
  });

  it("Not close filled orders with maxTargetVolumePercent", async () => {
    const originalRefresh = baRouter.refresh;
    baRouter.refresh = spy((order: Order) => order.status = "Filled");
    config.maxRetryCount = 3;
    config.minTargetProfit = 50;
    config.minExitTargetProfit = -1000;
    config.maxTargetVolumePercent = 50.0;
    let count = 0;
    spreadAnalyzer.analyze = spy(() => {
      count++;
      if(count === 1){
        return {
          bid: toQuote("Quoine", "Bid", 600, 3),
          ask: toQuote("Coincheck", "Ask", 500, 1),
          invertedSpread: 100,
          availableVolume: 2,
          targetVolume: 1,
          targetProfit: 100,
        };
      }else{
        return {
          bid: toQuote("Quoine", "Bid", 700, 2),
          ask: toQuote("Coincheck", "Ask", 400, 1),
          invertedSpread: 300,
          availableVolume: 1,
          targetVolume: 1,
          targetProfit: 100,
        };
      }
    });
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      spreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(1);
    // closing
    await quoteAggregator.emitParallel("quoteUpdated", []);
    expect(arbitrager.status).to.equal("Too large Volume");
    expect((await activePairStore.getAll()).length).to.equal(1);

    baRouter.refresh = originalRefresh;
  });

  it("Close filled orders with exitNetProfitRatio", async () => {
    const localQuotes = [
      toQuote("Quoine", "Ask", 700, 4),
      toQuote("Quoine", "Bid", 600, 4),
      toQuote("Coincheck", "Ask", 500, 1),
      toQuote("Coincheck", "Bid", 400, 1),
    ];
    baRouter.refresh.mockImplementation((order: Order) => {
      order.status = "Filled";
      order.filledSize = order.size;
      order.executions = [{ price: order.price, size: order.size } as Execution];
    });
    config.maxRetryCount = 3;
    config.minTargetProfit = 50;
    config.exitNetProfitRatio = -200;
    const localSpreadAnalyzer = new SpreadAnalyzer(configStore);
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      localSpreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(1);
    // closing
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Closed");
    expect((await activePairStore.getAll()).length).to.equal(0);
  });

  it("Not close filled orders with exitNetProfitRatio", async () => {
    const localQuotes = [
      toQuote("Quoine", "Ask", 700, 4),
      toQuote("Quoine", "Bid", 600, 4),
      toQuote("Coincheck", "Ask", 500, 1),
      toQuote("Coincheck", "Bid", 400, 1),
    ];
    baRouter.refresh.mockImplementation((order: Order) => {
      order.status = "Filled";
      order.filledSize = order.size;
      order.executions = [{ price: order.price, size: order.size } as Execution];
    });
    config.maxRetryCount = 3;
    config.minTargetProfit = 50;
    config.exitNetProfitRatio = -199;
    const localSpreadAnalyzer = new SpreadAnalyzer(configStore);
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      localSpreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(1);
    // Not closing
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(2);
  });

  it("Not close filled orders with exitNetProfitRatio and commission", async () => {
    const localQuotes = [
      toQuote("Quoine", "Ask", 700, 4),
      toQuote("Quoine", "Bid", 600, 4),
      toQuote("Coincheck", "Ask", 500, 1),
      toQuote("Coincheck", "Bid", 400, 1),
    ];
    baRouter.refresh.mockImplementation((order: Order) => {
      order.status = "Filled";
      order.filledSize = order.size;
      order.executions = [{ price: order.price, size: order.size } as Execution];
    });
    config.maxRetryCount = 3;
    config.minTargetProfit = 50;
    config.exitNetProfitRatio = 399;
    config.brokers[0].commissionPercent = 0.15;
    config.brokers[1].commissionPercent = 0.15;
    const localSpreadAnalyzer = new SpreadAnalyzer(configStore);
    const searcher = new OppotunitySearcher(
      configStore,
      positionService,
      localSpreadAnalyzer,
      limitCheckerFactory,
      activePairStore
    );
    const trader = new PairTrader(configStore, baRouter, activePairStore, new SingleLegHandler(baRouter, configStore));
    const arbitrager = new Arbitrager(quoteAggregator, configStore, positionService, searcher, trader);
    positionService.isStarted = true;
    await arbitrager.start();
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(1);
    // Not closing
    await quoteAggregator.emitParallel("quoteUpdated", localQuotes);
    expect(arbitrager.status).to.equal("Filled");
    expect((await activePairStore.getAll()).length).to.equal(2);
  });
});
