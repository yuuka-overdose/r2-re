import type { BrokerConfigType } from "../../src/config";

import { expect } from "chai";
import _ from "lodash";
import nock from "nock";

import nocksetup from "./nocksetup";
import BrokerAdapterImpl from "../../src/Quoine/BrokerAdapterImpl";
import { createOrder } from "../helper";

const brokerConfig = {
  broker: "Quoine",
  enabled: true,
  key: "key",
  secret: "secret",
  maxLongPosition: 0.5,
  maxShortPosition: 0.5,
  commissionPercent: 0,
  cashMarginType: "NetOut",
} as BrokerConfigType;

describe("Quoine BrokerAdapter", function(){
  this.beforeAll(() => {
    nocksetup();
  });

  this.afterAll(() => {
    nock.restore();
  });

  it("send leverage buy limit", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    const order = createOrder("Quoine", "Buy", 0.01, 783000, "NetOut", "Limit", 10);
    await target.send(order);
    expect(order.status).to.equal("New");
    expect(order.brokerOrderId).to.equal("118573146");
  });

  it("send cash buy limit", async () => {
    const config = {
      brokers: [{ broker: "Quoine", key: "key", secret: "secret", cashMarginType: "Cash" }],
    };
    const target = new BrokerAdapterImpl(brokerConfig);
    const order = createOrder("Quoine", "Buy", 0.01, 783000, "Cash", "Limit", 10);
    await target.send(order);
    expect(order.status).to.equal("New");
    expect(order.brokerOrderId).to.equal("118573146");
  });

  it("send wrong broker order", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    const order = { broker: "Bitflyer" };
    try{
      await target.send(order as any);
    } catch(ex){
      return;
    }
    expect(false).to.equal(true);
  });

  it("send wrong symbol", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    const order = { broker: "Quoine", symbol: "ZZZ" };
    try{
      await target.send(order as any);
    } catch(ex){
      return;
    }
    expect(false).to.equal(true);
  });

  it("send wrong order type", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    const order = { broker: "Quoine", symbol: "BTC/JPY", type: "StopLimit" };
    try{
      await target.send(order as any);
    } catch(ex){
      return;
    }
    expect(false).to.equal(true);
  });

  it("send wrong margin type", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    const order = {
      broker: "Quoine",
      symbol: "BTC/JPY",
      type: "Market",
      cashMarginType: "MarginOpen",
    };
    try{
      await target.send(order as any);
    } catch(ex){
      return;
    }
    expect(false).to.equal(true);
  });

  it("fetchQuotes", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    const result = await target.fetchQuotes();
    expect(result.length).to.equal(42);
    result.forEach(q => expect(q.broker).to.equal("Quoine"));
  });

  it("getBtcPosition Margin", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    const result = await target.getBtcPosition();
    expect(result).to.equal(0.12);
  });

  it("getBtcPosition Cash", async () => {
    const cashConfig = {
      broker: "Quoine",
      enabled: true,
      key: "key",
      secret: "secret",
      maxLongPosition: 0.5,
      maxShortPosition: 0.5,
      commissionPercent: 0,
      cashMarginType: "Cash",
    } as BrokerConfigType;
    const target = new BrokerAdapterImpl(cashConfig);
    const result = await target.getBtcPosition();
    expect(result).to.equal(0.04925688);
  });

  it("getBtcPosition strategy not found", async () => {
    const wrongConfig = {
      broker: "Quoine",
      enabled: true,
      key: "key",
      secret: "secret",
      maxLongPosition: 0.5,
      maxShortPosition: 0.5,
      commissionPercent: 0,
      cashMarginType: "MarginOpen",
    } as BrokerConfigType;
    const target = new BrokerAdapterImpl(wrongConfig);
    try{
      const result = await target.getBtcPosition();
    } catch(ex){
      expect(ex.message).to.contain("Unable to find");
      return;
    }
    throw new Error();
  });

  it("getBtcPosition not found", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    try{
      const result = await target.getBtcPosition();
    } catch(ex){
      return;
    }
    expect(false).to.equal(true);
  });

  it("refresh not filled", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    const order = {
      symbol: "BTC/JPY",
      type: "Limit",
      timeInForce: "None",
      id: "b28eaefe-84d8-4110-9917-0e9d5793d7eb",
      status: "New",
      creationTime: "2017-11-06T23:46:56.635Z",
      executions: [] as any,
      broker: "Quoine",
      size: 0.01,
      side: "Buy",
      price: 783000,
      cashMarginType: "NetOut",
      leverageLevel: 10,
      brokerOrderId: "118573146",
      sentTime: "2017-11-06T23:46:56.692Z",
      lastUpdated: "2017-11-06T23:46:56.692Z",
    };
    await target.refresh(order as any);
    expect(order.status).to.equal("New");
  });

  it("refresh partially filled", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    const order = {
      symbol: "BTC/JPY",
      type: "Limit",
      timeInForce: "None",
      id: "b28eaefe-84d8-4110-9917-0e9d5793d7eb",
      status: "New",
      creationTime: "2017-11-06T23:46:56.635Z",
      executions: [] as any,
      broker: "Quoine",
      size: 0.01,
      side: "Buy",
      price: 783000,
      cashMarginType: "NetOut",
      leverageLevel: 10,
      brokerOrderId: "118573146",
      sentTime: "2017-11-06T23:46:56.692Z",
      lastUpdated: "2017-11-06T23:46:56.692Z",
    };
    await target.refresh(order as any);
    expect(order.status).to.equal("PartiallyFilled");
  });

  it("refresh", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    const order = {
      symbol: "BTC/JPY",
      type: "Limit",
      timeInForce: "None",
      id: "b28eaefe-84d8-4110-9917-0e9d5793d7eb",
      status: "New",
      creationTime: "2017-11-06T23:46:56.635Z",
      executions: [] as any,
      broker: "Quoine",
      size: 0.01,
      side: "Buy",
      price: 783000,
      cashMarginType: "NetOut",
      leverageLevel: 10,
      brokerOrderId: "118573146",
      sentTime: "2017-11-06T23:46:56.692Z",
      lastUpdated: "2017-11-06T23:46:56.692Z",
    };
    await target.refresh(order as any);
    expect(order.status).to.equal("Filled");
  });

  it("cancel", async () => {
    const target = new BrokerAdapterImpl(brokerConfig);
    const order = {
      symbol: "BTC/JPY",
      type: "Limit",
      timeInForce: "None",
      id: "b28eaefe-84d8-4110-9917-0e9d5793d7eb",
      status: "New",
      creationTime: "2017-11-06T23:46:56.635Z",
      executions: [] as any,
      broker: "Quoine",
      size: 0.01,
      side: "Buy",
      price: 783000,
      cashMarginType: "NetOut",
      leverageLevel: 10,
      brokerOrderId: "118573146",
      sentTime: "2017-11-06T23:46:56.692Z",
      lastUpdated: "2017-11-06T23:46:56.692Z",
    };
    await target.cancel(order as any);
    expect(order.status).to.equal("Canceled");
  });
});
