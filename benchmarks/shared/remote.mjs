// Same wire contract as Isle. Framework routers and framework-native RPC are excluded.
export async function renameDocument(input) {
  const response = await fetch('/__isle/action/renameDocument', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error(result.error ?? 'remote_error');
  return result.value;
}
