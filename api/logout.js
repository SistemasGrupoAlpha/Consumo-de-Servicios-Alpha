const Auth = require('../lib/auth'), { route, send } = require('../lib/http');
module.exports = route(['POST'], async (req, res) => { res.setHeader('Set-Cookie', Auth.clearCookie()); send(res, 200, { ok: true }); }, { auth: null });
