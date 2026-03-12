import asyncio
import os
import uuid

from livekit import api


async def main() -> None:
    url = os.getenv("LIVEKIT_HTTP_URL", "http://localhost:7880")
    api_key = os.getenv("LIVEKIT_API_KEY", "devkey")
    api_secret = os.getenv("LIVEKIT_API_SECRET", "APISECRETdevkey1234567890ABCDEFG")
    room_name = f"smoke-test-{uuid.uuid4().hex[:8]}"

    client = api.LiveKitAPI(url=url, api_key=api_key, api_secret=api_secret)
    try:
        rooms_before = await client.room.list_rooms(api.ListRoomsRequest())
        print(f"Connected to LiveKit at {url}")
        print(f"Existing rooms: {len(rooms_before.rooms)}")

        created = await client.room.create_room(api.CreateRoomRequest(name=room_name))
        print(f"Created room: {created.name}")

        rooms_after = await client.room.list_rooms(api.ListRoomsRequest())
        room_names = [room.name for room in rooms_after.rooms]
        print(f"Rooms after create: {room_names}")

        await client.room.delete_room(api.DeleteRoomRequest(room=room_name))
        print(f"Deleted room: {room_name}")
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main())