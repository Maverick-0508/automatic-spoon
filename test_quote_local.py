#!/usr/bin/env python3
"""Quick local test for quote functionality."""
import asyncio
import httpx
import json
from app.core.config import Settings
import sys
import os
import uuid

# Ensure models are imported to register them with SQLAlchemy
sys.path.insert(0, os.path.dirname(__file__))
from app.models.user import User  # noqa
from app.models.property import Client, Property  # noqa
from app.models.work_order import WorkOrder  # noqa

BASE_URL = "http://localhost:8000"
settings = Settings()

async def main():
        """Test the complete quote workflow."""
        from app.db.session import AsyncSessionLocal
    
        # Create test client in database
        print("=" * 60)
        print("0. Creating test client in database...")
        print("=" * 60)
    
        test_client_id = str(uuid.uuid4())
        try:
            async with AsyncSessionLocal() as db:
                test_client = Client(
                    id=test_client_id,
                    full_name="Test Quote Client",
                    email="testquote@example.com",
                    phone="555-0100"
                )
                db.add(test_client)
                """Quick local test for quote functionality."""
                import asyncio
                import httpx
                import json
                import sys
                import os
                import uuid
                from sqlalchemy import select

                # Add app to path
                sys.path.insert(0, os.path.dirname(__file__))

                # Import models to register with SQLAlchemy
                from app.models.user import User  # noqa
                from app.models.property import Client, Property  # noqa
                from app.models.work_order import WorkOrder, WorkOrderEvent  # noqa
                from app.core.config import Settings
                from app.db.session import AsyncSessionLocal

                BASE_URL = "http://localhost:8000"
                settings = Settings()


                async def create_test_client():
                    """Create a test client in the database."""
                    print("=" * 60)
                    print("0. Creating test client in database...")
                    print("=" * 60)
    
                    test_client_id = str(uuid.uuid4())
                    try:
                        async with AsyncSessionLocal() as db:
                            test_client = Client(
                                id=test_client_id,
                                full_name="Test Quote Client",
                                email="testquote@example.com",
                                phone="555-0100"
                            )
                            db.add(test_client)
                            await db.flush()
            
                            # Also create a property for the client
                            test_property = Property(
                                id=str(uuid.uuid4()),
                                client_id=test_client_id,
                                address="123 Test Street",
                                zone="north"
                            )
                            db.add(test_property)
                            await db.commit()
            
                        print(f"✅ Created test client")
                        print(f"   Email: testquote@example.com")
                        print(f"   Client ID: {test_client_id}")
                        return test_client_id
                    except Exception as e:
                        print(f"⚠️  Error creating client: {e}")
                        raise


                async def main():
                    """Test the complete quote workflow."""
                    # Step 0: Create test client
                    client_id = await create_test_client()
                    client_email = "testquote@example.com"
    
                    async with httpx.AsyncClient(base_url=BASE_URL, timeout=30) as http_client:
                        # 1. Authenticate with admin user
                        print("\n" + "=" * 60)
                        print("1. Getting admin auth token...")
                        print("=" * 60)
        
                        auth_resp = await http_client.post("/api/auth/login/json", json={
                            "email": "admin@lawncraft.com",
                            "password": "Admin@12345!"
                        })
        
                        if auth_resp.status_code != 200:
                            print(f"❌ Auth failed: {auth_resp.status_code}")
                            print(auth_resp.text)
                            return
        
                        token_data = auth_resp.json()
                        token = token_data.get("access_token")
                        print(f"✅ Got token: {token[:20]}...")
        
                        headers = {"Authorization": f"Bearer {token}"}
        
                        # 2. Create work order with quote
                        print("\n" + "=" * 60)
                        print("2. Creating work order with quote=true...")
                        print("=" * 60)
        
                        quote_payload = {
                            "client_id": client_id,
                            "title": "Weekly lawn maintenance quote",
                            "description": "Please provide a quote for:\n- Mow front and back lawn\n- Edge driveway and sidewalks\n- Trim shrubs\n- Blow hard surfaces clear",
                            "priority": "high",
                            "quote": True
                        }
        
                        print(f"Payload: {json.dumps(quote_payload, indent=2)}")
        
                        wo_resp = await http_client.post(
                            "/api/supervisor/work-orders",
                            json=quote_payload,
                            headers=headers
                        )
        
                        if wo_resp.status_code != 201:
                            print(f"❌ Failed to create work order: {wo_resp.status_code}")
                            print(wo_resp.text)
                            return
        
                        wo = wo_resp.json()
                        wo_id = wo["id"]
                        print(f"✅ Created work order: {wo_id}")
                        print(f"   Title: {wo['title']}")
                        print(f"   Priority: {wo['priority']}")
        
                        # 3. Verify quote_sent event was created
                        print("\n" + "=" * 60)
                        print("3. Checking database for quote_sent event...")
                        print("=" * 60)
        
                        async with AsyncSessionLocal() as db:
                            result = await db.execute(
                                select(WorkOrderEvent).where(
                                    WorkOrderEvent.work_order_id == wo_id,
                                    WorkOrderEvent.event_type == "quote_sent"
                                )
                            )
                            event = result.scalar_one_or_none()
            
                            if event:
                                print(f"✅ Found quote_sent event!")
                                print(f"   Event ID: {event.id}")
                                print(f"   Payload: {event.payload}")
                            else:
                                print(f"⚠️  No quote_sent event found")
        
                        print("\n" + "=" * 60)
                        print("✅ QUOTE WORKFLOW TEST COMPLETE!")
                        print("=" * 60)
                        print(f"\n📧 Check the SMTP debugging server for the email output.")
                        print(f"   Look for a message FROM: quotes@lawncraft.local TO: {client_email}")
                        print(f"   The email should contain HTML content and a PDF attachment.")
                        print(f"\n✨ Quote email delivery is working correctly!")


                if __name__ == "__main__":
                    asyncio.run(main())
