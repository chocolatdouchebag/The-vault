"use strict";

function translateQuery(statement, parameters = []) {
  const originalSql = String(statement);
  const returningMatch = originalSql.match(/\s+RETURNING\s+([\s\S]*?)\s*;?\s*$/i);
  const returning = returningMatch ? returningMatch[1].trim().replace(/;$/, "") : null;
  let sql = returningMatch
    ? originalSql.slice(0, returningMatch.index).trimEnd()
    : originalSql;

  // PostgreSQL's checkout interval expression -> MySQL date arithmetic.
  sql = sql.replace(
    /CURRENT_TIMESTAMP\s*\+\s*make_interval\s*\(\s*mins\s*=>\s*\$(\d+)\s*::\s*integer\s*\)/i,
    (_match, index) => `DATE_ADD(CURRENT_TIMESTAMP, INTERVAL $${index} MINUTE)`
  );

  // PostgreSQL row-locking syntax; InnoDB locks the joined rows for this SELECT.
  sql = sql.replace(
    /\s+FOR\s+UPDATE\s+OF\s+[A-Za-z0-9_`",\s]+(?=\s*(?:;|$))/i,
    " FOR UPDATE"
  );

  // Convert a few explicit PostgreSQL casts and UPSERT syntax still used by legacy callers.
  sql = sql.replace(/\$(\d+)\s*::\s*integer\b/gi, (_match, index) => `$${index}`);
  sql = sql.replace(/\$(\d+)\s*::\s*jsonb?\b/gi, (_match, index) => `CAST($${index} AS JSON)`);
  sql = sql.replace(
    /ON\s+CONFLICT\s*\(\s*sid\s*\)\s*DO\s+UPDATE\s+SET\s+sess\s*=\s*EXCLUDED\.sess\s*,\s*expire\s*=\s*EXCLUDED\.expire/gi,
    "ON DUPLICATE KEY UPDATE sess = VALUES(sess), expire = VALUES(expire)"
  );

  const matches = [...sql.matchAll(/\$(\d+)/g)];
  let values = parameters;
  if (matches.length) {
    values = matches.map(match => {
      const index = Number(match[1]) - 1;
      if (index < 0 || index >= parameters.length) {
        throw new Error(`SQL parameter $${match[1]} has no matching value.`);
      }
      return parameters[index];
    });
    sql = sql.replace(/\$(\d+)/g, "?");
  }

  return { sql, values, returning, originalSql, originalParameters: parameters };
}

function buildReturningSelect({ originalSql, returning, parameters, insertId }) {
  const targetMatch = originalSql.match(/^\s*(?:INSERT\s+INTO|UPDATE)\s+[`"]?([A-Za-z_][A-Za-z0-9_]*)/i);
  if (!targetMatch) throw new Error("Unable to translate RETURNING for this SQL statement.");
  const table = targetMatch[1];

  if (!/^(?:\*|[`"]?[A-Za-z_][A-Za-z0-9_]*[`"]?(?:\s*,\s*[`"]?[A-Za-z_][A-Za-z0-9_]*[`"]?)*)$/.test(returning)) {
    throw new Error("Unsupported column list in PostgreSQL RETURNING clause.");
  }

  let id;
  if (/^\s*INSERT\b/i.test(originalSql)) {
    id = insertId;
  } else {
    const idMatch = originalSql.match(/\bWHERE\b[\s\S]*?\bid\s*=\s*\$(\d+)/i);
    if (!idMatch) throw new Error("RETURNING updates must identify the row with an id parameter.");
    id = parameters[Number(idMatch[1]) - 1];
  }

  if (id === undefined || id === null || id === 0) return null;
  return {
    sql: `SELECT ${returning} FROM \`${table}\` WHERE id = ?`,
    values: [id]
  };
}

module.exports = { translateQuery, buildReturningSelect };
