// ERC-7683 Intent-Dekodierung (herstellerunabhaengig, deterministic).

// GaslessCrossChainOrder / OnchainCrossChainOrder ABI-Schnitt fuer viem
export const ERC7683_ABI = [
  {
    type: 'function',
    name: 'open',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'order',
        type: 'tuple',
        components: [
          { name: 'fillDeadline', type: 'uint32' },
          { name: 'orderDataType', type: 'bytes32' },
          { name: 'orderData', type: 'bytes' },
        ],
      },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'openFor',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'order',
        type: 'tuple',
        components: [
          { name: 'originSettler', type: 'address' },
          { name: 'user', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'originChainId', type: 'uint256' },
          { name: 'openDeadline', type: 'uint32' },
          { name: 'fillDeadline', type: 'uint32' },
          { name: 'orderDataType', type: 'bytes32' },
          { name: 'orderData', type: 'bytes' },
        ],
      },
      { name: 'signature', type: 'bytes' },
      { name: 'originFillerData', type: 'bytes' },
    ],
    outputs: [],
  },
] as const;

export const RESOLVE_ABI = [
  {
    type: 'function',
    name: 'resolveFor',
    stateMutability: 'view',
    inputs: [
      {
        name: 'order',
        type: 'tuple',
        components: [
          { name: 'originSettler', type: 'address' },
          { name: 'user', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'originChainId', type: 'uint256' },
          { name: 'openDeadline', type: 'uint32' },
          { name: 'fillDeadline', type: 'uint32' },
          { name: 'orderDataType', type: 'bytes32' },
          { name: 'orderData', type: 'bytes' },
        ],
      },
      { name: 'fillerData', type: 'bytes' },
    ],
    outputs: [
      {
        name: 'resolvedOrder',
        type: 'tuple',
        components: [
          { name: 'user', type: 'address' },
          { name: 'originChainId', type: 'uint256' },
          { name: 'openDeadline', type: 'uint32' },
          { name: 'fillDeadline', type: 'uint32' },
          { name: 'orderId', type: 'bytes32' },
          {
            name: 'maxSpent',
            type: 'tuple[]',
            components: [
              { name: 'token', type: 'bytes32' },
              { name: 'amount', type: 'uint256' },
              { name: 'recipient', type: 'bytes32' },
              { name: 'chainId', type: 'uint256' },
            ],
          },
          {
            name: 'minReceived',
            type: 'tuple[]',
            components: [
              { name: 'token', type: 'bytes32' },
              { name: 'amount', type: 'uint256' },
              { name: 'recipient', type: 'bytes32' },
              { name: 'chainId', type: 'uint256' },
            ],
          },
          { name: 'fillInstructions', type: 'bytes[]' },
        ],
      },
    ],
  },
] as const;

export interface DecodedOrder {
  originSettler?: string;
  user?: string;
  nonce?: string;
  originChainId?: string;
  openDeadline?: number;
  fillDeadline?: number;
  orderDataType?: string;
  orderData?: string;
  orderDataFields?: { label: string; value: string }[];
  decodeConfidence: 'vollstaendig' | 'teilweise' | 'roh';
}

/** Best-Effort-Tuple-Dekodierung von orderData (gaengige Schemata). */
export async function decodeOrderData(orderData: string): Promise<{ label: string; value: string }[]> {
  const fields: { label: string; value: string }[] = [];
  if (!/^0x[0-9a-fA-F]*$/.test(orderData) || orderData.length < 66) return fields;
  try {
    const v = await import('viem');
    // Generische Tuple-Dekodierung: wir versuchen gaengige Schemata (Across-aehnlich, Limit-Order-aehnlich)
    const candidates = [
      {
        schema: [
          { name: 'inputToken', type: 'address' },
          { name: 'inputAmount', type: 'uint256' },
          { name: 'outputToken', type: 'address' },
          { name: 'outputAmount (minReceived)', type: 'uint256' },
          { name: 'destinationChainId', type: 'uint256' },
          { name: 'exclusiveRelayer', type: 'address' },
          { name: 'exclusivityDeadline', type: 'uint32' },
          { name: 'message', type: 'bytes' },
        ],
      },
      {
        schema: [
          { name: 'inputToken', type: 'bytes32' },
          { name: 'inputAmount', type: 'uint256' },
          { name: 'outputToken', type: 'bytes32' },
          { name: 'outputAmount (minReceived)', type: 'uint256' },
          { name: 'destinationChainId', type: 'uint256' },
        ],
      },
    ] as const;
    const isPaddedAddr = (v0: string) => /^0x0{24}[0-9a-fA-F]{40}$/.test(v0);
    for (const c of candidates) {
      try {
        const dec = v.decodeAbiParameters(
          c.schema.map((s0) => ({ type: s0.type, name: s0.name })) as never,
          orderData as `0x${string}`,
        ) as unknown[];
        fields.length = 0;
        let plausible = true;
        c.schema.forEach((s2, i) => {
          let val = String(dec[i]);
          if (s2.type === 'bytes32' && /token|relayer|recipient|depositor/i.test(s2.name)) {
            if (isPaddedAddr(val)) val = '0x' + val.slice(26); // gepaddete Adresse auf 20 B zurueckschneiden
            else plausible = false; // bytes32-Token, das keine Adresse ist -> anderes Schema wahrscheinlicher
          }
          if (s2.type === 'uint256' && /chainId/i.test(s2.name)) {
            try {
              const n = BigInt(val);
              if (!(n > 0n && n < 2n ** 32n)) plausible = false;
            } catch {
              plausible = false;
            }
          }
          fields.push({ label: s2.name, value: val });
        });
        if (!plausible) {
          fields.length = 0;
          continue;
        }
        if (fields.length) return fields;
      } catch {
        fields.length = 0;
        /* naechstes Schema probieren */
      }
    }
  } catch {
    /* roh */
  }
  return fields;
}

export async function decodeOpenCalldata(calldata: string): Promise<DecodedOrder> {
  const v = await import('viem');
  const cd = calldata.trim() as `0x${string}`;
  try {
    const decoded = v.decodeFunctionData({ abi: ERC7683_ABI as unknown as never[], data: cd });
    if (decoded.functionName === 'openFor') {
      const o = decoded.args[0] as Record<string, unknown>;
      const order: DecodedOrder = {
        originSettler: String(o.originSettler),
        user: String(o.user),
        nonce: String(o.nonce),
        originChainId: String(o.originChainId),
        openDeadline: Number(o.openDeadline),
        fillDeadline: Number(o.fillDeadline),
        orderDataType: String(o.orderDataType),
        orderData: String(o.orderData),
        decodeConfidence: 'vollstaendig',
      };
      order.orderDataFields = await decodeOrderData(order.orderData!);
      if (!order.orderDataFields.length) order.decodeConfidence = 'teilweise';
      return order;
    }
    if (decoded.functionName === 'open') {
      const o = decoded.args[0] as Record<string, unknown>;
      const order: DecodedOrder = {
        fillDeadline: Number(o.fillDeadline),
        orderDataType: String(o.orderDataType),
        orderData: String(o.orderData),
        decodeConfidence: 'vollstaendig',
      };
      order.orderDataFields = await decodeOrderData(order.orderData!);
      if (!order.orderDataFields.length) order.decodeConfidence = 'teilweise';
      return order;
    }
  } catch {
    /* unbekannter Selektor */
  }
  return { orderData: cd, decodeConfidence: 'roh' };
}

export function parseOrderJson(json: string): DecodedOrder | null {
  try {
    const j = JSON.parse(json) as Record<string, unknown>;
    const order = (j.message ?? j.order ?? j) as Record<string, unknown>;
    const o: DecodedOrder = {
      originSettler: order.originSettler ? String(order.originSettler) : undefined,
      user: order.user ? String(order.user) : undefined,
      nonce: order.nonce != null ? String(order.nonce) : undefined,
      originChainId: order.originChainId != null ? String(order.originChainId) : undefined,
      openDeadline: order.openDeadline != null ? Number(order.openDeadline) : undefined,
      fillDeadline: order.fillDeadline != null ? Number(order.fillDeadline) : undefined,
      orderDataType: order.orderDataType ? String(order.orderDataType) : undefined,
      orderData: order.orderData ? String(order.orderData) : undefined,
      decodeConfidence: 'teilweise',
    };
    if (!o.fillDeadline && !o.orderData) return null;
    return o;
  } catch {
    return null;
  }
}

/** JSON-Pfad inkl. orderData-Tuple-Dekodierung (async Pendant zu parseOrderJson). */
export async function parseOrderJsonFull(json: string): Promise<DecodedOrder | null> {
  const o = parseOrderJson(json);
  if (!o) return null;
  if (o.orderData) {
    o.orderDataFields = await decodeOrderData(o.orderData);
    if (o.orderDataFields.length) o.decodeConfidence = 'vollstaendig';
  }
  return o;
}

export interface SpreadResult {
  inputAmount: bigint;
  minReceived: bigint;
  spreadAbs: bigint;
  spreadPct: number;
  comparable: boolean;
  sameTokenNote?: string;
}

/** Maximaler impliziter Solver-Spread (nur wenn Input/Output denselben Token messen). */
export function computeSpread(order: DecodedOrder): SpreadResult | null {
  const f = order.orderDataFields ?? [];
  const get = (re: RegExp) => f.find((x) => re.test(x.label));
  const input = get(/inputAmount/i);
  const output = get(/outputAmount|minReceived/i);
  if (!input || !output) return null;
  try {
    const inputAmount = BigInt(input.value);
    const minReceived = BigInt(output.value);
    const spreadAbs = inputAmount - minReceived;
    const spreadPct = inputAmount === 0n ? 0 : (Number(spreadAbs) / Number(inputAmount)) * 100;
    return {
      inputAmount,
      minReceived,
      spreadAbs,
      spreadPct,
      comparable: true,
      sameTokenNote:
        'Vergleich der nominalen Raw-Einheiten. Cross-Asset-Orders (unterschiedliche Tokens/Dezimalstellen) benoetigen zusaetzlich Kurs-Referenz — Wertangabe stets mit Vorsicht lesen.',
    };
  } catch {
    return null;
  }
}

/** Refund-Empfaenger-Prioritaet: refundAddress -> recipient -> depositor. */
export function resolveRefundRecipient(opts: {
  refundAddress?: string;
  recipient?: string;
  depositor?: string;
  user?: string;
}): { address?: string; source: string } {
  const isZero = (a?: string) => !a || /^0x0{40}$/i.test(a);
  if (!isZero(opts.refundAddress)) return { address: opts.refundAddress, source: 'refundAddress (explizit)' };
  if (!isZero(opts.recipient)) return { address: opts.recipient, source: 'recipient (Fallback 1)' };
  const dep = opts.depositor ?? opts.user;
  if (!isZero(dep)) return { address: dep, source: 'depositor/user (Fallback 2)' };
  return { address: undefined, source: 'nicht aufloesbar' };
}

/** Kodiert resolveFor(order, fillerData) zur Refund-Identifikation (view-only, ERC-7683). */
export async function encodeResolveFor(order: {
  originSettler: string;
  user: string;
  nonce: string;
  originChainId: string;
  openDeadline: number;
  fillDeadline: number;
  orderDataType: string;
  orderData: string;
}): Promise<string> {
  const v = await import('viem');
  const norm = (a: string) => {
    try {
      return v.getAddress(a);
    } catch {
      // Checksum-Toleranz: Kleinbuchstaben-Variante akzeptieren (analysieren, nicht signieren)
      return v.getAddress(a.toLowerCase());
    }
  };
  return v.encodeFunctionData({
    abi: RESOLVE_ABI,
    functionName: 'resolveFor',
    args: [
      {
        originSettler: norm(order.originSettler),
        user: norm(order.user),
        nonce: BigInt(order.nonce),
        originChainId: BigInt(order.originChainId),
        openDeadline: order.openDeadline,
        fillDeadline: order.fillDeadline,
        orderDataType: order.orderDataType as `0x${string}`,
        orderData: order.orderData as `0x${string}`,
      },
      '0x' as `0x${string}`,
    ],
  });
}
