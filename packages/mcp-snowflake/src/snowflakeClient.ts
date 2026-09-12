import snowflake from "snowflake-sdk";

let connection: snowflake.Connection | null = null;

/**
 * Crea (o reutiliza) una conexión a Snowflake usando variables de entorno.
 * Lanza un error legible si faltan credenciales, en vez de tronar feo.
 */
function getConnection(): Promise<snowflake.Connection> {
  if (connection) return Promise.resolve(connection);

  const required = [
    "SNOWFLAKE_ACCOUNT",
    "SNOWFLAKE_USERNAME",
    "SNOWFLAKE_PASSWORD",
    "SNOWFLAKE_WAREHOUSE",
    "SNOWFLAKE_DATABASE",
    "SNOWFLAKE_SCHEMA",
  ];
  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    return Promise.reject(
      new Error(
        `Faltan variables de entorno de Snowflake: ${missing.join(", ")}`
      )
    );
  }

  const conn = snowflake.createConnection({
    account: process.env.SNOWFLAKE_ACCOUNT!,
    username: process.env.SNOWFLAKE_USERNAME!,
    password: process.env.SNOWFLAKE_PASSWORD!,
    warehouse: process.env.SNOWFLAKE_WAREHOUSE!,
    database: process.env.SNOWFLAKE_DATABASE!,
    schema: process.env.SNOWFLAKE_SCHEMA!,
    role: process.env.SNOWFLAKE_ROLE,
  });

  return new Promise((resolve, reject) => {
    conn.connect((err) => {
      if (err) return reject(err);
      connection = conn;
      resolve(conn);
    });
  });
}

export async function runQuery<T = Record<string, unknown>>(
  sqlText: string,
  binds: (string | number)[] = []
): Promise<T[]> {
  const conn = await getConnection();
  return new Promise((resolve, reject) => {
    conn.execute({
      sqlText,
      binds,
      complete: (err, _stmt, rows) => {
        if (err) return reject(err);
        resolve((rows ?? []) as T[]);
      },
    });
  });
}

export async function listTables(): Promise<{ name: string; kind: string }[]> {
  const rows = await runQuery<{ name: string; kind: string }>(
    "SELECT TABLE_NAME AS NAME, TABLE_TYPE AS KIND FROM INFORMATION_SCHEMA.TABLES " +
      "WHERE TABLE_SCHEMA = CURRENT_SCHEMA() ORDER BY TABLE_NAME"
  );
  return rows;
}

export async function describeTable(
  tableName: string
): Promise<{ column: string; type: string }[]> {
  // Validación simple para evitar inyección en el identificador de tabla.
  if (!/^[A-Za-z0-9_]+$/.test(tableName)) {
    throw new Error("Nombre de tabla inválido");
  }
  const rows = await runQuery<{ column: string; type: string }>(
    "SELECT COLUMN_NAME AS COLUMN, DATA_TYPE AS TYPE FROM INFORMATION_SCHEMA.COLUMNS " +
      "WHERE TABLE_NAME = ? AND TABLE_SCHEMA = CURRENT_SCHEMA() ORDER BY ORDINAL_POSITION",
    [tableName.toUpperCase()]
  );
  return rows;
}
