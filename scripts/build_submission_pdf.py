from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output" / "pdf" / "BrandLens_Round2_Submission.pdf"
NAVY = colors.HexColor("#12304A")
TEAL = colors.HexColor("#087E79")
INK = colors.HexColor("#243447")
MUTED = colors.HexColor("#526477")
PALE = colors.HexColor("#EFF7F7")
LINE = colors.HexColor("#D7E1E8")

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="Kicker", parent=styles["Normal"], fontName="Helvetica-Bold",
    fontSize=8, leading=11, textColor=TEAL, spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="Hero", parent=styles["Title"], fontName="Helvetica-Bold",
    fontSize=32, leading=36, textColor=NAVY, alignment=TA_LEFT, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="DeckTitle", parent=styles["Heading1"], fontName="Helvetica-Bold",
    fontSize=20, leading=24, textColor=NAVY, spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="Section", parent=styles["Heading2"], fontName="Helvetica-Bold",
    fontSize=11, leading=14, textColor=TEAL, spaceBefore=7, spaceAfter=4,
))
styles.add(ParagraphStyle(
    name="BodyBL", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=8.5, leading=12, textColor=INK, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="SmallBL", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.2, leading=9.5, textColor=INK, spaceAfter=2,
))
styles.add(ParagraphStyle(
    name="CellHead", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=7.5, leading=9, textColor=colors.white,
))
styles.add(ParagraphStyle(
    name="Cell", parent=styles["BodyText"], fontName="Helvetica",
    fontSize=7.2, leading=9.2, textColor=INK,
))
styles.add(ParagraphStyle(
    name="Metric", parent=styles["BodyText"], fontName="Helvetica-Bold",
    fontSize=8, leading=10, textColor=NAVY,
))
styles.add(ParagraphStyle(
    name="CenterSmall", parent=styles["SmallBL"], alignment=TA_CENTER,
))


def p(text, style="BodyBL"):
    return Paragraph(text, styles[style])


def bullet(title, detail):
    return p(f"<b>{title}</b> {detail}", "BodyBL")


def grid(rows, widths, header=True):
    table = Table(rows, colWidths=widths, repeatRows=1 if header else 0, hAlign="LEFT")
    commands = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("GRID", (0, 0), (-1, -1), 0.35, LINE),
        ("ROWBACKGROUNDS", (0, 1 if header else 0), (-1, -1), [colors.white, colors.HexColor("#F7FAFC")]),
    ]
    if header:
        commands.extend([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
        ])
    table.setStyle(TableStyle(commands))
    return table


def header_footer(canvas, doc):
    canvas.saveState()
    width, height = letter
    canvas.setFillColor(NAVY)
    canvas.rect(0, height - 0.19 * inch, width, 0.19 * inch, fill=1, stroke=0)
    canvas.setStrokeColor(LINE)
    canvas.line(doc.leftMargin, 0.52 * inch, width - doc.rightMargin, 0.52 * inch)
    canvas.setFont("Helvetica", 7)
    canvas.setFillColor(MUTED)
    canvas.drawString(doc.leftMargin, 0.34 * inch, "BRANDLENS  |  ROUND 2 SUBMISSION  |  25 OCT 2026")
    canvas.drawRightString(width - doc.rightMargin, 0.34 * inch, str(doc.page))
    canvas.restoreState()


class SubmissionDoc(BaseDocTemplate):
    def __init__(self, filename):
        super().__init__(
            str(filename), pagesize=letter,
            leftMargin=0.62 * inch, rightMargin=0.62 * inch,
            topMargin=0.52 * inch, bottomMargin=0.72 * inch,
            title="BrandLens Round 2 Project Submission",
            author="BrandLens Team",
        )
        frame = Frame(self.leftMargin, self.bottomMargin, self.width, self.height, id="main")
        self.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=header_footer)])


story = []

# Page 1: judge-facing overview and readiness.
story += [
    p("FUTURESTACK HACKATHON  |  ROUND 2 OF 3", "Kicker"),
    p("BrandLens", "Hero"),
    p("Pre-publication brand governance with rules first, cited AI second, and humans in control.", "DeckTitle"),
    p("SUBMISSION READINESS", "Section"),
    p("The code passes unit tests, lint, TypeScript, and a production webpack build. The hosted product is <b>not yet verified</b>: the configured Neon endpoint is a sample/unreachable host, so migrations, seed data, demo login, and the live review journey still need database-backed verification.", "BodyBL"),
    p("PROJECT LINKS", "Section"),
    p('<b>Working project:</b> Pending a verified Vercel deployment.  &nbsp; <b>Repository:</b> <link href="https://github.com/Utsav-83/BrandLens" color="#087E79">github.com/Utsav-83/BrandLens</link>', "BodyBL"),
    p('<b>Demo workspace:</b> Aurora Pay. One-click creator, manager, reviewer, and admin accounts are available when the seeded database and <font name="Courier">DEMO_MODE=true</font> are configured.', "BodyBL"),
    p("JUDGING READINESS SNAPSHOT", "Section"),
]
readiness = [
    [p("Criterion", "CellHead"), p("Current evidence", "CellHead"), p("Status", "CellHead")],
    [p("Core workflow (30)", "Cell"), p("Submission, analysis, finding decisions, review, approval, audit routes and smoke-test script are implemented; no successful live DB walkthrough yet.", "Cell"), p("Code ready; hosted proof pending", "Cell")],
    [p("Technical depth (25)", "Cell"), p("Rules + citation-validated LLM, BM25, Prisma/Postgres, server guards, DB rate limits and hash-chain audit. Production webpack build passes.", "Cell"), p("Strong; DB verification pending", "Cell")],
    [p("Round 1 progress (20)", "Cell"), p("Documented architecture and retrieval pivots, expanded workflow, source validation and audit integrity.", "Cell"), p("Documented", "Cell")],
    [p("Round 3 plan (15)", "Cell"), p("Three substantial product improvements and measurable outcomes are listed on page 4.", "Cell"), p("Ready", "Cell")],
    [p("Usability (10)", "Cell"), p("Seeded demo, role logins, sample draft, visible AI fallback, labels and keyboard-friendly controls are implemented; hosted usability still needs a pass.", "Cell"), p("Verify after deployment", "Cell")],
]
story += [grid(readiness, [1.14 * inch, 4.12 * inch, 1.42 * inch]), PageBreak()]

# Page 2: completed product features and workflow.
story += [p("Completed features", "DeckTitle"), p("BrandLens checks drafts against organization-approved sources and routes findings through a human-controlled review workflow.", "BodyBL")]
story += [
    bullet("Ingestion:", "Text, DOCX, PDF, TXT and Markdown; magic-byte checks and bounded uploads. Digital-text PDFs work; scanned image-only PDFs need OCR."),
    bullet("Rules:", "Glossary replacements, unsupported absolutes, numeric fact checks, tone/slang, readability and accessibility-related text checks run without an LLM."),
    bullet("Retrieval and AI:", "BM25 selects source passages. Provider-neutral LLM calls use environment configuration; citation quotes and proposed numbers are checked against retrieved sources. Failures produce visible rules-only results."),
    bullet("Human workflow:", "Creators accept, edit or reject findings and submit for review. Managers/reviewers request changes or approve. Server-side roles, ownership boundaries and separation of duties protect actions."),
    bullet("Audit and operations:", "PostgreSQL via Prisma 7, DB-backed rate limits, SHA-256 audit chain with Postgres transaction locks, integrity verification and bounded-batch audit reads. Audit views are manager/reviewer/admin only and omit payload text."),
    bullet("Judge onboarding:", "Seeded Aurora Pay sources, four demo roles, sample flawed copy, and explicit loading, empty, error and AI-unavailable states."),
    p("TECHNOLOGY AND IMPLEMENTATION", "Section"),
]
technology = [
    [p("Layer", "CellHead"), p("Implementation", "CellHead")],
    [p("Web", "Cell"), p("Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4; Node.js route handlers and server components.", "Cell")],
    [p("Data", "Cell"), p("PostgreSQL/Neon target, Prisma 7 custom prisma-client output, @prisma/adapter-pg runtime; DIRECT_URL for migrations.", "Cell")],
    [p("Identity", "Cell"), p("jose HS256 JWT in httpOnly sameSite=lax cookie, bcryptjs, server-side roles and ownership checks.", "Cell")],
    [p("Review", "Cell"), p("Deterministic TypeScript rules, BM25 retrieval, provider-neutral fetch LLM, 20-second timeout, JSON parsing, source quote validation and rules-only fallback.", "Cell")],
    [p("Documents", "Cell"), p("mammoth for DOCX, unpdf for PDF text streams, file signature checks and size limits; image-only OCR is not implemented.", "Cell")],
    [p("Quality", "Cell"), p("Vitest: 292 passed, 1 skipped. ESLint and TypeScript no-emit pass. Production webpack build passes. Postgres concurrency test requires a separate test database.", "Cell")],
]
story += [grid(technology, [1.03 * inch, 5.65 * inch]), PageBreak()]

# Page 3: security and release procedure.
story += [p("Security, reliability, and release status", "DeckTitle"), p("Security controls", "Section")]
story += [
    bullet("Authorization:", "Route handlers and server-rendered pages enforce identity and role checks; proxy.ts is only a convenience redirect. Creators can edit their own drafts; admins can edit any draft in their workspace. Managers and reviewers see only review-related submissions."),
    bullet("Review boundary:", "A creator cannot approve their own submission, including when the creator also has an admin role. Audit pages and APIs are limited to managers, reviewers and admins; event payloads are omitted from audit views."),
    bullet("Request safety:", "Zod validates API inputs. Mutating requests check Origin. JWTs use httpOnly, sameSite=lax cookies, secure in production. Production HSTS is configured; development-only unsafe-eval is excluded from production CSP."),
    bullet("Data handling:", "Draft text and secrets are not intentionally logged. The analysis route has a 60-second maximum duration. PostgreSQL rate limits work across serverless instances; demo login allows 30 attempts per IP per 10 minutes for shared event networks."),
    p("VERIFICATION RESULTS", "Section"),
]
verification = [
    [p("Check", "CellHead"), p("Result", "CellHead")],
    [p("Automated suite", "Cell"), p("292 passed, 1 skipped; the skipped concurrency integration test needs a dedicated test database.", "Cell")],
    [p("Lint and types", "Cell"), p("ESLint and TypeScript no-emit passed.", "Cell")],
    [p("Production build", "Cell"), p("Next.js 16 webpack production build passed. Turbopack encountered a worker-start restriction in this Windows execution sandbox.", "Cell")],
    [p("Database", "Cell"), p("Prisma migrate status failed against the configured sample Neon endpoint. No valid production or separate test database has been verified.", "Cell")],
    [p("Deployment", "Cell"), p("The current implementation and submission updates are pushed to main. Vercel deployment and public smoke test are still unverified.", "Cell")],
]
story += [grid(verification, [1.42 * inch, 5.26 * inch]), p("REMAINING RELEASE GATES", "Section")]
story += [
    p("1. Set valid pooled <font name='Courier'>DATABASE_URL</font> and direct <font name='Courier'>DIRECT_URL</font> for Production in Vercel; keep secrets out of Git and chat. 2. Set a separate <font name='Courier'>TEST_DATABASE_URL</font> for integration tests. 3. Apply migrations and seed the production demo workspace. 4. Redeploy and confirm the current Vercel build is ready. 5. Run the remote smoke test and two-user ownership check, then update the project link on page 1.", "BodyBL"),
    p("Never report the project as live until the public URL and core creator-to-reviewer workflow pass.", "Metric"),
    PageBreak(),
]

# Page 4: original-plan changes and meaningful roadmap.
story += [p("Plan changes and Round 3 improvements", "DeckTitle"), p("Changes from the original plan", "Section")]
story += [
    bullet("FastAPI + React to unified Next.js:", "Reduced cross-origin session and deployment complexity; routes, validation, server rendering and shared types now live in one TypeScript app."),
    bullet("pgvector to BM25:", "Prioritized deterministic exact-term retrieval for product names and governance terms, avoiding embedding latency in the core workflow."),
    bullet("Hard LLM dependency to rules-first fallback:", "Brand checks continue if the provider is absent, fails or times out; the UI explains that AI review is unavailable."),
    bullet("Basic audit rows to hash chain:", "Entries link cryptographically and use a PostgreSQL advisory transaction lock for workspace writes."),
    bullet("Visual/OCR review deferred:", "Round 2 focused on text governance and reliable document parsing; scanned/image-only documents are not analyzed."),
    p("THREE MAJOR ROUND 3 IMPROVEMENTS", "Section"),
]
roadmap = [
    [p("Improvement", "CellHead"), p("Product addition and success measure", "CellHead")],
    [p("1. Visual creative and accessibility governance", "Cell"), p("Accept image/design exports, extract text with OCR, inspect logo/color use and contrast, and anchor findings to image regions. Measure OCR and contrast accuracy against labelled creative assets.", "Cell")],
    [p("2. Governance intelligence across sources", "Cell"), p("Detect contradictory or superseded facts, alert on expiring claims, and surface recurring policy errors. Add source lineage and manager resolution actions; measure contradiction detection on a labelled source set.", "Cell")],
    [p("3. Private inference and measurable AI quality", "Cell"), p("Add local open-model inference through Ollama/vLLM and a versioned golden evaluation suite with precision, recall and citation-grounding metrics. Verify private mode makes zero outbound LLM calls.", "Cell")],
]
story += [grid(roadmap, [2.05 * inch, 4.63 * inch]), Spacer(1, 8), p("Judge quick-start after release gates pass", "Section")]
story += [p("1. Continue as Creator on /login. 2. Start a draft and choose Load Sample Flawed Content. 3. Save and analyze; inspect source-backed findings and any rules-only notice. 4. Accept/edit/reject fixes and submit for review. 5. Sign in as Reviewer, inspect the queue, request changes or approve, then open /audit and verify chain integrity.", "BodyBL")]

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
SubmissionDoc(OUTPUT).build(story)
print(OUTPUT)
