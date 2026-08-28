CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS documents (
    id SERIAL PRIMARY KEY,
    filename TEXT NOT NULL UNIQUE,
    content TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunks (
    id SERIAL PRIMARY KEY,
    document_id INTEGER REFERENCES documents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    section TEXT,
    chunk_index INTEGER,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS policy_states (
    id SERIAL PRIMARY KEY,
    chunk_id INTEGER REFERENCES chunks(id) ON DELETE CASCADE,
    element_type TEXT NOT NULL,
    name TEXT NOT NULL,
    value JSONB NOT NULL,
    unit TEXT,
    source_text TEXT NOT NULL,
    confidence FLOAT DEFAULT 0.9,
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_policy_chunk ON policy_states(chunk_id);
CREATE INDEX IF NOT EXISTS idx_documents_filename ON documents(filename);
