import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const schema = `
CREATE TABLE IF NOT EXISTS User (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  passwordHash TEXT NOT NULL,
  displayName TEXT,
  clearance INTEGER NOT NULL DEFAULT 1,
  canPostScp BOOLEAN NOT NULL DEFAULT 0,
  isOwner BOOLEAN NOT NULL DEFAULT 0,
  personalFile TEXT NOT NULL DEFAULT '',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS InviteCode (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT 1,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  usedById TEXT UNIQUE,
  FOREIGN KEY (usedById) REFERENCES User(id)
);

CREATE TABLE IF NOT EXISTS Message (
  id TEXT PRIMARY KEY,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT 0,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  senderId TEXT NOT NULL,
  recipientId TEXT NOT NULL,
  FOREIGN KEY (senderId) REFERENCES User(id),
  FOREIGN KEY (recipientId) REFERENCES User(id)
);

CREATE TABLE IF NOT EXISTS ScpFile (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  clearanceRequired INTEGER NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  authorId TEXT NOT NULL,
  FOREIGN KEY (authorId) REFERENCES User(id)
);

CREATE TABLE IF NOT EXISTS Broadcast (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  authorId TEXT NOT NULL,
  FOREIGN KEY (authorId) REFERENCES User(id)
);

CREATE TABLE IF NOT EXISTS ClearanceRequest (
  id TEXT PRIMARY KEY,
  requestedLevel INTEGER NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewedAt DATETIME,
  userId TEXT NOT NULL,
  reviewedById TEXT,
  FOREIGN KEY (userId) REFERENCES User(id),
  FOREIGN KEY (reviewedById) REFERENCES User(id)
);
`;

try {
  const statements = schema.split(';').filter(s => s.trim());
  for (const statement of statements) {
    if (statement.trim()) {
      await db.execute(statement);
      console.log(`✓ ${statement.split('\n')[0].trim()}`);
    }
  }
  console.log('\n✓ Schema created successfully');
  process.exit(0);
} catch (err) {
  console.error('Error creating schema:', err.message);
  process.exit(1);
}
