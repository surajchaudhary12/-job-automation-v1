"""
Suraj Singh — Backend Software Engineer Resume
Run: python resume_v3.py
Output: Suraj_Singh_Final_Resume.pdf

Requirements:
    pip install reportlab
"""

from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib import colors
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_LEFT, TA_CENTER
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, HRFlowable,
    Table, TableStyle, KeepTogether
)

# ── Palette ────────────────────────────────────────────────────────────────────
INK      = colors.HexColor("#111827")
BLUE     = colors.HexColor("#1D4ED8")
SUBTEXT  = colors.HexColor("#4B5563")
MUTED    = colors.HexColor("#9CA3AF")
GREEN    = colors.HexColor("#065F46")
RULE_CLR = colors.HexColor("#E5E7EB")

# ── Document ───────────────────────────────────────────────────────────────────
doc = SimpleDocTemplate(
    "Suraj_Singh_Final_Resume.pdf",
    pagesize=A4,
    leftMargin=15*mm, rightMargin=15*mm,
    topMargin=12*mm,  bottomMargin=12*mm,
)

PW = A4[0] - 30*mm   # usable page width

# ── Style factory ──────────────────────────────────────────────────────────────
def S(name, size=9, color=INK, font="Helvetica", align=TA_LEFT,
      spaceBefore=0, spaceAfter=0, leading=None, indent=0, firstIndent=0):
    return ParagraphStyle(
        name,
        fontSize=size,
        textColor=color,
        fontName=font,
        alignment=align,
        spaceBefore=spaceBefore,
        spaceAfter=spaceAfter,
        leading=leading or (size * 1.45),
        leftIndent=indent,
        firstLineIndent=firstIndent,
    )

sNAME = S("NAME", 22, INK,     "Helvetica-Bold",  TA_CENTER, spaceAfter=1)
sTAG  = S("TAG",   9, BLUE,    "Helvetica-Bold",  TA_CENTER, spaceAfter=2)
sCON  = S("CON",   8, SUBTEXT, "Helvetica",       TA_CENTER, spaceAfter=0)
sSEC  = S("SEC",   8, BLUE,    "Helvetica-Bold",  spaceBefore=7, spaceAfter=1)
sROLE = S("ROLE",  9, INK,     "Helvetica-Bold",  spaceAfter=0)
sIMP  = S("IMP",   8, GREEN,   "Helvetica-Bold",  spaceAfter=3)
sBUL  = S("BUL",   8.2, SUBTEXT, "Helvetica",     spaceAfter=1.5, leading=12,
          indent=9, firstIndent=-9)
sNOR  = S("NOR",   8.2, SUBTEXT, "Helvetica",     spaceAfter=2, leading=12)
sSKLB = S("SKLB",  8.2, INK,   "Helvetica-Bold",  spaceAfter=1.5, leading=12)
sSKL  = S("SKL",   8.2, SUBTEXT, "Helvetica",     spaceAfter=1.5, leading=12)

# ── Helpers ────────────────────────────────────────────────────────────────────
def rule(thick=0.6, color=RULE_CLR, before=2, after=4):
    return HRFlowable(width="100%", thickness=thick, color=color,
                      spaceBefore=before, spaceAfter=after)

def section_header(title):
    return KeepTogether([
        Paragraph(title, sSEC),
        rule(thick=0.8, color=BLUE, before=1, after=3),
    ])

def bul(text):
    return Paragraph(f"\u2022\u2002{text}", sBUL)

def role_row(left_bold, left_light, right_text):
    left_para  = Paragraph(
        f"<b>{left_bold}</b>  "
        f"<font color='#6B7280' size='8'>{left_light}</font>",
        sROLE
    )
    right_para = Paragraph(
        f"<font color='#9CA3AF' size='7.5'>{right_text}</font>",
        ParagraphStyle("R", fontSize=7.5, textColor=MUTED,
                       fontName="Helvetica", alignment=2, leading=11)
    )
    t = Table([[left_para, right_para]],
              colWidths=[PW * 0.72, PW * 0.28])
    t.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",   (0,0), (-1,-1), 0),
        ("RIGHTPADDING",  (0,0), (-1,-1), 0),
        ("TOPPADDING",    (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 1),
    ]))
    return t

def skills_row(label, value):
    lp = Paragraph(label, sSKLB)
    vp = Paragraph(value, sSKL)
    t = Table([[lp, vp]], colWidths=[38*mm, PW - 38*mm])
    t.setStyle(TableStyle([
        ("VALIGN",        (0,0), (-1,-1), "TOP"),
        ("LEFTPADDING",   (0,0), (-1,-1), 0),
        ("RIGHTPADDING",  (0,0), (-1,-1), 0),
        ("TOPPADDING",    (0,0), (-1,-1), 0),
        ("BOTTOMPADDING", (0,0), (-1,-1), 1),
    ]))
    return t

# ══════════════════════════════════════════════════════════════════════════════
# STORY
# ══════════════════════════════════════════════════════════════════════════════
story = []

# ── Header ─────────────────────────────────────────────────────────────────────
story.append(Paragraph("SURAJ SINGH", sNAME))
story.append(Paragraph("Backend Software Engineer  \u00b7  Java  \u00b7  Node.js  \u00b7  Distributed Systems", sTAG))
story.append(Paragraph(
    "+91 7568910627  \u00b7  surajsingh3454@gmail.com  \u00b7  Bengaluru, India  \u00b7  LinkedIn  \u00b7  GitHub",
    sCON
))
story.append(rule(thick=1.4, color=BLUE, before=5, after=6))

# ── Summary ────────────────────────────────────────────────────────────────────
story.append(section_header("SUMMARY"))
story.append(Paragraph(
    "NIT Kurukshetra engineer with hands-on platform and backend development experience at "
    "<b>Meesho</b> (100M+ user scale). Built and shipped production code driving "
    "<b>+2.4% cumulative NMV uplift</b> across two product cycles. Awarded <b>Best Pod (3\u00d7 "
    "consecutive)</b> and <b>Best Analyst \u2013 AHM Tech</b>. Strong in Java, distributed systems, "
    "caching, and API design. Codeforces Specialist (1634+) with 800+ problems solved.",
    sNOR
))

# ── Education ─────────────────────────────────────────────────────────────────
story.append(section_header("EDUCATION"))
story.append(role_row(
    "B.Tech \u2013 Electronics and Communication Engineering",
    "National Institute of Technology, Kurukshetra  \u00b7  Haryana",
    "2020 \u2013 2024"
))
story.append(Spacer(1, 3))

# ── Experience ────────────────────────────────────────────────────────────────
story.append(section_header("WORK EXPERIENCE"))
story.append(role_row(
    "Analyst 2 \u2013 Android Platform & Growth",
    "Meesho  \u00b7  Bengaluru, India",
    "Dec 2024 \u2013 Present"
))
story.append(Paragraph(
    "Embedded in platform engineering pod \u2014 designed, developed, and shipped production code "
    "for Android Platform performance and growth features at 100M+ user scale.",
    sNOR
))
story.append(Paragraph(
    "\u2b50  Cumulative impact: <b>+2.4% NMV uplift</b>  \u00b7  <b>+1.3% retention</b>  \u00b7  "
    "<b>+0.15% incremental revenue</b>",
    sIMP
))
story.append(bul(
    "<b>Image optimisation:</b> Shipped high-quality image pre-loading on PDP \u2014 delivered "
    "<b>+0.9% NMV uplift</b>, the largest single-feature impact in the pod that cycle."
))
story.append(bul(
    "<b>App performance overhaul:</b> Led platform-level latency and memory optimisation on "
    "low-end devices \u2014 delivered <b>+1.5% NMV uplift</b> in back-to-back cycle."
))
story.append(bul(
    "<b>Instrumentation systems:</b> Built production monitoring pipelines for API latency, "
    "memory, and network metrics, significantly reducing P0 incident root-cause time."
))
story.append(bul(
    "Eliminated redundant backend calls via prefetched response reuse, cutting unnecessary "
    "client-server round-trips and backend load."
))
story.append(bul(
    "Collaborated on A/B experimentation infrastructure enabling data-driven optimisation "
    "decisions across engineering squads."
))
story.append(Paragraph(
    "\U0001f3c6  <b>Best Pod Award \u2014 3 consecutive cycles</b>  \u00b7  <b>Best Analyst \u2013 AHM Tech</b>",
    sIMP
))
story.append(Spacer(1, 4))

story.append(role_row(
    "Member of Technical Staff",
    "GeeksforGeeks  \u00b7  Noida, India",
    "Oct 2024 \u2013 Dec 2024"
))
story.append(bul(
    "Reviewed and optimised <b>50+ algorithmic solutions</b> for time/space complexity, "
    "scalability, and production-grade code quality."
))
story.append(bul(
    "Designed competitive programming problems using advanced data structures (segment trees, "
    "tries, graphs) and optimisation techniques."
))

# ── Projects ──────────────────────────────────────────────────────────────────
story.append(section_header("PROJECTS"))
story.append(role_row("Payment Service  (In Progress)", "Java \u00b7 MySQL \u00b7 REST APIs \u00b7 Async Processing", ""))
story.append(bul(
    "Designing distributed payment backend with <b>idempotent APIs</b>, retry-with-backoff, "
    "transaction state machines, saga pattern, and dead-letter queues for fault tolerance."
))
story.append(bul(
    "Implementing write-through caching and async queue-based flows to decouple payment "
    "initiation from settlement for reliability at scale."
))
story.append(Spacer(1, 3))
story.append(role_row("Football Statistics Platform", "Node.js \u00b7 TypeScript \u00b7 SQL \u00b7 Redis", ""))
story.append(bul(
    "Built RESTful backend services for live match and player statistics; Redis caching + "
    "exponential-backoff retry achieved 99.5%+ uptime and sub-100ms p95 latency."
))

# ── Skills ────────────────────────────────────────────────────────────────────
story.append(section_header("TECHNICAL SKILLS"))
story.append(skills_row("Languages",       "Java, C++, JavaScript, TypeScript, Python, SQL"))
story.append(skills_row("Backend",         "Node.js, Express.js, NestJS, REST APIs, Microservices"))
story.append(skills_row("Databases",       "MySQL, MongoDB \u2014 indexing, query optimisation, schema design"))
story.append(skills_row("Specialisations", "Distributed Systems, Caching, Async Processing, Idempotent APIs, Retry / Circuit Breaker patterns"))
story.append(skills_row("Core CS",         "DSA, OOP, OS, Computer Networks, Scalability"))
story.append(skills_row("Tools",           "Git, Linux, Postman, IntelliJ IDEA"))

# ── Achievements ──────────────────────────────────────────────────────────────
story.append(section_header("ACHIEVEMENTS"))
story.append(bul("<b>Codeforces Specialist</b> \u2014 Rating <b>1634+</b>   \u00b7   <b>CodeChef</b> \u2014 Rating <b>1800+</b>"))
story.append(bul("Solved <b>800+ problems</b> across LeetCode, Codeforces, CodeChef"))
story.append(bul("<b>All-India Rank &lt; 100</b> (twice) in CodeChef rated contests"))

# ── Build ──────────────────────────────────────────────────────────────────────
doc.build(story)
print("Resume generated: Suraj_Singh_Final_Resume.pdf")
