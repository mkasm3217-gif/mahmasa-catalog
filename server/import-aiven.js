require("dotenv").config();

const mysql = require("mysql2/promise");
const fs = require("fs");
const path = require("path");

async function importDatabase() {
    let connection;

    try {
        console.log("Connecting to Aiven...");

        connection = await mysql.createConnection({
            host: process.env.AIVEN_DB_HOST,
            port: Number(process.env.AIVEN_DB_PORT),
            user: process.env.AIVEN_DB_USER,
            password: process.env.AIVEN_DB_PASSWORD,
            database: process.env.AIVEN_DB_NAME,

            ssl: {
                rejectUnauthorized: false
            },

            multipleStatements: true
        });

        console.log("Connected to Aiven successfully.");

        const sqlFile = path.join(
            process.env.USERPROFILE,
            "Desktop",
            "mahmasa_catalog.sql"
        );

        if (!fs.existsSync(sqlFile)) {
            throw new Error(
                "mahmasa_catalog.sql was not found on Desktop."
            );
        }

        console.log("Reading backup file...");

        const sql = fs.readFileSync(sqlFile, "utf8");

        if (!sql.trim()) {
            throw new Error("The SQL backup file is empty.");
        }

        console.log("Importing database...");

        await connection.query(sql);

        console.log("");
        console.log("IMPORT SUCCESS");
        console.log("Database imported to Aiven successfully.");

        const [tables] = await connection.query("SHOW TABLES");

        console.log("");
        console.log("Tables on Aiven:");

        tables.forEach((table) => {
            console.log("-", Object.values(table)[0]);
        });

    } catch (error) {
        console.error("");
        console.error("IMPORT ERROR:");
        console.error(error.message);
    } finally {
        if (connection) {
            await connection.end();
        }
    }
}

importDatabase();