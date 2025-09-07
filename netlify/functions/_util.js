exports.json = (res, status=200)=> new Response(JSON.stringify(res), {status, headers:{'content-type':'application/json'}});
