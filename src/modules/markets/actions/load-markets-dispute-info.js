import { augur } from 'services/augurjs'
import { updateMarketsDisputeInfo } from 'modules/markets/actions/update-markets-data'
import isObject from 'utils/is-object'
import logError from 'utils/log-error'

export const loadMarketsDisputeInfo = (marketIds, account, callback = logError) => (dispatch, getState) => {
  augur.reporting.getDisputeInfo({ marketIds, account }, (err, marketsDisputeInfoArray) => {
    if (err) return callback(err)
    if (!marketsDisputeInfoArray.length) return callback(null)
    const marketsDisputeInfo = marketsDisputeInfoArray.reduce((p, marketDisputeInfo) => ({
      ...p,
      [marketDisputeInfo.marketId]: marketDisputeInfo,
    }), {})
    dispatch(updateMarketsDisputeInfo(marketsDisputeInfo))
    callback(null)
  })
}
