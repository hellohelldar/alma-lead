"""Email content for the two notifications triggered on lead submission."""

from app.services.email.base import EmailMessage


def prospect_confirmation(*, first_name: str, to: str) -> EmailMessage:
    subject = "We received your application — Alma"
    text = (
        f"Hi {first_name},\n\n"
        "Thanks for submitting your information to Alma. Our team has received "
        "your application and an attorney will review it and reach out to you "
        "shortly.\n\n"
        "Warm regards,\nThe Alma Team"
    )
    html = (
        f"<p>Hi {first_name},</p>"
        "<p>Thanks for submitting your information to <strong>Alma</strong>. "
        "Our team has received your application and an attorney will review it "
        "and reach out to you shortly.</p>"
        "<p>Warm regards,<br/>The Alma Team</p>"
    )
    return EmailMessage(to=to, subject=subject, html=html, text=text)


def attorney_notification(
    *, attorney_email: str, first_name: str, last_name: str, prospect_email: str
) -> EmailMessage:
    full = f"{first_name} {last_name}"
    subject = f"New lead: {full}"
    text = (
        f"A new lead has been submitted.\n\n"
        f"Name: {full}\n"
        f"Email: {prospect_email}\n\n"
        "Open the internal console to review the resume and mark the lead as "
        "reached out."
    )
    html = (
        "<p>A new lead has been submitted.</p>"
        f"<p><strong>Name:</strong> {full}<br/>"
        f"<strong>Email:</strong> {prospect_email}</p>"
        "<p>Open the internal console to review the resume and mark the lead "
        "as reached out.</p>"
    )
    return EmailMessage(to=attorney_email, subject=subject, html=html, text=text)
