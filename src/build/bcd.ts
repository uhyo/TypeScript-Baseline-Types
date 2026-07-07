import * as Browser from "./types.ts";
import type {
  CompatStatement,
  SimpleSupportStatement,
  SupportBlock,
} from "@mdn/browser-compat-data/types";
import { forceKeepAlive } from "./bcd/keep-alive.ts";
import { mapToBcdCompat } from "./bcd/mapper.ts";
import { hasStableImplementation } from "./bcd/stable.ts";
import { isBaselineCut, isBaselineSuitable } from "./bcd/baseline.ts";

function hasMultipleImplementations(support: SupportBlock, prefix?: string) {
  const hasStableImpl = (
    browser: SimpleSupportStatement | SimpleSupportStatement[] | undefined,
  ) => hasStableImplementation(browser, prefix);
  let count = 0;
  if (hasStableImpl(support.chrome) || hasStableImpl(support.chrome_android)) {
    count += 1;
  }
  if (
    hasStableImpl(support.firefox) ||
    hasStableImpl(support.firefox_android)
  ) {
    count += 1;
  }
  if (hasStableImpl(support.safari) || hasStableImpl(support.safari_ios)) {
    count += 1;
  }
  return count >= 2;
}

function isSuitable(
  key: string,
  compat?: CompatStatement,
  parentKey?: string,
  prefix?: string,
  compatKeys?: string[],
) {
  const forceAlive = parentKey
    ? forceKeepAlive[parentKey]?.includes(key)
    : !!forceKeepAlive[key];
  // The upstream "supported by 2+ engines" rule.
  const defaultSupported =
    !!compat && hasMultipleImplementations(compat.support, prefix);
  // With a Baseline cut requested, replace that rule with the target's Baseline
  // bar -- but only when Baseline has data for the item. When it doesn't (no
  // resolvable BCD key), defer to the upstream decision rather than
  // unconditionally keeping: the cut must stay a subset of the full lib, never
  // adding members the normal build drops (e.g. PerformanceEntry.id, which has
  // no BCD entry and would otherwise clash with LargestContentfulPaint).
  const supported = isBaselineCut
    ? compatKeys && compatKeys.length > 0
      ? isBaselineSuitable(compatKeys)
      : defaultSupported
    : defaultSupported;
  if (supported) {
    if (!isBaselineCut && forceAlive) {
      if (parentKey) {
        console.warn(`Redundant forceKeepAlive item: ${parentKey}#${key}`);
      } else if (!forceKeepAlive[key].length) {
        console.warn(`Redundant forceKeepAlive item: ${key}`);
      }
    }
    return true;
  }
  return forceAlive;
}

export function getRemovalData(webidl: Browser.WebIdl): Browser.WebIdl {
  return mapToBcdCompat(
    webidl,
    ({ key, parentKey, compat, mixin, compatKeys }) => {
      // Allow all mixins here, but not their members.
      // Empty mixins created by this will be managed by exposed.ts.
      // (It's better to manage mixins there as mixins can also conditionally be empty by exposure settings)
      if (mixin && !parentKey) {
        return;
      }
      if (isSuitable(key, compat, parentKey, undefined, compatKeys)) {
        return;
      }
      return { exposed: "" };
    },
  ) as Browser.WebIdl;
}

export function getDeprecationData(webidl: Browser.WebIdl): Browser.WebIdl {
  return mapToBcdCompat(webidl, ({ compat }) => {
    if (compat?.status?.deprecated) {
      return { deprecated: 1 };
    } else if (compat?.status?.preferred_name) {
      return {
        deprecated: `This is a legacy alias of \`${compat.status.preferred_name}\`.`,
      };
    }
  }) as Browser.WebIdl;
}

export function getDocsData(webidl: Browser.WebIdl): Browser.WebIdl {
  return mapToBcdCompat(webidl, ({ compat }) => {
    if (compat?.mdn_url) {
      return { mdnUrl: compat.mdn_url };
    }
  }) as Browser.WebIdl;
}
