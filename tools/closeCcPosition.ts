// Ad-hoc script to close all leverage positions in Coincheck.

import { options } from "@bitr/logger";

import CoincheckApi from "../src/Coincheck/BrokerApi";
import { getConfigRoot, findBrokerConfig } from "../src/config";

options.enabled = false;

async function main() {
  const config = getConfigRoot();
  const ccConfig = findBrokerConfig(config, "Coincheck");
  const ccApi = new CoincheckApi(ccConfig.key, ccConfig.secret);
  const positions = await ccApi.getAllOpenLeveragePositions();
  for(const position of positions){
    const request = {
      pair: "btc_jpy",
      order_type: position.side === "buy" ? "close_long" : "close_short",
      amount: position.amount,
      position_id: position.id,
    };
    console.log(`Closing position id ${position.id}...`);
    const reply = await ccApi.newOrder(request as any);
    if(!reply.success){
      console.log(reply);
    }else{
      console.log("Close order was sent.");
    }
  }
}

main();
