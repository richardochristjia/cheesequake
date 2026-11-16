// JSON-RPC over the paced client. Rate-limit errors in a 200 body are retried by the client.
export function createRpc(get, url) {
  let id = 0;
  const call = async (method, params) => {
    const body = await get(url, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    if (body?.error) throw Object.assign(new Error(`rpc ${method}: ${body.error.message}`), { code: 'SOURCE_UNAVAILABLE' });
    return body?.result ?? null;
  };
  return {
    signatures: (address, { limit, until } = {}) =>
      call('getSignaturesForAddress', [address, { limit, ...(until ? { until } : {}) }]).then((r) => r ?? []),
    transaction: (sig) => call('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 1 }]),
    async mintInfo(mint) {
      const r = await call('getAccountInfo', [mint, { encoding: 'jsonParsed' }]);
      const i = r?.value?.data?.parsed?.info;
      return i ? { decimals: i.decimals, supply: Number(i.supply), mintAuthority: i.mintAuthority ?? null, freezeAuthority: i.freezeAuthority ?? null } : null;
    },
  };
}
