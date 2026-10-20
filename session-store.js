const { Store } = require("express-session");

class MySqlSessionStore extends Store {
  constructor(pool, options = {}) {
    super();
    this.pool = pool;
    this.tableName = options.tableName || "session";
    if (!/^[A-Za-z0-9_]+$/.test(this.tableName)) {
      throw new Error("Invalid MySQL session table name");
    }
  }

  get(sid, callback) {
    this.pool.query(
      `SELECT sess FROM \`${this.tableName}\` WHERE sid = ? AND expire > CURRENT_TIMESTAMP`,
      [sid]
    ).then(result => {
      if (!result.rows.length) return callback(null, null);
      const value = result.rows[0].sess;
      callback(null, typeof value === "string" ? JSON.parse(value) : value);
    }).catch(callback);
  }

  set(sid, sessionData, callback) {
    const expires = sessionData?.cookie?.expires
      ? new Date(sessionData.cookie.expires)
      : new Date(Date.now() + 604800000);

    this.pool.query(
      `INSERT INTO \`${this.tableName}\` (sid, sess, expire)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE sess = VALUES(sess), expire = VALUES(expire)`,
      [sid, JSON.stringify(sessionData), expires]
    ).then(() => callback(null)).catch(callback);
  }

  touch(sid, sessionData, callback) {
    const expires = sessionData?.cookie?.expires
      ? new Date(sessionData.cookie.expires)
      : new Date(Date.now() + 604800000);

    this.pool.query(
      `UPDATE \`${this.tableName}\` SET expire = ? WHERE sid = ?`,
      [expires, sid]
    ).then(() => callback(null)).catch(callback);
  }

  destroy(sid, callback) {
    this.pool.query(
      `DELETE FROM \`${this.tableName}\` WHERE sid = ?`,
      [sid]
    ).then(() => callback(null)).catch(callback);
  }
}

module.exports = MySqlSessionStore;
