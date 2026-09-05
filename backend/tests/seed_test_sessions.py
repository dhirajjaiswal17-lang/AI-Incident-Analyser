"""Re-seed the pre-seeded test sessions (logout flow test deletes them)."""
import asyncio, os
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")

SESSIONS = [
    ("admin@test.local", "test_session_admin_001"),
    ("user@test.local", "test_session_end_001"),
]


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    now = datetime.now(timezone.utc)
    for email, token in SESSIONS:
        user = await db.users.find_one({"email": email}, {"_id": 0})
        if not user:
            print("MISSING USER", email)
            continue
        await db.user_sessions.update_one(
            {"session_token": token},
            {"$set": {
                "user_id": user["user_id"],
                "session_token": token,
                "expires_at": (now + timedelta(days=30)).isoformat(),
                "created_at": now.isoformat(),
            }},
            upsert=True,
        )
        print("seeded session for", email)
    client.close()

asyncio.run(main())
