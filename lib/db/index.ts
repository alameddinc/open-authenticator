import Database from "better-sqlite3"
import { readFileSync } from "fs"
import { join } from "path"
import { runMigrations } from "../db-migrations"
import bcrypt from "bcrypt"

// DB_PATH from env or default to data/app.db in current directory
const DB_PATH = process.env.DB_PATH || join(process.cwd(), "data", "app.db")
console.log("🔍 DB_PATH:", DB_PATH)
console.log("🔍 process.cwd():", process.cwd())

let db: Database.Database | null = null

async function initializeDefaultAdmin() {
  if (!db) return

  const adminPassword = process.env.ADMIN_PASSWORD || "admin"

  // Check if admin user exists
  const adminExists = db.prepare("SELECT 1 FROM users WHERE username = ?").get("admin")

  if (!adminExists) {
    console.log("📝 Creating default admin user...")
    const adminHash = await bcrypt.hash(adminPassword, 10)
    db.prepare(`
      INSERT INTO users (username, password_hash, role, created_by, is_active)
      VALUES (?, ?, 'admin', 'system', 1)
    `).run("admin", adminHash)
    console.log("✅ Default admin user created (username: admin)")
  }
}

export function getDb(): Database.Database {
  if (!db) {
    // Ensure data directory exists
    const { mkdirSync, existsSync } = require("fs")
    const { dirname } = require("path")

    // Extract directory from DB_PATH and create it
    const dbDir = dirname(DB_PATH)
    if (!existsSync(dbDir)) {
      mkdirSync(dbDir, { recursive: true })
      console.log(`📁 Created database directory: ${dbDir}`)
    }

    // Initialize database
    db = new Database(DB_PATH)
    db.pragma("journal_mode = WAL")
    db.pragma("foreign_keys = ON")

    // Run initial schema
    const schema = readFileSync(join(process.cwd(), "lib", "db", "schema.sql"), "utf-8")
    db.exec(schema)

    // Run migrations
    runMigrations()

    // Initialize default admin user
    initializeDefaultAdmin().catch(err => {
      console.error("Failed to create default admin user:", err)
    })

    console.log("✅ Database initialized at:", DB_PATH)
  }

  return db
}

export function closeDb() {
  if (db) {
    db.close()
    db = null
  }
}

// Cleanup on process exit
if (typeof process !== "undefined") {
  process.on("beforeExit", closeDb)
  process.on("SIGINT", () => {
    closeDb()
    process.exit(0)
  })
}
