import fetch from 'node-fetch';
export async function json(res, status=200){ return new Response(JSON.stringify(res), {status, headers:{'content-type':'application/json'}}); }
