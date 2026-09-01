/**
 * Run an existing Express controller without going through HTTP.
 * Used by AI tools so create/update/delete/get keep the same lead logic.
 */
export function runController(handler, { user, params = {}, body = {}, query = {}, extra = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = {
      user,
      params,
      body,
      query,
      isCommonToken: false,
      isSimpleToken: false,
      ...extra,
    };

    let statusCode = 200;
    let settled = false;

    const finish = (payload) => {
      if (settled) return;
      settled = true;
      resolve({ statusCode, data: payload });
    };

    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        finish(data);
        return this;
      },
      send(data) {
        finish(data);
        return this;
      },
    };

    const next = (err) => {
      if (!err) return;
      if (settled) return;
      settled = true;
      if (err.statusCode) {
        resolve({
          statusCode: err.statusCode,
          data: { message: err.message || 'Request failed' },
        });
        return;
      }
      reject(err);
    };

    try {
      const maybe = handler(req, res, next);
      if (maybe && typeof maybe.then === 'function') {
        maybe.catch(next);
      }
    } catch (err) {
      next(err);
    }
  });
}
