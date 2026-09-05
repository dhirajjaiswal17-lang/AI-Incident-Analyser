"""One-off cleanup of TEST_ records leaked by the pre-fix 500 on admin CRUD create."""
import asyncio, os
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv("/app/backend/.env")


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]
    specs = [
        ("applications", "name"),
        ("kb_articles", "title"),
        ("rcas", "title"),
        ("historical_incidents", "short_description"),
    ]
    for coll, field in specs:
        r = await db[coll].delete_many({field: {"$regex": "^TEST_"}})
        print(coll, "deleted", r.deleted_count)
    r = await db.historical_incidents.delete_many({"number": {"$regex": "^INC_TEST"}})
    print("historical by number deleted", r.deleted_count)
    r = await db.rcas.delete_many({"incident_number": "INC_TEST"})
    print("rcas by incident_number deleted", r.deleted_count)
    client.close()

asyncio.run(main())
