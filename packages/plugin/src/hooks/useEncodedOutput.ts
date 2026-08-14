import { useMemo } from "react";
import { FORMATS, OutputFormats } from "@atropical/liblib-core/snapshot/encode";
import { estimateTokens } from "../utils/tokens";

/**
 * Encodes a payload in every format up front. Users switch formats to compare
 * token cost, so all three counts have to exist before a choice is made — and
 * encoding is cheap next to the document scan that produced the payload.
 */
export function useEncodedOutput<T>(
  payload: T | null,
  encode: (payload: T, format: OutputFormats) => string,
) {
  return useMemo(() => {
    const outputs = {} as Record<OutputFormats, string>;
    const tokens = {} as Record<OutputFormats, number>;

    for (const descriptor of FORMATS) {
      const text = payload ? encode(payload, descriptor.format) : "";
      outputs[descriptor.format] = text;
      tokens[descriptor.format] = estimateTokens(text);
    }

    return { outputs, tokens };
  }, [payload, encode]);
}
