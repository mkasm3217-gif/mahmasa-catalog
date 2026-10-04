require("dotenv").config();

const mysql = require("mysql2");
const fs = require("fs");

const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

const tables = ["categories", "products", "settings"];
let backup = "SET FOREIGN_KEY_CHECKS=0;\n\n";

function escapeValue(value) {
    if (value === null) return "NULL";
    return db.escape(value);
}

db.connect(async (err) => {
    if (err) {
        console.error("Connection error:", err.message);
        return;
    }

    console.log("Connected to database successfully.");

    try {
        for (const table of tables) {
            const [createRows] = await db
                .promise()
                .query(`SHOW CREATE TABLE \`${table}\``);

            backup += `DROP TABLE IF EXISTS \`${table}\`;\n`;
            backup += createRows[0]["Create Table"] + ";\n\n";

            const [rows] = await db
                .promise()
                .query(`SELECT * FROM \`${table}\``);

            for (const row of rows) {
                const columns = Object.keys(row)
                    .map(column => `\`${column}\``)
                    .join(", ");

                const values = Object.values(row)
                    .map(escapeValue)
                    .join(", ");

                backup +=
                    `INSERT INTO \`${table}\` (${columns}) ` +
                    `VALUES (${values});\n`;
            }

            backup += "\n";

            console.log(`Exported: ${table}`);
        }

        backup += "SET FOREIGN_KEY_CHECKS=1;\n";

        const desktop =
            require("path").join(
                process.env.USERPROFILE,
                "Desktop",
                "mahmasa_catalog.sql"
            );

        fs.writeFileSync(desktop, backup, "utf8");

        console.log("");
        console.log("EXPORT SUCCESS");
        console.log("mahmasa_catalog.sql created on Desktop");

    } catch (error) {
        console.error("Export error:", error);
    } finally {
        db.end();
    }
});