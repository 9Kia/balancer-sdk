import { parseFixed } from '@ethersproject/bignumber';
import { AddressZero } from '@ethersproject/constants';
import { Pool } from '../../types';
import {
  SolidityMaths,
  _computeScalingFactor,
  _upscaleArray,
} from '@/lib/utils/solidityMaths';
import { AssetHelpers } from '@/lib/utils/assetHelpers';

export const AMP_PRECISION = 3; // number of decimals -> precision 1000

type ParsedPoolInfo = {
  athRateProduct: string;
  bptIndex: number;
  exemptedTokens: boolean[];
  higherBalanceTokenIndex: number;
  lastJoinExitInvariant: string;
  ampWithPrecision: bigint;
  balancesEvm: bigint[];
  balancesEvmWithoutBpt: bigint[];
  oldPriceRates: bigint[];
  priceRates: bigint[];
  priceRatesWithoutBpt: bigint[];
  swapFeeEvm: bigint;
  parsedTokens: string[];
  parsedTokensWithoutBpt: string[];
  weights: bigint[];
  protocolSwapFeePct: string;
  protocolYieldFeePct: string;
  scalingFactors: bigint[];
  scalingFactorsWithoutBpt: bigint[];
  upScaledBalances: bigint[];
  upScaledBalancesWithoutBpt: bigint[];
  totalSharesEvm: bigint;
};

/**
 * Parse pool info into EVM amounts. Sorts by token order if wrappedNativeAsset param passed.
 * @param {Pool}  pool
 * @param {string}  wrappedNativeAsset
 * @param unwrapNativeAsset if true, changes wETH address to ETH address
 * @returns       parsed pool info
 */
// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export const parsePoolInfo = (
  pool: Pool,
  wrappedNativeAsset?: string,
  unwrapNativeAsset?: boolean
): ParsedPoolInfo => {
  let exemptedTokens = pool.tokens.map(
    ({ isExemptFromYieldProtocolFee }) => !!isExemptFromYieldProtocolFee
  );
  let parsedTokens = unwrapNativeAsset
    ? pool.tokens.map((token) =>
        token.address === wrappedNativeAsset ? AddressZero : token.address
      )
    : pool.tokens.map((token) => token.address);
  let decimals = pool.tokens.map((token) => {
    return token.decimals ?? 18;
  });
  let balancesEvm = pool.tokens.map((token) =>
    parseFixed(token.balance, token.decimals).toBigInt()
  );
  let weights = pool.tokens.map((token) => {
    return parseFixed(token.weight ?? '1', 18).toBigInt();
  });
  let priceRates = pool.tokens.map((token) => {
    return parseFixed(token.priceRate ?? '1', 18).toBigInt();
  });
  let oldPriceRates = pool.tokens.map(({ oldPriceRate }) => {
    return parseFixed(oldPriceRate ?? '1', 18).toBigInt();
  });

  const scalingFactorsRaw = decimals.map((d) =>
    _computeScalingFactor(BigInt(d))
  );
  let scalingFactors = scalingFactorsRaw.map((sf, i) =>
    SolidityMaths.mulDownFixed(sf, priceRates[i])
  );
  // This assumes token.balance is in human scale (e.g. from SG)
  let upScaledBalances = _upscaleArray(balancesEvm, scalingFactors);
  if (wrappedNativeAsset) {
    const assetHelpers = new AssetHelpers(wrappedNativeAsset);
    let sfString;
    [
      parsedTokens,
      decimals,
      sfString,
      balancesEvm,
      upScaledBalances,
      weights,
      priceRates,
      oldPriceRates,
      exemptedTokens,
    ] = assetHelpers.sortTokens(
      parsedTokens,
      decimals,
      scalingFactors,
      balancesEvm,
      upScaledBalances,
      weights,
      priceRates,
      oldPriceRates,
      exemptedTokens
    ) as [
      string[],
      number[],
      string[],
      bigint[],
      bigint[],
      bigint[],
      bigint[],
      bigint[],
      boolean[]
    ];
    scalingFactors = sfString.map(BigInt);
  }

  // Solidity maths uses precison method for amp that must be replicated
  const ampWithPrecision = parseFixed(
    pool.amp ?? '1',
    AMP_PRECISION
  ).toBigInt();

  const swapFeeEvm = parseFixed(pool.swapFee, 18).toBigInt();

  const higherBalanceTokenIndex = upScaledBalances.indexOf(
    SolidityMaths.max(upScaledBalances)
  );
  const protocolSwapFeePct = parseFixed(
    pool.protocolSwapFeeCache || '0',
    18
  ).toString();
  const protocolYieldFeePct = parseFixed(
    pool.protocolYieldFeeCache || '0',
    18
  ).toString();
  const scalingFactorsWithoutBpt: bigint[] = [],
    parsedTokensWithoutBpt: string[] = [],
    balancesEvmWithoutBpt: bigint[] = [],
    priceRatesWithoutBpt: bigint[] = [],
    upScaledBalancesWithoutBpt: bigint[] = [];
  const bptIndex = parsedTokens.indexOf(pool.address);
  if (bptIndex !== -1) {
    scalingFactors.forEach((_, i) => {
      if (i !== bptIndex) {
        scalingFactorsWithoutBpt.push(scalingFactors[i]);
        parsedTokensWithoutBpt.push(parsedTokens[i]);
        balancesEvmWithoutBpt.push(balancesEvm[i]);
        priceRatesWithoutBpt.push(priceRates[i]);
        upScaledBalancesWithoutBpt.push(upScaledBalances[i]);
      }
    });
  }
  const totalSharesEvm = parseFixed(pool.totalShares || '0', 18).toBigInt();
  return {
    athRateProduct: parseFixed(pool.athRateProduct || '0', 18).toString(),
    bptIndex,
    exemptedTokens,
    higherBalanceTokenIndex,
    lastJoinExitInvariant: pool.lastJoinExitInvariant || '0',
    ampWithPrecision,
    balancesEvm,
    balancesEvmWithoutBpt,
    oldPriceRates,
    priceRates,
    priceRatesWithoutBpt,
    swapFeeEvm,
    parsedTokens,
    parsedTokensWithoutBpt,
    weights,
    protocolSwapFeePct,
    protocolYieldFeePct,
    scalingFactors,
    scalingFactorsWithoutBpt,
    upScaledBalances,
    upScaledBalancesWithoutBpt,
    totalSharesEvm,
  };
};
