import augur from 'augur.js';
import abi from 'augur-abi';
import BigNumber from 'bignumber.js';

import {
	SUCCESS,
	CREATING_MARKET
} from '../modules/transactions/constants/statuses';
import { BUY_SHARES } from "../modules/transactions/constants/types";

const TIMEOUT_MILLIS = 50;
const ex = {};

ex.connect = function connect(cb) {
	if (process.env.ETHEREUM_HOST_RPC) {
		augur.rpc.nodes.hosted = [process.env.ETHEREUM_HOST_RPC];
	}
	let localnode = null;
	if (process.env.BUILD_AZURE) {
		if (process.env.BUILD_AZURE_WSURL === 'null') {
			augur.rpc.wsUrl = null;
		} else {
			augur.rpc.wsUrl = process.env.BUILD_AZURE_WSURL;
		}
		if (process.env.BUILD_AZURE_LOCALNODE === 'null') {
			augur.rpc.nodes.local = null;
		} else {
			augur.rpc.nodes.local = process.env.BUILD_AZURE_LOCALNODE;
		}
		if (process.env.BUILD_AZURE_HOSTEDNODE === 'null') {
			augur.rpc.nodes.hosted = [];
		} else {
			augur.rpc.nodes.hosted = [process.env.BUILD_AZURE_HOSTEDNODE];
		}
	} else {
		if (document.location.protocol === 'http:') {
			// localnode = 'http://127.0.0.1:8545';
		}
	}
	// augur.rpc.wsUrl = null;
	augur.connect(localnode, null, (connected) => {
		if (!connected) return cb('could not connect to ethereum');
		if (process.env.BUILD_AZURE && process.env.BUILD_AZURE_CONTRACTS !== 'null') {
			try {
				augur.updateContracts(JSON.parse(process.env.BUILD_AZURE_CONTRACTS));
			} catch (exc) {
				console.error('couldn\'t parse contracts', exc);
			}
		}
		cb(null, connected);
	});
};

ex.loadCurrentBlock = function loadCurrentBlock(cb) {
	augur.rpc.blockNumber((blockNumber) => cb(parseInt(blockNumber, 16)));
};

ex.loadBranches = function loadBranches(cb) {
	augur.getBranches((branches) => {
		if (!branches || branches.error) {
			console.log('ERROR getBranches', branches);
			cb(branches);
		}
		cb(null, branches);
	});
};

ex.loadBranch = function loadBranch(branchID, cb) {
	const branch = {};

	function finish() {
		if (branch.periodLength && branch.description) {
			cb(null, branch);
		}
	}

	augur.getPeriodLength(branchID, periodLength => {
		if (!periodLength || periodLength.error) {
			console.info('ERROR getPeriodLength', periodLength);
			return cb(periodLength);
		}
		branch.periodLength = periodLength;
		finish();
	});

	augur.getDescription(branchID, description => {
		if (!description || description.error) {
			console.info('ERROR getDescription', description);
			return cb(description);
		}
		branch.description = description;
		finish();
	});
};

ex.loadLoginAccount = function loadLoginAccount(isHosted, cb) {
	// if available, use the client-side account
	if (augur.web.account.address && augur.web.account.privateKey) {
		console.log('using client-side account:', augur.web.account.address);
		return cb(null, {
			...augur.web.account,
			id: augur.web.account.address
		});
	}

	// hosted node: no unlocked account available
	if (isHosted) {
		// if the user has a persistent login, use it
		const account = augur.web.persist();
		if (account && account.privateKey) {
			console.log('using persistent login:', account);
			return cb(null, {
				...augur.web.account,
				id: augur.web.account.address
			});
		}
		return cb(null);
	}

	// local node: if it's unlocked, use the coinbase account
	// check to make sure the account is unlocked
	augur.rpc.unlocked(augur.from, (unlocked) => {
		// use from/coinbase if unlocked
		if (unlocked && !unlocked.error) {
			console.log('using unlocked account:', augur.from);
			return cb(null, {
				id: augur.from
			});
		}

		// otherwise, no account available
		console.log('account is locked: ', augur.from);
		return cb(null);
	});
};

ex.loadAssets = function loadAssets(branchID, accountID, cbEther, cbRep, cbRealEther) {
	augur.getCashBalance(accountID, (result) => {
		if (!result || result.error) {
			return cbEther(result);
		}
		return cbEther(null, abi.bignum(result).toNumber());
	});

	augur.getRepBalance(branchID, accountID, (result) => {
		if (!result || result.error) {
			return cbRep(result);
		}
		return cbRep(null, abi.bignum(result).toNumber());
	});

	augur.rpc.balance(accountID, (wei) => {
		if (!wei || wei.error) {
			return cbRealEther(wei);
		}
		return cbRealEther(null, abi.bignum(wei).dividedBy(new BigNumber(10).toPower(18)).toNumber());
	});
};

ex.loadNumMarkets = function loadNumMarkets(branchID, cb) {
	augur.getNumMarketsBranch(branchID, numMarkets => {
		cb(null, parseInt(numMarkets, 10));
	});
};

ex.loadMarkets = function loadMarkets(branchID, chunkSize, totalMarkets, isDesc, chunkCB) {
	const firstStartIndex = isDesc ? totalMarkets - chunkSize + 1 : 0;
	getMarketsInfo(branchID, firstStartIndex, chunkSize, totalMarkets, isDesc, chunkCB);

	function getMarketsInfo(branchID, startIndex, chunkSize, totalMarkets, isDesc, chunkCB) {
		augur.getMarketsInfo({
			branch: branchID,
			offset: startIndex,
			numMarketsToLoad: chunkSize
		}, marketsData => {
			const now = 0 - (Date.now() + window.performance.now());

			if (!marketsData || marketsData.error) {
				return chunkCB(marketsData);
			}
			// had to change this to return something, doesn't seem to break anything.
			Object.keys(marketsData).forEach((key, i) => {
				marketsData[key].creationSortOrder = now + i;
				return marketsData[key].creationSortOrder;
			});

			chunkCB(null, marketsData);

			if (isDesc && startIndex > 0) {
				setTimeout(() => getMarketsInfo(
					branchID,
					startIndex - chunkSize,
					chunkSize,
					totalMarkets,
					isDesc
				), TIMEOUT_MILLIS);
			} else if (!isDesc && startIndex < totalMarkets) {
				setTimeout(() => getMarketsInfo(
					branchID,
					startIndex + chunkSize,
					chunkSize,
					totalMarkets,
					isDesc
				), TIMEOUT_MILLIS);
			}
		});
	}
};

ex.loadMarket = function loadMarket(marketID, cb) {
	augur.getMarketInfo(marketID, marketInfo => {
		if (marketInfo && marketInfo.error) {
			return cb(marketInfo);
		}

		cb(null, { ...marketInfo || {}, creationSortOrder: Date.now() + window.performance.now() });
	});
};

ex.listenToUpdates = function listenToUpdates(cbBlock, cbContracts, cbPrice, cbCreation) {
	augur.filters.listen({
		// listen for new blocks
		block: (blockHash) => cbBlock(null, blockHash),
		// listen for augur transactions
		contracts: (filtrate) => cbContracts(null, filtrate),
		// update market when a price change has been detected
		price: (result) => cbPrice(null, result),
		// listen for new markets
		creation: (result) => cbCreation(null, result)
	}, (filters) => console.log('### listen to filters:', filters));
};

ex.loadAccountTrades = function loadAccountTrades(accountID, cb) {
	augur.getAccountTrades(accountID, null, (accountTrades) => {
		if (!accountTrades) {
			return cb();
		}
		if (accountTrades.error) {
			return cb(accountTrades);
		}
		return cb(null, accountTrades);
	});
};

ex.listenToBidsAsks = function listenToBidsAsks() {

};

ex.login = function login(handle, password, persist, cb) {
	augur.web.login(handle, password, { persist }, (account) => {
		if (!account) {
			return cb({ code: 0, message: 'failed to login' });
		}
		if (account.error) {
			return cb({ code: account.error, message: account.message });
		}
		return cb(null, {
			...account,
			id: account.address
		});
	});
};

ex.logout = function logout() {
	augur.web.logout();
};

ex.register = function register(handle, password, persist, cb, cbExtras) {
	augur.web.register(handle, password, { persist }, {
		onRegistered: account => {
			if (!account) {
				return cb({ code: 0, message: 'failed to register' });
			}
			if (account.error) {
				return cb({ code: account.error, message: account.message });
			}
			return cb(null, {
				...account,
				id: account.address
			});
		},
		onSendEther: res => {
			if (res.error) {
				return cb({ code: res.error, message: res.message });
			}
			cbExtras(res);
		},
		onSent: res => {
			if (res.error) {
				return cb({ code: res.error, message: res.message });
			}
			cbExtras(res);
		},
		onSuccess: res => {
			if (res.error) {
				return cb({ code: res.error, message: res.message });
			}
			cbExtras(res);
		},
		onFailed: err => {
			cb(err);
		}
	});
};

ex.loadMeanTradePrices = function loadMeanTradePrices(accountID, cb) {
	if (!accountID) {
		cb('AccountID required');
	}
	augur.getAccountMeanTradePrices(accountID, meanTradePrices => {
		if (meanTradePrices && meanTradePrices.error) {
			return cb(meanTradePrices);
		}
		cb(null, meanTradePrices);
	});
};

ex.trade = function (marketId, marketOrderBook, tradeOrders, outcomePositions,
					 onTradeHash, onCommitSent, onCommitSuccess, onCommitFailed,
					 onNextBlock, onTradeSent, onTradeSuccess, onTradeFailed,
					 onBuySellSent, onBuySellSuccess, onBuySellFailed,
					 onShortSellSent, onShortSellSuccess, onShortSellFailed,
					 onBuyCompleteSetsSent, onBuyCompleteSetsSuccess, onBuyCompleteSetsFailed) {
	augur.multiTrade(marketId, marketOrderBook, tradeOrders, outcomePositions,
		onTradeHash, onCommitSent, onCommitSuccess, onCommitFailed, onNextBlock, onTradeSent, onTradeSuccess, onTradeFailed,
		onBuySellSent, onBuySellSuccess, onBuySellFailed,
		onShortSellSent, onShortSellSuccess, onShortSellFailed,
		onBuyCompleteSetsSent, onBuyCompleteSetsSuccess, onBuyCompleteSetsFailed);
};

ex.tradeShares = function tradeShares(branchID, marketID, outcomeID, numShares, limit, cap, cb) {
	augur.trade({
		branch: branchID,
		market: abi.hex(marketID),
		outcome: outcomeID,
		amount: numShares,
		limit,
		stop: false,
		cap: null,
		expiration: 0,
		callbacks: {
			onMarketHash: (marketHash) => cb(null, { status: 'sending...', data: marketHash }),
			onCommitTradeSent: (res) => cb(null, { status: 'committing...', data: res }),
			onCommitTradeSuccess: (res) => cb(null, { status: 'broadcasting...', data: res }),
			onCommitTradeFailed: (err) => cb(err),
			onTradeSent: (res) => cb(null, { status: 'confirming...', data: res }),
			onTradeSuccess: (res) => cb(null, { status: SUCCESS, data: res }),
			onTradeFailed: (err) => cb(err),
			onOrderCreated: (res) => console.log('onOrderCreated', res)
		}
	});
};

ex.getSimulatedBuy = function getSimulatedBuy(marketID, outcomeID, numShares) {
	return augur.getSimulatedBuy(marketID, outcomeID, numShares);
};

ex.getSimulatedSell = function getSimulatedSell(marketID, outcomeID, numShares) {
	return augur.getSimulatedSell(marketID, outcomeID, numShares);
};

ex.loadPriceHistory = function loadPriceHistory(marketID, cb) {
	if (!marketID) {
		cb('ERROR: loadPriceHistory() marketID required');
	}
	augur.getMarketPriceHistory(marketID, (priceHistory) => {
		if (priceHistory && priceHistory.error) {
			return cb(priceHistory.error);
		}
		cb(null, priceHistory);
	});
};

ex.get_trade_ids = function (marketID, cb) {
	augur.get_trade_ids(marketID, cb);
};

ex.getOrderBook = function (marketID, cb) {
	augur.getOrderBook(marketID, cb);
};

ex.get_trade = function (orderID, cb) {
	augur.get_trade(orderID, cb);
};

ex.createMarket = function createMarket(branchID, newMarket, cb) {
	augur.createSingleEventMarket({
		branchId: branchID,
		description: newMarket.description,
		expirationBlock: newMarket.endBlock,
		minValue: newMarket.minValue,
		maxValue: newMarket.maxValue,
		numOutcomes: newMarket.numOutcomes,
		alpha: '0.0079',
		initialLiquidity: newMarket.initialLiquidity,
		tradingFee: newMarket.tradingFee,
		onSent: r => cb(null, { status: CREATING_MARKET, marketID: r.callReturn, txHash: r.txHash }),
		onSuccess: r => cb(null, { status: SUCCESS, marketID: r.callReturn, tx: r }),
		onFailed: r => cb(r)
	});
};

ex.createMarketMetadata = function createMarketMetadata(newMarket, cb) {
	console.log('--createMarketMetadata', newMarket.id, ' --- ', newMarket.detailsText, ' --- ', newMarket.tags, ' --- ', newMarket.resources, ' --- ', newMarket.expirySource);
	let tag1;
	let tag2;
	let tag3;
	if (newMarket.tags && newMarket.tags.constructor === Array && newMarket.tags.length) {
		tag1 = newMarket.tags[0];
		if (newMarket.tags.length > 1) tag2 = newMarket.tags[1];
		if (newMarket.tags.length > 2) tag3 = newMarket.tags[2];
	}
	augur.setMetadata({
		market: newMarket.id,
		details: newMarket.detailsText,
		tag1,
		tag2,
		tag3,
		links: newMarket.resources,
		source: newMarket.expirySource
	},
		res => cb(null, { status: 'processing metadata...', metadata: res }),
		res => cb(null, { status: SUCCESS, metadata: res }),
		err => cb(err)
	);
};

ex.getReport = function getReport(branchID, reportPeriod, eventID) {
	augur.getReport(branchID, reportPeriod, eventID, (report) =>
		console.log('*************report', report));
};

ex.loadPendingReportEventIDs = function loadPendingReportEventIDs(
		eventIDs,
		accountID,
		reportPeriod,
		branchID,
		cb
	) {
	const pendingReportEventIDs = {};

	if (!eventIDs || !eventIDs.length) {
		return cb(null, {});
	}

	// load market-ids related to each event-id one at a time
	(function processEventID() {
		const eventID = eventIDs.pop();
		const randomNumber = abi.hex(abi.bignum(accountID).plus(abi.bignum(eventID)));
		const diceroll = augur.rpc.sha3(randomNumber, true);

		function finish() {
			// if there are more event ids, re-run this function to get their market ids
			if (eventIDs.length) {
				setTimeout(processEventID, TIMEOUT_MILLIS);
			} else {
			// if no more event ids to process, exit this loop and callback
				cb(null, pendingReportEventIDs);
			}
		}

		if (!diceroll) {
			console.log('WARN: couldn\'t get sha3 for', randomNumber, diceroll);
			return finish();
		}

		augur.calculateReportingThreshold(branchID, eventID, reportPeriod, threshold => {
			if (!threshold) {
				console.log('WARN: couldn\'t get reporting threshold for', eventID);
				return finish();
			}
			if (threshold.error) {
				console.log('ERROR: calculateReportingThreshold', threshold);
				return finish();
			}
			if (abi.bignum(diceroll).lt(abi.bignum(threshold))) {
				augur.getReportHash(branchID, reportPeriod, accountID, eventID, (reportHash) => {
					if (reportHash && reportHash !== '0x0') {
						pendingReportEventIDs[eventID] = { reportHash };
					} else {
						pendingReportEventIDs[eventID] = { reportHash: null };
					}
					finish();
				});
			} else {
				finish();
			}
		});
	}());
};

ex.submitReportHash = function submitReportHash(branchID, accountID, event, report, cb) {
	const minValue = abi.bignum(event.minValue);
	const maxValue = abi.bignum(event.maxValue);
	const numOutcomes = abi.bignum(event.numOutcomes);
	let rescaledReportedOutcome;

	// Re-scale scalar/categorical reports so they fall between 0 and 1
	if (report.isIndeterminate) {
		rescaledReportedOutcome = report.reportedOutcomeID;
	} else {
		if (report.isScalar) {
			rescaledReportedOutcome = abi.bignum(report.reportedOutcomeID)
												.minus(minValue)
												.dividedBy(maxValue.minus(minValue))
												.toFixed();
		} else if (report.isCategorical) {
			rescaledReportedOutcome = abi.bignum(report.reportedOutcomeID)
												.minus(abi.bignum(1))
												.dividedBy(numOutcomes.minus(abi.bignum(1)))
												.toFixed();
		} else {
			rescaledReportedOutcome = report.reportedOutcomeID;
		}
	}

	const reportHash = augur.makeHash(
		report.salt,
		rescaledReportedOutcome,
		event.id,
		accountID,
		report.isIndeterminate,
		report.isScalar
	);

	augur.submitReportHash({
		branch: branchID,
		reportHash,
		reportPeriod: report.reportPeriod,
		eventID: event.id,
		eventIndex: event.index,
		onSent: res => cb(null, { ...res, reportHash, status: 'processing...' }),
		onSuccess: res => cb(null, { ...res, reportHash, status: SUCCESS }),
		onFailed: err => cb(err)
	});
};

ex.penalizationCatchup = function penalizationCatchup(branchID, cb) {
	augur.penalizationCatchup({
		branch: branchID,
		onSent: res => {
			console.log('penalizationCatchup sent:', res);
		},
		onSuccess: res => {
			console.log('penalizationCatchup success:', res);
			cb(null, res);
		},
		onFailed: err => {
			console.error('penalizationCatchup failed:', err);
			if (err.error === '0') {
				// already caught up
			}
			cb(err);
		}
	});
};

ex.penalizeNotEnoughReports = function penalizeNotEnoughReports(branchID, cb) {
	const self = this;
	augur.penalizeNotEnoughReports({
		branch: branchID,
		onSent: res => {
			console.log('penalizeNotEnoughReports sent:', res);
		},
		onSuccess: res => {
			console.log('penalizeNotEnoughReports success:', res);
			cb(null, res);
		},
		onFailed: err => {
			console.error('penalizeNotEnoughReports failed:', err);
			if (err.error === '-1') {
				// already called
				return cb(err);
			} else if (err.error === '-2') {
				// need to catch up
				return self.penalizationCatchup(branchID, cb);
			}
			cb(err);
		}
	});
};

ex.penalizeWrong = function penalizeWrong(branchID, period, event, cb) {
	const self = this;
	augur.getMarkets(event, markets => {
		if (!markets || markets.error) return console.error('getMarkets:', markets);
		augur.getOutcome(event, outcome => {
			if (outcome !== '0' && !outcome.error) {
				console.log('Calling penalizeWrong for:', branchID, period, event);
				augur.penalizeWrong({
					branch: branchID,
					event,
					onSent: res => {
						console.log(`penalizeWrong sent for event ${event}`, res);
					},
					onSuccess: res => {
						console.log(`penalizeWrong success for event ${event}`, res);
						cb(null, res);
					},
					onFailed: err => {
						console.error(`penalizeWrong failed for event ${event}`, err);
						if (err.error === '-3') {
							augur.penalizeNotEnoughReports(branchID, (error, res) => {
								self.penalizeWrong(branchID, period, event, cb);
							});
						}
						cb(err);
					}
				});
			} else {
				self.closeMarket(branchID, markets[0], (err, res) => {
					if (err) return cb(err);
					self.penalizeWrong(branchID, period, event, cb);
				});
			}
		});
	});
};

ex.closeMarket = function closeMarket(branchID, marketID, cb) {
	augur.closeMarket({
		branch: branchID,
		market: marketID,
		onSent: res => {
			// console.log('closeMarket sent:', res);
		},
		onSuccess: res => {
			// console.log('closeMarket success:', res);
			cb(null, res);
		},
		onFailed: err => {
			// console.error('closeMarket error:', err);
			cb(err);
		}
	});
};

ex.collectFees = function collectFees(branchID, cb) {
	augur.collectFees({
		branch: branchID,
		onSent: res => {
		},
		onSuccess: res => {
			cb(null, res);
		},
		onFailed: err => {
			cb(err);
		}
	});
};

ex.incrementPeriodAfterReporting = function incrementPeriodAfterReporting(branchID, cb) {
	augur.incrementPeriodAfterReporting({
		branch: branchID,
		onSent: (result) => {},
		onFailed: (err) => cb(err),
		onSuccess: (result) => cb(null, result)
	});
};

ex.getReportPeriod = function getReportPeriod(branchID, cb) {
	augur.getReportPeriod(branchID, (res) => {
		if (res.error) {
			return cb(res);
		}
		return cb(null, res);
	});
};

ex.getOutcome = augur.getOutcome.bind(augur);
ex.getEventIndex = augur.getEventIndex.bind(augur);
ex.submitReport = augur.submitReport.bind(augur);
ex.getEvents = augur.getEvents.bind(augur);
ex.getReportedPeriod = augur.getReportedPeriod.bind(augur);
ex.rpc = augur.rpc;
module.exports = ex;
