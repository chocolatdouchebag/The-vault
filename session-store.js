const { Store } = require("express-session");

class PgSessionStore extends Store {
  constructor(pool, options = {}) {
    super();
    this.pool = pool;
    this.tableName = options.tableName || "session";
  }

  get(sid, callback) {
    this.pool.query(`SELECT sess FROM ${this.tableName} WHERE sid = $1 AND expire > CURRENT_TIMESTAMP`, [sid])
      .then(result => {
        if (!result.rows.length) return callback(null, null);
        const value = result.rows[0].sess;
        callback(null, typeof value === "string" ? JSON.parse(value) : value);
      })
      .catch(callback);
  }

  set(sid, sessionData, callback) {
    const expires = sessionData?.cookie?.expires ? new Date(sessionData.cookie.expires) : new Date(Date.now() + 604800000);
    this.pool.query(`INSERT INTO ${this.tableName} (sid, sess, expire) VALUES ($1, $2::json, $3) ON CONFLICT (sid) DO UPDATE SET sess = EXCLUDED.sess, expire = EXCLUDED.expire`, [sid, JSON.stringify(sessionData), expires])
      .then(() => callback(null)).catch(callback);
  }

  touch(sid, sessionData, callback) {
    const expires = sessionData?.cookie?.expires ? new Date(sessionData.cookie.expires) : new Date(Date.now() + 604800000);
    this.pool.query(`UPDATE ${this.tableName} SET expire = $2 WHERE sid = $1`, [sid, expires])
      .then(() => callback(null)).catch(callback);
  }

  destroy(sid, callback) {
    this.pool.query(`DELETE FROM ${this.tableName} WHERE sid = $1`, [sid])
      .then(() => callback(null)).catch(callback);
  }
}

module.exports = PgSessionStore;