from backend.database import SessionLocal
from backend.models import EventRegistration, Event, User

db = SessionLocal()
regs = db.query(EventRegistration).all()
print(f"Found {len(regs)} registrations")
for r in regs:
    event = db.query(Event).filter(Event.id == r.event_id).first()
    print(r.id, r.event_id, event.title if event else "None")
