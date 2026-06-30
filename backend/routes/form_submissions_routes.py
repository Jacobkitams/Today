import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models, schemas
from database import get_db
from auth import get_current_user
from models import User

router = APIRouter()

COORDINATOR_ROLES = ["coordinator", "content_editor", "super_admin"]


def require_coordinator(current_user: User = Depends(get_current_user)):
    if current_user.role not in COORDINATOR_ROLES:
        raise HTTPException(status_code=403, detail="Coordinator access required")
    return current_user


def _submission_to_response(submission: models.FormSubmission, db: Session) -> schemas.FormSubmissionResponse:
    reviewer_name = None
    if submission.reviewed_by:
        reviewer = db.query(User).filter(User.id == submission.reviewed_by).first()
        if reviewer:
            reviewer_name = reviewer.name
    return schemas.FormSubmissionResponse(
        id=submission.id,
        form_type=submission.form_type,
        first_name=submission.first_name,
        last_name=submission.last_name,
        email=submission.email,
        phone=submission.phone,
        details=submission.details,
        amount=submission.amount,
        status=submission.status,
        notes=submission.notes,
        reviewed_by=submission.reviewed_by,
        reviewer_name=reviewer_name,
        created_at=submission.created_at,
    )


def _create_submission(
    db: Session,
    form_type: str,
    *,
    first_name: str,
    last_name: Optional[str] = None,
    email: str,
    phone: Optional[str] = None,
    details: Optional[str] = None,
    amount: Optional[float] = None,
) -> models.FormSubmission:
    if form_type not in schemas.FORM_SUBMISSION_TYPES:
        raise HTTPException(status_code=400, detail="Invalid form type")
    submission = models.FormSubmission(
        form_type=form_type,
        first_name=first_name.strip(),
        last_name=(last_name or "").strip() or None,
        email=email.strip(),
        phone=(phone or "").strip() or None,
        details=(details or "").strip() or None,
        amount=amount,
        status="pending",
    )
    db.add(submission)
    db.commit()
    db.refresh(submission)
    return submission


@router.post("/innovation-join", response_model=schemas.FormSubmissionResponse)
def submit_innovation_join(item: schemas.FormSubmissionCreate, db: Session = Depends(get_db)):
    submission = _create_submission(
        db,
        "innovation_join",
        first_name=item.first_name,
        last_name=item.last_name,
        email=item.email,
        phone=item.phone,
        details=item.details,
    )
    return _submission_to_response(submission, db)


@router.post("/alumni-join", response_model=schemas.FormSubmissionResponse)
def submit_alumni_join(item: schemas.FormSubmissionCreate, db: Session = Depends(get_db)):
    submission = _create_submission(
        db,
        "alumni_join",
        first_name=item.first_name,
        last_name=item.last_name,
        email=item.email,
        phone=item.phone,
        details=item.details,
    )
    return _submission_to_response(submission, db)


@router.post("/community-join", response_model=schemas.FormSubmissionResponse)
def submit_community_join(item: schemas.FormSubmissionCreate, db: Session = Depends(get_db)):
    submission = _create_submission(
        db,
        "community_join",
        first_name=item.first_name,
        last_name=item.last_name,
        email=item.email,
        phone=item.phone,
        details=item.details,
    )
    return _submission_to_response(submission, db)


@router.post("/research-join", response_model=schemas.FormSubmissionResponse)
def submit_research_join(item: schemas.FormSubmissionCreate, db: Session = Depends(get_db)):
    submission = _create_submission(
        db,
        "research_join",
        first_name=item.first_name,
        last_name=item.last_name,
        email=item.email,
        phone=item.phone,
        details=item.details,
    )
    return _submission_to_response(submission, db)


@router.post("/donation-pledge", response_model=schemas.FormSubmissionResponse)
def submit_donation_pledge(item: schemas.DonationPledgeCreate, db: Session = Depends(get_db)):
    first_name = (item.first_name or item.name or "").strip()
    if not first_name:
        raise HTTPException(status_code=400, detail="Name is required")
    if item.amount is None or item.amount <= 0:
        raise HTTPException(status_code=400, detail="A valid donation amount is required")
    email = (item.email or "noreply@pledge.local").strip()
    details = item.details or item.message
    submission = _create_submission(
        db,
        "donation_pledge",
        first_name=first_name,
        last_name=item.last_name,
        email=email,
        phone=item.phone,
        details=details,
        amount=item.amount,
    )
    return _submission_to_response(submission, db)


@router.get("/stats", response_model=schemas.FormSubmissionStats)
def get_submission_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    submissions = db.query(models.FormSubmission).all()

    by_form_type: dict[str, dict[str, int]] = {
        ft: {"pending": 0, "approved": 0, "rejected": 0, "reviewed": 0}
        for ft in schemas.FORM_SUBMISSION_TYPES
    }
    approved_today = 0
    rejected_today = 0

    for submission in submissions:
        bucket = by_form_type.setdefault(
            submission.form_type,
            {"pending": 0, "approved": 0, "rejected": 0, "reviewed": 0},
        )
        if submission.status in bucket:
            bucket[submission.status] += 1
        created = submission.created_at
        if created is not None:
            if created.tzinfo is None:
                created = created.replace(tzinfo=timezone.utc)
            if created >= today_start:
                if submission.status == "approved":
                    approved_today += 1
                elif submission.status == "rejected":
                    rejected_today += 1

    total_pending = sum(bucket["pending"] for bucket in by_form_type.values())
    typed_buckets = {
        form_type: schemas.FormSubmissionTypeStats(**counts)
        for form_type, counts in by_form_type.items()
    }
    return schemas.FormSubmissionStats(
        pending=total_pending,
        total_pending=total_pending,
        approved_today=approved_today,
        rejected_today=rejected_today,
        by_form_type=typed_buckets,
    )


@router.get("/submissions", response_model=List[schemas.FormSubmissionResponse])
def list_submissions(
    form_type: Optional[str] = Query(None, description="Filter by form type"),
    status: Optional[str] = Query(None, description="Filter by status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    query = db.query(models.FormSubmission)
    if form_type:
        if form_type not in schemas.FORM_SUBMISSION_TYPES:
            raise HTTPException(status_code=400, detail="Invalid form type")
        query = query.filter(models.FormSubmission.form_type == form_type)
    if status:
        if status not in schemas.FORM_SUBMISSION_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        query = query.filter(models.FormSubmission.status == status)
    submissions = query.order_by(models.FormSubmission.created_at.desc()).all()
    return [_submission_to_response(s, db) for s in submissions]


@router.get("/submissions/{submission_id}", response_model=schemas.FormSubmissionResponse)
def get_submission(
    submission_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    submission = db.query(models.FormSubmission).filter(models.FormSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    return _submission_to_response(submission, db)


@router.patch("/submissions/{submission_id}", response_model=schemas.FormSubmissionResponse)
def update_submission(
    submission_id: int,
    data: schemas.FormSubmissionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_coordinator),
):
    submission = db.query(models.FormSubmission).filter(models.FormSubmission.id == submission_id).first()
    if not submission:
        raise HTTPException(status_code=404, detail="Submission not found")
    if data.status is not None:
        if data.status not in schemas.FORM_SUBMISSION_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid status")
        submission.status = data.status
        submission.reviewed_by = current_user.id
    if data.notes is not None:
        submission.notes = data.notes.strip() or None
    db.commit()
    db.refresh(submission)
    return _submission_to_response(submission, db)
