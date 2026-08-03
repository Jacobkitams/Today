import os
import sys
import datetime
from sqlalchemy.orm import Session
from database import SessionLocal
from models import Conference

def seed_conferences():
    db = SessionLocal()
    
    # Check if we already have conferences
    if db.query(Conference).count() > 0:
        print("Conferences already exist. Skipping seed.")
        db.close()
        return

    # Upcoming conference
    upcoming = Conference(
        title="Entrepreneurship Paradigm Shift Towards Food Security in Africa",
        description="Join us for a transformative 2-day conference exploring innovative entrepreneurship models designed to tackle food security challenges across the African continent. Featuring keynote speakers from leading agricultural tech companies and policymakers.",
        start_date=datetime.datetime.now() + datetime.timedelta(days=12, hours=5, minutes=30),
        display_date="October 12-14, 2026",
        location="IUEA Main Auditorium & Virtual",
        status="OPEN",
        year="2026",
        external_url="https://conference.iuea.ac.ug"
    )
    
    # Another upcoming
    upcoming_2 = Conference(
        title="Future of AI in African Higher Education",
        description="A symposium on integrating artificial intelligence into university curricula, ethical considerations, and preparing students for the AI-driven workforce.",
        start_date=datetime.datetime.now() + datetime.timedelta(days=60),
        display_date="December 5-6, 2026",
        location="Tech Park, IUEA",
        status="OPEN",
        year="2026",
        external_url="https://ai.iuea.ac.ug"
    )
    
    # Past conference 1
    past_1 = Conference(
        title="Sustainable Energy Solutions for Emerging Markets",
        description="Experts gathered to discuss renewable energy implementation, financing off-grid solutions, and the role of academia in driving sustainable tech.",
        start_date=datetime.datetime(2025, 5, 10, 9, 0),
        display_date="May 10-12, 2025",
        location="IUEA Main Campus",
        status="ARCHIVED",
        year="2025",
        external_url="https://energy.iuea.ac.ug"
    )
    
    # Past conference 2
    past_2 = Conference(
        title="1st International E-Learning Conference",
        description="The inaugural conference focusing on digital pedagogy, remote assessment strategies, and bridging the digital divide in East African education.",
        start_date=datetime.datetime(2024, 11, 20, 9, 0),
        display_date="November 20-21, 2024",
        location="Virtual",
        status="ARCHIVED",
        year="2024",
        external_url="https://elearning.iuea.ac.ug"
    )

    db.add(upcoming)
    db.add(upcoming_2)
    db.add(past_1)
    db.add(past_2)
    db.commit()
    print("Test conferences seeded successfully.")
    db.close()

if __name__ == "__main__":
    seed_conferences()
