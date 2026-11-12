const Auth = require('../lib/auth'), { route, send } = require('../lib/http');
module.exports = route(['POST'], async (req, res) => {
  const b = req.body || {};
  const u = await Auth.login(b.usuario, b.password);
  res.setHeader('Set-Cookie', Auth.makeCookie(u));
  send(res, 200, { user: Auth.publicUser(u) });
}, { auth: null });
