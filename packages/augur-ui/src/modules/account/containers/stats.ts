import { connect } from "react-redux";
import { withRouter } from "react-router-dom";
import { AppState } from "store";
import getValue from "utils/get-value";
import Stats from "modules/account/components/stats";
import { ThunkDispatch } from "redux-thunk";
import { Action } from "redux";

const mapStateToProps = (state: AppState) => ({
  timeframeData: state.loginAccount.timeframeData,
});

const mapDispatchToProps = (dispatch: ThunkDispatch<void, any, Action>) => ({});

const mergeProps = (sP: any, dP: any, oP: any) => {
  const properties = [
    {
      key: 0,
      label: "Positions",
      value: getValue(sP.timeframeData, "positions"),
    },
    {
      key: 1,
      label: "Number of Trades",
      value: getValue(sP.timeframeData, "numberOfTrades"),
    },
    {
      key: 2,
      label: "Markets Traded",
      value: getValue(sP.timeframeData, "marketsTraded"),
    },
    {
      key: 3,
      label: "Markets Created",
      value: getValue(sP.timeframeData, "marketsCreated"),
    },
    {
      key: 4,
      label: "Successful Disputes",
      value: getValue(sP.timeframeData, "successfulDisputes"),
    },
    {
      key: 5,
      label: "Redeemed Positions",
      value: getValue(sP.timeframeData, "redeemedPositions"),
    },
  ];

  return {
    ...oP,
    ...sP,
    ...dP,
    properties,
  };
};

const StatsContainer: any = withRouter(
  connect(
    mapStateToProps,
    mapDispatchToProps,
    mergeProps,
  )(Stats),
);

export default StatsContainer;
