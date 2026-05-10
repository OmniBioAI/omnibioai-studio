-- OmniBioAI Studio — database initialization
-- Runs once on first MySQL container start (empty data volume).
-- Each service handles its own schema via Django migrations.

CREATE DATABASE IF NOT EXISTS omnibioai    CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS limsdb       CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE DATABASE IF NOT EXISTS model_registry CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
