import * as i18next from "i18next";

import { getConfig } from "./config/configLoader";

const en = {
  ArbitragerThreadHasBeenStopped: "Arbitrager thread has been stopped. Please hit Enter to close this window.",
  AtLeastTwoBrokersMustBeEnabled: "At least two brokers must be enabled.",
  AvailableVolume: "Available volume",
  TargetVolumeIsSmallerThanMinSize: "Target volume is smaller than min size.",
  TargetVolumeIsLargerThanMaxTargetVolumePercent: "Target volume is larger than max target volume percent.",
  BestAsk: "Best ask",
  BestBid: "Best bid",
  BothLegsAreSuccessfullyFilled: ">>Both legs are successfully filled.",
  BuyFillPriceIs: ">>Buy fill price is %s.",
  BuyLegIsNotFilledYetPendingSizeIs: ">>Buy leg is not filled yet. Pending size is %s.",
  CheckingIfBothLegsAreDoneOrNot: ">>Checking if both legs are done or not...",
  ExpectedProfit: "Expected profit",
  FailedToGetASpreadAnalysisResult:
    "Failed to get a spread analysis result. Check maxLongPosition and maxShortPosition in the broker configs. %s",
  FoundArbitrageOppotunity: ">>Found arbitrage oppotunity.",
  FoundInvertedQuotes: "Found inverted quotes.",
  LongAllowed: "LongAllowed",
  LookingForOpportunity: "Looking for opportunity...",
  MaxRetryCountReachedCancellingThePendingOrders: "Max retry count reached. Cancelling the pending orders.",
  NetExposureIsLargerThanMaxNetExposure: "Net exposure is larger than max net exposure.",
  NoArbitrageOpportunitySpreadIsNotInverted: "No arbitrage opportunity. Spread is not inverted.",
  NoBestAskWasFound: "No best ask was found.",
  NoBestBidWasFound: "No best bid was found.",
  OrderCheckAttempt: ">>Order check attempt %s.",
  ProfitIs: ">>Profit is %s.",
  CommissionIs: ">>Commission is %s.",
  SellFillPriceIs: ">>Sell fill price is %s.",
  SellLegIsNotFilledYetPendingSizeIs: ">>Sell leg is not filled yet. Pending size is %s.",
  SendingOrderTargettingQuote: ">>Sending order targetting quote %s...",
  ShortAllowed: "ShortAllowed",
  SleepingAfterSend: ">>Sleeping %s ms after send.",
  Spread: "Spread",
  StartedArbitrager: "Started Arbitrager.",
  StartingArbitrager: "Starting Arbitrager...",
  StartingTheService: "Starting the service...",
  StoppingTheService: "Stopping the service...",
  SuccessfullyStartedTheService: "Successfully started the service.",
  SuccessfullyStoppedTheService: "Successfully stopped the service.",
  TargetProfitIsSmallerThanMinProfit: "Target profit is smaller than min profit.",
  TargetProfitIsLargerThanMaxProfit: "Targetprofit is larger than max profit.",
  TargetVolume: "Target volume",
  ThisIsDemoModeNotSendingOrders: ">>This is Demo mode. Not sending orders.",
  AnalyzingQuotes: "Analyzing quotes...",
  WaitingForPositionService: "Waiting for Position Service...",
  FilledSummary: ">>Filled: %s %s %d %s filled at %s",
  UnfilledSummary: ">>Pending: %s %s %d %s sent at %s, pending size %d %s",
  FoundClosableOrders: "Found closable orders.",
  OpenPairs: "Open pairs:",
  SendingOrderTtl: ">>Sending an order with TTL %d ms...",
  NotFilledTtl: ">>The order was not filled within TTL %d ms. Cancelling the order.",
  ExecuteUnfilledLeg: ">>Trying to execute the unfilled leg %s at new price %s, size %s %s",
  ReverseFilledLeg: ">>Trying to reverse the filled leg %s at new price %s, size %s %s",
};

const ja = {
  ArbitragerThreadHasBeenStopped: "裁定取引スレッドは停止しました。エンターキーを押すとこのウインドウは閉じます。",
  AtLeastTwoBrokersMustBeEnabled: "少なくとも2つの取引所を有効にする必要があります。",
  AvailableVolume: "裁定可能数量",
  TargetVolumeIsSmallerThanMinSize: "裁定機会なし。目標数量 < 最小数量設定",
  TargetVolumeIsLargerThanMaxTargetVolumePercent: "裁定機会なし。目標数量 > 裁定可能数量に対する割合",
  BestAsk: "ベストアスク",
  BestBid: "ベストビッド",
  BothLegsAreSuccessfullyFilled: ">>両方のオーダーの約定完了。",
  BuyFillPriceIs: ">>買い約定価格: %s",
  BuyLegIsNotFilledYetPendingSizeIs: ">>買いオーダー未約定。残り数量%s",
  CheckingIfBothLegsAreDoneOrNot: ">>約定確認中...",
  ExpectedProfit: "予想収益　　",
  FailedToGetASpreadAnalysisResult:
    "スプレッド解析結果の取得に失敗しました。取引所設定のmaxLongPosition, maxShortPositionが十分に大きいか確認してください。 %s",
  FoundArbitrageOppotunity: ">>裁定機会を発見。",
  FoundInvertedQuotes: "スプレッドの逆転を発見。",
  LongAllowed: "買い試行許可",
  LookingForOpportunity: "裁定機会をチェック中...",
  MaxRetryCountReachedCancellingThePendingOrders:
    "最大試行回数(maxRetryCount設定)に達しました。オーダーをキャンセルします。",
  NetExposureIsLargerThanMaxNetExposure: "ネットエクスポージャーが最大ネットエクスポージャー設定を超えています。",
  NoArbitrageOpportunitySpreadIsNotInverted: "裁定機会なし。スプレッド > 0。",
  NoBestAskWasFound: "ベストアスクが見つかりませんでした。",
  NoBestBidWasFound: "ベストビッドが見つかりませんでした。",
  OrderCheckAttempt: ">>オーダーチェック試行%s回目。",
  ProfitIs: ">>収益: %s",
  CommissionIs: ">>うち手数料: %s",
  SellFillPriceIs: ">>売り約定価格: %s",
  SellLegIsNotFilledYetPendingSizeIs: ">>売りオーダー未約定。残り数量%s",
  SendingOrderTargettingQuote: ">>オーダーを送信中... 目標価格 %s",
  ShortAllowed: "売り試行許可",
  SleepingAfterSend: ">>%s ms スリープ中...",
  Spread: "スプレッド　",
  StartedArbitrager: "Arbitragerの開始完了。",
  StartingArbitrager: "Arbitragerを開始中...",
  StartingTheService: "サービスを開始中...",
  StoppingTheService: "サービスを停止中...",
  SuccessfullyStartedTheService: "サービスの開始完了。",
  SuccessfullyStoppedTheService: "サービスの停止完了。",
  TargetProfitIsSmallerThanMinProfit: "裁定機会なし。目標収益 < 最小収益設定",
  TargetProfitIsLargerThanMaxProfit: "目標収益 > 最大収益設定",
  TargetVolume: "目標数量　　",
  ThisIsDemoModeNotSendingOrders: ">>現在デモモードです。オーダーは送信しません。",
  AnalyzingQuotes: "板情報解析中...",
  WaitingForPositionService: "ポジションサービスの待機中...",
  FilledSummary: ">>約定済み: %s %s %d %s 約定価格 %s",
  UnfilledSummary: ">>執行中: %s %s %d %s 指値 %s, 残り数量 %d %s",
  FoundClosableOrders: "クローズ可能なオーダーを発見。",
  OpenPairs: "オープン状態のオーダーペア:",
  SendingOrderTtl: ">>TTL %d msのオーダーを送信中...",
  NotFilledTtl: ">>TTL %d msの間にオーダーは約定しませんでした。キャンセルします。",
  ExecuteUnfilledLeg: ">>約定しなかったオーダー %s を価格 %s 数量 %s %s で再送信中...",
  ReverseFilledLeg: ">>約定したオーダー %s を価格 %s 数量 %s %s で反対売買中...",
};


let lng = "en";

try{
  lng = getConfig().language;
} catch(ex){
  console.log(ex.message);
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
i18next.init({
  lng,
  fallbackLng: "en",
  resources: {
    en: {
      translation: en,
    },
    ja: {
      translation: ja,
    },
  },
});

export default function translateTaggedTemplate(strings: TemplateStringsArray): string {
  return i18next.t(strings.raw[0]);
}
