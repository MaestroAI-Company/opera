import { universalFetch } from '../ai/utils/universalFetch';

//privatebin v2 envelope shape
export type CipherParams = [string, string, number, number, number, string, string, string];
export type Adata = [CipherParams, string, number, number];

export type PasteEnvelope = {
  v: 2;
  adata: Adata;
  ct: string;
  meta?: { expire?: string };
};

type PasteResponse = {
  status: number;
  message?: string;
  id?: string;
  v?: number;
  adata?: Adata;
  ct?: string;
};

const withTrailingSlash = (host: string) => (host.endsWith('/') ? host : `${host}/`);

const JSON_API_HEADERS = { 'X-Requested-With': 'JSONHttpRequest' };

//json only when header matches
export async function createPaste(host: string, envelope: PasteEnvelope): Promise<string> {
  const res = await universalFetch(withTrailingSlash(host), {
    method: 'POST',
    headers: { ...JSON_API_HEADERS, 'Content-Type': 'application/json' },
    body: JSON.stringify(envelope),
  });
  if (!res.ok) throw new Error(`The paste server refused the upload (${res.status})`);
  const json: PasteResponse = await res.json();
  if (json.status !== 0 || !json.id) throw new Error(json.message || 'The paste server refused the upload');
  //the response also carries a delete token
  //keeping it would allow revoking a share later
  return json.id;
}

export async function readPaste(host: string, id: string): Promise<PasteEnvelope> {
  const res = await universalFetch(`${withTrailingSlash(host)}?pasteid=${encodeURIComponent(id)}`, {
    headers: JSON_API_HEADERS,
  });
  if (!res.ok) throw new Error(`The paste server could not be reached (${res.status})`);
  const json: PasteResponse = await res.json();
  if (json.status !== 0 || !json.ct || !json.adata) {
    throw new Error(json.message || 'This shared conversation no longer exists');
  }
  return { v: 2, adata: json.adata, ct: json.ct };
}
