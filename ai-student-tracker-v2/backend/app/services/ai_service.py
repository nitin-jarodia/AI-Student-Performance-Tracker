# services/ai_service.py - Phase 7: AI Report Generation
# Uses OpenAI GPT if a *valid* key is configured, otherwise deterministic templates.

import logging
import os
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger(__name__)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_TIMEOUT_SECONDS = 30

# Heuristic placeholder detection — many users leave values like
# ``sk-your-key-here`` / ``sk-xxxx`` / ``sk-example`` in their .env which pass
# a naive ``startswith("sk-")`` check but then fail at the OpenAI API layer,
# leaking the raw error up to the UI. We treat anything that looks fake as
# "unconfigured" and fall straight through to the deterministic template.
_PLACEHOLDER_MARKERS = (
    "your-", "your_", "xxxx", "****", "here",
    "placeholder", "changeme", "change-me", "example",
)


def _openai_key_looks_valid(key: str | None) -> bool:
    if not key or not isinstance(key, str):
        return False
    k = key.strip()
    if not k.startswith("sk-") or len(k) < 20:
        return False
    low = k.lower()
    return not any(marker in low for marker in _PLACEHOLDER_MARKERS)


def generate_student_report(student_name: str, scores: list, subjects: list, avg: float = None) -> str:
    """
    Generate a personalized student performance report.

    Uses OpenAI GPT when a valid key is configured; otherwise falls back to a
    deterministic template so the endpoint always returns a useful payload.
    """
    if avg is None:
        avg = sum(scores) / len(scores) if scores else 0

    if _openai_key_looks_valid(OPENAI_API_KEY):
        try:
            report = _generate_openai_report(student_name, scores, subjects, avg)
            if report:
                return report
        except Exception as exc:
            # Never leak OpenAI errors to callers — log and fall through.
            log.warning("openai_report_fallback err=%s", exc)

    return _generate_template_report(student_name, scores, subjects, avg)


def _generate_openai_report(student_name: str, scores: list, subjects: list, avg: float) -> str:
    """Generate report using OpenAI GPT with a hard timeout."""
    from openai import OpenAI

    client = OpenAI(api_key=OPENAI_API_KEY, timeout=OPENAI_TIMEOUT_SECONDS)

    subject_scores = "\n".join([
        f"  • {subj}: {score:.1f}%"
        for subj, score in zip(subjects, scores)
    ]) if subjects and scores else "  • No subject data available"

    prompt = f"""Generate a professional student performance report for {student_name}.

Performance Data:
{subject_scores}
Overall Average: {avg:.1f}%

Write a detailed report with these sections:
1. Executive Summary (2-3 sentences)
2. Subject-wise Analysis (mention each subject)
3. Strengths (what the student excels at)
4. Areas for Improvement (be specific and constructive)
5. Personalized Recommendations (3-4 actionable steps)
6. Motivational Message (encouraging closing)

Keep it professional, specific, and encouraging. Around 300 words."""

    response = client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=600,
        temperature=0.7,
        timeout=OPENAI_TIMEOUT_SECONDS,
    )
    return response.choices[0].message.content


def _generate_template_report(student_name: str, scores: list, subjects: list, avg: float) -> str:
    """Generate professional template-based report"""
    from app.ml.predict import get_grade

    grade     = get_grade(avg)
    date      = datetime.now().strftime("%B %d, %Y")
    total     = len(scores)

    # Analyze performance
    if avg >= 85:
        performance_level = "Outstanding"
        summary = f"{student_name} has demonstrated exceptional academic performance this term."
        strengths = "Consistently high scores across all subjects, strong work ethic, and excellent understanding of core concepts."
        improvement = "Consider exploring advanced topics and participating in academic competitions to further challenge your abilities."
        motivation = f"Excellent work, {student_name}! Your dedication and hard work are truly commendable. Keep aiming higher!"
    elif avg >= 70:
        performance_level = "Good"
        summary = f"{student_name} has shown good academic progress with consistent effort across subjects."
        strengths = "Solid understanding of fundamental concepts and regular class participation."
        improvement = "Focus on strengthening weaker areas and practice more challenging problems to elevate performance."
        motivation = f"Great job, {student_name}! You're on the right track. A little more effort will take you to the top!"
    elif avg >= 55:
        performance_level = "Average"
        summary = f"{student_name} is showing average performance and has significant potential for improvement."
        strengths = "Shows understanding of basic concepts and willingness to learn."
        improvement = "Regular revision, increased practice, and seeking help in challenging topics will boost performance significantly."
        motivation = f"Keep going, {student_name}! Every effort you make brings you closer to your goals. Believe in yourself!"
    else:
        performance_level = "Needs Improvement"
        summary = f"{student_name} requires additional support and focused intervention to improve academic performance."
        strengths = "Shows potential for growth with the right guidance and support."
        improvement = "Immediate focus needed on foundational concepts. Daily practice, tutoring sessions, and regular teacher consultations are strongly recommended."
        motivation = f"Don't give up, {student_name}! Every expert was once a beginner. With determination and support, you can achieve great things!"

    # Subject details
    subject_details = ""
    if subjects and scores:
        subject_details = "\n📚 SUBJECT-WISE PERFORMANCE:\n"
        subject_details += "─" * 40 + "\n"
        for subj, score in zip(subjects, scores):
            grade_s    = get_grade(score)
            status     = "✅" if score >= 60 else "⚠️" if score >= 40 else "❌"
            bar_filled = int(score / 10)
            bar        = "█" * bar_filled + "░" * (10 - bar_filled)
            subject_details += f"  {status} {subj:<20} [{bar}] {score:.1f}% ({grade_s})\n"

    report = f"""
╔══════════════════════════════════════════════════════════╗
║         AI STUDENT PERFORMANCE TRACKER                  ║
║              ACADEMIC PERFORMANCE REPORT                ║
╚══════════════════════════════════════════════════════════╝

📋 STUDENT INFORMATION:
─────────────────────────────────────────
  Student Name  : {student_name}
  Report Date   : {date}
  Total Exams   : {total}
  Overall Grade : {grade}
  Performance   : {performance_level}

📊 OVERALL PERFORMANCE:
─────────────────────────────────────────
  Average Score : {avg:.1f}%
  Grade         : {grade}
  
  Score Breakdown:
  [{'█' * int(avg/10)}{'░' * (10 - int(avg/10))}] {avg:.1f}%
  
  0%     25%    50%    75%   100%
  Poor   Below  Avg    Good  Excel
{subject_details}
📝 EXECUTIVE SUMMARY:
─────────────────────────────────────────
  {summary}

💪 IDENTIFIED STRENGTHS:
─────────────────────────────────────────
  {strengths}

🎯 AREAS FOR IMPROVEMENT:
─────────────────────────────────────────
  {improvement}

💡 PERSONALIZED RECOMMENDATIONS:
─────────────────────────────────────────
  1. Set aside 30-45 minutes daily for focused revision
  2. Practice previous exam papers to build confidence
  3. Form study groups with high-performing peers
  4. Seek teacher help immediately when stuck on topics
  5. Track weekly progress to stay motivated

🌟 MOTIVATIONAL MESSAGE:
─────────────────────────────────────────
  {motivation}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Generated by AI Student Performance Tracker
  Powered by Machine Learning & AI Technology
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    """.strip()

    return report


def generate_study_plan(student_name: str, weak_subjects: list, avg_score: float) -> str:
    """Generate personalized 4-week study plan"""

    weeks = []
    for i, subject in enumerate(weak_subjects[:3]):  # Focus on top 3 weak subjects
        weeks.append(f"""
  Week {i+1}: {subject}
  ─────────────────
  • Daily: 45-minute focused practice session
  • Monday: Review class notes and textbook
  • Wednesday: Solve 10 practice problems
  • Friday: Take mini-test to assess progress
  • Weekend: Revise weak areas identified""")

    plan = f"""
📅 PERSONALIZED 4-WEEK STUDY PLAN
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Student : {student_name}
Focus   : {', '.join(weak_subjects) if weak_subjects else 'All subjects'}
Current Avg: {avg_score:.1f}%
Target Avg : {min(avg_score + 15, 100):.1f}%

{''.join(weeks) if weeks else '  Focus on all subjects equally'}

  Week 4: Revision & Assessment
  ─────────────────────────────
  • Comprehensive revision of all topics
  • Full mock test under exam conditions
  • Review mistakes and weak areas
  • Prepare for upcoming examinations

📌 DAILY ROUTINE SUGGESTION:
  6:00 AM  - Morning revision (30 mins)
  After school - Homework & practice (1 hr)
  Evening  - Weak subject focus (45 mins)
  Night    - Review & prepare next day

🏆 SUCCESS TIPS:
  ✓ Consistency beats intensity — study daily
  ✓ Teach concepts to friends to reinforce learning
  ✓ Take short breaks every 45 minutes
  ✓ Get 8 hours of sleep for better retention
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    """.strip()
    return plan


def generate_parent_notification(student_name: str, risk_level: str, avg_score: float) -> str:
    """Generate parent notification message"""

    if risk_level == "HIGH":
        message = f"""
Dear Parent/Guardian,

This is an important notification regarding {student_name}'s academic performance.

We have identified that {student_name} is currently at HIGH RISK with an average score of {avg_score:.1f}%.

IMMEDIATE ACTION REQUIRED:
• Please schedule a parent-teacher meeting this week
• Ensure daily homework completion is monitored
• Consider arranging additional tutoring support

We are here to support {student_name}'s success together.

Best regards,
AI Student Performance Tracker
        """.strip()
    elif risk_level == "MEDIUM":
        message = f"""
Dear Parent/Guardian,

This is a performance update for {student_name}.

{student_name} requires additional support with a current average of {avg_score:.1f}%.

RECOMMENDED ACTIONS:
• Review homework and class assignments regularly
• Encourage daily study habits at home
• Schedule a meeting with teachers if needed

Thank you for your continued support.

Best regards,
AI Student Performance Tracker
        """.strip()
    else:
        message = f"""
Dear Parent/Guardian,

We are pleased to share a positive update about {student_name}!

{student_name} is performing well with an average score of {avg_score:.1f}%.

Keep encouraging and supporting their academic journey!

Best regards,
AI Student Performance Tracker
        """.strip()

    return message
