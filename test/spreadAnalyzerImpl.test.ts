import "reflect-metadata";
import type { ConfigStore } from "../src/types";

import { expect } from "chai";
import _ from "lodash";

import SpreadAnalyzer from "../src/spreadAnalyzer";
import { toQuote } from "../src/util";

const config = require("./config_test.json");
config.maxSize = 0.5;
const configStore = { config } as ConfigStore;
const positionMap = {
  Coincheck: {
    allowedLongSize: 10,
    allowedShortSize: 10,
    longAllowed: true,
    shortAllowed: true,
  },
  Quoine: {
    allowedLongSize: 10,
    allowedShortSize: 10,
    longAllowed: true,
    shortAllowed: true,
  },
};

describe("Spread Analyzer", () => {
  it("analyze", async () => {
    const quotes = [
      toQuote("Coincheck", "Ask", 3, 1),
      toQuote("Coincheck", "Bid", 2, 2),
      toQuote("Quoine", "Ask", 3.5, 3),
      toQuote("Quoine", "Bid", 2.5, 4),
    ];
    const target = new SpreadAnalyzer(configStore);
    const result = await target.analyze(quotes, positionMap as any);
    expect(result.ask.broker).to.equal("Coincheck");
    expect(result.ask.price).to.equal(3);
    expect(result.ask.volume).to.equal(1);
    expect(result.bid.broker).to.equal("Quoine");
    expect(result.bid.price).to.equal(2.5);
    expect(result.bid.volume).to.equal(4);
    expect(result.invertedSpread).to.equal(-0.5);
    expect(result.targetVolume).to.equal(0.5);
    expect(result.targetProfit).to.be.closeTo(0, 0.1);
  });

  it("analyze positive profit", async () => {
    const quotes = [
      toQuote("Coincheck", "Ask", 300000, 1),
      toQuote("Coincheck", "Bid", 200000, 2),
      toQuote("Quoine", "Ask", 350000, 3),
      toQuote("Quoine", "Bid", 360000, 4),
    ];
    const target = new SpreadAnalyzer(configStore);
    const result = await target.analyze(quotes, positionMap as any);
    expect(result.ask.broker).to.equal("Coincheck");
    expect(result.ask.price).to.equal(300000);
    expect(result.ask.volume).to.equal(1);
    expect(result.bid.broker).to.equal("Quoine");
    expect(result.bid.price).to.equal(360000);
    expect(result.bid.volume).to.equal(4);
    expect(result.invertedSpread).to.equal(60000);
    expect(result.targetVolume).to.equal(0.5);
    expect(result.targetProfit).to.equal(30000);
  });

  it("analyze positive profit with too small quotes", async () => {
    const quotes = [
      toQuote("Coincheck", "Ask", 300000, 1),
      toQuote("Coincheck", "Bid", 200000, 2),
      toQuote("Coincheck", "Ask", 100000, 0.0099),
      toQuote("Quoine", "Ask", 350000, 3),
      toQuote("Quoine", "Bid", 360000, 4),
    ];
    const target = new SpreadAnalyzer(configStore);
    const result = await target.analyze(quotes, positionMap as any);
    expect(result.ask.broker).to.equal("Coincheck");
    expect(result.ask.price).to.equal(300000);
    expect(result.ask.volume).to.equal(1);
    expect(result.bid.broker).to.equal("Quoine");
    expect(result.bid.price).to.equal(360000);
    expect(result.bid.volume).to.equal(4);
    expect(result.invertedSpread).to.equal(60000);
    expect(result.targetVolume).to.equal(0.5);
    expect(result.targetProfit).to.equal(30000);
  });

  it("analyze positive profit with commission", async () => {
    config.brokers[2].commissionPercent = 0.05;
    const quotes = [
      toQuote("Coincheck", "Ask", 300000, 1),
      toQuote("Coincheck", "Bid", 200000, 2),
      toQuote("Quoine", "Ask", 350000, 3),
      toQuote("Quoine", "Bid", 360000, 4),
    ];
    const target = new SpreadAnalyzer(configStore);
    const result = await target.analyze(quotes, positionMap as any);
    expect(result.ask.broker).to.equal("Coincheck");
    expect(result.ask.price).to.equal(300000);
    expect(result.ask.volume).to.equal(1);
    expect(result.bid.broker).to.equal("Quoine");
    expect(result.bid.price).to.equal(360000);
    expect(result.bid.volume).to.equal(4);
    expect(result.invertedSpread).to.equal(60000);
    expect(result.targetVolume).to.equal(0.5);
    expect(result.targetProfit).to.equal(29910);
  });

  it("analyze with no position map", async () => {
    const quotes = [
      toQuote("Coincheck", "Ask", 300000, 1),
      toQuote("Coincheck", "Bid", 200000, 2),
      toQuote("Quoine", "Ask", 350000, 3),
      toQuote("Quoine", "Bid", 360000, 4),
    ];
    const target = new SpreadAnalyzer(configStore);
    try{
      const result = await target.analyze(quotes, {});
    } catch(ex){
      expect(ex.message).to.equal("Position map is empty.");
      return;
    }
    throw new Error();
  });

  it("analyze with no best bid", async () => {
    const quotes = [
      toQuote("Coincheck", "Ask", 3, 1),
      toQuote("Quoine", "Ask", 3.5, 3),
    ];
    const target = new SpreadAnalyzer(configStore);
    try{
      const result = await target.analyze(quotes, positionMap as any);
    } catch(ex){
      expect(ex.message).to.equal("No best bid was found.");
      return;
    }
    throw new Error();
  });

  it("analyze with no best ask", async () => {
    const quotes = [
      toQuote("Coincheck", "Bid", 3, 1),
      toQuote("Quoine", "Bid", 3.5, 3),
    ];
    const target = new SpreadAnalyzer(configStore);
    try{
      const result = await target.analyze(quotes, positionMap as any);
    } catch(ex){
      expect(ex.message).to.equal("No best ask was found.");
      return;
    }
    throw new Error();
  });

  it("invalid closingPairs", async () => {
    const quotes = [
      toQuote("Coincheck", "Bid", 3, 1),
      toQuote("Quoine", "Bid", 3.5, 3),
    ];
    const target = new SpreadAnalyzer(configStore);
    try{
      const result = await target.analyze(quotes, positionMap as any, [{ size: 0.001 }, { size: 0.002 }] as any);
    } catch(ex){
      expect(ex.message).to.equal("Invalid closing pair.");
      return;
    }
    throw new Error();
  });

  it("getSpreadStat", async () => {
    const quotes = [
      toQuote("Coincheck", "Ask", 3, 1),
      toQuote("Coincheck", "Bid", 2, 2),
      toQuote("Quoine", "Ask", 3.5, 3),
      toQuote("Quoine", "Bid", 2.5, 4),
    ];
    const target = new SpreadAnalyzer(configStore);
    const spreadStat = await target.getSpreadStat(quotes);
    
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const bestCase = spreadStat!.bestCase;
    expect(bestCase.ask.broker).to.equal("Coincheck");
    expect(bestCase.ask.price).to.equal(3);
    expect(bestCase.ask.volume).to.equal(1);
    expect(bestCase.bid.broker).to.equal("Quoine");
    expect(bestCase.bid.price).to.equal(2.5);
    expect(bestCase.bid.volume).to.equal(4);
    expect(bestCase.invertedSpread).to.equal(-0.5);
    expect(bestCase.targetVolume).to.equal(0.5);
    expect(bestCase.targetProfit).to.be.closeTo(0, 0.1);
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
    const worstCase = spreadStat!.worstCase;
    expect(worstCase.ask.broker).to.equal("Quoine");
    expect(worstCase.ask.price).to.equal(3.5);
    expect(worstCase.ask.volume).to.equal(3);
    expect(worstCase.bid.broker).to.equal("Coincheck");
    expect(worstCase.bid.price).to.equal(2);
    expect(worstCase.bid.volume).to.equal(2);
    expect(worstCase.invertedSpread).to.equal(-1.5);
    expect(worstCase.targetVolume).to.equal(0.5);
    expect(worstCase.targetProfit).to.be.closeTo(-1, 0.1);
  });

  it("getSpreadStat no bid", async () => {
    const quotes = [
      toQuote("Coincheck", "Ask", 3, 1),
      toQuote("Quoine", "Ask", 3.5, 3),
    ];
    const target = new SpreadAnalyzer(configStore);
    const spreadStat = await target.getSpreadStat(quotes);
    expect(spreadStat).to.equal(undefined);
  });

  it("getSpreadStat no bid in one broker", async () => {
    const quotes = [
      toQuote("Coincheck", "Ask", 3, 1),
      toQuote("Coincheck", "Bid", 2, 2),
      toQuote("Quoine", "Ask", 3.5, 3),
    ];
    const target = new SpreadAnalyzer(configStore);
    const spreadStat = await target.getSpreadStat(quotes);
    expect(spreadStat).not.to.equal(undefined);
  });

  it("analyze with maxTargetVolumePercent definition", async () => {
    config.minSize = 0.5;
    config.maxTargetVolumePercent = 25.0;
    config.brokers[2].commissionPercent = 0.0;
    const quotes = [
      toQuote("Coincheck", "Ask", 300000, 1),
      toQuote("Coincheck", "Bid", 200000, 2),
      toQuote("Quoine", "Ask", 350000, 3),
      toQuote("Quoine", "Bid", 360000, 4),
    ];
    const target = new SpreadAnalyzer(configStore);
    const result = await target.analyze(quotes, positionMap as any);
    expect(result.ask.broker).to.equal("Quoine");
    expect(result.ask.price).to.equal(350000);
    expect(result.ask.volume).to.equal(3);
    expect(result.bid.broker).to.equal("Quoine");
    expect(result.bid.price).to.equal(360000);
    expect(result.bid.volume).to.equal(4);
    expect(result.invertedSpread).to.equal(10000);
    expect(result.targetVolume).to.equal(0.5);
    expect(result.targetProfit).to.equal(5000);
  });
});
