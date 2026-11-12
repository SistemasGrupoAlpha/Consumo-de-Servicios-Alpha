const Auth = require('../lib/auth'), { route, send } = require('../lib/http');
module.exports = route(['GET'], async (req, res, user) => send(res, 200, { user: Auth.publicUser(user) }));
