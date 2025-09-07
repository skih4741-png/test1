exports.json = (res, status=200)=> ({
  statusCode: status,
  headers: {'content-type':'application/json'},
  body: JSON.stringify(res)
});